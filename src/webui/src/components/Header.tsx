import type { PageId } from '../App'
import type { PluginStatus } from '../types'
import { Save } from 'lucide-react'

interface HeaderProps {
    title: string
    description: string
    isScrolled: boolean
    status: PluginStatus | null
    currentPage: PageId
}

export default function Header({
    title,
    description,
    isScrolled,
    status,
    currentPage,
}: HeaderProps) {
    const isConnected = status?.browser?.connected ?? false

    return (
        <header
            className={`
        sticky top-0 z-20 flex justify-between items-center px-4 py-4 md:px-8 md:py-6 
        bg-gray-50 dark:bg-[#0c0c0e] transition-all duration-300
        ${isScrolled ? 'border-b border-gray-200 dark:border-gray-800' : 'border-b border-transparent'}
      `}
        >
            <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{title}</h2>
                <p className="text-gray-500 text-sm mt-0.5">{description}</p>
            </div>

            {/* 设置页面专用操作栏 */}
            {currentPage === 'settings' ? (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-[#1a1b1d] rounded-md border border-gray-200 dark:border-gray-800">
                    <Save size={14} className="text-green-600 dark:text-green-500" />
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        自动保存
                    </span>
                </div>
            ) : (
                /* 默认状态指示器 */
                <div className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-[#1a1b1d] rounded-md border border-gray-200 dark:border-gray-800">
                    <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        {status ? (isConnected ? '服务正常' : '服务断开') : '连接检查中...'}
                    </span>
                </div>
            )}
        </header>
    )
}
