let tabHasStreams = false;
let activeDropdown = null;
let currentOpenVideo = null;
let currentOpenButton = null;

let activePreviewCard = null;
let currentThumbnailUrl = null;

// Shorthand namespaces
const styles = window.PiDownloaderStyles;
const utils = window.PiDownloaderUtils;

function removePreview() {
  if (activePreviewCard) {
    if (activePreviewCard.hlsInstance) {
      activePreviewCard.hlsInstance.destroy();
    }
    activePreviewCard.remove();
    activePreviewCard = null;
  }
}

function showPreview(url, dropdown) {
  removePreview();
  
  const preview = document.createElement('div');
  preview.className = 'pidownloader-preview-card';
  
  const dropdownRect = dropdown.getBoundingClientRect();
  let left = dropdownRect.left + window.scrollX - 280 - 12;
  if (left < 0) {
    left = dropdownRect.right + window.scrollX + 12;
  }
  
  preview.style.top = `${dropdownRect.top + window.scrollY}px`;
  preview.style.left = `${left}px`;
  
  const isM3u8 = url.includes('.m3u8');
  
  if (isM3u8) {
    const video = document.createElement('video');
    video.className = 'pidownloader-preview-media';
    video.muted = true;
    video.autoplay = true;
    video.loop = true;
    video.playsInline = true;
    
    if (currentThumbnailUrl) {
      video.poster = currentThumbnailUrl;
    }
    
    preview.appendChild(video);

    if (typeof Hls !== 'undefined' && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: false });
      hls.loadSource(url);
      hls.attachMedia(video);
      preview.hlsInstance = hls;
    }
    
    const label = document.createElement('div');
    label.className = 'pidownloader-preview-overlay';
    label.innerText = 'HLS Preview';
    preview.appendChild(label);
  } else {
    const video = document.createElement('video');
    video.className = 'pidownloader-preview-media';
    video.src = url;
    video.muted = true;
    video.autoplay = true;
    video.loop = true;
    video.playsInline = true;
    
    if (currentThumbnailUrl) {
      video.poster = currentThumbnailUrl;
    }
    
    preview.appendChild(video);
    
    const label = document.createElement('div');
    label.className = 'pidownloader-preview-overlay';
    label.innerText = 'MP4 Preview';
    preview.appendChild(label);
  }
  
  document.body.appendChild(preview);
  activePreviewCard = preview;
}

function safeSendMessage(message, callback) {
  try {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) {
      return;
    }
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        return;
      }
      if (callback) callback(response);
    });
  } catch (e) {
    // Suppress context invalidation errors silently
  }
}

function pushStream(url, itemElement, tweetInfo) {
  itemElement.classList.add('pushed');
  const rightArea = itemElement.querySelector('.pidownloader-item-right');
  rightArea.innerHTML = '<div class="pidownloader-spinner"></div>';
  
  const isM3u8 = url.includes('.m3u8');
  const ext = isM3u8 ? '.m3u8' : '.mp4';
  const filename = tweetInfo.filename.replace(/\.[a-z0-9]+$/i, ext);
  
  safeSendMessage({
    type: "pidownloader:push-video",
    url: url,
    filename: filename,
    referer: window.location.href,
    userAgent: navigator.userAgent
  }, (response) => {
    if (response && response.ok) {
      rightArea.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#00ba7c" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      `;
      setTimeout(() => {
        if (activeDropdown && activeDropdown.contains(itemElement)) {
          closeActiveDropdown();
        }
      }, 1500);
    } else {
      rightArea.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ff3b30" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      `;
      setTimeout(() => {
        itemElement.classList.remove('pushed');
        rightArea.innerHTML = `
          <svg class="pidownloader-dl-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="8 17 12 21 16 17"></polyline>
            <line x1="12" y1="12" x2="12" y2="21"></line>
            <path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29"></path>
          </svg>
        `;
      }, 3000);
    }
  });
}

