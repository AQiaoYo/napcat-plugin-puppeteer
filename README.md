# napcat-plugin-puppeteer

> [!WARNING]
> 此插件目前处于项目刚完成阶段，可能存在较多预期外的问题。如果您遇到 bug，欢迎在 [Issues](https://github.com/AQiaoYo/napcat-plugin-puppeteer/issues) 中进行反馈。
> **请注意：** 提交反馈时请保持基本的尊重与礼貌，开发者并不欠你任何东西，无礼的言论将被直接忽视。

## 目录

- [napcat-plugin-puppeteer](#napcat-plugin-puppeteer)
  - [目录](#目录)
  - [项目简介](#项目简介)
  - [鸣谢](#鸣谢)
  - [功能亮点](#功能亮点)
  - [架构与核心模块](#架构与核心模块)
  - [运行前准备](#运行前准备)
  - [安装与部署](#安装与部署)
    - [通过 WebUI 插件市场安装（推荐）](#通过-webui-插件市场安装推荐)
    - [手动安装（发布版）](#手动安装发布版)
    - [从源码构建](#从源码构建)
  - [运行时行为](#运行时行为)
  - [API 参考](#api-参考)
    - [基础信息](#基础信息)
    - [核心接口](#核心接口)
    - [`/screenshot` 请求体（POST）](#screenshot-请求体post)
    - [`/render` 请求体（POST）](#render-请求体post)
    - [管理接口（需认证）](#管理接口需认证)
  - [响应结构与状态码](#响应结构与状态码)
  - [配置项](#配置项)
  - [WebUI 控制台](#webui-控制台)
  - [插件内二次开发](#插件内二次开发)
  - [本地开发指南](#本地开发指南)
  - [故障排查](#故障排查)
  - [许可证](#许可证)

## 项目简介

`napcat-plugin-puppeteer` 是一款为 NapCat 打造的后台渲染插件。插件基于 `puppeteer-core` 提供 Chromium 截图能力，Surfacing 为两个层面：

- **HTTP API**：其它 NapCat 插件或外部系统可通过 NapCat 提供的 HTTP 服务直接调用。
- **WebUI 控制台**：在 NapCat WebUI 中提供管理界面，用于浏览器生命周期控制、在线调试与配置。

项目使用 TypeScript + Vite 构建，产物位于 `dist/index.mjs`，可直接投放到 NapCat 插件目录使用。

## 鸣谢

本插件的实现思路参考了 [karin-puppeteer](https://github.com/KarinJS/karin-puppeteer)

## 功能亮点

- � **多源输入**：支持网页 URL、本地文件 (`file://`)、原始 HTML 字符串。
- 🧩 **模板渲染**：内置 `{{key}}` 占位符替换，可快速生成动态内容。
- �️ **截图策略**：支持单元素、全页面以及按像素高度分页输出。
- ⚙️ **弹性配置**：视口大小、设备像素比、等待策略、HTTP 头部均可定制。
- � **并发控制**：内建页面信号量，按照 `maxPages` 限制同时渲染数量，避免浏览器过载。
- 🧠 **状态可观测**：实时查询浏览器状态、总渲染次数、失败统计与运行时长。
- 🌐 **一体化管理**：WebUI 集成状态面板、渲染调试、配置面板、API 文档。

## 架构与核心模块

```
┌────────────────────────────────────────────┐
│ src/index.ts                               │
│ NapCat 生命周期、路由注册、对外导出           │
├──────────────────────┬─────────────────────┤
│ src/core/state.ts    │ 全局状态单例、配置读写 │
│ src/config.ts        │ 默认配置 + WebUI Schema │
├──────────────────────┼─────────────────────┤
│ src/services/puppeteer-service.ts          │
│ 浏览器启动、页面调度、截图渲染核心逻辑        │
├──────────────────────┴─────────────────────┤
│ src/webui/           │ 控制台前端资源         │
└────────────────────────────────────────────┘
```

- `src/index.ts`：实现 `plugin_init` 等 NapCat 生命周期钩子，注册 `/plugin/{id}/api`（无认证）与 `/api/Plugin/ext/{id}`（需认证）两组路由，并暴露 `screenshot`、`renderHtml` 等函数。
- `src/core/state.ts`：`pluginState` 单例负责日志、配置文件读写、运行状态统计以及 NapCat API 调用代理。
- `src/services/puppeteer-service.ts`：封装浏览器启动、并发页面管理、模板渲染、分页截图等核心能力。
- `vite.config.ts`：通过 Vite 打包 TypeScript，内联 `puppeteer-core` 以便插件在目标环境独立运行。

## 运行前准备

- 安装 [NapCat](https://napneko.github.io/napcat/) 并启用插件管理功能。
- 系统需安装可执行的 Chromium 内核浏览器（Chrome、Edge 或 Chromium）。插件会自动检测常见路径，若失败需手动配置。
- 建议安装 `pnpm`，方便从源码构建。

## 安装与部署

### 通过 WebUI 插件市场安装（推荐）

1. 登录 NapCat WebUI。
2. 进入「插件市场」。
3. 搜索 `napcat-plugin-puppeteer`。
4. 点击「安装」并等待完成。

### 手动安装（发布版）

1. 访问 [GitHub Releases](https://github.com/AQiaoYo/napcat-plugin-puppeteer/releases) 下载最新发布包。
2. 解压并将文件夹放入 NapCat 插件目录（通常为 `%NAPCAT%/data/plugins/napcat-plugin-puppeteer`）。
3. 重启 NapCat 或在 WebUI 中重新扫描插件。

### 从源码构建

```powershell
pnpm install
pnpm run build
```

构建流程会：

- 使用 Vite 将 `src/index.ts` 打包成 `dist/index.mjs`。
- 自动将 `src/webui` 复制到 `dist/webui`。
- 精简 `package.json` 后同步到 `dist/package.json`（移除开发依赖、脚本）。

## 运行时行为

- **生命周期**：`plugin_init` 读取配置、尝试启动浏览器、注册路由；`plugin_cleanup` 负责关闭浏览器。
- **HTTP 路径**：
  - 无认证：`/plugin/napcat-plugin-puppeteer/api/*`，用于插件间调用。
  - 需认证：`/api/Plugin/ext/napcat-plugin-puppeteer/*`，用于 WebUI 管理操作。
- **浏览器调度**：`puppeteer-service` 以信号量方式限制并发页面数量；每次任务都会调用 `acquirePage → screenshot → releasePage` 流程。
- **默认视口**：由 `browser.defaultViewportWidth/Height/deviceScaleFactor` 控制，调用时可通过请求覆盖。
- **统计信息**：`stats.totalRenders` 与 `stats.failedRenders` 会通过 `/status`、`/browser/status` 对外暴露。

## API 参考

### 基础信息

| 分组 | 基础路径 | 是否需要认证 | 说明 |
| ---- | -------- | ------------ | ---- |
| 公共 API | `/plugin/napcat-plugin-puppeteer/api` | 否 | 插件间调用、渲染服务入口 |
| 管理 API | `/api/Plugin/ext/napcat-plugin-puppeteer` | 是 | WebUI 使用，需携带 NapCat token |

### 核心接口

| 方法 | 路径 | 说明 |
| ---- | ---- | ---- |
| `GET` | `/status` | 查询插件运行状态、浏览器统计 |
| `GET` | `/browser/status` | 查询浏览器连接信息、版本、累计渲染数 |
| `GET` | `/screenshot` | 快速 URL 截图；支持 `raw=true` 直接返回图片流 |
| `POST` | `/screenshot` | 通用截图入口，支持 URL/HTML/文件、分页、多种编码 |
| `POST` | `/render` | HTML 模板渲染并截图（`file` 或 `html` 二选一） |

### `/screenshot` 请求体（POST）

| 字段 | 类型 | 默认值 | 说明 |
| ---- | ---- | ---- | ---- |
| `file` | `string` | - | 必填，URL / HTML / file:// |
| `file_type` | `'auto' \| 'htmlString'` | `auto` | 强制解释输入类型 |
| `data` | `Record<string, any>` | - | 模板变量（仅 HTML 模式） |
| `selector` | `string` | `body` | 页内目标选择器 |
| `encoding` | `'base64' \| 'binary'` | `base64` | 返回编码 |
| `type` | `'png' \| 'jpeg' \| 'webp'` | `png` | 图片格式 |
| `quality` | `number` | - | 1-100，仅对 `jpeg/webp` 生效 |
| `fullPage` | `boolean` | `false` | 是否截取整页 |
| `omitBackground` | `boolean` | `false` | 是否移除背景（透明） |
| `multiPage` | `boolean \| number` | `false` | 分页高度；`true` 等同 2000px |
| `setViewport` | `{ width,height,deviceScaleFactor }` | - | 覆盖默认视口 |
| `pageGotoParams` | `{ waitUntil, timeout }` | `{ waitUntil:'networkidle0' }` | 页面加载策略 |
| `waitForSelector` | `string` | - | 等待元素出现后截图 |
| `waitForTimeout` | `number` | - | 额外等待毫秒数 |
| `headers` | `Record<string,string>` | - | 请求头（仅 URL 模式） |

成功时返回 `{ code:0, data, time }`。当 `encoding=base64` 且 `multiPage=true` 时 `data` 为 Base64 数组。

### `/render` 请求体（POST）

接受字段与 `/screenshot` 大体一致，额外支持：

- `html`：直接传入的 HTML 字符串；
- `file`：当需加载本地文件或外部链接时使用；
- 如果同时传入 `html` 和 `file`，优先使用 `html`。

### 管理接口（需认证）

| 方法 | 路径 | 用途 |
| ---- | ---- | ---- |
| `GET` | `/config` | 读取当前运行配置 |
| `POST` | `/config` | 合并并保存配置（自动写入磁盘） |
| `POST` | `/browser/start` | 启动浏览器实例 |
| `POST` | `/browser/stop` | 关闭浏览器实例 |
| `POST` | `/browser/restart` | 重启浏览器实例 |

## 响应结构与状态码

所有接口遵循统一结构：

```json
{
  "code": 0,
  "data": {},
  "message": "可选的错误描述",
  "time": 123
}
```

| code | 说明 |
| ---- | ---- |
| `0` | 成功 |
| `-1` | 未定义异常、Puppeteer 内部错误 |
| `400` | 请求参数缺失或不合法 |
| `500` | 浏览器渲染失败、页面超时等 |

## 配置项

插件配置保存在 NapCat 分配的 `config.json`，默认值见 `src/config.ts`。

| 键 | 说明 | 默认值 |
| --- | --- | --- |
| `enabled` | 是否启用渲染服务 | `true` |
| `debug` | 是否输出调试日志（会在 log 中打印参数、用时） | `false` |
| `browser.executablePath` | 指定浏览器路径，留空时自动检测 | `""` |
| `browser.headless` | 是否使用无头模式 | `true` |
| `browser.args` | 浏览器启动参数数组 | 预置一组无头环境友好参数 |
| `browser.maxPages` | 并发页面上限 | `5` |
| `browser.timeout` | 页面导航与等待默认超时（毫秒） | `30000` |
| `browser.defaultViewportWidth` | 默认视口宽度 | `1280` |
| `browser.defaultViewportHeight` | 默认视口高度 | `800` |
| `browser.deviceScaleFactor` | 默认像素密度 | `2` |

在 WebUI 中更改配置会自动调用 `plugin_on_config_change` 保存；也可通过管理 API 写入整块配置。

## WebUI 控制台

访问 NapCat WebUI → 插件管理 → 「Puppeteer 渲染服务」，即可使用内置控制台（`src/webui/dashboard.html`）：

- **概览**：展示插件运行时间、浏览器状态、渲染统计。
- **浏览器控制**：一键启动/停止/重启浏览器实例。
- **渲染调试**：可在线编辑 HTML 模板并立即查看输出图片。
- **API 文档**：快速查看请求示例、字段说明。

控制台静态资源在插件加载时挂载至 `/plugin/{pluginId}/page/puppeteer-dashboard`。

## 插件内二次开发

除了 HTTP 调用，你也可以在 NapCat 插件代码中直接引入本插件导出的函数（需要 NapCat 支持插件依赖加载）：

```typescript
import { renderHtml, screenshotUrl } from 'napcat-plugin-puppeteer';

const image = await renderHtml('<h1>{{msg}}</h1>', {
  data: { msg: 'Hello NapCat' },
  selector: 'h1',
});

if (image.status) {
  await ctx.sendGroupMsg(event.group_id, [
    { type: 'image', data: { file: `base64://${image.data}` } },
  ]);
}
```

若运行环境无法直接引用模块，仍可通过 HTTP 接口调用，示例如下：

```typescript
const res = await fetch('http://localhost:6099/plugin/napcat-plugin-puppeteer/api/render', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    html: '<div style="padding:24px"><h2>{{title}}</h2></div>',
    data: { title: 'NapCat 欢迎你' },
    encoding: 'base64',
  }),
});

const result = await res.json();
if (result.code === 0) {
  // result.data 即 Base64 字符串，可直接组装 CQ 码或 OneBot segment
}
```

## 本地开发指南

- **依赖管理**：使用 `pnpm install` 安装依赖；项目为 ESM 模式（`package.json` 中 `type: "module"`）。
- **类型检查**：运行 `npx tsc --noEmit` 进行静态检查。
- **持续构建**：执行 `pnpm run watch` 进入 Vite watch 模式，便于调试。
- **调试日志**：将配置项 `debug` 设为 `true`，即可在 NapCat 日志中看到详细调用信息。
- **打包排除**：`vite.config.ts` 将 Node 内置模块声明为 external，确保打包产物精简且运行时可用。

## 故障排查

- **浏览器无法启动**：
  1. 检查本机是否安装 Chrome/Edge/Chromium；
  2. 在配置中手动填写 `browser.executablePath`；
  3. Linux 环境若仍失败，可尝试在启动参数增加 `--no-sandbox`（默认已添加）。
- **截图为空白**：
  1. 确认 HTML 渲染后存在目标元素；
  2. 设置 `waitForSelector` 或 `waitForTimeout` 等待前端渲染完成；
  3. 如使用远程字体，确保网络可达。
- **中文乱码**：在宿主系统安装中文字体或在模板中引入 Web 字体。
- **渲染阻塞**：若并发量大，请调高 `browser.maxPages` 或设计队列，避免大量任务同时抢占页面。

## 许可证

MIT License © AQiaoYo
```
