/**
 * Puppeteer 渲染服务
 * 浏览器管理、截图核心逻辑
 */

import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer-core';
import type { Browser, Page } from 'puppeteer-core';
import { pluginState } from '../core/state';
import { getDefaultBrowserPaths } from '../config';
import type {
    ScreenshotOptions,
    RenderResult,
    BrowserStatus,
    BrowserConfig,
    Encoding,
    MultiPage,
} from '../types';

/** 浏览器实例 */
let browser: Browser | null = null;

/** 保活页面（远程模式下防止连接断开） */
let keepAlivePage: Page | null = null;

/** 当前打开的页面数 */
let currentPageCount = 0;

/** 页面信号量（用于限制并发） */
let pageQueue: Array<() => void> = [];

/** 重连相关状态 */
let isReconnecting = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_BASE = 1000; // 基础重连延迟 1 秒
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

/** 统计信息 */
const stats = {
    totalRenders: 0,
    failedRenders: 0,
    startTime: 0,
};

/**
 * 清理重连状态
 */
function clearReconnectState(): void {
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
    isReconnecting = false;
    reconnectAttempts = 0;
}

/**
 * 尝试重连远程浏览器
 */
async function attemptReconnect(): Promise<boolean> {
    const config = pluginState.config.browser;

    // 只有远程模式才需要重连
    if (!config.browserWSEndpoint) {
        return false;
    }

    if (isReconnecting) {
        pluginState.logDebug('已在重连中，跳过');
        return false;
    }

    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        pluginState.log('error', `远程浏览器重连失败，已达到最大重试次数 (${MAX_RECONNECT_ATTEMPTS})`);
        clearReconnectState();
        return false;
    }

    isReconnecting = true;
    reconnectAttempts++;

    // 指数退避延迟
    const delay = RECONNECT_DELAY_BASE * Math.pow(2, reconnectAttempts - 1);
    pluginState.log('info', `将在 ${delay}ms 后尝试第 ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} 次重连...`);

    await new Promise(resolve => setTimeout(resolve, delay));

    try {
        pluginState.log('info', `正在重连远程浏览器: ${config.browserWSEndpoint}`);

        browser = await puppeteer.connect({
            browserWSEndpoint: config.browserWSEndpoint,
            defaultViewport: {
                width: config.defaultViewportWidth || 1280,
                height: config.defaultViewportHeight || 800,
                deviceScaleFactor: config.deviceScaleFactor || 2,
            },
        });

        // 重新注册断开事件监听
        setupDisconnectHandler();

        // 创建保活页面
        try {
            keepAlivePage = await browser.newPage();
            await keepAlivePage.goto('about:blank');
            pluginState.logDebug('已创建保活页面');
        } catch (error) {
            pluginState.logDebug('创建保活页面失败:', error);
        }

        stats.startTime = Date.now();
        pluginState.log('info', '远程浏览器重连成功');
        clearReconnectState();
        return true;
    } catch (error) {
        pluginState.log('warn', `重连失败 (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}):`, error);
        browser = null;
        isReconnecting = false;

        // 继续尝试重连
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            return attemptReconnect();
        } else {
            clearReconnectState();
            return false;
        }
    }
}

/**
 * 设置浏览器断开连接处理器
 */
function setupDisconnectHandler(): void {
    if (!browser) return;

    const config = pluginState.config.browser;
    const isRemoteMode = !!config.browserWSEndpoint;

    browser.on('disconnected', () => {
        if (isRemoteMode) {
            pluginState.log('warn', '远程浏览器连接已断开，准备自动重连...');
        } else {
            pluginState.log('warn', '浏览器已断开连接');
        }

        browser = null;
        keepAlivePage = null;
        currentPageCount = 0;
        pageQueue = [];

        // 远程模式下自动重连
        if (isRemoteMode && !isReconnecting) {
            attemptReconnect();
        }
    });
}

/**
 * 查找可用的浏览器路径
 */
