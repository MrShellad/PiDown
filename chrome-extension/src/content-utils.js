const PLATFORM_RULES = [
  {
    name: "twitter",
    match: () => window.location.hostname.includes("x.com") || window.location.hostname.includes("twitter.com"),
    getVideoInfo: (video) => {
      let parent = video.parentElement;
      let tweetElement = null;
      while (parent) {
        if (parent.getAttribute('data-testid') === 'tweet') {
          tweetElement = parent;
          break;
        }
        parent = parent.parentElement;
      }

      if (!tweetElement) {
        return { platform: 'twitter', username: 'twitter', tweetId: 'video', filename: 'x-video.mp4' };
      }

      // Extract author handle
      const userNameEl = tweetElement.querySelector('[data-testid="User-Name"]');
      let username = 'x_user';
      if (userNameEl) {
        const link = userNameEl.querySelector('a');
        if (link) {
          const href = link.getAttribute('href');
          if (href) {
            username = href.replace(/^\//, ''); // remove leading slash
          }
        }
      }

      // Extract tweet ID
      const links = tweetElement.querySelectorAll('a');
      let tweetId = '';
      for (const link of links) {
        const href = link.getAttribute('href') || '';
        const match = href.match(/\/status\/(\d+)/);
        if (match) {
          tweetId = match[1];
          break;
        }
      }

      if (!tweetId) {
        const match = window.location.pathname.match(/\/status\/(\d+)/);
        if (match) {
          tweetId = match[1];
        } else {
          tweetId = String(Date.now());
        }
      }

      const filename = `x_${username}_${tweetId}.mp4`;
      return { platform: 'twitter', username, tweetId, filename };
    },
    getVideoIds: (video) => {
      const ids = [];
      const info = window.PiDownloaderUtils.getTweetInfo(video);
      if (info.tweetId && /^\d+$/.test(info.tweetId)) {
        ids.push(info.tweetId);
      }
      
      let parent = video.parentElement;
      let tweetElement = null;
      while (parent) {
        if (parent.getAttribute('data-testid') === 'tweet') {
          tweetElement = parent;
          break;
        }
        parent = parent.parentElement;
      }
      
      if (tweetElement) {
        const links = tweetElement.querySelectorAll('a');
        for (const link of links) {
          const href = link.getAttribute('href') || '';
          const statusMatch = href.match(/\/status\/(\d+)/);
          if (statusMatch) ids.push(statusMatch[1]);
        }
      }
      return ids;
    },
    findContainer: (video) => {
      const playerContainer = video.closest('[data-testid="videoPlayer"]');
      if (playerContainer) return playerContainer;

      let parent = video.parentElement;
      while (parent && parent !== document.body) {
        const style = window.getComputedStyle(parent);
        if (style.position === 'relative' || style.position === 'absolute') {
          return parent;
        }
        if (parent.getAttribute('data-testid') === 'tweet') {
          break;
        }
        parent = parent.parentElement;
      }
      return video.parentElement;
    }
  },
  {
    name: "tiktok",
    match: () => window.location.hostname.includes("tiktok.com"),
    getVideoInfo: (video) => {
      let username = 'tiktok_user';
      let videoId = '';

      const urlMatch = window.location.pathname.match(/\/@([^\/]+)\/video\/(\d+)/);
      if (urlMatch) {
        username = urlMatch[1];
        videoId = urlMatch[2];
      } else {
        let parent = video.parentElement;
        while (parent && parent !== document.body) {
          const a = parent.querySelector('a[href*="/video/"]');
          if (a) {
            const href = a.getAttribute('href') || '';
            const m = href.match(/\/@([^\/]+)\/video\/(\d+)/);
            if (m) {
              username = m[1];
              videoId = m[2];
              break;
            }
          }
          parent = parent.parentElement;
        }
      }

      if (!videoId) {
        videoId = String(Date.now());
      }

      const filename = `tiktok_${username}_${videoId}.mp4`;
      return { platform: 'tiktok', username, tweetId: videoId, filename };
    },
    getVideoIds: (video) => {
      const ids = [];
      const info = window.PiDownloaderUtils.getTweetInfo(video);
      if (info.tweetId) {
        ids.push(info.tweetId);
      }
      return ids;
    },
    findContainer: (video) => {
      let parent = video.parentElement;
      while (parent && parent !== document.body) {
        const style = window.getComputedStyle(parent);
        if (style.position === 'relative' || style.position === 'absolute') {
          return parent;
        }
        parent = parent.parentElement;
      }
      return video.parentElement;
    }
  }
];

function getActiveRule() {
  return PLATFORM_RULES.find(rule => rule.match()) || {
    name: "default",
    getVideoInfo: (video) => {
      return { platform: 'default', username: 'video', tweetId: String(Date.now()), filename: 'video.mp4' };
    },
    getVideoIds: (video) => [String(Date.now())],
    findContainer: (video) => video.parentElement
  };
}

window.PiDownloaderUtils = {
  getTweetInfo: (video) => getActiveRule().getVideoInfo(video),
  getTweetIds: (video) => getActiveRule().getVideoIds(video),
  findVideoContainer: (video) => getActiveRule().findContainer(video),
  getUrlLabel: (url) => {
    const isM3u8 = url.includes('.m3u8');
    const typeLabel = isM3u8 ? 'HLS Stream' : 'MP4 Video';
    
    const resMatch = url.match(/(\d+x\d+)/);
    if (resMatch) {
      return `${typeLabel} (${resMatch[1]})`;
    }
    
    if (url.includes('hls-manifest')) {
      return `${typeLabel} (Adaptive)`;
    }
    
    return typeLabel;
  }
};
