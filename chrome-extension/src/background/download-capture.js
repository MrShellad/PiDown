import { getOptions } from './config.js';
import {
  basename,
  getFileExtension,
  parseCsv,
  normalizePositiveNumber,
  getCookiesForDownload,
  notify
} from './utils.js';
import { sendToNativeHost } from './native-client.js';

const CAPTURE_RETRY_DELAYS_MS = [0, 250, 750, 1500, 3000, 5000];
const pendingDownloads = new Set();
const settledDownloads = new Set();
const retryState = new Map();

export async function scheduleDownloadCapture(downloadId, initialItem, forceImmediate = false) {
  if (pendingDownloads.has(downloadId) || settledDownloads.has(downloadId)) return;

  const current = retryState.get(downloadId);
  if (current?.timerId != null) {
    if (forceImmediate) {
      clearTimeout(current.timerId);
    } else {
      return;
    }
  }

  const attempt = current?.attempt ?? 0;
  const delay = forceImmediate ? 0 : CAPTURE_RETRY_DELAYS_MS[Math.min(attempt, CAPTURE_RETRY_DELAYS_MS.length - 1)];
  const timerId = setTimeout(() => {
    retryState.delete(downloadId);
    const itemToUse = forceImmediate ? null : initialItem;
    attemptDownloadCapture(downloadId, itemToUse, attempt).catch((error) => {
      console.warn("[PiDownloader] failed to capture download", error);
      retryState.delete(downloadId);
    });
  }, delay);

  retryState.set(downloadId, { attempt, timerId });
}

export async function attemptDownloadCapture(downloadId, initialItem, attempt) {
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

export function isDomainBypassed(urlStr, bypassDomainsStr) {
  try {
    const url = new URL(urlStr);
    const host = url.hostname.toLowerCase();

    // Hardcoded safety bypass for Google Docs and Google APIs (Google Drive downloads are allowed)
    if (
      host === 'docs.google.com' ||
      host === 'googleapis.com' ||
      host === 'www.googleapis.com' ||
      host.endsWith('.googleapis.com')
    ) {
      // Allow Google Drive/Docs downloads and exports
      const pathname = url.pathname.toLowerCase();
      const search = url.search.toLowerCase();
      if (
        pathname.includes('/uc') ||
        pathname.includes('/download') ||
        search.includes('export=download') ||
        search.includes('confirm=')
      ) {
        return false; // Do not bypass! Let it be captured!
      }
      return true;
    }

    if (bypassDomainsStr) {
      const bypassed = parseCsv(bypassDomainsStr);
      for (const domain of bypassed) {
        if (host === domain || host.endsWith('.' + domain)) {
          return true;
        }
      }
    }
  } catch {
    // ignore
  }
  return false;
}

export function shouldCaptureDownload(downloadItem, options) {
  if (!options.enabled) return { capture: false, retry: false, reason: "disabled" };
  if (downloadItem.incognito && !options.captureIncognito) {
    return { capture: false, retry: false, reason: "incognito" };
  }

  // Only capture active downloads
  if (downloadItem.state && downloadItem.state !== "in_progress") {
    return { capture: false, retry: false, reason: "not-in-progress" };
  }

  // Ignore restored downloads from previous browser sessions on startup
  if (downloadItem.startTime) {
    const elapsed = Date.now() - new Date(downloadItem.startTime).getTime();
    if (elapsed > 10 * 1000) { // 10 seconds
      return { capture: false, retry: false, reason: "old-download" };
    }
  }

  const url = downloadItem.finalUrl || downloadItem.url || "";
  if (!/^https?:\/\//i.test(url)) {
    return { capture: false, retry: false, reason: "unsupported-url" };
  }

  if (isDomainBypassed(url, options.bypassDomains)) {
    return { capture: false, retry: false, reason: "bypassed-domain" };
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

export function shouldRecheckDownload(delta) {
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

export async function normalizeDownloadItem(downloadItem) {
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

export async function fallbackToChrome(downloadId, options, reason) {
  console.warn("[PiDownloader] fallback to Chrome download:", reason);

  if (options.pauseDuringHandoff) {
    await resumeDownload(downloadId);
  }

  if (!options.fallbackToBrowserDownload) {
    await cancelDownload(downloadId);
  }
}

export function getDisplayFilename(downloadItem) {
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

export function pauseDownload(downloadId) {
  return promisifyDownloads("pause", downloadId);
}

export function resumeDownload(downloadId) {
  return promisifyDownloads("resume", downloadId);
}

export function cancelDownload(downloadId) {
  return promisifyDownloads("cancel", downloadId);
}

export function eraseDownload(downloadId) {
  return promisifyDownloads("erase", { id: downloadId });
}

export function queryDownload(downloadId) {
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

export function promisifyDownloads(method, arg) {
  return new Promise((resolve) => {
    chrome.downloads[method](arg, () => {
      resolve();
    });
  });
}

export function isDownloadTerminal(downloadItem) {
  const state = downloadItem.state;
  return state === "complete" || state === "interrupted";
}

export function shouldRetryNativeFailure(message) {
  const normalized = String(message || "").toLowerCase();
  return (
    normalized.includes("state is unavailable") ||
    normalized.includes("native bridge is stale") ||
    normalized.includes("native bridge is unavailable") ||
    normalized.includes("please restart pidownloader")
  );
}

export async function extractRequestHeaders(downloadItem) {
  return {
    referer: downloadItem.referrer || null,
    userAgent: navigator.userAgent || null,
  };
}

export function getFilenameFromUrl(url) {
  try {
    const parsed = new URL(url);
    const basename = parsed.pathname.split("/").filter(Boolean).pop();
    return basename || "download";
  } catch {
    return "download";
  }
}

export async function captureContextLink(linkUrl, tab) {
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

export function initDownloadCapture() {
  chrome.downloads.onCreated.addListener((downloadItem) => {
    scheduleDownloadCapture(downloadItem.id, downloadItem).catch((error) => {
      console.warn("[PiDownloader] failed to handle download", error);
    });
  });

  chrome.downloads.onChanged.addListener((delta) => {
    if (!shouldRecheckDownload(delta)) return;
    scheduleDownloadCapture(delta.id, null, true).catch((error) => {
      console.warn("[PiDownloader] failed to re-check download", error);
    });
  });

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "pidownloader:download-link" && info.linkUrl) {
      captureContextLink(info.linkUrl, tab).catch((error) => {
        console.warn("[PiDownloader] failed to handle context link capture:", error);
      });
    }
  });
}