function findBrowserPath(configPath?: string, suppressLog = false): string | undefined {
    // 优先使用配置的路径
    if (configPath && fs.existsSync(configPath)) {
        return configPath;
    }

    // 自动检测系统浏览器
    const defaultPaths = getDefaultBrowserPaths();
    for (const browserPath of defaultPaths) {
        if (browserPath && fs.existsSync(browserPath)) {
            if (!suppressLog) {
                pluginState.log('info', `自动检测到浏览器: ${browserPath}`);
            }
            return browserPath;
        }
    }

    return undefined;
}

/**
 * 获取浏览器启动参数
 */
function getBrowserArgs(config: BrowserConfig): string[] {
    const defaultArgs = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-zygote',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-sync',
        '--disable-translate',
        '--disable-notifications',
        '--disable-crash-reporter',
        // Docker 环境优化参数
        '--single-process', // 某些受限环境需要
        '--disable-software-rasterizer',
        '--disable-features=VizDisplayCompositor',
        '--font-render-hinting=none', // 字体渲染优化
        `--window-size=${config.defaultViewportWidth || 1280},${config.defaultViewportHeight || 800}`,
    ];

    return config.args?.length ? config.args : defaultArgs;
}

/**
 * 初始化浏览器
 */
export async function initBrowser(): Promise<boolean> {
    pluginState.logDebug('initBrowser() 被调用');

    if (browser) {
        pluginState.log('warn', '浏览器已初始化，跳过');
        return true;
    }

    const config = pluginState.config.browser;
    pluginState.logDebug('浏览器配置:', JSON.stringify(config, null, 2));

    try {
        // 优先使用远程浏览器连接
        if (config.browserWSEndpoint) {
            pluginState.log('info', `正在连接远程浏览器: ${config.browserWSEndpoint}`);

            browser = await puppeteer.connect({
                browserWSEndpoint: config.browserWSEndpoint,
                defaultViewport: {
                    width: config.defaultViewportWidth || 1280,
                    height: config.defaultViewportHeight || 800,
                    deviceScaleFactor: config.deviceScaleFactor || 2,
                },
            });

            // 监听浏览器断开事件（带自动重连）
            setupDisconnectHandler();

            // 创建保活页面，防止所有页面关闭时连接断开
            try {
                keepAlivePage = await browser.newPage();
                await keepAlivePage.goto('about:blank');
                pluginState.logDebug('已创建保活页面');
            } catch (error) {
                pluginState.logDebug('创建保活页面失败:', error);
            }

            // 重置重连计数
            clearReconnectState();

            stats.startTime = Date.now();
            pluginState.log('info', '远程浏览器连接成功');
            pluginState.logDebug('浏览器版本:', await browser.version());
            return true;
        }

        // 本地浏览器启动
        const executablePath = findBrowserPath(config.executablePath);

        if (!executablePath) {
            pluginState.log('error', '未找到可用的浏览器，请在配置中指定浏览器路径或远程浏览器地址(browserWSEndpoint)');
            return false;
        }

        pluginState.log('info', `正在启动本地浏览器: ${executablePath}`);

        browser = await puppeteer.launch({
            executablePath,
            headless: config.headless !== false,
            args: getBrowserArgs(config),
            defaultViewport: {
                width: config.defaultViewportWidth || 1280,
                height: config.defaultViewportHeight || 800,
                deviceScaleFactor: config.deviceScaleFactor || 2,
            },
        });

        // 监听浏览器关闭事件
        setupDisconnectHandler();

        stats.startTime = Date.now();
        pluginState.log('info', '浏览器启动成功');
        pluginState.logDebug('浏览器版本:', await browser.version());
        return true;
    } catch (error) {
        pluginState.log('error', '启动/连接浏览器失败:', error);
        pluginState.logDebug('失败详情:', error);
        browser = null;
        return false;
    }
}

/**
 * 关闭浏览器
 */
