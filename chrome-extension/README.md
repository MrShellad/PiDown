# PiDownloader Chrome Extension

Chrome MV3 扩展，将浏览器下载自动转交给 PiDownloader 桌面应用，并支持在社交平台页面嗅探和下载视频流。

## 功能概览

### 下载接管

- 监听 Chrome `downloads.onCreated` 事件，将符合条件的 HTTP/HTTPS 下载转发给 PiDownloader。
- 通过本地 HTTP 桥接（`127.0.0.1`）与 PiDownloader 桌面应用通信，由运行时 Token 保护。
- 仅在 PiDownloader 确认接收任务后才取消浏览器下载；桥接不可用时自动回退到浏览器下载。
- 支持按文件扩展名、最小文件大小、域名白名单等规则过滤下载。
- 自动提取下载的 Referer、User-Agent 和 Cookie，传递给 PiDownloader 以支持鉴权下载。

### 视频嗅探

- 在 Twitter / X.com 和 TikTok 页面注入内容脚本，自动检测 HLS（`.m3u8`）和 MP4 视频流。
- 在视频元素上显示下载按钮，点击后列出所有嗅探到的视频流，支持预览和一键推送到 PiDownloader。
- 使用 hls.js 在页面内实现 HLS 流预览。

### 右键菜单

- 可在右键菜单中添加「使用 PiDownloader 下载此链接」选项，对任意链接发起下载。

## 开发安装

1. 打开 `chrome://extensions`。
2. 启用「开发者模式」。
3. 点击「加载已解压的扩展程序」。
4. 选择此 `chrome-extension` 目录。
5. 启动 PiDownloader 桌面应用。
6. 打开扩展选项页，点击「配对」按钮自动获取通信 Token，然后启用下载接管。

## 通信架构

扩展不使用 Chrome Native Messaging，而是通过 HTTP 直接与 PiDownloader 桌面应用通信：

```text
Chrome 扩展 → HTTP POST → 127.0.0.1:<port>/native-bridge → PiDownloader 桌面应用
```

默认端口为 `18388`，可在选项页自定义。所有请求附带 `token` 字段用于身份验证。

### 配对流程

首次使用时，扩展向桌面应用发送 `request_pairing` 请求，桌面应用返回一个 Token。扩展自动保存此 Token，后续通信均携带该 Token。

### 请求格式

下载任务请求：

```json
{
  "token": "<pairing-token>",
  "type": "create_task",
  "version": 1,
  "download": {
    "url": "https://example.com/file.zip",
    "filename": "file.zip",
    "totalSize": 104857600,
    "referer": "https://example.com/",
    "userAgent": "Mozilla/5.0 ...",
    "cookies": ["session=abc123", "token=xyz"]
  }
}
```

成功响应：

```json
{
  "ok": true
}
```

失败响应：

```json
{
  "ok": false,
  "error": "PiDownloader is not running"
}
```

## 权限说明

| 权限 | 用途 |
|------|------|
| `contextMenus` | 添加右键菜单「使用 PiDownloader 下载此链接」 |
| `cookies` | 读取下载 URL 的 Cookie，传递给 PiDownloader 以支持鉴权下载 |
| `downloads` | 监听浏览器下载事件，暂停/取消/清除已接管的下载 |
| `notifications` | 在下载接管成功或失败时显示桌面通知 |
| `storage` | 存储用户设置（启用状态、过滤规则、通信配置等） |
| `webRequest` | 拦截 Twitter/X、TikTok 等平台的媒体请求，嗅探视频流 |
| `<all_urls>`（host） | 读取任意 URL 的 Cookie，确保各站点的鉴权下载正常工作 |

## 安全说明

- 下载接管默认启用，但用户可随时在选项页或弹出窗口中关闭。
- 建议在开发时保持「回退到浏览器下载」选项启用。
- 扩展忽略 `blob:`、`data:`、`file:`、`chrome-extension:` 等非 HTTP(S) URL。
- 默认忽略隐身模式下载。
- 内容脚本仅注入 Twitter/X 和 TikTok 页面，不会注入其他站点。
- 所有通信仅发往 `127.0.0.1`，不会向远程服务器发送任何数据。
