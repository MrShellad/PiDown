本设计书基于 **Tauri (Rust) + React/Next.js (TypeScript) + shadcn/ui** 架构，并采用纯 Rust 实现的现代异步下载引擎 **`gosh-dl`** 作为底层核心。

---

# 🛠️ PiDownloader 技术结构设计书

## 1. 软件系统整体架构 (Architecture Overview)

本应用采用**前后端进程分离、数据事件驱动**的微型桌面端架构。Rust 后端负责高并发 I/O、协议解析、守护进程及文件系统操作；Web 前端负责渲染高度自定义的“花哨”视觉界面。

```
+-----------------------------------------------------------------------+
|                       PiDownloader (Tauri App)                        |
+-----------------------------------------------------------------------+
|  [前端展示层 (UI Webview)]                                              |
|  +-----------------------+  +---------------------------------------+ |
|  | 主窗口 (Main Window)   |  | 悬浮小窗 (Float Window)                | |
|  | React + shadcn/ui     |  | HTML5 Canvas / Motion One 流光动效     | |
|  +-----------------------+  +---------------------------------------+ |
|              ^                                  ^                     |
|              |========= Tauri IPC Event ========|                     |
|              v                                  v                     |
|  [后端核心层 (Rust Runtime)]                                           |
|  +------------------------------------------------------------------+ |
|  |  Tauri Command Handler (API 路由分发)                             | |
|  +------------------------------------------------------------------+ |
|  |  StateManager (状态管理器: Arc<Mutex<AppState>>)                  | |
|  +------------------------------------------------------------------+ |
|  |  gosh-dl Engine (下载核心)                                        | |
|  |  - Async HTTP/HTTPS (Multi-segmented)                            | |
|  |  - BitTorrent Engine (DHT / PEX / Magnet)                        | |
|  +------------------------------------------------------------------+ |
|  |  Tokio Runtime (异步事件循环)                                      | |
|  +------------------------------------------------------------------+ |
+-----------------------------------------------------------------------+

```

---

## 2. 后端核心模块设计 (Rust Backend Modules)

后端采用逻辑解耦设计，确保高频下载 I/O 不会阻塞 Tauri 的主线程。

### 2.1 任务调度与状态管理 (`src-tauri/src/core/`)

* **`StateManager`**: 维护当前全局的下载任务队列（Active, Paused, Completed, Failed）。利用 `Arc<Mutex<T>>` 或 `tokio::sync::RwLock` 实现跨线程安全共享。
* **`TaskStore`**: 负责任务的持久化。使用小型的本地数据库（如 `sled` 或 `rusqlite`），记录任务的 `URL`、`GID`、下载路径、已下载分块信息（用于断点续传）。

### 2.2 `gosh-dl` 集成桥接器 (`src-tauri/src/download/`)

* **引擎初始化**: 在应用启动时，初始化 `gosh_dl::Engine`。
* **任务转换**: 将前端传来的普通 URL 或 Magnet（磁力链接）解析，包装为 `gosh_dl::Task` 提交给 `gosh-dl` 的异步运行时。
* **动态限速与控制**: 调用 `gosh-dl` 的内部 API，实现单任务或全局的 `pause()`、`resume()`、`set_max_speed()`。

### 2.3 高频事件节流推送流 (`src-tauri/src/events/`)

* **痛点隔离**: `gosh-dl` 更新下载进度的频率是微秒级的，直接转发会导致 Tauri 的 IPC 通道崩溃。
* **设计方案**: 构建一个基于 `tokio::time::interval` 的定时器（每 100ms 触发一次）。定时器去轮询 `gosh-dl` 获取当前活跃任务的 `speed`、`progress`，然后使用 `window.emit()` 节流推送给前端。

---

## 3. 前端视觉与感知层设计 (Frontend UI/UX)

前端采用极其开放的“渐进式魔改”设计，用 `shadcn/ui` 作为高可靠性交互骨架，用多层 CSS 变量支持“花哨”换肤。

### 3.1 视图分发路由 (Routing & Windows)

通过 Web 路由分发不同的窗口视图，保证主窗和小窗代码共享、逻辑隔离：

* `/` : 主控制台。包含任务列表、新建弹窗、速度折线图、设置中心。
* `/float` : 悬浮小窗。只渲染紧凑型测速盘和水波纹进度。

### 3.2 基础组件二次改造树 (`frontend/components/ui/`)

所有从 `shadcn/ui` 引入的组件进行底层变量化改造：

