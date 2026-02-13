import { useState } from 'react'
import { Play, ChevronDown, Type, Globe } from 'lucide-react'
import { noAuthFetch } from '../utils/api'
import { showToast } from '../hooks/useToast'
import type { RenderOptions } from '../types'

const defaultHtml = `<html>
<body style="padding:40px;font-family:sans-serif;background:#fff0f6;">
  <h1 style="color:#FB7299;font-size:3em;">Hello Puppeteer!</h1>
  <p>当前时间: {{time}}</p>
  <div style="padding:20px;background:white;border-radius:12px;margin-top:20px;">
     Test Card
  </div>
</body>
</html>`

// 预设测试 URL
const presetUrls = [
    { label: 'Google 搜索', url: 'https://www.google.com' },
    { label: 'Google 图片', url: 'https://www.google.com/search?q=cat&tbm=isch' },
    { label: 'GitHub', url: 'https://github.com' },
    { label: 'Bing', url: 'https://www.bing.com' },
]

export default function TestPage() {
    const [testType, setTestType] = useState<'html' | 'url'>('html')
    const [content, setContent] = useState(defaultHtml)
    const [templateData, setTemplateData] = useState('{"time": "Now"}')
    const [showAdvanced, setShowAdvanced] = useState(false)

    // Advanced options
    const [width, setWidth] = useState('')
    const [height, setHeight] = useState('')
    const [scale, setScale] = useState('')
    const [selector, setSelector] = useState('')
    const [waitSelector, setWaitSelector] = useState('')
    const [omitBg, setOmitBg] = useState(false)
    const [delay, setDelay] = useState('')

    // Result
    const [result, setResult] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [renderTime, setRenderTime] = useState<number | null>(null)
    const [error, setError] = useState<string | null>(null)

    const handleTypeChange = (type: 'html' | 'url') => {
        setTestType(type)
        if (type === 'url' && (content.trim().startsWith('<') || !content)) {
            setContent('https://napneko.github.io/')
        } else if (type === 'html' && content.startsWith('http')) {
            setContent(defaultHtml)
        }
    }

    const runTest = async () => {
        setLoading(true)
        setError(null)
        setResult(null)
        setRenderTime(null)

        try {
            let data: Record<string, unknown> | undefined
            try {
                data = templateData ? JSON.parse(templateData) : undefined
            } catch {
                throw new Error('模板数据 JSON 格式错误')
            }

            const body: RenderOptions = {
                encoding: 'base64',
                data,
                selector: selector || undefined,
                waitForSelector: waitSelector || undefined,
                omitBackground: omitBg,
                waitForTimeout: delay ? parseInt(delay) : undefined,
            }

            // Viewport
            if (width || height || scale) {
                body.setViewport = {
                    width: width ? parseInt(width) : undefined,
                    height: height ? parseInt(height) : undefined,
                    deviceScaleFactor: scale ? parseFloat(scale) : undefined,
                }
            }

            if (testType === 'html') {
                body.html = content
            } else {
                body.file = content
                body.file_type = 'auto'
            }

            const endpoint = testType === 'html' ? '/render' : '/screenshot'
            const startTime = Date.now()
            const res = await noAuthFetch<string | string[]>(endpoint, {
                method: 'POST',
                body: JSON.stringify(body),
            })
            const duration = Date.now() - startTime

            if (res.code === 0 && res.data) {
                const imgData = Array.isArray(res.data) ? res.data[0] : res.data
                setResult(imgData)
                setRenderTime(res.time || duration)
            } else {
                setError(res.message || '渲染失败')
            }
        } catch (e) {
            setError((e as Error).message)
            showToast((e as Error).message, 'error')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="grid md:grid-cols-2 gap-6 h-[calc(100vh-140px)] min-h-[600px]">
            {/* Left Panel - Parameters */}
            <div className="bg-white dark:bg-[#1a1b1d] rounded-lg border border-gray-200 dark:border-gray-800 flex flex-col overflow-hidden">
                <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0 bg-gray-50/50 dark:bg-[#1a1b1d]">
                    <h3 className="font-bold flex items-center gap-2 text-sm text-gray-900 dark:text-gray-100">
                        <Type size={16} />
                        测试参数
                    </h3>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                    {/* Type Select */}
                    <div>
                        <label className="text-[10px] font-semibold text-gray-500 uppercase mb-1.5 block tracking-wider">渲染类型</label>
                        <select
                            value={testType}
                            onChange={(e) => handleTypeChange(e.target.value as 'html' | 'url')}
                            className="input-field text-sm"
                        >
                            <option value="html">HTML 字符串</option>
                            <option value="url">URL 地址</option>
                        </select>
                    </div>

                    {/* Preset URLs (only for URL type) */}
                    {testType === 'url' && (
                        <div>
                            <label className="text-[10px] font-semibold text-gray-500 uppercase mb-1.5 block tracking-wider flex items-center gap-1">
                                <Globe size={12} />
                                快速测试
                            </label>
                            <div className="flex flex-wrap gap-2">
                                {presetUrls.map((preset) => (
                                    <button
                                        key={preset.url}
                                        onClick={() => setContent(preset.url)}
                                        className="text-xs px-2 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-primary hover:text-white dark:hover:bg-primary border border-gray-200 dark:border-gray-700 rounded-md transition-colors"
                                    >
                                        {preset.label}
                                    </button>
                                ))}
                            </div>
                            <p className="text-[10px] text-gray-400 mt-1.5">
                                点击按钮快速填充 URL，可用于测试代理是否生效
                            </p>
                        </div>
                    )}

                    {/* Content */}
                    <div className="flex flex-col">
                        <label className="text-[10px] font-semibold text-gray-500 uppercase mb-1.5 block tracking-wider">内容</label>
                        <textarea
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            className="input-field font-mono text-xs p-3 min-h-[200px]"
                            placeholder={testType === 'html' ? '输入 HTML 代码...' : '输入 URL (例如 https://example.com)...'}
                        />
                    </div>

                    {/* Template Data (only for HTML) */}
                    {testType === 'html' && (
                        <div>
                            <label className="text-[10px] font-semibold text-gray-500 uppercase mb-1.5 block tracking-wider">模板数据 (JSON)</label>
                            <input
                                value={templateData}
                                onChange={(e) => setTemplateData(e.target.value)}
                                className="input-field font-mono text-xs"
                                placeholder='{"time": "2024-01-01"}'
                            />
                        </div>
                    )}

                    {/* Advanced Options */}
                    <div className="border border-gray-200 dark:border-gray-800 rounded-md overflow-hidden">
                        <div
                            onClick={() => setShowAdvanced(!showAdvanced)}
                            className="bg-gray-50 dark:bg-[#202124] px-3 py-2 cursor-pointer flex justify-between items-center select-none"
                        >
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">高级选项</span>
                            <ChevronDown
                                size={14}
                                className={`text-gray-400 transition-transform duration-200 ${showAdvanced ? 'rotate-180' : ''}`}
                            />
                        </div>

                        {showAdvanced && (
                            <div className="p-3 space-y-3 bg-white dark:bg-[#1a1b1d]">
                                <div className="grid grid-cols-3 gap-2">
                                    <div>
                                        <label className="text-[10px] text-gray-400 uppercase block mb-1">Width</label>
                                        <input
                                            type="number"
                                            value={width}
                                            onChange={(e) => setWidth(e.target.value)}
                                            className="input-field text-xs py-1"
                                            placeholder="1280"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-gray-400 uppercase block mb-1">Height</label>
                                        <input
                                            type="number"
                                            value={height}
                                            onChange={(e) => setHeight(e.target.value)}
                                            className="input-field text-xs py-1"
                                            placeholder="800"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-gray-400 uppercase block mb-1">Scale</label>
                                        <input
                                            type="number"
                                            value={scale}
                                            onChange={(e) => setScale(e.target.value)}
                                            className="input-field text-xs py-1"
                                            placeholder="2"
                                            step="0.5"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="text-[10px] text-gray-400 uppercase block mb-1">Selector</label>
                                        <input
                                            value={selector}
                                            onChange={(e) => setSelector(e.target.value)}
                                            className="input-field text-xs py-1 font-mono"
                                            placeholder="body"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-gray-400 uppercase block mb-1">Wait For</label>
                                        <input
                                            value={waitSelector}
                                            onChange={(e) => setWaitSelector(e.target.value)}
                                            className="input-field text-xs py-1 font-mono"
                                            placeholder="#app"
                                        />
                                    </div>
                                </div>

                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            id="omitBg"
                                            checked={omitBg}
                                            onChange={(e) => setOmitBg(e.target.checked)}
                                            className="w-3.5 h-3.5 rounded border-gray-300 text-primary focus:ring-primary"
                                        />
                                        <label htmlFor="omitBg" className="text-xs text-gray-600 dark:text-gray-400">Transparent Bg</label>
                                    </div>
                                    <div className="flex items-center gap-2 flex-1 justify-end">
                                        <label className="text-xs text-gray-500">Delay(ms)</label>
                                        <input
                                            type="number"
                                            value={delay}
                                            onChange={(e) => setDelay(e.target.value)}
                                            className="input-field text-xs py-1 w-16"
                                            placeholder="0"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Run Button */}
                <div className="p-4 border-t border-gray-100 dark:border-gray-800 flex-shrink-0 bg-gray-50/50 dark:bg-[#1a1b1d]">
                    <button
                        onClick={runTest}
                        disabled={loading}
                        className="btn btn-primary w-full py-2 shadow-sm disabled:opacity-50 text-sm font-medium"
                    >
                        <Play size={16} />
                        {loading ? '渲染中...' : '执行渲染'}
                    </button>
                </div>
            </div>

            {/* Right Panel - Result */}
            <div className="bg-white dark:bg-[#1a1b1d] rounded-lg border border-gray-200 dark:border-gray-800 flex flex-col h-full overflow-hidden">
                <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0 flex justify-between items-center bg-gray-50/50 dark:bg-[#1a1b1d]">
                    <h3 className="font-bold text-sm text-gray-900 dark:text-gray-100">结果预览</h3>
                    {renderTime !== null && (
                        <span className="text-xs text-gray-500 font-mono">耗时: {renderTime}ms</span>
                    )}
                </div>

                <div className="flex-1 bg-gray-100 dark:bg-black flex flex-col items-center justify-center overflow-auto custom-scrollbar p-4">
                    {loading ? (
                        <div className="flex flex-col items-center gap-2">
                            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                            <span className="text-sm text-gray-400">渲染中...</span>
                        </div>
                    ) : error ? (
                        <div className="text-red-600 p-4 bg-red-50 dark:bg-red-900/10 rounded border border-red-100 dark:border-red-900/20 text-sm">
                            ❌ {error}
                        </div>
                    ) : result ? (
                        <div className="w-full flex flex-col items-center overflow-auto p-4 max-h-full">
                            <img
                                src={`data:image/png;base64,${result}`}
                                alt="Render Result"
                                className="max-w-full h-auto shadow-sm border border-gray-200 dark:border-gray-800 rounded bg-white dark:bg-gray-900"
                            />
                        </div>
                    ) : (
                        <div className="text-gray-400 text-sm">等待渲染...</div>
                    )}
                </div>
            </div>
        </div>
    )
}
