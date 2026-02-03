/**
 * NapCat Puppeteer 渲染服务插件
 * 
 * 功能：
 * - 提供 HTML/模板截图渲染 API
 * - 支持 URL、本地文件、HTML 字符串渲染
 * - 支持分页截图、自定义视口
 * - 其他插件可通过 HTTP 路由调用
 * 
 * @author AQiaoYo
 * @license MIT
 */

// @ts-ignore - NapCat 类型定义
import type { NapCatPluginContext, PluginConfigSchema, PluginConfigUIController } from 'napcat-types/napcat-onebot/network/plugin-manger';

import { initConfigUI } from './config';
import { pluginState } from './core/state';
import {
    initBrowser,
    closeBrowser,
    restartBrowser,
    getBrowserStatus,
    screenshot,
    renderHtml,
    screenshotUrl,
} from './services/puppeteer-service';
import {
    installChrome,
    getInstallProgress,
    isInstallingChrome,
    isChromeInstalled,
    getInstalledChromeInfo,
    getDefaultInstallPath,
    getChromeExecutablePath,
    installLinuxDependencies,
    detectLinuxDistro,
    uninstallChrome,
    DEFAULT_CHROME_VERSION,
    getCurrentPlatform,
    findInstalledBrowsers,
    Platform,
    getWindowsVersion,
    LAST_LEGACY_WINDOWS_CHROME_VERSION,
} from './services/chrome-installer';
import type { ScreenshotOptions } from './types';

/** 框架配置 UI Schema，NapCat WebUI 会读取此导出来展示配置面板 */
export let plugin_config_ui: PluginConfigSchema = [];

/**
 * 解析请求体
 */
async function parseRequestBody(req: any): Promise<any> {
    let body = req.body;
    if (!body || Object.keys(body).length === 0) {
        try {
            const raw = await new Promise<string>((resolve) => {
                let data = '';
                req.on('data', (chunk: any) => data += chunk);
                req.on('end', () => resolve(data));
            });
            if (raw) body = JSON.parse(raw);
        } catch (e) {
            pluginState.log('error', '解析请求体失败:', e);
        }
    }
    return body || {};
}

/**
 * 认证检查（已禁用）
 * 插件间通信无需认证，直接放行所有请求
 */
function checkAuth(_req: any, _res: any): boolean {
    return true;
}

/**
 * 插件初始化函数
 * 负责加载配置、初始化浏览器、注册 WebUI 路由
 */
