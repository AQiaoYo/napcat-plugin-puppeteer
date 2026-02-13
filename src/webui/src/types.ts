export interface BrowserStatus {
    connected: boolean
    version?: string
    pageCount: number
    pid?: number
    executablePath?: string
    browserWSEndpoint?: string
    mode?: 'local' | 'remote'
    proxy?: {
        server?: string
        bypassList?: string
    }
    totalRenders: number
    failedRenders: number
}

export interface PluginStatus {
    browser: BrowserStatus
    uptime: number
    uptimeFormatted: string
}

export interface ApiResponse<T = unknown> {
    code: number
    data?: T
    message?: string
    time?: number
}

export interface BrowserProxyConfig {
    server?: string
    username?: string
    password?: string
    bypassList?: string
}

export interface PluginConfig {
    enabled: boolean
    debug: boolean
    browser: {
        maxPages: number
        timeout: number
        headless: boolean
        executablePath?: string
        browserWSEndpoint?: string
        args?: string[]
        defaultViewportWidth: number
        defaultViewportHeight: number
        deviceScaleFactor: number
        proxy?: BrowserProxyConfig
    }
}

/** 已安装的浏览器信息 */
export interface InstalledBrowser {
    type: 'chrome' | 'chromium' | 'edge' | 'brave'
    executablePath: string
    version?: string
    source: string
    channel: string
}

export interface ChromeStatus {
    platform: string
    arch: string
    linuxDistro?: string
    /** Windows 版本名称（如 Windows Server 2012 R2） */
    windowsVersion?: string
    defaultVersion: string
    installed: boolean
    version?: string
    executablePath?: string
    isInstalling: boolean
    progress?: ChromeProgress
    /** 是否支持自动安装 Chrome */
    canInstall: boolean
    /** 不支持安装的原因 */
    cannotInstallReason?: string
    /** 系统中已安装的浏览器列表 */
    installedBrowsers?: InstalledBrowser[]
}

export interface ChromeProgress {
    status: 'idle' | 'downloading' | 'extracting' | 'installing-deps' | 'completed' | 'failed'
    progress: number
    message: string
    downloadedBytes?: number
    totalBytes?: number
    speed?: string
    eta?: string
    error?: string
}

export interface RenderOptions {
    html?: string
    file?: string
    file_type?: 'url' | 'htmlString' | 'file' | 'auto'
    encoding?: 'base64' | 'binary'
    data?: Record<string, unknown>
    selector?: string
    waitForSelector?: string
    omitBackground?: boolean
    waitForTimeout?: number
    setViewport?: {
        width?: number
        height?: number
        deviceScaleFactor?: number
    }
}

export interface RenderResult {
    code: number
    data?: string | string[]
    message?: string
    time?: number
}
