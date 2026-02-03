import type { PageId } from '../App'
import type { PluginStatus } from '../types'
import { RefreshCw, Trash2, Save } from 'lucide-react'

interface HeaderProps {
    title: string
    description: string
    isScrolled: boolean
    status: PluginStatus | null
    currentPage: PageId
    onReloadSettings?: () => void
    onResetSettings?: () => void
}

export default function Header({
    title,
    description,
    isScrolled,
    status,
    currentPage,
    onReloadSettings,
    onResetSettings
}: HeaderProps) {
    const isConnected = status?.browser?.connected ?? false

    return (
        <header
            className={`
        sticky top-0 z-20 flex justify-between items-center px-4 py-4 md:px-8 md:py-6 
        bg-gray-50 dark:bg-[#18191C] transition-all duration-300
        ${isScrolled ? 'shadow-lg border-b border-gray-200 dark:border-gray-800' : 'border-b border-transparent'}
      `}
        >
            <div>
                <h2 className="text-2xl font-bold">{title}</h2>
                <p className="text-gray-500 text-sm mt-1">{description}</p>
            </div>

            {/* 设置页面专用操作栏 */}
            {currentPage === 'settings' ? (
                <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                        <Save size={14} />
                        自动保存
                    </span>
                    {onReloadSettings && (
                        <button
                            onClick={onReloadSettings}
                            className="btn text-sm py-1.5 px-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200"
                        >
                            <RefreshCw size={16} />
                            重新加载
                        </button>
                    )}
                    {onResetSettings && (
                        <button
                            onClick={onResetSettings}
                            className="btn text-sm py-1.5 px-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200"
                        >
                            <Trash2 size={16} />
                            恢复默认
                        </button>
                    )}
                </div>
            ) : currentPage !== 'chrome' ? (
                /* 默认状态指示器 */
                <div className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-[#202124] rounded-full shadow-sm border border-gray-100 dark:border-gray-800">
                    <div className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`}></div>
                    <span className="text-sm font-medium">
                        {status ? (isConnected ? '服务正常' : '服务断开') : '连接检查中...'}
                    </span>
                </div>
            ) : null}
        </header>
    )
}
