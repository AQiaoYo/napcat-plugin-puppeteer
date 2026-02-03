/**
 * Chrome 浏览器安装服务
 * 参考 puppeteer-main 项目实现，支持后台下载安装 Chrome
 * 支持多平台：Windows、macOS、Linux（包括 ARM 架构）
 * 支持多种 Linux 发行版：Debian/Ubuntu、Fedora/RHEL/CentOS、Arch、openSUSE
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';
import https from 'https';
import { exec, execSync } from 'child_process';
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

// ==================== 平台类型定义 ====================

/** 平台类型 */
export const Platform = {
    WIN32: 'win32',
    WIN64: 'win64',
    MAC: 'darwin',
    MAC_ARM: 'darwin_arm',
    LINUX: 'linux',
    LINUX_ARM: 'linux_arm',
} as const;

export type PlatformValue = typeof Platform[keyof typeof Platform];

/** 浏览器类型 */
export const BrowserType = {
    CHROME: 'chrome',
    CHROMIUM: 'chromium',
    EDGE: 'edge',
    BRAVE: 'brave',
} as const;

export type BrowserTypeValue = typeof BrowserType[keyof typeof BrowserType];

/** 浏览器发布渠道 */
export const ReleaseChannel = {
    STABLE: 'stable',
    BETA: 'beta',
    DEV: 'dev',
    CANARY: 'canary',
} as const;

export type ReleaseChannelValue = typeof ReleaseChannel[keyof typeof ReleaseChannel];

/** 浏览器来源 */
export const BrowserSource = {
    DEFAULT_PATH: 'Default Path',
    REGISTRY: 'Registry',
    PATH_ENVIRONMENT: 'PATH Environment',
    PUPPETEER_CACHE: 'Puppeteer Cache',
    PLAYWRIGHT_CACHE: 'Playwright Cache',
} as const;

export type BrowserSourceValue = typeof BrowserSource[keyof typeof BrowserSource];

/** 浏览器信息 */
export interface BrowserInfo {
    type: BrowserTypeValue;
    executablePath: string;
    version?: string;
    source: BrowserSourceValue;
    channel: ReleaseChannelValue;
}

// ==================== 平台检测 ====================

/**
 * 获取当前平台
 */
export function getCurrentPlatform(): PlatformValue {
    const platform = os.platform();
    const arch = os.arch();

    if (platform === 'win32') {
        return arch === 'x64' ? Platform.WIN64 : Platform.WIN32;
    }

    if (platform === 'darwin') {
        return arch === 'arm64' ? Platform.MAC_ARM : Platform.MAC;
    }

    if (platform === 'linux') {
        return arch === 'arm64' || arch === 'arm' ? Platform.LINUX_ARM : Platform.LINUX;
    }

    return Platform.LINUX;
}

// ==================== Linux 发行版检测 ====================

export enum LinuxDistroType {
    DEBIAN = 'debian',
    FEDORA = 'fedora',
    SUSE = 'suse',
    ARCH = 'arch',
    ALPINE = 'alpine',
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

            // Debian/Ubuntu 系列
            if (osRelease.includes('ID=debian') || osRelease.includes('ID=ubuntu') ||
                osRelease.includes('ID_LIKE=debian') || osRelease.includes('ID_LIKE="debian"') ||
                osRelease.includes('ID=linuxmint') || osRelease.includes('ID=pop') ||
                osRelease.includes('ID=elementary') || osRelease.includes('ID=zorin') ||
                osRelease.includes('ID=kali') || osRelease.includes('ID=parrot')) {
                return LinuxDistroType.DEBIAN;
            }

            // Fedora/RHEL/CentOS 系列
            if (osRelease.includes('ID=fedora') || osRelease.includes('ID=rhel') ||
                osRelease.includes('ID=centos') || osRelease.includes('ID_LIKE=fedora') ||
                osRelease.includes('ID_LIKE="fedora"') || osRelease.includes('ID=rocky') ||
                osRelease.includes('ID=almalinux') || osRelease.includes('ID=ol') ||
                osRelease.includes('ID=amzn')) {
                return LinuxDistroType.FEDORA;
            }

            // openSUSE 系列
            if (osRelease.includes('ID=opensuse') || osRelease.includes('ID_LIKE=opensuse') ||
                osRelease.includes('ID_LIKE="opensuse"') || osRelease.includes('ID=suse') ||
                osRelease.includes('ID=sles')) {
                return LinuxDistroType.SUSE;
            }

            // Arch 系列
            if (osRelease.includes('ID=arch') || osRelease.includes('ID=manjaro') ||
                osRelease.includes('ID_LIKE=arch') || osRelease.includes('ID_LIKE="arch"') ||
                osRelease.includes('ID=endeavouros') || osRelease.includes('ID=garuda')) {
                return LinuxDistroType.ARCH;
            }

