/**
 * Chrome 浏览器安装服务
 * 参考 puppeteer-main 项目实现，支持后台下载安装 Chrome
 * 适配 NapCat Docker 环境 (Ubuntu 22.04)
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';
import https from 'https';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { pluginState } from '../core/state';

const execAsync = promisify(exec);

// ==================== 常量定义 ====================

/** Chrome 下载源 */
export const DOWNLOAD_SOURCES = {
    /** 谷歌官方源 */
    GOOGLE: 'https://storage.googleapis.com/chrome-for-testing-public',
    /** NPM 镜像源（国内推荐） */
    NPMMIRROR: 'https://cdn.npmmirror.com/binaries/chrome-for-testing',
} as const;

/** 默认 Chrome 版本 */
export const DEFAULT_CHROME_VERSION = '131.0.6778.204';

/** 安装状态 */
export type InstallStatus = 'idle' | 'downloading' | 'extracting' | 'installing-deps' | 'completed' | 'failed';

/** 安装进度信息 */
export interface InstallProgress {
    status: InstallStatus;
    progress: number;
    message: string;
    error?: string;
    downloadedBytes?: number;
    totalBytes?: number;
    speed?: string;
    eta?: string;
}

/** 安装选项 */
export interface InstallOptions {
    /** Chrome 版本 */
    version?: string;
    /** 下载源 */
    source?: keyof typeof DOWNLOAD_SOURCES | string;
    /** 安装路径 */
    installPath?: string;
    /** 是否安装系统依赖 */
    installDeps?: boolean;
    /** 进度回调 */
    onProgress?: (progress: InstallProgress) => void;
}

// ==================== Linux 发行版检测 ====================

export enum LinuxDistroType {
    DEBIAN = 'debian',
    FEDORA = 'fedora',
    SUSE = 'suse',
    ARCH = 'arch',
    UNKNOWN = 'unknown'
}

/**
 * 检测 Linux 发行版类型
 */
export async function detectLinuxDistro(): Promise<LinuxDistroType> {
    if (os.platform() !== 'linux') {
        return LinuxDistroType.UNKNOWN;
    }

    try {
        if (fs.existsSync('/etc/os-release')) {
            const osRelease = fs.readFileSync('/etc/os-release', 'utf8');

            if (osRelease.includes('ID=debian') || osRelease.includes('ID=ubuntu') ||
                osRelease.includes('ID_LIKE=debian')) {
                return LinuxDistroType.DEBIAN;
            }

            if (osRelease.includes('ID=fedora') || osRelease.includes('ID=rhel') ||
                osRelease.includes('ID=centos') || osRelease.includes('ID_LIKE=fedora')) {
                return LinuxDistroType.FEDORA;
            }

            if (osRelease.includes('ID=opensuse') || osRelease.includes('ID_LIKE=opensuse') ||
                osRelease.includes('ID=suse')) {
                return LinuxDistroType.SUSE;
            }

            if (osRelease.includes('ID=arch') || osRelease.includes('ID=manjaro') ||
                osRelease.includes('ID_LIKE=arch')) {
                return LinuxDistroType.ARCH;
            }
        }

        // 通过命令行工具检测
        try {
            await execAsync('apt --version');
            return LinuxDistroType.DEBIAN;
        } catch { }

        try {
            await execAsync('dnf --version');
            return LinuxDistroType.FEDORA;
        } catch { }

        try {
            await execAsync('pacman --version');
            return LinuxDistroType.ARCH;
        } catch { }

        return LinuxDistroType.UNKNOWN;
    } catch {
        return LinuxDistroType.UNKNOWN;
    }
}

// ==================== 依赖安装 ====================

/** Chrome 在 Debian/Ubuntu 上的依赖 */
const DEBIAN_CHROME_DEPS = [
    'ca-certificates',
    'fonts-liberation',
    'libasound2',
    'libatk-bridge2.0-0',
    'libatk1.0-0',
    'libatspi2.0-0',
    'libc6',
    'libcairo2',
    'libcups2',
    'libdbus-1-3',
    'libdrm2',
    'libexpat1',
    'libgbm1',
    'libglib2.0-0',
    'libgtk-3-0',
    'libnspr4',
    'libnss3',
    'libpango-1.0-0',
    'libx11-6',
    'libxcb1',
    'libxcomposite1',
    'libxdamage1',
    'libxext6',
    'libxfixes3',
    'libxkbcommon0',
    'libxrandr2',
    'wget',
    'xdg-utils',
    // 中文字体
    'fonts-noto-cjk',
    'fonts-wqy-zenhei',
];

