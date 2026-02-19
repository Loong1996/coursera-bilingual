document.getElementById("applyBtn").addEventListener("click", () => {
  const status = document.getElementById("status");
  status.textContent = "";
  status.className = "";

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab || !tab.url?.includes("coursera.org")) {
      status.textContent = "请在 Coursera 页面使用";
      status.className = "error";
      return;
    }

    chrome.tabs.sendMessage(tab.id, { action: "apply" }, (response) => {
      if (chrome.runtime.lastError) {
        status.textContent = "无法连接页面，请刷新后重试";
        status.className = "error";
        return;
      }
      if (response?.success) {
        status.textContent = "双语字幕已开启 ✓";
      } else {
        status.textContent = "未检测到视频字幕";
        status.className = "error";
      }
    });
  });
});