* **`Progress`**: 修改 `Indicator`，增加 `bg-[--primary]`，并强行植入由 `--glow-effect` 控制的 Canvas 粒子或 CSS 流光。
* **`Card` (下载任务卡片)**: 引入 `Framer Motion` 的 `AnimatePresence`。当任务新增或删除时，卡片实现带物理惯性的展开、飞出消散动效。

### 3.3 多套“花哨”皮肤的数据抽象 (`frontend/styles/themes.ts`)

前端定义统一的 `data-theme` 切换器。

| 皮肤主题 (`data-theme`) | 视觉风格描述 | 核心二改配置 |
| --- | --- | --- |
| **`modern-fluid`** (默认) | 现代极简流光、毛玻璃、高级暗黑 | `--background` 使用深色半透明，加 `backdrop-blur`，进度条使用平滑渐变色，动画追求丝滑惯性。 |
| **`cyberpunk-2077`** | 黄黑/黑青高对比度、霓虹发光、硬边缘 | 取消所有圆角 (`--border-radius: 0px`)，全局字体切换为 *Orbitron*，组件边框加发光阴影，按钮使用切角特殊 CSS (`clip-path`)。 |
| **`retro-win98`** | 复古像素、灰色块、情怀工具风 | 全局背景改为 `#808080`，引入 `NES.css` 的像素边框模型，字体加载 *Press Start 2P*，进度条变成格子状。 |

---

## 4. 核心交互序列设计 (Core Sequence Diagrams)

### 4.1 新建下载任务流程

1. 前端（主窗口）点击新建 $\rightarrow$ 弹出 `shadcn/ui` 的 `Dialog`。
2. 用户输入链接 $\rightarrow$ 前端触发 Tauri Command `invoke("create_task", { url, path })`。
3. Rust 后端接收请求 $\rightarrow$ 调用 `gosh-dl` 解析协议 $\rightarrow$ 写入本地 SQLite/Sled 数据库持久化 $\rightarrow$ 返回 `GID` 给前端。
4. 后端异步启动下载，事件定时器开始工作。

### 4.2 悬浮小窗双向联动与状态同步

1. 用户点击主窗口的“关闭” $\rightarrow$ 前端捕获事件，阻止原生关闭，调用 `invoke("switch_to_float")`。
2. Rust 后端执行：`main_window.hide()` 并 `float_window.show()`。
3. 悬浮窗显示，前端 `/float` 页面启动，开始通过全局 `window.listen("download-cluster-status")` 接收 Rust 发来的节流数据包，驱动水波纹动画。
4. 用户双击悬浮窗 $\rightarrow$ 前端触发 `invoke("switch_to_main")` $\rightarrow$ 后端隐藏悬浮窗，还原并聚焦主窗口。

---

## 5. 硬核性能与可靠性防御策略 (Performance & Optimization)

1. **UI 渲染零拖拽感 (零 CPU 抢占)**:
悬浮小窗的背景流光、水波纹等花哨动效，必须强行开启 `will-change: transform, opacity` 或使用 `Canvas/WebGL` 渲染，确保动效全部走 **GPU**，把 **CPU** 算力完完整整地留给 `gosh-dl` 进行分片文件写入。
2. **动态内存卸载**:
当用户从“赛博朋克风”切换到“现代流光风”时，前端必须显式销毁（Unmount）赛博朋克主题特有的 Canvas 粒子发生器和音效上下文（AudioContext），彻底释放内存，防止长时间挂机下载导致内存泄漏。
3. **大任务量防卡死 (虚拟滚动)**:
任务列表不使用原生 `map` 渲染。直接引入 `tanstack/react-virtual` 进行**虚拟列表化**改造。即使下载历史和当前任务达到上千条，Webview 页面也只渲染可视区域的 5-6 条卡片，彻底消除长列表重绘带来的卡顿。


---

## 6. 核心数据流与 IPC 通信协议设计 (Data Protocol)

下载器前后的数据交互非常高频，必须规范好 Tauri 的前端 `Invoke`（请求/响应）和 `Emit`（单向事件推送）协议。

### 6.1 Rust 推送给前端的节流数据帧 (Payload Schema)

后端定时器每 100ms 广播一次的数据结构：

```rust
#[derive(Clone, serde::Serialize)]
pub struct DownloadSpeedPayload {
    pub global_speed: String,       // 全局下载速度，如 "12.4 MB/s"
    pub active_tasks_count: usize,  // 正在下载的任务数
    pub tasks: Vec<TaskProgress>,   // 活跃任务的精简状态
}

#[derive(Clone, serde::Serialize)]
pub struct TaskProgress {
    pub gid: String,                // 任务唯一ID
    pub speed: String,              // 当前单任务速度
    pub progress: f32,              // 进度百分比 (0.00 - 100.00)
    pub eta: String,                // 剩余时间，如 "00:03:14"
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
}

```

