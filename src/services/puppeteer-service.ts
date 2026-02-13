/**
 * Puppeteer 渲染服务
 * 浏览器管理、截图核心逻辑
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import puppeteer from 'puppeteer-core';
import type { Browser, Page } from 'puppeteer-core';
import { pluginState } from '../core/state';
import { getDefaultBrowserPaths, DEFAULT_BROWSER_CONFIG } from '../config';
import {
    getDefaultInstallPath,
    getChromeExecutablePath,
    getWindowsVersion,
} from './chrome-installer';
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

/** 当前打开的页面数 */
let currentPageCount = 0;

/** 页面信号量（用于限制并发） */
let pageQueue: Array<() => void> = [];

/** 重连相关状态 */
let isReconnecting = false;
let isClosing = false; // 标记是否正在主动关闭
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_BASE = 3000; // 基础重连延迟 3 秒
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

/** 健康检查定时器 */
let healthCheckTimer: ReturnType<typeof setInterval> | null = null;
const HEALTH_CHECK_INTERVAL = 30000; // 30 秒检测一次连接健康

/** 断连防抖：避免瞬间多次断连触发多次重连 */
let disconnectDebounceTimer: ReturnType<typeof setTimeout> | null = null;
const DISCONNECT_DEBOUNCE_MS = 2000; // 断连后等待 2 秒再触发重连

/** 统计信息 */
const stats = {
    totalRenders: 0,
    failedRenders: 0,
    startTime: 0,
};

/**
 * 获取默认视口配置
 * 统一管理视口默认值，避免魔法数字
 */
function getDefaultViewport(config: BrowserConfig, overrides?: { width?: number; height?: number; deviceScaleFactor?: number }) {
    return {
        width: overrides?.width ?? config.defaultViewportWidth ?? DEFAULT_BROWSER_CONFIG.defaultViewportWidth!,
        height: overrides?.height ?? config.defaultViewportHeight ?? DEFAULT_BROWSER_CONFIG.defaultViewportHeight!,
        deviceScaleFactor: overrides?.deviceScaleFactor ?? config.deviceScaleFactor ?? DEFAULT_BROWSER_CONFIG.deviceScaleFactor!,
    };
}

/**
 * 清理重连状态
 */
function clearReconnectState(): void {
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
    if (disconnectDebounceTimer) {
        clearTimeout(disconnectDebounceTimer);
        disconnectDebounceTimer = null;
    }
    isReconnecting = false;
    reconnectAttempts = 0;
}

/**
 * 启动远程连接健康检查
 * 定期通过 browser.version() 探测连接是否正常
 */
function startHealthCheck(): void {
    stopHealthCheck();
    healthCheckTimer = setInterval(async () => {
        if (!browser || isClosing || isReconnecting) return;
        try {
            await browser.version();
        } catch {
            pluginState.logDebug('健康检查失败，连接可能已断开');
            // 不需要手动处理，puppeteer 的 disconnected 事件会自动触发
        }
    }, HEALTH_CHECK_INTERVAL);
}

/**
 * 停止健康检查
 */
