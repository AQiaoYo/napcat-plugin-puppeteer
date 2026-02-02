# napcat-plugin-puppeteer

NapCat Puppeteer 渲染服务插件 - 提供 HTML/模板截图渲染 API，供其他插件调用。

## 功能特性

- 🎨 **HTML 渲染截图** - 支持 HTML 字符串、URL、本地文件
- 📝 **模板语法** - 支持 `{{key}}` 模板变量替换
- 📐 **灵活配置** - 自定义视口、选择器、图片格式
- 📄 **分页截图** - 支持长页面自动分页
- 🌐 **WebUI 管理** - 可视化控制面板
- 🔓 **插件间通信** - 无需认证，直接调用

## 安装

1. 将 `dist` 目录复制到 NapCat 插件目录
2. 确保系统已安装 Chrome/Chromium 浏览器
3. 在 WebUI 配置浏览器路径（可选，默认自动检测）

---

## 快速开始

### API 路径说明

插件提供两种 API 路径：

#### 🟢 无认证 API（推荐，供其他插件调用）

```
{NapCat服务地址}/plugin/napcat-plugin-puppeteer/api/{端点}
```

**示例：**
```
http://localhost:6099/plugin/napcat-plugin-puppeteer/api/render
http://localhost:6099/plugin/napcat-plugin-puppeteer/api/screenshot
http://localhost:6099/plugin/napcat-plugin-puppeteer/api/status
```

> ✅ **推荐使用此路径**，无需认证，适合插件间通信

#### � 需认证 API（WebUI 管理）

```
{NapCat服务地址}/api/Plugin/ext/napcat-plugin-puppeteer/{端点}
```

> 需要 WebUI 登录 Token，用于配置管理、浏览器控制等操作

---

### 最简调用示例

```javascript
// 渲染 HTML 并获取截图（使用无认证 API）
const response = await fetch('http://localhost:6099/plugin/napcat-plugin-puppeteer/api/render', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        html: '<h1 style="color: red;">Hello World!</h1>',
        encoding: 'base64'
    })
});

const result = await response.json();
console.log(result.data); // Base64 编码的 PNG 图片
```

> 💡 请将 `localhost:6099` 替换为你实际的 NapCat 服务地址和端口

---

## API 端点详解

### 核心渲染服务

#### 1. HTML 渲染接口 (POST /render)

**无认证路径:** `http://{host}/plugin/napcat-plugin-puppeteer/api/render`

**描述:** 将 HTML 模板渲染为图片，支持模板变量替换。

**Request Body (JSON):**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `html` | string | 是 | HTML 模板字符串 |
| `data` | object | 否 | 模板变量数据，用于替换 `{{key}}` |
| `selector` | string | 否 | 截图元素选择器，默认 `body` |
| `encoding` | string | 否 | 返回编码: `base64` (默认) 或 `binary` |
| `type` | string | 否 | 图片格式: `png` (默认) / `jpeg` / `webp` |
| `quality` | number | 否 | 图片质量 1-100 (仅 jpeg/webp) |
| `omitBackground` | boolean | 否 | 透明背景，默认 `false` |
| `setViewport` | object | 否 | 视口设置 `{ width, height, deviceScaleFactor }` |
| `waitForSelector` | string | 否 | 等待指定元素出现后再截图 |
| `waitForTimeout` | number | 否 | 额外等待时间 (ms) |

**示例请求:**

```javascript
const response = await fetch('http://localhost:6099/plugin/napcat-plugin-puppeteer/api/render', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        html: `
            <div style="padding: 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
                <h1 style="color: white; font-size: 48px;">{{title}}</h1>
                <p style="color: rgba(255,255,255,0.8);">{{content}}</p>
            </div>
        `,
        data: {
            title: '欢迎使用',
            content: '这是一个渲染示例'
        },
        encoding: 'base64',
        setViewport: {
            width: 800,
            height: 600,
            deviceScaleFactor: 2
        }
    })
});

const result = await response.json();
if (result.code === 0) {
    // result.data 是 Base64 编码的图片
    // result.time 是渲染耗时 (ms)
}
```

**响应示例:**

```json
{
    "code": 0,
    "data": "iVBORw0KGgoAAAANSUhEUgAA...",
    "time": 156
}
```

---

#### 2. 通用截图接口 (POST /screenshot)

**无认证路径:** `http://{host}/plugin/napcat-plugin-puppeteer/api/screenshot`

**描述:** 通用截图接口，支持 URL、本地文件路径或 HTML 字符串。

