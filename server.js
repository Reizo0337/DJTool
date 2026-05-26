require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const WebSocket = require('ws');
const archiver = require('archiver');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── HEALTH ───────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true, uptime: process.uptime() }));

// ─── UTILS ────────────────────────────────────────────────────────────────────
const IS_WIN = process.platform === 'win32';

function findBin(name) {
  const local = path.join(__dirname, name + (IS_WIN ? '.exe' : ''));
  if (fs.existsSync(local)) return local;
  try { execSync((IS_WIN ? 'where' : 'which') + ' ' + name, { stdio: 'pipe' }); return name; } catch { }
  return name;
}

const YTDLP = findBin('yt-dlp');
const FFMPEG = findBin('ffmpeg');
console.log(`yt-dlp : ${YTDLP}`);
console.log(`ffmpeg : ${FFMPEG}`);

const YTDLP_BASE = [
  '--no-check-certificates',
  '--no-warnings',
  ...(FFMPEG !== 'ffmpeg' ? ['--ffmpeg-location', IS_WIN ? path.dirname(FFMPEG) : FFMPEG] : []),
];

const FORMATS = {
  mp3: { ext: 'mp3', codec: 'mp3', mime: 'audio/mpeg', postArgs: ['ffmpeg:-b:a 320k -ar 44100'] },
  wav: { ext: 'wav', codec: 'wav', mime: 'audio/wav', postArgs: [] },
  aiff: { ext: 'aiff', codec: 'aiff', mime: 'audio/aiff', postArgs: [] },
  flac: { ext: 'flac', codec: 'flac', mime: 'audio/flac', postArgs: [] },
};

function sanitize(str) {
  return String(str || 'track').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim().substring(0, 120);
}

// ─── PLATFORM DETECTION ───────────────────────────────────────────────────────
function detectPlatform(url) {
  if (/spotify\.com\/track/i.test(url)) return 'spotify-track';
  if (/spotify\.com\/playlist/i.test(url)) return 'spotify-playlist';
  if (/spotify\.com\/album/i.test(url)) return 'spotify-album';
  if (/youtube\.com\/playlist/i.test(url) || /youtu\.be.*list=/i.test(url)) return 'youtube-playlist';
  if (/youtube\.com|youtu\.be/i.test(url)) return 'youtube-track';
  if (/soundcloud\.com\/.*\/sets\//i.test(url)) return 'soundcloud-playlist';
  if (/soundcloud\.com/i.test(url)) return 'soundcloud-track';
  return 'generic';
}

// ─── SPOTIFY HELPERS ──────────────────────────────────────────────────────────

// oEmbed for single tracks (no auth)
function spotifyOembed(url) {
  return new Promise(resolve => {
    const oembed = `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`;
    https.get(oembed, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
    }).on('error', () => resolve(null));
  });
}

// Fetch Spotify embed page and extract tracklist from __NEXT_DATA__
function spotifyPlaylistTracks(playlistUrl) {
  return new Promise(resolve => {
    const match = playlistUrl.match(/spotify\.com\/(playlist|album)\/([a-zA-Z0-9]+)/);
    if (!match) return resolve([]);
    const type = match[1], id = match[2];
    const embedUrl = `https://open.spotify.com/embed/${type}/${id}?utm_source=oembed`;

    const req = https.get(embedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html',
      }
    }, res => {
      let html = '';
      res.on('data', c => html += c);
      res.on('end', () => {
        try {
          const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
          if (!m) return resolve([]);
          const data = JSON.parse(m[1]);
          // Navigate to tracks
          const entity = data?.props?.pageProps?.state?.data?.entity;
          const items = entity?.trackList || entity?.tracks?.items || [];
          const tracks = items.map(item => {
            const t = item?.track || item;
            const artists = (t?.artists || t?.subtitle || '').split
              ? (t.subtitle || '')
              : (t?.artists || []).map(a => a.name).join(', ');
            const title = t?.title || t?.name || item?.title || '';
            const artist = typeof artists === 'string' ? artists : (t?.artists || []).map(a => a.name).join(', ');
            const imgUrl = t?.albumOfTrack?.coverArt?.sources?.[0]?.url || t?.image || '';
            const uid = t?.trackDuration ? (t?.uri || '') : '';
            return { title, artist, thumbnail: imgUrl, searchQuery: `${artist} - ${title}`, uid };
          }).filter(t => t.title);
          resolve(tracks);
        } catch (e) {
          console.error('Spotify parse error:', e.message);
          resolve([]);
        }
      });
    });
    req.on('error', () => resolve([]));
    req.setTimeout(15000, () => { req.destroy(); resolve([]); });
  });
}

