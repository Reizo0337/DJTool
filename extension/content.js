// DJDownloader Companion — Content Script

(function() {
  let floatingBtn = null;
  let currentUrl = window.location.href;

  // Run DOM check regularly to handle SPA page updates and lazy loaded elements
  setInterval(() => {
    if (window.location.href !== currentUrl) {
      currentUrl = window.location.href;
      checkUrlAndUpdateWidget();
    }
    // Constantly attempt to inject native buttons if they were removed or lazy-loaded
    attemptNativeInjections();
  }, 1500);

  // Initial checks
  checkUrlAndUpdateWidget();
  attemptNativeInjections();

  // Listen for messages from popup to obtain currently playing track dynamically
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'get_playing_track') {
      const titleLink = document.querySelector('.playbackSoundBadge__titleLink');
      if (titleLink) {
        const path = titleLink.getAttribute('href');
        const trackUrl = window.location.origin + path;
        const titleText = titleLink.textContent.trim();
        const artistLink = document.querySelector('.playbackSoundBadge__lightLink');
        const artistText = artistLink ? artistLink.textContent.trim() : '';
        sendResponse({ success: true, url: trackUrl, title: titleText, artist: artistText });
      } else {
        sendResponse({ success: false });
      }
      return true; // Keep channel open for async response
    }
  });

  function checkUrlAndUpdateWidget() {
    const isSpotify = /spotify\.com\/track/i.test(currentUrl);
    const isYoutube = /youtube\.com\/watch|youtu\.be/i.test(currentUrl);
    const isSoundCloud = /soundcloud\.com\/[^\/]+\/[^\/]+/i.test(currentUrl) && !/soundcloud\.com\/.*\/sets\//i.test(currentUrl);

    // SoundCloud special: also show floating widget if something is currently playing in bottom player
    const soundcloudPlaying = /soundcloud\.com/i.test(currentUrl) && document.querySelector('.playbackSoundBadge__titleLink');

    if (isSpotify || isYoutube || isSoundCloud || soundcloudPlaying) {
      createFloatingWidget(isSpotify ? 'Spotify' : (isYoutube ? 'YouTube' : 'SoundCloud'));
    } else {
      removeFloatingWidget();
    }
  }

  /* ────────────────────────────────────────────────────────────────────────────
     NATIVE INLINE BUTTON INJECTIONS
     ──────────────────────────────────────────────────────────────────────────── */
  function attemptNativeInjections() {
    const isSpotify = /spotify\.com\/track/i.test(window.location.href);
    const isYoutube = /youtube\.com\/watch/i.test(window.location.href);
    const isSoundCloud = /soundcloud\.com/i.test(window.location.href);

    if (isYoutube) injectYoutubeButton();
    if (isSpotify) injectSpotifyButton();
    if (isSoundCloud) {
      // Injects on track page
      if (/soundcloud\.com\/[^\/]+\/[^\/]+/i.test(window.location.href) && !/soundcloud\.com\/.*\/sets\//i.test(window.location.href)) {
        injectSoundCloudButton();
      }
      // ALWAYS inject on the global bottom player
      injectSoundCloudBottomPlayerButton();
    }
  }

  // 1. YOUTUBE INJECTION
  function injectYoutubeButton() {
    if (document.getElementById('dj-dl-yt-native')) return;

    // Search for YouTube action row or owner channel container
    const anchor = document.querySelector('ytd-watch-metadata #owner') || 
                   document.querySelector('#owner') ||
                   document.querySelector('ytd-watch-metadata #subscribe-button') ||
                   document.querySelector('#top-row.ytd-video-primary-info-renderer');
    
    if (!anchor) return;

    const btn = document.createElement('button');
    btn.id = 'dj-dl-yt-native';
    btn.className = 'yt-spec-button-shape-next yt-spec-button-shape-next--filled';
    btn.style.cssText = `
      background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%) !important;
      color: #ffffff !important;
      border: none !important;
      border-radius: 18px !important;
      padding: 0 16px !important;
      height: 36px !important;
      font-size: 13px !important;
      font-weight: 600 !important;
      margin-left: 12px !important;
      cursor: pointer !important;
      display: inline-flex !important;
      align-items: center !important;
      gap: 6px !important;
      box-shadow: 0 4px 10px rgba(124, 58, 237, 0.3) !important;
      transition: transform 0.2s, box-shadow 0.2s !important;
      z-index: 1000 !important;
    `;

    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width: 15px; height: 15px;">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke-linecap="round"/>
        <polyline points="7 10 12 15 17 10" stroke-linecap="round" stroke-linejoin="round"/>
        <line x1="12" y1="15" x2="12" y2="3" stroke-linecap="round"/>
      </svg>
      Descargar DJ
    `;

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      triggerGenericDownload(window.location.href, btn);
    });

    const subscribeBtn = document.querySelector('ytd-watch-metadata #subscribe-button') || 
                         document.querySelector('#subscribe-button');

    if (subscribeBtn) {
      subscribeBtn.parentNode.insertBefore(btn, subscribeBtn.nextSibling);
    } else {
      anchor.parentNode.insertBefore(btn, anchor.nextSibling);
    }
  }

  // 2. SPOTIFY INJECTION
  function injectSpotifyButton() {
    if (document.getElementById('dj-dl-spotify-native')) return;

    // Search for Spotify action bar row (where Play, Like, and More options reside)
    const anchor = document.querySelector('[data-testid="action-bar-row"]');
    if (!anchor) return;

    const btn = document.createElement('button');
    btn.id = 'dj-dl-spotify-native';
    btn.style.cssText = `
      background: linear-gradient(135deg, #7c3aed 0%, #06b6d4 100%) !important;
      color: #ffffff !important;
      border: none !important;
      border-radius: 9999px !important;
      padding: 8px 18px !important;
      height: 38px !important;
      font-size: 13px !important;
      font-weight: 700 !important;
      margin-left: 16px !important;
      cursor: pointer !important;
      display: inline-flex !important;
      align-items: center !important;
      gap: 6px !important;
      box-shadow: 0 4px 12px rgba(124, 58, 237, 0.4) !important;
      transition: all 0.2s ease !important;
      text-transform: uppercase !important;
      letter-spacing: 0.04em !important;
    `;

    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width: 14px; height: 14px;">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke-linecap="round"/>
        <polyline points="7 10 12 15 17 10" stroke-linecap="round" stroke-linejoin="round"/>
        <line x1="12" y1="15" x2="12" y2="3" stroke-linecap="round"/>
      </svg>
      Descargar DJ
    `;

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      triggerGenericDownload(window.location.href, btn);
    });

    anchor.appendChild(btn);
  }

  // 3. SOUNDCLOUD TRACK PAGE INJECTION
  function injectSoundCloudButton() {
    if (document.getElementById('dj-dl-soundcloud-native')) return;

    // Search for SoundCloud action buttons group
    const anchor = document.querySelector('.listenEngagement__actions .sc-button-group') || 
                   document.querySelector('.soundActions .sc-button-group');
    if (!anchor) return;

    const btn = document.createElement('button');
    btn.id = 'dj-dl-soundcloud-native';
    btn.className = 'sc-button sc-button-medium sc-button-responsive';
    btn.style.cssText = `
      background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%) !important;
      color: #ffffff !important;
      border: 1px solid rgba(124, 58, 237, 0.5) !important;
      margin-left: 6px !important;
      display: inline-flex !important;
      align-items: center !important;
      gap: 5px !important;
      font-weight: 500 !important;
      cursor: pointer !important;
      border-radius: 3px !important;
    `;

    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width: 13px; height: 13px; display: inline-block;">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke-linecap="round"/>
        <polyline points="7 10 12 15 17 10" stroke-linecap="round" stroke-linejoin="round"/>
        <line x1="12" y1="15" x2="12" y2="3" stroke-linecap="round"/>
      </svg>
      Descargar (DJ)
    `;

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      triggerGenericDownload(window.location.href, btn);
    });

    anchor.appendChild(btn);
  }

  // 4. SOUNDCLOUD GLOBAL BOTTOM PLAYER INJECTION
  function injectSoundCloudBottomPlayerButton() {
    if (document.getElementById('dj-dl-soundcloud-bottom')) return;

    const anchor = document.querySelector('.playbackSoundBadge__actions');
    if (!anchor) return;

    const btn = document.createElement('button');
    btn.id = 'dj-dl-soundcloud-bottom';
    btn.title = 'Descargar tema actual con DJDownloader';
    btn.style.cssText = `
      background: none !important;
      border: none !important;
      margin-left: 6px !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      cursor: pointer !important;
      color: #a78bfa !important;
      transition: color 0.2s, transform 0.2s !important;
      padding: 0 4px !important;
    `;

    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width: 15px; height: 15px; display: inline-block;">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke-linecap="round"/>
        <polyline points="7 10 12 15 17 10" stroke-linecap="round" stroke-linejoin="round"/>
        <line x1="12" y1="15" x2="12" y2="3" stroke-linecap="round"/>
      </svg>
    `;

    btn.addEventListener('mouseenter', () => btn.style.color = '#22d3ee');
    btn.addEventListener('mouseleave', () => btn.style.color = '#a78bfa');

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const titleLink = document.querySelector('.playbackSoundBadge__titleLink');
      if (titleLink) {
        const path = titleLink.getAttribute('href');
        const trackUrl = window.location.origin + path;
        triggerGenericDownload(trackUrl, btn);
      }
    });

    anchor.appendChild(btn);
  }

  /* ────────────────────────────────────────────────────────────────────────────
     FLOATING CORNER WIDGET
     ──────────────────────────────────────────────────────────────────────────── */
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

    floatingBtn.addEventListener('click', () => {
      // In SoundCloud, if we are not on a track page, grab the bottom player URL dynamically
      const titleLink = document.querySelector('.playbackSoundBadge__titleLink');
      const soundcloudPlaying = /soundcloud\.com/i.test(window.location.href) && titleLink;
      
      let downloadUrl = window.location.href;
      if (soundcloudPlaying && !/soundcloud\.com\/[^\/]+\/[^\/]+/i.test(window.location.href)) {
        const path = titleLink.getAttribute('href');
        downloadUrl = window.location.origin + path;
      }

      triggerGenericDownload(downloadUrl, floatingBtn);
    });
  }

  function removeFloatingWidget() {
    if (floatingBtn) {
      floatingBtn.remove();
      floatingBtn = null;
    }
    const style = document.getElementById('dj-downloader-styles');
    if (style) style.remove();
  }

  /* ────────────────────────────────────────────────────────────────────────────
     CORE DOWNLOAD TRIGGER LOGIC
     ──────────────────────────────────────────────────────────────────────────── */
  function triggerGenericDownload(url, buttonElement) {
    // Prevent double clicking
    buttonElement.style.opacity = '0.6';
    buttonElement.style.pointerEvents = 'none';

    const isFloating = buttonElement.id === 'dj-downloader-floating-widget';
    let originalHtml = buttonElement.innerHTML;

    if (isFloating) {
      buttonElement.querySelector('.dj-widget-text').textContent = 'Obteniendo info...';
    } else if (buttonElement.id === 'dj-dl-soundcloud-bottom') {
      buttonElement.style.color = '#e11d48'; // loading color
    } else {
      buttonElement.textContent = 'Procesando...';
    }

    chrome.storage.local.get(['serverUrl', 'format'], async (items) => {
      const serverUrl = (items.serverUrl || 'http://localhost:3000').replace(/\/$/, '');
      const format = items.format || 'mp3';

      try {
        const infoRes = await fetch(`${serverUrl}/api/info`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url })
        });

        if (!infoRes.ok) throw new Error();

        const info = await infoRes.json();
        
        if (isFloating) {
          buttonElement.querySelector('.dj-widget-text').innerHTML = '¡Descargando track!';
        } else if (buttonElement.id === 'dj-dl-soundcloud-bottom') {
          buttonElement.style.color = '#10b981'; // success green
        } else {
          buttonElement.textContent = 'Descargando...';
        }

        const queryUrl = info.isSpotify ? `SEARCH:${info.searchQuery}` : url;
        const streamUrl = `${serverUrl}/api/stream?url=${encodeURIComponent(queryUrl)}&format=${format}&title=${encodeURIComponent(info.title)}`;

        chrome.runtime.sendMessage({
          action: 'download',
          url: streamUrl,
          filename: `${info.title}.${format}`
        }, (res) => {
          setTimeout(() => {
            buttonElement.innerHTML = originalHtml;
            buttonElement.style.opacity = '1';
            buttonElement.style.pointerEvents = 'auto';
            if (buttonElement.id === 'dj-dl-soundcloud-bottom') {
              buttonElement.style.color = '#a78bfa';
            }
          }, 3000);
        });

      } catch (err) {
        if (isFloating) {
          buttonElement.querySelector('.dj-widget-text').innerHTML = '<span style="color:#f43f5e">Servidor desconectado</span>';
        } else if (buttonElement.id === 'dj-dl-soundcloud-bottom') {
          buttonElement.style.color = '#f43f5e'; // error red
        } else {
          buttonElement.innerHTML = 'Error de conexión';
          buttonElement.style.background = '#f43f5e !important';
        }

        setTimeout(() => {
          buttonElement.innerHTML = originalHtml;
          buttonElement.style.opacity = '1';
          buttonElement.style.pointerEvents = 'auto';
          if (buttonElement.id === 'dj-dl-soundcloud-bottom') {
            buttonElement.style.color = '#a78bfa';
          } else if (!isFloating) {
            buttonElement.style.background = ''; // reset background
          }
        }, 3000);
      }
    });
  }
})();
