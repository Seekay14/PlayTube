import os, sqlite3, uuid
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator
from fastapi import FastAPI, HTTPException, Query, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from server.schemas import Song, PlaylistSummary, CreatePlaylistRequest, AddSongsRequest, StatusResponse, UploadedTrack
try:
    from ytmusicapi import YTMusic
except ImportError:
    YTMusic = None
APP_DIR = Path(__file__).resolve().parent
DB_PATH = Path(os.getenv('PLAYTUBE_DB', str(APP_DIR / 'playtube.db')))
MEDIA_DIR = Path(os.getenv('PLAYTUBE_MEDIA', str(APP_DIR / 'media')))
MEDIA_DIR.mkdir(parents=True, exist_ok=True)
MAX_UPLOAD_BYTES = 50 * 1024 * 1024
ALLOWED_EXTENSIONS = {'.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac', '.webm'}
app = FastAPI(title='PlayTube API', version='1.1.0')
app.mount('/media', StaticFiles(directory=MEDIA_DIR), name='media')
origins = os.getenv('PLAYTUBE_CORS_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000')
app.add_middleware(CORSMiddleware, allow_origins=[x.strip() for x in origins.split(',') if x.strip()], allow_credentials=True, allow_methods=['*'], allow_headers=['*'])
@contextmanager
def db_connection() -> Iterator[sqlite3.Connection]:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH); db.row_factory = sqlite3.Row
    try:
        yield db; db.commit()
    finally: db.close()
def init_db():
    with db_connection() as db:
        db.execute('''CREATE TABLE IF NOT EXISTS playlists (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)''')
        db.execute('''CREATE TABLE IF NOT EXISTS playlist_tracks (id INTEGER PRIMARY KEY AUTOINCREMENT, playlist_id INTEGER NOT NULL, video_id TEXT NOT NULL, title TEXT NOT NULL DEFAULT '', artist TEXT NOT NULL DEFAULT '', duration TEXT NOT NULL DEFAULT '', thumbnail TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(playlist_id, video_id))''')
        db.execute('''CREATE TABLE IF NOT EXISTS uploaded_tracks (id TEXT PRIMARY KEY, title TEXT NOT NULL, artist TEXT NOT NULL DEFAULT '', original_name TEXT NOT NULL, stored_name TEXT NOT NULL UNIQUE, mime_type TEXT NOT NULL, size_bytes INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)''')
@app.on_event('startup')
def startup(): init_db()
def music_client():
    if YTMusic is None: raise HTTPException(status_code=503, detail='Missing ytmusicapi. Install requirements.txt.')
    try: return YTMusic()
    except Exception as exc: raise HTTPException(status_code=502, detail=f'Music search service unavailable: {exc}')
@app.get('/api/health', response_model=StatusResponse)
def health():
    with db_connection() as db: db.execute('SELECT 1')
    return StatusResponse(status='ok')
@app.get('/api/search', response_model=list[Song])
def api_search(q: str = Query(..., min_length=1, max_length=150), limit: int = Query(20, ge=1, le=50)):
    yt = music_client()
    try:
        results = yt.search(q.strip(), filter='songs', limit=limit); songs=[]
        for item in results:
            video_id=item.get('videoId')
            if not video_id: continue
            artists=item.get('artists') or []; thumbs=item.get('thumbnails') or []
            songs.append(Song(title=item.get('title') or 'Unknown title', artist=', '.join(a.get('name','') for a in artists if a.get('name')) or 'Unknown artist', videoId=video_id, duration=item.get('duration') or '', thumbnail=thumbs[-1].get('url') if thumbs else None))
        return songs
    except HTTPException: raise
    except Exception as exc: raise HTTPException(status_code=502, detail=f'Music search failed: {exc}')
@app.get('/api/uploads', response_model=list[UploadedTrack])
def list_uploads():
    with db_connection() as db:
        rows=db.execute("SELECT id,title,artist,original_name,size_bytes,created_at,'/media/' || stored_name AS audio_url FROM uploaded_tracks ORDER BY created_at DESC,rowid DESC").fetchall()
    return [UploadedTrack(**dict(row)) for row in rows]