**Request Body (JSON):**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `file` | string | 是 | 目标内容 (URL / HTML字符串 / 本地文件路径) |
| `file_type` | string | 否 | 内容类型: `auto` (默认) / `url` / `htmlString` / `file` |
| `selector` | string | 否 | 截图元素选择器，默认 `body` |
| `encoding` | string | 否 | 返回编码: `base64` (默认) 或 `binary` |
| `type` | string | 否 | 图片格式: `png` (默认) / `jpeg` / `webp` |
| `quality` | number | 否 | 图片质量 1-100 (仅 jpeg/webp) |
| `fullPage` | boolean | 否 | 全页面截图，默认 `false` |
| `omitBackground` | boolean | 否 | 透明背景，默认 `false` |
| `data` | object | 否 | 模板变量数据 |
| `setViewport` | object | 否 | 视口设置 `{ width, height, deviceScaleFactor }` |
| `waitForSelector` | string | 否 | 等待指定元素出现后再截图 |
| `waitForTimeout` | number | 否 | 额外等待时间 (ms) |
| `headers` | object | 否 | 自定义请求头 (仅 URL 模式) |
| `multiPage` | object | 否 | 分页截图配置 |

**URL 截图示例:**

```javascript
const response = await fetch('http://localhost:6099/plugin/napcat-plugin-puppeteer/api/screenshot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        file: 'https://www.baidu.com',
        file_type: 'url',
        encoding: 'base64',
        setViewport: {
            width: 1920,
            height: 1080,
            deviceScaleFactor: 1
        },
        waitForTimeout: 1000  // 等待 1 秒确保页面加载完成
    })
});
```

**HTML 字符串截图示例:**

```javascript
const response = await fetch('http://localhost:6099/plugin/napcat-plugin-puppeteer/api/screenshot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        file: '<div style="padding:20px;"><h1>Hello</h1></div>',
        file_type: 'htmlString',
        selector: 'div',
        encoding: 'base64'
    })
});
```

---

#### 3. 快速 URL 截图 (GET /screenshot)

**无认证路径:** `http://{host}/plugin/napcat-plugin-puppeteer/api/screenshot?url=...`

**描述:** 通过 Query 参数进行快速 URL 截图，适合调试和简单场景。

**Query Parameters:**

| 参数 | 必填 | 说明 |
|------|------|------|
| `url` | 是 | 目标网页 URL |
| `width` | 否 | 视口宽度 (默认 1280) |
| `height` | 否 | 视口高度 (默认 800) |
| `selector` | 否 | 元素选择器 |
| `raw` | 否 | 如为 `true`，直接返回 image/png 流而非 JSON |

**示例:**

```
GET http://localhost:6099/plugin/napcat-plugin-puppeteer/api/screenshot?url=https://example.com&width=1280&height=800
```

**直接获取图片流:**

```
GET http://localhost:6099/plugin/napcat-plugin-puppeteer/api/screenshot?url=https://example.com&raw=true
```

---

### 浏览器实例控制

#### GET /browser/status

**无认证路径:** `http://{host}/plugin/napcat-plugin-puppeteer/api/browser/status`

获取浏览器连接状态、版本、PID、打开页面数等信息。

```javascript
const response = await fetch('http://localhost:6099/plugin/napcat-plugin-puppeteer/api/browser/status');
const result = await response.json();
// result.data: { connected, version, pageCount, pid, executablePath }
```

#### 浏览器管理操作（需认证）

以下接口需要 WebUI 认证 Token，路径为 `{host}/api/Plugin/ext/napcat-plugin-puppeteer/...`：

- **POST** `/browser/start` - 启动浏览器
- **POST** `/browser/stop` - 关闭浏览器
- **POST** `/browser/restart` - 重启浏览器

---

### 系统配置与状态

#### GET /status

**无认证路径:** `http://{host}/plugin/napcat-plugin-puppeteer/api/status`

获取插件整体统计信息（运行时长、渲染次数、失败次数）和公开信息。

```javascript
const response = await fetch('http://localhost:6099/plugin/napcat-plugin-puppeteer/api/status');
const result = await response.json();
// result.data: { pluginName, uptime, uptimeFormatted, enabled, browser: {...} }
```

#### GET /config (需认证)

获取当前生效的插件配置。

```javascript
// 需要认证 Token
const response = await fetch('http://localhost:6099/api/Plugin/ext/napcat-plugin-puppeteer/config', {
    headers: { 'Authorization': 'Bearer <token>' }
});
```

#### POST /config (需认证)

更新插件配置（部分浏览器参数需要重启实例生效）。

```javascript
// 需要认证 Token
await fetch('http://localhost:6099/api/Plugin/ext/napcat-plugin-puppeteer/config', {
    method: 'POST',
    headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer <token>' 
    },
    body: JSON.stringify({
        maxPages: 10,
        debug: true
    })
});
```