/**
 * 检查是否有 root/sudo 权限
 */
async function hasRootAccess(): Promise<boolean> {
    if (process.getuid?.() === 0) {
        return true;
    }
    try {
        await execAsync('sudo -n true');
        return true;
    } catch {
        return false;
    }
}

/**
 * 安装 Linux 系统依赖
 */
export async function installLinuxDependencies(
    onProgress?: (progress: InstallProgress) => void
): Promise<boolean> {
    if (os.platform() !== 'linux') {
        pluginState.log('info', '非 Linux 系统，跳过依赖安装');
        return true;
    }

    const distro = await detectLinuxDistro();
    pluginState.log('info', `检测到 Linux 发行版: ${distro}`);

    if (distro !== LinuxDistroType.DEBIAN) {
        pluginState.log('warn', '当前仅支持 Debian/Ubuntu 系统的自动依赖安装');
        return true;
    }

    const hasRoot = await hasRootAccess();
    if (!hasRoot) {
        pluginState.log('warn', '没有 root 权限，跳过依赖安装');
        onProgress?.({
            status: 'installing-deps',
            progress: 0,
            message: '没有 root 权限，跳过依赖安装',
        });
        return true;
    }

    onProgress?.({
        status: 'installing-deps',
        progress: 0,
        message: '正在更新软件包列表...',
    });

    try {
        const prefix = process.getuid?.() === 0 ? '' : 'sudo ';

        // 更新包列表
        pluginState.log('info', '更新软件包列表...');
        await execAsync(`${prefix}apt-get update`);

        onProgress?.({
            status: 'installing-deps',
            progress: 20,
            message: '正在安装 Chrome 依赖...',
        });

        // 安装依赖
        pluginState.log('info', '安装 Chrome 依赖...');
        const depsStr = DEBIAN_CHROME_DEPS.join(' ');
        await execAsync(`${prefix}apt-get install -y --no-install-recommends ${depsStr}`, {
            timeout: 300000, // 5 分钟超时
        });

        onProgress?.({
            status: 'installing-deps',
            progress: 100,
            message: '依赖安装完成',
        });

        pluginState.log('info', '依赖安装完成');
        return true;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        pluginState.log('error', '依赖安装失败:', message);
        onProgress?.({
            status: 'failed',
            progress: 0,
            message: '依赖安装失败',
            error: message,
        });
        return false;
    }
}

// ==================== 下载功能 ====================

/**
 * 获取平台标识
 */
function getPlatform(): string {
    const platform = os.platform();
    const arch = os.arch();

    if (platform === 'linux') {
        return 'linux64';
    } else if (platform === 'darwin') {
        return arch === 'arm64' ? 'mac-arm64' : 'mac-x64';
    } else if (platform === 'win32') {
        return arch === 'x64' ? 'win64' : 'win32';
    }

    return 'linux64';
}

/**
 * 获取下载 URL
 */
function getDownloadUrl(version: string, source: string): string {
    const platform = getPlatform();
    const baseUrl = DOWNLOAD_SOURCES[source as keyof typeof DOWNLOAD_SOURCES] || source;
    return `${baseUrl}/${version}/${platform}/chrome-${platform}.zip`;
}

/**
 * 获取代理配置
 */
function getProxyUrl(): string | null {
    if (process.env.NO_PROXY) return null;
    return process.env.HTTPS_PROXY || process.env.https_proxy ||
        process.env.HTTP_PROXY || process.env.http_proxy || null;
}

/**
 * 下载文件
 */
