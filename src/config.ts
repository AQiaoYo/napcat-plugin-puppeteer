/**
 * 插件配置模块
 * 定义默认配置和 WebUI 配置 Schema
 */

import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin-manger';
import type { PluginConfig, BrowserConfig } from './types';

/** 默认浏览器配置 */
export const DEFAULT_BROWSER_CONFIG: BrowserConfig = {
    executablePath: '',
    headless: true,
    args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-zygote',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-sync',
        '--disable-translate',
    ],
    maxPages: 5,
    timeout: 30000,
    defaultViewportWidth: 1280,
    defaultViewportHeight: 800,
    deviceScaleFactor: 2,
};

/** 默认配置 */
export const DEFAULT_CONFIG: PluginConfig = {
    enabled: true,
    browser: { ...DEFAULT_BROWSER_CONFIG },
    debug: false,
};

/**
 * 初始化 WebUI 配置 Schema
 * 使用 NapCat 提供的构建器生成配置界面
 */
export function initConfigUI(ctx: NapCatPluginContext) {
    const schema = ctx.NapCatConfig.combine(
        ctx.NapCatConfig.html(`
            <div style="padding: 16px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; margin-bottom: 20px; color: white;">
                <h3 style="margin: 0; font-size: 18px;">🎨 Puppeteer 渲染服务</h3>
                <p style="margin: 8px 0 0; font-size: 14px; opacity: 0.9;">提供 HTML/模板截图渲染 API，供其他插件调用。</p>
                <p style="margin: 6px 0 0; font-size: 12px; opacity: 0.8;">💡 其他插件可通过 HTTP API 调用渲染服务生成图片。</p>
            </div>
        `),
        // 全局开关
        ctx.NapCatConfig.boolean('enabled', '启用渲染服务', DEFAULT_CONFIG.enabled, '开启后提供截图渲染 API'),
        // 浏览器路径
        ctx.NapCatConfig.text('browser.executablePath', '浏览器路径', DEFAULT_CONFIG.browser.executablePath || '', '留空则自动检测系统 Chrome/Edge 路径'),
        // 无头模式
        ctx.NapCatConfig.boolean('browser.headless', '无头模式', DEFAULT_CONFIG.browser.headless ?? true, '是否隐藏浏览器窗口'),
        // 最大并发
        ctx.NapCatConfig.text('browser.maxPages', '最大并发页面数', String(DEFAULT_CONFIG.browser.maxPages ?? 5), '同时打开的最大页面数'),
        // 超时时间
        ctx.NapCatConfig.text('browser.timeout', '默认超时时间 (ms)', String(DEFAULT_CONFIG.browser.timeout ?? 30000), '页面加载超时时间'),
        // 视口宽度
        ctx.NapCatConfig.text('browser.defaultViewportWidth', '默认视口宽度', String(DEFAULT_CONFIG.browser.defaultViewportWidth ?? 1280), '截图默认宽度'),
        // 视口高度
        ctx.NapCatConfig.text('browser.defaultViewportHeight', '默认视口高度', String(DEFAULT_CONFIG.browser.defaultViewportHeight ?? 800), '截图默认高度'),
        // 设备像素比
        ctx.NapCatConfig.text('browser.deviceScaleFactor', '设备像素比', String(DEFAULT_CONFIG.browser.deviceScaleFactor ?? 2), '截图清晰度，推荐 1-3'),
        // 调试模式
        ctx.NapCatConfig.boolean('debug', '调试模式', DEFAULT_CONFIG.debug ?? false, '输出详细日志'),
    );

    return schema;
}

export function getDefaultConfig(): PluginConfig {
    return {
        ...DEFAULT_CONFIG,
        browser: { ...DEFAULT_BROWSER_CONFIG },
    };
}

/**
 * 获取系统默认浏览器路径
 */
export function getDefaultBrowserPaths(): string[] {
    const platform = process.platform;

    if (platform === 'win32') {
        return [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
            'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
            process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
            process.env.LOCALAPPDATA + '\\Microsoft\\Edge\\Application\\msedge.exe',
        ];
    } else if (platform === 'darwin') {
        return [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
            '/Applications/Chromium.app/Contents/MacOS/Chromium',
        ];
    } else {
        // Linux
        return [
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable',
            '/usr/bin/chromium',
            '/usr/bin/chromium-browser',
            '/usr/bin/microsoft-edge',
            '/snap/bin/chromium',
        ];
    }
}
