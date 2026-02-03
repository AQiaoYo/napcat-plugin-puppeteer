import { useState, useEffect, useCallback, useRef } from 'react'
import { Globe, Image, Settings as SettingsIcon, AlertCircle } from 'lucide-react'
import { authFetch } from '../utils/api'
import { showToast } from '../hooks/useToast'
import type { PluginConfig } from '../types'

const defaultSettings = {
    maxPages: 10,
    lockTimeout: 30000,
    executablePath: '',
    browserWSEndpoint: '',
    browserArgs: '',
    headless: true,
    debug: false,
    autoStart: true,
    defaultWidth: 1280,
    defaultHeight: 800,
    defaultScale: 2,
}

export default function SettingsPage() {
    const [config, setConfig] = useState({
        maxPages: defaultSettings.maxPages,
        lockTimeout: defaultSettings.lockTimeout,
        executablePath: '',
        browserWSEndpoint: '',
        browserArgs: '',
        headless: true,
        defaultWidth: defaultSettings.defaultWidth,
        defaultHeight: defaultSettings.defaultHeight,
        defaultScale: defaultSettings.defaultScale,
        debug: false,
        autoStart: true,
    })

    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const loadSettings = useCallback(async () => {
        try {
            const data = await authFetch<PluginConfig>('/config')
            if (data.code === 0 && data.data) {
                const cfg = data.data
                setConfig({
                    maxPages: cfg.browser?.maxPages || defaultSettings.maxPages,
                    lockTimeout: cfg.browser?.timeout || defaultSettings.lockTimeout,
                    executablePath: cfg.browser?.executablePath || '',
                    browserWSEndpoint: cfg.browser?.browserWSEndpoint || '',
                    browserArgs: (cfg.browser?.args || []).join(','),
                    headless: cfg.browser?.headless !== false,
                    defaultWidth: cfg.browser?.defaultViewportWidth || defaultSettings.defaultWidth,
                    defaultHeight: cfg.browser?.defaultViewportHeight || defaultSettings.defaultHeight,
                    defaultScale: cfg.browser?.deviceScaleFactor || defaultSettings.defaultScale,
                    debug: cfg.debug || false,
                    autoStart: cfg.enabled !== false,
                })
            }
        } catch (e) {
            showToast('加载配置失败: ' + (e as Error).message, 'error')
        }
    }, [])

    useEffect(() => {
        loadSettings()
    }, [loadSettings])

    const saveSettings = useCallback(async (showSuccess = true) => {
        try {
            const configData = {
                enabled: config.autoStart,
                browser: {
                    maxPages: config.maxPages,
                    timeout: config.lockTimeout,
                    headless: config.headless,
                    executablePath: config.executablePath || undefined,
                    browserWSEndpoint: config.browserWSEndpoint || undefined,
                    args: config.browserArgs ? config.browserArgs.split(',').map(s => s.trim()).filter(Boolean) : undefined,
                    defaultViewportWidth: config.defaultWidth,
                    defaultViewportHeight: config.defaultHeight,
                    deviceScaleFactor: config.defaultScale,
                },
                debug: config.debug,
            }

            await authFetch('/config', {
                method: 'POST',
                body: JSON.stringify(configData),
            })

            if (showSuccess) {
                showToast('配置已保存', 'success')
            }
        } catch (e) {
            showToast('保存失败: ' + (e as Error).message, 'error')
        }
    }, [config])

    const debounceSave = useCallback(() => {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
        saveTimerRef.current = setTimeout(() => saveSettings(false), 800)
    }, [saveSettings])

    const updateConfig = <K extends keyof typeof config>(key: K, value: typeof config[K]) => {
        setConfig(prev => ({ ...prev, [key]: value }))
    }

    // 监听配置变化，自动保存
    useEffect(() => {
        debounceSave()
    }, [config, debounceSave])

    const resetSettings = async () => {
        showToast('正在恢复默认配置...', 'info')
        setConfig({
            maxPages: defaultSettings.maxPages,
            lockTimeout: defaultSettings.lockTimeout,
            executablePath: '',
            browserWSEndpoint: '',
            browserArgs: '',
            headless: defaultSettings.headless,
            defaultWidth: defaultSettings.defaultWidth,
            defaultHeight: defaultSettings.defaultHeight,
            defaultScale: defaultSettings.defaultScale,
            debug: defaultSettings.debug,
            autoStart: defaultSettings.autoStart,
        })
        showToast('已恢复默认配置', 'success')
    }

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            {/* Notice */}
            <div className="glass-card p-4 bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800">
                <div className="flex gap-3">
                    <AlertCircle size={20} className="text-amber-500 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-amber-800 dark:text-amber-200">
                        <p className="font-medium mb-1">注意事项</p>
                        <ul className="list-disc list-inside text-xs space-y-1 text-amber-700 dark:text-amber-300">
                            <li>修改浏览器配置后需要重启浏览器才能生效</li>
                            <li>最大页面数设置过高可能导致内存占用过大</li>
                            <li>自定义浏览器路径需确保路径正确且有执行权限</li>
                        </ul>
                    </div>
                </div>
            </div>

            {/* Browser Config */}
            <div className="glass-card p-6">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center text-blue-500">
                        <Globe size={20} />
                    </div>
                    <div>
                        <h3 className="font-bold text-lg">浏览器配置</h3>
                        <p className="text-sm text-gray-500">Puppeteer 浏览器实例设置</p>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-semibold text-gray-500 uppercase mb-2 block">最大页面数</label>
                            <input
                                type="number"
                                value={config.maxPages}
                                onChange={(e) => updateConfig('maxPages', parseInt(e.target.value) || 10)}
                                className="input-field"
                                placeholder="10"
                                min={1}
                                max={50}
                            />
                            <p className="text-xs text-gray-400 mt-1">同时打开的最大页面数量</p>
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-gray-500 uppercase mb-2 block">锁定超时 (ms)</label>
                            <input
                                type="number"
                                value={config.lockTimeout}
                                onChange={(e) => updateConfig('lockTimeout', parseInt(e.target.value) || 30000)}
                                className="input-field"
                                placeholder="30000"
                                min={1000}
                                step={1000}
                            />
                            <p className="text-xs text-gray-400 mt-1">页面锁定等待超时时间</p>
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase mb-2 block">浏览器路径 (可选)</label>
                        <input
                            type="text"
                            value={config.executablePath}
                            onChange={(e) => updateConfig('executablePath', e.target.value)}
                            className="input-field font-mono text-sm"
                            placeholder="留空自动检测系统 Chrome/Edge"
                        />
                        <p className="text-xs text-gray-400 mt-1">自定义 Chrome/Chromium 可执行文件路径</p>
                    </div>

                    <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase mb-2 block">
                            <span className="flex items-center gap-2">
                                远程浏览器地址 (Docker)
                                <span className="px-2 py-0.5 text-[10px] bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 rounded-full">推荐</span>
                            </span>
                        </label>
                        <input
                            type="text"
                            value={config.browserWSEndpoint}
                            onChange={(e) => updateConfig('browserWSEndpoint', e.target.value)}
                            className="input-field font-mono text-sm"
                            placeholder="ws://chrome:3000 或 ws://localhost:9222/devtools/browser/..."
                        />
                        <p className="text-xs text-gray-400 mt-1">
                            连接远程浏览器的 WebSocket 地址。设置后将忽略本地浏览器路径。
                        </p>
                    </div>

                    <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase mb-2 block">启动参数</label>
                        <input
                            type="text"
                            value={config.browserArgs}
                            onChange={(e) => updateConfig('browserArgs', e.target.value)}
                            className="input-field font-mono text-sm"
                            placeholder="--no-sandbox,--disable-setuid-sandbox"
                        />
                        <p className="text-xs text-gray-400 mt-1">浏览器启动参数，多个参数用逗号分隔</p>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-[#202124] rounded-lg">
                        <div>
                            <div className="font-medium">无头模式</div>
                            <div className="text-sm text-gray-500">隐藏浏览器窗口运行</div>
                        </div>
                        <label className="toggle-switch">
                            <input
                                type="checkbox"
                                checked={config.headless}
                                onChange={(e) => updateConfig('headless', e.target.checked)}
                            />
                            <div className="slider"></div>
                        </label>
                    </div>
                </div>
            </div>

            {/* Render Defaults */}
            <div className="glass-card p-6">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center text-green-500">
                        <Image size={20} />
                    </div>
                    <div>
                        <h3 className="font-bold text-lg">渲染默认值</h3>
                        <p className="text-sm text-gray-500">截图渲染的默认参数</p>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="text-xs font-semibold text-gray-500 uppercase mb-2 block">默认宽度</label>
                            <input
                                type="number"
                                value={config.defaultWidth}
                                onChange={(e) => updateConfig('defaultWidth', parseInt(e.target.value) || 1280)}
                                className="input-field"
                                placeholder="1280"
                                min={100}
                            />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-gray-500 uppercase mb-2 block">默认高度</label>
                            <input
                                type="number"
                                value={config.defaultHeight}
                                onChange={(e) => updateConfig('defaultHeight', parseInt(e.target.value) || 800)}
                                className="input-field"
                                placeholder="800"
                                min={100}
                            />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-gray-500 uppercase mb-2 block">设备缩放</label>
                            <input
                                type="number"
                                value={config.defaultScale}
                                onChange={(e) => updateConfig('defaultScale', parseFloat(e.target.value) || 2)}
                                className="input-field"
                                placeholder="2"
                                min={0.5}
                                max={4}
                                step={0.5}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Other Settings */}
            <div className="glass-card p-6">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center text-purple-500">
                        <SettingsIcon size={20} />
                    </div>
                    <div>
                        <h3 className="font-bold text-lg">其他设置</h3>
                        <p className="text-sm text-gray-500">调试与高级选项</p>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-[#202124] rounded-lg">
                        <div>
                            <div className="font-medium">调试模式</div>
                            <div className="text-sm text-gray-500">启用后输出详细日志到控制台</div>
                        </div>
                        <label className="toggle-switch">
                            <input
                                type="checkbox"
                                checked={config.debug}
                                onChange={(e) => updateConfig('debug', e.target.checked)}
                            />
                            <div className="slider"></div>
                        </label>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-[#202124] rounded-lg">
                        <div>
                            <div className="font-medium">自动启动浏览器</div>
                            <div className="text-sm text-gray-500">插件加载时自动启动浏览器实例</div>
                        </div>
                        <label className="toggle-switch">
                            <input
                                type="checkbox"
                                checked={config.autoStart}
                                onChange={(e) => updateConfig('autoStart', e.target.checked)}
                            />
                            <div className="slider"></div>
                        </label>
                    </div>
                </div>
            </div>

            {/* Reset Button */}
            <div className="flex justify-end">
                <button onClick={resetSettings} className="btn bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200">
                    恢复默认设置
                </button>
            </div>
        </div>
    )
}
