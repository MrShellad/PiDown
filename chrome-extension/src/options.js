const DEFAULT_OPTIONS = {
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

const EXTENSION_PRESETS = [
  { label: "压缩包", values: ["zip", "rar", "7z", "tar", "gz", "tgz", "bz2", "xz", "iso"] },
  { label: "文档", values: ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "md", "csv", "rtf", "epub"] },
  { label: "视频", values: ["mp4", "mkv", "avi", "mov", "flv", "wmv", "webm", "m4v", "ts"] },
  { label: "音频", values: ["mp3", "wav", "flac", "ogg", "m4a", "wma", "aac", "opus"] },
  { label: "程序", values: ["exe", "msi", "dmg", "pkg", "sh", "bat", "app", "deb", "rpm", "apk"] },
  { label: "AI 模型", values: ["safetensors", "ckpt", "pt", "pth", "onnx", "gguf"] },
  { label: "临时文件", values: ["crdownload", "tmp", "part", "download"] },
];

const form = document.querySelector("#options-form");
const resetButton = document.querySelector("#reset");
const testButton = document.querySelector("#test-connection");
const pairButton = document.querySelector("#pair-client");
const themeBtn = document.querySelector("#themeToggle");
const connectionStatus = document.querySelector("#connection-status");
const largeFileToggle = document.querySelector("#largeFileToggle");
const minBytesField = document.querySelector("#minBytesField");
const minBytesMbInput = document.querySelector("#minBytesMb");
const apiUrlInput = document.querySelector("#apiUrl");
const serverTokenInput = document.querySelector("#serverToken");

const extVersionEl = document.querySelector("#ext-version");
const clientVersionEl = document.querySelector("#client-version");
const openClientBtn = document.querySelector("#open-client");
const officialSiteBtn = document.querySelector("#official-site");

// Set extension version from manifest
if (extVersionEl) {
  extVersionEl.textContent = chrome.runtime.getManifest().version;
}

// Toast system
const TOAST_ICONS = {
  success: `<svg class="pidownloader-toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
  error: `<svg class="pidownloader-toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
  pending: `<svg class="pidownloader-toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`,
};

let toastContainer = null;
let activeToasts = [];

function ensureToastContainer() {
  if (!toastContainer) {
    toastContainer = document.createElement("div");
    toastContainer.className = "pidownloader-toast-container top-right";
    document.body.appendChild(toastContainer);
  }
  return toastContainer;
}

function showToast(message, kind = "success", duration = 3000) {
  const container = ensureToastContainer();
  const toast = document.createElement("div");
  toast.className = `pidownloader-toast toast-${kind}`;
  toast.innerHTML = `${TOAST_ICONS[kind] || TOAST_ICONS.success}<span>${message}</span>`;
  container.appendChild(toast);

  const timer = setTimeout(() => dismissToast(toast), duration);
  toast._timer = timer;
  activeToasts.push(toast);

  return toast;
}

function dismissToast(toast) {
  if (!toast || !toast.parentNode) return;
  clearTimeout(toast._timer);
  activeToasts = activeToasts.filter(t => t !== toast);
  toast.classList.add("toast-out");
  toast.addEventListener("animationend", () => toast.remove());
}

function dismissAllToasts() {
  [...activeToasts].forEach(dismissToast);
}

init().catch((error) => {
  showToast(`加载失败：${error instanceof Error ? error.message : String(error)}`, "error", 5000);
});

async function init() {
  // Initialize options
  const options = await chrome.storage.sync.get(DEFAULT_OPTIONS);
  writeForm(options);

  // Initialize theme
  initTheme();

  // Test connection
  updateConnectionStatus();

  // Presets
  renderPresetChips();
}

// Show/hide minBytes field based on toggle
largeFileToggle.addEventListener("change", () => {
  minBytesField.style.display = largeFileToggle.checked ? "block" : "none";
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const options = readForm();
  await chrome.storage.sync.set(options);
  showStatus("设置已保存", "success");
  updateConnectionStatus();
});

