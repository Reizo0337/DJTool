/* ═══════════════════════════════════════
   DJDownloader — app.js
   ═══════════════════════════════════════ */

const API = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? `http://${window.location.hostname}:3000`
  : window.location.origin;

// ─── STATE ────────────────────────────────────────────────────────────────────
let currentInfo     = null;   // single track info
let batchItems      = [];     // [{title, artist, thumbnail, url, isSpotify, searchQuery, status}]
let isDownloading   = false;

// ─── FORMAT ───────────────────────────────────────────────────────────────────
function getFormat() { return document.querySelector('input[name="fmt"]:checked')?.value || 'mp3'; }

// ─── FORMAT PILL TOGGLE ───────────────────────────────────────────────────────
document.querySelectorAll('.fpill input').forEach(inp => {
  inp.addEventListener('change', () => {
    document.querySelectorAll('.fpill').forEach(p => p.classList.remove('active'));
    inp.closest('.fpill').classList.add('active');
  });
});

// ─── AUTO-RESIZE TEXTAREA ─────────────────────────────────────────────────────
const urlInput = document.getElementById('url-input');
urlInput.addEventListener('input', () => {
  urlInput.style.height = 'auto';
  urlInput.style.height = Math.min(urlInput.scrollHeight, 140) + 'px';
});
urlInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSearch(); }
});

// ─── PLATFORM DETECTION (client-side) ─────────────────────────────────────────
function isPlaylistUrl(url) {
  return (
    /youtube\.com\/playlist/i.test(url) ||
    /[?&]list=/i.test(url) ||
    /soundcloud\.com\/.*\/sets\//i.test(url) ||
    /spotify\.com\/(playlist|album)\//i.test(url)
  );
}

function isSpotifyUrl(url) { return /spotify\.com/i.test(url); }

function getPlatformLabel(url) {
  if (/youtube\.com|youtu\.be/i.test(url)) return 'YouTube';
  if (/spotify\.com/i.test(url))           return 'Spotify';
  if (/soundcloud\.com/i.test(url))        return 'SoundCloud';
  if (/bandcamp\.com/i.test(url))          return 'Bandcamp';
  if (/mixcloud\.com/i.test(url))          return 'Mixcloud';
  return 'Web';
}

// ─── MAIN SEARCH HANDLER ──────────────────────────────────────────────────────
async function handleSearch() {
  const raw  = urlInput.value.trim();
  if (!raw) return;

  // Split by newlines or spaces to support multi-URL paste
  const urls = raw.split(/[\n]+/).map(u => u.trim()).filter(u => u.length > 5);
  if (urls.length === 0) return;

  setBtnLoading(true);

  // Detect if any URL is a playlist
  if (urls.length === 1 && isPlaylistUrl(urls[0])) {
    await handlePlaylist(urls[0]);
  } else if (urls.length === 1) {
    await handleSingle(urls[0]);
  } else {
    // Multiple URLs → batch info
    await handleMultipleUrls(urls);
  }

  setBtnLoading(false);
}