function stopHealthCheck(): void {
    if (healthCheckTimer) {
        clearInterval(healthCheckTimer);
        healthCheckTimer = null;
    }
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

    // 指数退避延迟，最大 30 秒
    const delay = Math.min(RECONNECT_DELAY_BASE * Math.pow(2, reconnectAttempts - 1), 30000);
    pluginState.log('info', `将在 ${delay}ms 后尝试第 ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} 次重连...`);

    await new Promise(resolve => setTimeout(resolve, delay));

    try {
        pluginState.logDebug(`正在重连远程浏览器: ${config.browserWSEndpoint}`);

        browser = await puppeteer.connect({
            browserWSEndpoint: config.browserWSEndpoint,
            defaultViewport: getDefaultViewport(config),
        });

        // 重新注册断开事件监听
        setupDisconnectHandler();

        // 启动健康检查
        startHealthCheck();

        stats.startTime = Date.now();
        pluginState.log('info', '远程浏览器重连成功');
        clearReconnectState();
        return true;
    } catch (error) {
        pluginState.logDebug(`重连失败 (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}):`, error);
        browser = null;
        isReconnecting = false;

        // 继续尝试重连
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            return attemptReconnect();
        } else {
            pluginState.log('error', `远程浏览器重连失败，已达到最大重试次数 (${MAX_RECONNECT_ATTEMPTS})`);
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
        // 如果是主动关闭/断开，不触发重连
        if (isClosing) {
            pluginState.logDebug('浏览器已主动关闭/断开，跳过重连');
            return;
        }

        // 停止健康检查
        stopHealthCheck();

        browser = null;
        currentPageCount = 0;
        pageQueue = [];

        if (!isRemoteMode) {
            pluginState.log('warn', '本地浏览器已断开连接');
            return;
        }

        // 远程模式：使用防抖避免瞬间多次触发
        if (isReconnecting) {
            pluginState.logDebug('已在重连中，跳过重复的断连事件');
            return;
        }

        // 清除之前的防抖定时器
        if (disconnectDebounceTimer) {
            clearTimeout(disconnectDebounceTimer);
        }

        pluginState.logDebug('远程浏览器连接断开，等待防抖后重连...');
        disconnectDebounceTimer = setTimeout(() => {
            disconnectDebounceTimer = null;
            if (!isClosing && !isReconnecting && !browser) {
                pluginState.log('warn', '远程浏览器连接已断开，准备自动重连...');
                attemptReconnect();
            }
        }, DISCONNECT_DEBOUNCE_MS);
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

    // 检查安装程序安装的路径
    const installedPath = getChromeExecutablePath(getDefaultInstallPath());
    if (installedPath && fs.existsSync(installedPath)) {
        if (!suppressLog) {
            pluginState.log('info', `检测到已安装的集成浏览器: ${installedPath}`);
        }
        return installedPath;
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
 * 优先使用用户配置的参数，否则使用默认配置并追加窗口大小参数
 */
function getBrowserArgs(config: BrowserConfig): string[] {
    // 如果用户配置了自定义参数，直接使用
    if (config.args?.length) {
        return config.args;
    }

    // 使用默认参数并追加动态的窗口大小参数
    const width = config.defaultViewportWidth ?? DEFAULT_BROWSER_CONFIG.defaultViewportWidth;
    const height = config.defaultViewportHeight ?? DEFAULT_BROWSER_CONFIG.defaultViewportHeight;

    return [
        ...(DEFAULT_BROWSER_CONFIG.args || []),
        `--window-size=${width},${height}`,
    ];
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
                defaultViewport: getDefaultViewport(config),
            });

            // 监听浏览器断开事件（带自动重连）
            setupDisconnectHandler();

            // 远程模式不再创建保活页面
            // 保活页面会导致某些 Chrome 容器（如 browserless）误判为活跃会话，
            // 空闲超时后清理并重启浏览器，形成断连-重连循环。
            // puppeteer.connect() 本身通过 WebSocket 保持连接，无需额外保活。

            // 重置重连计数
            clearReconnectState();

            // 启动健康检查
            startHealthCheck();

            stats.startTime = Date.now();
            pluginState.log('info', '远程浏览器连接成功');
            pluginState.logDebug('浏览器版本:', await browser.version());
            return true;
        }

        // 本地浏览器启动
        const executablePath = findBrowserPath(config.executablePath);

        if (!executablePath) {
            // 检查是否是 Windows 版本兼容性问题
            if (os.platform() === 'win32') {
                const winInfo = getWindowsVersion();
                if (winInfo && !winInfo.supportsChromeForTesting) {
                    pluginState.log('error',
                        `当前系统 ${winInfo.name} 不支持本插件。\n` +
                        `Puppeteer 要求 Windows 10 或更高版本。\n` +
                        `解决方案：升级系统或使用远程浏览器连接。`
                    );
                    return false;
                }
            }

            pluginState.log('error', '未找到可用的浏览器，请在配置中指定浏览器路径或远程浏览器地址(browserWSEndpoint)');
            return false;
        }

        pluginState.log('info', `正在启动本地浏览器: ${executablePath}`);

        // 构建代理配置
        const launchOptions: any = {
            executablePath,
            headless: config.headless !== false,
            args: getBrowserArgs(config),
            defaultViewport: getDefaultViewport(config),
        };

        // 应用代理配置（仅本地模式有效）
        if (config.proxy?.server) {
            const proxyServer = config.proxy.server;
            pluginState.log('info', `配置代理服务器: ${proxyServer}`);

            // 过滤可能存在的冲突代理参数
            const existingArgs = launchOptions.args || [];
            const filteredArgs = existingArgs.filter(
                (arg: string) => !arg.startsWith('--proxy-')
            );

            launchOptions.args = [
                `--proxy-server=${proxyServer}`,
                ...filteredArgs,
            ];

            // 添加代理 bypass 列表
            if (config.proxy.bypassList) {
                launchOptions.args.push(`--proxy-bypass-list=${config.proxy.bypassList}`);
            }
        }

        browser = await puppeteer.launch(launchOptions);

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

    // 标记正在主动关闭，防止 disconnected 事件触发重连
    isClosing = true;

    // 清理重连状态和健康检查
    clearReconnectState();
    stopHealthCheck();

    if (browser) {
        const config = pluginState.config.browser;
        const isRemoteMode = !!config.browserWSEndpoint;

        try {
            if (isRemoteMode) {
                // 远程模式：仅断开连接，不关闭远程浏览器进程
                // browser.close() 会关闭远程浏览器进程，导致容器重启
                browser.disconnect();
                pluginState.log('info', '已断开远程浏览器连接');
            } else {
                // 本地模式：关闭浏览器进程
                await browser.close();
                pluginState.log('info', '浏览器已关闭');
            }
        } catch (error) {
            pluginState.log('error', '关闭/断开浏览器失败:', error);
        } finally {
            browser = null;
            currentPageCount = 0;
            pageQueue = [];
            isClosing = false;
        }
    } else {
        pluginState.logDebug('浏览器未运行，无需关闭');
        isClosing = false;
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
 * 构建代理状态对象（用于 BrowserStatus）
 * 只暴露 server 和 bypassList，不暴露 username 以减少敏感信息暴露
 */
function buildProxyStatus(proxyConfig?: { server?: string; bypassList?: string }): { server: string; bypassList?: string } | undefined {
    if (!proxyConfig?.server) {
        return undefined;
    }
    return {
        server: proxyConfig.server,
        bypassList: proxyConfig.bypassList,
    };
}

/**
 * 获取浏览器状态
 */
export async function getBrowserStatus(): Promise<BrowserStatus> {
    pluginState.logDebug('getBrowserStatus() 被调用');

    const config = pluginState.config.browser;
    const isRemoteMode = !!config.browserWSEndpoint;
    const proxyStatus = buildProxyStatus(config.proxy);

    if (!browser) {
        pluginState.logDebug('浏览器未连接');
        return {
            connected: false,
            mode: isRemoteMode ? 'remote' : 'local',
            pageCount: 0,
            executablePath: isRemoteMode ? undefined : findBrowserPath(config.executablePath, true),
            browserWSEndpoint: isRemoteMode ? config.browserWSEndpoint : undefined,
            proxy: proxyStatus,
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
            proxy: proxyStatus,
            startTime: stats.startTime,
            totalRenders: stats.totalRenders,
            failedRenders: stats.failedRenders,
        };
    } catch (error) {
        return {
            connected: false,
            mode: isRemoteMode ? 'remote' : 'local',
            pageCount: 0,
            proxy: proxyStatus,
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

    // 应用代理认证（仅本地模式有效，远程模式由远程浏览器处理）
    const config = pluginState.config.browser;
    if (config.proxy?.server && config.proxy.username && config.proxy.password && !config.browserWSEndpoint) {
        await page.authenticate({
            username: config.proxy.username,
            password: config.proxy.password,
        });
    }

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
            const viewport = getDefaultViewport(config, options.setViewport);
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
            await page.setViewport(getDefaultViewport(config, {
                width: Math.ceil(box.width) || undefined,
                height: Math.ceil(box.height) || undefined,
                deviceScaleFactor: options.setViewport?.deviceScaleFactor,
            }));
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
