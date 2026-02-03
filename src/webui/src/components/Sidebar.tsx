import type { PageId } from '../App'
import {
    LayoutGrid,
    Zap,
    FileText,
    Settings,
    Chrome,
    Github
} from 'lucide-react'

interface SidebarProps {
    currentPage: PageId
    onPageChange: (page: PageId) => void
}

const menuItems: { id: PageId; label: string; icon: React.ReactNode }[] = [
    { id: 'status', label: '运行状态', icon: <LayoutGrid size={20} /> },
    { id: 'test', label: '渲染测试', icon: <Zap size={20} /> },
    { id: 'api', label: 'API 文档', icon: <FileText size={20} /> },
    { id: 'settings', label: '设置', icon: <Settings size={20} /> },
    { id: 'chrome', label: 'Chrome 安装', icon: <Chrome size={20} /> },
]

export default function Sidebar({ currentPage, onPageChange }: SidebarProps) {
    return (
        <aside className="w-64 flex-shrink-0 bg-white dark:bg-[#202124] border-r border-gray-200 dark:border-gray-800 flex flex-col z-10 transition-colors duration-300">
            {/* Logo */}
            <div className="p-6 flex items-center gap-3">
                <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg text-primary">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
                        <polyline points="2 17 12 22 22 17"></polyline>
                        <polyline points="2 12 12 17 22 12"></polyline>
                    </svg>
                </div>
                <div>
                    <h1 className="font-bold text-lg leading-tight">Puppeteer</h1>
                    <p className="text-xs text-gray-400">渲染服务</p>
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-4 py-2 overflow-y-auto">
                {menuItems.map((item) => (
                    <div
                        key={item.id}
                        className={`sidebar-item ${currentPage === item.id ? 'active' : ''}`}
                        onClick={() => onPageChange(item.id)}
                    >
                        {item.icon}
                        <span>{item.label}</span>
                    </div>
                ))}
            </nav>

            {/* Footer Links */}
            <div className="px-4 pb-2">
                <a
                    href="https://github.com/AQiaoYo/napcat-plugin-puppeteer/issues"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="sidebar-item no-underline"
                >
                    <Github size={20} />
                    <span>反馈问题</span>
                </a>
            </div>

            {/* Theme Indicator */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-800">
                <div className="flex items-center justify-center w-full p-2 rounded-lg text-gray-500 bg-gray-50 dark:bg-gray-800/50 cursor-default">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-70">
                        <circle cx="12" cy="12" r="5"></circle>
                        <line x1="12" y1="1" x2="12" y2="3"></line>
                        <line x1="12" y1="21" x2="12" y2="23"></line>
                        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                        <line x1="1" y1="12" x2="3" y2="12"></line>
                        <line x1="21" y1="12" x2="23" y2="12"></line>
                        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                    </svg>
                    <span className="ml-2 text-xs">跟随系统主题</span>
                </div>
            </div>
        </aside>
    )
}