---

## 响应码说明

| Code | 说明 |
|------|------|
| `0` | 成功 |
| `-1` | 系统/未知错误 |
| `400` | 请求参数错误 |
| `500` | 渲染失败或浏览器错误 |

---

## 在其他 NapCat 插件中使用

### TypeScript 示例

```typescript
// 定义响应类型
interface RenderResponse {
    code: number;
    data?: string;
    message?: string;
    time?: number;
}

// 封装渲染函数
async function renderHtml(html: string, data?: Record<string, any>): Promise<string | null> {
    // 使用无认证 API 路径
    const API_BASE = 'http://localhost:6099/plugin/napcat-plugin-puppeteer/api';
    
    try {
        const response = await fetch(`${API_BASE}/render`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                html,
                data,
                encoding: 'base64',
                setViewport: {
                    width: 800,
                    height: 600,
                    deviceScaleFactor: 2
                }
            })
        });
        
        const result: RenderResponse = await response.json();
        
        if (result.code === 0 && result.data) {
            return result.data; // Base64 图片数据
        }
        
        console.error('渲染失败:', result.message);
        return null;
    } catch (error) {
        console.error('请求失败:', error);
        return null;
    }
}

// 使用示例
const imageBase64 = await renderHtml(
    '<div style="padding:20px;"><h1>{{title}}</h1><p>{{desc}}</p></div>',
    { title: '标题', desc: '描述内容' }
);

if (imageBase64) {
    // 可以直接用于发送图片消息
    // 例如: segment.image(`base64://${imageBase64}`)
}
```

### 完整插件调用示例

```typescript
// 在你的 NapCat 插件中
import type { NapCatPluginContext } from 'napcat-types';

// 使用无认证 API 路径
const PUPPETEER_API = 'http://localhost:6099/plugin/napcat-plugin-puppeteer/api';

export const plugin_init = async (ctx: NapCatPluginContext) => {
    // 监听消息，生成欢迎图片
    ctx.on('message.group', async (event) => {
        if (event.raw_message === '/welcome') {
            // 调用渲染服务
            const response = await fetch(`${PUPPETEER_API}/render`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    html: `
                        <div style="width:600px;padding:40px;background:#f0f0f0;text-align:center;">
                            <h1 style="color:#333;">欢迎 ${event.sender.nickname}!</h1>
                            <p style="color:#666;">加入时间: ${new Date().toLocaleString()}</p>
                        </div>
                    `,
                    encoding: 'base64'
                })
            });
            
            const result = await response.json();
            
            if (result.code === 0) {
                // 发送图片消息
                await ctx.sendGroupMsg(event.group_id, [
                    { type: 'image', data: { file: `base64://${result.data}` } }
                ]);
            }
        }
    });
};
```

---

## 配置项

| 配置 | 说明 | 默认值 |
|------|------|--------|
| `enabled` | 启用渲染服务 | `true` |
| `autoStart` | 插件加载时自动启动浏览器 | `true` |
| `maxPages` | 最大并发页面数 | `10` |
| `lockTimeout` | 页面锁定超时时间 (ms) | `30000` |
| `browser.executablePath` | 浏览器可执行文件路径 | 自动检测 |
| `browser.headless` | 无头模式 | `true` |
| `browser.args` | 浏览器启动参数 | `[]` |
| `defaultViewport.width` | 默认视口宽度 | `1280` |
| `defaultViewport.height` | 默认视口高度 | `800` |
| `defaultViewport.deviceScaleFactor` | 设备像素比 | `2` |
| `debug` | 调试模式 | `false` |

---

## WebUI 控制台

插件提供可视化控制台，可在 NapCat WebUI 中访问：

- **运行状态** - 查看渲染统计、浏览器状态
- **渲染测试** - 在线测试 HTML 渲染效果
- **API 文档** - 完整的 API 参考和调用示例
- **设置** - 配置浏览器参数和插件选项

---

## 开发

```bash
# 安装依赖
pnpm install

# 类型检查
npx tsc --noEmit

# 构建
pnpm run build

# 输出: dist/index.mjs
```

---

## 常见问题

### Q: 浏览器启动失败？

1. 确保系统已安装 Chrome/Chromium 浏览器
2. 在设置中配置正确的浏览器路径
3. Linux 系统可能需要添加 `--no-sandbox` 启动参数

### Q: 渲染结果为空白？

1. 检查 HTML 是否有语法错误
2. 尝试添加 `waitForTimeout` 等待页面渲染完成
3. 检查 `selector` 是否正确匹配到元素

### Q: 中文显示为方块？

确保系统安装了中文字体，或在 HTML 中使用 Web 字体。

---

## 许可证

MIT
