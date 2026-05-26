/* ═══════════════════════════════════════════════
   DJTool — app.js
   Frontend logic: WebSocket, API calls, UI state
   ══════════════════════════════════════════════ */

// Auto-detect API URL: in production the frontend is served from the same server
const API = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? `http://${window.location.hostname}:3000`
  : window.location.origin;

// WebSocket URL
const WS_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? `ws://${window.location.hostname}:3000`
  : `wss://${window.location.host}`;

let ws = null;
let wsReady = false;
let currentJobId = null;
let currentTrackUrl = null;
let previewPlaying = false;
let detectedTracks = [];

// ─── SETTINGS ─────────────────────────────────────────────────────────────────

function loadSettings() {
  return {
    acrHost:   localStorage.getItem('acr_host')    || '',
    acrKey:    localStorage.getItem('acr_key')     || '',
    acrSecret: localStorage.getItem('acr_secret')  || '',
    chunkSec:  localStorage.getItem('chunk_sec')   || '20',
  };
}

function saveSettings() {
  const host   = document.getElementById('acr-host').value.trim();
  const key    = document.getElementById('acr-key').value.trim();
  const secret = document.getElementById('acr-secret').value.trim();
  const chunk  = document.getElementById('chunk-seconds').value.trim();

  localStorage.setItem('acr_host',   host);
  localStorage.setItem('acr_key',    key);
  localStorage.setItem('acr_secret', secret);
  localStorage.setItem('chunk_sec',  chunk);

  showToast('✅ Ajustes guardados', 'success');
}

function populateSettings() {
  const s = loadSettings();
  document.getElementById('acr-host').value    = s.acrHost;
  document.getElementById('acr-key').value     = s.acrKey;
  document.getElementById('acr-secret').value  = s.acrSecret;
  document.getElementById('chunk-seconds').value = s.chunkSec;
}

function toggleSecret() {
  const inp = document.getElementById('acr-secret');
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

async function testConnection() {
  const s = loadSettings();
  const btn = document.getElementById('test-btn');
  const result = document.getElementById('test-result');
  result.className = 'test-result'; result.classList.remove('hidden');
  result.textContent = '⏳ Probando conexión...';
  btn.disabled = true;

  try {
    // We send a tiny fake audio request — ACRCloud returns "no result" but confirms connection
    const response = await fetch(`${API}/api/test-acr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acrHost: s.acrHost, acrKey: s.acrKey, acrSecret: s.acrSecret }),
    });
    const data = await response.json();
    if (data.ok) {
      result.className = 'test-result success';
      result.textContent = '✅ Conexión exitosa con ACRCloud';
    } else {
      result.className = 'test-result error';
      result.textContent = `❌ Error: ${data.error || 'Credenciales inválidas'}`;
    }
  } catch (err) {
    result.className = 'test-result error';
    result.textContent = '❌ No se pudo conectar al servidor. ¿Está iniciado?';
  }
  btn.disabled = false;
}

// ─── MODE SWITCHING ────────────────────────────────────────────────────────────

function switchMode(mode) {
  document.querySelectorAll('.mode-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`mode-${mode}`).classList.add('active');
  document.getElementById(`nav-${mode}`).classList.add('active');
  if (mode === 'download') refreshDownloads();
}

// ─── WEBSOCKET ─────────────────────────────────────────────────────────────────

function connectWS() {
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    wsReady = true;
    setStatusDot(true);
  };

  ws.onclose = () => {
    wsReady = false;
    setStatusDot(false);
    setTimeout(connectWS, 3000);
  };

  ws.onerror = () => {
    wsReady = false;
    setStatusDot(false);
  };

  ws.onmessage = (evt) => {
    try {
      const msg = JSON.parse(evt.data);
      handleWSMessage(msg);
    } catch {}
  };
}

function setStatusDot(connected) {
  const dot = document.getElementById('status-dot');
  dot.style.background = connected ? 'var(--success)' : 'var(--error)';
  dot.style.boxShadow = connected ? '0 0 8px var(--success)' : '0 0 8px var(--error)';
  dot.title = connected ? 'Servidor conectado' : 'Servidor desconectado';
}

function handleWSMessage(msg) {
  if (msg.jobId && msg.jobId.startsWith('dl_')) {
    handleDownloadProgress(msg);
    return;
  }

  if (!currentJobId || msg.jobId !== currentJobId) return;

  const progressBar = document.getElementById('progress-bar');
  const progressMsg = document.getElementById('progress-msg');

  if (msg.stage === 'downloading') {
    setStage('downloading');
    progressBar.style.width = `${msg.progress * 0.5}%`; // first 50%
    progressMsg.textContent = msg.message;

  } else if (msg.stage === 'analyzing') {
    setStage('analyzing');
    progressBar.style.width = `${50 + msg.progress * 0.5}%`; // 50-100%
    progressMsg.textContent = msg.message;

  } else if (msg.stage === 'done') {
    setStage('done');
    progressBar.style.width = '100%';
    progressMsg.textContent = msg.message;
    detectedTracks = msg.tracks || [];
    showResults(detectedTracks);
    document.getElementById('waveform-anim').style.animationPlayState = 'paused';
    document.querySelectorAll('.wave-bar').forEach(b => b.style.animation = 'none');

  } else if (msg.stage === 'error') {
    setStage('error');
    progressMsg.textContent = `❌ ${msg.message}`;
    document.getElementById('detect-btn').disabled = false;
    showToast(`❌ ${msg.message}`, 'error');
  }
}

function setStage(name) {
  const stages = ['downloading', 'analyzing', 'done'];
  const idx = stages.indexOf(name);
  stages.forEach((s, i) => {
    const el = document.getElementById(`stage-${s}`);
    if (!el) return;
    el.classList.remove('active', 'done');
    if (name === 'error') { el.classList.add(''); }
    else if (i < idx) el.classList.add('done');
    else if (i === idx) el.classList.add('active');
  });
}

// ─── ANALYZE ──────────────────────────────────────────────────────────────────

async function startAnalysis() {
  const url = document.getElementById('detect-url').value.trim();
  if (!url) { showToast('Introduce un enlace válido', 'error'); return; }

  const s = loadSettings();
  if (!s.acrHost || !s.acrKey || !s.acrSecret) {
    showToast('Configura las credenciales de ACRCloud en Ajustes', 'error');
    switchMode('settings');
    return;
  }

  // Reset UI
  document.getElementById('detect-results').classList.add('hidden');
  document.getElementById('detect-progress').classList.remove('hidden');
  document.getElementById('detect-btn').disabled = true;
  document.getElementById('tracks-grid').innerHTML = '';
  document.querySelectorAll('.wave-bar').forEach(b => b.style.animation = '');
  setStage('downloading');
  document.getElementById('progress-bar').style.width = '0%';
  document.getElementById('progress-msg').textContent = 'Conectando...';

  try {
    const resp = await fetch(`${API}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        acrKey:    s.acrKey,
        acrSecret: s.acrSecret,
        acrHost:   s.acrHost,
        chunkSeconds: parseInt(s.chunkSec),
      }),
    });
    const data = await resp.json();
    if (data.jobId) {
      currentJobId = data.jobId;
    } else {
      throw new Error(data.error || 'Error desconocido');
    }
  } catch (err) {
    document.getElementById('detect-btn').disabled = false;
    document.getElementById('detect-progress').classList.add('hidden');
    showToast(`❌ ${err.message}`, 'error');
  }
}