resetButton.addEventListener("click", async () => {
  await chrome.storage.sync.set(DEFAULT_OPTIONS);
  writeForm(DEFAULT_OPTIONS);
  showStatus("已恢复默认设置", "success");
  updateConnectionStatus();
});

testButton.addEventListener("click", async () => {
  testButton.disabled = true;
  connectionStatus.textContent = "● 正在测试...";
  connectionStatus.className = "badge";

  // Save first to ensure the port/token are tested correctly
  const options = readForm();
  await chrome.storage.sync.set(options);

  try {
    const response = await chrome.runtime.sendMessage({
      type: "pidownloader:test-connection",
    });

    if (response?.ok) {
      connectionStatus.textContent = "● 已连接";
      connectionStatus.className = "badge success";
      showStatus("连接测试成功！", "success");
      if (clientVersionEl) {
        clientVersionEl.textContent = "已连接 (0.1.0)";
      }
    } else {
      connectionStatus.textContent = "● 未连接";
      connectionStatus.className = "badge error";
      showStatus("连接失败，请检查设置", "error");
      if (clientVersionEl) {
        clientVersionEl.textContent = "未连接";
      }
    }
  } catch (error) {
    connectionStatus.textContent = "● 未连接";
    connectionStatus.className = "badge error";
    showStatus("通信异常", "error");
    if (clientVersionEl) {
      clientVersionEl.textContent = "通信异常";
    }
  } finally {
    testButton.disabled = false;
  }
});

pairButton.addEventListener("click", async () => {
  pairButton.disabled = true;
  const originalText = pairButton.textContent;
  pairButton.textContent = "配对中...";

  // Save the current form settings first (e.g. port) so background script can communicate using the updated port.
  const options = readForm();
  await chrome.storage.sync.set(options);

  try {
    const response = await chrome.runtime.sendMessage({
      type: "pidownloader:request-pairing",
    });

    if (response?.ok && response?.token) {
      serverTokenInput.value = response.token;
      // Save settings again to persist the new token
      const nextOptions = readForm();
      await chrome.storage.sync.set(nextOptions);
      showStatus("配对成功，已自动保存 Token", "success");
      updateConnectionStatus();
    } else {
      const errorMsg = response?.error || "配对失败";
      showStatus(`配对失败：${errorMsg}`, "error");
    }
  } catch (error) {
    showStatus(`通信异常：${error instanceof Error ? error.message : String(error)}`, "error");
  } finally {
    pairButton.disabled = false;
    pairButton.textContent = originalText;
  }
});

openClientBtn.addEventListener("click", () => {
  window.open(apiUrlInput.value || "http://127.0.0.1:18388", "_blank");
});

officialSiteBtn.addEventListener("click", () => {
  window.open("https://github.com/MrShellad/PiDown", "_blank");
});

async function updateConnectionStatus() {
  try {
    const response = await chrome.runtime.sendMessage({
      type: "pidownloader:test-connection",
    });
    if (response?.ok) {
      connectionStatus.textContent = "● 已连接";
      connectionStatus.className = "badge success";
      if (clientVersionEl) {
        clientVersionEl.textContent = "已连接 (0.1.0)";
      }
    } else {
      connectionStatus.textContent = "● 未连接";
      connectionStatus.className = "badge error";
      if (clientVersionEl) {
        clientVersionEl.textContent = "未连接";
      }
    }
  } catch {
    connectionStatus.textContent = "● 未连接";
    connectionStatus.className = "badge error";
    if (clientVersionEl) {
      clientVersionEl.textContent = "未连接";
    }
  }
}

