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
};

const SEGMENT_IDS = ["allowlist", "blocklist", "size-limit"];
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
const statusEl = document.querySelector("#status");
const resetButton = document.querySelector("#reset");
const segmentButtons = Array.from(document.querySelectorAll("[data-segment-target]"));
const segmentPanels = Array.from(document.querySelectorAll("[data-segment-panel]"));

const fields = Object.keys(DEFAULT_OPTIONS);

init().catch((error) => {
  showStatus(`加载失败：${error instanceof Error ? error.message : String(error)}`, "error");
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await chrome.storage.sync.set(readForm());
  showStatus("设置已保存", "success");
});

resetButton.addEventListener("click", async () => {
  await chrome.storage.sync.set(DEFAULT_OPTIONS);
  writeForm(DEFAULT_OPTIONS);
  activateSegment("allowlist");
  showStatus("已恢复默认设置", "success");
});

for (const button of segmentButtons) {
  button.addEventListener("click", () => {
    activateSegment(button.dataset.segmentTarget || "allowlist");
  });
}

renderPresetChips();

async function init() {
  const options = await chrome.storage.sync.get(DEFAULT_OPTIONS);
  writeForm(options);
  activateSegment("allowlist");
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

function activateSegment(segmentId) {
  const activeId = SEGMENT_IDS.includes(segmentId) ? segmentId : "allowlist";

  for (const button of segmentButtons) {
    const active = button.dataset.segmentTarget === activeId;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
  }

  for (const panel of segmentPanels) {
    const active = panel.dataset.segmentPanel === activeId;
    panel.classList.toggle("is-active", active);
    panel.hidden = !active;
  }
}

function renderPresetChips() {
  const containers = document.querySelectorAll("[data-preset-container]");
  for (const container of containers) {
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
    .split(",")
    .map((item) => normalizeExtension(item))
    .filter(Boolean);
}

function normalizeExtension(value) {
  return String(value || "").trim().replace(/^\./, "").toLowerCase();
}

function showStatus(message, kind) {
  statusEl.textContent = message;
  statusEl.dataset.kind = kind;
  window.setTimeout(() => {
    statusEl.textContent = "";
    delete statusEl.dataset.kind;
  }, 2400);
}
