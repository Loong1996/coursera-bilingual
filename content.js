// Coursera 双语字幕 - Content Script
const TARGET_LANGS = ["en", "zh-CN"];

let watchedVideo = null;
let lastUrl = location.href;

function applyTracks(video) {
  if (!video || video.textTracks.length === 0) return false;
  let success = false;
  for (let i = 0; i < video.textTracks.length; i++) {
    const track = video.textTracks[i];
    if (TARGET_LANGS.includes(track.language)) {
      track.mode = "showing";
      success = true;
    } else {
      track.mode = "hidden";
    }
  }
  return success;
}

// 在 duration 毫秒内，每隔 interval 重试一次
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

  // 立即应用，并在 1.5 秒内每 150ms 重试（对抗 Coursera 的初始化重置）
  retryApply(video, 1500, 150);

  // 字幕文件异步加载完毕时再应用一次
  video.textTracks.addEventListener("addtrack", () => {
    retryApply(video, 800, 150);
  });

  video.addEventListener("loadedmetadata", () => applyTracks(video), { once: true });
}

// MutationObserver：视频元素一出现就立刻处理
const domObserver = new MutationObserver(() => {
  const video = document.querySelector("video");
  if (video) attachToVideo(video);
});
domObserver.observe(document.body, { childList: true, subtree: true });

// URL 轮询：处理 SPA 跳转（video 元素可能复用，不触发 MutationObserver）
setInterval(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    watchedVideo = null;
  }
  const video = document.querySelector("video");
  if (video) attachToVideo(video);
}, 500);

// popup 手动触发
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "apply") {
    const video = document.querySelector("video");
    const success = applyTracks(video);
    sendResponse({ success });
  }
});

// 初始检查（页面加载时视频可能已存在）
const video = document.querySelector("video");
if (video) attachToVideo(video);
