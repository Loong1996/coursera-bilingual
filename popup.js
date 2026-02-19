const DEFAULT_LANGS = ["en", "zh-CN"];

// 语言代码 → 友好名称
const LANG_NAMES = {
  "en": "English",
  "zh-CN": "中文（简体）",
  "zh-TW": "中文（繁體）",
  "ar": "العربية",
  "de": "Deutsch",
  "es": "Español",
  "fr": "Français",
  "hi": "हिन्दी",
  "it": "Italiano",
  "ja": "日本語",
  "ko": "한국어",
  "pt": "Português",
  "ru": "Русский",
  "tr": "Türkçe",
};

function langName(code, label) {
  return LANG_NAMES[code] || label || code;
}

function setStatus(text, isError = false) {
  const el = document.getElementById("status");
  el.textContent = text;
  el.className = isError ? "error" : "";
  if (text && !isError) setTimeout(() => { el.textContent = ""; }, 2000);
}

function saveAndApply(selectedLangs, tabId) {
  chrome.storage.sync.set({ selectedLangs }, () => {
    chrome.tabs.sendMessage(tabId, { action: "apply" }, (resp) => {
      if (chrome.runtime.lastError) return;
      setStatus(resp?.success ? "已应用 ✓" : "暂无字幕轨道");
    });
  });
}

function renderLangList(tracks, savedLangs, tabId) {
  const list = document.getElementById("langList");
  list.innerHTML = "";

  if (tracks.length === 0) {
    list.innerHTML = '<span class="hint">未检测到字幕轨道，请先播放视频</span>';
    return;
  }

  // 已保存但当前视频没有的语言也显示出来（灰色）
  const allLangs = [...new Map(
    [...tracks, ...savedLangs.map(l => ({ language: l, label: "" }))].map(t => [t.language, t])
  ).values()];

  allLangs.forEach(({ language, label }) => {
    const inVideo = tracks.some(t => t.language === language);
    const checked = savedLangs.includes(language);

    const item = document.createElement("label");
    item.className = "lang-item";
    if (!inVideo) item.style.opacity = "0.45";
    item.title = inVideo ? "" : "当前视频无此轨道";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = checked;
    cb.dataset.lang = language;

    const nameSpan = document.createElement("span");
    nameSpan.className = "lang-label";
    nameSpan.textContent = langName(language, label);

    const codeSpan = document.createElement("span");
    codeSpan.className = "lang-code";
    codeSpan.textContent = language;

    item.append(cb, nameSpan, codeSpan);
    list.appendChild(item);

    cb.addEventListener("change", () => {
      const selected = [...list.querySelectorAll("input:checked")].map(i => i.dataset.lang);
      saveAndApply(selected.length > 0 ? selected : DEFAULT_LANGS, tabId);
    });
  });
}

// 主流程
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const tab = tabs[0];
  if (!tab?.url?.includes("coursera.org")) {
    document.getElementById("langList").innerHTML =
      '<span class="hint" style="color:#f44336">请在 Coursera 页面打开</span>';
    document.getElementById("applyBtn").disabled = true;
    return;
  }

  const tabId = tab.id;

  // 并行：读取已保存语言 + 查询当前视频字幕轨道
  chrome.storage.sync.get("selectedLangs", (result) => {
    const savedLangs = result.selectedLangs ?? DEFAULT_LANGS;

    chrome.tabs.sendMessage(tabId, { action: "getTracks" }, (resp) => {
      const tracks = resp?.tracks ?? [];
      renderLangList(tracks, savedLangs, tabId);
    });
  });

  // 手动重新应用按钮
  document.getElementById("applyBtn").addEventListener("click", () => {
    chrome.tabs.sendMessage(tabId, { action: "apply" }, (resp) => {
      if (chrome.runtime.lastError) {
        setStatus("无法连接页面，请刷新", true);
        return;
      }
      setStatus(resp?.success ? "已重新应用 ✓" : "未检测到字幕", !resp?.success);
    });
  });
});
