# gosh-dl 核心能力开发文档

本文基于 PiDownloader 当前依赖的 `gosh-dl = 0.4.0` 以及本机 Cargo registry 中的源码整理，目标是帮助后续开发明确：底层核心支持哪些能力、PiDownloader 已经接入了哪些能力、还有哪些能力可以继续补齐。

## 1. 当前依赖与启用特性

PiDownloader 后端在 `src-tauri/Cargo.toml` 中声明：

```toml
gosh-dl = "0.4.0"
```

`gosh-dl 0.4.0` 的默认 feature 为：

```toml
default = ["http", "torrent", "storage"]
```

因此当前项目默认启用了：

| Feature | 状态 | 说明 |
| --- | --- | --- |
| `http` | 已启用 | HTTP/HTTPS 下载、分片、多连接、断点续传、重试、限速、服务端探测。 |
| `torrent` | 已启用 | `.torrent`、Magnet、DHT、PEX、LPD、Tracker、WebSeed、uTP 相关实现。 |
| `storage` | 已启用 | SQLite 持久化，支持任务状态、HTTP 分片、Torrent 元数据恢复。 |
| `recursive-http` | 未启用 | 递归 HTTP 目录镜像能力存在，但 PiDownloader 当前未编译启用。 |
| `io-uring` | 未启用 | feature 存在，但源码中不是当前主要接入路径。 |

注意：`gosh-dl 0.4.0` 的 crate metadata 标注 `rust-version = "1.85"`，而 PiDownloader 当前 `src-tauri/Cargo.toml` 标注 `rust-version = "1.77.2"`。如果后续 CI 或发布环境严格按项目 MSRV 构建，需要把项目 Rust toolchain/MSRV 与依赖要求对齐。

## 2. 核心架构入口

`gosh-dl` 的主要入口是：

```rust
use gosh_dl::{DownloadEngine, EngineConfig, DownloadOptions};
```

核心对象：

| 类型 | 作用 |
| --- | --- |
| `DownloadEngine` | 下载引擎主入口，负责添加任务、暂停、恢复、取消、查询状态、事件订阅、配置更新。 |
| `EngineConfig` | 引擎级配置，例如下载目录、并发数、每任务连接数、全局限速、HTTP/Torrent 配置、SQLite 路径。 |
| `DownloadOptions` | 单任务配置，例如保存路径、文件名、UA、Referer、Headers、Cookies、校验值、镜像、任务级限速、Torrent 文件选择。 |
| `DownloadStatus` | 单任务状态快照，包含任务类型、状态、进度、元数据、Torrent 信息、创建/完成时间。 |
| `DownloadEvent` | 广播事件，包含 Added、Started、Progress、StateChanged、Completed、Failed、Paused、Resumed、Removed。 |
| `DownloadId` | 内部任务 ID，基于 UUID；可导出 aria2 风格 16 位 GID。 |

典型初始化：

```rust
let mut config = EngineConfig::default();
config.database_path = Some(app_data_dir.join("gosh_dl.db"));
config.max_concurrent_downloads = 3;
config.max_connections_per_download = 8;

let engine = DownloadEngine::new(config).await?;
```

## 3. HTTP/HTTPS 下载能力

`gosh-dl` 的 HTTP 模块支持以下核心能力：

