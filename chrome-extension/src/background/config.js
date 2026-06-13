export const DEFAULT_OPTIONS = {
  enabled: true,
  fallbackToBrowserDownload: true,
  pauseDuringHandoff: true,
  eraseCancelledDownload: true,
  showNotifications: true,
  captureIncognito: false,
  minBytes: 0,
  allowExtensions: "zip, rar, 7z, mp4, mkv, mp3, exe, msi, pdf, dmg, iso, img, apk",
  blockExtensions: "crdownload, tmp",
  bypassDomains: "docs.google.com",
  serverPort: 18388,
  serverToken: "",
  contextMenuEnabled: true,
};

export function getOptions() {
  return chrome.storage.sync.get(null).then(normalizeOptions);
}

export function setOptions(options) {
  return chrome.storage.sync.set(normalizeOptions(options));
}

export function normalizeOptions(options) {
  const next = { ...DEFAULT_OPTIONS };
  for (const key of Object.keys(DEFAULT_OPTIONS)) {
    if (Object.prototype.hasOwnProperty.call(options || {}, key)) {
      next[key] = options[key];
    }
  }
  return next;
}

export function updateContextMenu(enabled) {
  chrome.contextMenus.removeAll(() => {
    const _ = chrome.runtime.lastError;
    if (enabled) {
      chrome.contextMenus.create({
        id: "pidownloader:download-link",
        title: "使用 PiDownloader 下载此链接",
        contexts: ["link"],
      }, () => {
        const _ = chrome.runtime.lastError;
      });
    }
  });
}

// Automatically sync context menu visibility and initialize on startup
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.contextMenuEnabled) {
    updateContextMenu(changes.contextMenuEnabled.newValue);
  }
});

getOptions().then((options) => {
  updateContextMenu(options.contextMenuEnabled);
}).catch(console.error);
