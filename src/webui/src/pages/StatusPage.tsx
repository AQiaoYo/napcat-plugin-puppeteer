import { Play, RotateCcw, Square, Shield } from 'lucide-react'
import type { PluginStatus } from '../types'
import { authFetch } from '../utils/api'
import { showToast } from '../hooks/useToast'

interface StatusPageProps {
    status: PluginStatus | null
    onRefresh: () => void
}

export default function StatusPage({ status, onRefresh }: StatusPageProps) {
    const browser = status?.browser

    const browserAction = async (action: string, name: string) => {
        showToast(`正在${name}浏览器...`, 'info')
        try {
            const data = await authFetch('/browser/' + action, { method: 'POST' })
            const success = data.code === 0
            showToast(data.message || (success ? `${name}成功` : `${name}失败`), success ? 'success' : 'error')
            setTimeout(onRefresh, 1000)
        } catch (e) {
            showToast(`${name}失败: ` + (e as Error).message, 'error')
        }
    }

    return (
        <div>
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div className="glass-card p-6">
                    <div className="text-gray-500 text-sm mb-2">总渲染次数</div>
                    <div className="text-3xl font-bold text-primary">{browser?.totalRenders || 0}</div>
                </div>
                <div className="glass-card p-6">
                    <div className="text-gray-500 text-sm mb-2">失败次数</div>
                    <div className="text-3xl font-bold text-red-500">{browser?.failedRenders || 0}</div>
                </div>
                <div className="glass-card p-6">
                    <div className="text-gray-500 text-sm mb-2">当前页面数</div>
                    <div className="text-3xl font-bold text-blue-500">{browser?.pageCount || 0}</div>
                </div>
                <div className="glass-card p-6">
                    <div className="text-gray-500 text-sm mb-2">运行时长</div>
                    <div className="text-xl font-bold text-green-500 truncate">{status?.uptimeFormatted || '-'}</div>
                </div>
            </div>

            {/* Browser Control */}
            <div className="glass-card p-6 mb-8">
                <h3 className="font-bold text-lg mb-4">浏览器控制</h3>
                <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center text-primary">
                            <Shield size={24} />
                        </div>
                        <div>
                            <div className="font-medium text-gray-900 dark:text-gray-100">实例管理</div>
                            <div className="text-sm text-gray-500">控制 Puppeteer 浏览器生命周期</div>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <button onClick={() => browserAction('start', '启动')} className="btn btn-primary">
                            <Play size={18} />
                            启动
                        </button>
                        <button
                            onClick={() => browserAction('restart', '重启')}
                            className="btn"
                            style={{ background: '#f59e0b', color: 'white' }}
                        >
                            <RotateCcw size={18} />
                            重启
                        </button>
                        <button onClick={() => browserAction('stop', '停止')} className="btn btn-danger">
                            <Square size={18} />
                            停止
                        </button>
                    </div>
                </div>
            </div>

            {/* System Info */}
            <div className="glass-card p-6">
                <h3 className="font-bold text-lg mb-4">系统信息</h3>
                <div className="grid md:grid-cols-2 gap-4 text-sm">
                    <div className="flex justify-between p-3 bg-gray-50 dark:bg-[#202124] rounded-lg">
                        <span className="text-gray-500">连接状态</span>
                        <span className={`font-medium ${browser?.connected ? 'text-green-500' : 'text-red-500'}`}>
                            {browser?.connected ? '✅ 已连接' : '❌ 未连接'}
                        </span>
                    </div>
                    <div className="flex justify-between p-3 bg-gray-50 dark:bg-[#202124] rounded-lg">
                        <span className="text-gray-500">连接模式</span>
                        <span className={`font-medium ${browser?.mode === 'remote' ? 'text-blue-500' : 'text-gray-500'}`}>
                            {browser?.mode === 'remote' ? '🌐 远程连接' : '💻 本地启动'}
                        </span>
                    </div>
                    <div className="flex justify-between p-3 bg-gray-50 dark:bg-[#202124] rounded-lg">
                        <span className="text-gray-500">浏览器版本</span>
                        <span className="font-medium">{browser?.version || '-'}</span>
                    </div>
                    <div className="flex justify-between p-3 bg-gray-50 dark:bg-[#202124] rounded-lg">
                        <span className="text-gray-500 flex-shrink-0 mr-4">浏览器地址</span>
                        <span
                            className="font-medium truncate font-mono text-xs"
                            title={browser?.mode === 'remote' ? browser?.browserWSEndpoint : browser?.executablePath}
                        >
                            {browser?.mode === 'remote' ? browser?.browserWSEndpoint : browser?.executablePath || '-'}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    )
}
