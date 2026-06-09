# PiDownloader Chrome Extension

Chrome MV3 extension for sending browser downloads to PiDownloader after the user enables it.

## What It Does

- Listens to Chrome `downloads.onCreated` events after the user enables the extension.
- Sends only the HTTP/HTTPS download URL to the PiDownloader native bridge.
- Cancels the Chrome download only after PiDownloader confirms it accepted the task.
- Falls back to Chrome's normal download flow when the bridge is unavailable.

This extension is intentionally fail-safe: it does not cancel browser downloads unless the native bridge returns a successful response.

## Install For Development

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select this `chrome-extension` directory.
5. Build the native host:

```powershell
cargo build --manifest-path src-tauri/Cargo.toml --bin pidownloader-native-host
```

6. Open `chrome://extensions`, copy the extension ID, then register the Windows native host:

```powershell
.\chrome-extension\native-host\register-windows.example.ps1 -ExtensionId "<extension-id>"
```

7. Start PiDownloader, open the extension options page, then enable download bridging.

## Native Host Contract

The extension uses Chrome Native Messaging with this default host name:

```text
com.pidownloader.bridge
```

The native host accepts JSON messages over stdin/stdout and returns JSON responses.
It forwards messages to the running PiDownloader app through a local `127.0.0.1` bridge protected by a runtime token.
If PiDownloader is not running, the native host returns `ok: false` so Chrome can continue the browser download.

Request:

```json
{
  "type": "create_task",
  "version": 1,
  "download": {
    "url": "https://example.com/file.zip"
  }
}
```

Successful response:

```json
{
  "ok": true
}
```

Failed response:

```json
{
  "ok": false,
  "error": "PiDownloader is not running"
}
```

## Windows Native Host Registration

Chrome requires a native messaging host manifest registered in the Windows registry.

Example manifest:

```json
{
  "name": "com.pidownloader.bridge",
  "description": "PiDownloader Chrome native messaging bridge",
  "path": "C:\\Path\\To\\pidownloader-native-host.exe",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://<extension-id>/"
  ]
}
```

Registry key:

```text
HKCU\Software\Google\Chrome\NativeMessagingHosts\com.pidownloader.bridge
```

The default value should be the absolute path to the native host manifest JSON.
Use `native-host/register-windows.example.ps1` to generate and register this manifest for development.

## Safety Notes

- The extension is disabled by default; users must explicitly enable download bridging.
- Keep `Fallback to Chrome download` enabled while developing the native bridge.
- The extension ignores `blob:`, `data:`, `file:`, `chrome-extension:` and other unsupported URLs.
- Incognito downloads are ignored by default.
- The manifest does not request broad host permissions; it only uses `downloads`, `nativeMessaging`, `notifications`, and `storage`.
