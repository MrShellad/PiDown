const DEFAULT_OPTIONS = {
  enabled: false,
  hostName: "com.pidownloader.bridge",
  fallbackToBrowserDownload: true,
  pauseDuringHandoff: false,
  eraseCancelledDownload: true,
  showNotifications: true,
  captureIncognito: false,
  minBytes: 0,
  allowExtensions: "",
  blockExtensions: "",
};

const CAPTURE_RETRY_DELAYS_MS = [0, 250, 750, 1500, 3000];
const pendingDownloads = new Set();
const settledDownloads = new Set();
const retryState = new Map();

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  const stored = await chrome.storage.sync.get(null);
  await setOptions({ ...DEFAULT_OPTIONS, ...stored });
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
        const nativeStatus = await pingNativeHost(options.hostName);
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
    getOptions()
      .then(async (options) => {
        const result = await testNativeHost(options.hostName);
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

    const response = await sendToNativeHost(options.hostName, {
      type: "create_task",
      version: 1,
      download: normalizeDownloadItem(downloadItem),
    });

    if (response?.ok) {
      settledDownloads.add(downloadId);
      await cancelDownload(downloadId);
      if (options.eraseCancelledDownload) {
        await eraseDownload(downloadId);
      }
      if (options.showNotifications) {
        await notify("PiDownloader 已接管下载", "请在下载器中确认新建任务");
      }
      return;
    }

    settledDownloads.add(downloadId);
    await fallbackToChrome(downloadId, options, response?.error || "Native host rejected task");
  } catch (error) {
    settledDownloads.add(downloadId);
    await fallbackToChrome(downloadId, options, String(error));
  } finally {
    pendingDownloads.delete(downloadId);
    retryState.delete(downloadId);
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
      retry: !extension,
      reason: extension ? "not-allowed-extension" : "extension-pending",
    };
  }

  const knownSize = Number(downloadItem.totalBytes || downloadItem.fileSize || 0);
  const minBytes = Number(options.minBytes || 0);
  if (minBytes > 0 && knownSize > 0 && knownSize < minBytes) {
    return { capture: false, retry: false, reason: "below-min-size" };
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
      delta.state
  );
}

function normalizeDownloadItem(downloadItem) {
  return {
    url: downloadItem.finalUrl || downloadItem.url,
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
  return chrome.storage.sync.get(DEFAULT_OPTIONS);
}

function setOptions(options) {
  return chrome.storage.sync.set(options);
}

function sendToNativeHost(hostName, payload) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendNativeMessage(hostName, payload, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(response);
    });
  });
}

async function pingNativeHost(hostName) {
  const result = await testNativeHost(hostName);
  return result.ok ? "connected" : "unavailable";
}

async function testNativeHost(hostName) {
  try {
    const response = await sendToNativeHost(hostName, {
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
