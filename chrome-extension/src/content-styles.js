const CSS_STYLES = `
  /* Keyframes for animations */
  @keyframes pidown-fade-in {
    from { opacity: 0; transform: scale(0.95) translateY(-5px); }
    to { opacity: 1; transform: scale(1) translateY(0); }
  }
  
  @keyframes pidown-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  @keyframes pidown-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  /* Overlay Button Container */
  .pidownloader-video-overlay {
    position: absolute;
    top: 12px;
    right: 12px;
    z-index: 2147483647; /* Ensure it's above player controls */
    pointer-events: auto;
    opacity: 0.8;
    transform: scale(0.95);
    transition: opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1), transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }

  /* Show when hovered, or when explicitly marked visible */
  .pidownloader-video-overlay.visible,
  .pidownloader-video-overlay:hover {
    opacity: 1;
    transform: scale(1);
  }

  .pidownloader-download-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 8px 14px;
    background: rgba(15, 20, 25, 0.75);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 9999px;
    color: #ffffff;
    font-size: 13px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    user-select: none;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    outline: none;
    line-height: 1;
  }

  .pidownloader-download-btn:hover {
    background: rgba(29, 155, 240, 0.85); /* Twitter blue with transparency */
    border-color: rgba(29, 155, 240, 0.5);
    transform: translateY(-1px);
    box-shadow: 0 6px 20px rgba(29, 155, 240, 0.4);
  }

  .pidownloader-download-btn:active {
    transform: translateY(1px);
  }

  /* Sniffing dot indicator */
  .pidownloader-sniff-dot {
    width: 6px;
    height: 6px;
    background-color: rgba(255, 255, 255, 0.4);
    border-radius: 50%;
    transition: background-color 0.3s ease;
  }

  .pidownloader-sniff-dot.has-streams {
    background-color: #00ba7c; /* Green dot when videos sniffed */
    animation: pidown-pulse 1.5s infinite;
  }

  /* Dropdown Menu */
  .pidownloader-dropdown-menu {
    position: absolute;
    z-index: 2147483647;
    width: 280px;
    background: rgba(15, 20, 25, 0.85);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 14px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    padding: 6px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    animation: pidown-fade-in 0.15s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  }

  .pidownloader-dropdown-header {
    font-size: 11px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.5);
    padding: 6px 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    margin-bottom: 4px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .pidownloader-dropdown-empty {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.6);
    padding: 16px;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }

  /* Scrollable dropdown list container */
  .pidownloader-dropdown-list {
    max-height: 260px;
    overflow-y: auto;
    overflow-x: hidden;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-right: 2px;
  }

  .pidownloader-dropdown-list::-webkit-scrollbar {
    width: 6px;
  }

  .pidownloader-dropdown-list::-webkit-scrollbar-track {
    background: transparent;
  }

  .pidownloader-dropdown-list::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.15);
    border-radius: 9999px;
  }

  .pidownloader-dropdown-list::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.3);
  }

  .pidownloader-dropdown-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 10px;
    color: rgba(255, 255, 255, 0.9);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: left;
    outline: none;
    width: 100%;
    box-sizing: border-box;
  }

  .pidownloader-dropdown-item:hover {
    background: rgba(255, 255, 255, 0.08);
    color: #ffffff;
  }

  .pidownloader-dropdown-item.current-video {
    border: 1px solid rgba(29, 155, 240, 0.2);
    background: rgba(29, 155, 240, 0.06);
  }

  .pidownloader-dropdown-item.current-video:hover {
    background: rgba(29, 155, 240, 0.14);
    border-color: rgba(29, 155, 240, 0.3);
  }

  .pidownloader-item-left {
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow: hidden;
    margin-right: 8px;
    align-items: flex-start;
  }

  .pidownloader-item-title {
    font-size: 12px;
    font-weight: 700;
    color: #ffffff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    width: 100%;
  }

  .pidownloader-item-subtitle {
    font-size: 10px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.4);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    width: 100%;
  }

  .pidownloader-item-badges {
    display: flex;
    gap: 4px;
    margin-top: 2px;
  }

  .pidownloader-item-badge {
    background: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.7);
    font-size: 9px;
    font-weight: 700;
    padding: 1px 4px;
    border-radius: 4px;
    text-transform: uppercase;
  }

  .pidownloader-item-badge.badge-success {
    background: rgba(0, 186, 124, 0.15);
    color: #00ba7c;
  }

  .pidownloader-item-badge.badge-hls {
    background: rgba(245, 158, 11, 0.15);
    color: #f59e0b;
  }

  .pidownloader-item-badge.badge-size {
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.75);
  }

  .pidownloader-item-right {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.05);
    color: rgba(255, 255, 255, 0.7);
    transition: all 0.2s ease;
  }

  .pidownloader-dropdown-item:hover .pidownloader-item-right {
    background: rgba(29, 155, 240, 0.2);
    color: #1d9bf0;
  }

  /* Status variants for clicked item */
  .pidownloader-dropdown-item.pushed {
    pointer-events: none;
    opacity: 0.8;
  }

  .pidownloader-dropdown-item.pushed .pidownloader-item-right {
    background: rgba(0, 186, 124, 0.15);
    color: #00ba7c;
  }

  .pidownloader-spinner {
    width: 12px;
    height: 12px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: currentColor;
    border-radius: 50%;
    animation: pidown-spin 0.6s linear infinite;
  }

  /* Preview Card */
  .pidownloader-preview-card {
    position: absolute;
    z-index: 2147483647;
    width: 280px;
    height: 157.5px; /* 16:9 ratio */
    background: rgba(15, 20, 25, 0.85);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 14px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none; /* Let clicks pass through */
    animation: pidown-fade-in 0.15s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  }

  .pidownloader-preview-media {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .pidownloader-preview-overlay {
    position: absolute;
    bottom: 8px;
    left: 8px;
    background: rgba(0, 0, 0, 0.6);
    color: #ffffff;
    font-size: 10px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 4px;
    text-transform: uppercase;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
`;

window.PiDownloaderStyles = {
  inject: function() {
    if (document.getElementById('pidownloader-styles')) return;
    const styleEl = document.createElement('style');
    styleEl.id = 'pidownloader-styles';
    styleEl.textContent = CSS_STYLES;
    document.head.appendChild(styleEl);
  }
};
