import { useState, useEffect, useCallback, useRef } from 'react'
import { Globe, Image, Settings as SettingsIcon, AlertCircle, Download, Check, Info, Monitor, Server } from 'lucide-react'
import { authFetch, noAuthFetch } from '../utils/api'
import { showToast } from '../hooks/useToast'
import type { PluginConfig, ChromeStatus, ChromeProgress } from '../types'

// 默认浏览器启动参数（与后端 DEFAULT_BROWSER_CONFIG.args 保持一致）
const defaultBrowserArgs = [
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
]

const defaultSettings = {
    maxPages: 10,
    lockTimeout: 30000,
    executablePath: '',
    browserWSEndpoint: '',
    browserArgs: defaultBrowserArgs.join(', '),
    headless: true,
    debug: false,
    autoStart: true,
    defaultWidth: 800,
    defaultHeight: 600,
    defaultScale: 1,
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

    const [status, setStatus] = useState<ChromeStatus | null>(null)
    const [version, setVersion] = useState('')
    const [source, setSource] = useState('NPMMIRROR')
    const [installDeps, setInstallDeps] = useState(true)
    const [progress, setProgress] = useState<ChromeProgress | null>(null)
    const [isInstalling, setIsInstalling] = useState(false)
    const [showResetConfirm, setShowResetConfirm] = useState(false)
    const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const resetConfirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const loadChromeStatus = useCallback(async () => {
        try {
            const data = await noAuthFetch<ChromeStatus>('/chrome/status')
            if (data.code === 0 && data.data) {
                setStatus(data.data)
                if (data.data.isInstalling && data.data.progress) {
                    setProgress(data.data.progress)
                    setIsInstalling(true)
                    startProgressPolling()
                }
            }
        } catch (e) {
            console.error('Failed to load Chrome status:', e)
        }
    }, [])

    const startProgressPolling = () => {
        if (progressTimerRef.current) return
        progressTimerRef.current = setInterval(async () => {
            try {
                const data = await noAuthFetch<{ isInstalling: boolean; progress: ChromeProgress }>('/chrome/progress')
                if (data.code === 0 && data.data) {
                    setProgress(data.data.progress)
                    if (!data.data.isInstalling) {
                        stopProgressPolling()
                        setIsInstalling(false)
                        // 安装完成后刷新 Chrome 状态和配置
                        loadChromeStatus()
                        loadSettings()
                        if (data.data.progress?.status === 'completed') {
                            showToast('Chrome 安装完成，浏览器已自动启动', 'success')
                        }
                    }
                }
            } catch (e) {
                console.error('Failed to fetch progress:', e)
            }
        }, 1000)
    }

    const stopProgressPolling = () => {
        if (progressTimerRef.current) {
            clearInterval(progressTimerRef.current)
            progressTimerRef.current = null
        }
    }

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
        loadChromeStatus()
    }, [loadSettings, loadChromeStatus])

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

    const handleResetClick = () => {
        if (showResetConfirm) {
            // 确认重置
            doResetSettings()
        } else {
            // 显示确认状态
            setShowResetConfirm(true)
            // 5秒后自动取消确认状态
            if (resetConfirmTimerRef.current) {
                clearTimeout(resetConfirmTimerRef.current)
            }
            resetConfirmTimerRef.current = setTimeout(() => {
                setShowResetConfirm(false)
            }, 5000)
        }
    }

    const cancelReset = () => {
        setShowResetConfirm(false)
        if (resetConfirmTimerRef.current) {
            clearTimeout(resetConfirmTimerRef.current)
        }
    }

    const doResetSettings = async () => {
        setShowResetConfirm(false)
        if (resetConfirmTimerRef.current) {
            clearTimeout(resetConfirmTimerRef.current)
        }
        showToast('正在恢复默认配置...', 'info')

        // 设置本地状态为默认值
        const newConfig = {
            maxPages: defaultSettings.maxPages,
            lockTimeout: defaultSettings.lockTimeout,
            executablePath: defaultSettings.executablePath,
            browserWSEndpoint: defaultSettings.browserWSEndpoint,
            browserArgs: defaultSettings.browserArgs,
            headless: defaultSettings.headless,
            defaultWidth: defaultSettings.defaultWidth,
            defaultHeight: defaultSettings.defaultHeight,
            defaultScale: defaultSettings.defaultScale,
            debug: defaultSettings.debug,
            autoStart: defaultSettings.autoStart,
        }
        setConfig(newConfig)

        // 保存到后端
        try {
            const configData = {
                enabled: newConfig.autoStart,
                browser: {
                    maxPages: newConfig.maxPages,
                    timeout: newConfig.lockTimeout,
                    headless: newConfig.headless,
                    executablePath: newConfig.executablePath || undefined,
                    browserWSEndpoint: newConfig.browserWSEndpoint || undefined,
                    args: newConfig.browserArgs ? newConfig.browserArgs.split(',').map(s => s.trim()).filter(Boolean) : [],
                    defaultViewportWidth: newConfig.defaultWidth,
                    defaultViewportHeight: newConfig.defaultHeight,
                    deviceScaleFactor: newConfig.defaultScale,
                },
                debug: newConfig.debug,
            }
            await authFetch('/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(configData),
            })
            showToast('已恢复默认配置', 'success')
        } catch (e) {
            showToast('恢复默认配置失败: ' + (e as Error).message, 'error')
        }
    }

    const installChrome = async () => {
        try {
            showToast('正在启动安装...', 'info')
            setProgress({ status: 'downloading', progress: 0, message: '准备中...' })
            setIsInstalling(true)

            const data = await authFetch('/chrome/install', {
                method: 'POST',
                body: JSON.stringify({
                    version: version || undefined,
                    source,
                    installDeps,
                }),
            })

            if (data.code === 0) {
                showToast('安装任务已启动', 'success')
                startProgressPolling()
            } else {
                showToast('启动安装失败: ' + data.message, 'error')
                setIsInstalling(false)
            }
        } catch (e) {
            showToast('启动安装失败: ' + (e as Error).message, 'error')
            setIsInstalling(false)
        }
    }

    const getProgressColor = () => {
        if (!progress) return 'bg-primary'
        if (progress.status === 'completed') return 'bg-green-500'
        if (progress.status === 'failed') return 'bg-red-500'
        return 'bg-primary'
    }

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            {/* Notice */}
            <div className="glass-card p-4 bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800">
                <div className="flex gap-3 items-start">
                    <AlertCircle size={20} className="text-amber-500 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 text-sm text-amber-800 dark:text-amber-200">
                        <p className="font-medium mb-1">注意事项</p>
                        <ul className="list-disc list-inside text-xs space-y-1 text-amber-700 dark:text-amber-300">
                            <li>修改浏览器配置后需要重启浏览器才能生效</li>
                            <li>最大页面数设置过高可能导致内存占用过大</li>
                            <li>自定义浏览器路径需确保路径正确且有执行权限</li>
                        </ul>
                    </div>
                    {showResetConfirm ? (
                        <div className="flex-shrink-0 flex items-center gap-2">
                            <span className="text-xs text-red-600 dark:text-red-400">确认重置?</span>
                            <button
                                onClick={doResetSettings}
                                className="text-xs px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white transition-colors"
                            >
                                确认
                            </button>
                            <button
                                onClick={cancelReset}
                                className="text-xs px-3 py-1.5 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 transition-colors"
                            >
                                取消
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={handleResetClick}
                            className="flex-shrink-0 text-xs px-3 py-1.5 rounded-lg bg-amber-100 dark:bg-amber-900/30 hover:bg-amber-200 dark:hover:bg-amber-800/40 text-amber-700 dark:text-amber-300 transition-colors"
                        >
                            恢复默认
                        </button>
                    )}
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

            {/* Chrome Setup - 根据平台显示不同内容 */}
            <div className="glass-card p-6">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center text-purple-500">
                        <Download size={20} />
                    </div>
                    <div>
                        <h3 className="font-bold text-lg">环境管理</h3>
                        <p className="text-sm text-gray-500">
                            {status?.platform === 'win32' ? 'Windows' : status?.platform === 'darwin' ? 'macOS' : 'Linux'}
                            {status?.arch ? ` (${status.arch})` : ''} 环境浏览器管理
                        </p>
                    </div>
                </div>

                {/* 已安装的浏览器列表 */}
                {status?.installedBrowsers && status.installedBrowsers.length > 0 && (
                    <div className="mb-4">
                        <label className="text-xs font-semibold text-gray-500 uppercase mb-2 block">
                            <Monitor size={14} className="inline mr-1" />
                            系统已安装的浏览器
                        </label>
                        <div className="space-y-2">
                            {status.installedBrowsers.map((browser, index) => (
                                <div
                                    key={index}
                                    className="p-3 bg-gray-50 dark:bg-[#202124] rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-between"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold ${browser.type === 'chrome' ? 'bg-blue-500' :
                                            browser.type === 'edge' ? 'bg-green-500' :
                                                browser.type === 'brave' ? 'bg-orange-500' :
                                                    'bg-gray-500'
                                            }`}>
                                            {browser.type === 'chrome' ? 'C' :
                                                browser.type === 'edge' ? 'E' :
                                                    browser.type === 'brave' ? 'B' : 'Cr'}
                                        </div>
                                        <div>
                                            <div className="font-medium text-sm capitalize">
                                                {browser.type}
                                                {browser.channel !== 'stable' && (
                                                    <span className="ml-2 px-1.5 py-0.5 text-[10px] bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400 rounded">
                                                        {browser.channel}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-xs text-gray-500 font-mono truncate max-w-[300px]" title={browser.executablePath}>
                                                {browser.executablePath}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        {browser.version && (
                                            <div className="text-xs text-gray-500">{browser.version}</div>
                                        )}
                                        <button
                                            onClick={() => {
                                                updateConfig('executablePath', browser.executablePath)
                                                showToast('已选择浏览器路径', 'success')
                                            }}
                                            className="text-xs text-primary hover:underline mt-1"
                                        >
                                            使用此浏览器
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* 环境提示 */}
                <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/10 rounded-lg border border-blue-200 dark:border-blue-800">
                    <div className="flex gap-2 text-sm text-blue-700 dark:text-blue-300">
                        <Info size={16} className="flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="font-medium">环境说明</p>
                            <p className="text-xs mt-1 text-blue-600 dark:text-blue-400">
                                {status?.canInstall ? (
                                    <>
                                        检测到 {status?.platform === 'win32' ? 'Windows' : status?.platform === 'darwin' ? 'macOS' : 'Linux'}
                                        {status?.linuxDistro ? ` (${status.linuxDistro})` : ''} 环境，
                                        支持自动下载安装 Chrome for Testing。
                                        如果您使用远程浏览器或已配置本地 Chrome 路径，无需使用此功能。
                                    </>
                                ) : (
                                    <>
                                        {status?.cannotInstallReason || '当前平台不支持自动安装 Chrome'}。
                                        建议使用远程浏览器连接或手动安装 Chrome/Chromium。
                                    </>
                                )}
                            </p>
                        </div>
                    </div>
                </div>

                {/* 远程浏览器推荐 - 当不支持本地安装时显示 */}
                {!status?.canInstall && (
                    <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/10 rounded-lg border border-green-200 dark:border-green-800">
                        <div className="flex gap-3">
                            <Server size={20} className="text-green-500 flex-shrink-0 mt-0.5" />
                            <div>
                                <p className="font-medium text-green-700 dark:text-green-300">推荐：使用远程浏览器</p>
                                <p className="text-xs mt-1 text-green-600 dark:text-green-400">
                                    您可以使用 Docker 运行一个独立的 Chrome 容器，然后通过 WebSocket 连接：
                                </p>
                                <div className="mt-2 p-2 bg-gray-900 rounded text-xs font-mono text-green-400 overflow-x-auto">
                                    docker run -d --name chrome -p 3000:3000 browserless/chrome
                                </div>
                                <p className="text-xs mt-2 text-green-600 dark:text-green-400">
                                    然后在上方「远程浏览器地址」填入：<code className="px-1 py-0.5 bg-green-100 dark:bg-green-900/30 rounded">ws://localhost:3000</code>
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Chrome 安装选项 - 仅在支持安装时显示 */}
                {status?.canInstall && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-semibold text-gray-500 uppercase mb-2 block">Chrome 版本</label>
                                <input
                                    type="text"
                                    value={version}
                                    onChange={(e) => setVersion(e.target.value)}
                                    className="input-field font-mono text-sm"
                                    placeholder={status?.defaultVersion || '131.0.6778.204'}
                                />
                                <p className="text-xs text-gray-400 mt-1">留空使用推荐版本</p>
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-gray-500 uppercase mb-2 block">下载源</label>
                                <select
                                    value={source}
                                    onChange={(e) => setSource(e.target.value)}
                                    className="input-field"
                                >
                                    <option value="NPMMIRROR">NPM 镜像 (国内推荐)</option>
                                    <option value="GOOGLE">Google 官方源</option>
                                </select>
                            </div>
                        </div>

                        {/* 安装依赖选项 - 仅 Linux 显示 */}
                        {status?.platform === 'linux' && (
                            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-[#202124] rounded-lg">
                                <div>
                                    <div className="font-medium">安装系统依赖</div>
                                    <div className="text-sm text-gray-500">自动安装 Chrome 运行所需的系统库</div>
                                </div>
                                <label className="toggle-switch">
                                    <input
                                        type="checkbox"
                                        checked={installDeps}
                                        onChange={(e) => setInstallDeps(e.target.checked)}
                                    />
                                    <div className="slider"></div>
                                </label>
                            </div>
                        )}

                        {/* Progress Bar */}
                        {(isInstalling || progress) && progress?.status !== 'idle' && (
                            <div>
                                <div className="mb-2 flex justify-between text-sm">
                                    <span className="text-gray-600 dark:text-gray-400">{progress?.message || '处理中...'}</span>
                                    <span className="font-mono text-primary">{Math.round(progress?.progress || 0)}%</span>
                                </div>
                                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                                    <div
                                        className={`h-3 rounded-full transition-all duration-300 ${getProgressColor()}`}
                                        style={{ width: `${progress?.progress || 0}%` }}
                                    ></div>
                                </div>
                                {progress?.downloadedBytes && progress?.totalBytes && (
                                    <div className="mt-2 text-xs text-gray-500 font-mono">
                                        {(progress.downloadedBytes / 1024 / 1024).toFixed(2)} MB / {(progress.totalBytes / 1024 / 1024).toFixed(2)} MB
                                        {progress.speed && ` | ${progress.speed}`}
                                        {progress.eta && ` | 剩余 ${progress.eta}`}
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="flex gap-3 pt-2">
                            {status?.installed ? (
                                <div className="flex-1 p-3 bg-green-50 dark:bg-green-900/10 rounded-lg border border-green-200 dark:border-green-800 text-center text-sm text-green-700 dark:text-green-300 flex items-center justify-center gap-2">
                                    <Check size={16} />
                                    Chrome 已安装 ({status.version})
                                </div>
                            ) : (
                                <button
                                    onClick={installChrome}
                                    disabled={isInstalling}
                                    className="btn btn-primary flex-1 disabled:opacity-50"
                                >
                                    <Download size={18} />
                                    立即安装 Chrome
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>

        </div>
    )
}
