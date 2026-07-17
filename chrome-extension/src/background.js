import { getOptions, setOptions } from './background/config.js';
import { pingNativeHost, testNativeHost, requestPairing } from './background/native-client.js';
import { initDownloadCapture } from './background/download-capture.js';
import { initVideoSniffer, handleGetSniffedVideos, handlePushVideo, handleShouldSniffPage } from './background/video-sniffer.js';

// Extension Install/Update Lifecycle
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  const stored = await chrome.storage.sync.get(null);
  await setOptions(stored);
  if (reason === "install") {
    await chrome.runtime.openOptionsPage();
  }
});

// Central Message Router
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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

  if (message?.type === "pidownloader:request-pairing") {
    requestPairing()
      .then((result) => {
        sendResponse(result);
      })
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message?.type === "pidownloader:should-sniff-page") {
    return handleShouldSniffPage(message, sendResponse);
  }

  if (message?.type === "pidownloader:get-sniffed-videos") {
    return handleGetSniffedVideos(message, sender, sendResponse);
  }

  if (message?.type === "pidownloader:push-video") {
    return handlePushVideo(message, sendResponse);
  }

  return false;
});

// Initialize Subsystems
initDownloadCapture();
initVideoSniffer();
