const DEFAULT_OPTIONS = {
  enabled: false,
  fallbackToBrowserDownload: true,
  pauseDuringHandoff: false,
  eraseCancelledDownload: true,
  showNotifications: true,
  captureIncognito: false,
  minBytes: 0,
  allowExtensions: "",
  blockExtensions: "",
  serverPort: 18388,
  serverToken: "",
  contextMenuEnabled: true,
};

const CAPTURE_RETRY_DELAYS_MS = [0, 250, 750, 1500, 3000, 5000];
const pendingDownloads = new Set();
const settledDownloads = new Set();
const retryState = new Map();

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  const stored = await chrome.storage.sync.get(null);
  await setOptions(stored);
  if (reason === "install") {
    await chrome.runtime.openOptionsPage();
  }
});

chrome.downloads.onCreated.addListener((downloadItem) => {
  scheduleDownloadCapture(downloadItem.id, downloadItem).catch((error) => {
    console.warn("[PiDownloader] failed to handle download", error);
  });
});

chrome.downloads.onChanged.addListener((delta) => {
  if (!shouldRecheckDownload(delta)) return;
  scheduleDownloadCapture(delta.id).catch((error) => {
    console.warn("[PiDownloader] failed to re-check download", error);
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "pidownloader:get-status") {
    getOptions()
      .then(async (options) => {
        const nativeStatus = await pingNativeHost();
        sendResponse({ ok: true, options, nativeStatus });
      })
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message?.type === "pidownloader:set-enabled") {
    getOptions()
      .then((options) => setOptions({ ...options, enabled: Boolean(message.enabled) }))
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message?.type === "pidownloader:test-connection") {
    testNativeHost()
      .then((result) => {
        sendResponse({ ok: result.ok, status: result.status, error: result.error || null });
      })
      .catch((error) => sendResponse({ ok: false, status: "unavailable", error: String(error) }));
    return true;
  }

  return false;
});

async function scheduleDownloadCapture(downloadId, initialItem) {
  if (pendingDownloads.has(downloadId) || settledDownloads.has(downloadId)) return;

  const current = retryState.get(downloadId);
  if (current?.timerId != null) return;

  const attempt = current?.attempt ?? 0;
  const delay = CAPTURE_RETRY_DELAYS_MS[Math.min(attempt, CAPTURE_RETRY_DELAYS_MS.length - 1)];
  const timerId = setTimeout(() => {
    retryState.delete(downloadId);
    attemptDownloadCapture(downloadId, initialItem, attempt).catch((error) => {
      console.warn("[PiDownloader] failed to capture download", error);
      retryState.delete(downloadId);
    });
  }, delay);

  retryState.set(downloadId, { attempt, timerId });
}

async function attemptDownloadCapture(downloadId, initialItem, attempt) {
  if (pendingDownloads.has(downloadId) || settledDownloads.has(downloadId)) return;

  const downloadItem = initialItem || (await queryDownload(downloadId));
  if (!downloadItem) {
    settledDownloads.add(downloadId);
    return;
  }

  const options = await getOptions();
  const decision = shouldCaptureDownload(downloadItem, options);
  if (!decision.capture) {
    console.debug("[PiDownloader] skip capture:", {
      id: downloadId,
      reason: decision.reason,
      retry: decision.retry,
      filename: getDisplayFilename(downloadItem),
      url: downloadItem.finalUrl || downloadItem.url,
    });

    if (decision.retry && attempt + 1 < CAPTURE_RETRY_DELAYS_MS.length) {
      retryState.set(downloadId, { attempt: attempt + 1, timerId: null });
      await scheduleDownloadCapture(downloadId);
      return;
    }

    if (!decision.retry) {
      settledDownloads.add(downloadId);
    }
    return;
  }

  pendingDownloads.add(downloadId);

  try {
    if (options.pauseDuringHandoff) {
      await pauseDownload(downloadId);
    }

    const payload = {
      type: "create_task",
      version: 1,
      download: await normalizeDownloadItem(downloadItem),
    };

    const response = await sendToNativeHost(payload);

    if (response?.ok) {
      settledDownloads.add(downloadId);
      await cancelDownload(downloadId);
      if (options.eraseCancelledDownload) {
        await eraseDownload(downloadId);
      }
      if (options.showNotifications) {
        await notify("PiDownloader 已接管下载", "下载任务已经交给 PiDownloader。");
      }
      return;
    }

    if (shouldRetryNativeFailure(response?.error) && attempt + 1 < CAPTURE_RETRY_DELAYS_MS.length) {
      pendingDownloads.delete(downloadId);
      retryState.set(downloadId, { attempt: attempt + 1, timerId: null });
      await scheduleDownloadCapture(downloadId);
      return;
    }

    settledDownloads.add(downloadId);
    await fallbackToChrome(downloadId, options, response?.error || "Native host rejected task");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (shouldRetryNativeFailure(message) && attempt + 1 < CAPTURE_RETRY_DELAYS_MS.length) {
      pendingDownloads.delete(downloadId);
      retryState.set(downloadId, { attempt: attempt + 1, timerId: null });
      await scheduleDownloadCapture(downloadId);
      return;
    }

    settledDownloads.add(downloadId);
    await fallbackToChrome(downloadId, options, message);
  } finally {
    pendingDownloads.delete(downloadId);
    const current = retryState.get(downloadId);
    if (!current?.timerId) {
      retryState.delete(downloadId);
    }
  }
}

function shouldCaptureDownload(downloadItem, options) {
  if (!options.enabled) return { capture: false, retry: false, reason: "disabled" };
  if (downloadItem.incognito && !options.captureIncognito) {
    return { capture: false, retry: false, reason: "incognito" };
  }

  const url = downloadItem.finalUrl || downloadItem.url || "";
  if (!/^https?:\/\//i.test(url)) {
    return { capture: false, retry: false, reason: "unsupported-url" };
  }

  const extension = getFileExtension(getDisplayFilename(downloadItem));
  const allowed = parseCsv(options.allowExtensions);
  const blocked = parseCsv(options.blockExtensions);

  if (extension && blocked.includes(extension)) {
    return { capture: false, retry: false, reason: "blocked-extension" };
  }
  if (allowed.length > 0 && !allowed.includes(extension)) {
    return {
      capture: false,
      retry: !extension || !isDownloadTerminal(downloadItem),
      reason: extension ? "not-allowed-extension" : "extension-pending",
    };
  }

  const knownSize = Number(downloadItem.totalBytes || downloadItem.fileSize || 0);
  const minBytes = Number(options.minBytes || 0);
  if (minBytes > 0 && knownSize > 0 && knownSize < minBytes) {
    return { capture: false, retry: false, reason: "below-min-size" };
  }
  if (minBytes > 0 && knownSize <= 0 && !isDownloadTerminal(downloadItem)) {
    return { capture: false, retry: true, reason: "size-pending" };
  }

  return { capture: true, retry: false, reason: "matched" };
}

function shouldRecheckDownload(delta) {
  if (settledDownloads.has(delta.id)) return false;
  return Boolean(
    delta.filename ||
      delta.finalUrl ||
      delta.url ||
      delta.mime ||
      delta.totalBytes ||
      delta.fileSize ||
      delta.canResume ||
      delta.paused ||
      delta.error ||
      delta.state
  );
}

async function normalizeDownloadItem(downloadItem) {
  const [headers, cookies] = await Promise.all([
    extractRequestHeaders(downloadItem),
    getCookiesForDownload(downloadItem),
  ]);

  return {
    url: downloadItem.finalUrl || downloadItem.url,
    filename: getDisplayFilename(downloadItem),
    totalSize: normalizePositiveNumber(downloadItem.totalBytes || downloadItem.fileSize),
    referer: headers.referer,
    userAgent: headers.userAgent,
    cookies,
  };
}

async function fallbackToChrome(downloadId, options, reason) {
  console.warn("[PiDownloader] fallback to Chrome download:", reason);

  if (options.pauseDuringHandoff) {
    await resumeDownload(downloadId);
  }

  if (!options.fallbackToBrowserDownload) {
    await cancelDownload(downloadId);
  }
}

function getDisplayFilename(downloadItem) {
  const filename = basename(downloadItem.filename || "");
  if (filename) return filename;

  try {
    const url = new URL(downloadItem.finalUrl || downloadItem.url || "");
    const urlFilename = basename(decodeURIComponent(url.pathname));
    return urlFilename || "download";
  } catch {
    return "download";
  }
}

function basename(value) {
  return String(value).split(/[\\/]/).filter(Boolean).pop() || "";
}

function getFileExtension(filename) {
  const match = String(filename).toLowerCase().match(/\.([a-z0-9][a-z0-9_-]{0,15})$/);
  return match ? match[1] : "";
}

function parseCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim().replace(/^\./, "").toLowerCase())
    .filter(Boolean);
}