// ─── SINGLE TRACK ─────────────────────────────────────────────────────────────
async function handleSingle(url) {
  hideSections();
  try {
    const resp = await fetch(`${API}/api/info`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const info = await resp.json();
    if (info.error) throw new Error(info.error);
    currentInfo = info;
    showSinglePreview(info);
  } catch (e) {
    showToast('❌ ' + e.message, 'err');
  }
}

function showSinglePreview(info) {
  document.getElementById('preview-title').textContent   = info.title || '—';
  document.getElementById('preview-artist').textContent  = info.uploader || '';
  document.getElementById('preview-platform').textContent = info.platform || getPlatformLabel(info.originalUrl || '');
  document.getElementById('preview-duration').textContent = info.duration ? fmtTime(info.duration) : '';

  const img  = document.getElementById('preview-thumb');
  const ph   = document.getElementById('preview-thumb-placeholder');
  if (info.thumbnail) {
    img.src = info.thumbnail;
    img.classList.remove('hidden');
    ph.classList.add('hidden');
  } else {
    img.classList.add('hidden');
    ph.classList.remove('hidden');
  }

  document.getElementById('preview-section').classList.remove('hidden');
  document.getElementById('dl-progress').classList.add('hidden');
  document.getElementById('dl-progress-fill').style.width = '0%';
  document.getElementById('dl-btn').disabled = false;
  resetDlBtn();
}

// ─── PLAYLIST (Streaming) ───────────────────────────────────────────────────────
async function handlePlaylist(url) {
  hideSections();
  showToast('🔍 Buscando playlist...', '');
  
  // Clear batch list initially
  batchItems = [];
  document.getElementById('batch-list').innerHTML = '';
  document.getElementById('batch-count').textContent = '0 seleccionados';
  document.getElementById('batch-section').classList.remove('hidden');

  try {
    const resp = await fetch(`${API}/api/playlist-info`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    
    if (!resp.ok) throw new Error('Error al conectar');
    
    const reader = resp.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop();
      
      for (const p of parts) {
        if (p.startsWith('event: end')) {
           showToast(`✅ ${batchItems.length} tracks cargados`, 'ok');
           return;
        }
        if (p.startsWith('event: meta')) {
           const meta = JSON.parse(p.substring(12));
           showToast(`Cargando playlist: ${meta.platform}`, '');
        }
        if (p.startsWith('event: error')) {
           const err = JSON.parse(p.substring(13));
           showToast(`❌ ${err.error}`, 'err');
           return;
        }
        if (p.startsWith('data: ')) {
           const t = JSON.parse(p.substring(6));
           const item = {
             title:       t.title || 'Unknown',
             artist:      t.artist || t.uploader || '',
             thumbnail:   t.thumbnail || '',
             url:         t.url || url,
             isSpotify:   t.isSpotify || isSpotifyUrl(t.url || url),
             searchQuery: t.searchQuery || `${t.artist || ''} ${t.title || ''}`.trim(),
             duration:    t.duration,
             status:      'pending',
             checked:     true,
           };
           batchItems.push(item);
           appendBatchItem(item, batchItems.length - 1);
        }
      }
    }
  } catch (e) {
    showToast('❌ ' + e.message, 'err');
  }
}

// ─── AUDIO PREVIEW ────────────────────────────────────────────────────────────
let previewAudio = new Audio();
let currentPlayingIdx = -1;

function togglePreview(idx) {
  const item = batchItems[idx];
  if (!item) return;
  
  if (currentPlayingIdx === idx && !previewAudio.paused) {
    // Pause
    previewAudio.pause();
    updatePlayBtn(idx, false);
    return;
  }
  
  // Pause any existing
  if (currentPlayingIdx !== -1) {
    updatePlayBtn(currentPlayingIdx, false);
  }
  
  let streamUrl = '';
  if (item.isSpotify || isSpotifyUrl(item.url)) {
    streamUrl = `${API}/api/preview?url=${encodeURIComponent('SEARCH:' + item.searchQuery)}`;
  } else {
    streamUrl = `${API}/api/preview?url=${encodeURIComponent(item.url)}`;
  }
  
  previewAudio.src = streamUrl;
  previewAudio.play().catch(() => showToast('Error al reproducir audio', 'err'));
  currentPlayingIdx = idx;
  updatePlayBtn(idx, true);
}

previewAudio.onended = () => {
  if (currentPlayingIdx !== -1) updatePlayBtn(currentPlayingIdx, false);
  currentPlayingIdx = -1;
};

function updatePlayBtn(idx, isPlaying) {
  const el = document.getElementById(`play-btn-${idx}`);
  if (!el) return;
  if (isPlaying) {
    el.innerHTML = `<svg viewBox="0 0 24 24" fill="none"><rect x="6" y="4" width="4" height="16" fill="currentColor"/><rect x="14" y="4" width="4" height="16" fill="currentColor"/></svg>`;
    el.classList.add('playing');
  } else {
    el.innerHTML = `<svg viewBox="0 0 24 24" fill="none"><path d="M5 3l14 9-14 9v-18z" fill="currentColor"/></svg>`;
    el.classList.remove('playing');
  }
}

// ─── MULTIPLE URLS ────────────────────────────────────────────────────────────
async function handleMultipleUrls(urls) {
  hideSections();
  showToast(`🔍 Buscando ${urls.length} tracks...`, '');

  try {
    const resp = await fetch(`${API}/api/batch-info`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls })
    });
    const data = await resp.json();

    batchItems = data.map(item => ({
      title:       item.title || item.url || 'Unknown',
      artist:      item.uploader || item.platform || '',
      thumbnail:   item.thumbnail || '',
      url:         item.url,
      isSpotify:   item.isSpotify || isSpotifyUrl(item.url || ''),
      searchQuery: item.searchQuery || item.title || '',
      duration:    item.duration,
      status:      item.error ? 'error' : 'pending',
      checked:     !item.error,
    }));

    showBatch(`${urls.length} tracks`);
    showToast(`✅ ${batchItems.length} tracks listos`, 'ok');
  } catch (e) {
    showToast('❌ ' + e.message, 'err');
  }
}

// ─── RENDER BATCH ─────────────────────────────────────────────────────────────
function showBatch(label) {
  document.getElementById('batch-section').classList.remove('hidden');
  renderBatch();
}

