 import {useState, useEffect, useCallback, useRef} from 'react'
import {
    Globe,
    Image,
    Settings as SettingsIcon,
    AlertCircle,
    Download,
    Check,
    Info,
    Monitor,
    Server,
    Trash2,
    Lock
} from 'lucide-react'
import {authFetch, noAuthFetch} from '../utils/api'
import {showToast} from '../hooks/useToast'
import type {PluginConfig, ChromeStatus, ChromeProgress} from '../types'

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
    proxyServer: '',
    proxyUsername: '',
    proxyPassword: '',
    proxyBypassList: '',
}

function getInitialConfig() {
    return {
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
        proxyServer: '',
        proxyUsername: '',
        proxyPassword: '',
        proxyBypassList: '',
    }
}

function getResetConfig() {
    return {
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
        autoStart: defaultSettings.autoStart,
        proxyServer: '',
        proxyUsername: '',
        proxyPassword: '',
        proxyBypassList: '',
    }
}

export default function SettingsPage() {
    const [config, setConfig] = useState(getInitialConfig())

    const [status, setStatus] = useState<ChromeStatus | null>(null)
    const [version, setVersion] = useState('')
    const [source, setSource] = useState('NPMMIRROR')
    const [installDeps, setInstallDeps] = useState(true)
    const [progress, setProgress] = useState<ChromeProgress | null>(null)
    const [isInstalling, setIsInstalling] = useState(false)
    const [showResetConfirm, setShowResetConfirm] = useState(false)
    const [showUninstallConfirm, setShowUninstallConfirm] = useState(false)
    const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
                    proxyServer: cfg.browser?.proxy?.server || '',
                    proxyUsername: cfg.browser?.proxy?.username || '',
                    proxyPassword: cfg.browser?.proxy?.password || '',
                    proxyBypassList: cfg.browser?.proxy?.bypassList || '',
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
                    proxy: config.proxyServer ? {
                        server: config.proxyServer,
                        username: config.proxyUsername || undefined,
                        password: config.proxyPassword || undefined,
                        bypassList: config.proxyBypassList || undefined,
                    } : undefined,
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
        setConfig(prev => ({...prev, [key]: value}))
    }

    // 监听配置变化，自动保存
    useEffect(() => {
        debounceSave()
    }, [config, debounceSave])

    const handleResetClick = async () => {
        if (showResetConfirm) {
            // 第二次点击，执行重置
            setShowResetConfirm(false)
            showToast('正在恢复默认配置...', 'info')

            // 设置本地状态为默认值
            const newConfig = getResetConfig()
            setConfig(newConfig)

            try {
                // 保存到后端
                await authFetch('/config', {
                    method: 'POST',
                    body: JSON.stringify({
                        enabled: newConfig.autoStart,
                        debug: false,
                        browser: {
                            maxPages: newConfig.maxPages,
                            timeout: newConfig.lockTimeout,
                            executablePath: '',
                            browserWSEndpoint: '',
                            args: [],
                            headless: true,
                            defaultViewportWidth: newConfig.defaultWidth,
                            defaultViewportHeight: newConfig.defaultHeight,
                            deviceScaleFactor: newConfig.defaultScale,
                        },
                    }),
                })
                showToast('已恢复默认配置', 'success')
            } catch (e) {
                showToast('恢复默认配置失败: ' + (e as Error).message, 'error')
            }
        } else {
            // 第一次点击，显示确认状态
            setShowResetConfirm(true)
            // 3秒后自动取消确认状态
            setTimeout(() => setShowResetConfirm(false), 3000)
        }
    }

    const installChrome = async () => {
        try {
            showToast('正在启动安装...', 'info')
            setProgress({status: 'downloading', progress: 0, message: '准备中...'})
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

    const uninstallChrome = async () => {
        // 使用非模态确认方式，避免 window.confirm 被 iframe 拦截或样式问题
        if (showUninstallConfirm) {
            setShowUninstallConfirm(false)
            showToast('正在卸载 Chrome...', 'info')
            try {
                const data = await authFetch('/chrome/uninstall', {method: 'POST'})
                const success = data.code === 0
                showToast(data.message || (success ? '卸载成功' : '卸载失败'), success ? 'success' : 'error')
                // 卸载后刷新状态
                setTimeout(() => {
                    loadChromeStatus()
                }, 1000)
            } catch (e) {
                showToast('卸载失败: ' + (e as Error).message, 'error')
            }
        } else {
            setShowUninstallConfirm(true)
            // 3秒后自动取消确认状态
            setTimeout(() => setShowUninstallConfirm(false), 3000)
        }
    }

    const getProgressColor = () => {
        if (!progress) return 'bg-primary'
        if (progress.status === 'completed') return 'bg-green-500'
        if (progress.status === 'failed') return 'bg-red-500'
        return 'bg-primary'
    }

    return (
        <div className="max-w-4xl mx-auto space-y-6 pb-24">
            {/* Browser Settings */}
            <div className="bg-white dark:bg-[#1a1b1d] rounded-lg border border-gray-200 dark:border-gray-800 p-6">
                <div className="flex items-center gap-3 mb-6 border-b border-gray-100 dark:border-gray-800 pb-4">
                    <Globe size={20} className="text-gray-900 dark:text-gray-100"/>
                    <div>
                        <h3 className="font-bold text-base text-gray-900 dark:text-white">浏览器设置</h3>
                        <p className="text-xs text-gray-500 mt-0.5">Puppeteer 实例与连接配置</p>
                    </div>
                </div>

                <div className="space-y-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div>
                            <label
                                className="text-[10px] font-semibold text-gray-500 uppercase mb-1.5 block tracking-wider">最大页面数</label>
                            <input
                                type="number"
                                value={config.maxPages}
                                onChange={(e) => updateConfig('maxPages', parseInt(e.target.value) || 1)}
                                className="input-field"
                                placeholder="10"
                                min={1}
                                max={50}
                            />
                            <p className="text-[10px] text-gray-400 mt-1">
                                同时打开的页面上限，超过将排队等待
                            </p>
                        </div>
                        <div>
                            <label
                                className="text-[10px] font-semibold text-gray-500 uppercase mb-1.5 block tracking-wider">超时时间
                                (ms)</label>
                            <input
                                type="number"
                                value={config.lockTimeout}
                                onChange={(e) => updateConfig('lockTimeout', parseInt(e.target.value) || 5000)}
                                className="input-field"
                                placeholder="30000"
                                step={1000}
                            />
                            <p className="text-[10px] text-gray-400 mt-1">
                                截图任务最大执行时间
                            </p>
                        </div>
                    </div>

                    <div>
                        <label
                            className="text-[10px] font-semibold text-gray-500 uppercase mb-1.5 block tracking-wider">本地浏览器路径</label>
                        <input
                            type="text"
                            value={config.executablePath}
                            onChange={(e) => updateConfig('executablePath', e.target.value)}
                            className="input-field font-mono text-sm"
                            placeholder="C:\Program Files\Google\Chrome\Application\chrome.exe"
                        />
                        <p className="text-[10px] text-gray-400 mt-1">
                            留空则尝试自动查找或使用下载的 Chrome
                        </p>
                    </div>

                    <div>
                        <label
                            className="text-[10px] font-semibold text-gray-500 uppercase mb-1.5 block tracking-wider">远程浏览器地址
                            (WebSocket)</label>
                        <input
                            type="text"
                            value={config.browserWSEndpoint}
                            onChange={(e) => updateConfig('browserWSEndpoint', e.target.value)}
                            className="input-field font-mono text-sm"
                            placeholder="ws://chrome:3000 或 ws://localhost:9222/devtools/browser/..."
                        />
                        <p className="text-[10px] text-gray-400 mt-1">
                            连接远程浏览器的 WebSocket 地址。设置后将忽略本地浏览器路径。
                        </p>
                    </div>

                    <div>
                        <label
                            className="text-[10px] font-semibold text-gray-500 uppercase mb-1.5 block tracking-wider">启动参数</label>
                        <input
                            type="text"
                            value={config.browserArgs}
                            onChange={(e) => updateConfig('browserArgs', e.target.value)}
                            className="input-field font-mono text-sm"
                            placeholder="--no-sandbox,--disable-setuid-sandbox"
                        />
                        <p className="text-[10px] text-gray-400 mt-1">浏览器启动参数，多个参数用逗号分隔</p>
                    </div>

                    {/* Proxy Settings */}
                    <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-800">
                        <div className="flex items-center gap-2 mb-4">
                            <Lock size={14} className="text-gray-400"/>
                            <span
                                className="text-xs font-semibold text-gray-500 uppercase tracking-wider">代理服务器配置</span>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label
                                    className="text-[10px] font-semibold text-gray-500 uppercase mb-1.5 block tracking-wider">代理服务器地址</label>
                                <input
                                    type="text"
                                    value={config.proxyServer}
                                    onChange={(e) => updateConfig('proxyServer', e.target.value)}
                                    className="input-field font-mono text-sm"
                                    placeholder="http://127.0.0.1:7890 或 socks5://127.0.0.1:1080"
                                />
                                <p className="text-[10px] text-gray-400 mt-1">
                                    格式: protocol://host:port，例如 http://127.0.0.1:7890，socks5://127.0.0.1:1080
                                </p>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label
                                        className="text-[10px] font-semibold text-gray-500 uppercase mb-1.5 block tracking-wider">代理用户名</label>
                                    <input
                                        type="text"
                                        value={config.proxyUsername}
                                        onChange={(e) => updateConfig('proxyUsername', e.target.value)}
                                        className="input-field font-mono text-sm"
                                        placeholder="可选"
                                    />
                                </div>
                                <div>
                                    <label
                                        className="text-[10px] font-semibold text-gray-500 uppercase mb-1.5 block tracking-wider">代理密码</label>
                                    <input
                                        type="password"
                                        value={config.proxyPassword}
                                        onChange={(e) => updateConfig('proxyPassword', e.target.value)}
                                        className="input-field font-mono text-sm"
                                        placeholder="可选"
                                    />
                                </div>
                            </div>
                            <div>
                                <label
                                    className="text-[10px] font-semibold text-gray-500 uppercase mb-1.5 block tracking-wider">Bypass
                                    列表</label>
                                <input
                                    type="text"
                                    value={config.proxyBypassList}
                                    onChange={(e) => updateConfig('proxyBypassList', e.target.value)}
                                    className="input-field font-mono text-sm"
                                    placeholder="localhost,127.0.0.1,.local"
                                />
                                <p className="text-[10px] text-gray-400 mt-1">
                                    逗号分隔的域名列表，这些域名不走代理
                                </p>
                            </div>
                        </div>
                    </div>

                    <div
                        className="flex items-center justify-between p-3 bg-gray-50 dark:bg-[#202124] rounded-md border border-gray-100 dark:border-gray-800">
                        <div>
                            <div className="font-medium text-sm text-gray-900 dark:text-gray-200">无头模式</div>
                            <div className="text-xs text-gray-500">隐藏浏览器窗口运行</div>
                        </div>
                        <label className="toggle-switch scale-90 origin-right">
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
            <div className="bg-white dark:bg-[#1a1b1d] rounded-lg border border-gray-200 dark:border-gray-800 p-6">
                <div className="flex items-center gap-3 mb-6 border-b border-gray-100 dark:border-gray-800 pb-4">
                    <Image size={20} className="text-gray-900 dark:text-gray-100"/>
                    <div>
                        <h3 className="font-bold text-base text-gray-900 dark:text-white">渲染默认值</h3>
                        <p className="text-xs text-gray-500 mt-0.5">截图渲染的默认参数</p>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label
                                className="text-[10px] font-semibold text-gray-500 uppercase mb-1.5 block tracking-wider">默认宽度</label>
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
                            <label
                                className="text-[10px] font-semibold text-gray-500 uppercase mb-1.5 block tracking-wider">默认高度</label>
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
                            <label
                                className="text-[10px] font-semibold text-gray-500 uppercase mb-1.5 block tracking-wider">设备缩放</label>
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
            <div className="bg-white dark:bg-[#1a1b1d] rounded-lg border border-gray-200 dark:border-gray-800 p-6">
                <div className="flex items-center gap-3 mb-6 border-b border-gray-100 dark:border-gray-800 pb-4">
                    <SettingsIcon size={20} className="text-gray-900 dark:text-gray-100"/>
                    <div>
                        <h3 className="font-bold text-base text-gray-900 dark:text-white">其他设置</h3>
                        <p className="text-xs text-gray-500 mt-0.5">调试与高级选项</p>
                    </div>
                </div>

                <div className="space-y-3">
                    <div
                        className="flex items-center justify-between p-3 bg-gray-50 dark:bg-[#202124] rounded-md border border-gray-100 dark:border-gray-800">
                        <div>
                            <div className="font-medium text-sm text-gray-900 dark:text-gray-200">调试模式</div>
                            <div className="text-xs text-gray-500">启用后输出详细日志到控制台</div>
                        </div>
                        <label className="toggle-switch scale-90 origin-right">
                            <input
                                type="checkbox"
                                checked={config.debug}
                                onChange={(e) => updateConfig('debug', e.target.checked)}
                            />
                            <div className="slider"></div>
                        </label>
                    </div>

                    <div
                        className="flex items-center justify-between p-3 bg-gray-50 dark:bg-[#202124] rounded-md border border-gray-100 dark:border-gray-800">
                        <div>
                            <div className="font-medium text-sm text-gray-900 dark:text-gray-200">自动启动浏览器</div>
                            <div className="text-xs text-gray-500">插件加载时自动启动浏览器实例</div>
                        </div>
                        <label className="toggle-switch scale-90 origin-right">
                            <input
                                type="checkbox"
                                checked={config.autoStart}
                                onChange={(e) => updateConfig('autoStart', e.target.checked)}
                            />
                            <div className="slider"></div>
                        </label>
                    </div>

                    {/* 重置配置 */}
                    <div
                        className="flex items-center justify-between p-3 bg-gray-50 dark:bg-[#202124] rounded-md border border-gray-100 dark:border-gray-800">
                        <div>
                            <div className="font-medium text-sm text-gray-900 dark:text-gray-200">重置配置</div>
                            <div className="text-xs text-gray-500">恢复所有设置为默认值</div>
                        </div>
                        <button
                            onClick={handleResetClick}
                            className={`btn text-xs px-3 py-1.5 border shadow-none transition-all ${showResetConfirm
                                ? 'bg-red-600 hover:bg-red-700 text-white border-red-600 animate-pulse'
                                : 'bg-red-50 hover:bg-red-100 dark:bg-red-900/10 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 border-red-200 dark:border-red-900/30'
                            }`}
                            title="恢复所有设置为默认值"
                        >
                            <AlertCircle size={14} className="mr-1.5 inline"/>
                            {showResetConfirm ? '再次点击确认重置' : '重置配置'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Chrome Setup */}
            <div className="bg-white dark:bg-[#1a1b1d] rounded-lg border border-gray-200 dark:border-gray-800 p-6">
                <div
                    className="flex items-center justify-between mb-6 border-b border-gray-100 dark:border-gray-800 pb-4">
                    <div className="flex items-center gap-3">
                        <Download size={20} className="text-gray-900 dark:text-gray-100"/>
                        <div>
                            <h3 className="font-bold text-base text-gray-900 dark:text-white">环境管理</h3>
                            <p className="text-xs text-gray-500 mt-0.5">
                                {status?.platform === 'win32'
                                    ? (status?.windowsVersion || 'Windows')
                                    : status?.platform === 'darwin' ? 'macOS' : 'Linux'}
                                {status?.arch ? ` (${status.arch})` : ''} 环境浏览器管理
                            </p>
                        </div>
                    </div>

                    {status?.canInstall && (
                        <button
                            onClick={uninstallChrome}
                            className={`btn text-xs px-3 py-1.5 border shadow-none transition-all ${showUninstallConfirm
                                ? 'bg-red-600 hover:bg-red-700 text-white border-red-600 animate-pulse'
                                : 'bg-red-50 hover:bg-red-100 dark:bg-red-900/10 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 border-red-200 dark:border-red-900/30'
                            }`}
                            title="卸载内置 Chrome（如果浏览器损坏可尝试此操作）"
                        >
                            <Trash2 size={14} className="mr-1.5"/>
                            {showUninstallConfirm ? '再次点击确认卸载' : '卸载 Chrome'}
                        </button>
                    )}
                </div>

                {/* 已安装的浏览器列表 */}
                {status?.installedBrowsers && status.installedBrowsers.length > 0 && (
                    <div className="mb-4">
                        <label className="text-[10px] font-semibold text-gray-500 uppercase mb-2 block tracking-wider">
                            <Monitor size={12} className="inline mr-1 mb-0.5"/>
                            系统已安装的浏览器
                        </label>
                        <div className="space-y-2">
                            {status.installedBrowsers.map((browser, index) => (
                                <div
                                    key={index}
                                    className="p-3 bg-gray-50 dark:bg-[#202124] rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-between group hover:border-primary/50 transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <div
                                            className={`w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold shadow-sm ${browser.type === 'chrome' ? 'bg-[#4285F4]' :
                                                browser.type === 'edge' ? 'bg-[#0078D7]' :
                                                    browser.type === 'brave' ? 'bg-[#FF5500]' :
                                                        'bg-gray-500'
                                            }`}>
                                            {browser.type === 'chrome' ? 'C' :
                                                browser.type === 'edge' ? 'E' :
                                                    browser.type === 'brave' ? 'B' : 'Cr'}
                                        </div>
                                        <div>
                                            <div
                                                className="font-medium text-sm capitalize text-gray-900 dark:text-gray-200">
                                                {browser.type}
                                                {browser.channel !== 'stable' && (
                                                    <span
                                                        className="ml-2 px-1.5 py-0.5 text-[10px] bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300 rounded font-bold uppercase">
                                                        {browser.channel}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-xs text-gray-500 font-mono truncate max-w-[300px]"
                                                 title={browser.executablePath}>
                                                {browser.executablePath}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        {browser.version && (
                                            <div className="text-xs text-gray-500 mb-1">{browser.version}</div>
                                        )}
                                        <button
                                            onClick={() => {
                                                updateConfig('executablePath', browser.executablePath)
                                                showToast('已选择浏览器路径', 'success')
                                            }}
                                            className="text-xs font-medium text-primary hover:text-primary/80 opacity-0 group-hover:opacity-100 transition-opacity"
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
                <div className={`mb-4 p-3 rounded-md border ${status?.canInstall
                    ? 'bg-blue-50 dark:bg-blue-900/10 border-blue-100 dark:border-blue-900/20'
                    : 'bg-amber-50 dark:bg-amber-900/10 border-amber-100 dark:border-amber-900/20'}`}>
                    <div className={`flex gap-2 text-sm ${status?.canInstall
                        ? 'text-blue-700 dark:text-blue-300'
                        : 'text-amber-700 dark:text-amber-300'}`}>
                        <Info size={16} className="flex-shrink-0 mt-0.5"/>
                        <div>
                            <p className="font-bold text-xs uppercase tracking-wide mb-1">环境说明</p>
                            <p className={`text-xs leading-relaxed ${status?.canInstall
                                ? 'text-blue-600 dark:text-blue-400'
                                : 'text-amber-600 dark:text-amber-400'}`}>
                                {status?.canInstall ? (
                                    <>
                                        检测到 {status?.platform === 'win32'
                                        ? (status?.windowsVersion ? status.windowsVersion : 'Windows')
                                        : status?.platform === 'darwin' ? 'macOS' : 'Linux'}
                                        {status?.linuxDistro ? ` (${status.linuxDistro})` : ''} 环境，
                                        支持自动下载安装 Chrome for Testing。
                                        如果您使用远程浏览器或已配置本地 Chrome 路径，无需使用此功能。
                                    </>
                                ) : (
                                    <span className="whitespace-pre-wrap">
                                        {status?.cannotInstallReason || '当前平台不支持自动安装 Chrome。建议使用远程浏览器连接或手动安装 Chrome/Chromium。'}
                                    </span>
                                )}
                            </p>
                        </div>
                    </div>
                </div>

                {/* 远程浏览器推荐 */}
                {!status?.canInstall && (
                    <div
                        className="mb-4 p-4 bg-green-50 dark:bg-green-900/10 rounded-md border border-green-100 dark:border-green-900/20">
                        <div className="flex gap-3">
                            <Server size={18} className="text-green-600 dark:text-green-500 flex-shrink-0 mt-0.5"/>
                            <div>
                                <p className="font-bold text-xs uppercase tracking-wide mb-1 text-green-700 dark:text-green-300">推荐：使用远程浏览器</p>
                                <p className="text-xs mt-1 text-green-600 dark:text-green-400 leading-relaxed">
                                    您可以使用 Docker 运行一个独立的 Chrome 容器，然后通过 WebSocket 连接：
                                </p>
                                <div
                                    className="mt-2 p-2 bg-gray-900 rounded text-xs font-mono text-green-400 overflow-x-auto border border-gray-800">
                                    docker run -d --name chrome -p 3000:3000 browserless/chrome
                                </div>
                                <p className="text-xs mt-2 text-green-600 dark:text-green-400">
                                    然后在上方「远程浏览器地址」填入：<code
                                    className="px-1 py-0.5 bg-green-100 dark:bg-green-900/30 rounded font-bold">ws://localhost:3000</code>
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Chrome 安装选项 */}
                {status?.canInstall && (
                    <div className="space-y-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label
                                    className="text-[10px] font-semibold text-gray-500 uppercase mb-1.5 block tracking-wider">Chrome
                                    版本</label>
                                <input
                                    type="text"
                                    value={version}
                                    onChange={(e) => setVersion(e.target.value)}
                                    className="input-field font-mono text-sm"
                                    placeholder={status?.defaultVersion || '131.0.6778.204'}
                                />
                            </div>
                            <div>
                                <label
                                    className="text-[10px] font-semibold text-gray-500 uppercase mb-1.5 block tracking-wider">下载源</label>
                                <select
                                    value={source}
                                    onChange={(e) => setSource(e.target.value)}
                                    className="input-field text-sm"
                                >
                                    <option value="NPMMIRROR">NPM 镜像 CDN (国内推荐)</option>
                                    <option value="NPMMIRROR_REGISTRY">淘宝源 Registry (备用)</option>
                                    <option value="GOOGLE">Google 官方源</option>
                                </select>
                                <div className="text-xs text-gray-400 mt-1">国内用户推荐使用 NPM 镜像源，下载速度更快
                                </div>
                            </div>
                        </div>

                        {status?.platform === 'linux' && (
                            <div
                                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-[#202124] rounded-md border border-gray-100 dark:border-gray-800">
                                <div>
                                    <div className="font-medium text-sm text-gray-900 dark:text-gray-200">安装系统依赖
                                    </div>
                                    <div className="text-xs text-gray-500">自动安装 Chrome 运行所需的系统库</div>
                                </div>
                                <label className="toggle-switch scale-90 origin-right">
                                    <input
                                        type="checkbox"
                                        checked={installDeps}
                                        onChange={(e) => setInstallDeps(e.target.checked)}
                                    />
                                    <div className="slider"></div>
                                </label>
                            </div>
                        )}

                        {(isInstalling || progress) && progress?.status !== 'idle' && (
                            <div
                                className="p-4 bg-gray-50 dark:bg-black/20 rounded-lg border border-gray-100 dark:border-gray-800">
                                <div className="mb-2 flex justify-between text-xs font-medium">
                                    <span
                                        className="text-gray-600 dark:text-gray-400">{progress?.message || '处理中...'}</span>
                                    <span
                                        className="font-mono text-primary">{Math.round(progress?.progress || 0)}%</span>
                                </div>
                                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                                    <div
                                        className={`h-2 rounded-full transition-all duration-300 ${getProgressColor()}`}
                                        style={{width: `${progress?.progress || 0}%`}}
                                    ></div>
                                </div>
                                {progress?.downloadedBytes && progress?.totalBytes && (
                                    <div className="mt-2 text-xs text-gray-500 font-mono">
                                        {(progress.downloadedBytes / 1024 / 1024).toFixed(2)} MB
                                        / {(progress.totalBytes / 1024 / 1024).toFixed(2)} MB
                                        {progress.speed && ` | ${progress.speed}`}
                                        {progress.eta && ` | 剩余 ${progress.eta}`}
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="flex gap-3 pt-2">
                            {status?.installed ? (
                                <div
                                    className="flex-1 p-3 bg-green-50 dark:bg-green-900/10 rounded-md border border-green-200 dark:border-green-800 text-center text-sm font-medium text-green-700 dark:text-green-300 flex items-center justify-center gap-2">
                                    <Check size={16}/>
                                    Chrome 已安装 ({status.version})
                                </div>
                            ) : (
                                <button
                                    onClick={installChrome}
                                    disabled={isInstalling}
                                    className="btn btn-primary flex-1 disabled:opacity-50 text-sm font-medium py-2.5 shadow-sm"
                                >
                                    <Download size={16}/>
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
