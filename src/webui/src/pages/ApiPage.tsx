import { useState } from 'react'
import { Zap, Image, Shield, Settings, ChevronDown } from 'lucide-react'

interface ApiEndpoint {
    id: string
    method: 'GET' | 'POST'
    path: string
    description: string
    noAuth?: boolean
    params?: { name: string; type: string; required: boolean; desc: string }[]
    response?: string
}

const apiEndpoints: { section: string; icon: React.ReactNode; items: ApiEndpoint[] }[] = [
    {
        section: '核心服务',
        icon: <Image size={24} className="text-primary" />,
        items: [
            {
                id: 'api-screenshot',
                method: 'POST',
                path: '/screenshot',
                description: '通用截图接口，支持 URL、本地文件路径或直接传入 HTML 字符串进行渲染。',
                noAuth: true,
                params: [
                    { name: 'file', type: 'string', required: true, desc: '目标内容 (URL / HTML代码 / 文件路径)' },
                    { name: 'file_type', type: 'string', required: false, desc: '指定内容类型: url | htmlString | file | auto(默认)' },
                    { name: 'selector', type: 'string', required: false, desc: 'CSS 选择器，只截取指定元素。默认 body' },
                    { name: 'omitBackground', type: 'boolean', required: false, desc: '是否隐藏默认背景（设为透明）。默认 false' },
                    { name: 'data', type: 'object', required: false, desc: 'Handlebars 模板数据，仅当 file 为模板时有效' },
                    { name: 'waitSelector', type: 'string', required: false, desc: '等待该元素出现后再截图' },
                    { name: 'setViewport', type: 'object', required: false, desc: '{ width, height, deviceScaleFactor }' },
                ],
                response: `{
                    "code": 0,
                    "data": "Base64String...",  // 图片数据
                    "message": "OK",
                    "time": 150                 // 耗时(ms)
                    }`,
            },
            {
                id: 'api-render',
                method: 'POST',
                path: '/render',
                description: '/screenshot 的语义化别名，专门用于 HTML 模板渲染。',
                noAuth: true,
                params: [
                    { name: 'html', type: 'string', required: true, desc: 'HTML 模板字符串' },
                    { name: 'data', type: 'object', required: false, desc: '模板插值数据' },
                ],
            },
            {
                id: 'api-screenshot-get',
                method: 'GET',
                path: '/screenshot',
                description: '轻量级 URL 截图接口，适合快速调试或简单场景。',
                noAuth: true,
                params: [
                    { name: 'url', type: 'string', required: true, desc: '目标网页地址' },
                    { name: 'width', type: 'number', required: false, desc: '视口宽度 (默认 1280)' },
                    { name: 'height', type: 'number', required: false, desc: '视口高度 (默认 800)' },
                    { name: 'selector', type: 'string', required: false, desc: '元素选择器' },
                    { name: 'raw', type: 'boolean', required: false, desc: '如果为 true，直接返回 image/png 流，不包装 JSON' },
                ],
            },
        ],
    },
    {
        section: '浏览器控制',
        icon: <Shield size={24} className="text-primary" />,
        items: [
            {
                id: 'api-browser-status',
                method: 'GET',
                path: '/browser/status',
                description: '获取 Puppeteer 实例的详细状态。',
                noAuth: true,
                response: `{
  "code": 0,
  "data": {
    "connected": true,      // 浏览器是否连接
    "version": "Chrome...", // 版本信息
    "pageCount": 1,         // 打开的页面数
    "pid": 12345,           // 进程 ID
    "executablePath": "..." // 浏览器路径
  }
}`,
            },
            {
                id: 'api-browser-ops',
                method: 'POST',
                path: '/browser/{action}',
                description: '生命周期控制接口，支持 start, stop, restart。',
                noAuth: false,
                response: `{ "code": 0, "message": "Browser started successfully" }`,
            },
        ],
    },
    {
        section: '系统配置',
        icon: <Settings size={24} className="text-primary" />,
        items: [
            {
                id: 'api-sys-config',
                method: 'POST',
                path: '/config',
                description: '热更新插件配置，实时生效（部分浏览器配置需重启生效）。',
                noAuth: false,
                response: `{
  "browser": {
    "headless": true,
    "args": ["--no-sandbox"]
  },
  "maxPages": 10,
  "lockTimeout": 30000
}`,
            },
            {
                id: 'api-sys-status',
                method: 'GET',
                path: '/status',
                description: '获取插件整体运行统计。',
                noAuth: true,
                response: `{
  "totalRenders": 100,
  "failedRenders": 2,
  "uptimeFormatted": "2小时 15分"
}`,
            },
        ],
    },
]