const plugin_init = async (ctx: NapCatPluginContext) => {
    try {
        pluginState.initFromContext(ctx);
        pluginState.loadConfig(ctx);
        pluginState.log('info', `初始化完成 | name=${ctx.pluginName}`);

        // 生成配置 schema 并导出
        try {
            const schema = initConfigUI(ctx);
            plugin_config_ui = schema || [];
        } catch (e) {
            pluginState.logDebug('initConfigUI 未实现或抛出错误，已跳过');
        }

        // 初始化浏览器
        if (pluginState.config.enabled) {
            const success = await initBrowser();
            if (!success) {
                pluginState.log('warn', '浏览器初始化失败，请检查配置');
            }
        }

        // 注册 WebUI 路由
        try {
            const router = ctx.router;

            // 静态资源目录
            if (router && router.static) router.static('/static', 'webui');

            // 插件信息脚本（用于前端获取插件名）
            router.get('/static/plugin-info.js', (_req: any, res: any) => {
                try {
                    res.type('application/javascript');
                    res.send(`window.__PLUGIN_NAME__ = ${JSON.stringify(ctx.pluginName)};`);
                } catch (e) {
                    res.status(500).send('// failed to generate plugin-info');
                }
            });

            // ==================== 无认证 API（供其他插件调用）====================
            // 路由挂载到 /plugin/{pluginId}/api/，无需 WebUI 登录即可访问

            // 插件信息（无认证）
            router.getNoAuth('/info', (_req: any, res: any) => {
                res.json({ code: 0, data: { pluginName: ctx.pluginName, version: '1.0.0' } });
            });

            // 插件状态（无认证）
            router.getNoAuth('/status', async (_req: any, res: any) => {
                pluginState.logDebug('API 请求: GET /status (NoAuth)');
                try {
                    const browserStatus = await getBrowserStatus();
                    res.json({
                        code: 0,
                        data: {
                            pluginName: pluginState.pluginName,
                            uptime: pluginState.getUptime(),
                            uptimeFormatted: pluginState.getUptimeFormatted(),
                            enabled: pluginState.config.enabled,
                            browser: browserStatus,
                        }
                    });
                } catch (e) {
                    res.status(500).json({ code: -1, message: String(e) });
                }
            });

            // 浏览器状态（无认证）
            router.getNoAuth('/browser/status', async (_req: any, res: any) => {
                pluginState.logDebug('API 请求: GET /browser/status (NoAuth)');
                try {
                    const status = await getBrowserStatus();
                    res.json({ code: 0, data: status });
                } catch (e) {
                    res.status(500).json({ code: -1, message: String(e) });
                }
            });

            // 卸载 Chrome
            router.post('/chrome/uninstall', async (_req: any, res: any) => {
                pluginState.logDebug('API 请求: POST /chrome/uninstall');
                try {
                    const result = await uninstallChrome();
                    if (result.success) {
                        res.json({ code: 0, message: 'Chrome 卸载成功' });
                    } else {
                        res.status(500).json({ code: -1, message: result.error || '卸载失败' });
                    }
                } catch (e) {
                    res.status(500).json({ code: -1, message: String(e) });
                }
            });

            // 重新安装/更新 Chrome
            router.post('/chrome/install', async (_req: any, res: any) => {
                pluginState.logDebug('API 请求: POST /chrome/install');
                try {
                    // 如果正在安装，返回错误
                    if (isInstallingChrome()) {
                        return res.status(409).json({ code: -1, message: '正在安装 Chrome，请稍后' });
                    }

                    // 启动后台安装
                    installChrome({
                        installDeps: true,
                        onProgress: (progress) => {
                            // 可选：通过 WebSocket 推送进度
                            pluginState.logDebug(`Chrome 安装进度: ${progress.status} ${progress.progress}%`);
                        }
                    }).then((result) => {
                        pluginState.log('info', result.success ? 'Chrome 安装/更新成功' : `Chrome 安装失败: ${result.error}`);
                        // 安装成功后自动初始化浏览器
                        if (result.success && pluginState.config.enabled) {
                            initBrowser();
                        }
                    });

                    res.json({ code: 0, message: 'Chrome 安装任务已启动' });
                } catch (e) {
                    res.status(500).json({ code: -1, message: String(e) });
                }
            });

            // 获取安装进度
            router.getNoAuth('/chrome/progress', (_req: any, res: any) => {
                res.json({
                    code: 0,
                    data: {
                        isInstalling: isInstallingChrome(),
                        progress: getInstallProgress()
                    }
                });
            });

            // 截图接口 GET（无认证）- 简单 URL 截图
            router.getNoAuth('/screenshot', async (req: any, res: any) => {
                const url = req.query?.url as string;
                pluginState.logDebug('API 请求: GET /screenshot (NoAuth)', { url, query: req.query });

                try {
                    if (!url) {
                        return res.status(400).json({ code: -1, message: '缺少 url 参数' });
                    }

                    const options: ScreenshotOptions = {
                        file: url,
                        file_type: 'auto',
                        encoding: (req.query?.encoding as any) || 'base64',
                        selector: req.query?.selector as string,
                        fullPage: req.query?.fullPage === 'true',
                        type: (req.query?.type as any) || 'png',
                    };

                    const result = await screenshot(options);

                    if (result.status) {
                        // 如果请求直接返回图片
                        if (req.query?.raw === 'true') {
                            const contentType = options.type === 'jpeg' ? 'image/jpeg' :
                                options.type === 'webp' ? 'image/webp' : 'image/png';
                            res.type(contentType);

                            if (options.encoding === 'base64') {
                                res.send(Buffer.from(result.data as string, 'base64'));
                            } else {
                                res.send(result.data);
                            }
                        } else {
                            res.json({ code: 0, data: result.data, time: result.time });
                        }
                    } else {
                        res.status(500).json({ code: -1, message: result.message });
                    }
                } catch (e) {
                    pluginState.log('error', '截图失败:', e);
                    res.status(500).json({ code: -1, message: String(e) });
                }
            });

            // 截图接口 POST（无认证）- 完整参数
            router.postNoAuth('/screenshot', async (req: any, res: any) => {
                pluginState.logDebug('API 请求: POST /screenshot (NoAuth)');

                try {
                    const body = await parseRequestBody(req);
                    pluginState.logDebug('截图参数:', JSON.stringify({
                        file_type: body.file_type,
                        file_length: body.file?.length,
                        selector: body.selector,
                        encoding: body.encoding,
                        fullPage: body.fullPage,
                    }, null, 2));

                    if (!body.file) {
                        return res.status(400).json({ code: -1, message: '缺少 file 参数' });
                    }

                    const options: ScreenshotOptions = {
                        file: body.file,
                        file_type: body.file_type || 'auto',
                        data: body.data,
                        selector: body.selector,
                        type: body.type || 'png',
                        quality: body.quality,
                        encoding: body.encoding || 'base64',
                        fullPage: body.fullPage,
                        omitBackground: body.omitBackground,
                        multiPage: body.multiPage,
                        setViewport: body.setViewport,
                        pageGotoParams: body.pageGotoParams,
                        headers: body.headers,
                        retry: body.retry,
                        waitForTimeout: body.waitForTimeout,
                        waitForSelector: body.waitForSelector,
                    };

                    const result = await screenshot(options);

                    if (result.status) {
                        res.json({ code: 0, data: result.data, time: result.time });
                    } else {
                        res.status(500).json({ code: -1, message: result.message });
                    }
                } catch (e) {
                    pluginState.log('error', '截图失败:', e);
                    res.status(500).json({ code: -1, message: String(e) });
                }
            });

            // 渲染 HTML 接口 POST（无认证）
            router.postNoAuth('/render', async (req: any, res: any) => {
                pluginState.logDebug('API 请求: POST /render (NoAuth)');

                try {
                    const body = await parseRequestBody(req);
                    pluginState.logDebug('渲染参数:', JSON.stringify({
                        has_html: !!body.html,
                        html_length: body.html?.length,
                        file: body.file,
                        selector: body.selector,
                        data_keys: body.data ? Object.keys(body.data) : [],
                    }, null, 2));

                    if (!body.html && !body.file) {
                        return res.status(400).json({ code: -1, message: '缺少 html 或 file 参数' });
                    }

                    const options: ScreenshotOptions = {
                        file: body.html || body.file,
                        file_type: body.html ? 'htmlString' : (body.file_type || 'auto'),
                        data: body.data,
                        selector: body.selector || 'body',
                        type: body.type || 'png',
                        quality: body.quality,
                        encoding: body.encoding || 'base64',
                        fullPage: body.fullPage,
                        omitBackground: body.omitBackground,
                        multiPage: body.multiPage,
                        setViewport: body.setViewport,
                        pageGotoParams: body.pageGotoParams,
                        waitForTimeout: body.waitForTimeout,
                        waitForSelector: body.waitForSelector,
                    };

                    const result = await screenshot(options);

                    if (result.status) {
                        res.json({ code: 0, data: result.data, time: result.time });
                    } else {
                        res.status(500).json({ code: -1, message: result.message });
                    }
                } catch (e) {
                    pluginState.log('error', '渲染失败:', e);
                    res.status(500).json({ code: -1, message: String(e) });
                }
            });

            // ==================== 需认证 API（WebUI 管理接口）====================
            // 路由挂载到 /api/Plugin/ext/{pluginId}/，需要 WebUI 登录

            // 获取配置（需认证）
            router.get('/config', (_req: any, res: any) => {
                pluginState.logDebug('API 请求: GET /config');
                res.json({ code: 0, data: pluginState.getConfig() });
            });

            // 保存配置（需认证）
            router.post('/config', async (req: any, res: any) => {
                pluginState.logDebug('API 请求: POST /config');
                try {
                    const body = await parseRequestBody(req);
                    pluginState.logDebug('保存配置内容:', JSON.stringify(body, null, 2));
                    pluginState.setConfig(ctx, body);
                    pluginState.log('info', '配置已保存');
                    res.json({ code: 0, message: 'ok' });
                } catch (err) {
                    pluginState.log('error', '保存配置失败:', err);
                    res.status(500).json({ code: -1, message: String(err) });
                }
            });

            // 启动浏览器（需认证）
            router.post('/browser/start', async (_req: any, res: any) => {
                pluginState.logDebug('API 请求: POST /browser/start');
                try {
                    const success = await initBrowser();
                    if (success) {
                        res.json({ code: 0, message: '浏览器已启动' });
                    } else {
                        res.status(500).json({ code: -1, message: '启动浏览器失败' });
                    }
                } catch (e) {
                    res.status(500).json({ code: -1, message: String(e) });
                }
            });

            // 关闭浏览器（需认证）
            router.post('/browser/stop', async (_req: any, res: any) => {
                pluginState.logDebug('API 请求: POST /browser/stop');
                try {
                    await closeBrowser();
                    res.json({ code: 0, message: '浏览器已关闭' });
                } catch (e) {
                    res.status(500).json({ code: -1, message: String(e) });
                }
            });

            // 重启浏览器（需认证）
            router.post('/browser/restart', async (_req: any, res: any) => {
                pluginState.logDebug('API 请求: POST /browser/restart');
                try {
                    const success = await restartBrowser();
                    if (success) {
                        res.json({ code: 0, message: '浏览器已重启' });
                    } else {
                        res.status(500).json({ code: -1, message: '重启浏览器失败' });
                    }
                } catch (e) {
                    res.status(500).json({ code: -1, message: String(e) });
                }
            });

            // ==================== Chrome 安装相关 API ====================

            // 获取 Chrome 安装状态（无认证）
            router.getNoAuth('/chrome/status', async (_req: any, res: any) => {
                pluginState.logDebug('API 请求: GET /chrome/status (NoAuth)');
                try {
                    const installPath = getDefaultInstallPath();
                    const info = await getInstalledChromeInfo(installPath);
                    const distro = await detectLinuxDistro();
                    const platform = getCurrentPlatform();

                    // 查找系统已安装的浏览器
                    const installedBrowsers = findInstalledBrowsers();

                    // 判断是否支持自动安装
                    let canInstall = true;
                    let cannotInstallReason = '';

                    // Chrome for Testing 支持的平台
                    const supportedPlatforms: string[] = [
                        Platform.WIN32, Platform.WIN64,
                        Platform.MAC, Platform.MAC_ARM,
                        Platform.LINUX
                    ];

                    if (!supportedPlatforms.includes(platform)) {
                        canInstall = false;
                        if (platform === Platform.LINUX_ARM) {
                            cannotInstallReason = 'Chrome for Testing 暂不支持 Linux ARM 架构';
                        } else {
                            cannotInstallReason = `不支持的平台: ${platform}`;
                        }
                    }

                    // 检查 Windows 版本兼容性
                    let windowsVersionName = '';
                    if (canInstall && (platform === Platform.WIN32 || platform === Platform.WIN64)) {
                        const winInfo = getWindowsVersion();
                        if (winInfo) {
                            windowsVersionName = winInfo.name;
                            if (!winInfo.supportsChromeForTesting) {
                                canInstall = false;
                                cannotInstallReason = `当前系统 ${winInfo.name} 不支持本插件（Puppeteer 要求 Windows 10 或更高版本）。\n\n` +
                                    `解决方案：\n` +
                                    `1. 升级操作系统至 Windows 10 / Windows Server 2016 或更高版本\n` +
                                    `2. 使用远程浏览器连接（推荐 Docker 部署，见下方说明）`;
                            }
                        }
                    }

                    res.json({
                        code: 0,
                        data: {
                            installed: info.installed,
                            executablePath: info.executablePath,
                            version: info.version,
                            installPath,
                            isInstalling: isInstallingChrome(),
                            progress: getInstallProgress(),
                            platform: process.platform,
                            arch: process.arch,
                            linuxDistro: distro,
                            windowsVersion: windowsVersionName || undefined,
                            defaultVersion: DEFAULT_CHROME_VERSION,
                            canInstall,
                            cannotInstallReason: cannotInstallReason || undefined,
                            installedBrowsers: installedBrowsers.map(b => ({
                                type: b.type,
                                executablePath: b.executablePath,
                                version: b.version,
                                source: b.source,
                                channel: b.channel,
                            })),
                        }
                    });
                } catch (e) {
                    res.status(500).json({ code: -1, message: String(e) });
                }
            });

            // 获取安装进度（无认证）
            router.getNoAuth('/chrome/progress', (_req: any, res: any) => {
                pluginState.logDebug('API 请求: GET /chrome/progress (NoAuth)');
                res.json({
                    code: 0,
                    data: {
                        isInstalling: isInstallingChrome(),
                        progress: getInstallProgress(),
                    }
                });
            });

            // 安装 Chrome（需认证）
            router.post('/chrome/install', async (req: any, res: any) => {
                pluginState.logDebug('API 请求: POST /chrome/install');
                try {
                    if (isInstallingChrome()) {
                        return res.status(400).json({ code: -1, message: '已有安装任务正在进行中' });
                    }

                    const body = await parseRequestBody(req);
                    const version = body.version || DEFAULT_CHROME_VERSION;
                    const installDeps = body.installDeps !== false;
                    const source = body.source || 'NPMMIRROR';

                    // 异步执行安装，立即返回
                    res.json({ code: 0, message: '安装任务已启动，请通过 /chrome/progress 查询进度' });

                    // 后台执行安装
                    installChrome({
                        version,
                        source,
                        installDeps,
                        onProgress: (progress) => {
                            pluginState.logDebug('Chrome 安装进度:', JSON.stringify(progress));
                        },
                    }).then(async (result) => {
                        if (result.success && result.executablePath) {
                            pluginState.log('info', `Chrome 安装成功: ${result.executablePath}`);
                            // 自动更新配置中的浏览器路径
                            const currentConfig = pluginState.getConfig();
                            if (!currentConfig.browser.executablePath) {
                                pluginState.setConfig(ctx, {
                                    browser: {
                                        ...currentConfig.browser,
                                        executablePath: result.executablePath,
                                    }
                                });
                                pluginState.log('info', '已自动更新浏览器路径配置');
                            }
                            // 自动启动浏览器
                            try {
                                await initBrowser();
                                pluginState.log('info', 'Chrome 安装后自动启动浏览器成功');
                            } catch (startErr) {
                                pluginState.log('warn', 'Chrome 安装后自动启动浏览器失败:', startErr);
                            }
                        } else {
                            pluginState.log('error', `Chrome 安装失败: ${result.error}`);
                        }
                    });

                } catch (e) {
                    res.status(500).json({ code: -1, message: String(e) });
                }
            });

            // 仅安装依赖（需认证）
            router.post('/chrome/install-deps', async (_req: any, res: any) => {
                pluginState.logDebug('API 请求: POST /chrome/install-deps');
                try {
                    if (process.platform !== 'linux') {
                        return res.json({ code: 0, message: '非 Linux 系统，无需安装依赖' });
                    }

                    res.json({ code: 0, message: '依赖安装任务已启动' });

                    // 后台执行
                    installLinuxDependencies((progress) => {
                        pluginState.logDebug('依赖安装进度:', JSON.stringify(progress));
                    }).then((success) => {
                        if (success) {
                            pluginState.log('info', '系统依赖安装完成');
                        } else {
                            pluginState.log('error', '系统依赖安装失败');
                        }
                    });

                } catch (e) {
                    res.status(500).json({ code: -1, message: String(e) });
                }
            });

            // 注册仪表盘页面
            router.page({
                path: 'puppeteer-dashboard',
                title: 'Puppeteer 渲染服务',
                icon: '🎨',
                htmlFile: 'webui/index.html',
                description: '管理 Puppeteer 渲染服务'
            });

            // 输出路由注册信息
            pluginState.log('info', 'WebUI 路由已注册:');
            pluginState.log('info', `  - 无认证 API: /plugin/${ctx.pluginName}/api/`);
            pluginState.log('info', `  - 需认证 API: /api/Plugin/ext/${ctx.pluginName}/`);
            pluginState.log('info', `  - 扩展页面: /plugin/${ctx.pluginName}/page/puppeteer-dashboard`);

        } catch (e) {
            pluginState.log('warn', '注册 WebUI 路由失败', e);
        }

        pluginState.log('info', '插件初始化完成');
    } catch (error) {
        pluginState.log('error', '插件初始化失败:', error);
    }
};/**
 * 插件卸载函数
 */