### 6.2 前端状态持久化 (Zustand + Tauri Plugin Config)

用户的换肤选择、下载路径、最大并发数设置，不能软件一关就没了。

* **推荐方案**：使用前端 **Zustand 的 `persist` 中间件**，将其无缝桥接到本地存储。
* 当用户在前端勾选了“赛博朋克”皮肤，Zustand 会自动将其存入 Webview 的 LocalStorage。下次软件启动时，前端首屏会直接读取该值，给 `<html>` 标签加上 `data-theme="cyberpunk"`，避免出现“启动时先白屏/闪烁一下默认皮肤”的尴尬体验。

---

## 7. 前端组件二次改造：目录与工程化结构

为了让你的项目井井有条，建议前端（React/Next.js）采用如下的目录结构进行二次改造：

```text
frontend/
├── src/
│   ├── components/
│   │   ├── ui/                 <-- 纯 shadcn/ui 基础骨架（二改注入 CSS 变量）
│   │   │   ├── button.tsx
│   │   │   ├── progress.tsx
│   │   │   └── dialog.tsx
│   │   ├── downloader/         <-- 下载器业务组件
│   │   │   ├── TaskItem.tsx    <-- 任务卡片（包裹 Framer Motion 动效）
│   │   │   ├── TaskList.tsx    <-- 任务列表（引入虚拟滚动）
│   │   │   └── FloatDisc.tsx   <-- 悬浮窗核心测速盘
│   ├── hooks/
│   │   └── useDownloadStore.ts <-- Zustand 状态中心（管理速度、任务状态）
│   ├── styles/
│   │   ├── globals.css         <-- 皮肤核心：定义多套 data-theme 的 CSS 变量
│   │   └── themes/             <-- 存放花哨皮肤特有的特殊样式或 Canvas 粒子配置

```

---

## 8. 独立下载 APP 的特色硬核功能设计

既然用 Rust + gosh-dl 做了独立 App，可以利用系统级权限做几个非常彰显极客范的“花哨”功能：

### 8.1 悬浮窗的“拖拽磁力链/种子直达” (Drag & Drop)

* **体验**：用户从浏览器里选浏览器里选中一个磁力链接，或者从桌面拖入一个 `.torrent` 种子文件，直接松手扔进悬浮小窗里，软件就会自动解析并开始下载。
* **实现原理**：
1. 在前端小窗组件的外部 `div` 上，监听 HTML5 的 `onDragOver` 和 `onDrop` 事件。
2. 如果拖入的是文本（磁力链），直接获取字符串；如果是文件（种子），通过 `event.dataTransfer.files` 获取路径。
3. 前端拿到路径或 URL 后，调用 Tauri 的 `invoke("create_task", { url })`，直接唤起新建下载逻辑。



### 8.2 下载完成的“系统级通知与音效联动”

* **体验**：当一个 10GB 的大文件下完时，主窗口和小窗口都会闪烁，同时播放当前皮肤特有的音效（如赛博朋克风下的机械合成音“Task Completed”）。
* **实现原理**：
* Rust 端监听 `gosh-dl` 的任务完成回调。
* 触发 Tauri 的 `tauri-plugin-notification` 插件，弹窗系统原生的通知。
* 后端向前端发送 `emit("play-sound", "success")`，前端通过调用原生 `AudioContext` 播放内置的音频采样。



---

## 9. 终极避坑：`gosh-dl` 的并发与系统线程优化

在最终打包和运行时，Rust 异步网络 I/O 有一个细节会严重影响 UI 的流畅度：

* **问题**：`gosh-dl` 在下载高速、多线程分片文件时，会频繁唤醒 CPU 进行磁盘写入。如果此时你的全局 `Tokio Runtime` 线程池被打满，Tauri 负责处理前端 IPC 的线程就会被挂起，表现出来的现象就是：**下载速度飞快，但是前端界面卡死、悬浮窗拖不动。**
* **解决方案**：在 `main.rs` 中初始化 `gosh-dl` 时，**不要让它无限制地压榨所有的 CPU 核心**。或者显式地为文件 I/O 写入使用 `tokio::task::spawn_blocking`，将密集型的磁盘写入分配给独立的阻塞线程池，把宝贵的核心异步线程留给 Tauri 的事件循环（Event Loop）。

