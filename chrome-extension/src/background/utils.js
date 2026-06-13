export function basename(value) {
  return String(value).split(/[\\/]/).filter(Boolean).pop() || "";
}

export function getFileExtension(filename) {
  const match = String(filename).toLowerCase().match(/\.([a-z0-9][a-z0-9_-]{0,15})$/);
  return match ? match[1] : "";
}

export function parseCsv(value) {
  return String(value || "")
    .split(/[,，]/)
    .map((item) => item.trim().replace(/^\./, "").toLowerCase())
    .filter(Boolean);
}

export function normalizePositiveNumber(value) {
  const next = Number(value || 0);
  return Number.isFinite(next) && next > 0 ? next : null;
}

export async function getUrlCookies(targetUrl) {
  if (!targetUrl || !chrome.cookies?.getAll) return [];
  try {
    const url = new URL(targetUrl);
    const cookies = await chrome.cookies.getAll({ url: url.href });
    return cookies.map((c) => `${c.name}=${c.value}`);
  } catch {
    return [];
  }
}

export async function getCookiesForDownload(downloadItem) {
  return getUrlCookies(downloadItem.finalUrl || downloadItem.url || "");
}

export function notify(title, message) {
  return chrome.notifications.create({
    type: "basic",
    iconUrl: "assets/icon-128.png",
    title,
    message,
  });
}
