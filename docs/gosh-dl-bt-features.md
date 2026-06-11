# gosh-dl BitTorrent / 磁力链接 功能开发文档

> **版本**: gosh-dl v0.4.0  
> **Crate 路径**: `C:\Users\fakba\.cargo\registry\src\index.crates.io-1949cf8c6b5b557f\gosh-dl-0.4.0`  
> **Feature Flag**: `torrent` (默认启用)

---

## 目录

- [1. 概览](#1-概览)
- [2. Feature Flags](#2-feature-flags)
- [3. 核心类型](#3-核心类型)
- [4. 种子文件解析 (Metainfo)](#4-种子文件解析-metainfo)
- [5. 磁力链接解析 (MagnetUri)](#5-磁力链接解析-magneturi)
- [6. 引擎配置 (EngineConfig)](#6-引擎配置-engineconfig)
- [7. 下载选项 (DownloadOptions)](#7-下载选项-downloadoptions)
- [8. 下载引擎 API (DownloadEngine)](#8-下载引擎-api-downloadengine)
- [9. 事件系统 (DownloadEvent)](#9-事件系统-downloadevent)
- [10. 对等网络协议](#10-对等网络协议)
- [11. 带宽调度](#11-带宽调度)
- [12. 持久化存储](#12-持久化存储)
- [13. PiDown 集成现状](#13-pidown-集成现状)
- [14. 代码示例](#14-代码示例)

---

## 1. 概览

gosh-dl 是一个用 Rust 编写的快速、可嵌入的下载引擎，支持 HTTP/HTTPS 多连接加速下载和完整的 BitTorrent 协议。

### BitTorrent 核心特性

| 特性 | 状态 | 说明 |
|------|------|------|
| .torrent 文件解析 | ✅ | BEP 3 — Bencode 解析、Info Hash 计算 |
| 磁力链接解析 | ✅ | Hex (40字符) 和 Base32 (32字符) 两种格式 |
| 元数据获取 (BEP 9) | ✅ | 从 Peer 获取磁力链接的 Metadata |
| Tracker 通信 | ✅ | HTTP/UDP Tracker 协议 |
| DHT 对等发现 (BEP 5) | ✅ | 分布式哈希表节点发现 |
| PEX 对等交换 (BEP 11) | ✅ | Peer Exchange 协议 |
| LPD 本地发现 (BEP 14) | ✅ | 局域网组播发现 |
| 分片管理 | ✅ | SHA-1 校验、稀疏模式 |
| Choking 算法 | ✅ | BEP 3 — 标准 unchoke 策略 |
| 多文件种子 | ✅ | 支持单文件和多文件种子 |
| 选择性下载 | ✅ | 支持选择下载部分文件 |
| 顺序下载 | ✅ | 支持流式/顺序下载 |
| WebSeed (BEP 17/19) | ✅ | HTTP/HTTPS 种子加速 |
| MSE/PE 加密 | ✅ | Message Stream Encryption |
| uTP 传输 (BEP 29) | ✅ | Micro Transport Protocol |
| Announce List (BEP 12) | ✅ | 多 Tracker 分层列表 |
| Private 种子 (BEP 27) | ✅ | 私有种子标志位检测 |
| 做种/分享率控制 | ✅ | 可设置分享率阈值自动停止 |
| 限速 (上传/下载) | ✅ | 全局和单任务级别 |
| 文件预分配 | ✅ | None / Sparse / Full 三种模式 |
| 会话持久化 | ✅ | SQLite 存储，崩溃恢复 |

---

## 2. Feature Flags

```toml
[features]
default = ["http", "torrent", "storage"]
torrent = [
    "dep:reqwest",       # Tracker HTTP 通信
    "dep:serde_bencode", # Bencode 编解码
    "dep:bitvec",        # Bitfield 管理
    "dep:num-bigint",    # DHT 大整数运算
    "dep:num-traits",
    "dep:num-integer",
    "dep:mainline",      # DHT 实现
    "dep:socket2",       # 底层 Socket
    "dep:tokio-tungstenite", # WebSocket (WebRTC tracker)
    "dep:base64",
]
storage = ["dep:rusqlite"] # SQLite 持久化
```

---

## 3. 核心类型

### DownloadId

唯一下载标识符，底层为 UUID v4。

```rust
pub struct DownloadId(Uuid);

impl DownloadId {
    pub fn new() -> Self;                        // 随机生成
    pub fn from_uuid(uuid: Uuid) -> Self;       // 从 UUID 构造
    pub fn to_gid(&self) -> String;             // 16字符 hex (aria2 兼容)
    pub fn from_gid(gid: &str) -> Option<Self>; // 从 GID 解析 (有损)
    pub fn matches_gid(&self, gid: &str) -> bool; // GID 匹配检测
}
```

### DownloadKind

```rust
pub enum DownloadKind {
    Http,     // HTTP/HTTPS 下载
    Torrent,  // .torrent 文件下载
    Magnet,   // 磁力链接下载
}
```

### DownloadState

```rust
pub enum DownloadState {
    Queued,                                    // 排队中
    Connecting,                                // 连接中
    Downloading,                               // 下载中
    Seeding,                                   // 做种中 (仅 BT)
    Paused,                                    // 已暂停
    Completed,                                 // 已完成
    Error { kind, message, retryable },        // 错误
}

impl DownloadState {
    pub fn is_active(&self) -> bool;   // Downloading | Seeding | Connecting
    pub fn is_finished(&self) -> bool; // Completed | Error
    pub fn to_aria2_status(&self) -> &'static str;
}
```

### DownloadProgress

```rust
pub struct DownloadProgress {
    pub total_size: Option<u64>,      // 总大小 (可能初始未知)
    pub completed_size: u64,          // 已下载字节
    pub download_speed: u64,          // 下载速度 (bytes/sec)
    pub upload_speed: u64,            // 上传速度 (bytes/sec, 仅 BT)
    pub connections: u32,             // 活跃连接数
    pub seeders: u32,                 // 做种者数 (仅 BT)
    pub peers: u32,                   // 对等体数 (仅 BT)
    pub eta_seconds: Option<u64>,     // 预估剩余时间 (秒)
}

impl DownloadProgress {
    pub fn percentage(&self) -> f64;  // 0.0 - 100.0
}
```

### DownloadStatus

完整的下载状态信息：

```rust
pub struct DownloadStatus {
    pub id: DownloadId,
    pub kind: DownloadKind,
    pub state: DownloadState,
    pub priority: DownloadPriority,
    pub progress: DownloadProgress,
    pub metadata: DownloadMetadata,
    pub torrent_info: Option<TorrentStatusInfo>,  // BT 专属
    pub peers: Option<Vec<PeerInfo>>,              // BT 专属
    pub created_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
}
```

### DownloadMetadata

```rust
pub struct DownloadMetadata {
    pub name: String,
    pub url: Option<String>,           // HTTP URL
    pub magnet_uri: Option<String>,    // 磁力链接 URI
    pub info_hash: Option<String>,     // Info Hash (hex)
    pub save_dir: PathBuf,
    pub filename: Option<String>,
    pub user_agent: Option<String>,
    pub referer: Option<String>,
    pub headers: Vec<(String, String)>,
    pub cookies: Vec<String>,
    pub checksum: Option<ExpectedChecksum>,
    pub mirrors: Vec<String>,
    pub etag: Option<String>,
    pub last_modified: Option<String>,
}
```

---

## 4. 种子文件解析 (Metainfo)

> 源码: `src/torrent/metainfo.rs`

### Metainfo 结构

```rust
pub struct Metainfo {
    pub info_hash: Sha1Hash,              // [u8; 20] — SHA-1 哈希
    pub info: Info,                        // Info 字典
    pub announce: Option<String>,          // 主 Tracker URL
    pub announce_list: Vec<Vec<String>>,   // BEP 12 多层 Tracker
    pub creation_date: Option<i64>,        // 创建时间 (Unix 时间戳)
    pub comment: Option<String>,           // 注释
    pub created_by: Option<String>,        // 创建客户端
    pub encoding: Option<String>,          // 编码 (如 "UTF-8")
    pub url_list: Vec<String>,             // BEP 19 WebSeed (GetRight)
    pub httpseeds: Vec<String>,            // BEP 17 WebSeed (Hoffman)
}
```

### Info 结构

```rust
pub struct Info {
    pub name: String,            // 名称
    pub piece_length: u64,       // 分片大小
    pub pieces: Vec<Sha1Hash>,   // 分片 SHA-1 哈希列表
    pub files: Vec<FileInfo>,    // 文件列表
    pub total_size: u64,         // 总大小
    pub is_single_file: bool,    // 是否单文件种子
    pub private: bool,           // BEP 27 私有标志
}
```

### FileInfo 结构

```rust
pub struct FileInfo {
    pub path: PathBuf,          // 文件路径
    pub length: u64,            // 文件大小
    pub offset: u64,            // 在连接文件流中的偏移
    pub md5sum: Option<String>, // MD5 哈希 (可选)
}
```

### 主要方法

```rust
impl Metainfo {
    pub fn parse(data: &[u8]) -> Result<Self>;
    pub fn info_hash_hex(&self) -> String;              // 40 字符 hex
    pub fn info_hash_urlencoded(&self) -> String;       // URL 编码
    pub fn piece_hash(&self, index: usize) -> Option<&Sha1Hash>;
    pub fn piece_range(&self, index: usize) -> Option<(u64, u64)>;
    pub fn piece_length(&self, index: usize) -> Option<u64>;
    pub fn all_trackers(&self) -> Vec<String>;          // 合并所有 Tracker
    pub fn all_webseeds(&self) -> Vec<String>;          // 合并所有 WebSeed
    pub fn has_webseeds(&self) -> bool;
    pub fn files_for_piece(&self, piece_index: usize) -> Vec<(usize, u64, u64)>;
}
```

---

## 5. 磁力链接解析 (MagnetUri)

> 源码: `src/torrent/magnet.rs`

### MagnetUri 结构

```rust
pub struct MagnetUri {
    pub info_hash: Sha1Hash,                 // Info Hash (20 bytes)
    pub display_name: Option<String>,        // dn= 显示名称
    pub trackers: Vec<String>,               // tr= Tracker 列表
    pub web_seeds: Vec<String>,              // ws= WebSeed 列表
    pub exact_length: Option<u64>,           // xl= 精确大小
    pub exact_source: Option<String>,        // xs= .torrent 文件 URL
    pub keyword_topic: Option<String>,       // kt= 搜索关键字
    pub acceptable_sources: Vec<String>,     // as= 可接受来源
    pub manifest_topic: Option<String>,      // mt= 清单链接
    pub original_uri: String,                // 原始 URI 字符串
}
```

### 磁力链接格式

```
magnet:?xt=urn:btih:<hash>&dn=<name>&tr=<tracker>&ws=<webseed>
```

### 支持的参数

| 参数 | 名称 | 说明 |
|------|------|------|
| `xt` | Exact Topic | **必需** — `urn:btih:<hash>` |
| `dn` | Display Name | 显示名称 |
| `tr` | Tracker | Tracker URL (可多个) |
| `ws` | Web Seed | WebSeed URL (可多个) |
| `xl` | Exact Length | 文件大小 |
| `xs` | Exact Source | .torrent 文件下载地址 |
| `kt` | Keyword Topic | 搜索关键字 |
| `as` | Acceptable Source | 可接受的备选来源 |
| `mt` | Manifest Topic | 清单链接 |

### Info Hash 格式支持

| 格式 | 长度 | 说明 |
|------|------|------|
| Hex | 40 字符 | 标准十六进制编码 |
| Base32 | 32 字符 | RFC 4648 Base32 编码 |

### 主要方法

```rust
impl MagnetUri {
    pub fn parse(uri: &str) -> Result<Self>;            // 解析磁力链接
    pub fn info_hash_hex(&self) -> String;              // Hex 编码
    pub fn info_hash_urlencoded(&self) -> String;       // URL 编码
    pub fn name(&self) -> String;                       // 名称或 hash fallback
    pub fn to_uri(&self) -> String;                     // 重新生成 URI
    pub fn has_trackers(&self) -> bool;
    pub fn is_trackerless(&self) -> bool;               // 是否无 Tracker (依赖 DHT)
}
```

---

## 6. 引擎配置 (EngineConfig)

> 源码: `src/config.rs`

### EngineConfig — 全局配置

```rust
pub struct EngineConfig {
    pub download_dir: PathBuf,                   // 下载目录
    pub max_concurrent_downloads: usize,         // 最大并发下载数 (默认 5)
    pub max_connections_per_download: usize,      // 每下载最大连接 (默认 16)
    pub min_segment_size: u64,                   // 最小分段大小 (默认 1 MiB)
    pub global_download_limit: Option<u64>,      // 全局下载限速 (bytes/sec)
    pub global_upload_limit: Option<u64>,         // 全局上传限速 (bytes/sec)
    pub schedule_rules: Vec<ScheduleRule>,       // 时间段限速规则
    pub user_agent: String,                      // User-Agent
    pub enable_dht: bool,                        // DHT 开关 (默认 true)
    pub enable_pex: bool,                        // PEX 开关 (默认 true)
    pub enable_lpd: bool,                        // LPD 开关 (默认 true)
    pub max_peers: usize,                        // 每种子最大 Peer 数 (默认 55)
    pub seed_ratio: f64,                         // 做种比率阈值 (默认 1.0)
    pub database_path: Option<PathBuf>,          // SQLite 数据库路径
    pub http: HttpConfig,                        // HTTP 配置
    pub torrent: TorrentConfig,                  // BT 配置
}
```

### TorrentConfig — BT 专属配置

```rust
pub struct TorrentConfig {
    pub listen_port_range: (u16, u16),       // 监听端口范围 (默认 6881-6889)
    pub dht_bootstrap_nodes: Vec<String>,    // DHT 引导节点
    pub allocation_mode: AllocationMode,     // 文件分配模式 (默认 None)
    pub tracker_update_interval: u64,        // Tracker 更新间隔 (默认 1800s)
    pub peer_timeout: u64,                   // Peer 超时 (默认 120s)
    pub max_pending_requests: usize,         // 最大挂起请求 (默认 16)
    pub enable_endgame: bool,                // Endgame 模式 (默认 true)
    pub tick_interval_ms: u64,               // Peer 循环间隔 (默认 100ms)
    pub connect_interval_secs: u64,          // 连接尝试间隔 (默认 5s)
    pub choking_interval_secs: u64,          // Choking 算法间隔 (默认 10s)
    pub webseed: WebSeedConfig,              // WebSeed 配置
    pub encryption: EncryptionConfig,        // 加密配置
    pub utp: UtpConfigSettings,              // uTP 传输配置
}
```

### AllocationMode — 文件预分配

```rust
pub enum AllocationMode {
    None,   // 按需增长 (默认)
    Sparse, // 稀疏分配 — 设置文件大小但不写零
    Full,   // 完全预分配 — 写满零字节 (防碎片，慢)
}
```

### EncryptionConfig — MSE/PE 加密配置

```rust
pub struct EncryptionConfig {
    pub policy: EncryptionPolicy,    // 加密策略 (默认 Preferred)
    pub allow_plaintext: bool,       // 允许明文回退 (默认 true)
    pub allow_rc4: bool,             // 允许 RC4 (默认 true)
    pub min_padding: usize,          // 最小填充字节 (默认 0)
    pub max_padding: usize,          // 最大填充字节 (默认 512)
}

pub enum EncryptionPolicy {
    Disabled,   // 禁用加密 (仅明文)
    Allowed,    // 允许但不要求
    Preferred,  // 优先加密，回退明文 (默认)
    Required,   // 强制加密 (拒绝非 MSE)
}
```

### WebSeedConfig — WebSeed 配置

```rust
pub struct WebSeedConfig {
    pub enabled: bool,              // 启用 WebSeed (默认 true)
    pub max_connections: usize,     // 最大并发 WebSeed 连接 (默认 4)
    pub timeout_seconds: u64,       // 请求超时 (默认 30s)
    pub max_failures: u32,          // 最大连续失败次数 (默认 5)
}
```

### UtpConfigSettings — uTP 传输配置

```rust
pub struct UtpConfigSettings {
    pub enabled: bool,              // 启用 uTP (默认 false)
    pub policy: TransportPolicy,    // 传输策略 (默认 PreferUtp)
    pub tcp_fallback: bool,         // TCP 回退 (默认 true)
    pub target_delay_us: u32,       // LEDBAT 目标延迟 (默认 100ms)
    pub max_window_size: u32,       // 最大拥塞窗口 (默认 1MB)
    pub recv_window: u32,           // 初始接收窗口 (默认 1MB)
    pub enable_sack: bool,          // 选择性 ACK (默认 true)
}

pub enum TransportPolicy {
    TcpOnly,     // 仅 TCP
    UtpOnly,     // 仅 uTP
    PreferUtp,   // 优先 uTP (默认)
    PreferTcp,   // 优先 TCP
}
```

### DHT 引导节点 (默认)

```
router.bittorrent.com:6881
router.utorrent.com:6881
dht.transmissionbt.com:6881
```

### Builder 方法

`EngineConfig` 支持链式配置：

```rust
let config = EngineConfig::new()
    .download_dir("/path/to/downloads")
    .max_concurrent_downloads(10)
    .download_limit(Some(1_048_576))     // 1 MB/s
    .upload_limit(Some(524_288))         // 512 KB/s
    .user_agent("PiDown/1.0")
    .database_path("/path/to/db.sqlite");
```

---

## 7. 下载选项 (DownloadOptions)

> 源码: `src/protocol/options.rs`

每个任务可设置独立选项：

```rust
pub struct DownloadOptions {
    pub priority: DownloadPriority,             // 优先级
    pub save_dir: Option<PathBuf>,              // 保存目录
    pub filename: Option<String>,               // 输出文件名
    pub user_agent: Option<String>,             // UA
    pub referer: Option<String>,                // Referer
    pub headers: Vec<(String, String)>,         // 自定义 Headers
    pub cookies: Option<Vec<String>>,           // Cookies
    pub checksum: Option<ExpectedChecksum>,     // 校验和
    pub mirrors: Vec<String>,                   // 备用下载地址
    pub max_connections: Option<usize>,         // 最大连接数
    pub max_download_speed: Option<u64>,        // 下载限速 (bytes/sec)
    pub max_upload_speed: Option<u64>,          // 上传限速 (bytes/sec, 仅 BT)
    pub seed_ratio: Option<f64>,                // 分享率限制 (仅 BT)
    pub selected_files: Option<Vec<usize>>,     // 选择下载文件 (仅 BT)
    pub sequential: Option<bool>,               // 顺序下载 (仅 BT)
}
```

### DownloadPriority

```rust
pub enum DownloadPriority {
    Low = -1,       // 最后下载
    Normal = 0,     // 默认
    High = 1,       // 优先下载
    Critical = 2,   // 最高优先
}
```

### BT 专属选项

| 选项 | 类型 | 说明 |
|------|------|------|
| `max_upload_speed` | `Option<u64>` | 单任务上传限速 |
| `seed_ratio` | `Option<f64>` | 达到此分享率后停止做种 |
| `selected_files` | `Option<Vec<usize>>` | 按索引选择要下载的文件 |
| `sequential` | `Option<bool>` | 按顺序下载分片 (适合流媒体) |

### Builder 方法

```rust
let options = DownloadOptions::new()
    .save_dir("/downloads/movies")
    .max_download_speed(2_097_152)   // 2 MB/s
    .max_upload_speed(524_288)       // 512 KB/s
    .seed_ratio(2.0)                 // 上传 2 倍后停止
    .selected_files(vec![0, 2, 5])   // 只下载第 0, 2, 5 个文件
    .sequential(true);               // 顺序下载
```

---

## 8. 下载引擎 API (DownloadEngine)

> 源码: `src/engine.rs`

### 创建引擎

```rust
let config = EngineConfig::default();
let engine = DownloadEngine::new(config).await?;
```

### BT 相关方法

#### 添加种子下载

```rust
pub async fn add_torrent(
    &self,
    torrent_data: &[u8],       // .torrent 文件的原始字节
    options: DownloadOptions,
) -> Result<DownloadId>;
```

**行为**:
1. 解析 `.torrent` 文件 (`Metainfo::parse`)
2. 计算 Info Hash
3. 创建 `DownloadStatus`（kind = `Torrent`）
4. 持久化到数据库（包括原始 torrent 数据用于崩溃恢复）
5. 发送 `Added` 事件
6. 启动 `TorrentDownloader` — 连接 Tracker、DHT、PEX、LPD

#### 添加磁力链接下载

```rust
pub async fn add_magnet(
    &self,
    magnet_uri: &str,          // "magnet:?xt=urn:btih:..."
    options: DownloadOptions,
) -> Result<DownloadId>;
```

**行为**:
1. 解析磁力链接 (`MagnetUri::parse`)
2. 创建 `DownloadStatus`（kind = `Magnet`，`torrent_info` 初始为 `None`）
3. 持久化到数据库
4. 发送 `Added` 事件
5. 启动 `TorrentDownloader`（元数据获取模式）
6. 通过 BEP 9 从 Peer 获取元数据后，填充 `torrent_info`

#### 通用控制方法

```rust
pub async fn pause(&self, id: DownloadId) -> Result<()>;
pub async fn resume(&self, id: DownloadId) -> Result<()>;
pub async fn cancel(&self, id: DownloadId, delete_files: bool) -> Result<()>;
```

#### 状态查询

```rust
pub fn status(&self, id: DownloadId) -> Option<DownloadStatus>;
pub fn list(&self) -> Vec<DownloadStatus>;
pub fn active(&self) -> Vec<DownloadStatus>;
pub fn waiting(&self) -> Vec<DownloadStatus>;
pub fn stopped(&self) -> Vec<DownloadStatus>;
pub fn global_stats(&self) -> GlobalStats;
```

#### 配置动态更新

```rust
pub fn set_config(&self, config: EngineConfig) -> Result<()>;
pub fn get_config(&self) -> EngineConfig;
pub fn set_priority(&self, id: DownloadId, priority: DownloadPriority) -> Result<()>;
pub fn get_priority(&self, id: DownloadId) -> Option<DownloadPriority>;
pub fn get_bandwidth_limits(&self) -> BandwidthLimits;
pub fn set_schedule_rules(&self, rules: Vec<ScheduleRule>);
```

#### 事件订阅

```rust
pub fn subscribe(&self) -> broadcast::Receiver<DownloadEvent>;
```

#### 关闭

```rust
pub async fn shutdown(&self) -> Result<()>;
```

---

## 9. 事件系统 (DownloadEvent)

> 源码: `src/protocol/events.rs`

```rust
pub enum DownloadEvent {
    Added { id: DownloadId },
    Started { id: DownloadId },
    Progress { id: DownloadId, progress: DownloadProgress },
    StateChanged { id: DownloadId, old_state: DownloadState, new_state: DownloadState },
    Completed { id: DownloadId },
    Failed { id: DownloadId, error: String, retryable: bool },
    Removed { id: DownloadId },
    Paused { id: DownloadId },
    Resumed { id: DownloadId },
}
```

事件通道容量为 1024，使用 `tokio::sync::broadcast` 广播。

---

## 10. 对等网络协议

### TorrentDownloader

> 源码: `src/torrent/mod.rs`

核心下载协调器，支持从 `.torrent` 和磁力链接两种方式启动。

```rust
impl TorrentDownloader {
    pub fn from_torrent(id, metainfo, save_dir, config, event_tx) -> Result<Self>;
    pub fn from_magnet(id, magnet, save_dir, config, event_tx) -> Result<Self>;
    pub async fn start(self: Arc<Self>) -> Result<()>;
    pub fn set_selected_files(&self, file_indices: Option<&[usize]>);
    pub fn set_sequential(&self, sequential: bool);
    pub fn set_webseed_config(&self, config: EngineWebSeedConfig);
    pub fn set_mse_config(&self, config: EngineEncryptionConfig);
    pub fn set_transport_policy(&self, policy: TransportPolicy, tcp_fallback: bool);
    pub fn progress(&self) -> DownloadProgress;
    pub fn info_hash(&self) -> &Sha1Hash;
    pub fn info_hash_hex(&self) -> String;
    pub fn state(&self) -> TorrentState;
    pub fn name(&self) -> String;
    pub fn metainfo(&self) -> Option<Arc<Metainfo>>;
    pub fn raw_torrent_data(&self) -> Option<Vec<u8>>;
}
```

### TorrentState

```rust
pub enum TorrentState {
    Checking,    // 校验已有文件
    Metadata,    // 获取元数据 (磁力链接)
    Downloading, // 下载中
    Seeding,     // 做种中
    Paused,      // 暂停
    Stopped,     // 停止
    Error,       // 错误
}
```

### BT 状态信息 (TorrentStatusInfo)

```rust
pub struct TorrentStatusInfo {
    pub files: Vec<TorrentFile>,    // 文件列表
    pub piece_length: u64,          // 分片大小
    pub pieces_count: usize,        // 分片数量
    pub private: bool,              // 是否私有种子
}
```

### TorrentFile

```rust
pub struct TorrentFile {
    pub index: usize,       // 文件索引
    pub path: PathBuf,      // 文件路径
    pub size: u64,          // 文件大小
    pub selected: bool,     // 是否选中下载
    pub completed: u64,     // 已完成字节
}
```

### PeerInfo

```rust
pub struct PeerInfo {
    pub id: Option<String>,        // Peer ID
    pub ip: String,                // IP 地址
    pub port: u16,                 // 端口
    pub client: Option<String>,    // 客户端名称
    pub download_speed: u64,       // 下载速度
    pub upload_speed: u64,         // 上传速度
    pub progress: f64,             // 进度 (0.0 - 1.0)
    pub am_choking: bool,          // 我们是否 choke 它
    pub peer_choking: bool,        // 它是否 choke 我们
}
```

### 子模块概览

| 模块 | 文件 | 说明 |
|------|------|------|
| `bencode` | `bencode.rs` | Bencode 编解码器 |
| `metainfo` | `metainfo.rs` | .torrent 文件解析 |
| `magnet` | `magnet.rs` | 磁力链接解析 |
| `metadata` | `metadata.rs` | BEP 9 元数据交换协议 |
| `tracker` | `tracker.rs` | HTTP/UDP Tracker 通信 |
| `peer` | `peer.rs` | Peer Wire 协议 (BEP 3) |
| `piece` | `piece.rs` | 分片管理与 SHA-1 校验 |
| `dht` | `dht.rs` | BEP 5 DHT 节点发现 |
| `pex` | `pex.rs` | BEP 11 Peer Exchange |
| `lpd` | `lpd.rs` | BEP 14 局域网发现 |
| `choking` | `choking.rs` | Choking/Unchoking 算法 |
| `mse` | `mse.rs` | MSE/PE 加密 |
| `transport` | `transport.rs` | TCP/uTP 传输抽象 |
| `utp/` | `utp/` | BEP 29 uTP 协议实现 |
| `webseed` | `webseed.rs` | BEP 17/19 WebSeed |

---

## 11. 带宽调度

> 源码: `src/scheduler.rs`

支持基于时间的限速规则：

```rust
pub struct BandwidthLimits {
    pub download: Option<u64>,   // 下载限速 (None = 无限)
    pub upload: Option<u64>,     // 上传限速 (None = 无限)
}

pub struct ScheduleRule {
    // 起止小时 (0-23)、星期过滤、限速值
}

impl ScheduleRule {
    pub fn all_days(start_hour, end_hour, download_limit, upload_limit) -> Self;
    pub fn weekdays(start_hour, end_hour, download_limit, upload_limit) -> Self;
    pub fn weekends(start_hour, end_hour, download_limit, upload_limit) -> Self;
}
```

**应用优先级**: 规则按顺序匹配，第一个匹配的生效。无匹配时使用全局默认值。

---

## 12. 持久化存储

### SqliteStorage

使用 `rusqlite` 实现的 SQLite 持久化后端：

- 保存/恢复下载状态 (`save_download` / `load_downloads`)
- 保存原始 torrent 数据 (`save_torrent_data`) — 用于崩溃恢复
- 崩溃恢复时自动重新加载活跃下载
- 可选功能，通过 `storage` feature flag 控制

---

## 13. PiDown 集成现状

### 已对接的功能

| 功能 | 前端 | 后端 | 状态 |
|------|------|------|------|
| 种子文件上传/解析 | `NewTaskModal` | `inspect_torrent` | ✅ |
| 磁力链接解析 | `NewTaskModal` | `inspect_magnet` | ✅ |
| 文件树选择 | `FileTree` 组件 | `selected_files` | ✅ |
| 创建 BT 下载 | `create_task` | `add_torrent/add_magnet` | ✅ |
| 分类选择 | 下拉组件 | `save_dir` 映射 | ✅ |
| 顺序下载 | 复选框 | `sequential` | ✅ |
| Info Hash 显示 | 高级设置面板 | `info_hash` 提取 | ✅ |
| 私有种子标志 | 高级设置面板 | `private` 标志 | ✅ |
| 禁用 DHT/PEX/LPD | 高级设置开关 | `enable_dht/pex/lpd` | ✅ |
| 下载/上传限速 | 高级设置输入框 | `max_download/upload_speed` | ✅ |
| 自动校验开关 | 高级设置面板 | `auto_verify` | ✅ |

### 待对接的功能

| 功能 | gosh-dl 支持 | 前端 | 后端 |
|------|-------------|------|------|
| 全局 DHT/PEX/LPD 开关 | ✅ `EngineConfig` | 磁力设置 Tab (UI 已有) | ❌ 待接 |
| 端口范围设置 | ✅ `listen_port_range` | 磁力设置 Tab (UI 已有) | ❌ 待接 |
| 加密策略 | ✅ `EncryptionConfig` | 磁力设置 Tab (UI 已有) | ❌ 待接 |
| 文件预分配 | ✅ `AllocationMode` | 磁力设置 Tab (UI 已有) | ❌ 待接 |
| uTP 传输 | ✅ `UtpConfigSettings` | ❌ | ❌ 待接 |
| WebSeed | ✅ 自动检测 | ❌ 无 UI | ✅ 自动 |
| 做种比率控制 | ✅ `seed_ratio` | ❌ | ❌ 待接 |
| 下载优先级 | ✅ `DownloadPriority` | ❌ | ❌ 待接 |
| 时间段限速 | ✅ `ScheduleRule` | ❌ | ❌ 待接 |
| Peer 信息展示 | ✅ `PeerInfo` | ❌ | ❌ 待接 |
| Endgame 模式 | ✅ `enable_endgame` | ❌ | ❌ 待接 |
| 崩溃恢复 | ✅ `SqliteStorage` | ❌ | 部分 |

---

## 14. 代码示例

### 种子文件下载

```rust
use gosh_dl::{DownloadEngine, DownloadOptions, EngineConfig};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = EngineConfig::default();
    let engine = DownloadEngine::new(config).await?;

    let torrent_data = std::fs::read("example.torrent")?;
    let options = DownloadOptions::new()
        .sequential(true)
        .selected_files(vec![0, 1]);

    let id = engine.add_torrent(&torrent_data, options).await?;

    let mut events = engine.subscribe();
    while let Ok(event) = events.recv().await {
        match event {
            gosh_dl::DownloadEvent::Progress { id: eid, progress } if eid == id => {
                println!("Progress: {:.1}%", progress.percentage());
            }
            gosh_dl::DownloadEvent::Completed { id: eid } if eid == id => {
                println!("Download complete!");
                break;
            }
            _ => {}
        }
    }

    engine.shutdown().await?;
    Ok(())
}
```

### 磁力链接下载

```rust
use gosh_dl::{DownloadEngine, DownloadOptions, EngineConfig};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = EngineConfig {
        enable_dht: true,
        enable_pex: true,
        enable_lpd: true,
        ..Default::default()
    };

    let engine = DownloadEngine::new(config).await?;

    let magnet = "magnet:?xt=urn:btih:dd8255ecdc7ca55fb0bbf81323d87062db1f6d1c\
                  &dn=Big+Buck+Bunny\
                  &tr=udp://tracker.opentrackr.org:1337/announce";

    let options = DownloadOptions::new()
        .max_download_speed(5_242_880)  // 5 MB/s
        .max_upload_speed(1_048_576)    // 1 MB/s
        .seed_ratio(2.0);              // 上传 2 倍后停止

    let id = engine.add_magnet(magnet, options).await?;
    println!("Magnet download started: {}", id);

    engine.shutdown().await?;
    Ok(())
}
```

### 自定义加密和传输策略

```rust
use gosh_dl::{EngineConfig, config::{EncryptionConfig, EncryptionPolicy, UtpConfigSettings, TransportPolicy}};

let config = EngineConfig {
    torrent: gosh_dl::TorrentConfig {
        encryption: EncryptionConfig {
            policy: EncryptionPolicy::Required,  // 强制加密
            allow_plaintext: false,
            allow_rc4: true,
            ..Default::default()
        },
        utp: UtpConfigSettings {
            enabled: true,
            policy: TransportPolicy::PreferUtp,
            tcp_fallback: true,
            ..Default::default()
        },
        ..Default::default()
    },
    ..Default::default()
};
```

---

## 附录: 关键依赖

| 依赖 | 版本 | 用途 |
|------|------|------|
| `tokio` | 1.x | 异步运行时 |
| `reqwest` | 0.13 | HTTP Tracker 通信 |
| `serde_bencode` | 0.2 | Bencode 编解码 |
| `bitvec` | 1.x | Bitfield 位图管理 |
| `mainline` | 6.1 | DHT 协议实现 |
| `sha1` | 0.10 | 分片 SHA-1 校验 |
| `sha2` | 0.10 | SHA-256 校验 |
| `governor` | 0.10 | 速率限制 |
| `rusqlite` | 0.38 | SQLite 持久化 |
| `parking_lot` | 0.12 | 高性能读写锁 |
| `tokio-tungstenite` | 0.28 | WebSocket (WebRTC tracker) |
| `socket2` | 0.6 | 底层 Socket 配置 |
| `num-bigint` | 0.4 | DHT 大整数 |
