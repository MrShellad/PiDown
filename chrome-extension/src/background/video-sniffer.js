import { getOptions } from './config.js';
import { getUrlCookies, notify } from './utils.js';
import { sendToNativeHost } from './native-client.js';

const PLATFORMS = {
  twitter: {
    urls: [
      "https://*.twimg.com/*",
      "https://*.x.com/*",
      "https://*.twitter.com/*"
    ]
  },
  tiktok: {
    urls: [
      "https://*.tiktok.com/*",
      "https://*.tiktokcdn.com/*",
      "https://*.byteoversea.com/*",
      "https://*.ibyteimg.com/*"
    ]
  }
};

const ALL_INTERCEPT_URLS = Object.values(PLATFORMS).flatMap(p => p.urls);

export const sniffedVideos = new Map(); // tabId -> Map<url, {url, size}>
export const tabThumbnails = new Map(); // tabId -> thumbnail URL string
const requestHeadersCache = new Map(); // requestId -> {referer, cookie, userAgent}

export async function getUrlFileSize(url) {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    const length = response.headers.get('content-length');
    return length ? parseInt(length, 10) : null;
  } catch (e) {
    return null;
  }
}

export async function fetchSyndicationVideos(tweetId) {
  if (!tweetId || !/^\d+$/.test(tweetId)) return { videos: [], thumbnail: null };
  try {
    const response = await fetch(`https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}`);
    if (!response.ok) return { videos: [], thumbnail: null };
    const data = await response.json();
    const variants = data?.video?.variants || [];
    const thumbnail = data?.video?.mediaPlaceholderUrl || null;

    const videos = [];
    const promises = variants.map(async (v) => {
      if (v.src && (v.type === 'video/mp4' || v.src.includes('.mp4') || v.src.includes('.m3u8'))) {
        let size = null;
        if (v.type === 'video/mp4' || v.src.includes('.mp4')) {
          size = await getUrlFileSize(v.src);
        }
        videos.push({
          url: v.src,
          size
        });
      }
    });

    await Promise.all(promises);
    return { videos, thumbnail };
  } catch (error) {
    console.warn("[PiDownloader] Failed to fetch syndication videos:", error);
    return { videos: [], thumbnail: null };
  }
}

export function handleGetSniffedVideos(message, sender, sendResponse) {
  const tabId = sender.tab?.id;
  const tweetId = message.tweetId;
  const platform = message.platform;
  if (tabId) {
    let map = sniffedVideos.get(tabId);
    if (!map) {
      map = new Map();
      sniffedVideos.set(tabId, map);
    }

    if (tweetId && platform === "twitter") {
      fetchSyndicationVideos(tweetId).then((result) => {
        const syndVideos = result.videos || [];
        const thumbnail = result.thumbnail || null;
        for (const v of syndVideos) {
          const existing = map.get(v.url);
          if (!existing || (v.size && !existing.size)) {
            map.set(v.url, v);
          }
        }
        if (thumbnail) {
          tabThumbnails.set(tabId, thumbnail);
        }
        sendResponse({
          videos: Array.from(map.values()),
          urls: Array.from(map.keys()),
          thumbnail: thumbnail || tabThumbnails.get(tabId) || null
        });
      }).catch((err) => {
        console.warn("[PiDownloader] Error in fetchSyndicationVideos:", err);
        sendResponse({
          videos: Array.from(map.values()),
          urls: Array.from(map.keys()),
          thumbnail: tabThumbnails.get(tabId) || null
        });
      });
      return true; // Keep channel open for async reply
    } else {
      const videos = Array.from(map.values());
      sendResponse({
        videos,
        urls: videos.map(v => v.url),
        thumbnail: tabThumbnails.get(tabId) || null
      });
    }
  } else {
    sendResponse({ videos: [], urls: [] });
  }
  return false;
}

export function handlePushVideo(message, sendResponse) {
  (async () => {
    try {
      const videoCookies = await getUrlCookies(message.url);
      const options = await getOptions();
      const payload = {
        type: "create_task",
        version: 1,
        download: {
          url: message.url,
          filename: message.filename || "x-video.mp4",
          totalSize: null,
          referer: message.referer || "https://x.com/",
          userAgent: message.userAgent || navigator.userAgent,
          cookies: videoCookies
        }
      };
      const response = await sendToNativeHost(payload);
      if (response?.ok) {
        sendResponse({ ok: true });
        if (options.showNotifications) {
          notify("PiDownloader 已接管网页视频", `任务已成功添加：${message.filename}`);
        }
      } else {
        sendResponse({ ok: false, error: response?.error || "服务拒绝添加任务" });
      }
    } catch (err) {
      sendResponse({ ok: false, error: String(err) });
    }
  })();
  return true; // Keep channel open for async reply
}

// Rules Cache and Syncing
let rulesSubscriptionEnabled = false;
let cachedSniffRules = null;
let configLoadedPromise = null;

