# PiDownloader Chrome Extension Privacy Notes

PiDownloader Download Bridge only handles eligible download URLs when the user enables download bridging.

## Data Used

For eligible HTTP/HTTPS downloads, the extension sends only the final download URL to the local PiDownloader native host.

The extension does not send this data to a remote server. The native host runs locally and forwards the request to the local PiDownloader desktop app.

## User Control

- Download bridging is disabled by default.
- If the local native host or PiDownloader app is unavailable, Chrome continues the normal browser download when fallback is enabled.
- Incognito downloads are ignored by default.

## Storage

The extension stores user preferences with `chrome.storage.sync`, including whether bridging is enabled, native host name, fallback behavior, and extension filters.