| 能力 | 支持情况 | 开发说明 |
| --- | --- | --- |
| 普通 HTTP/HTTPS 下载 | 支持 | `engine.add_http(url, options).await`。只接受 `http` 和 `https` scheme。 |
| 多连接分片下载 | 支持 | 服务端支持 `Range` 且文件大于 `min_segment_size` 时使用分片下载。 |
| 每任务连接数 | 支持 | `DownloadOptions.max_connections` 可覆盖全局 `EngineConfig.max_connections_per_download`。 |
| 断点续传 | 支持 | 使用 `.part` 文件、`Range`、`If-Range`、`ETag`、`Last-Modified` 校验恢复。 |
| 单连接回退 | 支持 | 分片续传不安全或服务端不支持 Range 时会回退单流下载。 |
| Content-Disposition 文件名 | 支持 | HEAD 探测时解析 `Content-Disposition` 推断文件名。 |
| 自定义 User-Agent | 支持 | 全局 `EngineConfig.user_agent` 或单任务 `DownloadOptions.user_agent`。 |
| Referer | 支持 | `DownloadOptions.referer`。 |
| 自定义 Headers | 支持 | `DownloadOptions.headers`。 |
| Cookies | 支持 | `DownloadOptions.cookies`，内部拼成 `Cookie` header。 |
| 校验和 | 支持 | 支持 MD5、SHA-256，下载完成后校验。 |
| 镜像/失败切换 | 支持 | `DownloadOptions.mirrors` 与 `MirrorManager` 支持主 URL + mirrors。 |
| 全局下载限速 | 支持 | `EngineConfig.global_download_limit`，单位 bytes/sec。 |
| 任务级下载限速 | 支持 | `DownloadOptions.max_download_speed` 字段存在；HTTP 实际主要走全局池限速。 |
| 重试 | 支持 | `HttpConfig.max_retries`、指数退避、jitter。 |
| 连接超时/读超时 | 支持 | `HttpConfig.connect_timeout`、`HttpConfig.read_timeout`。 |
| 最大重定向 | 支持 | `HttpConfig.max_redirects`。 |
| 忽略 TLS 证书 | 支持 | `HttpConfig.accept_invalid_certs`，需要谨慎暴露给用户。 |
| 代理 | 字段支持 | `HttpConfig.proxy_url` 支持 HTTP/HTTPS/SOCKS5，但 README 标注测试覆盖不足。 |
| 压缩透明解码 | 明确关闭 | HTTP client 关闭 gzip/brotli，避免破坏 Range、进度、校验和磁盘字节一致性。 |

HTTP 任务示例：

```rust
let options = DownloadOptions {
    save_dir: Some(download_dir),
    filename: Some("example.zip".to_string()),
    user_agent: Some("PiDownloader/0.1".to_string()),
    referer: Some("https://example.com".to_string()),
    headers: vec![("Authorization".to_string(), "Bearer token".to_string())],
    cookies: Some(vec!["session=abc123".to_string()]),
    max_connections: Some(8),
    ..Default::default()
};

let id = engine.add_http("https://example.com/example.zip", options).await?;
```

## 4. BitTorrent / Magnet 能力

`gosh-dl` 默认启用 `torrent` feature，支持：

| 能力 | 支持情况 | 开发说明 |
| --- | --- | --- |
| `.torrent` 文件解析 | 支持 | `engine.add_torrent(&torrent_bytes, options).await`。 |
| Magnet URI | 支持 | `engine.add_magnet(magnet_uri, options).await`。 |
| Tracker | 支持 | HTTP/UDP tracker announce/scrape。 |
| DHT | 支持 | `EngineConfig.enable_dht`，私有种子会禁用相关发现能力。 |
| PEX | 支持 | `EngineConfig.enable_pex`。 |
| LPD | 支持 | `EngineConfig.enable_lpd`。 |
| 多 peer 下载 | 支持 | piece selection、block pipelining、peer 状态。 |
| Piece hash 校验 | 支持 | 按 BitTorrent piece SHA-1 校验。 |
| 选择文件下载 | 支持 | `DownloadOptions.selected_files`。 |
| 顺序下载 | 支持 | `DownloadOptions.sequential`，适合流式播放场景。 |
| 上传限速 | 支持 | `EngineConfig.global_upload_limit` 或 `DownloadOptions.max_upload_speed`。 |
| 做种比例 | 支持 | `EngineConfig.seed_ratio` 或 `DownloadOptions.seed_ratio`。 |
| WebSeed | 支持 | `TorrentConfig.webseed`，默认开启。 |
| MSE/PE 加密 | 支持 | `TorrentConfig.encryption`，策略可配置。 |
| uTP | 实现存在 | `TorrentConfig.utp.enabled` 默认 false，需要显式开启。 |
| 文件预分配 | 配置存在 | `TorrentConfig.allocation_mode`，README 标注测试覆盖不足。 |

Torrent 任务示例：

```rust
let options = DownloadOptions {
    save_dir: Some(download_dir),
    selected_files: Some(vec![0, 2, 5]),
    sequential: Some(true),
    max_upload_speed: Some(512 * 1024),
    seed_ratio: Some(1.0),
    ..Default::default()
};

let id = engine.add_magnet(magnet_uri, options).await?;
```

