const DEFAULT_LANGS = ["en", "zh-CN"];

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

// 当前已排好序的语言列表（只含勾选的）
let orderedLangs = [];

function saveAndApply(tabId) {
  chrome.storage.sync.set({ selectedLangs: orderedLangs }, () => {
    chrome.tabs.sendMessage(tabId, { action: "apply" }, (resp) => {
      if (chrome.runtime.lastError) return;
      setStatus(resp?.success ? "已应用 ✓" : "暂无字幕轨道");
    });
  });
}

// 重新渲染整个列表（allItems 维持完整顺序，含未勾选项）
function renderList(allItems, tabId) {
  const list = document.getElementById("langList");
  list.innerHTML = "";

  // 勾选项的行序（用于显示"第 N 行"）
  let checkedRank = 0;
  const checkedItems = allItems.filter(i => i.checked);

  allItems.forEach((item, idx) => {
    const isChecked = item.checked;
    if (isChecked) checkedRank++;
    const rank = isChecked ? checkedRank : null;

    const row = document.createElement("div");
    row.className = "lang-item" + (isChecked ? " checked" : "");
    if (!item.inVideo) row.style.opacity = "0.45";
    row.title = item.inVideo ? "" : "当前视频无此轨道";

    // 复选框
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = isChecked;
    cb.dataset.lang = item.language;

    // 语言名
    const nameSpan = document.createElement("span");
    nameSpan.className = "lang-label";
    nameSpan.textContent = langName(item.language, item.label);

    // 语言代码
    const codeSpan = document.createElement("span");
    codeSpan.className = "lang-code";
    codeSpan.textContent = item.language;

    // 行序标记
    const badge = document.createElement("span");
    badge.className = "line-badge";
    badge.textContent = rank !== null ? `第${rank}行` : "";

    // 排序按钮（仅对勾选项生效）
    const sortBtns = document.createElement("div");
    sortBtns.className = "sort-btns";

    const upBtn = document.createElement("button");
    upBtn.className = "sort-btn";
    upBtn.textContent = "▲";
    upBtn.title = "上移";

    const downBtn = document.createElement("button");
    downBtn.className = "sort-btn";
    downBtn.textContent = "▼";
    downBtn.title = "下移";

    // 只有勾选项才能排序；同时禁用首/末按钮
    if (!isChecked) {
      upBtn.disabled = true;
      downBtn.disabled = true;
    } else {
      const checkedIdxInChecked = checkedItems.indexOf(item);
      if (checkedIdxInChecked === 0) upBtn.disabled = true;
      if (checkedIdxInChecked === checkedItems.length - 1) downBtn.disabled = true;
    }

    upBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      // 在 allItems 中找到上一个已勾选的项，与当前项交换
      const prevCheckedIdx = allItems.slice(0, idx).map((x, i) => x.checked ? i : -1).filter(i => i !== -1).pop();
      if (prevCheckedIdx === undefined) return;
      [allItems[prevCheckedIdx], allItems[idx]] = [allItems[idx], allItems[prevCheckedIdx]];
      syncOrderedLangs(allItems);
      renderList(allItems, tabId);
      saveAndApply(tabId);
    });

    downBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      // 在 allItems 中找到下一个已勾选的项，与当前项交换
      const nextCheckedIdx = allItems.slice(idx + 1).map((x, i) => x.checked ? idx + 1 + i : -1).filter(i => i !== -1)[0];
      if (nextCheckedIdx === undefined) return;
      [allItems[nextCheckedIdx], allItems[idx]] = [allItems[idx], allItems[nextCheckedIdx]];
      syncOrderedLangs(allItems);
      renderList(allItems, tabId);
      saveAndApply(tabId);
    });

    cb.addEventListener("change", () => {
      item.checked = cb.checked;
      // 新勾选的项追加到末尾（自然顺序），不改变未勾选项位置
      syncOrderedLangs(allItems);
      renderList(allItems, tabId);
      saveAndApply(tabId);
    });

    sortBtns.append(upBtn, downBtn);
    row.append(cb, nameSpan, codeSpan, badge, sortBtns);
    list.appendChild(row);
  });
}

function syncOrderedLangs(allItems) {
  orderedLangs = allItems.filter(i => i.checked).map(i => i.language);
  if (orderedLangs.length === 0) orderedLangs = [...DEFAULT_LANGS];
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

  chrome.storage.sync.get("selectedLangs", (result) => {
    const savedLangs = result.selectedLangs ?? DEFAULT_LANGS;

    chrome.tabs.sendMessage(tabId, { action: "getTracks" }, (resp) => {
      const tracks = resp?.tracks ?? [];

      // 构建 allItems：先按 savedLangs 顺序放勾选项，再补充视频里有但未选的
      const savedSet = new Set(savedLangs);
      const videoLangSet = new Set(tracks.map(t => t.language));
      const trackMap = Object.fromEntries(tracks.map(t => [t.language, t]));

      const allItems = [];

      // 1. 已保存的语言（按保存顺序，包含视频里没有的）
      for (const lang of savedLangs) {
        allItems.push({
          language: lang,
          label: trackMap[lang]?.label ?? "",
          checked: true,
          inVideo: videoLangSet.has(lang),
        });
      }

      // 2. 视频里有但没被选中的轨道
      for (const t of tracks) {
        if (!savedSet.has(t.language)) {
          allItems.push({
            language: t.language,
            label: t.label,
            checked: false,
            inVideo: true,
          });
        }
      }

      orderedLangs = [...savedLangs];
      renderList(allItems, tabId);
    });
  });

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