function ApiCard({ endpoint, isOpen, onToggle }: { endpoint: ApiEndpoint; isOpen: boolean; onToggle: () => void }) {
    return (
        <div id={endpoint.id} className="bg-white dark:bg-[#1a1b1d] rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden mb-3">
            <div className="p-4 flex items-center justify-between cursor-pointer select-none hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors" onClick={onToggle}>
                <div className="flex items-center gap-3 overflow-hidden">
                    <span className={`method-badge method-${endpoint.method} text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wide`}>{endpoint.method}</span>
                    <div className="flex items-center gap-2">
                        <code className="text-sm font-semibold truncate text-gray-800 dark:text-gray-200">{endpoint.path}</code>
                        {endpoint.noAuth && (
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500" title="无认证"></span>
                        )}
                        {!endpoint.noAuth && (
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" title="需认证"></span>
                        )}
                    </div>
                </div>
                <ChevronDown size={16} className={`text-gray-400 transition-transform ${isOpen ? '' : '-rotate-90'}`} />
            </div>

            {isOpen && (
                <div className="px-5 pb-5 border-t border-gray-100 dark:border-gray-800 pt-4">
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 leading-relaxed">{endpoint.description}</p>

                    {!endpoint.noAuth && (
                        <div className="text-xs p-2.5 mb-4 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 rounded border border-amber-100 dark:border-amber-900/30 flex items-center gap-2">
                            <span>🔒</span> 此接口需要 WebUI 认证 Token
                        </div>
                    )}

                    {endpoint.params && endpoint.params.length > 0 && (
                        <>
                            <div className="text-xs font-bold text-gray-900 dark:text-gray-100 mb-2 uppercase tracking-wide">
                                {endpoint.method === 'GET' ? 'Query Parameters' : 'Request Body (JSON)'}
                            </div>
                            <div className="overflow-x-auto border border-gray-200 dark:border-gray-800 rounded-lg">
                                <table className="w-full text-sm border-collapse">
                                    <thead>
                                        <tr className="bg-gray-50 dark:bg-black/20 border-b border-gray-200 dark:border-gray-800">
                                            <th className="text-left py-2 px-3 text-gray-500 font-semibold text-xs uppercase tracking-wider">参数名</th>
                                            <th className="text-left py-2 px-3 text-gray-500 font-semibold text-xs uppercase tracking-wider">类型</th>
                                            <th className="text-left py-2 px-3 text-gray-500 font-semibold text-xs uppercase tracking-wider">必填</th>
                                            <th className="text-left py-2 px-3 text-gray-500 font-semibold text-xs uppercase tracking-wider">说明</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {endpoint.params.map((param) => (
                                            <tr key={param.name} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
                                                <td className="py-2.5 px-3 text-gray-700 dark:text-gray-300 font-mono text-xs">{param.name}</td>
                                                <td className="py-2.5 px-3">
                                                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                                                        {param.type}
                                                    </span>
                                                </td>
                                                <td className="py-2.5 px-3">
                                                    {param.required ? (
                                                        <span className="text-red-500 text-[10px] font-bold">YES</span>
                                                    ) : (
                                                        <span className="text-gray-400 text-[10px]">NO</span>
                                                    )}
                                                </td>
                                                <td className="py-2.5 px-3 text-gray-600 dark:text-gray-400 text-xs">{param.desc}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}

                    {endpoint.response && (
                        <>
                            <div className="text-xs font-bold text-gray-900 dark:text-gray-100 mt-5 mb-2 uppercase tracking-wide">Response JSON</div>
                            <pre className="text-xs bg-gray-50 dark:bg-black border border-gray-200 dark:border-gray-800 rounded-lg p-3 overflow-x-auto text-gray-700 dark:text-gray-300 font-mono">{endpoint.response}</pre>
                        </>
                    )}
                </div>
            )}
        </div>
    )
}

export default function ApiPage() {
    const [openCards, setOpenCards] = useState<Set<string>>(new Set(['api-screenshot']))

    const toggleCard = (id: string) => {
        setOpenCards((prev) => {
            const next = new Set(prev)
            if (next.has(id)) {
                next.delete(id)
            } else {
                next.add(id)
            }
            return next
        })
    }

    return (
        <div className="flex flex-col lg:flex-row gap-8 items-start max-w-7xl mx-auto">
            {/* Left TOC */}
            <div className="hidden lg:block w-56 flex-shrink-0 sticky top-28">
                <div className="bg-white dark:bg-[#1a1b1d] rounded-lg border border-gray-200 dark:border-gray-800 p-1">
                    <div className="text-[10px] font-bold text-gray-400 uppercase px-3 py-2 tracking-wider">Start</div>
                    <a onClick={() => document.getElementById('api-quickstart')?.scrollIntoView({ behavior: 'smooth' })} className="block px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 rounded cursor-pointer">
                        调用说明
                    </a>

                    {apiEndpoints.map((section) => (
                        <div key={section.section} className="mt-2">
                            <div className="text-[10px] font-bold text-gray-400 uppercase px-3 py-2 tracking-wider">{section.section}</div>
                            {section.items.map((item) => (
                                <a
                                    key={item.id}
                                    onClick={() => {
                                        setOpenCards((prev) => new Set([...prev, item.id]))
                                        setTimeout(() => document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth' }), 100)
                                    }}
                                    className="block px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 rounded cursor-pointer truncate font-mono text-xs"
                                >
                                    {item.path}
                                </a>
                            ))}
                        </div>
                    ))}
                </div>
            </div>

            {/* Right Content */}
            <div className="flex-1 w-full min-w-0 space-y-12 pb-24">
                {/* Quick Start */}
                <section id="api-quickstart">
                    <h3 className="flex items-center gap-2 text-lg font-bold mb-6 text-gray-900 dark:text-gray-100">
                        <Zap size={20} className="text-gray-900 dark:text-gray-100" />
                        快速开始
                    </h3>

                    <div className="bg-white dark:bg-[#1a1b1d] rounded-lg border border-gray-200 dark:border-gray-800 p-6 mb-6">
                        <h4 className="font-bold text-base mb-3 text-gray-900 dark:text-white">API 路径说明</h4>

                        <div className="mb-4">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-[10px] font-bold rounded uppercase">Recommended</span>
                                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">无认证 API（供其他插件调用）</span>
                            </div>
                            <div className="bg-gray-50 dark:bg-black border border-gray-200 dark:border-gray-800 text-gray-800 dark:text-gray-200 rounded-md p-3 font-mono text-sm overflow-x-auto">
                                <span className="text-gray-400">{'{host}'}</span>
                                <span className="text-green-600 dark:text-green-500">/plugin/napcat-plugin-puppeteer/api</span>
                                <span className="text-amber-600 dark:text-amber-500">{'/{endpoint}'}</span>
                            </div>
                        </div>

                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <span className="px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-[10px] font-bold rounded uppercase">WebUI</span>
                                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">需认证 API（WebUI 管理）</span>
                            </div>
                            <div className="bg-gray-50 dark:bg-black border border-gray-200 dark:border-gray-800 text-gray-800 dark:text-gray-200 rounded-md p-3 font-mono text-sm overflow-x-auto">
                                <span className="text-gray-400">{'{host}'}</span>
                                <span className="text-blue-600 dark:text-blue-500">/api/Plugin/ext/napcat-plugin-puppeteer</span>
                                <span className="text-amber-600 dark:text-amber-500">{'/{endpoint}'}</span>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-[#1a1b1d] rounded-lg border border-gray-200 dark:border-gray-800 p-6">
                        <h4 className="font-bold text-base mb-4 text-gray-900 dark:text-white">调用示例</h4>
                        <pre className="text-xs overflow-x-auto font-mono text-gray-600 dark:text-gray-400">{`// 在其他插件中调用（无需认证）
const response = await fetch('http://localhost:6099/plugin/napcat-plugin-puppeteer/api/render', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        html: '<div style="padding:20px;background:#fff;"><h1>Hello {{name}}</h1></div>',
        data: { name: 'World' },
        encoding: 'base64'
    })
});
const result = await response.json();
// result.data 为 Base64 编码的图片数据`}</pre>
                    </div>
                </section>

                {/* API Sections */}
                {apiEndpoints.map((section) => (
                    <section key={section.section}>
                        <h3 className="flex items-center gap-2 text-lg font-bold mb-6 text-gray-900 dark:text-gray-100">
                            <span className="text-gray-900 dark:text-gray-100">{section.icon}</span>
                            {section.section}
                        </h3>

                        <div className="space-y-4">
                            {section.items.map((endpoint) => (
                                <ApiCard
                                    key={endpoint.id}
                                    endpoint={endpoint}
                                    isOpen={openCards.has(endpoint.id)}
                                    onToggle={() => toggleCard(endpoint.id)}
                                />
                            ))}
                        </div>
                    </section>
                ))}
            </div>
        </div>
    )
}
