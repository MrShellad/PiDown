# Civitai 大文件/模型下载失败与“准备时间长”问题分析及优化方案报告

本报告针对用户在使用 PiDownloader 下载大文件（如 Civitai 上的 Stable Diffusion / Flux 模型文件，通常在 2GB - 6GB 以上）时，出现“准备很久然后下载失败”，而使用 IDM 可以正常下载的问题进行系统排查，并给出根本原因分析与修复方案。

---

## 1. 核心原因分析 (Root Causes)

### 1.1 探测（Inspect）阶段未携带 Cookies 和 Referer（鉴权失败）
* **背景**：Civitai 上的许多模型属于 gated（受限/需登录）模型，且 Civitai 对未携带用户身份凭证的 API 下载请求会进行严格的限流或直接返回 `401 Unauthorized`/`403 Forbidden`。
* **问题所在**：
  1. 在前端拦截到下载后，PiDownloader 会调用 `inspect_download_metadata` 进行元数据探测（以获取文件名和大小）。虽然前端和 Tauri Command 接口均正确传入了 `cookies` 和 `referer`，但 [task_service.rs](file:///h:/VSCodeWork/PiDown/src-tauri/src/core/state/task_service.rs#L633-L636) 在调用 `self.engine.inspect_http` 时，**完全没有将 cookies 和 referer 传给底层引擎**。
  2. 底层 `gosh-dl` 库的 `probe_server` 函数也**没有接收和附加 cookies 或 referer 头部**的能力。
* **后果**：探测阶段发送的无状态请求被 Civitai / CDN 直接拦截，导致探测超时或报错，任务无法顺利创建。

### 1.2 未复用重定向直链（多并发重复请求主站，触发 Cloudflare 防御）
* **背景**：当请求 Civitai 下载 API（如 `https://civitai.com/api/download/models/XXXX`）时，主站会返回 `307 Temporary Redirect` 重定向到存储桶（如 AWS S3 或 Cloudflare R2）的带签名直链（如 `civitai-delivery-worker-prod.5ac0637cfd.workers.dev/...`）。
* **问题所在**：
  `gosh-dl` 的 `probe_server` 探测到服务器大小等元数据后，**没有将最终的重定向 URL（final_url）保存下来**，而是继续使用原始的 Civitai API 下载链接去创建 `SegmentedDownload` 任务。
* **后果**：
  在多线程下载时（例如配置了 16 线程），`gosh-dl` 会并发地对原始 Civitai API 链接发起 16 次连接。这导致**每个线程都需要重新去 Civitai 主站请求鉴权和重定向**，不仅导致“准备时间长”，还会在短时间内触发 Civitai 接入的 Cloudflare 防火墙 DDoS 防护（返回 `429 Too Many Requests` 或 `403`），导致全部并发连接被瞬间阻断，下载直接失败。

### 1.3 预签名 URL（Presigned URL）对 HEAD 方法的不兼容
* **背景**：S3 或 Cloudflare R2 的预签名直链是绑定特定 HTTP Method（通常为 `GET`）的。
* **问题所在**：
  若对仅支持 `GET` 的签名 URL 发起 `HEAD` 请求，S3 会返回 `403 Forbidden`（签名不匹配）甚至挂起连接。
* **后果**：
  在之前的版本中，这会导致探测失败。尽管我们添加了 `GET Range: bytes=0-0` 的 fallback 逻辑，但由于**未携带鉴权 cookies 和 referer**，该 fallback 请求依然会被拦截，导致准备超时并失败。

---

## 2. 优化方案 (Optimization Solutions)

### 2.1 优化 1：允许探测和创建阶段完整传递 Cookies 与 Referer
我们需要修改 `gosh-dl` 的 `probe_server` 签名以及 Tauri 对应的包裹方法，使其支持携带 `cookies` 和 `referer` 进行元数据探测。

1. **修改 `gosh-dl` 中的 `probe_server`**：
   文件：[segment.rs](file:///H:/VSCodeWork/gosh-dl/src/http/segment.rs)
   ```rust
   pub async fn probe_server(
       client: &Client,
       url: &str,
       user_agent: &str,
       cookies: Option<&[String]>,
       referer: Option<&str>,
   ) -> Result<ServerCapabilities>
   ```
   并在内部发起 `HEAD` 和 `GET` 探测请求时，使用 `.header("Cookie", ...)` 和 `.header("Referer", ...)` 附加这些属性。

2. **修改 Tauri 端的 `inspect_http`**：
   文件：[engine.rs](file:///h:/VSCodeWork/PiDown/src-tauri/src/download/engine.rs)
   修改 `inspect_http` 签名以接收并传递 cookies/referer。

3. **修改 `task_service.rs` 中的 `inspect_download`**：
   文件：[task_service.rs](file:///h:/VSCodeWork/PiDown/src-tauri/src/core/state/task_service.rs)
   在调用 `inspect_http` 时，从外部传入的参数中正确提取并转发 cookies/referer。

### 2.2 优化 2：在 `ServerCapabilities` 中持久化并使用 `final_url`
在元数据探测（`probe_server`）时，利用 reqwest 的 `response.url()` 获取重定向后的最终下载直链，并回传给引擎，以便多线程任务直接连接该直链。

1. **在 `ServerCapabilities` 结构体中添加 `final_url`**：
   ```rust
   pub struct ServerCapabilities {
       pub content_length: Option<u64>,
       pub supports_range: bool,
       pub etag: Option<String>,
       pub last_modified: Option<String>,
       pub suggested_filename: Option<String>,
       pub final_url: String, // 新增：保存重定向后的最终下载直链
   }
   ```
2. **在 `mod.rs` 启动 Segment 任务时使用直链**：
   文件：[mod.rs](file:///H:/VSCodeWork/gosh-dl/src/http/mod.rs)
   创建 `SegmentedDownload` 时，使用 `capabilities.final_url` 替代原始的 `url`。这样多线程建立连接时，会直接访问 Cloudflare CDN/S3 节点，而不再打扰 Civitai 主站，实现“瞬间启动”并不被 Cloudflare 拦截。

---

## 3. 具体实施计划 (Implementation Steps)

### 步骤 1：重构 `gosh-dl` 中的 `probe_server` 与 `ServerCapabilities`
* 在 [segment.rs](file:///H:/VSCodeWork/gosh-dl/src/http/segment.rs) 中，为 `ServerCapabilities` 增加 `final_url` 字段。
* 为 `probe_server` 增加 `cookies` 和 `referer` 参数，并在其内部的请求构建链中将它们附加。
* 将最终获取到的 `response.url().as_str().to_string()` 写入返回的 `ServerCapabilities.final_url`。

### 步骤 2：更新 `gosh-dl` 中 `mod.rs` 的调用链
* 在 [mod.rs](file:///H:/VSCodeWork/gosh-dl/src/http/mod.rs) 中，更新调用 `probe_server` 时的参数。
* 在 L784 创建 `SegmentedDownload` 时，传入 `capabilities.final_url.clone()`。

### 步骤 3：更新 Tauri 宿主中的 `inspect_http`
* 在 [engine.rs](file:///h:/VSCodeWork/PiDown/src-tauri/src/download/engine.rs) 中，更新 `inspect_http` 签名，接收 `referer` 和 `cookies` 参数，并转发给 `probe_server`。
* 在 [task_service.rs](file:///h:/VSCodeWork/PiDown/src-tauri/src/core/state/task_service.rs) 的 `inspect_download` 函数中，完成对 `inspect_http` 新参数的传入。

### 步骤 4：编译与回归测试
* 运行 `cargo test` 确保原有测试不受影响。
* 运行 `cargo check` 确保 Tauri 宿主和引擎编译通过。
