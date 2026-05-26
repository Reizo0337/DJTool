"""
analyze_mix.py — DJTool
Splits a DJ mix audio file into chunks and identifies each track using ACRCloud.
Uses only Python stdlib (no extra pip packages needed).
"""
import sys
import os
import json
import time
import base64
import hashlib
import hmac
import subprocess
import tempfile
import shutil
import http.client
import mimetypes

# ─── ACCLOUD SIGNING ──────────────────────────────────────────────────────────

def build_signature(access_key, access_secret, timestamp):
    """Build HMAC-SHA1 signature exactly as ACRCloud expects."""
    http_method      = 'POST'
    http_uri         = '/v1/identify'
    data_type        = 'audio'
    signature_version = '1'
    string_to_sign = '\n'.join([
        http_method, http_uri, access_key,
        data_type, signature_version, timestamp
    ])
    secret_bytes = access_secret.encode('utf-8')
    sign_bytes   = string_to_sign.encode('utf-8')
    digest = hmac.new(secret_bytes, sign_bytes, digestmod=hashlib.sha1).digest()
    return base64.b64encode(digest).decode('utf-8')

# ─── MULTIPART FORM (stdlib, no requests needed) ──────────────────────────────

def encode_multipart(fields, files):
    """
    Encode multipart/form-data exactly like ACRCloud SDK expects.
    fields: dict of str -> str
    files:  list of (field_name, filename, file_bytes, content_type)
    Returns (body_bytes, content_type_header)
    """
    boundary = '----AcrCloudBoundary' + str(int(time.time() * 1000))
    CRLF = b'\r\n'
    body = b''

    # Text fields
    for name, value in fields.items():
        body += b'--' + boundary.encode() + CRLF
        body += f'Content-Disposition: form-data; name="{name}"'.encode() + CRLF
        body += CRLF
        body += value.encode('utf-8') + CRLF

    # File fields
    for (field_name, filename, data, content_type) in files:
        body += b'--' + boundary.encode() + CRLF
        body += f'Content-Disposition: form-data; name="{field_name}"; filename="{filename}"'.encode() + CRLF
        body += f'Content-Type: {content_type}'.encode() + CRLF
        body += CRLF
        body += data + CRLF

    body += b'--' + boundary.encode() + b'--' + CRLF
    content_type = f'multipart/form-data; boundary={boundary}'
    return body, content_type

# ─── ACRCloud IDENTIFY ────────────────────────────────────────────────────────

def recognize_chunk(chunk_path, access_key, access_secret, host):
    """
    Send one audio chunk to ACRCloud /v1/identify.
    Returns the parsed JSON response dict.
    """
    with open(chunk_path, 'rb') as f:
        audio_data = f.read()

    if len(audio_data) < 1000:
        return {'status': {'code': -2, 'msg': 'chunk too small'}}

    timestamp = str(int(time.time()))
    signature = build_signature(access_key, access_secret, timestamp)

    fields = {
        'access_key':        access_key,
        'timestamp':         timestamp,
        'signature':         signature,
        'data_type':         'audio',
        'signature_version': '1',
        'sample_bytes':      str(len(audio_data)),
    }
    files = [('sample', 'sample.mp3', audio_data, 'audio/mpeg')]

    body, content_type = encode_multipart(fields, files)

    try:
        conn = http.client.HTTPSConnection(host, timeout=25)
        conn.request(
            'POST',
            '/v1/identify',
            body=body,
            headers={
                'Content-Type':   content_type,
                'Content-Length': str(len(body)),
            }
        )
        resp = conn.getresponse()
        raw  = resp.read().decode('utf-8')
        conn.close()
        return json.loads(raw)
    except Exception as e:
        return {'status': {'code': -1, 'msg': str(e)}}

# ─── FFMPEG HELPERS ───────────────────────────────────────────────────────────

def find_ffmpeg():
    """Find ffmpeg/ffprobe — checks local dir first, then PATH."""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    is_win = sys.platform == 'win32'
    ext = '.exe' if is_win else ''

    for name in ['ffmpeg', 'ffprobe']:
        local = os.path.join(script_dir, name + ext)
        if os.path.exists(local):
            # local binary wins
            pass

    ffmpeg  = os.path.join(script_dir, 'ffmpeg' + ext)
    ffprobe = os.path.join(script_dir, 'ffprobe' + ext)

    if not os.path.exists(ffmpeg):
        ffmpeg  = 'ffmpeg'
    if not os.path.exists(ffprobe):
        ffprobe = 'ffprobe'

    return ffmpeg, ffprobe

FFMPEG, FFPROBE = find_ffmpeg()

def get_duration(audio_path):
    """Get audio duration in seconds using ffprobe."""
    try:
        result = subprocess.run(
            [FFPROBE, '-v', 'quiet', '-print_format', 'json',
             '-show_format', audio_path],
            capture_output=True, text=True, timeout=30
        )
        info = json.loads(result.stdout)
        return float(info['format']['duration'])
    except Exception:
        return 3600.0  # fallback: assume 1 hour