// ─── ROUTE: SINGLE TRACK INFO ─────────────────────────────────────────────────
app.post('/api/info', async (req, res) => {
  const { url } = req.body;
  if (!url?.trim()) return res.status(400).json({ error: 'URL requerida' });

  const kind = detectPlatform(url);

  if (kind === 'spotify-track') {
    const info = await spotifyOembed(url);
    if (!info) return res.status(500).json({ error: 'No se pudo obtener info de Spotify' });
    return res.json({
      title: info.title, uploader: 'Spotify', platform: 'Spotify',
      thumbnail: info.thumbnail_url, duration: null,
      isSpotify: true, searchQuery: info.title, originalUrl: url,
    });
  }

  const proc = spawn(YTDLP, [
    url, '--dump-json', '--no-playlist', '--skip-download', ...YTDLP_BASE,
  ]);
  let out = '', err = '';
  proc.stdout.on('data', d => out += d);
  proc.stderr.on('data', d => err += d);
  proc.on('close', code => {
    if (code !== 0) return res.status(500).json({ error: 'No se pudo obtener información', details: err.slice(0, 300) });
    try {
      // Find the first line that is valid JSON (ignores warnings printed to stdout)
      const lines = out.trim().split('\n');
      let info = null;
      for (const line of lines) {
        try { info = JSON.parse(line); break; } catch { }
      }
      if (!info) throw new Error('No JSON found');

      res.json({
        title: info.title, uploader: info.uploader || info.channel || '',
        platform: info.extractor_key || 'Unknown',
        thumbnail: info.thumbnail, duration: info.duration,
        isSpotify: false, originalUrl: url,
      });
    } catch { res.status(500).json({ error: 'Error al parsear la respuesta' }); }
  });
});

