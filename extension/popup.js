// DJDownloader Companion — Popup Script

let activeTrack = null;
let currentServerUrl = 'http://localhost:3000';
let preferredFormat = 'mp3';

document.addEventListener('DOMContentLoaded', async () => {
  // Load saved preferences
  chrome.storage.local.get(['serverUrl', 'format'], (items) => {
    if (items.serverUrl) {
      currentServerUrl = items.serverUrl.replace(/\/$/, '');
      document.getElementById('server-url').value = currentServerUrl;
    }
    if (items.format) {
      preferredFormat = items.format;
      const radio = document.querySelector(`input[name="ext-fmt"][value="${preferredFormat}"]`);
      if (radio) radio.checked = true;
    }
    // Check connection with server
    checkServerConnection();
    // Detect active tab
    detectActiveTab();
  });

  // Event Listeners
  document.getElementById('settings-toggle').addEventListener('click', toggleViews);
  document.getElementById('save-settings').addEventListener('click', saveSettings);
  document.getElementById('dl-btn').addEventListener('click', startDownload);

  // Auto-save format preference when changed
  document.querySelectorAll('input[name="ext-fmt"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      preferredFormat = e.target.value;
      chrome.storage.local.set({ format: preferredFormat });
    });
  });
});

// Toggle between main and settings views
function toggleViews() {
  const mainView = document.getElementById('main-view');
  const settingsView = document.getElementById('settings-view');
  const btn = document.getElementById('settings-toggle');

  if (mainView.classList.contains('hidden')) {
    mainView.classList.remove('hidden');
    settingsView.classList.add('hidden');
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
    `;
    detectActiveTab(); // Refresh detection
  } else {
    mainView.classList.add('hidden');
    settingsView.classList.remove('hidden');
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    `;
    checkServerConnection();
  }
}

// Check server health
async function checkServerConnection() {
  const dot = document.getElementById('server-status-dot');
  const text = document.getElementById('server-status-text');

  dot.className = 'status-dot';
  text.textContent = 'Comprobando conexión...';

  try {
    const res = await fetch(`${currentServerUrl}/health`);
    const data = await res.json();
    if (data.ok) {
      dot.classList.add('online');
      text.textContent = 'Servidor en línea y listo';
      return true;
    }
  } catch (err) {
    dot.className = 'status-dot';
    text.textContent = 'Servidor desconectado';
  }
  return false;
}

// Save options to storage
async function saveSettings() {
  const urlInput = document.getElementById('server-url').value.trim();
  if (!urlInput) {
    showToast('Por favor, ingresa una URL válida', 'err');
    return;
  }

  currentServerUrl = urlInput.replace(/\/$/, '');
  chrome.storage.local.set({ serverUrl: currentServerUrl });
  
  const connected = await checkServerConnection();
  if (connected) {
    showToast('Ajustes guardados correctamente', 'ok');
    setTimeout(toggleViews, 800);
  } else {
    showToast('Guardado, pero no se pudo conectar al servidor.', 'err');
  }
}

// Detect URL of active tab
function detectActiveTab() {
  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    if (!tabs || tabs.length === 0) return;
    const tab = tabs[0];
    const url = tab.url;

    if (!url) {
      showUndetected();
      return;
    }

    // Try to ask the content script first if there is a playing track (useful for SoundCloud feed/stream)
    try {
      chrome.tabs.sendMessage(tab.id, { action: 'get_playing_track' }, (response) => {
        if (response && response.success && response.url) {
          showLoadingDetection(response.url, 'SoundCloud (Reproduciendo)');
          fetchTrackInfo(response.url);
        } else {
          // Fallback to standard URL matching
          runUrlDetection(url);
        }
      });
    } catch (e) {
      runUrlDetection(url);
    }
  });
}

function runUrlDetection(url) {
  const isSpotify = /spotify\.com\/track/i.test(url);
  const isYoutube = /youtube\.com\/watch|youtu\.be/i.test(url);
  const isSoundCloud = /soundcloud\.com\/[^\/]+\/[^\/]+/i.test(url) && !/soundcloud\.com\/.*\/sets\//i.test(url);

  if (isSpotify || isYoutube || isSoundCloud) {
    showLoadingDetection(url, isSpotify ? 'Spotify' : (isYoutube ? 'YouTube' : 'SoundCloud'));
    fetchTrackInfo(url);
  } else {
    showUndetected();
  }
}