def extract_chunk(audio_path, start_sec, duration_sec, out_path):
    """
    Extract a time-slice from audio_path, saving as MP3 to out_path.
    Returns True on success.
    """
    cmd = [
        FFMPEG, '-y',
        '-ss', str(start_sec),
        '-i', audio_path,
        '-t', str(duration_sec),
        '-vn',                          # no video
        '-acodec', 'libmp3lame',
        '-ar', '44100',                 # 44.1kHz — ACRCloud requirement
        '-ab', '128k',
        '-ac', '1',                     # mono is fine for fingerprinting
        out_path,
        '-loglevel', 'error',
    ]
    result = subprocess.run(cmd, capture_output=True, timeout=60)
    return result.returncode == 0 and os.path.exists(out_path) and os.path.getsize(out_path) > 2000

# ─── FORMATTING ───────────────────────────────────────────────────────────────

def fmt_time(seconds):
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    return f'{h:02d}:{m:02d}:{s:02d}' if h > 0 else f'{m:02d}:{s:02d}'

# ─── MAIN ─────────────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) < 5:
        print('Usage: analyze_mix.py <audio_file> <acr_key> <acr_secret> <acr_host> [chunk_seconds]')
        sys.exit(1)

    audio_file   = sys.argv[1]
    acr_key      = sys.argv[2]
    acr_secret   = sys.argv[3]
    acr_host     = sys.argv[4].strip()
    chunk_sec    = int(sys.argv[5]) if len(sys.argv) > 5 else 20
    overlap_sec  = 5

    # Remove https:// prefix if user pasted full URL
    acr_host = acr_host.replace('https://', '').replace('http://', '').strip('/')

    if not os.path.exists(audio_file):
        print('PROGRESS:0:Error: archivo de audio no encontrado', flush=True)
        sys.exit(1)

    # ── Step 1: get duration ──────────────────────────────────────────────────
    print('PROGRESS:2:Leyendo duración del audio...', flush=True)
    total_duration = get_duration(audio_file)
    print(f'PROGRESS:3:Duración total: {fmt_time(total_duration)}', flush=True)

    # ── Step 2: chunk loop ────────────────────────────────────────────────────
    temp_dir = tempfile.mkdtemp(prefix='djtool_')
    tracks   = {}       # dedup key → track info
    results  = []       # ordered list

    step  = chunk_sec - overlap_sec
    total = max(1, int((total_duration - overlap_sec) / step))
    idx   = 0
    start = 0.0

    print(f'PROGRESS:5:Analizando {total} fragmentos...', flush=True)

    while start < total_duration:
        pct     = 5 + int((idx / max(total, 1)) * 90)
        pos_str = fmt_time(start)
        dur_str = fmt_time(total_duration)
        print(f'PROGRESS:{pct}:Analizando {pos_str} / {dur_str}...', flush=True)

        chunk_path = os.path.join(temp_dir, f'chunk_{idx:04d}.mp3')
        ok = extract_chunk(audio_file, start, chunk_sec, chunk_path)

        if ok:
            result = recognize_chunk(chunk_path, acr_key, acr_secret, acr_host)
            code   = result.get('status', {}).get('code', -1)
            msg    = result.get('status', {}).get('msg', '')

            # Debug — visible in Node.js stderr log
            print(f'  chunk {idx}: t={pos_str} code={code} msg={msg}', flush=True)

            if code == 0:
                try:
                    music     = result['metadata']['music'][0]
                    title     = music.get('title', 'Unknown')
                    artists   = music.get('artists', [{}])
                    artist    = artists[0].get('name', 'Unknown') if artists else 'Unknown'
                    album     = music.get('album', {}).get('name', '')
                    label     = music.get('label', '')
                    rel_date  = music.get('release_date', '')
                    score     = music.get('score', 0)

                    ext_meta  = music.get('external_metadata', {})
                    spotify   = ext_meta.get('spotify', {})
                    sp_id     = spotify.get('track', {}).get('id', '')

                    key = f'{artist.lower()}|||{title.lower()}'
                    if key not in tracks:
                        entry = {
                            'timestamp':        fmt_time(start),
                            'timestamp_seconds': start,
                            'title':            title,
                            'artist':           artist,
                            'album':            album,
                            'label':            label,
                            'release_date':     rel_date,
                            'score':            score,
                            'spotify_id':       sp_id,
                            'spotify_url':      f'https://open.spotify.com/track/{sp_id}' if sp_id else '',
                        }
                        tracks[key] = entry
                        results.append(entry)
                        print(f'  ✓ FOUND: {artist} - {title}', flush=True)
                except (KeyError, IndexError, TypeError) as e:
                    print(f'  parse error: {e}', flush=True)

            # Cleanup chunk
            try:
                os.remove(chunk_path)
            except Exception:
                pass

        # Rate limiting — ACRCloud free: 100 req/day, so pace ourselves
        time.sleep(0.5)

        start += step
        idx   += 1

    # ── Cleanup ───────────────────────────────────────────────────────────────
    shutil.rmtree(temp_dir, ignore_errors=True)

    print(f'PROGRESS:100:¡Listo! {len(results)} tracks encontrados.', flush=True)
    print(f'RESULT:{json.dumps(results, ensure_ascii=False)}', flush=True)

if __name__ == '__main__':
    main()