export async function closeBrowser(): Promise<void> {
    pluginState.logDebug('closeBrowser() 被调用');

    // 清理重连状态，防止关闭后自动重连
    clearReconnectState();

    if (browser) {
        try {
            await browser.close();
            pluginState.log('info', '浏览器已关闭');
        } catch (error) {
            pluginState.log('error', '关闭浏览器失败:', error);
        } finally {
            browser = null;
            keepAlivePage = null;
            currentPageCount = 0;
            pageQueue = [];
        }
    } else {
        pluginState.logDebug('浏览器未运行，无需关闭');
    }
}

/**
 * 重启浏览器
 */
export async function restartBrowser(): Promise<boolean> {
    pluginState.logDebug('restartBrowser() 被调用');
    await closeBrowser();
    return initBrowser();
}

/**
 * 获取浏览器状态
 */
export async function getBrowserStatus(): Promise<BrowserStatus> {
    pluginState.logDebug('getBrowserStatus() 被调用');

    const config = pluginState.config.browser;
    const isRemoteMode = !!config.browserWSEndpoint;

    if (!browser) {
        pluginState.logDebug('浏览器未连接');
        return {
            connected: false,
            mode: isRemoteMode ? 'remote' : 'local',
            pageCount: 0,
            executablePath: isRemoteMode ? undefined : findBrowserPath(config.executablePath, true),
            browserWSEndpoint: isRemoteMode ? config.browserWSEndpoint : undefined,
            totalRenders: stats.totalRenders,
            failedRenders: stats.failedRenders,
        };
    }

    try {
        const version = await browser.version();
        const pages = await browser.pages();

        return {
            connected: true,
            mode: isRemoteMode ? 'remote' : 'local',
            version,
            pageCount: pages.length,
            executablePath: isRemoteMode ? undefined : findBrowserPath(config.executablePath, true),
            browserWSEndpoint: isRemoteMode ? config.browserWSEndpoint : undefined,
            startTime: stats.startTime,
            totalRenders: stats.totalRenders,
            failedRenders: stats.failedRenders,
        };
    } catch (error) {
        return {
            connected: false,
            mode: isRemoteMode ? 'remote' : 'local',
            pageCount: 0,
            totalRenders: stats.totalRenders,
            failedRenders: stats.failedRenders,
        };
    }
}

/**
 * 获取页面（带并发控制）
 */
async function acquirePage(): Promise<Page> {
    const maxPages = pluginState.config.browser.maxPages || 5;

    // 如果达到最大并发，等待
    if (currentPageCount >= maxPages) {
        await new Promise<void>((resolve) => {
            pageQueue.push(resolve);
        });
    }

    currentPageCount++;

    if (!browser) {
        const success = await initBrowser();
        if (!success || !browser) {
            currentPageCount--;
            throw new Error('浏览器未就绪');
        }
    }

    const page = await browser.newPage();
    return page;
}

/**
 * 释放页面
 */
async function releasePage(page: Page): Promise<void> {
    try {
        await page.close();
    } catch (error) {
        pluginState.logDebug('关闭页面失败:', error);
    }

    currentPageCount--;

    // 唤醒等待的任务
    if (pageQueue.length > 0) {
        const next = pageQueue.shift();
        next?.();
    }
}

/**
 * 简单模板渲染
 * 支持 {{key}} 语法
 */
function renderTemplate(html: string, data?: Record<string, any>): string {
    if (!data) return html;

    return html.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        return data[key] !== undefined ? String(data[key]) : match;
    });
}

/**
 * 查找截图目标元素
 */
async function findTargetElement(page: Page, selector?: string) {
    const findDefault = async () => {
        const container = await page.$('#container');
        if (container) return container;
        const body = await page.$('body');
        return body!;
    };

    try {
        if (selector) {
            const element = await page.$(selector);
            if (element) return element;
        }
        return findDefault();
    } catch (error) {
        pluginState.logDebug('查找元素失败:', error);
        return findDefault();
    }
}

/**
 * 计算分页尺寸
 */
