# PiDownloader

PiDownloader 是一款基于 Tauri v2 和 React + Rust 开发的现代化、轻量级、本地多线程下载管理器。项目包含桌面客户端以及专用的浏览器助手扩展，提供高速的文件下载、BT 任务管理与社交平台视频流嗅探接管能力。

---

## 🏗️ 项目架构

项目采用前后端分离的现代化架构开发：

```text
PiDownloader/
├── frontend/             # 前端界面 (React + Vite + TypeScript + Tailwind CSS)
├── src-tauri/            # 后端核心 (Rust + Tauri v2)
│   ├── src/core/         # 本地 SQLite 存储、核心配置、与本地 HTTP 桥接服务
│   └── src/download/     # 基于 gosh-dl 的多线程 HTTP、M3U8 HLS 以及 BT 下载引擎
├── chrome-extension/     # 浏览器助手扩展 (MV3, 支持下载捕获、X/TikTok 视频嗅探)
└── docs/                 # 项目设计规范与技术结构设计文档
```

---

## ✨ 核心特性

- **多线程下载加速**：内置原生 Rust 编写的高效下载引擎（gosh-dl），并**深度集成 Aria2 下载后端**（支持双下载内核一键切换，自带本地 Aria2 守护进程一键下载与自动更新），支持 HTTP/HTTPS 极速并发请求。
- **HLS/M3U8 视频下载与混流**：自动解析 m3u8 索引文件并并行下载分片，**集成 FFmpeg 音视频合并与混流核心**（支持双轨分离流自动封装、系统全局 FFmpeg 自动接入与本地一键安装），一键无损合成完整 MP4。
- **BT/BitTorrent 下载**：支持 BT 种子解析、磁力链接解析及任务下载。
- **浏览器接管（Bridge）**：提供 Chrome/Edge MV3 扩展，在浏览器发起下载时自动拦截并交由桌面端处理，支持自动唤起主窗口与参数配置热保存。
- **网页视频流嗅探**：在 Twitter/X 以及 TikTok 页面自动嗅探流媒体，支持在网页端直接预览，并一键推送到桌面端进行多线程下载。具备智能视口避让及多视频精准关联定位。
- **鉴权下载支持**：自动同步浏览器的 Cookie、User-Agent 和 Referer 请求头，无缝下载需要登录权限的文件。

---

## 🛠️ 运行与开发

### 1. 桌面端开发环境配置
需确保您的计算机已安装以下环境：
- [Rust](https://www.rust-lang.org/) (1.77.2+)
- [Node.js](https://nodejs.org/) (推荐 LTS 版本)

### 2. 启动开发服务器
您可以直接运行根目录下的脚本，或者手动启动：

**使用批处理/脚本启动：**
- **Windows**: 双击运行根目录下的 `dev.bat`
- **macOS/Linux**: 运行 `chmod +x dev.sh && ./dev.sh`

**手动启动命令行：**
1. 进入前端目录安装依赖：
   ```bash
   cd frontend
   npm install
   ```
2. 在前端或 `src-tauri` 目录使用 Tauri CLI 启动：
   ```bash
   npm run tauri dev
   ```

### 3. 安装浏览器扩展
1. 打开 Chrome/Edge 浏览器，进入 `chrome://extensions/`。
2. 开启右上角的 **开发者模式**。
3. 点击 **加载已解压的扩展程序**，选择项目根目录下的 `chrome-extension` 目录。
4. 启动 PiDownloader 桌面客户端。
5. 在扩展程序选项页中点击「配对」按钮自动生成认证 Token，并启用「下载接管」服务。

---

## 🔒 隐私与安全说明 (Privacy Policy)

PiDownloader 坚持**本地优先 (Local-First)** 和**零隐式上传**的设计原则：

1. **纯本地运行**：您的下载记录、任务状态、设置配置均保存在本地 SQLite 数据库和本地配置文件中，绝对不会上传至任何第三方云端服务器。
2. **安全的环回通信**：浏览器扩展与桌面客户端之间的任务接管、配对和状态查询，均在本地回环网络 `127.0.0.1` 完成，且所有通信请求均受到配对时随机生成的运行时 Token 签名保护，防止外部恶意请求操纵客户端。
3. **Cookie 与鉴权数据安全**：为了支持登录后才能下载的文件，扩展程序会读取下载 URL 对应的必要 Cookie 随任务一并发送给桌面客户端。此过程完全在本地（浏览器 -> 127.0.0.1 桌面端）流转，绝不经过外部任何代理。
4. **视频嗅探限制**：视频嗅探相关的内容脚本限制仅在特定社交站点（`x.com`、`twitter.com`、`*.tiktok.com`）生效，不监听其他无关网页，也不会追踪您的日常网页浏览历史。
