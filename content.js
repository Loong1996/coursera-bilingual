// Coursera 双语字幕 - Content Script
const DEFAULT_LANGS = ["en", "zh-CN"];

let targetLangs = DEFAULT_LANGS;
let watchedVideo = null;
let lastUrl = location.href;

// 从 storage 加载语言配置
chrome.storage.sync.get("selectedLangs", (result) => {
  if (result.selectedLangs?.length > 0) {
    targetLangs = result.selectedLangs;
  }
});

// storage 变化时实时更新并重新应用
chrome.storage.onChanged.addListener((changes) => {
  if (changes.selectedLangs) {
    targetLangs = changes.selectedLangs.newValue ?? DEFAULT_LANGS;
    const video = document.querySelector("video");
    if (video) retryApply(video, 800, 150);
  }
});

function applyTracks(video) {
  if (!video || video.textTracks.length === 0) return false;
  let success = false;
  for (let i = 0; i < video.textTracks.length; i++) {
    const track = video.textTracks[i];
    if (targetLangs.includes(track.language)) {
      track.mode = "showing";
      success = true;
    } else {
      track.mode = "hidden";
    }
  }
  return success;
}

function retryApply(video, duration, interval) {
  const end = Date.now() + duration;
  function attempt() {
    applyTracks(video);
    if (Date.now() < end) setTimeout(attempt, interval);
  }
  attempt();
}

function attachToVideo(video) {
  if (video === watchedVideo) return;
  watchedVideo = video;

  retryApply(video, 1500, 150);

  video.textTracks.addEventListener("addtrack", () => {
    retryApply(video, 800, 150);
  });

  video.addEventListener("loadedmetadata", () => applyTracks(video), { once: true });
}

const domObserver = new MutationObserver(() => {
  const video = document.querySelector("video");
  if (video) attachToVideo(video);
});
domObserver.observe(document.body, { childList: true, subtree: true });

setInterval(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    watchedVideo = null;
  }
  const video = document.querySelector("video");
  if (video) attachToVideo(video);
}, 500);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "apply") {
    const video = document.querySelector("video");
    const success = applyTracks(video);
    sendResponse({ success });
  }

  if (message.action === "getTracks") {
    const video = document.querySelector("video");
    if (!video || video.textTracks.length === 0) {
      sendResponse({ tracks: [] });
      return;
    }
    const tracks = [];
    for (let i = 0; i < video.textTracks.length; i++) {
      const t = video.textTracks[i];
      // 只取字幕类型（subtitles / captions）
      if (t.kind === "subtitles" || t.kind === "captions") {
        tracks.push({ language: t.language, label: t.label });
      }
    }
    sendResponse({ tracks });
  }
});

const video = document.querySelector("video");
if (video) attachToVideo(video);
