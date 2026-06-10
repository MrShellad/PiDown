const enabledInput = document.querySelector("#enabled");
const enabledHint = document.querySelector("#enabled-hint");
const bridgeStatus = document.querySelector("#bridge-status");
const optionsButton = document.querySelector("#open-options");
const testButton = document.querySelector("#test-connection");
const testResult = document.querySelector("#test-result");
const extensionId = document.querySelector("#extension-id");

extensionId.textContent = chrome.runtime.id;

init().catch((error) => {
  renderBridgeStatus("unavailable");
  testResult.textContent = `状态读取失败：${error instanceof Error ? error.message : String(error)}`;
  testResult.dataset.kind = "error";
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
  testResult.textContent = "正在测试扩展与 PiDownloader 的通信...";
  testResult.dataset.kind = "pending";

  try {
    const response = await chrome.runtime.sendMessage({
      type: "pidownloader:test-connection",
    });

    if (response?.ok) {
      renderBridgeStatus("connected");
      testResult.textContent = "连接正常：扩展、Native Host、PiDownloader 均可通信。";
      testResult.dataset.kind = "success";
    } else {
      renderBridgeStatus("unavailable");
      testResult.textContent = formatConnectionError(response?.error || "Native bridge 未连接");
      testResult.dataset.kind = "error";
    }
  } catch (error) {
    renderBridgeStatus("unavailable");
    testResult.textContent = formatConnectionError(
      error instanceof Error ? error.message : String(error)
    );
    testResult.dataset.kind = "error";
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
  bridgeStatus.textContent = connected ? "Native bridge 已连接" : "Native bridge 未连接";
  bridgeStatus.dataset.kind = connected ? "connected" : "unavailable";
}

function formatConnectionError(error) {
  const message = String(error || "");
  if (message.includes("Specified native messaging host not found")) {
    return `连接失败：未找到 Native Host。请在当前系统中注册名称为 com.pidownloader.bridge 的 Native Messaging Host，并把扩展 ID ${chrome.runtime.id} 加入 allowed_origins。`;
  }
  return `连接失败：${message}`;
}