function showUndetected() {
  document.getElementById('detect-status').textContent = 'Buscando enlace...';
  document.getElementById('platform-badge').style.display = 'none';
  document.getElementById('detect-title').textContent = 'Abre una canción en Spotify, YouTube o SoundCloud';
  document.getElementById('detect-url').textContent = 'Ningún enlace compatible detectado.';
  document.getElementById('dl-btn').disabled = true;
  activeTrack = null;
}

function showLoadingDetection(url, platform) {
  document.getElementById('detect-status').textContent = 'Enlace detectado';
  const badge = document.getElementById('platform-badge');
  badge.textContent = platform;
  badge.style.display = 'inline-flex';
  document.getElementById('detect-title').textContent = 'Cargando información del track...';
  document.getElementById('detect-url').textContent = url;
  document.getElementById('dl-btn').disabled = true;
}

// Fetch track metadata from DJDownloader server
async function fetchTrackInfo(url) {
  try {
    const res = await fetch(`${currentServerUrl}/api/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    
    if (!res.ok) throw new Error('Servidor no responde');
    
    const info = await res.json();
    activeTrack = {
      url: url,
      title: info.title,
      uploader: info.uploader || '',
      isSpotify: info.isSpotify,
      searchQuery: info.searchQuery || ''
    };

    document.getElementById('detect-title').textContent = info.title;
    document.getElementById('detect-url').textContent = info.uploader || 'DJDownloader';
    document.getElementById('dl-btn').disabled = false;
  } catch (err) {
    document.getElementById('detect-title').textContent = 'Error al obtener información';
    document.getElementById('detect-url').textContent = 'Verifica que el servidor esté activo en Ajustes.';
    document.getElementById('dl-btn').disabled = true;
    activeTrack = null;
  }
}

// Start download via browser's native download manager
function startDownload() {
  if (!activeTrack) return;

  const dlBtn = document.getElementById('dl-btn');
  const btnText = document.getElementById('dl-btn-text');
  const progressWrap = document.getElementById('progress-wrap');
  const progressFill = document.getElementById('progress-fill');
  const progressMsg = document.getElementById('progress-msg');

  dlBtn.disabled = true;
  btnText.textContent = 'Descargando...';
  progressWrap.style.display = 'block';
  progressFill.style.width = '0%';
  progressMsg.textContent = 'Enviando petición de descarga al servidor...';

  // Build the streaming API URL
  const queryUrl = activeTrack.isSpotify 
    ? `SEARCH:${activeTrack.searchQuery}` 
    : activeTrack.url;
  
  const downloadUrl = `${currentServerUrl}/api/stream?url=${encodeURIComponent(queryUrl)}&format=${preferredFormat}&title=${encodeURIComponent(activeTrack.title)}`;

  // Simulating animation states for direct download stream
  let pct = 0;
  const interval = setInterval(() => {
    if (pct < 90) {
      pct += Math.random() * 15;
      if (pct > 90) pct = 90;
      progressFill.style.width = `${pct}%`;
      progressMsg.textContent = `Descargando y convirtiendo track (${Math.floor(pct)}%)...`;
    }
  }, 400);

  // Trigger Chrome Download
  chrome.runtime.sendMessage({
    action: 'download',
    url: downloadUrl,
    filename: `${activeTrack.title}.${preferredFormat}`
  }, (response) => {
    clearInterval(interval);
    if (response && response.success) {
      progressFill.style.width = '100%';
      progressMsg.textContent = '¡Completado! Revisa tus descargas.';
      showToast('¡Descarga iniciada con éxito!', 'ok');
      setTimeout(() => {
        progressWrap.style.display = 'none';
        dlBtn.disabled = false;
        btnText.textContent = 'Descargar Track';
      }, 3000);
    } else {
      progressFill.style.width = '0%';
      progressMsg.textContent = 'Fallo en la descarga.';
      showToast(response?.error || 'Error al iniciar descarga', 'err');
      dlBtn.disabled = false;
      btnText.textContent = 'Descargar Track';
    }
  });
}

// Show custom toast message
function showToast(msg, type = 'ok') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast show ${type}`;
  setTimeout(() => {
    t.className = 'toast';
  }, 2500);
}
