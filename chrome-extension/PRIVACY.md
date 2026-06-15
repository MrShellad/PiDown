# PiDownloader Chrome Extension 隐私说明

PiDownloader Download Bridge 在用户启用下载接管后，自动将符合条件的浏览器下载转交给本地 PiDownloader 桌面应用处理。

## 数据收集与使用

### 下载接管

对于符合条件的 HTTP/HTTPS 下载，扩展会收集以下信息并发送给本地 PiDownloader 桌面应用：

- **下载 URL**：文件的最终下载地址。
- **文件名和大小**：浏览器报告的文件名和文件大小。
- **Referer 和 User-Agent**：用于在 PiDownloader 中还原浏览器请求上下文。
- **Cookie**：下载 URL 对应域名的 Cookie，用于支持需要登录的鉴权下载。

### 视频嗅探

扩展在 Twitter / X.com 和 TikTok 页面注入内容脚本，通过 `webRequest` API 监听这些平台的媒体请求，自动检测 HLS（`.m3u8`）和 MP4 视频流。当用户主动点击下载按钮时，扩展将视频 URL 和相关请求头发送给本地 PiDownloader 桌面应用。

**内容脚本仅在以下域名生效：**

- `x.com`、`twitter.com`
- `*.tiktok.com`

### 右键菜单

用户通过右键菜单选择「使用 PiDownloader 下载此链接」时，扩展会将链接 URL 及其 Cookie 发送给本地 PiDownloader 桌面应用。

## 数据传输

- 所有数据**仅发送到本机** `127.0.0.1`，由本地运行的 PiDownloader 桌面应用接收。
- 扩展**不会**将任何数据发送到远程服务器。
- 通信通过运行时 Token 保护，Token 在首次配对时由桌面应用生成。

## 权限用途

- **`<all_urls>` host 权限**：用于读取任意站点的 Cookie，确保各站点的鉴权下载正常工作。扩展不会利用此权限读取或修改页面内容（内容脚本仅限 Twitter/X 和 TikTok）。
- **`cookies` 权限**：读取特定下载 URL 的 Cookie，仅在下载接管或视频推送时使用。
- **`webRequest` 权限**：监听 Twitter/X 和 TikTok 的媒体请求以嗅探视频流，不修改任何请求。

## 用户控制

- 下载接管可随时在选项页或弹出窗口中开启或关闭。
- 右键菜单可在选项页中单独启用或禁用。
- 如果 PiDownloader 桌面应用未运行，浏览器将继续正常下载（需启用回退选项）。
- 默认忽略隐身模式下载。
- 用户可自定义文件扩展名过滤、最小文件大小、域名白名单等规则。

## 存储

扩展使用 `chrome.storage.sync` 存储用户偏好设置，包括：

- 下载接管开关
- 回退行为设置
- 文件扩展名过滤规则
- 域名白名单
- 通信端口和 Token
- 右键菜单、通知、隐身模式等开关