const plugin_cleanup = async (ctx: NapCatPluginContext) => {
    try {
        await closeBrowser();
        pluginState.log('info', '插件已卸载');
    } catch (e) {
        pluginState.log('warn', '插件卸载时出错:', e);
    }
};

/** 获取当前配置 */
export const plugin_get_config = async (ctx: NapCatPluginContext) => {
    return pluginState.getConfig();
};

/** 设置配置（完整替换） */
export const plugin_set_config = async (ctx: NapCatPluginContext, config: any) => {
    pluginState.saveConfig(ctx, config);
    pluginState.log('info', '配置已通过 API 更新');
};

/**
 * 配置变更回调
 * 当 WebUI 中修改配置时触发
 */
export const plugin_on_config_change = async (
    ctx: NapCatPluginContext,
    ui: PluginConfigUIController,
    key: string,
    value: any,
    currentConfig?: Record<string, any>
) => {
    try {
        // 处理嵌套的 browser.xxx 配置
        if (key.startsWith('browser.')) {
            const browserKey = key.replace('browser.', '');
            const currentBrowser = pluginState.config.browser || {};
            pluginState.setConfig(ctx, {
                browser: { ...currentBrowser, [browserKey]: value }
            });
        } else {
            pluginState.setConfig(ctx, { [key]: value } as any);
        }
        pluginState.logDebug(`配置项 ${key} 已更新`);
    } catch (err) {
        pluginState.log('error', `更新配置项 ${key} 失败:`, err);
    }
};

// 导出服务函数，供其他插件直接调用
export {
    screenshot,
    renderHtml,
    screenshotUrl,
    initBrowser,
    closeBrowser,
    restartBrowser,
    getBrowserStatus,
};

export {
    plugin_init,
    plugin_cleanup
};
