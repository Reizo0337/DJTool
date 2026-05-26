# DJTool 🎧

Una herramienta para DJs: detecta tracks en sesiones de YouTube/SoundCloud y descarga música a máxima calidad.

## Características

- 🔍 **Modo Detectar**: Analiza sesiones de DJ completas y detecta todos los tracks con timestamps
- 📥 **Modo Descargar**: Descarga cualquier track a máxima calidad (Original / MP3 / WAV)
- 🎵 **Preview**: Escucha un preview antes de descargar
- 📚 **Biblioteca**: Historial de todas tus descargas
- ⚡ **Tiempo real**: Progreso en vivo via WebSockets

## Requisitos

- [Node.js](https://nodejs.org) 18+
- [Python](https://python.org) 3.8+
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) — `pip install yt-dlp`
- [ffmpeg](https://ffmpeg.org/download.html) — en el PATH del sistema
- Cuenta en [ACRCloud](https://console.acrcloud.com) (14 días gratis)

## Instalación

```bash
git clone https://github.com/Reizo0337/DJTool.git
cd DJTool
npm install
```

## Uso

```bash
node server.js
```

Abre `http://localhost:3000` en tu navegador.

## Configuración ACRCloud

1. Crea cuenta en [console.acrcloud.com](https://console.acrcloud.com)
2. Crea un proyecto de tipo "Audio & Video Recognition"
3. Conecta el bucket "ACRCloud Music"
4. Copia tu **Host**, **Access Key** y **Access Secret**
5. En la app, ve a **Ajustes** y pega las credenciales

## Stack

- Backend: Node.js + Express + WebSockets
- Frontend: HTML + Vanilla CSS + JavaScript
- Audio: yt-dlp + ffmpeg + Python (ACRCloud API)