async function downloadFile(
    url: string,
    savePath: string,
    onProgress?: (downloaded: number, total: number) => void
): Promise<void> {
    return new Promise((resolve, reject) => {
        const isHttps = url.startsWith('https:');
        const requester = isHttps ? https : http;

        // 确保目录存在
        const dir = path.dirname(savePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        const fileStream = fs.createWriteStream(savePath);

        const makeRequest = (requestUrl: string, redirectCount = 0) => {
            if (redirectCount > 5) {
                reject(new Error('重定向次数过多'));
                return;
            }

            const urlObj = new URL(requestUrl);
            const options: https.RequestOptions = {
                hostname: urlObj.hostname,
                port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
                path: urlObj.pathname + urlObj.search,
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                },
                timeout: 30000,
            };

            const req = (requestUrl.startsWith('https:') ? https : http).request(options, (res) => {
                // 处理重定向
                if (res.statusCode && [301, 302, 307, 308].includes(res.statusCode)) {
                    const redirectUrl = res.headers.location;
                    if (redirectUrl) {
                        const finalUrl = redirectUrl.startsWith('http')
                            ? redirectUrl
                            : new URL(redirectUrl, requestUrl).toString();
                        makeRequest(finalUrl, redirectCount + 1);
                        return;
                    }
                }

                if (res.statusCode && res.statusCode >= 400) {
                    reject(new Error(`HTTP 错误: ${res.statusCode}`));
                    return;
                }

                const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
                let downloadedBytes = 0;

                res.on('data', (chunk) => {
                    downloadedBytes += chunk.length;
                    onProgress?.(downloadedBytes, totalBytes);
                });

                res.pipe(fileStream);

                fileStream.on('finish', () => {
                    fileStream.close();
                    resolve();
                });

                fileStream.on('error', (err) => {
                    fs.unlink(savePath, () => { });
                    reject(err);
                });
            });

            req.on('error', (err) => {
                fs.unlink(savePath, () => { });
                reject(err);
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('请求超时'));
            });

            req.end();
        };

        makeRequest(url);
    });
}

// ==================== 解压功能 ====================

/**
 * 解压 ZIP 文件（使用系统 unzip 命令）
 */
async function extractZip(zipPath: string, extractPath: string): Promise<void> {
    if (!fs.existsSync(zipPath)) {
        throw new Error(`ZIP 文件不存在: ${zipPath}`);
    }

    // 确保目录存在
    if (!fs.existsSync(extractPath)) {
        fs.mkdirSync(extractPath, { recursive: true });
    }

    const platform = os.platform();

    if (platform === 'win32') {
        // Windows 使用 PowerShell
        await execAsync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractPath}' -Force"`);
    } else {
        // Linux/macOS 使用 unzip
        await execAsync(`unzip -o "${zipPath}" -d "${extractPath}"`);
    }
}

// ==================== 主安装函数 ====================

/** 当前安装进度 */
let currentInstallProgress: InstallProgress = {
    status: 'idle',
    progress: 0,
    message: '',
};

/** 安装任务是否正在运行 */
let isInstalling = false;

/**
 * 获取当前安装进度
 */
export function getInstallProgress(): InstallProgress {
    return { ...currentInstallProgress };
}

/**
 * 检查是否正在安装
 */
export function isInstallingChrome(): boolean {
    return isInstalling;
}

/**
 * 获取默认安装路径
 */
export function getDefaultInstallPath(): string {
    const platform = os.platform();
    if (platform === 'win32') {
        return path.join(process.env.LOCALAPPDATA || 'C:\\', 'puppeteer', 'chrome');
    } else {
        return path.join(os.homedir(), '.cache', 'puppeteer', 'chrome');
    }
}

/**
 * 获取 Chrome 可执行文件路径
 */
