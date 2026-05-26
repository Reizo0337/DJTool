require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Ensure temp and downloads dirs exist
const TEMP_DIR = path.join(__dirname, 'temp');
const DOWNLOADS_DIR = path.join(__dirname, 'downloads');
[TEMP_DIR, DOWNLOADS_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

// WebSocket broadcast helper
const clients = new Map();
wss.on('connection', (ws) => {
  const id = Date.now() + Math.random();
  clients.set(id, ws);
  ws.on('close', () => clients.delete(id));
});

function broadcast(jobId, data) {
  clients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ jobId, ...data }));
    }
  });
}

// ─── UTILS ───────────────────────────────────────────────────────────────────

function findYtDlp() {
  const candidates = ['yt-dlp', 'yt-dlp.exe'];
  for (const c of candidates) {
    try {
      const result = require('child_process').execSync(`where ${c}`, { stdio: 'pipe' }).toString().trim();
      if (result) return c;
    } catch {}
  }
  return 'yt-dlp';
}

function findPython() {
  const candidates = ['python', 'python3', 'py'];
  for (const c of candidates) {
    try {
      const result = require('child_process').execSync(`${c} --version`, { stdio: 'pipe' }).toString();
      if (result.includes('Python')) return c;
    } catch {}
  }
  return 'python';
}

const YTDLP = findYtDlp();
const PYTHON = findPython();