## 5. 任务生命周期与状态模型

任务状态 `DownloadState`：

| 状态 | 含义 |
| --- | --- |
| `Queued` | 等待并发槽位。 |
| `Connecting` | 正在连接服务器或 peer。 |
| `Downloading` | 正在下载。 |
| `Seeding` | Torrent 做种中。 |
| `Paused` | 用户暂停。 |
| `Completed` | 下载完成。 |
| `Error` | 下载失败，包含 kind、message、retryable。 |

生命周期 API：

```rust
engine.pause(id).await?;
engine.resume(id).await?;
engine.cancel(id, delete_files).await?;
```

查询 API：

```rust
let one = engine.status(id);
let all = engine.list();
let active = engine.active();
let waiting = engine.waiting();
let stopped = engine.stopped();
let stats = engine.global_stats();
```

注意：`DownloadId::to_gid()` 会生成 aria2 风格 16 位 hex GID，但这是 UUID 前 8 字节的有损投影。`DownloadId::from_gid()` 无法还原原始 UUID，只会构造一个上半部分为 0 的新 UUID。后续如果要用 GID 查找 `gosh-dl` 内部任务，应维护 `gid -> DownloadId` 映射，或遍历 `engine.list()` 使用 `DownloadId::matches_gid(gid)` 匹配。

## 6. 事件系统

`gosh-dl` 使用 Tokio broadcast channel 推送事件：

```rust
let mut events = engine.subscribe();
while let Ok(event) = events.recv().await {
    match event {
        DownloadEvent::Progress { id, progress } => {}
        DownloadEvent::Completed { id } => {}
        DownloadEvent::Failed { id, error, retryable } => {}
        _ => {}
    }
}
```

事件类型：

| 事件 | 说明 |
| --- | --- |
| `Added` | 任务已加入引擎。 |
| `Started` | 任务开始执行。 |
| `Progress` | 进度更新，包含速度、已完成字节、总大小、ETA、连接数等。 |
| `StateChanged` | 状态变化。 |
| `Completed` | 下载完成。 |
| `Failed` | 下载失败。 |
| `Paused` | 已暂停。 |
| `Resumed` | 已恢复。 |
| `Removed` | 已移除。 |

PiDownloader 当前更多使用轮询 `engine.active()` 生成前端事件；如果后续要降低轮询成本，可以把 `DownloadEvent` 接入 `events/reporter.rs`，由后端统一节流后推送前端。

## 7. 并发、优先级与限速

### 并发队列

`gosh-dl` 内部有 `PriorityQueue`：

| 配置/能力 | 说明 |
| --- | --- |
| `EngineConfig.max_concurrent_downloads` | 全局最大同时下载任务数。 |
| `DownloadPriority` | `Low`、`Normal`、`High`、`Critical`。 |
| 同优先级 FIFO | 同一优先级按进入队列顺序调度。 |
| 动态修改优先级 | `engine.set_priority(id, priority)`。 |

### 限速

限速单位统一是 bytes/sec：

| 配置 | 说明 |
| --- | --- |
| `EngineConfig.global_download_limit` | 全局下载限速。 |
| `EngineConfig.global_upload_limit` | 全局上传限速。 |
| `DownloadOptions.max_download_speed` | 任务级下载限速字段。 |
| `DownloadOptions.max_upload_speed` | 任务级上传限速，Torrent 路径会使用。 |

### 定时带宽规则

`ScheduleRule` 支持按小时和星期设置限速：

```rust
let rule = ScheduleRule::weekdays(
    9,
    17,
    Some(1024 * 1024),
    None,
);

let config = EngineConfig::default().add_schedule_rule(rule);
```

规则按顺序匹配，first match wins。引擎内部每分钟更新一次当前限速。

## 8. 持久化与恢复

启用 `storage` 后，`EngineConfig.database_path` 可指定 SQLite 文件路径：

```rust
let config = EngineConfig::default()
    .database_path(app_data_dir.join("gosh_dl.db"));
```

持久化能力：