// ─── ROUTE: PLAYLIST INFO ─────────────────────────────────────────────────────
app.post('/api/playlist-info', async (req, res) => {
  const { url } = req.body;
  if (!url?.trim()) return res.status(400).json({ error: 'URL requerida' });

  const kind = detectPlatform(url);

  // ── Spotify playlist/album ─────────────────────────────────────────────────
  if (kind === 'spotify-playlist' || kind === 'spotify-album') {
    const tracks = await spotifyPlaylistTracks(url);
    if (tracks.length === 0) return res.status(500).json({ error: 'No se pudieron extraer tracks de Spotify. Asegúrate de que la playlist sea pública.' });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Send initial metadata
    res.write(`event: meta\ndata: ${JSON.stringify({ platform: 'Spotify', type: kind, total: tracks.length })}\n\n`);

    for (const track of tracks) {
      res.write(`data: ${JSON.stringify(track)}\n\n`);
    }
    res.write(`event: end\ndata: {}\n\n`);
    return res.end();
  }

  // ── YouTube / SoundCloud / generic playlists via yt-dlp ───────────────────
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  res.write(`event: meta\ndata: ${JSON.stringify({ platform: 'Detecting...', type: kind, total: '?' })}\n\n`);
  const proc = spawn(YTDLP, [
    url,
    '--flat-playlist',
    '--dump-json',
    '--yes-playlist',
    '--skip-download',
    ...YTDLP_BASE,
  ]);

  const tracks = [];
  let buf = '', err = '';

  let firstTrack = true;

  proc.stdout.on('data', d => {
    buf += d.toString();
    const lines = buf.split('\n');
    buf = lines.pop(); // keep incomplete last line
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const item = JSON.parse(line);
        const track = {
          title: item.title || item.id || 'Unknown',
          artist: item.uploader || item.channel || item.creator || '',
          thumbnail: item.thumbnail || (item.thumbnails?.[0]?.url) || '',
          url: item.url || item.webpage_url || url,
          duration: item.duration,
          platform: item.extractor_key || item.ie_key || 'Unknown',
          isSpotify: false,
        };
        tracks.push(track);
        if (firstTrack) {
          res.write(`event: meta\ndata: ${JSON.stringify({ platform: track.platform, type: kind, total: '?' })}\n\n`);
          firstTrack = false;
        }
        res.write(`data: ${JSON.stringify(track)}\n\n`);
      } catch { }
    }
  });
  proc.stderr.on('data', d => err += d);
  proc.on('close', code => {
    if (tracks.length === 0) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: 'No se encontraron tracks', details: err.slice(0, 300) })}\n\n`);
    }
    res.write(`event: end\ndata: {}\n\n`);
    res.end();
  });
});

// ─── ROUTE: AUDIO PREVIEW ─────────────────────────────────────────────────────
app.get('/api/preview', (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).send('URL requerida');

  const decoded = decodeURIComponent(url);
  const actualUrl = decoded.startsWith('SEARCH:') ? `ytsearch1:${decoded.slice(7)}` : decoded;

  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Transfer-Encoding', 'chunked');

  // Stream low quality audio for fast loading
  const args = [
    actualUrl, '-x', '--audio-format', 'mp3',
    '--audio-quality', '9', '-o', '-', '--no-playlist',
    ...YTDLP_BASE,
    '-f', 'worstaudio/worst'
  ];

  const proc = spawn(YTDLP, args);
  proc.stdout.pipe(res);
  proc.on('close', () => { try { res.end(); } catch { } });
  proc.on('error', () => { try { res.end(); } catch { } });
  req.on('close', () => { try { proc.kill('SIGKILL'); } catch { } });
});

// ─── ROUTE: STREAM DOWNLOAD ───────────────────────────────────────────────────
app.get('/api/stream', (req, res) => {
  const { url, format = 'mp3', title = 'track' } = req.query;
  if (!url) return res.status(400).send('URL requerida');

  const decoded = decodeURIComponent(url);
  const fmt = FORMATS[format] || FORMATS.mp3;
  const safe = sanitize(decodeURIComponent(title));

  // Spotify track → search YouTube
  const actualUrl = decoded.startsWith('SEARCH:')
    ? `ytsearch1:${decoded.slice(7)}`
    : decoded;

  res.setHeader('Content-Disposition', `attachment; filename="${safe}.${fmt.ext}"`);
  res.setHeader('Content-Type', fmt.mime);
  res.setHeader('Transfer-Encoding', 'chunked');

  const args = [
    actualUrl,
    '-x',
    '--audio-format', fmt.codec,
    '--audio-quality', '0',
    '-o', '-',
    '--no-playlist',
    ...YTDLP_BASE,
    // Best audio source selection
    '-f', 'bestaudio/best',
  ];

  // Force 320kbps + 44.1kHz for MP3
  if (fmt.postArgs.length) {
    args.push('--postprocessor-args', ...fmt.postArgs);
  }

  const proc = spawn(YTDLP, args);
  proc.stdout.pipe(res);
  proc.stderr.on('data', d => {
    const l = d.toString().trim();
    if (l && !l.startsWith('[download]')) console.log('[yt-dlp]', l);
  });
  proc.on('close', () => { try { res.end(); } catch { } });
  proc.on('error', e => { console.error(e); try { res.end(); } catch { } });
  req.on('close', () => { try { proc.kill('SIGKILL'); } catch { } });
});

// ─── ROUTE: BATCH INFO (multiple individual URLs) ─────────────────────────────
app.post('/api/batch-info', async (req, res) => {
  const { urls } = req.body;
  if (!Array.isArray(urls) || !urls.length) return res.status(400).json({ error: 'URLs requeridas' });

  const results = [];

  for (const url of urls.slice(0, 20)) {
    await new Promise(resolve => {
      if (detectPlatform(url) === 'spotify-track') {
        spotifyOembed(url).then(info => {
          results.push(info
            ? { url, title: info.title, platform: 'Spotify', thumbnail: info.thumbnail_url, isSpotify: true, searchQuery: info.title }
            : { url, error: 'No se pudo obtener info' });
          resolve();
        });
        return;
      }
      const proc = spawn(YTDLP, [url, '--dump-json', '--no-playlist', '--skip-download', ...YTDLP_BASE]);
      let out = '', err = '';
      proc.stdout.on('data', d => out += d);
      proc.stderr.on('data', d => err += d);
      proc.on('close', code => {
        if (code !== 0) { results.push({ url, error: 'No se pudo obtener info' }); resolve(); return; }
        try {
          const lines = out.trim().split('\n');
          let info = null;
          for (const line of lines) {
            try { info = JSON.parse(line); break; } catch { }
          }
          if (!info) throw new Error('No JSON found');
          results.push({ url, title: info.title, uploader: info.uploader || info.channel || '', platform: info.extractor_key || 'Unknown', thumbnail: info.thumbnail, duration: info.duration, isSpotify: false });
        } catch { results.push({ url, error: 'Error al parsear' }); }
        resolve();
      });
    });
  }

  res.json(results);
});

// ─── ROUTE: DOWNLOAD ZIP (Streaming) ──────────────────────────────────────────
app.post('/api/download-zip', (req, res) => {
  const { tracks, format = 'mp3' } = req.body;
  if (!Array.isArray(tracks) || tracks.length === 0) return res.status(400).json({ error: 'Tracks requeridos' });

  const fmt = FORMATS[format] || FORMATS.mp3;

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="DJDownloader_Batch.${fmt.ext}.zip"`);
  res.setHeader('Transfer-Encoding', 'chunked');

  const archive = archiver('zip', { zlib: { level: 0 } }); // No compression needed for audio
  archive.pipe(res);

  archive.on('error', err => {
    console.error('Archiver error:', err);
    try { res.end(); } catch { }
  });

  req.on('close', () => {
    archive.abort();
  });

  (async function processTracks() {
    let i = 1;
    const padding = String(tracks.length).length;
    for (const t of tracks) {
      if (req.closed) break;

      const safeTitle = sanitize(t.title);
      const filename = `${String(i).padStart(padding, '0')} - ${safeTitle}.${fmt.ext}`;
      const url = t.url;
      const actualUrl = url.startsWith('SEARCH:') ? `ytsearch1:${url.slice(7)}` : url;

      const args = [
        actualUrl, '-x', '--audio-format', fmt.codec, '--audio-quality', '0',
        '-o', '-', '--no-playlist', ...YTDLP_BASE, '-f', 'bestaudio/best'
      ];
      if (fmt.postArgs.length) args.push('--postprocessor-args', ...fmt.postArgs);

      await new Promise(resolve => {
        const proc = spawn(YTDLP, args);
        archive.append(proc.stdout, { name: filename });
        proc.on('close', () => resolve());
        proc.on('error', () => resolve());
      });
      i++;
    }
    archive.finalize();
  })();
});

// ─── START ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`\n🎧 DJDownloader → http://localhost:${PORT}\n`));
