# PlayTube — Purple Galaxy

## Requirements
- Node.js 20.19+ or 22.12+
- Python 3.10+

## Start backend (PowerShell, from this folder)
```powershell
py -m venv .venv
.\\.venv\\Scripts\\Activate.ps1
py -m pip install -r requirements.txt
py -m uvicorn server.main:app --reload --host 127.0.0.1 --port 8000
```
API health: http://localhost:8000/api/health | API docs: http://localhost:8000/docs

## Start frontend (a second terminal)
```powershell
cd frontend
npm install
npm run dev
```
Open http://localhost:5173. If PowerShell blocks npm.ps1, use `npm.cmd install` and `npm.cmd run dev`.

## Current scope and limitations
- Public catalogue search via ytmusicapi; no private browser.json is needed for search.
- Playback uses the YouTube embedded player, not direct audio-file hosting.
- Playlists are stored in a local SQLite database and are not account-specific yet.
- Authentication, artist uploads, moderation, subscriptions and production deployment are future milestones.
- Only play or upload music you own or are authorized to use.

## Native audio uploads (v1.1)

PlayTube now includes a native HTML audio player for audio files uploaded to your own library. Upload MP3, WAV, M4A, AAC, OGG, FLAC or WEBM files up to 50 MB each from **Your Uploads**. Files are stored locally in `server/media/`, with track metadata in the SQLite database. The API serves them from `/media/` and provides `/api/uploads` list/upload and `/api/uploads/{id}` delete endpoints.

Only upload music you created, own, or have permission to store and stream. Search results from the external music catalogue are discovery metadata; they are not streamed by PlayTube. This local upload implementation is a development milestone, not a production multi-user streaming host. For public deployment, add authentication, per-user storage quotas, malware/content review, backups, access controls, and object storage/CDN delivery.

Install the updated backend requirements after updating the project:

```powershell
python -m pip install -r requirements.txt
```

Then restart the backend and frontend. The upload endpoint requires `python-multipart`, which is now included in `requirements.txt`.


## Catalogue playback
Search results can be selected directly to play through the official YouTube embedded player. Playback uses YouTube's own controls. YouTube availability, regional restrictions, and embedding permissions apply. PlayTube does not extract or host YouTube audio.
