import { useState, useEffect, useCallback, useRef } from 'react'
import { Info, Chrome, Download, RefreshCw, Check, AlertCircle } from 'lucide-react'
import { noAuthFetch, authFetch } from '../utils/api'
import { showToast } from '../hooks/useToast'
import type { ChromeStatus, ChromeProgress } from '../types'

export default function ChromePage() {
    const [status, setStatus] = useState<ChromeStatus | null>(null)
    const [version, setVersion] = useState('')
    const [source, setSource] = useState('NPMMIRROR')
    const [installDeps, setInstallDeps] = useState(true)
    const [progress, setProgress] = useState<ChromeProgress | null>(null)
    const [isInstalling, setIsInstalling] = useState(false)
    const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

    const loadStatus = useCallback(async () => {
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

    useEffect(() => {
        loadStatus()
        return () => stopProgressPolling()
    }, [loadStatus])

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
                        loadStatus()
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
            {/* Environment Info */}
            <div className="glass-card p-6">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center text-blue-500">
                        <Info size={20} />
                    </div>
                    <div>
                        <h3 className="font-bold text-lg">系统环境</h3>
                        <p className="text-sm text-gray-500">当前运行环境信息</p>
                    </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4 text-sm">
                    <div className="flex justify-between p-3 bg-gray-50 dark:bg-[#202124] rounded-lg">
                        <span className="text-gray-500">操作系统</span>
                        <span className="font-medium">{status?.platform || '-'}</span>
                    </div>
                    <div className="flex justify-between p-3 bg-gray-50 dark:bg-[#202124] rounded-lg">
                        <span className="text-gray-500">系统架构</span>
                        <span className="font-medium">{status?.arch || '-'}</span>
                    </div>
                    <div className="flex justify-between p-3 bg-gray-50 dark:bg-[#202124] rounded-lg">
                        <span className="text-gray-500">Linux 发行版</span>
                        <span className="font-medium">{status?.linuxDistro || '-'}</span>
                    </div>
                    <div className="flex justify-between p-3 bg-gray-50 dark:bg-[#202124] rounded-lg">
                        <span className="text-gray-500">推荐版本</span>
                        <span className="font-medium font-mono text-xs">{status?.defaultVersion || '-'}</span>
                    </div>
                </div>
            </div>

            {/* Chrome Status */}
            <div className="glass-card p-6">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center text-green-500">
                        <Chrome size={20} />
                    </div>
                    <div className="flex-1">
                        <h3 className="font-bold text-lg">Chrome 状态</h3>
                        <p className="text-sm text-gray-500">本地 Chrome 浏览器安装状态</p>
                    </div>
                    <button
                        onClick={loadStatus}
                        className="btn text-sm py-1.5 px-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200"
                    >
                        <RefreshCw size={16} />
                        刷新
                    </button>
                </div>

                {status?.installed ? (
                    <div className="space-y-3">
                        <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/10 rounded-lg border border-green-200 dark:border-green-800">
                            <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center text-green-500">
                                <Check size={20} />
                            </div>
                            <div className="flex-1">
                                <div className="font-medium text-green-800 dark:text-green-200">Chrome 已安装</div>
                                <div className="text-sm text-green-600 dark:text-green-400">{status.version || '版本未知'}</div>
                            </div>
                        </div>
                        <div className="text-sm">
                            <div className="flex justify-between p-3 bg-gray-50 dark:bg-[#202124] rounded-lg">
                                <span className="text-gray-500">可执行文件</span>
                                <span className="font-mono text-xs truncate max-w-[300px]" title={status.executablePath}>
                                    {status.executablePath || '-'}
                                </span>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-900/10 rounded-lg border border-amber-200 dark:border-amber-800">
                        <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center text-amber-500">
                            <AlertCircle size={20} />
                        </div>
                        <div className="flex-1">
                            <div className="font-medium text-amber-800 dark:text-amber-200">Chrome 未安装</div>
                            <div className="text-sm text-amber-600 dark:text-amber-400">请点击下方按钮安装 Chrome</div>
                        </div>
                    </div>
                )}
            </div>

            {/* Install Options */}
            <div className="glass-card p-6">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center text-purple-500">
                        <Download size={20} />
                    </div>
                    <div>
                        <h3 className="font-bold text-lg">安装 Chrome</h3>
                        <p className="text-sm text-gray-500">下载并安装 Chrome for Testing</p>
                    </div>
                </div>

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

                    <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-[#202124] rounded-lg">
                        <div>
                            <div className="font-medium">安装系统依赖</div>
                            <div className="text-sm text-gray-500">自动安装 Chrome 运行所需的系统库（仅 Linux）</div>
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
                        <button
                            onClick={installChrome}
                            disabled={isInstalling || status?.installed}
                            className="btn btn-primary flex-1 disabled:opacity-50"
                        >
                            <Download size={18} />
                            {status?.installed ? 'Chrome 已安装' : '立即安装 Chrome'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Docker Notice */}
            <div className="glass-card p-4 bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800">
                <div className="flex gap-3">
                    <Info size={20} className="text-blue-500 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-blue-800 dark:text-blue-200">
                        <p className="font-medium mb-1">Docker 环境说明</p>
                        <ul className="list-disc list-inside text-xs space-y-1 text-blue-700 dark:text-blue-300">
                            <li>本功能专为 NapCat Docker 环境 (Ubuntu 22.04) 设计</li>
                            <li>安装过程会自动下载 Chrome for Testing 并配置系统依赖</li>
                            <li>安装完成后会自动更新浏览器路径配置</li>
                            <li>如果容器重启，可能需要重新安装（建议挂载数据卷持久化）</li>
                            <li>也可以使用远程浏览器（如 browserless/chrome）替代本地安装</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    )
}