function renderBatch() {
  const list = document.getElementById('batch-list');
  list.innerHTML = '';
  const checked = batchItems.filter(i => i.checked).length;
  document.getElementById('batch-count').textContent = `${checked} / ${batchItems.length} seleccionados`;

  batchItems.forEach((item, idx) => {
    appendBatchItem(item, idx);
  });
}

function appendBatchItem(item, idx) {
  const list = document.getElementById('batch-list');
  const div = document.createElement('div');
  div.className = `batch-item ${item.status}`;
  div.id = `batch-item-${idx}`;

  const thumbHtml = item.thumbnail
    ? `<img class="batch-thumb" src="${escHtml(item.thumbnail)}" alt="" onerror="this.style.display='none'">`
    : `<div class="batch-thumb-placeholder">♪</div>`;

  const statusText = { pending: '—', active: '⏬ Descargando', done: '✓ Listo', error: '✕ Error' }[item.status] || '—';
  const dur = item.duration ? fmtTime(item.duration) : '';

  div.innerHTML = `
    <input type="checkbox" class="batch-check" ${item.checked ? 'checked' : ''} onchange="toggleCheck(${idx}, this.checked)" />
    <div class="thumb-wrapper">
       ${thumbHtml}
       <button class="play-overlay" id="play-btn-${idx}" onclick="togglePreview(${idx})" title="Escuchar preview">
          <svg viewBox="0 0 24 24" fill="none"><path d="M5 3l14 9-14 9v-18z" fill="currentColor"/></svg>
       </button>
    </div>
    <div class="batch-info">
      <div class="batch-title-text">${escHtml(item.title)}</div>
      ${item.artist ? `<div class="batch-artist-text">${escHtml(item.artist)}</div>` : ''}
      ${dur ? `<div class="batch-duration">${dur}</div>` : ''}
    </div>
    <div style="display:flex;align-items:center;gap:8px">
      <span class="batch-status ${item.status}">${statusText}</span>
      ${item.status !== 'active' ? `
      <button class="batch-dl-btn" title="Descargar este track" onclick="downloadOne(${idx})">
        <svg viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><polyline points="7 10 12 15 17 10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </button>` : ''}
    </div>
  `;
  list.appendChild(div);
  
  // Update count dynamically
  const checked = batchItems.filter(i => i.checked).length;
  document.getElementById('batch-count').textContent = `${checked} seleccionados`;
}

function toggleCheck(idx, val) {
  batchItems[idx].checked = val;
  const checked = batchItems.filter(i => i.checked).length;
  document.getElementById('batch-count').textContent = `${checked} / ${batchItems.length} seleccionados`;
}

// ─── DOWNLOAD SINGLE ──────────────────────────────────────────────────────────
function downloadSingle() {
  if (!currentInfo) return;
  const fmt    = getFormat();
  const dlUrl  = buildStreamUrl(currentInfo, fmt);
  const title  = currentInfo.title || 'track';

  triggerDownload(dlUrl, title + '.' + fmt);

  // Progress animation
  document.getElementById('dl-progress').classList.remove('hidden');
  animateProgress('dl-progress-fill', 'dl-progress-msg', title);
}

// ─── DOWNLOAD ONE FROM BATCH ──────────────────────────────────────────────────
function downloadOne(idx) {
  const item = batchItems[idx];
  if (!item) return;
  const fmt   = getFormat();
  const dlUrl = buildStreamUrl(item, fmt);
  triggerDownload(dlUrl, item.title + '.' + fmt);
  setBatchStatus(idx, 'active');
  setTimeout(() => setBatchStatus(idx, 'done'), 3500);
}

// ─── DOWNLOAD ALL (ZIP Streaming) ─────────────────────────────────────────────
async function downloadAllZip() {
  const selected = batchItems.filter(i => i.checked && i.status !== 'done');
  if (!selected.length) { showToast('No hay tracks seleccionados', 'err'); return; }
  
  const fmt = getFormat();
  const tracksPayload = selected.map(item => {
    return {
      title: item.title,
      url: item.isSpotify ? `SEARCH:${item.searchQuery}` : item.url
    };
  });
  
  showToast(`⬇️ Solicitando ZIP de ${selected.length} tracks...`, 'ok');
  
  // We must trigger this as a standard form submit so the browser handles the ZIP stream natively
  // without us having to buffer it in memory using fetch.
  
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = `${API}/api/download-zip`;
  form.style.display = 'none';
  
  const inputTracks = document.createElement('input');
  inputTracks.type = 'hidden';
  inputTracks.name = 'tracks';
  inputTracks.value = JSON.stringify(tracksPayload);
  form.appendChild(inputTracks);
  
  const inputFormat = document.createElement('input');
  inputFormat.type = 'hidden';
  inputFormat.name = 'format';
  inputFormat.value = fmt;
  form.appendChild(inputFormat);
  
  document.body.appendChild(form);
  form.submit();
  document.body.removeChild(form);
  
  showToast('✅ ZIP generándose... empezará a descargar pronto', 'ok');
  
  // Mark all as active/done for UI purposes
  batchItems.forEach((item, idx) => {
    if (item.checked && item.status !== 'done') {
      setBatchStatus(idx, 'done');
    }
  });
}

function clearBatch() {
  batchItems = [];
  document.getElementById('batch-section').classList.add('hidden');
  document.getElementById('batch-list').innerHTML = '';
}

function setBatchStatus(idx, status) {
  batchItems[idx].status = status;
  // Re-render just this item
  const el = document.getElementById(`batch-item-${idx}`);
  if (el) {
    el.className = `batch-item ${status}`;
    const statusEl = el.querySelector('.batch-status');
    if (statusEl) {
      statusEl.className = `batch-status ${status}`;
      statusEl.textContent = { pending: '—', active: '⏬ Descargando', done: '✓ Listo', error: '✕ Error' }[status] || '—';
    }
  }
}

// ─── STREAM URL BUILDER ───────────────────────────────────────────────────────
function buildStreamUrl(info, fmt) {
  let dlUrl;
  if (info.isSpotify || (info.searchQuery && isSpotifyUrl(info.originalUrl || info.url || ''))) {
    dlUrl = `SEARCH:${info.searchQuery || info.title}`;
  } else {
    dlUrl = info.originalUrl || info.url || '';
  }
  return `${API}/api/stream?url=${encodeURIComponent(dlUrl)}&format=${fmt}&title=${encodeURIComponent(info.title || 'track')}`;
}

// ─── TRIGGER BROWSER DOWNLOAD ─────────────────────────────────────────────────
function triggerDownload(href, filename) {
  const a = document.createElement('a');
  a.href     = href;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => document.body.removeChild(a), 100);
}

// ─── PROGRESS ANIMATION (single) ─────────────────────────────────────────────
function animateProgress(fillId, msgId, title) {
  const fill = document.getElementById(fillId);
  const msg  = document.getElementById(msgId);
  if (!fill || !msg) return;

  fill.style.width = '0%';
  msg.textContent  = `Descargando ${title}...`;
  document.getElementById('dl-btn').disabled = true;

  let pct = 0;
  const iv = setInterval(() => {
    pct = Math.min(pct + Math.random() * 9, 92);
    fill.style.width = pct + '%';
  }, 600);

  setTimeout(() => {
    clearInterval(iv);
    fill.style.width = '100%';
    msg.textContent  = '✅ Descarga iniciada en tu navegador';
    setTimeout(() => resetDlBtn(), 3000);
  }, 4200);
}

function resetDlBtn() {
  const btn = document.getElementById('dl-btn');
  if (!btn) return;
  btn.disabled = false;
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><polyline points="7 10 12 15 17 10" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>
    Descargar`;
}

