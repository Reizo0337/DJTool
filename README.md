# DJDownloader 🎧

> Descarga música de YouTube, Spotify, SoundCloud y +1000 plataformas más.<br/>
> MP3 320kbps · WAV · AIFF · FLAC — 100% compatible con Rekordbox y Serato.

![Platform](https://img.shields.io/badge/platforms-YouTube%20·%20Spotify%20·%20SoundCloud-blueviolet)
![Format](https://img.shields.io/badge/formats-MP3%20320k%20·%20WAV%20·%20AIFF%20·%20FLAC-informational)
![License](https://img.shields.io/badge/license-MIT-green)

---

## ✨ Características

- 🔗 **Multi-plataforma** — YouTube, Spotify, SoundCloud, Bandcamp, Mixcloud y +1000 más
- 📋 **Playlists completas** — descarga listas enteras de YouTube, Spotify y SoundCloud
- 🎵 **MP3 320kbps por defecto** — máxima calidad compatible con cualquier equipo DJ
- 🎚️ **Formatos DJ** — MP3, WAV, AIFF, FLAC (todos compatibles con Rekordbox y Serato)
- ⚡ **Descarga directa** — streaming al navegador, sin almacenamiento en servidor
- 📱 **Responsive** — funciona en móvil y tablet

## 🚀 Instalación local

### Requisitos
- [Node.js](https://nodejs.org) 18+
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) — `pip install yt-dlp`
- [ffmpeg](https://ffmpeg.org) — en el PATH del sistema

```bash
git clone https://github.com/Reizo0337/DJTool.git
cd DJTool
npm install
node server.js
```

Abre `http://localhost:3000` 🎉

## ☁️ Hosting gratuito 24/7 en Render

1. Crea cuenta en **[render.com](https://render.com)** (gratis)
2. **New Web Service** → conecta `Reizo0337/DJTool`
3. Runtime: **Docker** · Plan: **Free**
4. Deploy — espera ~8 minutos el primer build
5. Abre **[uptimerobot.com](https://uptimerobot.com)** → monitor HTTP → URL: `https://tu-app.onrender.com/health` → cada 5 min

✅ App siempre activa, deploy automático en cada `git push`.

## 📖 Uso

### Track individual
Pega cualquier enlace de YouTube, Spotify, SoundCloud, etc. → la app detecta la plataforma → elige formato → descarga.

### Playlist completa
Pega el enlace de una playlist/álbum:
- **YouTube**: `https://youtube.com/playlist?list=...`
- **Spotify**: `https://open.spotify.com/playlist/...` o `.../album/...`
- **SoundCloud**: `https://soundcloud.com/artista/sets/nombre`

La app carga todos los tracks, puedes seleccionar cuáles quieres y descargar individualmente o todos de golpe.

### Múltiples URLs
Pega varias URLs (una por línea) en el input y pulsa Enter para procesarlas como batch.

## 🎛️ Formatos

| Formato | Calidad | Rekordbox | Serato |
|---------|---------|-----------|--------|
| MP3 320kbps | ★★★★ | ✅ | ✅ |
| WAV | ★★★★★ | ✅ | ✅ |
| AIFF | ★★★★★ | ✅ | ✅ |
| FLAC | ★★★★★ | ✅ | ✅ |

## 🛠️ Stack

| Capa | Tecnología |
|------|-----------|
| Backend | Node.js + Express |
| Frontend | HTML + Vanilla CSS + JavaScript |
| Descarga | yt-dlp + ffmpeg |
| Contenedor | Docker |
| Hosting | Render.com (free tier) |

## ⚠️ Aviso legal

Esta herramienta es para uso personal. Respeta los términos de servicio de cada plataforma y los derechos de autor de los artistas. Usa esto solo con música que tengas derecho a descargar.
