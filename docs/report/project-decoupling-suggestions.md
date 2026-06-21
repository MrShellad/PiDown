# PiDownloader 项目模块解耦与架构重构建议书

本建议书基于对 PiDownloader 项目（包括 Rust 后端、Tauri 核心状态、数据存储以及 React 前端项目）的静态代码依赖树审计，指出了当前项目在模块划分、依赖倒置（Dependency Inversion）、平台相关性以及职责分离（Separation of Concerns）方面存在的过度耦合隐患，并给出了具体的可行解耦架构重构方案。

---

## 目录
1. [后端 Rust 解耦建议](#一-后端-rust-解耦建议)
    - [1.1 统一的下载协议提供者抽象（插件化架构）](#11-统一的下载协议提供者抽象插件化架构)
    - [1.2 数据持久化层解耦（引入仓储模式 Repository Pattern）](#12-数据持久化层解耦引入仓储模式-repository-pattern)
    - [1.3 HLS 下载逻辑的副作用剥离（状态驱动与事件总线）](#13-hls-下载逻辑的副作用剥离状态驱动与事件总线)
    - [1.4 自定义 WebDAV 协议处理器的模块化抽离](#14-自定义-webdav-协议处理器的模块化抽离)
2. [前端 React 解耦建议](#二-前端-react-解耦建议)
    - [2.1 API 桥接层与 Zustand 状态机制的解耦](#21-api-桥接层与-zustand-状态机制的解耦)
    - [2.2 容器组件与哑呈现组件的分离（Container & Presentational Components）](#22-容器组件与哑呈现组件的分离container--presentational-components)

---

## 一、 后端 Rust 解耦建议

### 1.1 统一的下载协议提供者抽象（插件化架构）

* **当前耦合现状**：
  [`src-tauri/src/core/state/task_service.rs`](file:///h:/VSCodeWork/PiDown/src-tauri/src/core/state/task_service.rs) 在创建、暂停、恢复、取消任务时，充斥着针对 `is_hls` 协议的特殊分支逻辑。同样地，在 [`ticker.rs`](file:///h:/VSCodeWork/PiDown/src-tauri/src/events/ticker.rs) 的高频定时器中，不仅要查询 `gosh-dl` 底层引擎，还必须用特定逻辑去扫描任务缓存来过滤 HLS 任务，并手动计算其速度。
  这导致任务管理服务与具体的下载协议实现（gosh-dl 负责的 HTTP/Torrent 与自定义的 HLS 协程）深度绑定，违反了面向对象设计中的**开闭原则（Open-Closed Principle）**。如果未来要扩展 FTP, SFTP, Aria2 或 IPFS，则必须在 `task_service.rs` 与 `ticker.rs` 中大范围修改并添加 `if-else`。

* **解耦方案**：
  引入 `DownloadProvider` 特性（Trait），将底层下载任务的行为抽象化。
  
  ```rust
  // 定义下载驱动协议接口
  #[async_trait::async_trait]
  pub trait DownloadProvider: Send + Sync {
      fn protocol(&self) -> &'static str;
      async fn create_task(&self, task: &DbTask, options: TaskCreateOptions) -> Result<String, String>;
      async fn pause_task(&self, engine_id: &str) -> Result<(), String>;
      async fn resume_task(&self, engine_id: &str) -> Result<(), String>;
      async fn cancel_task(&self, engine_id: &str, delete_files: bool) -> Result<(), String>;
      async fn query_status(&self, engine_id: &str) -> Result<DownloadProgressInfo, String>;
  }
  ```

  1. 实现 `GoshDownloadProvider` 包装 `gosh-dl` 引擎。
  2. 实现 `HlsDownloadProvider` 封装当前的 M3U8 分片流下载。
  3. 在 `AppState` 中维护一个 `HashMap<String, Arc<dyn DownloadProvider>>` 的注册表，任务的调度完全通过协议名动态分发，消除一切硬编码判定。

---

### 1.2 数据持久化层解耦（引入仓储模式 Repository Pattern）

* **当前耦合现状**：
  `AppState` 直接集成了 `DbStore`（[`store.rs`](file:///h:/VSCodeWork/PiDown/src-tauri/src/core/store.rs)），并且 `task_service.rs` 的业务层逻辑里大量存在直接调用 `self.db.insert_task(&db_task)`、`self.db.update_task_status(...)` 等底层 rusqlite 执行动作。
  这使得业务逻辑（包括重载、属性比对、文件防冲突验证）与底层的 SQLite 存储技术紧密绑死，若想在单元测试中对 `task_service` 的调度行为进行测试，必须要物理连接并创建 SQLite 数据库文件，无法进行干净的内存隔离 Mock。

* **解耦方案**：
  引入 **Repository（仓储）** 抽象，将数据的读写行为定义为接口，业务层仅依赖抽象接口，底层的 SQLite 实现则作为接口的实现者（Dependency Inversion）。
  
  ```rust
  pub trait TaskRepository: Send + Sync {
      fn get_task(&self, id: &str) -> Result<Option<DbTask>, String>;
      fn save_task(&self, task: &DbTask) -> Result<(), String>;
      fn delete_task(&self, id: &str) -> Result<(), String>;
      fn list_all_tasks(&self) -> Result<Vec<DbTask>, String>;
      fn save_tasks_checkpoint(&self, tasks: &[DbTask]) -> Result<(), String>;
  }
  ```
  在测试环境（Unit Tests）中，可以注入一个 `InMemoryTaskRepository`（使用 `HashMap` 代替 SQLite），从而使核心业务完全脱离物理 I/O，极大地加快测试反馈度与隔离性。

---

### 1.3 HLS 下载逻辑的副作用剥离（状态驱动与事件总线）

* **当前耦合现状**：
  在 [`src-tauri/src/download/hls.rs`](file:///h:/VSCodeWork/PiDown/src-tauri/src/download/hls.rs) 的 `download_hls_task` 核心函数中，它直接持有全局 `AppState` 的 `Arc` 指针，并且在下载出错、完成时同步调用 `state.task_cache.write()`、`state.db.update_task_status(...)`，并使用 `state.app_handle` 触发 Tauri 前端消息推送。
  这导致 `hls.rs` 这个理应只专注于网络流下载和文件合并的纯粹下载模块，反向依赖了整个 UI 系统（Tauri Window）、核心状态机和底层数据库。

* **解耦方案**：
  将 `hls.rs` 改造为**无状态的独立下载执行器**。它仅关注传入的 URL 与目标文件路径。
  1. **移除 `Arc<AppState>` 传参**。
  2. 使用 **通道（Channel）** 传递进度与状态更新：`download_hls_task` 接受一个 `tokio::sync::mpsc::UnboundedSender<DownloadEvent>` 发送端。
  3. 由外层的 `task_service` 或 `reporter` 充当接收端，在检测到下载器传回的事件时，统一调度缓存更新、写库与 Tauri 消息广播。使得 `hls.rs` 能够以标准 Rust 库的身份在任何命令行或非桌面端独立运行。

---

### 1.4 自定义 WebDAV 协议处理器的模块化抽离

* **当前耦合现状**：
  [`src-tauri/src/lib.rs`](file:///h:/VSCodeWork/PiDown/src-tauri/src/lib.rs#L175) 通过 `.register_asynchronous_uri_scheme_protocol` 注册了 `webdav` 的协议处理。但约 350 行的处理逻辑直接平铺在 `lib.rs` 中。这使得项目的初始化入口极为臃肿，并且该流式代理直接依赖了 `AppState` 中的 `VideoCache`、配置和数据库组件。

* **解耦方案**：
  1. 将 WebDAV 自定义协议的逻辑剥离至独立的子模块 `src-tauri/src/download/protocols/webdav_stream.rs`。
  2. 提供独立的 `WebDavStreamHandler` 结构体，`lib.rs` 仅负责将其生命周期与 Tauri 绑定，具体请求的流式分发、证书绕过、请求代理和 Range 限速裁剪细节均封装在其内部，提升主入口代码的整洁度与可读性。

---

## 二、 前端 React 解耦建议

### 2.1 API 桥接层与 Zustand 状态机制的解耦

* **当前耦合现状**：
  前端的任务主 Zustand 状态 Store [`useDownloadStore.ts`](file:///h:/VSCodeWork/PiDown/frontend/src/core/store/useDownloadStore.ts) 直接依赖了位于 `../bridge/tauri-commands` 的底层 Tauri 命令包装器：
  ```typescript
  import { pauseTask, resumeTask, getActiveTasks ... } from "../bridge/tauri-commands";
  
  export const useDownloadStore = create<DownloadState>()((set, get) => ({
      // ...
      toggleTask: async (gid) => {
          // 直接硬编码调用了 Tauri API 桥接方法
          await pauseTask(gid);
      }
  }));
  ```

* **核心痛点**：
  这种设计将**状态管理（Zustand）**与**通信层（Tauri IPC）**深度绑定。如果我们需要：
  1. 编写前端 UI 的 Storybook 预览或组件级 Jest 测试。
  2. 支持在普通 Chrome 浏览器或 Web 环境运行本项目（连接远程服务器）。
  由于 Zustand 内部写死了对 Tauri 底层注入的 C++ 接口（`window.__TAURI__`）的调用，前端将直接崩溃且无法运行。

* **解耦方案**：
  引入 **API 服务接口适配层**（Service Interface Layer）：
  1. 定义 `DownloadApiService` 统一接口：
     ```typescript
     interface DownloadApiService {
       pauseTask(gid: string): Promise<void>;
       resumeTask(gid: string): Promise<void>;
       fetchActiveTasks(): Promise<TaskOverview[]>;
     }
     ```
  2. 实现 `TauriDownloadApiService` 用于生产的 Tauri 容器通信。
  3. 实现 `MockDownloadApiService`（或 `HttpDownloadApiService`），用于纯网页测试或联调。
  4. Zustand 的 Store 仅通过注入的 `ApiService` 来获取和更改状态，彻底斩断对 `window.__TAURI__` 的直接静态依赖。

---

### 2.2 容器组件与哑呈现组件的分离（Container & Presentational Components）

* **当前耦合现状**：
  一些底层的呈现行组件（如 [`TaskTableRow.tsx`](file:///h:/VSCodeWork/PiDown/frontend/src/components/downloader/TaskTableRow.tsx)）包含了大量对 Zustand 状态（`useDownloadStore` 和 `useAppSettingsStore`）的内部调用：
  ```typescript
  const storeTask = useDownloadStore((state) => state.tasks[gid])
  const categories = useDownloadStore((state) => state.categories)
  const toggleTask = useDownloadStore((state) => state.toggleTask)
  const removeTask = useDownloadStore((state) => state.removeTask)
  // ... 伴随着各种删除确认、状态变换对话框的直接控制
  ```

* **核心痛点**：
  `TaskTableRow` 本应只负责将传入的任务数据（Task）按照 UI 规范绘制为一行表格，并向上反馈用户动作。但由于其内部自行获取全局状态，导致其成为一个“胖组件（Fat Component）”。
  这极大地破坏了其复用性，如果要在“分类总览”、“悬浮窗口”或者“历史记录筛选器”等不同的布局中展示这一行任务，将会被迫带入其内部捆绑的所有 Zustand 状态和副作用弹出窗逻辑，增加测试与二次维护的心智负担。

* **解耦方案**：
  将底层 UI 重构为**哑组件（Dumb/Presentational Component）**，仅通过 `Props` 接受数据与行为回调：
  ```typescript
  // 哑组件声明
  interface TaskTableRowProps {
    task: Task;
    category?: Category;
    selected: boolean;
    onToggle: (gid: string) => void;
    onDelete: (gid: string) => void;
    onOpenDetails: (gid: string) => void;
  }
  
  export const TaskTableRow = memo(({ task, category, selected, onToggle, onDelete }: TaskTableRowProps) => {
     // 纯粹根据 props 渲染，内部无 Zustand 状态读取与硬编码 side-effect 调用
  });
  ```
  而外层的 `TaskListDashboard.tsx` 作为**容器组件（Container Component）**，负责与 Zustand 状态库打交道，统一获取数据、分发 actions，并将具体的回调函数以 props 传入 `TaskTableRow`，确保底层 UI 组件的极度轻量与高可复用性。