@app.post('/api/uploads', response_model=UploadedTrack)
async def upload_track(file: UploadFile = File(...), title: str = Form(''), artist: str = Form('')):
    original=Path(file.filename or 'audio').name; ext=Path(original).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS: raise HTTPException(status_code=415, detail='Supported formats: MP3, WAV, M4A, AAC, OGG, FLAC and WEBM.')
    track_id=uuid.uuid4().hex; stored=f'{track_id}{ext}'; destination=MEDIA_DIR/stored; total=0
    try:
        with destination.open('wb') as out:
            while True:
                chunk=await file.read(1024*1024)
                if not chunk: break
                total += len(chunk)
                if total > MAX_UPLOAD_BYTES: raise HTTPException(status_code=413, detail='Maximum audio upload size is 50 MB.')
                out.write(chunk)
        if not total: raise HTTPException(status_code=400, detail='The selected audio file is empty.')
        safe_title=(title.strip() or Path(original).stem)[:160]; safe_artist=artist.strip()[:120]; mime=file.content_type or 'application/octet-stream'
        with db_connection() as db:
            db.execute('INSERT INTO uploaded_tracks(id,title,artist,original_name,stored_name,mime_type,size_bytes) VALUES(?,?,?,?,?,?,?)',(track_id,safe_title,safe_artist,original,stored,mime,total))
        return UploadedTrack(id=track_id,title=safe_title,artist=safe_artist,original_name=original,size_bytes=total,audio_url=f'/media/{stored}')
    except Exception:
        destination.unlink(missing_ok=True); raise
    finally: await file.close()
@app.delete('/api/uploads/{track_id}', response_model=StatusResponse)
def delete_upload(track_id: str):
    with db_connection() as db:
        row=db.execute('SELECT stored_name FROM uploaded_tracks WHERE id=?',(track_id,)).fetchone()
        if not row: raise HTTPException(status_code=404, detail='Uploaded track not found.')
        db.execute('DELETE FROM uploaded_tracks WHERE id=?',(track_id,))
    (MEDIA_DIR/row['stored_name']).unlink(missing_ok=True)
    return StatusResponse(status='track_deleted')
@app.get('/api/playlists', response_model=list[PlaylistSummary])
def api_playlists():
    with db_connection() as db:
        rows=db.execute('SELECT p.id,p.name,p.description,COUNT(t.id) AS track_count FROM playlists p LEFT JOIN playlist_tracks t ON t.playlist_id=p.id GROUP BY p.id ORDER BY p.created_at DESC').fetchall()
    return [PlaylistSummary(**dict(row)) for row in rows]
@app.post('/api/playlists', response_model=PlaylistSummary)
def api_create_playlist(req: CreatePlaylistRequest):
    name=req.name.strip()
    if not name: raise HTTPException(status_code=422, detail='Playlist name cannot be empty.')
    with db_connection() as db:
        pid=db.execute('INSERT INTO playlists(name,description) VALUES (?,?)',(name,req.description.strip())).lastrowid
    return PlaylistSummary(id=pid,name=name,description=req.description.strip(),track_count=0)
@app.post('/api/playlists/{playlist_id}/songs', response_model=StatusResponse)
def api_add_songs(playlist_id: int, req: AddSongsRequest):
    with db_connection() as db:
        if not db.execute('SELECT id FROM playlists WHERE id=?',(playlist_id,)).fetchone(): raise HTTPException(status_code=404,detail='Playlist not found.')
        for song in req.songs:
            if song.videoId: db.execute('INSERT OR IGNORE INTO playlist_tracks(playlist_id,video_id,title,artist,duration,thumbnail) VALUES (?,?,?,?,?,?)',(playlist_id,song.videoId,song.title or '',song.artist or '',song.duration or '',song.thumbnail or ''))
    return StatusResponse(status='songs_added')
@app.get('/api/playlists/{playlist_id}/songs', response_model=list[Song])
def api_playlist_songs(playlist_id: int):
    with db_connection() as db:
        if not db.execute('SELECT id FROM playlists WHERE id=?',(playlist_id,)).fetchone(): raise HTTPException(status_code=404,detail='Playlist not found.')
        rows=db.execute('SELECT title,artist,video_id AS videoId,duration,thumbnail FROM playlist_tracks WHERE playlist_id=? ORDER BY id',(playlist_id,)).fetchall()
    return [Song(**dict(row)) for row in rows]
@app.delete('/api/playlists/{playlist_id}', response_model=StatusResponse)
def api_delete_playlist(playlist_id: int):
    with db_connection() as db:
        cur=db.execute('DELETE FROM playlists WHERE id=?',(playlist_id,))
        if not cur.rowcount: raise HTTPException(status_code=404,detail='Playlist not found.')
        db.execute('DELETE FROM playlist_tracks WHERE playlist_id=?',(playlist_id,))
    return StatusResponse(status='playlist_deleted')
