 # Puppeteer WebUI

基于 React + TypeScript + Tailwind CSS 的 Puppeteer 渲染服务控制台。

## 技术栈

- **React 18** - UI 框架
- **TypeScript** - 类型安全
- **Vite** - 构建工具
- **Tailwind CSS** - 样式框架
- **Lucide React** - 图标库

## 项目结构

```
src/webui/
├── index.html          # 入口 HTML
├── package.json        # 依赖配置
├── vite.config.ts      # Vite 配置
├── tailwind.config.js  # Tailwind 配置
├── tsconfig.json       # TypeScript 配置
└── src/
    ├── main.tsx        # React 入口
    ├── App.tsx         # 主应用组件
    ├── index.css       # 全局样式
    ├── types.ts        # 类型定义
    ├── vite-env.d.ts   # Vite 类型声明
    ├── components/     # 通用组件
    │   ├── Header.tsx
    │   ├── Sidebar.tsx
    │   └── ToastContainer.tsx
    ├── hooks/          # React Hooks
    │   ├── useStatus.ts
    │   ├── useTheme.ts
    │   └── useToast.ts
    ├── pages/          # 页面组件
    │   ├── StatusPage.tsx
    │   ├── TestPage.tsx
    │   ├── ApiPage.tsx
    │   ├── SettingsPage.tsx
    │   └── ChromePage.tsx
    └── utils/          # 工具函数
        └── api.ts
```

## 开发

```bash
# 进入 webui 目录
cd src/webui

# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build
```

## 功能页面

1. **运行状态** - 查看插件和浏览器状态，控制浏览器生命周期
2. **渲染测试** - 测试 HTML/URL 渲染效果
3. **API 文档** - 接口调用参考
4. **设置** - 插件配置管理
5. **Chrome 安装** - 安装和管理 Chrome 浏览器

## 构建输出

构建后的文件输出到 `src/webui/dist/` 目录，最终会被复制到插件的 `dist/webui/` 目录。
