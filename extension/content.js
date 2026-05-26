// DJDownloader Companion — Content Script

(function() {
  let floatingBtn = null;
  let currentUrl = window.location.href;

  // Run URL check regularly since single-page apps (SPAs) like YouTube/Spotify don't full reload
  setInterval(() => {
    if (window.location.href !== currentUrl) {
      currentUrl = window.location.href;
      checkUrlAndUpdateWidget();
    }
  }, 1000);

  // Initial check
  checkUrlAndUpdateWidget();

  function checkUrlAndUpdateWidget() {
    const isSpotify = /spotify\.com\/track/i.test(currentUrl);
    const isYoutube = /youtube\.com\/watch|youtu\.be/i.test(currentUrl);
    const isSoundCloud = /soundcloud\.com\/[^\/]+\/[^\/]+/i.test(currentUrl) && !/soundcloud\.com\/.*\/sets\//i.test(currentUrl);

    if (isSpotify || isYoutube || isSoundCloud) {
      createFloatingWidget(isSpotify ? 'Spotify' : (isYoutube ? 'YouTube' : 'SoundCloud'));
    } else {
      removeFloatingWidget();
    }
  }

  function createFloatingWidget(platform) {
    if (floatingBtn) return; // Already exists

    floatingBtn = document.createElement('div');
    floatingBtn.id = 'dj-downloader-floating-widget';
    
    // Style block
    const style = document.createElement('style');
    style.id = 'dj-downloader-styles';
    style.textContent = `
      #dj-downloader-floating-widget {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 999999;
        display: flex;
        align-items: center;
        background: rgba(6, 6, 15, 0.9);
        border: 1px solid rgba(124, 58, 237, 0.4);
        border-radius: 999px;
        padding: 6px 12px 6px 6px;
        color: #f1f0ff;
        font-family: system-ui, -apple-system, sans-serif;
        box-shadow: 0 8px 32px rgba(124, 58, 237, 0.35);
        cursor: pointer;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        user-select: none;
        backdrop-filter: blur(12px);
      }
      #dj-downloader-floating-widget:hover {
        transform: translateY(-4px) scale(1.02);
        box-shadow: 0 12px 40px rgba(124, 58, 237, 0.5);
        border-color: rgba(34, 211, 238, 0.5);
      }
      #dj-downloader-floating-widget:active {
        transform: translateY(0) scale(0.98);
      }
      .dj-widget-icon {
        width: 32px;
        height: 32px;
        background: linear-gradient(135deg, #7c3aed 0%, #06b6d4 100%);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #fff;
        font-weight: 800;
        font-size: 13px;
        flex-shrink: 0;
        box-shadow: 0 0 10px rgba(124, 58, 237, 0.4);
      }
      .dj-widget-text {
        font-size: 13px;
        font-weight: 600;
        margin-left: 10px;
        white-space: nowrap;
        letter-spacing: -0.01em;
      }
      .dj-widget-text span {
        color: #a78bfa;
      }
    `;
    
    floatingBtn.innerHTML = `
      <div class="dj-widget-icon">DJ</div>
      <div class="dj-widget-text">Descargar con <span>DJDownloader</span></div>
    `;

    document.head.appendChild(style);
    document.body.appendChild(floatingBtn);

    floatingBtn.addEventListener('click', triggerQuickDownload);
  }

  function removeFloatingWidget() {
    if (floatingBtn) {
      floatingBtn.remove();
      floatingBtn = null;
    }
    const style = document.getElementById('dj-downloader-styles');
    if (style) style.remove();
  }

  // Action on widget click
  function triggerQuickDownload() {
    floatingBtn.style.opacity = '0.7';
    floatingBtn.style.pointerEvents = 'none';
    const textEl = floatingBtn.querySelector('.dj-widget-text');
    const originalText = textEl.innerHTML;
    textEl.innerHTML = 'Obteniendo info...';

    chrome.storage.local.get(['serverUrl', 'format'], async (items) => {
      const serverUrl = (items.serverUrl || 'http://localhost:3000').replace(/\/$/, '');
      const format = items.format || 'mp3';

      try {
        const infoRes = await fetch(`${serverUrl}/api/info`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: currentUrl })
        });

        if (!infoRes.ok) throw new Error();

        const info = await infoRes.json();
        textEl.innerHTML = '¡Descargando!';

        const queryUrl = info.isSpotify ? `SEARCH:${info.searchQuery}` : currentUrl;
        const streamUrl = `${serverUrl}/api/stream?url=${encodeURIComponent(queryUrl)}&format=${format}&title=${encodeURIComponent(info.title)}`;

        chrome.runtime.sendMessage({
          action: 'download',
          url: streamUrl,
          filename: `${info.title}.${format}`
        }, (res) => {
          setTimeout(() => {
            textEl.innerHTML = originalText;
            floatingBtn.style.opacity = '1';
            floatingBtn.style.pointerEvents = 'auto';
          }, 3000);
        });

      } catch (err) {
        textEl.innerHTML = '<span style="color:#f43f5e">Servidor desconectado</span>';
        setTimeout(() => {
          textEl.innerHTML = originalText;
          floatingBtn.style.opacity = '1';
          floatingBtn.style.pointerEvents = 'auto';
        }, 3000);
      }
    });
  }
})();
