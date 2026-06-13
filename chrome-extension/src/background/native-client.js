import { getOptions } from './config.js';

export function getBrowserDeviceName() {
  const ua = navigator.userAgent;
  let browserName = "Browser Extension";
  if (ua.includes("Edg/")) {
    browserName = "Edge Extension";
  } else if (ua.includes("Chrome/")) {
    browserName = "Chrome Extension";
  } else if (ua.includes("Firefox/")) {
    browserName = "Firefox Extension";
  }
  const version = chrome.runtime.getManifest().version;
  return `${browserName} (v${version})`;
}

export async function sendToNativeHost(payload) {
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

export async function requestPairing() {
  const deviceName = getBrowserDeviceName();
  try {
    const response = await sendToNativeHost({
      type: "request_pairing",
      deviceName: deviceName,
    });
    return response;
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function testNativeHost() {
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

export async function pingNativeHost() {
  const result = await testNativeHost();
  return result.ok ? "connected" : "unavailable";
}
