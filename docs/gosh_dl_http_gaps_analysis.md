# gosh-dl HTTP 相关设置与特性闭环及逻辑漏洞分析报告

本报告对 PiDownloader 当前版本（基于 `gosh-dl = "0.4.0"`）中 HTTP 相关的配置、特性接入、以及前后端数据链路进行了系统性排查，识别出多处**未闭环的设置与特性**以及**导致功能失效的逻辑 BUG**，并针对性地给出了重构和改进建议。

---

## 1. 核心发现与逻辑 BUG (Logical Bugs)

### 1.1 探测连接池未同步 SSL 忽略设置 (SSL Probe Pool Mismatch)
* **漏洞描述**：
  在 [engine.rs](file:///h:/VSCodeWork/PiDown/src-tauri/src/download/engine.rs) 中，`EngineWrapper` 维护了一个独立的 `probe_pool`（类型为 `ConnectionPool`），专门用于在添加任务前的 HTTP/HTTPS 链接元数据探测（`inspect_http` -> `probe_server`）。
  该连接池在应用启动初始化 `EngineWrapper::new` 时被创建一次：
  ```rust
  let probe_pool = ConnectionPool::new(&config.http)
      .map_err(|e| format!("Failed to initialize gosh-dl HTTP probe: {}", e))?;
  ```
  然而，当用户在设置窗口中动态开启或关闭 **“忽略 SSL 证书错误”** (`ignore_ssl_certificate`) 时，`settings_state.rs` 中的 `apply_transfer_settings()` 只会通过 `DownloadManager` 更新全局 `DownloadEngine` 的内部配置，**从未重建或修改 `EngineWrapper` 的 `probe_pool`**（因为 `probe_pool` 是 `EngineWrapper` 的不可变字段，且没有暴露更新方法）。
* **业务后果**：
  用户在设置中勾选了“忽略 SSL 证书错误”后，如果尝试添加一个带有自签名/无效 SSL 证书的 HTTPS 下载链接，**元数据探测阶段（Metadata Inspection）依然会报错失败**，导致用户无法创建任务。该设置只有在**重启应用**后才能对探测阶段生效。这属于严重逻辑 BUG。
* **涉及文件**：
  * [engine.rs](file:///h:/VSCodeWork/PiDown/src-tauri/src/download/engine.rs#L26-L30) (结构体定义及初始化)
  * [settings_state.rs](file:///h:/VSCodeWork/PiDown/src-tauri/src/core/state/settings_state.rs#L28-L48) (`apply_transfer_settings` 遗漏对探测连接池的更新)

---

### 1.2 种子文件下载完全忽略 User-Agent、Cookies 和 Referer
* **漏洞描述**：
  当用户添加一个以 `.torrent` 结尾或使用 `torrent:` 协议的 HTTP/HTTPS 链接时，系统会在元数据探测和任务创建时，通过 [bt.rs](file:///h:/VSCodeWork/PiDown/src-tauri/src/download/bt.rs) 中的 `fetch_torrent_bytes` 函数去下载对应的 `.torrent` 文件：
  ```rust
  let client = reqwest::Client::builder()
      .danger_accept_invalid_certs(ignore_ssl)
      .build()
      .map_err(|e| format!("Failed to build HTTP client: {}", e))?;
  let response = client.get(&target_url)
      .send()
      .await...
  ```
  在构建这个 `reqwest::Client` 时，**完全没有传入和设置 User-Agent**，也**没有带上任何自定义 Headers、Cookies 或 Referer**。同时，它也忽略了全局的 `global_user_agent`。
* **业务后果**：
  如果用户从私有种子站（PT站）或受到安全防御（如 Cloudflare 盾）保护的索引站下载 `.torrent` 文件，由于请求不带 UA、Cookies 或 Referer，这些站点会返回 `403 Forbidden` 或 `400 Bad Request`，导致**添加 BT 下载任务直接报错失败**。
* **涉及文件**：
  * [bt.rs](file:///h:/VSCodeWork/PiDown/src-tauri/src/download/bt.rs#L6-L24) (`fetch_torrent_bytes` 实现)
  * [task_service.rs](file:///h:/VSCodeWork/PiDown/src-tauri/src/core/state/task_service.rs#L356-L357) (任务创建时未传递 Headers/UA 选项)
  * [task_service.rs](file:///h:/VSCodeWork/PiDown/src-tauri/src/core/state/task_service.rs#L504-L506) (任务探测时未传递 Headers/UA 选项)

---

### 1.3 `EngineWrapper` 内部静态 `user_agent` 未更新
* **漏洞描述**：
  `EngineWrapper` 定义了 `user_agent` 字符串字段，并在 `new()` 时初始化为引擎配置的默认 UA。
  当用户在设置中修改“全局 User-Agent”后，该字段**从未被更新**。虽然在 `inspect_download` 中临时传入了最新的全局配置 UA 实现了覆盖，但这使 `EngineWrapper` 自身的 `user_agent` 字段成为无用的“僵尸状态”或落后状态。
* **涉及文件**：
  * [engine.rs](file:///h:/VSCodeWork/PiDown/src-tauri/src/download/engine.rs#L29) (`user_agent` 字段)

---

## 2. HTTP 设置特性未闭环排查 (Closed-Loop Gaps)

以下是前端 UI 界面中暴露的配置，但在后端 `gosh-dl` 链路中未完整实现闭环的特性：

| 特性 / UI 配置 | 前端表现 | 后端行为 | 闭环状态与 Gap |
| :--- | :--- | :--- | :--- |
| **单任务线程数 (`task_thread_count`)** | 设置页面可拖动 Slider (1-16)；新建任务高级表单中可覆盖此设置。 | 调用 `manager.set_http_options` 更新全局默认值，创建 HTTP 任务时传递给 `DownloadOptions.max_connections`。 | **半闭环**：该设置对**新创建的**任务有效，但修改全局设置后，**运行中的活跃任务无法动态调整连接线程数**。且创建后，用户无法在任务详情或列表中修改当前任务的线程数。 |
| **最大下载重试次数 (`max_download_retries`)** | 设置页面可拖动 Slider (0-20)。 | 调用 `manager.set_http_options` 写入全局配置 `config.http.max_retries`。 | **半闭环**：新创建的任务能继承此重试限制，但：<br>1. 没有提供单任务级别的重试次数覆盖。<br>2. 活跃任务无法动态响应此项修改。<br>3. `fetch_torrent_bytes` 下载种子时没有应用该重试策略。 |
| **全局下载/上传限速** | 设置页面输入框限制。 | 调用 `manager.set_speed_limits` 设置全局限速值（单位已转换）。 | **已闭环**：底层 gosh-dl 限速器直接在全局连接池级别生效，实时修改即时生效。 |
| **单任务下载/上传限速** | 新建任务高级表单输入框。 | 创建任务时写入 `DownloadOptions.max_download_speed` / `max_upload_speed`。 | **半闭环**：创建时设置成功，但**任务创建后无法修改单任务限速**。前端面板与后端没有提供 `update_task_options` 这类修改运行中任务属性的 API，用户只能重启任务。 |
| **代理设置 (`proxy_url`)** | **完全缺失**。 | `gosh-dl` 拥有 `HttpConfig.proxy_url` 字段支持代理，但后端 `AppSettings` 未承载，前端也无配置项。 | **未闭闭环**：在企业网络或特殊网络环境下，用户完全无法配置代理，导致网络请求或下载失败。 |
| **自定义 Headers / Cookies / Referer** | 新建任务高级表单输入框。 | 转换后作为 `DownloadOptions` 的字段提交给 `add_http`。 | **半闭环**：<br>1. 仅限 HTTP/HTTPS 任务支持，BT 任务探测及种子文件拉取时完全不支持。<br>2. 任务创建后**无法查看已设定的 headers**，也**无法在 session 过期后修改 Cookies**。 |

---

## 3. 架构建议与重构方案 (Refactoring Proposals)

为了彻底解决上述 Bug 并实现 HTTP 特性的完整闭环，建议进行以下重构。

### 3.1 引入 `RwLock` 保证 `EngineWrapper` 部分状态可变

由于 `EngineWrapper` 字段在 `AppState` 中是直接持有的，且没有使用内部可变性，导致我们无法动态重组 `probe_pool` 或 `user_agent`。
建议使用 `std::sync::RwLock`（或 `tokio::sync::RwLock`）包裹 `probe_pool` 和 `user_agent`：

```rust
// src-tauri/src/download/engine.rs
use std::sync::RwLock;

pub struct EngineWrapper {
    inner: Arc<DownloadEngine>,
    probe_pool: RwLock<ConnectionPool>,
    user_agent: RwLock<String>,
}
```

并在 `EngineWrapper` 中添加配置更新方法：

```rust
impl EngineWrapper {
    pub fn update_http_config(&self, http_config: EngineHttpConfig) -> Result<(), String> {
        let mut config = EngineConfig::default();
        config.http.max_retries = http_config.max_retries;
        config.http.accept_invalid_certs = http_config.accept_invalid_certs;
        
        // 重建连接池并用锁更新
        let new_pool = ConnectionPool::new(&config.http)
            .map_err(|e| format!("Failed to re-initialize gosh-dl HTTP probe pool: {}", e))?;
        
        if let Ok(mut pool_guard) = self.probe_pool.write() {
            *pool_guard = new_pool;
        }
        
        Ok(())
    }
}
```

随后，在 `settings_state.rs` 中同步调用此方法：

```rust
// src-tauri/src/core/state/settings_state.rs
pub(super) fn apply_transfer_settings(&self) -> Result<(), String> {
    let settings = self.settings.read().unwrap().clone();
    
    // 1. 更新 gosh-dl 引擎自身的配置
    let manager = DownloadManager::new(self.engine.inner().clone());
    manager.set_http_options(
        settings.transfer.task_thread_count as usize,
        settings.transfer.max_download_retries as usize,
        settings.transfer.ignore_ssl_certificate,
    )?;
    
    // 2. 闭环：同步重建并更新 EngineWrapper 的元数据探测连接池
    self.engine.update_http_config(EngineHttpConfig {
        max_connections_per_download: settings.transfer.task_thread_count as usize,
        max_retries: settings.transfer.max_download_retries as usize,
        accept_invalid_certs: settings.transfer.ignore_ssl_certificate,
    })?;
    
    ...
    Ok(())
}
```

---

### 3.2 升级 `fetch_torrent_bytes` 支持全量 HTTP 配置项

重构 `bt.rs` 中的 `fetch_torrent_bytes`，使其能够接收统一的请求配置上下文（如 UA、Cookies、Referer、重试次数等）：

```rust
// src-tauri/src/download/bt.rs
pub struct TorrentFetchOptions {
    pub ignore_ssl: bool,
    pub user_agent: Option<String>,
    pub referer: Option<String>,
    pub cookies: Vec<String>,
    pub max_retries: usize,
}

pub async fn fetch_torrent_bytes(
    url: &str, 
    opts: TorrentFetchOptions
) -> Result<Vec<u8>, String> {
    ...
    if is_http_url {
        let mut client_builder = reqwest::Client::builder()
            .danger_accept_invalid_certs(opts.ignore_ssl);
            
        if let Some(ua) = opts.user_agent {
            client_builder = client_builder.user_agent(ua);
        }
        
        let client = client_builder.build().map_err(...)?;
        
        let mut req_builder = client.get(url);
        if let Some(referer) = opts.referer {
            req_builder = req_builder.header(reqwest::header::REFERER, referer);
        }
        if !opts.cookies.is_empty() {
            let cookie_str = opts.cookies.join("; ");
            req_builder = req_builder.header(reqwest::header::COOKIE, cookie_str);
        }
        
        // 执行带有重试逻辑的请求 (基于 opts.max_retries)
        ...
    }
}
```
并在任务创建与元数据检查时，将用户当前在 UI 或全局配置中填入的参数传入：
1. **任务探测阶段**：使用全局 User-Agent。
2. **任务创建阶段**：如果用户以 URL 创建种子任务，在前端高级面板中**对于 Torrent 协议也应展现 UA/Cookies/Referer 字段**，并把这些字段和全局设置合并后，传递给后端的创建命令。

---

### 3.3 补齐动态修改任务选项 API (Dynamic Tasks Adjustment)

为了彻底解决“活跃任务配置无法调整”的 Gap，需要在后端暴露动态调整任务属性的 Tauri Command，并在前端任务详情抽屉（`TaskDetailsDrawer.tsx`）中提供对应的操作项（例如“修改限速”或“修改连接线程数”）。

`gosh-dl` 引擎层面支持在运行中修改任务，我们可以通过获取特定任务并在引擎中动态调整其属性来实现。
在 `task_service.rs` 中新增：

```rust
// src-tauri/src/core/state/task_service.rs
pub async fn update_active_task_options(
    &self,
    gid: &str,
    max_connections: Option<usize>,
    max_download_speed: Option<Option<u64>>,
) -> Result<(), String> {
    let id = self.resolve_download_id(gid)?;
    
    // 通过 gosh-dl 的相关接口对指定 id 进行动态配置更新
    // 假设 gosh-dl 底层提供了类似更新运行任务配置的 API:
    // self.engine.inner().update_task_options(id, ...)
    
    // 并同步更新数据库和缓存中保存的任务限速值
    if let Some(task) = self.task_cache.write().unwrap().get_mut(gid) {
        if let Some(speed) = max_download_speed {
            task.max_download_speed_kib = speed.map(|v| v / 1024);
        }
    }
    
    Ok(())
}
```

---

### 3.4 补充 Proxy 全局代理配置

1. 在 `AppSettings` 的 `TransferSettings` 中增加 `proxy_url: Option<String>` 字段。
2. 在前端设置窗口中的“传输设置”分组下，增加“全局代理”输入框，支持配置如 `http://127.0.0.1:7890` 或 `socks5://127.0.0.1:7890`。
3. 在 `apply_transfer_settings()` 中将代理应用到引擎：
   ```rust
   let mut config = self.engine.inner().get_config();
   config.http.proxy_url = settings.transfer.proxy_url.clone();
   self.engine.inner().set_config(config)?;
   ```
4. 同时也将其作为 `ConnectionPool` 重建参数应用给元数据探测的 `probe_pool`。

---

## 4. 总结与排期建议

当前项目在 HTTP 传输配置与底层 `gosh-dl` 引擎特性的整合上已经完成了大部分基础链路的对接，但是**元数据探测连接池 (`probe_pool`) 状态僵死**和**BT种子下载完全缺失请求上下文**这两个问题属于高频暴露的业务逻辑 Bug，严重阻碍了“忽略 SSL 证书错误”和“自定义 headers”功能的实际落地。

### 优先推荐的修复顺序：
1. **P0 (关键逻辑 BUG)**：重构 `EngineWrapper::update_http_config`，修复 `probe_pool` 无法热同步 SSL/忽略证书设置的问题。
2. **P0 (PT与特殊站点支持)**：重构 `fetch_torrent_bytes` 传递统一的 `TorrentFetchOptions`（加入 User-Agent/Cookies/Referer 支持），避免下载 `.torrent` 产生 403/400 失败。
3. **P1 (设置项完整闭环)**：前后端补充 **“代理配置 (`proxy_url`)”** 特性。
4. **P2 (高级体验优化)**：支持在任务列表或详情中动态调整进行中任务的单任务限速与线程数。
