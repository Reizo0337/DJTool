import sys
import os
import json
import time
import base64
import hashlib
import hmac
import urllib.request
import urllib.parse
import struct
import wave
import subprocess
import tempfile

def sign_request(access_key, access_secret, http_method, http_uri, data):
    """Sign request for ACRCloud API."""
    timestamp = str(int(time.time()))
    string_to_sign = '\n'.join([http_method, http_uri, access_key, 'audio', '1', timestamp])
    sign = base64.b64encode(
        hmac.new(access_secret.encode('utf-8'), string_to_sign.encode('utf-8'), digestmod=hashlib.sha1).digest()
    ).decode('utf-8')
    return sign, timestamp

def recognize_audio_chunk(chunk_path, access_key, access_secret, host):
    """Send a chunk to ACRCloud and return the result."""
    with open(chunk_path, 'rb') as f:
        audio_data = f.read()

    http_method = 'POST'
    http_uri = '/v1/identify'
    sign, timestamp = sign_request(access_key, access_secret, http_method, http_uri, audio_data)

    boundary = 'AcrBoundary' + str(int(time.time()))
    body = b''
    
    fields = {
        'access_key': access_key,
        'sample_bytes': str(len(audio_data)),
        'timestamp': timestamp,
        'signature': sign,
        'data_type': 'audio',
        'signature_version': '1',
    }

    for key, val in fields.items():
        body += f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{val}\r\n'.encode()

    body += f'--{boundary}\r\nContent-Disposition: form-data; name="sample"; filename="chunk.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n'.encode()
    body += audio_data
    body += f'\r\n--{boundary}--\r\n'.encode()

    url = f'https://{host}/v1/identify'
    req = urllib.request.Request(
        url,
        data=body,
        headers={
            'Content-Type': f'multipart/form-data; boundary={boundary}',
            'Content-Length': str(len(body)),
        },
        method='POST'
    )

    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except Exception as e:
        return {'status': {'code': -1, 'msg': str(e)}}

def split_audio_with_ffmpeg(input_path, chunk_seconds=20, overlap=5):
    """Split audio into overlapping chunks using ffmpeg."""
    # Get duration
    probe_cmd = ['ffprobe', '-v', 'quiet', '-print_format', 'json', '-show_format', input_path]
    
    # Try local ffmpeg first
    local_ffprobe = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ffprobe.exe')
    local_ffmpeg = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ffmpeg.exe')
    
    ffprobe_cmd = local_ffprobe if os.path.exists(local_ffprobe) else 'ffprobe'
    ffmpeg_cmd = local_ffmpeg if os.path.exists(local_ffmpeg) else 'ffmpeg'

    result = subprocess.run([ffprobe_cmd, '-v', 'quiet', '-print_format', 'json', '-show_format', input_path],
                           capture_output=True, text=True)
    
    try:
        info = json.loads(result.stdout)
        duration = float(info['format']['duration'])
    except:
        duration = 3600  # fallback 1 hour

    chunks = []
    start = 0
    chunk_idx = 0
    temp_dir = tempfile.mkdtemp()

    while start < duration:
        chunk_path = os.path.join(temp_dir, f'chunk_{chunk_idx:04d}.mp3')
        cmd = [
            ffmpeg_cmd, '-y', '-ss', str(start), '-i', input_path,
            '-t', str(chunk_seconds), '-q:a', '4',
            '-acodec', 'libmp3lame', chunk_path, '-loglevel', 'quiet'
        ]
        subprocess.run(cmd, capture_output=True)
        if os.path.exists(chunk_path) and os.path.getsize(chunk_path) > 1000:
            chunks.append((start, chunk_path))
        start += chunk_seconds - overlap
        chunk_idx += 1

    return chunks, temp_dir, duration

def format_time(seconds):
    """Format seconds to HH:MM:SS."""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    if h > 0:
        return f'{h:02d}:{m:02d}:{s:02d}'
    return f'{m:02d}:{s:02d}'

def main():
    if len(sys.argv) < 6:
        print('Usage: analyze_mix.py <audio_file> <acr_key> <acr_secret> <acr_host> <chunk_seconds>')
        sys.exit(1)

    audio_file = sys.argv[1]
    acr_key = sys.argv[2]
    acr_secret = sys.argv[3]
    acr_host = sys.argv[4]
    chunk_seconds = int(sys.argv[5]) if len(sys.argv) > 5 else 20

    if not os.path.exists(audio_file):
        print(f'PROGRESS:0:Error: archivo no encontrado')
        sys.exit(1)

    print(f'PROGRESS:2:Dividiendo el audio en fragmentos...', flush=True)
    chunks, temp_dir, total_duration = split_audio_with_ffmpeg(audio_file, chunk_seconds, overlap=5)
    
    total_chunks = len(chunks)
    print(f'PROGRESS:5:{total_chunks} fragmentos generados. Iniciando reconocimiento...', flush=True)

    tracks = {}  # key: "artist - title" → track info
    track_list = []  # ordered by first appearance

    for i, (start_time, chunk_path) in enumerate(chunks):
        progress = 5 + int((i / total_chunks) * 90)
        print(f'PROGRESS:{progress}:Analizando {format_time(start_time)} de {format_time(total_duration)}...', flush=True)

        result = recognize_audio_chunk(chunk_path, acr_key, acr_secret, acr_host)
        
        try:
            status_code = result.get('status', {}).get('code', -1)
            if status_code == 0:
                music = result['metadata']['music'][0]
                title = music.get('title', 'Unknown')
                artists = music.get('artists', [])
                artist = artists[0]['name'] if artists else 'Unknown'
                album = music.get('album', {}).get('name', '')
                label = music.get('label', '')
                release_date = music.get('release_date', '')
                
                # External metadata (Spotify, etc.)
                ext_meta = music.get('external_metadata', {})
                spotify = ext_meta.get('spotify', {})
                spotify_id = spotify.get('track', {}).get('id', '')
                
                track_key = f'{artist.lower()}|||{title.lower()}'
                
                if track_key not in tracks:
                    track_info = {
                        'timestamp': format_time(start_time),
                        'timestamp_seconds': start_time,
                        'title': title,
                        'artist': artist,
                        'album': album,
                        'label': label,
                        'release_date': release_date,
                        'spotify_id': spotify_id,
                        'spotify_url': f'https://open.spotify.com/track/{spotify_id}' if spotify_id else '',
                        'cover_url': f'https://i.scdn.co/image/{spotify.get("track", {}).get("id", "")}' if spotify_id else '',
                        'score': music.get('score', 0),
                        'acr_id': music.get('acrid', ''),
                    }
                    tracks[track_key] = track_info
                    track_list.append(track_info)
        except (KeyError, IndexError, TypeError):
            pass  # No match for this chunk

        # Rate limiting
        time.sleep(0.3)
        
        # Cleanup chunk
        try:
            os.remove(chunk_path)
        except:
            pass

    # Cleanup temp dir
    try:
        import shutil
        shutil.rmtree(temp_dir, ignore_errors=True)
    except:
        pass

    print(f'PROGRESS:100:¡Análisis completo! {len(track_list)} tracks encontrados.', flush=True)
    print(f'RESULT:{json.dumps(track_list)}', flush=True)

if __name__ == '__main__':
    main()
