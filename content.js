// Coursera 双语字幕 - Content Script
const DEFAULT_LANGS = ["en", "zh-CN"];

let targetLangs = DEFAULT_LANGS;
let watchedVideo = null;
let lastUrl = location.href;

chrome.storage.sync.get("selectedLangs", (result) => {
  if (result.selectedLangs?.length > 0) targetLangs = result.selectedLangs;
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.selectedLangs) {
    targetLangs = changes.selectedLangs.newValue ?? DEFAULT_LANGS;
    const video = document.querySelector("video");
    if (video) retryApply(video, 800, 150);
  }
});

// 根据语言在 targetLangs 中的顺序，给该轨道的所有 cue 设置 line 值
// targetLangs[0] 显示在最上方，targetLangs[最后] 显示在最下方（-1）
function applyLineToTrack(track) {
  const orderIndex = targetLangs.indexOf(track.language);
  if (orderIndex === -1 || targetLangs.length <= 1) return;

  // index 0 → line -(n), 最后一个 → line -1
  const linePos = -(targetLangs.length - orderIndex);

  function setLine(cue) {
    cue.snapToLines = true;
    cue.line = linePos;
  }

  // 已加载的全部 cue
  if (track.cues) {
    for (const cue of track.cues) setLine(cue);
  }

  // 后续激活的 cue（VTT 文件异步加载，或 seek 时）
  track.oncuechange = () => {
    if (track.activeCues) {
      for (const cue of track.activeCues) setLine(cue);
    }
  };

  // VTT 文件加载完成后批量处理
  track.addEventListener("load", () => {
    if (track.cues) {
      for (const cue of track.cues) setLine(cue);
    }
  });
}

function applyTracks(video) {
  if (!video || video.textTracks.length === 0) return false;
  let success = false;
  for (let i = 0; i < video.textTracks.length; i++) {
    const track = video.textTracks[i];
    if (targetLangs.includes(track.language)) {
      track.mode = "showing";
      applyLineToTrack(track);
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
      if (t.kind === "subtitles" || t.kind === "captions") {
        tracks.push({ language: t.language, label: t.label });
      }
    }
    sendResponse({ tracks });
  }
});

const video = document.querySelector("video");
if (video) attachToVideo(video);