function getOptions() {
  return chrome.storage.sync.get(null).then(normalizeOptions);
}

function setOptions(options) {
  return chrome.storage.sync.set(normalizeOptions(options));
}

function normalizeOptions(options) {
  const next = { ...DEFAULT_OPTIONS };
  for (const key of Object.keys(DEFAULT_OPTIONS)) {
    if (Object.prototype.hasOwnProperty.call(options || {}, key)) {
      next[key] = options[key];
    }
  }
  return next;
}

async function sendToNativeHost(payload) {
  const options = await getOptions();
  const port = options.serverPort || 18388;
  const token = options.serverToken || "";

  const response = await fetch(`http://127.0.0.1:${port}/native-bridge`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      token,
      ...payload,
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response.json();
}

async function pingNativeHost() {
  const result = await testNativeHost();
  return result.ok ? "connected" : "unavailable";
}

async function testNativeHost() {
  try {
    const response = await sendToNativeHost({
      type: "ping",
      version: 1,
    });
    if (response?.ok) {
      return { ok: true, status: "connected" };
    }
    return {
      ok: false,
      status: "unavailable",
      error: response?.error || "PiDownloader native bridge rejected ping",
    };
  } catch (error) {
    return {
      ok: false,
      status: "unavailable",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function pauseDownload(downloadId) {
  return promisifyDownloads("pause", downloadId);
}

function resumeDownload(downloadId) {
  return promisifyDownloads("resume", downloadId);
}

function cancelDownload(downloadId) {
  return promisifyDownloads("cancel", downloadId);
}

function eraseDownload(downloadId) {
  return promisifyDownloads("erase", { id: downloadId });
}

function queryDownload(downloadId) {
  return new Promise((resolve) => {
    chrome.downloads.search({ id: downloadId }, (items) => {
      const error = chrome.runtime.lastError;
      if (error) {
        console.warn("[PiDownloader] failed to query download:", error.message);
        resolve(null);
        return;
      }
      resolve(items?.[0] || null);
    });
  });
}

function promisifyDownloads(method, arg) {
  return new Promise((resolve) => {
    chrome.downloads[method](arg, () => {
      resolve();
    });
  });
}

function notify(title, message) {
  return chrome.notifications.create({
    type: "basic",
    iconUrl: "assets/icon-128.png",
    title,
    message,
  });
}

function isDownloadTerminal(downloadItem) {
  const state = downloadItem.state;
  return state === "complete" || state === "interrupted";
}

function normalizePositiveNumber(value) {
  const next = Number(value || 0);
  return Number.isFinite(next) && next > 0 ? next : null;
}

function shouldRetryNativeFailure(message) {
  const normalized = String(message || "").toLowerCase();
  return (
    normalized.includes("state is unavailable") ||
    normalized.includes("native bridge is stale") ||
    normalized.includes("native bridge is unavailable") ||
    normalized.includes("please restart pidownloader")
  );
}

async function extractRequestHeaders(_downloadItem) {
  return { referer: null, userAgent: null };
}

async function getCookiesForDownload(downloadItem) {
  const targetUrl = downloadItem.finalUrl || downloadItem.url || "";
  if (!targetUrl || !chrome.cookies?.getAll) return [];

  try {
    const url = new URL(targetUrl);
    const cookies = await chrome.cookies.getAll({ url: url.origin });
    return cookies
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .filter(Boolean);
  } catch {
    return [];
  }
}

function updateContextMenu(enabled) {
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

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "pidownloader:download-link" && info.linkUrl) {
    captureContextLink(info.linkUrl, tab).catch((error) => {
      console.warn("[PiDownloader] failed to handle context link capture:", error);
    });
  }
});

async function captureContextLink(linkUrl, tab) {
  const options = await getOptions();
  if (!options.enabled) return;

  const cookies = await getCookiesForDownload({ url: linkUrl });
  
  const payload = {
    type: "create_task",
    version: 1,
    download: {
      url: linkUrl,
      filename: getFilenameFromUrl(linkUrl),
      totalSize: null,
      referer: tab?.url || null,
      userAgent: navigator.userAgent || null,
      cookies,
    },
  };

  try {
    const response = await sendToNativeHost(payload);
    if (response?.ok) {
      if (options.showNotifications) {
        await notify("PiDownloader 已接管下载", "下载任务已经提交给 PiDownloader。");
      }
    } else {
      if (options.showNotifications) {
        await notify("PiDownloader 接管失败", response?.error || "服务拒绝接收任务");
      }
    }
  } catch (error) {
    if (options.showNotifications) {
      await notify("PiDownloader 连接失败", "无法连接到本地服务端，请确保 PiDownloader 正在运行。");
    }
  }
}

function getFilenameFromUrl(url) {
  try {
    const parsed = new URL(url);
    const basename = parsed.pathname.split("/").filter(Boolean).pop();
    return basename || "download";
  } catch {
    return "download";
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.contextMenuEnabled) {
    updateContextMenu(changes.contextMenuEnabled.newValue);
  }
});

getOptions().then((options) => {
  updateContextMenu(options.contextMenuEnabled);
}).catch(console.error);
