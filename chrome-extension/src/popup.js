const enabledInput = document.querySelector("#enabled");
const enabledHint = document.querySelector("#enabled-hint");
const bridgeStatus = document.querySelector("#bridge-status");
const optionsButton = document.querySelector("#open-options");
const testButton = document.querySelector("#test-connection");
const extensionId = document.querySelector("#extension-id");

extensionId.textContent = chrome.runtime.id;

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
    toastContainer.className = "pidownloader-toast-container bottom-center";
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
  renderBridgeStatus("unavailable");
  showToast(`状态读取失败：${error instanceof Error ? error.message : String(error)}`, "error", 5000);
});

enabledInput.addEventListener("change", async () => {
  await chrome.runtime.sendMessage({
    type: "pidownloader:set-enabled",
    enabled: enabledInput.checked,
  });
  renderEnabled(enabledInput.checked);
});

testButton.addEventListener("click", async () => {
  testButton.disabled = true;
  dismissAllToasts();
  showToast("正在测试扩展与 PiDownloader 的通信...", "pending", 30000);

  try {
    const response = await chrome.runtime.sendMessage({
      type: "pidownloader:test-connection",
    });

    dismissAllToasts();

    if (response?.ok) {
      renderBridgeStatus("connected");
      showToast("连接正常：扩展与 PiDownloader 本地服务端已建立连接。", "success");
    } else {
      renderBridgeStatus("unavailable");
      showToast(formatConnectionError(response?.error || "本地服务端未连接"), "error", 5000);
    }
  } catch (error) {
    dismissAllToasts();
    renderBridgeStatus("unavailable");
    showToast(formatConnectionError(
      error instanceof Error ? error.message : String(error)
    ), "error", 5000);
  } finally {
    testButton.disabled = false;
  }
});

optionsButton.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

async function init() {
  const response = await chrome.runtime.sendMessage({ type: "pidownloader:get-status" });
  if (!response?.ok) throw new Error(response?.error || "unknown error");

  enabledInput.checked = Boolean(response.options.enabled);
  renderEnabled(response.options.enabled);
  renderBridgeStatus(response.nativeStatus);
}

function renderEnabled(enabled) {
  enabledHint.textContent = enabled ? "已开启" : "已暂停";
}

function renderBridgeStatus(status) {
  const connected = status === "connected";
  bridgeStatus.textContent = connected ? "本地服务端已连接" : "本地服务端未连接";
  bridgeStatus.dataset.kind = connected ? "connected" : "unavailable";
}

function formatConnectionError(error) {
  const message = String(error || "");
  if (message.includes("Failed to fetch") || message.includes("NetworkError") || message.includes("Failed to execute 'fetch'")) {
    return "连接失败：无法访问 PiDownloader 本地服务端。请确保 PiDownloader 正在运行并且在设置中启用了浏览器扩展联动，且端口和 Token 配置正确。";
  }
  return `连接失败：${message}`;
}