            // Alpine Linux
            if (osRelease.includes('ID=alpine')) {
                return LinuxDistroType.ALPINE;
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
            await execAsync('yum --version');
            return LinuxDistroType.FEDORA;
        } catch { }

        try {
            await execAsync('pacman --version');
            return LinuxDistroType.ARCH;
        } catch { }

        try {
            await execAsync('zypper --version');
            return LinuxDistroType.SUSE;
        } catch { }

        try {
            await execAsync('apk --version');
            return LinuxDistroType.ALPINE;
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

/** Chrome 在 Fedora/RHEL/CentOS 上的依赖 */
const FEDORA_CHROME_DEPS = [
    'alsa-lib',
    'atk',
    'at-spi2-atk',
    'at-spi2-core',
    'cairo',
    'cups-libs',
    'dbus-libs',
    'expat',
    'glib2',
    'gtk3',
    'libdrm',
    'libgbm',
    'libX11',
    'libxcb',
    'libXcomposite',
    'libXdamage',
    'libXext',
    'libXfixes',
    'libxkbcommon',
    'libXrandr',
    'nspr',
    'nss',
    'pango',
    'wget',
    'xdg-utils',
    // 中文字体
    'google-noto-cjk-fonts',
    'wqy-zenhei-fonts',
];

/** Chrome 在 Arch Linux 上的依赖 */
const ARCH_CHROME_DEPS = [
    'alsa-lib',
    'atk',
    'at-spi2-atk',
    'at-spi2-core',
    'cairo',
    'cups',
    'dbus',
    'expat',
    'glib2',
    'gtk3',
    'libdrm',
    'libx11',
    'libxcb',
    'libxcomposite',
    'libxdamage',
    'libxext',
    'libxfixes',
    'libxkbcommon',
    'libxrandr',
    'mesa',
    'nspr',
    'nss',
    'pango',
    'wget',
    'xdg-utils',
    // 中文字体
    'noto-fonts-cjk',
    'wqy-zenhei',
];

/** Chrome 在 openSUSE 上的依赖 */
const SUSE_CHROME_DEPS = [
    'alsa-lib',
    'atk',
    'at-spi2-atk',
    'at-spi2-core',
    'cairo',
    'cups-libs',
    'dbus-1',
    'expat',
    'glib2',
    'gtk3',
    'libdrm2',
    'libgbm1',
    'libX11-6',
    'libxcb1',
    'libXcomposite1',
    'libXdamage1',
    'libXext6',
    'libXfixes3',
    'libxkbcommon0',
    'libXrandr2',
    'mozilla-nspr',
    'mozilla-nss',
    'pango',
    'wget',
    'xdg-utils',
    // 中文字体
    'noto-sans-cjk-fonts',
];

/** Chrome 在 Alpine Linux 上的依赖 */
const ALPINE_CHROME_DEPS = [
    'chromium',
    'nss',
    'freetype',
    'harfbuzz',
    'ca-certificates',
    'ttf-freefont',
    // 中文字体
    'font-noto-cjk',
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

        switch (distro) {
            case LinuxDistroType.DEBIAN: {
                // Debian/Ubuntu 系列
                pluginState.log('info', '更新软件包列表 (apt)...');
                await execAsync(`${prefix}apt-get update`);

                onProgress?.({
                    status: 'installing-deps',
                    progress: 20,
                    message: '正在安装 Chrome 依赖 (apt)...',
                });

                pluginState.log('info', '安装 Chrome 依赖...');
                const debDepsStr = DEBIAN_CHROME_DEPS.join(' ');
                await execAsync(`${prefix}apt-get install -y --no-install-recommends ${debDepsStr}`, {
                    timeout: 300000,
                });
                break;
            }

            case LinuxDistroType.FEDORA: {
                // Fedora/RHEL/CentOS 系列
                pluginState.log('info', '安装 Chrome 依赖 (dnf/yum)...');

                onProgress?.({
                    status: 'installing-deps',
                    progress: 20,
                    message: '正在安装 Chrome 依赖 (dnf/yum)...',
                });

                const fedoraDepsStr = FEDORA_CHROME_DEPS.join(' ');
                // 尝试使用 dnf，如果失败则使用 yum
                try {
                    await execAsync(`${prefix}dnf install -y ${fedoraDepsStr}`, {
                        timeout: 300000,
                    });
                } catch {
                    await execAsync(`${prefix}yum install -y ${fedoraDepsStr}`, {
                        timeout: 300000,
                    });
                }
                break;
            }

            case LinuxDistroType.ARCH: {
                // Arch Linux 系列
                pluginState.log('info', '更新软件包数据库 (pacman)...');
                await execAsync(`${prefix}pacman -Sy --noconfirm`);

                onProgress?.({
                    status: 'installing-deps',
                    progress: 20,
                    message: '正在安装 Chrome 依赖 (pacman)...',
                });

                pluginState.log('info', '安装 Chrome 依赖...');
                const archDepsStr = ARCH_CHROME_DEPS.join(' ');
                await execAsync(`${prefix}pacman -S --noconfirm --needed ${archDepsStr}`, {
                    timeout: 300000,
                });
                break;
            }

            case LinuxDistroType.SUSE: {
                // openSUSE 系列
                pluginState.log('info', '刷新软件源 (zypper)...');
                await execAsync(`${prefix}zypper refresh`);

                onProgress?.({
                    status: 'installing-deps',
                    progress: 20,
                    message: '正在安装 Chrome 依赖 (zypper)...',
                });

                pluginState.log('info', '安装 Chrome 依赖...');
                const suseDepsStr = SUSE_CHROME_DEPS.join(' ');
                await execAsync(`${prefix}zypper install -y ${suseDepsStr}`, {
                    timeout: 300000,
                });
                break;
            }

            case LinuxDistroType.ALPINE: {
                // Alpine Linux
                pluginState.log('info', '更新软件包索引 (apk)...');
                await execAsync(`${prefix}apk update`);

                onProgress?.({
                    status: 'installing-deps',
                    progress: 20,
                    message: '正在安装 Chrome 依赖 (apk)...',
                });

                pluginState.log('info', '安装 Chrome 依赖...');
                const alpineDepsStr = ALPINE_CHROME_DEPS.join(' ');
                await execAsync(`${prefix}apk add --no-cache ${alpineDepsStr}`, {
                    timeout: 300000,
                });
                break;
            }

            default:
                pluginState.log('warn', `不支持的 Linux 发行版: ${distro}，跳过依赖安装`);
                onProgress?.({
                    status: 'installing-deps',
                    progress: 100,
                    message: `不支持的发行版 ${distro}，跳过依赖安装`,
                });
                return true;
        }

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

// ==================== 文件工具函数 ====================

/**
 * 检查文件是否存在且可执行
 */
function isExecutable(filePath: string): boolean {
    try {
        fs.accessSync(filePath, fs.constants.X_OK);
        return true;
    } catch {
        // Windows 上检查文件是否存在即可
        if (os.platform() === 'win32') {
            return fs.existsSync(filePath);
        }
        return false;
    }
}

/**
 * 检查路径是否为目录
 */
function isDirectory(dirPath: string): boolean {
    try {
        return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
    } catch {
        return false;
    }
}

/**
 * 从 Windows 文件属性获取版本
 */
function getVersionFromFileProperties(executablePath: string): string | undefined {
    try {
        const versionInfo = execSync(
            `powershell -command "(Get-Item '${executablePath}').VersionInfo.ProductVersion"`,
            { timeout: 5000, windowsHide: true }
        ).toString().trim();
        return versionInfo || undefined;
    } catch {
        return undefined;
    }
}

/**
 * 从 Linux 路径推断版本
 */
function getVersionFromLinux(executablePath: string): string | undefined {
    try {
        const dirName = path.dirname(executablePath);
        const versionMatch = dirName.match(/(\d+\.\d+\.\d+(\.\d+)?)/);
        if (versionMatch) {
            return versionMatch[1];
        }

        // 尝试读取符号链接
        try {
            const linkTarget = fs.readlinkSync(executablePath);
            if (linkTarget) {
                const linkVersionMatch = linkTarget.match(/(\d+\.\d+\.\d+(\.\d+)?)/);
                if (linkVersionMatch) {
                    return linkVersionMatch[1];
                }
            }
        } catch { }

        return undefined;
    } catch {
        return undefined;
    }
}

/**
 * 从 macOS Info.plist 获取版本
 */
function getVersionFromMacOS(executablePath: string): string | undefined {
    try {
        const appPath = executablePath.match(/(.+?)\.app/);
        if (appPath && appPath[1]) {
            const infoPlistPath = `${appPath[1]}.app/Contents/Info.plist`;
            if (fs.existsSync(infoPlistPath)) {
                try {
                    const versionInfo = execSync(
                        `defaults read "${infoPlistPath}" CFBundleShortVersionString`,
                        { timeout: 5000 }
                    ).toString().trim();
                    if (versionInfo) {
                        return versionInfo;
                    }
                } catch { }
            }
        }
        return undefined;
    } catch {
        return undefined;
    }
}

/**
 * 获取浏览器版本
 */
function getBrowserVersion(executablePath: string): string | undefined {
    if (!fs.existsSync(executablePath)) {
        return undefined;
    }

    try {
        switch (os.platform()) {
            case 'win32':
                return getVersionFromFileProperties(executablePath);
            case 'darwin':
                return getVersionFromMacOS(executablePath);
            case 'linux':
                return getVersionFromLinux(executablePath);
            default:
                return undefined;
        }
    } catch {
        return undefined;
    }
}

// ==================== 浏览器路径定义 ====================

/**
 * 获取 Chrome 浏览器的默认安装路径
 */
function getChromePath(platform: PlatformValue, channel: ReleaseChannelValue = ReleaseChannel.STABLE): string {
    switch (platform) {
        case 'win32':
        case 'win64':
            switch (channel) {
                case ReleaseChannel.STABLE:
                    return path.join(process.env['PROGRAMFILES'] || '', 'Google/Chrome/Application/chrome.exe');
                case ReleaseChannel.BETA:
                    return path.join(process.env['PROGRAMFILES'] || '', 'Google/Chrome Beta/Application/chrome.exe');
                case ReleaseChannel.DEV:
                    return path.join(process.env['PROGRAMFILES'] || '', 'Google/Chrome Dev/Application/chrome.exe');
                case ReleaseChannel.CANARY:
                    return path.join(process.env['PROGRAMFILES'] || '', 'Google/Chrome SxS/Application/chrome.exe');
            }
            break;
        case 'darwin':
        case 'darwin_arm':
            switch (channel) {
                case ReleaseChannel.STABLE:
                    return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
                case ReleaseChannel.BETA:
                    return '/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta';
                case ReleaseChannel.DEV:
                    return '/Applications/Google Chrome Dev.app/Contents/MacOS/Google Chrome Dev';
                case ReleaseChannel.CANARY:
                    return '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary';
            }
            break;
        case 'linux':
        case 'linux_arm':
            switch (channel) {
                case ReleaseChannel.STABLE:
                    return '/opt/google/chrome/chrome';
                case ReleaseChannel.BETA:
                    return '/opt/google/chrome-beta/chrome';
                case ReleaseChannel.DEV:
                    return '/opt/google/chrome-unstable/chrome';
                case ReleaseChannel.CANARY:
                    return '/opt/google/chrome-canary/chrome';
            }
            break;
    }
    return '';
}

/**
 * 获取 Chrome 浏览器的所有可能安装路径
 */
function getChromePaths(platform: PlatformValue): string[] {
    const paths: string[] = [];

    // 添加所有渠道的路径
    Object.values(ReleaseChannel).forEach(channel => {
        const chromePath = getChromePath(platform, channel);
        if (chromePath) {
            paths.push(chromePath);
        }
    });

    // 添加额外的可能路径
    if (platform === 'win32' || platform === 'win64') {
        paths.push(path.join(process.env['LOCALAPPDATA'] || '', 'Google/Chrome/Application/chrome.exe'));
        paths.push(path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google/Chrome/Application/chrome.exe'));
    } else if (platform === 'linux' || platform === 'linux_arm') {
        paths.push('/usr/bin/google-chrome');
        paths.push('/usr/bin/google-chrome-stable');
        paths.push('/usr/bin/chrome');
        paths.push('/usr/bin/chromium-browser');
        paths.push('/usr/bin/chromium');
        paths.push('/snap/bin/chromium');
        // Alpine Linux
        paths.push('/usr/bin/chromium-browser');
    }

    return paths;
}

/**
 * 获取 Edge 浏览器的默认安装路径
 */
function getEdgePath(platform: PlatformValue, channel: ReleaseChannelValue = ReleaseChannel.STABLE): string {
    switch (platform) {
        case 'win32':
        case 'win64':
            switch (channel) {
                case ReleaseChannel.STABLE:
                    return path.join(process.env['PROGRAMFILES'] || '', 'Microsoft/Edge/Application/msedge.exe');
                case ReleaseChannel.BETA:
                    return path.join(process.env['PROGRAMFILES'] || '', 'Microsoft/Edge Beta/Application/msedge.exe');
                case ReleaseChannel.DEV:
                    return path.join(process.env['PROGRAMFILES'] || '', 'Microsoft/Edge Dev/Application/msedge.exe');
                case ReleaseChannel.CANARY:
                    return path.join(process.env['PROGRAMFILES'] || '', 'Microsoft/Edge SxS/Application/msedge.exe');
            }
            break;
        case 'darwin':
        case 'darwin_arm':
            switch (channel) {
                case ReleaseChannel.STABLE:
                    return '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';
                case ReleaseChannel.BETA:
                    return '/Applications/Microsoft Edge Beta.app/Contents/MacOS/Microsoft Edge Beta';
                case ReleaseChannel.DEV:
                    return '/Applications/Microsoft Edge Dev.app/Contents/MacOS/Microsoft Edge Dev';
                case ReleaseChannel.CANARY:
                    return '/Applications/Microsoft Edge Canary.app/Contents/MacOS/Microsoft Edge Canary';
            }
            break;
        case 'linux':
        case 'linux_arm':
            switch (channel) {
                case ReleaseChannel.STABLE:
                    return '/opt/microsoft/msedge/msedge';
                case ReleaseChannel.BETA:
                    return '/opt/microsoft/msedge-beta/msedge';
                case ReleaseChannel.DEV:
                    return '/opt/microsoft/msedge-dev/msedge';
                case ReleaseChannel.CANARY:
                    return '/opt/microsoft/msedge-canary/msedge';
            }
            break;
    }
    return '';
}

/**
 * 获取 Edge 浏览器的所有可能安装路径
 */
function getEdgePaths(platform: PlatformValue): string[] {
    const paths: string[] = [];

    Object.values(ReleaseChannel).forEach(channel => {
        const edgePath = getEdgePath(platform, channel);
        if (edgePath) {
            paths.push(edgePath);
        }
    });

    if (platform === 'win32' || platform === 'win64') {
        paths.push(path.join(process.env['PROGRAMFILES(X86)'] || '', 'Microsoft/Edge/Application/msedge.exe'));
    }

    return paths;
}

/**
 * 获取 Brave 浏览器的默认安装路径
 */
function getBravePath(platform: PlatformValue): string {
    switch (platform) {
        case 'win32':
        case 'win64':
            return path.join(process.env['PROGRAMFILES'] || '', 'BraveSoftware/Brave-Browser/Application/brave.exe');
        case 'darwin':
        case 'darwin_arm':
            return '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';
        case 'linux':
        case 'linux_arm':
            return '/opt/brave.com/brave/brave';
    }
    return '';
}

/**
 * 获取 Brave 浏览器的所有可能安装路径
 */
function getBravePaths(platform: PlatformValue): string[] {
    const paths: string[] = [];
    const bravePath = getBravePath(platform);
    if (bravePath) {
        paths.push(bravePath);
    }

    if (platform === 'win32' || platform === 'win64') {
        paths.push(path.join(process.env['LOCALAPPDATA'] || '', 'BraveSoftware/Brave-Browser/Application/brave.exe'));
        paths.push(path.join(process.env['PROGRAMFILES(X86)'] || '', 'BraveSoftware/Brave-Browser/Application/brave.exe'));
    } else if (platform === 'linux' || platform === 'linux_arm') {
        paths.push('/usr/bin/brave');
        paths.push('/usr/bin/brave-browser');
        paths.push('/snap/bin/brave');
    }

    return paths;
}

// ==================== 浏览器查找函数 ====================

/**
 * 从 Windows 注册表查找 Chrome
 */
function findChromeFromRegistry(): string[] {
    if (os.platform() !== 'win32') {
        return [];
    }

    try {
        const paths: string[] = [];

        try {
            const pathValue = execSync(
                'reg query "HKEY_LOCAL_MACHINE\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe" /ve',
                { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }
            ).toString().trim();

            const pathMatch = pathValue.match(/REG_SZ\s+(.*)$/m);
            if (pathMatch && pathMatch[1]) {
                const chromePath = pathMatch[1].trim();
                if (chromePath && !paths.includes(chromePath)) {
                    paths.push(chromePath);
                }
            }
        } catch { }

        return paths;
    } catch {
        return [];
    }
}

/**
 * 从环境变量 PATH 查找浏览器
 */
function findBrowserFromPath(): string[] {
    try {
        const paths: string[] = [];
        const envPath = process.env.PATH || '';
        const pathDirs = envPath.split(path.delimiter).filter(Boolean);
        const platform = os.platform();

        const executableNames = platform === 'win32'
            ? ['chrome.exe', 'chromium.exe', 'chromium-browser.exe', 'msedge.exe', 'brave.exe']
            : ['google-chrome', 'chromium', 'chromium-browser', 'msedge', 'brave', 'brave-browser'];

        for (const dir of pathDirs) {
            for (const browserName of executableNames) {
                const browserPath = path.join(dir, browserName);
                if (isExecutable(browserPath) && !paths.includes(browserPath)) {
                    paths.push(browserPath);
                }
            }
        }

        return paths;
    } catch {
        return [];
    }
}

/**
 * 从 Puppeteer 缓存查找 Chrome
 */
function findChromeFromPuppeteer(): string[] {
    try {
        const paths: string[] = [];
        const browserName = (() => {
            if (os.platform() === 'win32') {
                return 'chrome.exe';
            } else if (os.platform() === 'darwin') {
                return 'Chromium.app/Contents/MacOS/Chromium';
            } else {
                return 'chrome';
            }
        })();

        const PUPPETEER_CACHE_DIR = path.join(os.homedir(), '.cache', 'puppeteer');

        if (!fs.existsSync(PUPPETEER_CACHE_DIR)) {
            return paths;
        }

        const revisions = fs.readdirSync(PUPPETEER_CACHE_DIR);
        for (const revision of revisions) {
            const revisionPath = path.join(PUPPETEER_CACHE_DIR, revision);
            if (!isDirectory(revisionPath)) continue;

            const versionList = fs.readdirSync(revisionPath);
            for (const version of versionList) {
                const versionPath = path.join(revisionPath, version);
                if (!isDirectory(versionPath)) continue;

                const platformList = fs.readdirSync(versionPath);
                for (const platformDir of platformList) {
                    const platformPath = path.join(versionPath, platformDir);
                    if (!isDirectory(platformPath)) continue;

                    const browserPath = path.join(platformPath, browserName);
                    if (isExecutable(browserPath)) {
                        paths.push(browserPath);
                    }
                }
            }
        }

        return paths;
    } catch {
        return [];
    }
}

/**
 * 从 Playwright 缓存查找 Chrome
 */
function findChromeFromPlaywright(): string[] {
    try {
        const paths: string[] = [];
        const PLAYWRIGHT_CACHE_DIR = path.join(os.homedir(), '.cache', 'ms-playwright');

        if (!fs.existsSync(PLAYWRIGHT_CACHE_DIR)) {
            return paths;
        }

        const browserDir = 'chromium-';
        let executableName: string;

        if (os.platform() === 'win32') {
            executableName = 'chrome.exe';
        } else if (os.platform() === 'darwin') {
            executableName = 'Chromium.app/Contents/MacOS/Chromium';
        } else {
            executableName = 'chrome';
        }

        const browserDirs = fs.readdirSync(PLAYWRIGHT_CACHE_DIR)
            .filter(dir => dir.startsWith(browserDir));

        for (const dir of browserDirs) {
            const browserPath = path.join(PLAYWRIGHT_CACHE_DIR, dir, executableName);
            if (isExecutable(browserPath)) {
                paths.push(browserPath);
            }
        }

        return paths;
    } catch {
        return [];
    }
}

/**
 * 比较版本号
 */
function compareVersions(a?: string, b?: string): number {
    if (!a) return 1;
    if (!b) return -1;
    if (a === b) return 0;

    const aParts = a.split('.').map(Number);
    const bParts = b.split('.').map(Number);

    const maxLength = Math.max(aParts.length, bParts.length);
    for (let i = 0; i < maxLength; i++) {
        const aPart = aParts[i] || 0;
        const bPart = bParts[i] || 0;

        if (aPart > bPart) return -1;
        if (aPart < bPart) return 1;
    }

    return 0;
}

/**
 * 查找系统中已安装的所有浏览器
 */
export function findInstalledBrowsers(): BrowserInfo[] {
    const results: BrowserInfo[] = [];
    const platform = getCurrentPlatform();

    // 1. 从固定路径查找 Chrome
    const chromePaths = getChromePaths(platform);
    for (const browserPath of chromePaths) {
        if (isExecutable(browserPath)) {
            let channel: ReleaseChannelValue = ReleaseChannel.STABLE;
            if (browserPath.includes('Beta')) {
                channel = ReleaseChannel.BETA;
            } else if (browserPath.includes('Dev') || browserPath.includes('unstable')) {
                channel = ReleaseChannel.DEV;
            } else if (browserPath.includes('SxS') || browserPath.includes('Canary')) {
                channel = ReleaseChannel.CANARY;
            }

            results.push({
                type: BrowserType.CHROME,
                executablePath: browserPath,
                version: getBrowserVersion(browserPath),
                source: BrowserSource.DEFAULT_PATH,
                channel,
            });
        }
    }

    // 2. 从固定路径查找 Edge
    const edgePaths = getEdgePaths(platform);
    for (const browserPath of edgePaths) {
        if (isExecutable(browserPath) && !results.some(r => r.executablePath === browserPath)) {
            let channel: ReleaseChannelValue = ReleaseChannel.STABLE;
            if (browserPath.includes('Beta')) {
                channel = ReleaseChannel.BETA;
            } else if (browserPath.includes('Dev')) {
                channel = ReleaseChannel.DEV;
            } else if (browserPath.includes('SxS') || browserPath.includes('Canary')) {
                channel = ReleaseChannel.CANARY;
            }

            results.push({
                type: BrowserType.EDGE,
                executablePath: browserPath,
                version: getBrowserVersion(browserPath),
                source: BrowserSource.DEFAULT_PATH,
                channel,
            });
        }
    }

    // 3. 从固定路径查找 Brave
    const bravePaths = getBravePaths(platform);
    for (const browserPath of bravePaths) {
        if (isExecutable(browserPath) && !results.some(r => r.executablePath === browserPath)) {
            results.push({
                type: BrowserType.BRAVE,
                executablePath: browserPath,
                version: getBrowserVersion(browserPath),
                source: BrowserSource.DEFAULT_PATH,
                channel: ReleaseChannel.STABLE,
            });
        }
    }

    // 4. 从注册表查找 (仅 Windows)
    if (os.platform() === 'win32') {
        const registryPaths = findChromeFromRegistry();
        for (const browserPath of registryPaths) {
            if (isExecutable(browserPath) && !results.some(r => r.executablePath === browserPath)) {
                results.push({
                    type: BrowserType.CHROME,
                    executablePath: browserPath,
                    version: getBrowserVersion(browserPath),
                    source: BrowserSource.REGISTRY,
                    channel: ReleaseChannel.STABLE,
                });
            }
        }
    }

    // 5. 从环境变量 PATH 查找
    const envPaths = findBrowserFromPath();
    for (const browserPath of envPaths) {
        if (!results.some(r => r.executablePath === browserPath)) {
            let type: BrowserTypeValue = BrowserType.CHROME;
            if (browserPath.includes('msedge') || browserPath.includes('edge')) {
                type = BrowserType.EDGE;
            } else if (browserPath.includes('brave')) {
                type = BrowserType.BRAVE;
            } else if (browserPath.includes('chromium')) {
                type = BrowserType.CHROMIUM;
            }

            results.push({
                type,
                executablePath: browserPath,
                version: getBrowserVersion(browserPath),
                source: BrowserSource.PATH_ENVIRONMENT,
                channel: ReleaseChannel.STABLE,
            });
        }
    }

    // 6. 从 Puppeteer 缓存查找
    const puppeteerPaths = findChromeFromPuppeteer();
    for (const browserPath of puppeteerPaths) {
        if (!results.some(r => r.executablePath === browserPath)) {
            results.push({
                type: BrowserType.CHROMIUM,
                executablePath: browserPath,
                version: getBrowserVersion(browserPath),
                source: BrowserSource.PUPPETEER_CACHE,
                channel: ReleaseChannel.STABLE,
            });
        }
    }

    // 7. 从 Playwright 缓存查找
    const playwrightPaths = findChromeFromPlaywright();
    for (const browserPath of playwrightPaths) {
        if (!results.some(r => r.executablePath === browserPath)) {
            results.push({
                type: BrowserType.CHROMIUM,
                executablePath: browserPath,
                version: getBrowserVersion(browserPath),
                source: BrowserSource.PLAYWRIGHT_CACHE,
                channel: ReleaseChannel.STABLE,
            });
        }
    }

    // 按版本号排序
    results.sort((a, b) => compareVersions(a.version, b.version));
    return results;
}

/**
 * 查找默认浏览器（按优先级：Chrome > Edge > Brave > Chromium）
 */
export function findDefaultBrowser(): BrowserInfo | undefined {
    const browsers = findInstalledBrowsers();

    // 按优先级查找
    const priorities = [BrowserType.CHROME, BrowserType.EDGE, BrowserType.BRAVE, BrowserType.CHROMIUM];

    for (const type of priorities) {
        const browser = browsers.find(b => b.type === type);
        if (browser) {
            return browser;
        }
    }

    return browsers[0];
}

// ==================== 下载功能 ====================

/**
 * 获取平台标识（用于下载）
 */
function getPlatformForDownload(): string {
    const platform = getCurrentPlatform();

    switch (platform) {
        case Platform.WIN64:
            return 'win64';
        case Platform.WIN32:
            return 'win32';
        case Platform.MAC:
            return 'mac-x64';
        case Platform.MAC_ARM:
            return 'mac-arm64';
        case Platform.LINUX:
            return 'linux64';
        case Platform.LINUX_ARM:
            // Chrome for Testing 目前不支持 Linux ARM，回退到 linux64
            pluginState.log('warn', 'Chrome for Testing 不支持 Linux ARM，尝试使用 linux64');
            return 'linux64';
        default:
            return 'linux64';
    }
}

/**
 * 获取下载 URL
 */
function getDownloadUrl(version: string, source: string): string {
    const platform = getPlatformForDownload();
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

/** 当前阶段的最高进度（防止进度回退） */
let maxProgressInCurrentStage: number = 0;

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
    const platformDir = getPlatformForDownload();

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

    // 检查是否已安装
    if (isChromeInstalled(options.installPath)) {
        const installPath = options.installPath || getDefaultInstallPath();
        const execPath = getChromeExecutablePath(installPath);
        pluginState.log('info', `Chrome 已安装: ${execPath}`);

        return {
            success: true,
            executablePath: execPath,
        };
    }

    isInstalling = true;

    // 重置进度状态
    currentInstallProgress = {
        status: 'idle',
        progress: 0,
        message: '',
    };
    maxProgressInCurrentStage = 0;

    const version = options.version || DEFAULT_CHROME_VERSION;
    const installPath = options.installPath || getDefaultInstallPath();
    const installDeps = options.installDeps !== false;

    const updateProgress = (progress: Partial<InstallProgress>) => {
        // 如果状态发生变化，重置最高进度记录
        if (progress.status && progress.status !== currentInstallProgress.status) {
            maxProgressInCurrentStage = 0;
        }

        // 在下载阶段，防止进度回退（除非状态变化）
        if (progress.progress !== undefined) {
            if (progress.status === 'downloading' ||
                (currentInstallProgress.status === 'downloading' && !progress.status)) {
                // 只允许进度前进，不允许后退
                if (progress.progress > maxProgressInCurrentStage) {
                    maxProgressInCurrentStage = progress.progress;
                } else {
                    // 使用记录的最高进度，防止回退
                    progress.progress = maxProgressInCurrentStage;
                }
            }
        }

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

                // 只更新消息，不重置进度（让 updateProgress 内部逻辑处理进度防回退）
                updateProgress({
                    status: 'downloading',
                    message: `正在从 ${source} 下载 Chrome...`,
                });

                const startTime = Date.now();
                let lastUpdate = startTime;

                await downloadFile(url, zipPath, (downloaded, total) => {
                    const now = Date.now();
                    if (now - lastUpdate < 500) return; // 限制更新频率
                    lastUpdate = now;

                    const elapsed = (now - startTime) / 1000;
                    const speed = elapsed > 0 ? downloaded / elapsed : 0;

                    // 如果服务器返回了文件大小，计算真实进度
                    // 否则只更新下载速度和已下载大小，不更新进度百分比
                    if (total > 0) {
                        const progress = (downloaded / total) * 100;
                        const eta = speed > 0 ? (total - downloaded) / speed : 0;

                        updateProgress({
                            status: 'downloading',
                            progress: 20 + progress * 0.5, // 下载占 20%-70%
                            message: `正在下载 Chrome... ${progress.toFixed(1)}%`,
                            downloadedBytes: downloaded,
                            totalBytes: total,
                            speed: `${(speed / 1024 / 1024).toFixed(2)} MB/s`,
                            eta: `${Math.ceil(eta)}s`,
                        });
                    } else {
                        // 没有 content-length，只更新下载信息，不更新进度
                        updateProgress({
                            status: 'downloading',
                            message: `正在下载 Chrome... ${(downloaded / 1024 / 1024).toFixed(1)} MB`,
                            downloadedBytes: downloaded,
                            speed: `${(speed / 1024 / 1024).toFixed(2)} MB/s`,
                        });
                    }
                });

                downloadSuccess = true;
                pluginState.log('info', `从 ${source} 下载成功`);
                break;
            } catch (error) {
                lastError = error instanceof Error ? error.message : String(error);
                pluginState.log('warn', `从 ${source} 下载失败: ${lastError}`);

                // 通知用户即将切换下载源
                const nextSourceIndex = sources.indexOf(source) + 1;
                if (nextSourceIndex < sources.length) {
                    updateProgress({
                        status: 'downloading',
                        message: `${source} 下载失败，正在切换到 ${sources[nextSourceIndex]}...`,
                    });
                }
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
        maxProgressInCurrentStage = 0;
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

/**
 * 卸载 Chrome
 */
export async function uninstallChrome(installPath?: string): Promise<{ success: boolean; error?: string }> {
    if (isInstalling) {
        return { success: false, error: '安装任务正在进行中，无法卸载' };
    }

    const targetPath = installPath || getDefaultInstallPath();
    if (!fs.existsSync(targetPath)) {
        return { success: false, error: 'Chrome 安装目录不存在' };
    }

    try {
        pluginState.log('info', `正在卸载 Chrome: ${targetPath}`);
        fs.rmSync(targetPath, { recursive: true, force: true });
        pluginState.log('info', 'Chrome 卸载完成');
        return { success: true };
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        pluginState.log('error', `卸载失败: ${message}`);
        return { success: false, error: message };
    }
}