// ─── UI HELPERS ───────────────────────────────────────────────────────────────
function hideSections() {
  document.getElementById('preview-section').classList.add('hidden');
  document.getElementById('batch-section').classList.add('hidden');
}

function setBtnLoading(loading) {
  const btn = document.getElementById('search-btn');
  if (loading) {
    btn.classList.add('loading');
    btn.innerHTML = `<svg class="spin" viewBox="0 0 24 24" fill="none"><path d="M21 12a9 9 0 1 1-6.22-8.56" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>`;
  } else {
    btn.classList.remove('loading');
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="2.5"/><path d="m21 21-4.35-4.35" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>`;
  }
}

let toastTimer;
function showToast(msg, type) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className   = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
}

function fmtTime(s) {
  if (!s) return '';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
    : `${m}:${String(sec).padStart(2,'0')}`;
}

function escHtml(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── SERVER STATUS ────────────────────────────────────────────────────────────
async function checkStatus() {
  try {
    const r = await fetch(`${API}/health`);
    const ok = r.ok;
    const pill = document.getElementById('status-pill');
    const txt  = document.getElementById('status-text');
    pill.classList.toggle('offline', !ok);
    txt.textContent = ok ? 'En línea' : 'Desconectado';
  } catch {
    document.getElementById('status-pill').classList.add('offline');
    document.getElementById('status-text').textContent = 'Desconectado';
  }
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
checkStatus();
setInterval(checkStatus, 30000);

// Paste detection — auto-search if pasting a URL
urlInput.addEventListener('paste', () => {
  setTimeout(() => {
    const val = urlInput.value.trim();
    if (val.startsWith('http')) handleSearch();
  }, 100);
});