function calculatePageDimensions(
    pageIndex: number,
    pageHeight: number,
    totalHeight: number
): { y: number; height: number } {
    let y = pageIndex * pageHeight;
    let height = Math.min(pageHeight, totalHeight - pageIndex * pageHeight);

    if (pageIndex !== 0) {
        y -= 100;
        height += 100;
    }

    return { y, height };
}

/**
 * 核心截图函数
 */
export async function screenshot<
    T extends Encoding = 'base64',
    M extends MultiPage = false
>(options: ScreenshotOptions): Promise<RenderResult<T, M>> {
    const startTime = Date.now();
    stats.totalRenders++;

    pluginState.logDebug('screenshot() 被调用, 参数:', JSON.stringify({
        file_type: options.file_type,
        file: options.file?.substring(0, 100) + (options.file?.length > 100 ? '...' : ''),
        encoding: options.encoding,
        selector: options.selector,
        fullPage: options.fullPage,
        multiPage: options.multiPage,
        setViewport: options.setViewport,
    }, null, 2));

    let page: Page | null = null;

    try {
        // 获取页面
        pluginState.logDebug('正在获取页面...');
        page = await acquirePage();
        pluginState.logDebug('页面获取成功, 当前页面数:', currentPageCount);

        const config = pluginState.config.browser;
        const timeout = options.pageGotoParams?.timeout || config.timeout || 30000;

        // 设置视口
        if (options.setViewport) {
            const viewport = {
                width: options.setViewport.width || config.defaultViewportWidth || 1280,
                height: options.setViewport.height || config.defaultViewportHeight || 800,
                deviceScaleFactor: options.setViewport.deviceScaleFactor || config.deviceScaleFactor || 2,
            };
            pluginState.logDebug('设置视口:', viewport);
            await page.setViewport(viewport);
        }

        // 设置额外的 HTTP 头
        if (options.headers) {
            pluginState.logDebug('设置 HTTP 头:', options.headers);
            await page.setExtraHTTPHeaders(options.headers);
        }

        // 确定导航目标
        let targetUrl: string;

        if (options.file_type === 'htmlString' ||
            (!options.file.startsWith('http://') &&
                !options.file.startsWith('https://') &&
                !options.file.startsWith('file://'))) {
            // HTML 字符串，需要先渲染模板
            pluginState.logDebug('渲染 HTML 字符串, 长度:', options.file.length);
            let html = options.file;
            if (options.data) {
                pluginState.logDebug('应用模板数据:', Object.keys(options.data));
                html = renderTemplate(html, options.data);
            }
            await page.setContent(html, {
                waitUntil: options.pageGotoParams?.waitUntil || 'networkidle0',
                timeout,
            });
            pluginState.logDebug('HTML 内容已设置');
        } else {
            // URL 或 file:// 路径
            targetUrl = options.file;

            // 处理 file:// 协议，读取文件并渲染模板
            if (targetUrl.startsWith('file://')) {
                const filePath = targetUrl.replace('file://', '');
                pluginState.logDebug('读取本地文件:', filePath);
                if (fs.existsSync(filePath)) {
                    let html = fs.readFileSync(filePath, 'utf-8');
                    if (options.data) {
                        pluginState.logDebug('应用模板数据:', Object.keys(options.data));
                        html = renderTemplate(html, options.data);
                    }
                    await page.setContent(html, {
                        waitUntil: options.pageGotoParams?.waitUntil || 'networkidle0',
                        timeout,
                    });
                    pluginState.logDebug('本地文件内容已设置');
                } else {
                    throw new Error(`文件不存在: ${filePath}`);
                }
            } else {
                pluginState.logDebug('导航到 URL:', targetUrl);
                await page.goto(targetUrl, {
                    waitUntil: options.pageGotoParams?.waitUntil || 'networkidle0',
                    timeout,
                });
                pluginState.logDebug('页面导航完成');
            }
        }

        // 等待指定选择器
        if (options.waitForSelector) {
            await page.waitForSelector(options.waitForSelector, { timeout });
        }

        // 等待指定时间
        if (options.waitForTimeout) {
            await new Promise(resolve => setTimeout(resolve, options.waitForTimeout));
        }

        // 截图选项
        const screenshotOptions: any = {
            type: options.type || 'png',
            encoding: options.encoding || 'base64',
            omitBackground: options.omitBackground || false,
        };

        if (options.type !== 'png' && options.quality) {
            screenshotOptions.quality = options.quality;
        }

        // 全页面截图
        if (options.fullPage) {
            pluginState.logDebug('执行全页面截图');
            screenshotOptions.fullPage = true;
            screenshotOptions.captureBeyondViewport = true;

            const result = await page.screenshot(screenshotOptions);
            pluginState.logDebug('全页面截图完成');

            return {
                status: true,
                data: result as any,
                time: Date.now() - startTime,
            };
        }

        // 获取目标元素
        pluginState.logDebug('查找目标元素, selector:', options.selector || '默认');
        const element = await findTargetElement(page, options.selector);
        const box = await element.boundingBox();
        pluginState.logDebug('元素边界:', box);

        // 更新视口以适应元素
        if (box) {
            await page.setViewport({
                width: Math.ceil(box.width) || config.defaultViewportWidth || 1280,
                height: Math.ceil(box.height) || config.defaultViewportHeight || 800,
                deviceScaleFactor: options.setViewport?.deviceScaleFactor || config.deviceScaleFactor || 2,
            });
        }

        // 分页截图
        if (options.multiPage && box) {
            const pageHeight = typeof options.multiPage === 'number'
                ? options.multiPage
                : (box.height >= 2000 ? 2000 : box.height);

            const totalPages = Math.ceil(box.height / pageHeight);
            pluginState.logDebug(`执行分页截图, 每页高度: ${pageHeight}, 总页数: ${totalPages}`);
            const results: any[] = [];

            for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
                const { y, height } = calculatePageDimensions(pageIndex, pageHeight, box.height);

                const clipOptions = {
                    ...screenshotOptions,
                    clip: { x: 0, y, width: box.width, height },
                };

                const screenshot = await element.screenshot(clipOptions);
                results.push(screenshot);
            }

            return {
                status: true,
                data: results as any,
                time: Date.now() - startTime,
            };
        }

        // 单页截图
        pluginState.logDebug('执行单页截图');
        const result = await element.screenshot(screenshotOptions);
        const elapsed = Date.now() - startTime;
        pluginState.logDebug(`截图完成, 耗时: ${elapsed}ms`);

        return {
            status: true,
            data: result as any,
            time: elapsed,
        };

    } catch (error) {
        stats.failedRenders++;
        const message = error instanceof Error ? error.message : String(error);
        pluginState.log('error', '截图失败:', message);
        pluginState.logDebug('截图失败详情:', error);

        return {
            status: false,
            data: '' as any,
            message,
            time: Date.now() - startTime,
        };
    } finally {
        if (page) {
            pluginState.logDebug('释放页面');
            await releasePage(page);
        }
    }
}

/**
 * 渲染 HTML 并截图（便捷方法）
 */
export async function renderHtml(
    html: string,
    options?: Partial<ScreenshotOptions>
): Promise<RenderResult<'base64', false>> {
    pluginState.logDebug('renderHtml() 被调用, HTML 长度:', html.length);
    return screenshot({
        file: html,
        file_type: 'htmlString',
        encoding: 'base64',
        ...options,
    });
}

/**
 * 截图 URL（便捷方法）
 */
export async function screenshotUrl(
    url: string,
    options?: Partial<ScreenshotOptions>
): Promise<RenderResult<'base64', false>> {
    pluginState.logDebug('screenshotUrl() 被调用, URL:', url);
    return screenshot({
        file: url,
        file_type: 'auto',
        encoding: 'base64',
        ...options,
    });
}
