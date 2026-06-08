

对于采用 **Tauri v2 + Rust + gosh-dl** 架构的下载器，后端（`src-tauri`）目录设计的核心目标是：**将高并发的 I/O 线程、下载内核调度、本地数据库持久化，与前端的 IPC（跨进程通信）指令层彻底解耦。** 确保高频的下载数据流不会阻塞 Tauri 的主线程，且模块边界清晰。

以下是为你量身定制的**深度解耦的后端（Rust）核心目录结构设计**：

---

## 📂 深度解耦的后端目录树 (`src-tauri/`)

```text
src-tauri/
├── Cargo.toml                 # 后端依赖配置（tauri, tokio, gosh-dl, rusqlite, serde）
├── tauri.conf.json            # Tauri 核心配置（多窗口路由、透明度、边框隐藏、Sidecar 定义）
├── capabilities/              # Tauri v2 核心资产：安全与权限策略控制
│   └── default.json           # 显式声明允许前端调用的 Command 白名单与事件监听权限
│
└── src/
    ├── main.rs                # 【全局入口】：初始化 Tokio 异步运行时、配置全局状态、绑定插件与注册路由
    │
    ├── core/                  # ==========================================
    │   │                      # 【系统内核层】：管理 App 运行时生命周期与全局共享单例
    │   ├── mod.rs             # 暴露内部模块接口
    │   ├── state.rs           # 全局状态管理（AppState）：使用 Arc<RwLock<T>> 封装任务队列与运行时配置
    │   └── store.rs           # 本地持久化层（SQLite/Sled）：负责下载进度、Tracker 缓存、皮肤设置的落盘与读取
    │
    ├── download/              # ==========================================
    │   │                      # 【下载引擎层】：抽象并封装 gosh-dl 内核，100% 隔离 Tauri 依赖
    │   ├── mod.rs             # 导出下载控制器组件
    │   ├── engine.rs          # 调度核心：处理任务创建、暂停、恢复、限速与断点续传（向 gosh-dl 提交任务）
    │   ├── manager.rs         # 并发管理器：控制全局最大并发任务数、多任务排队与动态带宽分配（限速策略）
    │   └── protocol.rs        # 协议解析器：负责将输入的 URL、Magnet（磁力链）或 Torrent（种子文件）解析为统一格式
    │
    ├── events/                # ==========================================
    │   │                      # 【事件驱动/通信层】：隔离高频 I/O 与前端 IPC 渲染通道
    │   ├── mod.rs             
    │   ├── ticker.rs          # 核心节流调度器（Ticker）：通过 tokio::time::interval 定时（100ms）轮询
    │   │                      # 获取当前下载速度并打包，统一对前端进行广播（Emit），防止前端重绘卡死
    │   └── reporter.rs        # 异步事件监听：监听 gosh-dl 抛出的 "下载完成"、"网络超时"、"磁力解析成功" 等系统级状态
    │
    └── commands/              # ==========================================
        │                      # 【指令API层/路由层】：纯净的接口映射，不含具体业务，只负责参数校验与转发
        ├── mod.rs             # 集中注册所有前端可以 invoke 的命令
        ├── task.rs            # 任务控制接口：对应前端的新建任务、暂停、取消、彻底删除
        ├── window.rs          # 窗口控制接口：配合前端控制主窗隐藏、悬浮窗唤起、边缘磁力吸附以及置顶切换
        └── agent.rs           # AI Agent 专属接口：后台低优先级线程执行分析，并向前端流式传输（Stream）结果

```

---

## 🛠️ 后端核心解耦架构：内部组件如何协同？

为了实现真正的界面与逻辑解耦，后端各模块在执行“下载”和“界面数据更新”时，遵循严密的**单向流水线原则**：

### 1. 引擎无感知化（gosh-dl 与 Tauri 彻底隔离）

`download/` 目录下的所有 Rust 代码应当是**纯净的 Rust 逻辑**。它只认 `gosh-dl` 的结构体和数据，完全不引入任何与 `tauri::Window` 或 `tauri::AppHandle` 相关的结构。

* **这样做的好处**：你可以随时把 `download/` 目录抽离出去，作为独立的 CLI 工具运行，或者在编写单元测试（Unit Test）时不需要去模拟（Mock）复杂的 Tauri 窗口上下文。

### 2. 参数与核心接口隔离：`commands/task.rs`

当用户在前端点击“新建下载”时，前端 `invoke("create_download_task")` 会直达此层。此层**只做参数合法性拦截和类型转换**，具体任务扔给后台：

```rust
// src-tauri/src/commands/task.rs
use crate::core::state::AppState;
use crate::download::engine::DownloadEngine;
use tauri::{State, AppHandle};

#[tauri::command]
pub async fn create_download_task(
    url: String,
    save_path: String,
    app_state: State<'_, AppState>, // 获取全局并发安全状态
    app_handle: AppHandle
) -> Result<String, String> {
    // 1. 严格过滤非安全请求或校验非法 URL
    if url.is_empty() {
        return Err("URL cannot be empty".into());
    }

    // 2. 将控制权无缝移交给具体的下载引擎层，本层不参与任何多线程分片逻辑
    let gid = DownloadEngine::submit(&url, &save_path, &app_state)
        .await
        .map_err(|e| e.to_string())?;

    // 3. 返回一个标准任务 GID（任务唯一标识）给前端，前端后续通过此 GID 追踪渲染
    Ok(gid)
}

```

### 3. IPC 带宽救星：`events/ticker.rs`（数据高流速截断）

下载器在全速运转时，`gosh-dl` 抛出的数据块状态是极其微秒级的。为了保证前端换了多么花哨、带霓虹流光的 UI 都不卡顿，`events/ticker.rs` 充当了**后端的防火墙**：

```rust
// src-tauri/src/events/ticker.rs
use crate::core::state::AppState;
use tauri::{Manager, Emitter};
use std::time::Duration;

pub fn start_global_event_ticker(app_handle: tauri::AppHandle, state: std::sync::Arc<AppState>) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_millis(100)); // 严格限制 100ms 推送一次

        loop {
            interval.tick().await;

            // 1. 从共享内存中捞出当前正在下载的活跃任务快照
            let active_tasks = state.get_active_tasks_snapshot().await;
            
            if !active_tasks.is_empty() {
                // 2. 打包并对主窗口(main)和悬浮小窗(float_window)同时广播精简后的速度与进度数据包
                // 无论是 React 的 TaskItemCard 还是 FloatDisc，都只需要监听这个统一的数据帧
                let _ = app_handle.emit("download-cluster-status", active_tasks);
            }
        }
    });
}

```

---

## 🎯 这套后端设计如何完美配合你的前端？

1. **极速换肤无感**：前端切换皮肤只需更新 `commands/window.rs` 或修改 `core/store.rs` 里的配置字典。底层的下载队列（`core/state.rs`）和网络分片（`download/`）不受任何干扰，下载不会断开。
2. **多窗口天然支持**：由于数据全部收拢在 `core/state.rs`（全局单例），不论前端开多少个独立小窗口（比如为每个下载任务开一个悬浮气泡），后端只需要在 `events/ticker.rs` 里统一 `emit` 广播即可，实现了**一份数据，多端感知**。
3. **线程安全性保障**：利用了 Tokio 异步体系，保证了 CPU 密集型的磁盘文件复写、多线程 P2P 握手都在专门的 `download/` 模块线程池内跑完，Tauri 进程稳如磐石。