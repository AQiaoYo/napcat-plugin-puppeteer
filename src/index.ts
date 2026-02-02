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
            const base = (ctx as any).router;

            // 静态资源目录
            if (base && base.static) base.static('/static', 'webui');

            if (base && base.get) {
                // 插件信息脚本（用于前端获取插件名）
                base.get('/static/plugin-info.js', (_req: any, res: any) => {
                    try {
                        res.type('application/javascript');
                        res.send(`window.__PLUGIN_NAME__ = ${JSON.stringify(ctx.pluginName)};`);
                    } catch (e) {
                        res.status(500).send('// failed to generate plugin-info');
                    }
                });

                // ==================== 状态接口 ====================

                // 插件信息
                base.get('/info', (_req: any, res: any) => {
                    res.json({ code: 0, data: { pluginName: ctx.pluginName, version: '1.0.0' } });
                });

                // 插件状态
                base.get('/status', async (_req: any, res: any) => {
                    pluginState.logDebug('API 请求: GET /status');
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

                // 浏览器状态
                base.get('/browser/status', async (_req: any, res: any) => {
                    pluginState.logDebug('API 请求: GET /browser/status');
                    try {
                        const status = await getBrowserStatus();
                        res.json({ code: 0, data: status });
                    } catch (e) {
                        res.status(500).json({ code: -1, message: String(e) });
                    }
                });

                // ==================== 配置接口 ====================

                // 获取配置
                base.get('/config', (_req: any, res: any) => {
                    pluginState.logDebug('API 请求: GET /config');
                    res.json({ code: 0, data: pluginState.getConfig() });
                });

                // 保存配置
                base.post && base.post('/config', async (req: any, res: any) => {
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

                // ==================== 浏览器控制接口 ====================

                // 启动浏览器
                base.post && base.post('/browser/start', async (req: any, res: any) => {
                    pluginState.logDebug('API 请求: POST /browser/start');
                    if (!checkAuth(req, res)) return;
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

                // 关闭浏览器
                base.post && base.post('/browser/stop', async (req: any, res: any) => {
                    pluginState.logDebug('API 请求: POST /browser/stop');
                    if (!checkAuth(req, res)) return;
                    try {
                        await closeBrowser();
                        res.json({ code: 0, message: '浏览器已关闭' });
                    } catch (e) {
                        res.status(500).json({ code: -1, message: String(e) });
                    }
                });

                // 重启浏览器
                base.post && base.post('/browser/restart', async (req: any, res: any) => {
                    pluginState.logDebug('API 请求: POST /browser/restart');
                    if (!checkAuth(req, res)) return;
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

                // ==================== 渲染接口 ====================

                // 截图接口 (GET) - 简单 URL 截图
                base.get('/screenshot', async (req: any, res: any) => {
                    const url = req.query?.url as string;
                    pluginState.logDebug('API 请求: GET /screenshot', { url, query: req.query });
                    if (!checkAuth(req, res)) return;

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

                // 截图接口 (POST) - 完整参数
                base.post && base.post('/screenshot', async (req: any, res: any) => {
                    pluginState.logDebug('API 请求: POST /screenshot');
                    if (!checkAuth(req, res)) return;

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

                // 渲染 HTML 接口 (POST)
                base.post && base.post('/render', async (req: any, res: any) => {
                    pluginState.logDebug('API 请求: POST /render');
                    if (!checkAuth(req, res)) return;

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

                // 注册仪表盘页面
                if (base.page) {
                    base.page({
                        path: 'puppeteer-dashboard',
                        title: 'Puppeteer 渲染服务',
                        icon: '🎨',
                        htmlFile: 'webui/dashboard.html',
                        description: '管理 Puppeteer 渲染服务'
                    });
                }
            }
        } catch (e) {
            pluginState.log('warn', '注册 WebUI 路由失败', e);
        }

        pluginState.log('info', '插件初始化完成');
    } catch (error) {
        pluginState.log('error', '插件初始化失败:', error);
    }
};

/**
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