| 数据 | 支持情况 |
| --- | --- |
| 下载任务状态 | 支持。 |
| HTTP 分片状态 | 支持，用于暂停/崩溃后恢复。 |
| Torrent 原始 metainfo | 支持，用于 `.torrent` 崩溃恢复。 |
| Magnet URI | 支持保存 URI，恢复时可重新拉取 metadata。 |
| 运行时 metadata | 支持，主要供 recursive-http 使用。 |
| SQLite WAL | 支持，设计目标是崩溃安全提交。 |

引擎启动时会加载持久化任务，并把崩溃前的 `Downloading`、`Connecting`、`Seeding` 恢复成 `Paused`，避免启动后自动继续未确认的任务。

## 9. recursive-http 能力

`recursive-http` 是可选 feature，当前 PiDownloader 未启用。启用后支持：

| 能力 | 说明 |
| --- | --- |
| 递归发现 HTTP 目录 | 解析 HTML 页面中的 `<a href>`。 |
| 同 host 限制 | `RecursiveOptions.same_host_only` 默认 true。 |
| 路径前缀限制 | `RecursiveOptions.allowed_prefix`。 |
| include/exclude patterns | 过滤发现的路径。 |
| 保留远端目录结构 | `RecursiveOptions.preserve_paths` 默认 true。 |
| fail-fast | 子任务失败后取消同组兄弟任务。 |
| 父级任务状态 | 独立的 recursive job 状态和事件流。 |

限制：

| 限制 | 说明 |
| --- | --- |
| 不执行 JavaScript | 只能解析静态 HTML 链接。 |
| 不是完整 wget -r 替代 | README 明确标注不是全量递归镜像器。 |
| 事件流独立 | 父级 job 使用 `subscribe_recursive_jobs()`，不是主 `DownloadEvent`。 |
| PiDownloader 未启用 | 当前 `Cargo.toml` 没有开启 `recursive-http` feature。 |

## 10. PiDownloader 当前接入状态

当前项目封装位置：

| 文件 | 作用 |
| --- | --- |
| `src-tauri/src/download/engine.rs` | 包装 `DownloadEngine`，提供 HTTP 探测、HTTP/Magnet 添加、暂停、恢复、取消、状态查询、事件订阅。 |
| `src-tauri/src/download/manager.rs` | 动态更新并发、全局限速、HTTP 线程数、重试次数、忽略 SSL 证书。 |
| `src-tauri/src/download/protocol.rs` | 识别 `http`、`https`、`magnet`、`.torrent/torrent:`。 |
| `src-tauri/src/core/state/task_service.rs` | 前端新建任务到 gosh-dl 的主要业务入口。 |
| `src-tauri/src/core/state/settings_state.rs` | 把设置页传输配置应用到 gosh-dl。 |

已接入能力：

| 能力 | 当前状态 |
| --- | --- |
| HTTP/HTTPS 新建任务 | 已接入。 |
| HTTP metadata 探测 | 已接入，通过 `probe_server` 获取建议文件名和大小。 |
| Magnet 新建任务 | 已接入。 |
| `.torrent` 文件任务 | 底层支持，项目尚未真正接入文件读取和 `add_torrent`。 |
| 全局最大并发 | 已接入设置页。 |
| HTTP 单任务连接数 | 已接入设置页，并通过 `DownloadOptions.max_connections` 传入新任务。 |
| 最大下载重试次数 | 已接入设置页，对应 `config.http.max_retries`。 |
| 忽略 SSL 证书 | 已接入设置页，对应 `config.http.accept_invalid_certs`。 |
| 全局下载/上传限速 | 已接入设置页，单位转换为 bytes/sec 后传给 gosh-dl。 |
| 自动开始下载 | 项目层接入：创建后如关闭自动开始，会立刻调用 `engine.pause(id)`。 |
| 暂停/恢复/取消 | 已接入。 |
| 活跃任务进度 | 已接入，当前通过 `engine.active()` 定时轮询。 |
| SQLite 持久化 | 已接入，gosh-dl 内部库使用 `gosh_dl.db`。 |

尚未接入但底层支持的能力：