function sanitizeFilename(str) {
  return str.replace(/[<>:"/\\|?*]/g, '_').substring(0, 100);
}

// ─── ROUTE: ANALYZE MIX ──────────────────────────────────────────────────────

app.post('/api/analyze', async (req, res) => {
  const { url, acrKey, acrSecret, acrHost, chunkSeconds = 20 } = req.body;

  if (!url) return res.status(400).json({ error: 'URL is required' });
  if (!acrKey || !acrSecret || !acrHost) {
    return res.status(400).json({ error: 'ACRCloud credentials required' });
  }

  const jobId = `job_${Date.now()}`;
  const audioFile = path.join(TEMP_DIR, `${jobId}.mp3`);

  // Respond immediately with jobId
  res.json({ jobId, message: 'Analysis started' });

  broadcast(jobId, { stage: 'downloading', progress: 0, message: 'Conectando con la fuente...' });

  // Step 1: Download audio with yt-dlp
  const ytArgs = [
    url,
    '-x',
    '--audio-format', 'mp3',
    '--audio-quality', '0',
    '-o', audioFile,
    '--no-playlist',
    '--progress',
    '--newline',
  ];

  const ytProcess = spawn(YTDLP, ytArgs, { env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });

  let downloadDone = false;

  ytProcess.stdout.on('data', (data) => {
    const line = data.toString();
    const match = line.match(/(\d+\.?\d*)%/);
    if (match) {
      const pct = parseFloat(match[1]);
      broadcast(jobId, { stage: 'downloading', progress: pct, message: `Descargando audio... ${pct.toFixed(0)}%` });
    }
  });

  ytProcess.stderr.on('data', (data) => {
    const line = data.toString();
    const match = line.match(/(\d+\.?\d*)%/);
    if (match) {
      const pct = parseFloat(match[1]);
      broadcast(jobId, { stage: 'downloading', progress: pct, message: `Descargando audio... ${pct.toFixed(0)}%` });
    }
  });

  ytProcess.on('close', (code) => {
    if (code !== 0) {
      broadcast(jobId, { stage: 'error', message: 'Error al descargar el audio. Verifica el enlace.' });
      return;
    }

    broadcast(jobId, { stage: 'analyzing', progress: 0, message: 'Analizando la sesión...' });

    // Step 2: Run Python analysis
    const pyScript = path.join(__dirname, 'analyze_mix.py');
    const pyArgs = [pyScript, audioFile, acrKey, acrSecret, acrHost, String(chunkSeconds)];

    const pyProcess = spawn(PYTHON, pyArgs, {
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1' }
    });

    let pyOutput = '';
    let pyError = '';

    pyProcess.stdout.on('data', (data) => {
      const text = data.toString();
      // Check for progress lines
      const lines = text.split('\n');
      lines.forEach(line => {
        if (line.startsWith('PROGRESS:')) {
          const parts = line.split(':');
          const pct = parseFloat(parts[1]) || 0;
          const msg = parts.slice(2).join(':').trim();
          broadcast(jobId, { stage: 'analyzing', progress: pct, message: msg });
        } else if (line.startsWith('RESULT:')) {
          pyOutput += line.replace('RESULT:', '');
        }
      });
    });

    pyProcess.stderr.on('data', (data) => {
      pyError += data.toString();
    });

    pyProcess.on('close', (pyCode) => {
      // Clean up temp file
      try { fs.unlinkSync(audioFile); } catch {}

      if (pyCode !== 0 || !pyOutput) {
        console.error('Python error:', pyError);
        broadcast(jobId, { stage: 'error', message: 'Error al analizar el audio. Verifica las credenciales de ACRCloud.' });
        return;
      }

      try {
        const tracks = JSON.parse(pyOutput);
        broadcast(jobId, { stage: 'done', tracks, message: `¡Listo! Se encontraron ${tracks.length} tracks.` });
      } catch (e) {
        broadcast(jobId, { stage: 'error', message: 'Error al parsear los resultados.' });
      }
    });
  });
});

// ─── ROUTE: DOWNLOAD TRACK ───────────────────────────────────────────────────

app.post('/api/download', async (req, res) => {
  const { url, format = 'best', title = 'track' } = req.body;

  if (!url) return res.status(400).json({ error: 'URL is required' });

  const jobId = `dl_${Date.now()}`;
  const safeName = sanitizeFilename(title);

  let ext, audioFormat, audioQuality;

  if (format === 'mp3') {
    ext = 'mp3'; audioFormat = 'mp3'; audioQuality = '0';
  } else if (format === 'wav') {
    ext = 'wav'; audioFormat = 'wav'; audioQuality = '0';
  } else {
    ext = 'opus'; audioFormat = 'best'; audioQuality = '0';
  }

  const outFile = path.join(DOWNLOADS_DIR, `${safeName}_${jobId}.${ext}`);

  res.json({ jobId, message: 'Download started' });

  const ytArgs = [
    url, '-x',
    '--audio-format', audioFormat,
    '--audio-quality', audioQuality,
    '-o', outFile,
    '--no-playlist',
    '--newline',
  ];

  const ytProcess = spawn(YTDLP, ytArgs);

  ytProcess.stdout.on('data', (data) => {
    const line = data.toString();
    const match = line.match(/(\d+\.?\d*)%/);
    if (match) {
      broadcast(jobId, { stage: 'downloading', progress: parseFloat(match[1]), filename: path.basename(outFile) });
    }
  });

  ytProcess.stderr.on('data', (data) => {
    const line = data.toString();
    const match = line.match(/(\d+\.?\d*)%/);
    if (match) {
      broadcast(jobId, { stage: 'downloading', progress: parseFloat(match[1]), filename: path.basename(outFile) });
    }
  });

  ytProcess.on('close', (code) => {
    if (code !== 0) {
      broadcast(jobId, { stage: 'error', message: 'Error al descargar el track.' });
      return;
    }
    broadcast(jobId, { stage: 'done', message: 'Descarga completada', filename: path.basename(outFile), path: outFile });
  });
});

// ─── ROUTE: GET TRACK INFO / PREVIEW URL ─────────────────────────────────────

app.post('/api/info', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  const ytArgs = [url, '--dump-json', '--no-playlist', '--skip-download'];
  const proc = spawn(YTDLP, ytArgs);
  let output = '';
  let errOut = '';

  proc.stdout.on('data', d => { output += d.toString(); });
  proc.stderr.on('data', d => { errOut += d.toString(); });

  proc.on('close', (code) => {
    if (code !== 0) return res.status(500).json({ error: 'Could not fetch info', details: errOut });
    try {
      const info = JSON.parse(output);
      res.json({
        title: info.title,
        uploader: info.uploader || info.channel,
        duration: info.duration,
        thumbnail: info.thumbnail,
        webpage_url: info.webpage_url,
        extractor: info.extractor,
        view_count: info.view_count,
        like_count: info.like_count,
        upload_date: info.upload_date,
        description: info.description ? info.description.substring(0, 500) : '',
      });
    } catch {
      res.status(500).json({ error: 'Parse error' });
    }
  });
});

// ─── ROUTE: STREAM PREVIEW ───────────────────────────────────────────────────

app.get('/api/stream-preview', (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).send('URL required');

  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Transfer-Encoding', 'chunked');

  const ytArgs = [url, '-x', '--audio-format', 'mp3', '--audio-quality', '5', '-o', '-', '--no-playlist', '--quiet'];
  const proc = spawn(YTDLP, ytArgs);

  proc.stdout.pipe(res);
  proc.stderr.on('data', () => {});
  proc.on('close', () => { try { res.end(); } catch {} });
  req.on('close', () => { proc.kill(); });
});

// ─── ROUTE: LIST DOWNLOADS ───────────────────────────────────────────────────

app.get('/api/downloads', (req, res) => {
  try {
    const files = fs.readdirSync(DOWNLOADS_DIR).map(f => {
      const fpath = path.join(DOWNLOADS_DIR, f);
      const stat = fs.statSync(fpath);
      return { name: f, size: stat.size, created: stat.birthtime };
    }).sort((a, b) => b.created - a.created);
    res.json(files);
  } catch {
    res.json([]);
  }
});

// ─── ROUTE: SERVE DOWNLOADED FILE ────────────────────────────────────────────

app.get('/api/file/:filename', (req, res) => {
  const filePath = path.join(DOWNLOADS_DIR, req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).send('Not found');
  res.download(filePath);
});

// ─── START ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🎧 DJTool Server running at http://localhost:${PORT}\n`);
});