function writeForm(options) {
  // Simple checkboxes
  for (const field of ["enabled", "fallbackToBrowserDownload", "pauseDuringHandoff", "eraseCancelledDownload", "showNotifications", "captureIncognito", "contextMenuEnabled"]) {
    const input = document.querySelector(`#${field}`);
    if (input) {
      input.checked = Boolean(options[field]);
    }
  }

  // Extensions & Bypassed Domains
  for (const field of ["allowExtensions", "blockExtensions", "bypassDomains"]) {
    const input = document.querySelector(`#${field}`);
    if (input) {
      input.value = options[field] || "";
    }
  }

  // API Url and Token
  apiUrlInput.value = `http://127.0.0.1:${options.serverPort || 18388}`;
  serverTokenInput.value = options.serverToken || "";

  // Large file toggle & size
  const minBytes = Number(options.minBytes || 0);
  if (minBytes > 0) {
    largeFileToggle.checked = true;
    minBytesField.style.display = "block";
    minBytesMbInput.value = Math.round(minBytes / (1024 * 1024));
  } else {
    largeFileToggle.checked = false;
    minBytesField.style.display = "none";
    minBytesMbInput.value = 10; // default placeholder
  }
}

function readForm() {
  const options = {};

  // Simple checkboxes
  for (const field of ["enabled", "fallbackToBrowserDownload", "pauseDuringHandoff", "eraseCancelledDownload", "showNotifications", "captureIncognito", "contextMenuEnabled"]) {
    const input = document.querySelector(`#${field}`);
    if (input) {
      options[field] = input.checked;
    }
  }

  // Extensions & Bypassed Domains
  for (const field of ["allowExtensions", "blockExtensions", "bypassDomains"]) {
    const input = document.querySelector(`#${field}`);
    if (input) {
      options[field] = input.value;
    }
  }

  // API Url -> Parse Port
  let port = 18388;
  const rawUrl = apiUrlInput.value.trim();
  try {
    const parsed = new URL(rawUrl.startsWith("http") ? rawUrl : "http://" + rawUrl);
    port = Number(parsed.port) || (parsed.protocol === "https:" ? 443 : 80);
  } catch {
    const match = rawUrl.match(/:(\d+)$/);
    if (match) {
      port = Number(match[1]);
    }
  }
  options.serverPort = port;
  options.serverToken = serverTokenInput.value.trim();

  // Large file toggle & size
  if (largeFileToggle.checked) {
    const mb = Math.max(0, Number(minBytesMbInput.value || 0));
    options.minBytes = mb * 1024 * 1024;
  } else {
    options.minBytes = 0;
  }

  return options;
}

// Presets rendering and event handling
function renderPresetChips() {
  const containers = document.querySelectorAll("[data-preset-container]");
  for (const container of containers) {
    container.innerHTML = ""; // Clear existing
    const field = container.dataset.presetContainer;
    if (!field) continue;

    for (const preset of EXTENSION_PRESETS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "preset-chip";
      button.textContent = preset.label;
      button.title = preset.values.join(", ");
      button.addEventListener("click", () => {
        appendPresetValues(field, preset.values);
      });
      container.appendChild(button);
    }
  }
}

function appendPresetValues(fieldId, values) {
  const input = document.querySelector(`#${fieldId}`);
  if (!input) return;

  const merged = Array.from(
    new Set([...parseCsv(input.value), ...values.map((value) => normalizeExtension(value))])
  );
  input.value = merged.join(", ");
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function parseCsv(value) {
  return String(value || "")
    .split(/[,，]/)
    .map((item) => normalizeExtension(item))
    .filter(Boolean);
}

function normalizeExtension(value) {
  return String(value || "").trim().replace(/^\./, "").toLowerCase();
}

function showStatus(message, kind) {
  showToast(message, kind, kind === "error" ? 5000 : 3000);
}

// Theme handling
function initTheme() {
  const root = document.documentElement;
  const storedTheme = localStorage.getItem("options_theme") || "auto";

  if (storedTheme === "auto") {
    applySystemTheme();
  } else {
    root.setAttribute("data-theme", storedTheme);
    updateThemeButton(storedTheme);
  }

  themeBtn.addEventListener("click", () => {
    const current = root.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    localStorage.setItem("options_theme", next);
    updateThemeButton(next);
  });
}

function applySystemTheme() {
  const root = document.documentElement;
  const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = dark ? "dark" : "light";
  root.setAttribute("data-theme", theme);
  updateThemeButton(theme);
}

function updateThemeButton(theme) {
  themeBtn.textContent = theme === "dark" ? "☀️" : "🌙";
}