| 能力 | 建议入口 |
| --- | --- |
| HTTP 自定义 Headers/Cookies/Referer/User-Agent | 扩展新建任务参数和 `EngineWrapper::add_http`。 |
| HTTP 校验和 MD5/SHA-256 | 新建任务增加 checksum 输入，写入 `DownloadOptions.checksum`。 |
| HTTP 镜像 URL | 新建任务增加 mirrors 列表，写入 `DownloadOptions.mirrors`。 |
| 任务优先级 | UI 增加优先级字段；后端传 `DownloadOptions.priority`，支持 `set_priority`。 |
| `.torrent` 文件上传/导入 | Tauri command 接收文件路径或 bytes，调用 `engine.add_torrent`。 |
| Torrent 文件选择 | 获取 torrent metadata 后让用户选择文件，传 `selected_files`。 |
| Torrent 顺序下载 | 视频/音频场景可暴露 `sequential`。 |
| 做种比例/上传限速 | 设置页增加 Torrent 分组，对应 `seed_ratio`、`max_upload_speed`。 |
| DHT/PEX/LPD 开关 | 设置页增加高级 Torrent 开关，对应 `EngineConfig` 字段。 |
| WebSeed/uTP/加密策略 | 适合作为高级设置，需先做实际下载测试。 |
| 事件驱动状态同步 | 使用 `engine.subscribe()`，替代或补充当前轮询。 |
| 定时带宽规则 | UI 增加时间段规则，写入 `EngineConfig.schedule_rules`。 |
| recursive-http | 若产品需要目录镜像，开启 Cargo feature 并设计父子任务 UI。 |

## 11. 当前接入风险与注意事项

### 11.1 GID 反查风险

`gosh-dl` 文档和源码明确说明：`DownloadId::to_gid()` 是有损投影，`DownloadId::from_gid()` 不能还原原始 ID。

PiDownloader 当前在多个地方使用：

```rust
DownloadId::from_gid(gid)
```

然后调用：

```rust
self.engine.status(id)
self.engine.pause(id).await
self.engine.resume(id).await
self.engine.cancel(id, delete_files).await
```

这存在反查不到原任务的风险。建议后续改为：

1. 数据库增加原始 UUID 字段，保存 `DownloadId.as_uuid()`。
2. 或维护 `gid -> DownloadId` 内存映射并持久化。
3. 或查询时遍历 `engine.list()`，使用 `status.id.matches_gid(gid)` 找到真实 ID。

### 11.2 自动开始下载的语义

`gosh-dl` 的 `add_http`、`add_magnet`、`add_torrent` 会立即启动任务。PiDownloader 当前的“关闭自动开始”是创建后马上调用 `pause(id)`。这在慢网或排队场景通常可接受，但语义上不是“只入队不启动”。如果后续需要严格的“新建即暂停”，需要在项目层做任务草稿，或研究是否扩展底层 queue 行为。

### 11.3 全局配置更新影响范围

`engine.set_config(config)` 会更新并发、调度规则和 HTTP 连接池的全局限速。对于已经创建的 HTTP 任务，部分任务级参数如 `max_connections` 是新任务启动时读取的，不应假设运行中任务会即时改变分片数量。

### 11.4 忽略 SSL 证书

`accept_invalid_certs = true` 会降低 HTTPS 安全性。UI 应明确提示风险，并建议只在内网、自签名证书或用户确认的场景启用。

### 11.5 Torrent 能力需要产品级验证

底层实现覆盖面很广，但 README 对 DHT、PEX、LPD、MSE、WebSeed、uTP、文件预分配等能力标注为“实现存在/轻量测试/部分未充分测试”。PiDownloader 暴露高级 Torrent 设置前，建议用真实公共种子、私有种子、弱网、Windows 路径、多文件种子分别做验证。

## 12. 推荐的后续开发顺序

1. 修复 GID 到真实 `DownloadId` 的映射问题，保证暂停、恢复、取消、状态同步可靠。
2. 接入 `DownloadEvent`，建立事件驱动的任务状态更新，同时保留低频轮询作为兜底。
3. 补齐 HTTP 高价值能力：Headers/Cookies/Referer、checksum、mirrors、priority。
4. 接入 `.torrent` 文件导入，并设计 Torrent metadata 预览和文件选择。
5. 增加 Torrent 高级设置：DHT/PEX/LPD、上传限速、做种比例、顺序下载。
6. 如果需要目录镜像，再启用 `recursive-http` feature，并以父任务 + 子任务聚合方式设计 UI。

