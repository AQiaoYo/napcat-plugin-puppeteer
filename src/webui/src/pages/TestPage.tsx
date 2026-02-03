import { useState } from 'react'
import { Play, ChevronDown, Type } from 'lucide-react'
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
            <div className="glass-card flex flex-col overflow-hidden p-0">
                <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
                    <h3 className="font-bold flex items-center gap-2">
                        <Type size={18} />
                        测试参数
                    </h3>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar">
                    {/* Type Select */}
                    <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">渲染类型</label>
                        <select
                            value={testType}
                            onChange={(e) => handleTypeChange(e.target.value as 'html' | 'url')}
                            className="input-field"
                        >
                            <option value="html">HTML 字符串</option>
                            <option value="url">URL 地址</option>
                        </select>
                    </div>

                    {/* Content */}
                    <div className="flex flex-col">
                        <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">内容</label>
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
                            <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">模板数据 (JSON)</label>
                            <input
                                value={templateData}
                                onChange={(e) => setTemplateData(e.target.value)}
                                className="input-field font-mono text-sm"
                                placeholder='{"time": "2024-01-01"}'
                            />
                        </div>
                    )}

                    {/* Advanced Options */}
                    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                        <div
                            onClick={() => setShowAdvanced(!showAdvanced)}
                            className="bg-gray-50 dark:bg-[#202124] px-4 py-2 cursor-pointer flex justify-between items-center select-none"
                        >
                            <span className="text-xs font-bold text-gray-500 uppercase">高级选项</span>
                            <ChevronDown
                                size={16}
                                className={`text-gray-400 transition-transform duration-200 ${showAdvanced ? 'rotate-180' : ''}`}
                            />
                        </div>

                        {showAdvanced && (
                            <div className="p-4 space-y-4 bg-white dark:bg-[#18191C]">
                                <div className="grid grid-cols-3 gap-3">
                                    <div>
                                        <label className="text-[10px] text-gray-400 uppercase block mb-1">宽 (Width)</label>
                                        <input
                                            type="number"
                                            value={width}
                                            onChange={(e) => setWidth(e.target.value)}
                                            className="input-field text-sm py-1"
                                            placeholder="1280"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-gray-400 uppercase block mb-1">高 (Height)</label>
                                        <input
                                            type="number"
                                            value={height}
                                            onChange={(e) => setHeight(e.target.value)}
                                            className="input-field text-sm py-1"
                                            placeholder="800"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-gray-400 uppercase block mb-1">缩放 (Scale)</label>
                                        <input
                                            type="number"
                                            value={scale}
                                            onChange={(e) => setScale(e.target.value)}
                                            className="input-field text-sm py-1"
                                            placeholder="2"
                                            step="0.5"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-[10px] text-gray-400 uppercase block mb-1">选择器 (Selector)</label>
                                        <input
                                            value={selector}
                                            onChange={(e) => setSelector(e.target.value)}
                                            className="input-field text-sm py-1 font-mono"
                                            placeholder="body"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-gray-400 uppercase block mb-1">等待元素 (Wait)</label>
                                        <input
                                            value={waitSelector}
                                            onChange={(e) => setWaitSelector(e.target.value)}
                                            className="input-field text-sm py-1 font-mono"
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
                                            className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                                        />
                                        <label htmlFor="omitBg" className="text-xs text-gray-500">透明背景</label>
                                    </div>
                                    <div className="flex items-center gap-2 flex-1 justify-end">
                                        <label className="text-xs text-gray-500">延迟(ms)</label>
                                        <input
                                            type="number"
                                            value={delay}
                                            onChange={(e) => setDelay(e.target.value)}
                                            className="input-field text-sm py-1 w-20"
                                            placeholder="0"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Run Button */}
                <div className="p-6 border-t border-gray-100 dark:border-gray-800 flex-shrink-0 bg-gray-50/50 dark:bg-gray-800/20">
                    <button
                        onClick={runTest}
                        disabled={loading}
                        className="btn btn-primary w-full py-3 shadow-pink-500/20 shadow-lg disabled:opacity-50"
                    >
                        <Play size={18} />
                        {loading ? '渲染中...' : '执行渲染'}
                    </button>
                </div>
            </div>

            {/* Right Panel - Result */}
            <div className="glass-card flex flex-col h-full overflow-hidden p-0">
                <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex-shrink-0 flex justify-between items-center">
                    <h3 className="font-bold">结果预览</h3>
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
                        <div className="text-red-500 p-4 bg-red-50 dark:bg-red-900/10 rounded">
                            ❌ {error}
                        </div>
                    ) : result ? (
                        <div className="w-full flex flex-col items-center overflow-auto p-4 max-h-full">
                            <img
                                src={`data:image/png;base64,${result}`}
                                alt="Render Result"
                                className="max-w-full h-auto shadow-lg rounded"
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
