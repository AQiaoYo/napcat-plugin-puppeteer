/**
 * 插件配置模块
 * 定义默认配置和 WebUI 配置 Schema
 */

import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin-manger';
import type { PluginConfig, BrowserConfig } from './types';

/** 默认浏览器配置 */
export const DEFAULT_BROWSER_CONFIG: BrowserConfig = {
    executablePath: '',
    browserWSEndpoint: '',
    headless: true,
    args: [
        '--window-size=800,600',
        '--disable-gpu',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--no-zygote',
        '--disable-extensions',
        '--disable-dev-shm-usage',
        '--disable-background-networking',
        '--disable-sync',
        '--disable-crash-reporter',
        '--disable-translate',
        '--disable-notifications',
        '--disable-device-discovery-notifications',
        '--disable-accelerated-2d-canvas',
    ],
    proxy: undefined,
    maxPages: 10,
    timeout: 30000,
    defaultViewportWidth: 800,
    defaultViewportHeight: 600,
    deviceScaleFactor: 1,
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
            <div style="padding: 16px; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; margin-bottom: 20px; box-shadow: 0 2px 6px rgba(0,0,0,0.04); font-family: system-ui, -apple-system, sans-serif;">
                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
                    <div style="width: 36px; height: 36px; background: #fff1f2; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #fb7299; flex-shrink: 0;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
                            <polyline points="2 17 12 22 22 17"></polyline>
                            <polyline points="2 12 12 17 22 12"></polyline>
                        </svg>
                    </div>
                    <div>
                        <h3 style="margin: 0; font-size: 16px; font-weight: 600; color: #374151;">Puppeteer 渲染服务</h3>
                        <p style="margin: 2px 0 0; font-size: 12px; color: #9ca3af;">napcat-plugin-puppeteer</p>
                    </div>
                </div>
                <p style="margin: 0 0 4px; font-size: 13px; color: #6b7280; line-height: 1.5;">提供基于 Chromium 的 HTML/模板截图渲染能力，支持多页签并发与自定义视口配置。</p>
            </div>
        `),
        // 全局开关
        ctx.NapCatConfig.boolean('enabled', '启用渲染服务', DEFAULT_CONFIG.enabled, '开启后提供截图渲染 API'),
        // 提示信息
        ctx.NapCatConfig.html(`
            <div style="padding: 12px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; margin-top: 10px; display: flex; gap: 10px; align-items: center; font-family: system-ui, -apple-system, sans-serif;">
                <div style="color: #6b7280; flex-shrink: 0;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="16" x2="12" y2="12"></line>
                        <line x1="12" y1="8" x2="12.01" y2="8"></line>
                    </svg>
                </div>
                <div style="font-size: 13px; color: #4b5563;">
                    更多高级配置（浏览器路径、并发数、视口设置等）请前往 
                    <a href="/plugin/napcat-plugin-puppeteer/page/puppeteer-dashboard" target="_top" style="color: #fb7299; text-decoration: none; font-weight: 600; transition: opacity 0.2s;">WebUI 控制台</a> 
                    进行管理。
                </div>
            </div>
        `)
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
        // Linux / Docker
        return [
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable',
            '/usr/bin/chromium',
            '/usr/bin/chromium-browser',
            '/usr/bin/microsoft-edge',
            '/snap/bin/chromium',
            // Docker 常见路径
            '/opt/google/chrome/chrome',
            '/opt/google/chrome/google-chrome',
            '/headless-shell/headless-shell', // puppeteer 官方 Docker 镜像
            '/chrome/chrome', // 某些精简镜像
        ];
    }
}
