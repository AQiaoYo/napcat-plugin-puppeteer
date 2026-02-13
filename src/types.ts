/**
 * Puppeteer 渲染服务类型定义
 * 定义截图渲染相关的所有接口和类型
 */

// ==================== 截图编码类型 ====================

/**
 * 截图编码类型
 */
export type Encoding = 'base64' | 'binary';

/**
 * 截图分片类型
 * - false: 不分页
 * - true: 自动分页（默认 2000px）
 * - number: 指定每页高度（像素）
 */
export type MultiPage = boolean | number;

/**
 * 截图结果数据类型
 */
export type ScreenshotData<T extends Encoding> =
    T extends 'base64' ? string : Uint8Array;

/**
 * 截图结果类型
 */
export type ScreenshotResult<T extends Encoding = 'binary', M extends MultiPage = false> =
    M extends false ? ScreenshotData<T> : Array<ScreenshotData<T>>;

// ==================== 截图选项 ====================

/**
 * 视口设置
 */
export interface ViewportOptions {
    /** 视口宽度 */
    width?: number;
    /** 视口高度 */
    height?: number;
    /** 设备像素比 */
    deviceScaleFactor?: number;
}

/**
 * 页面导航参数
 */
export interface PageGotoParams {
    /** 等待条件 */
    waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2';
    /** 超时时间（毫秒） */
    timeout?: number;
}

/**
 * 截图请求参数
 */
export interface ScreenshotOptions {
    /** 
     * 渲染目标
     * - URL: http:// 或 https:// 开头
     * - 本地文件: file:// 开头
     * - HTML 字符串: 直接传入 HTML 内容
     */
    file: string;

    /**
     * file 类型
     * @default 'auto'
     * - auto: 自动识别 URL 或 file:// 路径
     * - htmlString: HTML 字符串
     */
    file_type?: 'auto' | 'htmlString';

    /**
     * 模板数据（用于 HTML 模板渲染）
     * 支持简单的 {{key}} 模板语法
     */
    data?: Record<string, any>;

    /**
     * 选择截图的元素
     * @default 'body'
     */
    selector?: string;

    /**
     * 截图类型
     * @default 'png'
     */
    type?: 'png' | 'jpeg' | 'webp';

    /**
     * 截图质量 (1-100)，仅对 jpeg/webp 有效
     * @default 90
     */
    quality?: number;

    /**
     * 截图编码
     * @default 'base64'
     */
    encoding?: Encoding;

    /**
     * 是否截取整个页面
     * @default false
     */
    fullPage?: boolean;

    /**
     * 是否隐藏背景（透明）
     * @default false
     */
    omitBackground?: boolean;

    /**
     * 分页截图
     * - false: 不分页
     * - true: 自动分页（每页 2000px）
     * - number: 指定每页高度
     * @default false
     */
    multiPage?: MultiPage;

    /**
     * 视口设置
     */
    setViewport?: ViewportOptions;

    /**
     * 页面导航参数
     */
    pageGotoParams?: PageGotoParams;

    /**
     * 额外的 HTTP 头
     */
    headers?: Record<string, string>;

    /**
     * 重试次数
     * @default 1
     */
    retry?: number;

    /**
     * 截图前等待时间（毫秒）
     */
    waitForTimeout?: number;

    /**
     * 等待指定选择器出现
     */
    waitForSelector?: string;
}

// ==================== 渲染结果 ====================

/**
 * 渲染任务结果
 */
export interface RenderResult<T extends Encoding = 'base64', M extends MultiPage = false> {
    /** 是否成功 */
    status: boolean;
    /** 截图数据或错误信息 */
    data: M extends false
    ? (T extends 'base64' ? string : Uint8Array)
    : Array<T extends 'base64' ? string : Uint8Array>;
    /** 错误信息（失败时） */
    message?: string;
    /** 渲染耗时（毫秒） */
    time?: number;
}

// ==================== 浏览器配置 ====================

/**
 * 浏览器代理配置
 */
export interface BrowserProxyConfig {
    /**
     * 代理服务器地址
     * 格式: protocol://host:port
     * 例如: http://127.0.0.1:7890, socks5://127.0.0.1:1080
     */
    server?: string;

    /**
     * 代理用户名（可选，用于认证代理）
     */
    username?: string;

    /**
     * 代理密码（可选，用于认证代理）
     */
    password?: string;

    /**
     * 代理 bypass 列表
     * 逗号分隔的域名列表，这些域名不走代理
     */
    bypassList?: string;
}

/**
 * 浏览器状态中暴露的代理配置（不含敏感信息）
 */
export interface BrowserStatusProxy {
    server: string;
    bypassList?: string;
}

/**
 * 浏览器启动配置
 */
export interface BrowserConfig {
    /** 
     * 浏览器可执行文件路径
     * 留空则尝试自动检测系统浏览器
     * 注意：如果设置了 browserWSEndpoint，此项将被忽略
     */
    executablePath?: string;

    /**
     * 远程浏览器 WebSocket 地址
     * 用于连接 Docker 容器中的浏览器或远程浏览器服务
     * 例如：ws://localhost:3000 或 ws://chrome:3000
     * 设置此项后将忽略 executablePath，直接连接远程浏览器
     */
    browserWSEndpoint?: string;

    /**
     * 是否启用无头模式
     * @default true
     */
    headless?: boolean;

    /**
     * 浏览器启动参数
     */
    args?: string[];

    /**
     * 代理服务器配置
     * 用于国内机器访问国外网站时走代理
     * 注意：远程模式（browserWSEndpoint）下此配置不生效
     */
    proxy?: BrowserProxyConfig;

    /**
     * 最大并发页面数
     * @default 5
     */
    maxPages?: number;

    /**
     * 默认超时时间（毫秒）
     * @default 30000
     */
    timeout?: number;

    /**
     * 默认视口宽度
     * @default 1280
     */
    defaultViewportWidth?: number;

    /**
     * 默认视口高度
     * @default 800
     */
    defaultViewportHeight?: number;

    /**
     * 设备像素比
     * @default 2
     */
    deviceScaleFactor?: number;
}

// ==================== 插件配置 ====================

/**
 * 插件主配置接口
 */
export interface PluginConfig {
    /** 全局开关：是否启用渲染服务 */
    enabled: boolean;

    /** 浏览器配置 */
    browser: BrowserConfig;

    /** 是否启用调试模式 */
    debug?: boolean;
}

// ==================== 浏览器状态 ====================

/**
 * 浏览器运行状态
 */
export interface BrowserStatus {
    /** 是否已连接 */
    connected: boolean;
    /** 连接模式：local（本地启动）或 remote（远程连接） */
    mode: 'local' | 'remote';
    /** 浏览器版本 */
    version?: string;
    /** 当前打开的页面数 */
    pageCount: number;
    /** 浏览器可执行文件路径（本地模式） */
    executablePath?: string;
    /** 远程浏览器地址（远程模式） */
    browserWSEndpoint?: string;
    /** 代理服务器配置（不含敏感信息） */
    proxy?: BrowserStatusProxy;
    /** 启动时间 */
    startTime?: number;
    /** 总渲染次数 */
    totalRenders: number;
    /** 失败次数 */
    failedRenders: number;
}

// ==================== API 响应 ====================

/**
 * API 统一响应结构
 */
export interface ApiResponse<T = any> {
    /** 状态码，0 表示成功 */
    code: number;
    /** 响应数据 */
    data?: T;
    /** 错误消息 */
    message?: string;
}