function formatBytes(bytes) {
  if (bytes === null || bytes === undefined || isNaN(bytes) || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

function renderDropdownContents(dropdown, videos, video, tweetInfo) {
  dropdown.innerHTML = '';
  
  const header = document.createElement('div');
  header.className = 'pidownloader-dropdown-header';
  header.innerHTML = `
    <span>嗅探到的视频流 (${videos.length})</span>
    <span style="font-size: 9px; opacity: 0.7;">PIDOWN</span>
  `;
  dropdown.appendChild(header);
  
  if (videos.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'pidownloader-dropdown-empty';
    empty.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.5;">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
      <span>未检测到视频流，请播放视频</span>
    `;
    dropdown.appendChild(empty);
    return;
  }
  
  const tweetIds = utils.getTweetIds(video);
  const sortedVideos = [...videos].sort((a, b) => {
    const aMatch = tweetIds.some(id => a.url.includes(id));
    const bMatch = tweetIds.some(id => b.url.includes(id));
    if (aMatch && !bMatch) return -1;
    if (!aMatch && bMatch) return 1;
    return 0;
  });
  
  const listContainer = document.createElement('div');
  listContainer.className = 'pidownloader-dropdown-list';
  dropdown.appendChild(listContainer);
  
  sortedVideos.forEach((videoItem) => {
    const url = videoItem.url;
    const size = videoItem.size;
    const isM3u8 = url.includes('.m3u8');
    const isCurrentVideo = tweetIds.some(id => url.includes(id));
    
    const item = document.createElement('button');
    item.className = 'pidownloader-dropdown-item';
    if (isCurrentVideo) {
      item.classList.add('current-video');
    }
    
    const label = utils.getUrlLabel(url);
    const subtitle = url.split('?')[0].split('/').pop() || 'stream';
    const sizeLabel = formatBytes(size);
    
    item.innerHTML = `
      <div class="pidownloader-item-left">
        <span class="pidownloader-item-title" title="${url}">${label}</span>
        <span class="pidownloader-item-subtitle" title="${url}">${subtitle}</span>
        <div class="pidownloader-item-badges">
          ${isCurrentVideo ? '<span class="pidownloader-item-badge badge-success">当前视频</span>' : ''}
          ${isM3u8 ? '<span class="pidownloader-item-badge badge-hls">HLS</span>' : '<span class="pidownloader-item-badge">MP4</span>'}
          ${sizeLabel ? `<span class="pidownloader-item-badge badge-size">${sizeLabel}</span>` : ''}
        </div>
      </div>
      <div class="pidownloader-item-right">
        <svg class="pidownloader-dl-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="8 17 12 21 16 17"></polyline>
          <line x1="12" y1="12" x2="12" y2="21"></line>
          <path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29"></path>
        </svg>
      </div>
    `;
    
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      pushStream(url, item, tweetInfo);
    });
    
    item.addEventListener('mouseenter', () => {
      showPreview(url, dropdown);
    });
    
    item.addEventListener('mouseleave', () => {
      removePreview();
    });
    
    listContainer.appendChild(item);
  });
}

function closeActiveDropdown() {
  removePreview();
  if (activeDropdown) {
    const buttons = document.querySelectorAll('.pidownloader-download-btn');
    buttons.forEach(btn => {
      const overlay = btn.closest('.pidownloader-video-overlay');
      if (overlay) overlay.classList.remove('visible');
    });
    
    activeDropdown.remove();
    activeDropdown = null;
    currentOpenVideo = null;
    currentOpenButton = null;
  }
}

function toggleDropdown(button, video, tweetInfo) {
  const overlay = button.closest('.pidownloader-video-overlay');
  
  if (activeDropdown) {
    const isSameButton = currentOpenButton === button;
    closeActiveDropdown();
    if (isSameButton) {
      return;
    }
  }
  
  styles.inject();
  
  const dropdown = document.createElement('div');
  dropdown.className = 'pidownloader-dropdown-menu';
  
  const rect = button.getBoundingClientRect();
  dropdown.style.top = `${rect.bottom + window.scrollY + 6}px`;
  dropdown.style.left = `${rect.right + window.scrollX - 280}px`;
  
  dropdown.addEventListener('click', (e) => {
    e.stopPropagation();
  });
  
  document.body.appendChild(dropdown);
  activeDropdown = dropdown;
  currentOpenVideo = video;
  currentOpenButton = button;
  
  if (overlay) {
    overlay.classList.add('visible');
  }
  
  dropdown.innerHTML = `
    <div class="pidownloader-dropdown-header">
      <span>嗅探视频</span>
    </div>
    <div class="pidownloader-dropdown-empty">
      <div class="pidownloader-spinner" style="width: 18px; height: 18px; border-width: 2.5px; border-color: rgba(29, 155, 240, 0.3); border-top-color: #1d9bf0;"></div>
      <span style="margin-top: 4px; font-size: 11px;">正在获取视频流...</span>
    </div>
  `;
  
  safeSendMessage({ type: "pidownloader:get-sniffed-videos", tweetId: tweetInfo.tweetId, platform: tweetInfo.platform }, (response) => {
    const videos = response?.videos || [];
    currentThumbnailUrl = response?.thumbnail || null;
    if (activeDropdown === dropdown) {
      renderDropdownContents(dropdown, videos, video, tweetInfo);
    }
  });
}

function updateButtonDots() {
  const dots = document.querySelectorAll('.pidownloader-sniff-dot');
  dots.forEach(dot => {
    dot.classList.add('has-streams');
  });
}

function createDownloadButton(video, container) {
  const overlay = document.createElement('div');
  overlay.className = 'pidownloader-video-overlay';
  
  const button = document.createElement('button');
  button.className = 'pidownloader-download-btn';
  button.innerHTML = `
    <div class="pidownloader-sniff-dot ${tabHasStreams ? 'has-streams' : ''}"></div>
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
      <polyline points="7 10 12 15 17 10"></polyline>
      <line x1="12" y1="15" x2="12" y2="3"></line>
    </svg>
    <span>PiDown</span>
  `;
  
  button.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const tweetInfo = utils.getTweetInfo(video);
    toggleDropdown(button, video, tweetInfo);
  });
  
  overlay.appendChild(button);
  return overlay;
}

function handleVideo(video) {
  if (video.offsetWidth < 50 || video.offsetHeight < 50) return;
  
  const container = utils.findVideoContainer(video);
  if (!container) return;
  
  if (container.querySelector('.pidownloader-video-overlay') || container.dataset.pidownloaderInjected) {
    return;
  }
  
  container.dataset.pidownloaderInjected = "true";
  
  const style = window.getComputedStyle(container);
  if (style.position === 'static') {
    container.style.position = 'relative';
  }
  
  const overlay = createDownloadButton(video, container);
  container.appendChild(overlay);
}

function init() {
  styles.inject();
  
  // Listen for play event
  document.addEventListener("play", (e) => {
    const video = e.target;
    if (video && video.tagName === "VIDEO") {
      handleVideo(video);
    }
  }, true);
  
  // Periodically scan for videos
  setInterval(() => {
    document.querySelectorAll("video").forEach((video) => {
      handleVideo(video);
    });
  }, 1500);
  
  // Close dropdown on click outside, scroll or resize
  document.addEventListener("click", (e) => {
    if (activeDropdown && !activeDropdown.contains(e.target) && !e.target.closest('.pidownloader-download-btn')) {
      closeActiveDropdown();
    }
  });
  
  window.addEventListener('scroll', () => {
    closeActiveDropdown();
  }, { passive: true });

  window.addEventListener('resize', () => {
    closeActiveDropdown();
  });
  
  // Listen for background notifications
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "pidownloader:video-sniffed") {
      tabHasStreams = true;
      updateButtonDots();
      
      if (activeDropdown && currentOpenVideo) {
        const tweetInfo = utils.getTweetInfo(currentOpenVideo);
        safeSendMessage({ type: "pidownloader:get-sniffed-videos", tweetId: tweetInfo.tweetId, platform: tweetInfo.platform }, (response) => {
          const videos = response?.videos || [];
          if (activeDropdown && currentOpenVideo) {
            renderDropdownContents(activeDropdown, videos, currentOpenVideo, tweetInfo);
          }
        });
      }
    }
  });
  
  // Check on load if tab already has videos
  safeSendMessage({ type: "pidownloader:get-sniffed-videos" }, (response) => {
    if (response?.urls && response.urls.length > 0) {
      tabHasStreams = true;
      updateButtonDots();
    }
  });
}

// Start
init();
