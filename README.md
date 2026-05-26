# DJDownloader 🎧

> Descarga música de YouTube, Spotify, SoundCloud y +1000 plataformas más.<br/>
> MP3 320kbps · WAV · AIFF · FLAC — 100% compatible con Rekordbox y Serato.

![Platform](https://img.shields.io/badge/platforms-YouTube%20·%20Spotify%20·%20SoundCloud-blueviolet)
![Format](https://img.shields.io/badge/formats-MP3%20320k%20·%20WAV%20·%20AIFF%20·%20FLAC-informational)
![License](https://img.shields.io/badge/license-MIT-green)
![Extension](https://img.shields.io/badge/extension-Manifest%20V3-cyan)

---

## ✨ Características

- 🔗 **Multi-plataforma** — YouTube, Spotify, SoundCloud, Bandcamp, Mixcloud y +1000 más
- 📋 **Playlists completas** — descarga listas enteras de YouTube, Spotify y SoundCloud
- 🎵 **MP3 320kbps por defecto** — máxima calidad compatible con cualquier equipo DJ
- 🎚️ **Formatos DJ** — MP3, WAV, AIFF, FLAC (todos compatibles con Rekordbox y Serato)
- ⚡ **Descarga directa** — streaming al navegador, sin almacenamiento temporal en disco del servidor
- 📦 **Descargas en lote en ZIP** — descarga múltiples tracks seleccionados en un único archivo ZIP comprimido al vuelo
- 🔊 **Previsualización de Audio** — escucha un fragmento rápido (low-quality stream) de los temas antes de descargarlos
- 🧩 **Extensión de Navegador** — descarga con un solo clic con integración nativa en tus webs preferidas
- 📱 **Responsive** — funciona en móvil y tablet

---

## 🧩 Extensión de Navegador (Companion Extension)

Hemos desarrollado una extensión de navegador moderna basada en **Manifest V3** que te permite descargar música directamente desde las páginas originales de reproducción.

### 🌟 Características de la Extensión
1. **Inyección Nativa de Botones**: Añade un botón oficial de `Descargar DJ` directamente en las interfaces oficiales de:
   - **YouTube** (al lado del botón de suscribirse y acciones del canal).
   - **Spotify** (dentro del menú de acciones principales de la pista).
   - **SoundCloud** (como un botón de interacción más junto a "Me gusta" y "Compartir").
2. **Widget Flotante**: Un discreto y elegante widget flotante en la esquina inferior derecha como control universal para tracks elegibles.
3. **Popup Premium**: Panel de control interactivo con el mismo diseño glassmorphic de la app web, para seleccionar tu formato preferido (MP3, WAV, AIFF, FLAC).
4. **Configuración Dinámica**: Guarda la dirección de tu servidor preferido (local `localhost:3000` o tu servidor en Render) y sincronízalo.

### 🚀 Guía de Instalación de la Extensión
1. Abre tu navegador (Chrome, Brave, Edge, Opera, Vivaldi, etc.) y dirígete al gestor de extensiones (por ejemplo, escribe `chrome://extensions/` en la barra de direcciones).
2. Activa el **Modo Desarrollador** (suele estar arriba a la derecha).
3. Haz clic en **Cargar Descomprimida** (Load unpacked).
4. Selecciona la carpeta **`extension`** ubicada dentro de este proyecto:
   `Z:\Music Converter\extension`
5. ¡Listo! Haz clic en el icono de la extensión en la barra de herramientas, presiona el engranaje (Ajustes) e introduce la URL de tu backend de DJDownloader (local o en Render).

---

## 🚀 Instalación Local de la Aplicación

### Requisitos
- [Node.js](https://nodejs.org) 18+
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) — `pip install yt-dlp` (o descargado localmente)
- [ffmpeg](https://ffmpeg.org) — instalado en tu sistema

```bash
git clone https://github.com/Reizo0337/DJTool.git
cd DJTool
npm install
node server.js
```

Abre `http://localhost:3000` 🎉

---

## ☁️ Hosting Gratuito 24/7 en Render

1. Crea una cuenta en **[render.com](https://render.com)** (gratis).
2. Crea un **New Web Service** y conecta tu repositorio `Reizo0337/DJTool`.
3. Runtime: **Docker** · Plan: **Free**.
4. Realiza el Deploy (espera ~8 minutos para que Docker compile e instale ffmpeg + yt-dlp).
5. Abre **[uptimerobot.com](https://uptimerobot.com)** y crea un monitor HTTP apuntando a tu URL: `https://tu-app.onrender.com/health` cada 5 minutos para evitar que entre en suspensión.

✅ Tu aplicación estará activa 24/7, autodesplegable con cada `git push`.

---

## 🎛️ Formatos DJ Soportados

| Formato | Calidad | Rekordbox | Serato | Propósito |
|---------|---------|-----------|--------|-----------|
| **MP3 320kbps** | ★★★★ | ✅ | ✅ | Estándar universal, peso idóneo y metadatos robustos |
| **WAV** | ★★★★★ | ✅ | ✅ | Audio puro sin compresión de estudio |
| **AIFF** | ★★★★★ | ✅ | ✅ | Audio puro sin compresión + soporte nativo de metadatos/portadas |
| **FLAC** | ★★★★★ | ✅ | ✅ | Compresión sin pérdida, ideal para almacenamiento |

---

## 🛠️ Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| **Backend** | Node.js + Express |
| **Frontend** | HTML5 + Vanilla CSS + JavaScript |
| **Extensión** | Manifest V3 (Content Scripts, Service Workers, Local Storage) |
| **Motor de descarga** | yt-dlp + ffmpeg |
| **Compresor ZIP** | Archiver (Compresión al vuelo en memoria) |
| **Contenedor** | Docker |
| **Hosting** | Render.com (free tier) |

---

## ⚠️ Aviso Legal

Esta herramienta ha sido creada únicamente para fines educativos y de uso personal. Respeta los términos de servicio de cada plataforma y los derechos de propiedad intelectual de los artistas. Utilízala exclusivamente con contenido que tengas derecho a descargar.