export function getChromeExecutablePath(installPath: string): string {
    const platform = os.platform();
    const platformDir = getPlatform();

    if (platform === 'win32') {
        return path.join(installPath, `chrome-${platformDir}`, 'chrome.exe');
    } else if (platform === 'darwin') {
        return path.join(installPath, `chrome-${platformDir}`, 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing');
    } else {
        return path.join(installPath, `chrome-${platformDir}`, 'chrome');
    }
}

/**
 * 检查 Chrome 是否已安装
 */
export function isChromeInstalled(installPath?: string): boolean {
    const targetPath = installPath || getDefaultInstallPath();
    const execPath = getChromeExecutablePath(targetPath);
    return fs.existsSync(execPath);
}

/**
 * 安装 Chrome 浏览器
 */
export async function installChrome(options: InstallOptions = {}): Promise<{
    success: boolean;
    executablePath?: string;
    error?: string;
}> {
    if (isInstalling) {
        return {
            success: false,
            error: '已有安装任务正在进行中',
        };
    }

    isInstalling = true;
    const version = options.version || DEFAULT_CHROME_VERSION;
    const installPath = options.installPath || getDefaultInstallPath();
    const installDeps = options.installDeps !== false;

    const updateProgress = (progress: Partial<InstallProgress>) => {
        currentInstallProgress = {
            ...currentInstallProgress,
            ...progress,
        };
        options.onProgress?.(currentInstallProgress);
    };

    try {
        pluginState.log('info', `开始安装 Chrome ${version}`);
        pluginState.log('info', `安装路径: ${installPath}`);

        // 1. 安装系统依赖（仅 Linux）
        if (installDeps && os.platform() === 'linux') {
            updateProgress({
                status: 'installing-deps',
                progress: 0,
                message: '正在安装系统依赖...',
            });

            await installLinuxDependencies((p) => {
                updateProgress({
                    status: 'installing-deps',
                    progress: p.progress * 0.2, // 依赖安装占 20%
                    message: p.message,
                });
            });
        }

        // 2. 下载 Chrome
        updateProgress({
            status: 'downloading',
            progress: 20,
            message: '正在准备下载...',
        });

        const sources = ['NPMMIRROR', 'GOOGLE'] as const;
        let downloadSuccess = false;
        let lastError = '';

        const zipPath = path.join(os.tmpdir(), `chrome-${version}.zip`);

        for (const source of sources) {
            try {
                const url = getDownloadUrl(version, source);
                pluginState.log('info', `尝试从 ${source} 下载: ${url}`);

                updateProgress({
                    status: 'downloading',
                    progress: 20,
                    message: `正在从 ${source} 下载 Chrome...`,
                });

                const startTime = Date.now();
                let lastUpdate = startTime;

                await downloadFile(url, zipPath, (downloaded, total) => {
                    const now = Date.now();
                    if (now - lastUpdate < 500) return; // 限制更新频率
                    lastUpdate = now;

                    const elapsed = (now - startTime) / 1000;
                    const speed = downloaded / elapsed;
                    const eta = total > 0 ? (total - downloaded) / speed : 0;
                    const progress = total > 0 ? (downloaded / total) * 100 : 0;

                    updateProgress({
                        status: 'downloading',
                        progress: 20 + progress * 0.5, // 下载占 20%-70%
                        message: `正在下载 Chrome... ${progress.toFixed(1)}%`,
                        downloadedBytes: downloaded,
                        totalBytes: total,
                        speed: `${(speed / 1024 / 1024).toFixed(2)} MB/s`,
                        eta: `${Math.ceil(eta)}s`,
                    });
                });

                downloadSuccess = true;
                pluginState.log('info', `从 ${source} 下载成功`);
                break;
            } catch (error) {
                lastError = error instanceof Error ? error.message : String(error);
                pluginState.log('warn', `从 ${source} 下载失败: ${lastError}`);
            }
        }

        if (!downloadSuccess) {
            throw new Error(`所有下载源都失败: ${lastError}`);
        }

        // 3. 解压
        updateProgress({
            status: 'extracting',
            progress: 70,
            message: '正在解压 Chrome...',
        });

        pluginState.log('info', '正在解压...');
        await extractZip(zipPath, installPath);

        // 清理 ZIP 文件
        try {
            fs.unlinkSync(zipPath);
        } catch { }

        // 4. 设置执行权限（Linux/macOS）
        const execPath = getChromeExecutablePath(installPath);
        if (os.platform() !== 'win32' && fs.existsSync(execPath)) {
            await execAsync(`chmod +x "${execPath}"`);
        }

        // 5. 验证安装
        if (!fs.existsSync(execPath)) {
            throw new Error('安装验证失败：Chrome 可执行文件不存在');
        }

        updateProgress({
            status: 'completed',
            progress: 100,
            message: 'Chrome 安装完成',
        });

        pluginState.log('info', `Chrome 安装完成: ${execPath}`);

        return {
            success: true,
            executablePath: execPath,
        };

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        pluginState.log('error', 'Chrome 安装失败:', message);

        updateProgress({
            status: 'failed',
            progress: 0,
            message: '安装失败',
            error: message,
        });

        return {
            success: false,
            error: message,
        };
    } finally {
        isInstalling = false;
    }
}

/**
 * 获取已安装的 Chrome 信息
 */
export async function getInstalledChromeInfo(installPath?: string): Promise<{
    installed: boolean;
    executablePath?: string;
    version?: string;
}> {
    const targetPath = installPath || getDefaultInstallPath();
    const execPath = getChromeExecutablePath(targetPath);

    if (!fs.existsSync(execPath)) {
        return { installed: false };
    }

    try {
        const { stdout } = await execAsync(`"${execPath}" --version`);
        const version = stdout.trim().replace(/^Google Chrome\s*/i, '').replace(/^Chromium\s*/i, '');

        return {
            installed: true,
            executablePath: execPath,
            version,
        };
    } catch {
        return {
            installed: true,
            executablePath: execPath,
        };
    }
}
