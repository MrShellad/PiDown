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

const form = document.querySelector("#options-form");
const statusEl = document.querySelector("#status");
const resetButton = document.querySelector("#reset");

const fields = Object.keys(DEFAULT_OPTIONS);

init().catch((error) => {
  showStatus(`加载失败：${error}`, "error");
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await chrome.storage.sync.set(readForm());
  showStatus("设置已保存", "success");
});

resetButton.addEventListener("click", async () => {
  await chrome.storage.sync.set(DEFAULT_OPTIONS);
  writeForm(DEFAULT_OPTIONS);
  showStatus("已恢复默认设置", "success");
});

async function init() {
  const options = await chrome.storage.sync.get(DEFAULT_OPTIONS);
  writeForm(options);
}

function writeForm(options) {
  for (const field of fields) {
    const element = document.querySelector(`#${field}`);
    if (!element) continue;
    if (element.type === "checkbox") {
      element.checked = Boolean(options[field]);
    } else {
      element.value = options[field] ?? "";
    }
  }
}

function readForm() {
  return fields.reduce((next, field) => {
    const element = document.querySelector(`#${field}`);
    if (!element) return next;
    next[field] = element.type === "checkbox" ? element.checked : element.value;
    if (field === "minBytes") {
      next[field] = Math.max(0, Number(element.value || 0));
    }
    return next;
  }, {});
}

function showStatus(message, kind) {
  statusEl.textContent = message;
  statusEl.dataset.kind = kind;
  window.setTimeout(() => {
    statusEl.textContent = "";
    delete statusEl.dataset.kind;
  }, 2400);
}
