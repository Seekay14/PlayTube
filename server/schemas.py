from pydantic import BaseModel, Field
from typing import Optional
class Song(BaseModel):
    title: Optional[str] = None
    artist: Optional[str] = None
    videoId: Optional[str] = None
    duration: Optional[str] = None
    thumbnail: Optional[str] = None
class PlaylistSummary(BaseModel):
    id: int
    name: str
    description: str = ''
    track_count: int = 0
class CreatePlaylistRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str = Field(default='', max_length=300)
class AddSongsRequest(BaseModel):
    songs: list[Song] = Field(min_length=1, max_length=100)
class UploadedTrack(BaseModel):
    id: str
    title: str
    artist: str = ''
    original_name: str
    size_bytes: int
    audio_url: str
    created_at: Optional[str] = None
class StatusResponse(BaseModel):
    status: str