// ─── RESULTS ──────────────────────────────────────────────────────────────────

function showResults(tracks) {
  const grid = document.getElementById('tracks-grid');
  const results = document.getElementById('detect-results');
  const count = document.getElementById('results-count');
  
  count.textContent = `${tracks.length} Track${tracks.length !== 1 ? 's' : ''} Detectado${tracks.length !== 1 ? 's' : ''}`;
  
  if (tracks.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="padding:40px">
      <p>No se detectaron tracks. Prueba con un fragmento más largo o verifica tus credenciales.</p>
    </div>`;
  } else {
    grid.innerHTML = '';
    tracks.forEach((t, i) => {
      const card = createTrackCard(t, i + 1);
      grid.appendChild(card);
    });
  }

  results.classList.remove('hidden');
  document.getElementById('detect-btn').disabled = false;
}

function createTrackCard(track, num) {
  const card = document.createElement('div');
  card.className = 'track-card';
  card.style.animationDelay = `${(num - 1) * 0.05}s`;

  const spotifyBtn = track.spotify_url
    ? `<button class="track-action-btn spotify" title="Abrir en Spotify" onclick="window.open('${track.spotify_url}','_blank')">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424c-.18.295-.563.387-.857.207-2.35-1.434-5.305-1.76-8.786-.963-.335.077-.67-.133-.746-.47-.077-.334.132-.67.47-.745 3.808-.87 7.076-.496 9.712 1.115.293.18.386.563.207.856zm1.223-2.723c-.226.367-.706.482-1.072.257-2.687-1.652-6.785-2.13-9.965-1.166-.413.127-.848-.106-.973-.517-.125-.413.108-.848.52-.972 3.632-1.102 8.147-.568 11.233 1.329.366.226.48.707.257 1.072v-.003zm.105-2.835C14.692 8.95 9.375 8.775 6.297 9.71c-.493.15-1.016-.13-1.166-.624-.148-.495.13-1.017.625-1.166 3.532-1.073 9.404-.866 13.115 1.337.444.264.590.838.327 1.282-.264.443-.838.59-1.284.327z"/></svg>
      </button>` : '';

  const label = track.label ? `· ${track.label}` : '';
  const year  = track.release_date ? `· ${track.release_date.substring(0,4)}` : '';

  card.innerHTML = `
    <div class="track-num">${String(num).padStart(2,'0')}</div>
    <div class="track-info">
      <div class="track-timestamp">⏱ ${track.timestamp}</div>
      <div class="track-name">${escHtml(track.title)}</div>
      <div class="track-artist">${escHtml(track.artist)}</div>
      ${label || year ? `<div class="track-meta">${escHtml(label)} ${escHtml(year)}</div>` : ''}
    </div>
    <div class="track-actions">
      ${spotifyBtn}
      <button class="track-action-btn" title="Copiar nombre" onclick="copyTrack('${escHtml(track.artist)} - ${escHtml(track.title)}')">
        <svg viewBox="0 0 24 24" fill="none"><rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="currentColor" stroke-width="2"/></svg>
      </button>
    </div>
  `;
  return card;
}

function copyTrack(text) {
  navigator.clipboard.writeText(text).then(() => showToast(`📋 Copiado: ${text}`, 'success'));
}

function copyTracklist() {
  const text = detectedTracks.map((t, i) => `${String(i+1).padStart(2,'0')}. [${t.timestamp}] ${t.artist} - ${t.title}`).join('\n');
  navigator.clipboard.writeText(text).then(() => showToast('📋 Tracklist copiada al portapapeles', 'success'));
}

function exportTracklist() {
  if (!detectedTracks.length) return;
  const text = detectedTracks.map((t, i) => `${String(i+1).padStart(2,'0')}. [${t.timestamp}] ${t.artist} - ${t.title}`).join('\n');
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'tracklist.txt';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('📄 Tracklist exportada', 'success');
}

// ─── DOWNLOAD MODE ─────────────────────────────────────────────────────────────

async function fetchTrackInfo() {
  const url = document.getElementById('download-url').value.trim();
  if (!url) { showToast('Introduce un enlace válido', 'error'); return; }

  const btn = document.getElementById('info-btn');
  btn.disabled = true;
  btn.querySelector('.btn-text').textContent = 'Buscando...';
  document.getElementById('track-preview-card').classList.add('hidden');

  try {
    const resp = await fetch(`${API}/api/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const info = await resp.json();
    if (info.error) throw new Error(info.error);

    currentTrackUrl = url;
    showTrackPreview(info, url);
  } catch (err) {
    showToast(`❌ ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.querySelector('.btn-text').textContent = 'Buscar';
  }
}

function showTrackPreview(info, url) {
  document.getElementById('preview-title').textContent   = info.title || '—';
  document.getElementById('preview-artist').textContent  = info.uploader || '—';
  document.getElementById('preview-platform').textContent = info.extractor || 'YouTube';
  document.getElementById('preview-duration').textContent = info.duration ? formatDuration(info.duration) : '—';
  document.getElementById('preview-views').textContent   = info.view_count ? `${formatNum(info.view_count)} vistas` : '';

  const img = document.getElementById('preview-img');
  if (info.thumbnail) {
    img.src = info.thumbnail;
    img.classList.remove('hidden');
  } else {
    img.classList.add('hidden');
  }

  document.getElementById('track-preview-card').classList.remove('hidden');
  document.getElementById('dl-progress').classList.add('hidden');
  document.getElementById('dl-progress-bar').style.width = '0%';
  document.getElementById('download-btn').disabled = false;
}

async function downloadTrack() {
  if (!currentTrackUrl) { showToast('Primero busca un track', 'error'); return; }

  const format = document.querySelector('input[name="format"]:checked').value;
  const title  = document.getElementById('preview-title').textContent || 'track';
  const btn    = document.getElementById('download-btn');

  // Use streaming download endpoint — works in both local and cloud
  const streamUrl = `${API}/api/download-stream?url=${encodeURIComponent(currentTrackUrl)}&format=${format}&title=${encodeURIComponent(title)}`;

  btn.disabled = true;
  btn.innerHTML = `<svg class="spin" viewBox="0 0 24 24" fill="none"><path d="M21 12a9 9 0 1 1-6.219-8.56" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg> Preparando...`;

  document.getElementById('dl-progress').classList.remove('hidden');
  document.getElementById('dl-progress-bar').style.width = '30%';
  document.getElementById('dl-progress-msg').textContent = 'Descargando... (el archivo llegará a tu carpeta de descargas)';

  // Trigger browser download via hidden link
  const a = document.createElement('a');
  a.href = streamUrl;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  // Simulate progress (streaming doesn't give progress events)
  let pct = 30;
  const interval = setInterval(() => {
    pct = Math.min(pct + Math.random() * 8, 95);
    document.getElementById('dl-progress-bar').style.width = `${pct}%`;
  }, 800);

  // Complete after a reasonable time
  setTimeout(() => {
    clearInterval(interval);
    document.getElementById('dl-progress-bar').style.width = '100%';
    document.getElementById('dl-progress-msg').textContent = '✅ Descarga iniciada en tu navegador';
    showToast('✅ Descarga iniciada', 'success');
    resetDownloadBtn();
  }, 4000);
}

let currentDownloadJobId = null;

function handleDownloadProgress(msg) {
  if (msg.jobId !== currentDownloadJobId) return;

  const bar = document.getElementById('dl-progress-bar');
  const msg2 = document.getElementById('dl-progress-msg');

  if (msg.stage === 'downloading') {
    bar.style.width = `${msg.progress}%`;
    msg2.textContent = `Descargando... ${msg.progress.toFixed(0)}%`;

  } else if (msg.stage === 'done') {
    bar.style.width = '100%';
    msg2.textContent = `✅ ¡Descarga completada! → ${msg.filename}`;
    showToast('✅ Descarga completada', 'success');
    resetDownloadBtn();
    refreshDownloads();

  } else if (msg.stage === 'error') {
    msg2.textContent = `❌ ${msg.message}`;
    showToast(`❌ ${msg.message}`, 'error');
    resetDownloadBtn();
  }
}

function resetDownloadBtn() {
  const btn = document.getElementById('download-btn');
  btn.disabled = false;
  btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><polyline points="7 10 12 15 17 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg> Descargar`;
}

// ─── PREVIEW ──────────────────────────────────────────────────────────────────

function togglePreview() {
  const audio  = document.getElementById('preview-audio');
  const icon   = document.getElementById('play-btn-icon');
  const url    = currentTrackUrl;

  if (!url) return;

  if (previewPlaying) {
    audio.pause();
    previewPlaying = false;
    icon.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
  } else {
    if (!audio.src || !audio.src.includes('stream-preview')) {
      audio.src = `${API}/api/stream-preview?url=${encodeURIComponent(url)}`;
    }
    audio.play().catch(() => showToast('No se pudo cargar el preview', 'error'));
    previewPlaying = true;
    icon.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
  }
}

// ─── DOWNLOADS LIBRARY ────────────────────────────────────────────────────────

async function refreshDownloads() {
  try {
    const resp = await fetch(`${API}/api/downloads`);
    const files = await resp.json();
    renderDownloads(files);
  } catch {}
}

function renderDownloads(files) {
  const list = document.getElementById('downloads-list');
  if (!files.length) {
    list.innerHTML = `<div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" stroke-width="1.5"/><polyline points="7 10 12 15 17 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      <p>Aún no hay descargas</p>
    </div>`;
    return;
  }
  list.innerHTML = '';
  files.forEach(f => {
    const ext = f.name.split('.').pop().toUpperCase();
    const icon = ext === 'MP3' ? '🎵' : ext === 'WAV' ? '🎚️' : '⚡';
    const div = document.createElement('div');
    div.className = 'download-item';
    div.innerHTML = `
      <div class="dl-icon">${icon}</div>
      <div class="dl-name" title="${escHtml(f.name)}">${escHtml(f.name)}</div>
      <div class="dl-size">${formatBytes(f.size)}</div>
      <button class="dl-open" onclick="window.open('${API}/api/file/${encodeURIComponent(f.name)}','_blank')">Abrir</button>
    `;
    list.appendChild(div);
  });
}

// ─── ACR TEST ENDPOINT (add to server) ────────────────────────────────────────

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function showToast(msg, type = '') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast ${type}`;
  toast.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toast.classList.remove('show'), 3500);
}

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function formatDuration(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}

function formatNum(n) {
  if (!n) return '';
  if (n >= 1e6) return `${(n/1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n/1e3).toFixed(1)}K`;
  return String(n);
}

function formatBytes(b) {
  if (b >= 1e9) return `${(b/1e9).toFixed(1)} GB`;
  if (b >= 1e6) return `${(b/1e6).toFixed(1)} MB`;
  if (b >= 1e3) return `${(b/1e3).toFixed(1)} KB`;
  return `${b} B`;
}

// Spinning animation for loading button
const style = document.createElement('style');
style.textContent = `.spin { animation: spin 1s linear infinite; width:18px; height:18px; }
@keyframes spin { to { transform: rotate(360deg); } }`;
document.head.appendChild(style);

// ─── INIT ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  populateSettings();
  connectWS();
  refreshDownloads();

  // Enter key support
  document.getElementById('detect-url').addEventListener('keydown', e => {
    if (e.key === 'Enter') startAnalysis();
  });
  document.getElementById('download-url').addEventListener('keydown', e => {
    if (e.key === 'Enter') fetchTrackInfo();
  });
});