function loadCachedConfig() {
  const p1 = getOptions().then(options => {
    rulesSubscriptionEnabled = options.rulesSubscriptionEnabled;
  });
  const p2 = chrome.storage.local.get("sniffRules").then(localData => {
    if (localData.sniffRules && localData.sniffRules.platforms) {
      cachedSniffRules = localData.sniffRules;
    }
  });
  configLoadedPromise = Promise.all([p1, p2]);
  return configLoadedPromise;
}
loadCachedConfig();

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync") {
    if (changes.rulesSubscriptionEnabled) {
      rulesSubscriptionEnabled = changes.rulesSubscriptionEnabled.newValue;
    }
  }
  if (area === "local" && changes.sniffRules) {
    cachedSniffRules = changes.sniffRules.newValue;
  }
});

function wildcardToRegExp(wildcard) {
  let pattern = wildcard;
  let makeSubdomainOptional = false;
  if (pattern.includes("://*.")) {
    pattern = pattern.replace("://*.", "://");
    makeSubdomainOptional = true;
  }
  
  let regexStr = '^' + pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // escape regex chars
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.') + '$';
    
  if (makeSubdomainOptional) {
    regexStr = regexStr.replace(":\\/\\/", ":\\/\\/(?:.*\\.)?");
  }
  
  return new RegExp(regexStr, 'i');
}

function matchesAnyRule(url, rulesList) {
  for (const rule of rulesList) {
    try {
      const regex = wildcardToRegExp(rule);
      if (regex.test(url)) {
        return true;
      }
    } catch (e) {
      // ignore regex error
    }
  }
  return false;
}

export function shouldInterceptUrlSync(url) {
  if (rulesSubscriptionEnabled && cachedSniffRules && cachedSniffRules.platforms) {
    const allUrls = Object.values(cachedSniffRules.platforms).flatMap(p => p.urls || []);
    return matchesAnyRule(url, allUrls);
  }
  const builtInUrls = Object.values(PLATFORMS).flatMap(p => p.urls);
  return matchesAnyRule(url, builtInUrls);
}

export function handleShouldSniffPage(message, sendResponse) {
  configLoadedPromise.then(() => {
    const shouldSniff = shouldInterceptUrlSync(message.url);
    sendResponse({ shouldSniff });
  }).catch(err => {
    console.error("Failed to load configuration before checking page eligibility", err);
    sendResponse({ shouldSniff: false });
  });
  return true; // Keep message channel open for async sendResponse
}

export function initVideoSniffer() {
  // Capture outgoing request headers for Twitter/X media streams
  chrome.webRequest.onSendHeaders.addListener(
    (details) => {
      const url = details.url;
      if (!shouldInterceptUrlSync(url)) return;

      const headers = {};
      for (const h of (details.requestHeaders || [])) {
        const name = h.name.toLowerCase();
        if (name === 'referer') headers.referer = h.value;
        else if (name === 'cookie') headers.cookie = h.value;
        else if (name === 'user-agent') headers.userAgent = h.value;
      }
      if (Object.keys(headers).length > 0) {
        requestHeadersCache.set(details.requestId, headers);
        // Prevent unbounded growth
        if (requestHeadersCache.size > 2000) {
          const oldest = requestHeadersCache.keys().next().value;
          requestHeadersCache.delete(oldest);
        }
      }
    },
    {
      urls: ["http://*/*", "https://*/*"]
    },
    ['requestHeaders', 'extraHeaders']
  );

  // Intercept Twitter / X.com video streams
  chrome.webRequest.onHeadersReceived.addListener(
    (details) => {
      if (details.tabId < 0) return;
      const url = details.url;
      if (!shouldInterceptUrlSync(url)) return;

      if (url.includes(".m3u8") || url.includes(".mp4")) {
        let size = null;
        if (details.responseHeaders) {
          const rangeHeader = details.responseHeaders.find(h => h.name.toLowerCase() === 'content-range');
          if (rangeHeader) {
            const match = rangeHeader.value.match(/\/(\d+)$/);
            if (match) {
              size = parseInt(match[1], 10);
            }
          }
          if (!size) {
            const lengthHeader = details.responseHeaders.find(h => h.name.toLowerCase() === 'content-length');
            if (lengthHeader) {
              size = parseInt(lengthHeader.value, 10);
            }
          }
        }

        // Retrieve captured request headers for this stream
        const reqHeaders = requestHeadersCache.get(details.requestId);
        requestHeadersCache.delete(details.requestId);

        let map = sniffedVideos.get(details.tabId);
        if (!map) {
          map = new Map();
          sniffedVideos.set(details.tabId, map);
        }

        const existing = map.get(url);
        if (!existing || (size && !existing.size)) {
          map.set(url, {
            url,
            size,
            referer: reqHeaders?.referer || null,
            cookie: reqHeaders?.cookie || null,
            userAgent: reqHeaders?.userAgent || null,
          });

          // Notify the content script of the tab that a new video is sniffed
          chrome.tabs.sendMessage(details.tabId, {
            type: "pidownloader:video-sniffed",
            url: url,
            size: size
          }).catch(() => {
            // ignore error if content script is not loaded yet
          });
        }
      }
    },
    {
      urls: ["http://*/*", "https://*/*"]
    },
    ["responseHeaders"]
  );

  // Clean up cache when tab is closed
  chrome.tabs.onRemoved.addListener((tabId) => {
    sniffedVideos.delete(tabId);
    tabThumbnails.delete(tabId);
  });
}
