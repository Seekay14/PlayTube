import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import './App.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const api = axios.create({ baseURL: API, timeout: 20000 });

function App() {
  useEffect(() => {
    const url = new URL(window.location.href);

    if (url.searchParams.has('utm_source')) {
      url.searchParams.delete('utm_source');
      window.history.replaceState(
        {},
        document.title,
        url.pathname + url.search + url.hash
      );
    }
  }, []);
  const [query, setQuery] = useState('');
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [activePage, setActivePage] = useState('Home');
  const [currentSong, setCurrentSong] = useState(null);
  const [queue, setQueue] = useState([]);
  const [liked, setLiked] = useState(() => {
    try { return JSON.parse(localStorage.getItem('playtube-liked') || '[]'); }
    catch { return []; }
  });
  const [playlists, setPlaylists] = useState([]);
  const [playlistName, setPlaylistName] = useState('');
  const [backendOnline, setBackendOnline] = useState(false);

  useEffect(() => {
    api.get('/api/health').then(() => setBackendOnline(true)).catch(() => setBackendOnline(false));
    loadPlaylists();
  }, []);

  useEffect(() => {
    localStorage.setItem('playtube-liked', JSON.stringify(liked));
  }, [liked]);

  async function loadPlaylists() {
    try { const { data } = await api.get('/api/playlists'); setPlaylists(data); } catch {}
  }

  async function handleSearch(event) {
    event?.preventDefault();
    if (!query.trim()) { setError('Enter a song, artist or album to search.'); return; }
    setLoading(true); setError(''); setNotice('');
    try {
      const { data } = await api.get('/api/search', { params: { q: query.trim(), limit: 25 } });
      setSongs(Array.isArray(data) ? data : []);
      setActivePage('Search');
      if (!data.length) setNotice('No tracks found. Try another search.');
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not reach music search. Check the backend.');
    } finally { setLoading(false); }
  }

  function playTrack(track, list = visibleSongs) {
    if (!track?.videoId) {
      setError('This result does not have an embeddable YouTube track.');
      return;
    }
    setError('');
    setQueue(list);
    setCurrentSong(track);
  }

  function playNext() {
    if (!queue.length || !currentSong) return;
    const index = queue.findIndex(item => item.videoId === currentSong.videoId);
    setCurrentSong(queue[(index + 1 + queue.length) % queue.length]);
  }

  function playPrevious() {
    if (!queue.length || !currentSong) return;
    const index = queue.findIndex(item => item.videoId === currentSong.videoId);
    setCurrentSong(queue[(index - 1 + queue.length) % queue.length]);
  }

  function toggleLike(song) {
    setLiked(old => old.some(item => item.videoId === song.videoId)
      ? old.filter(item => item.videoId !== song.videoId)
      : [song, ...old]);
  }

  async function createPlaylist(event) {
    event.preventDefault();
    if (!playlistName.trim()) return;
    try {
      await api.post('/api/playlists', { name: playlistName.trim(), description: '' });
      setPlaylistName('');
      await loadPlaylists();
      setNotice('Playlist created.');
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not create playlist.');
    }
  }

  const visibleSongs = useMemo(
    () => activePage === 'Liked Songs' ? liked : songs,
    [activePage, liked, songs]
  );

  const playerUrl = currentSong?.videoId
    ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(currentSong.videoId)}?autoplay=1&controls=1&rel=0&playsinline=1`
    : '';

  return <div className="app-shell">
    <header className="topbar">
      <button className="brand" onClick={() => setActivePage('Home')} aria-label="PlayTube home">
        <span className="brand-mark">♫</span><span>Play<span className="brand-accent">Tube</span></span>
      </button>
      <form className="search-form" onSubmit={handleSearch}>
        <span className="search-symbol"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg></span>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Discover songs and artists" aria-label="Search music"/>
        <button type="submit" disabled={loading}>{loading ? 'Searching…' : 'Search'}</button>
      </form>
      <div className="profile-area"><span className={`status-dot ${backendOnline ? 'online' : ''}`} /><span>PlayTube</span><div className="avatar">P</div></div>
    </header>

    <div className="layout">
      <aside className="sidebar">
        <p className="side-label">MENU</p>
        {['Home','Search','Your Library','Liked Songs'].map((item,i)=>
          <button key={item} className={`nav-item ${activePage===item?'active':''}`} onClick={()=>setActivePage(item)}>
            <span>{['⌂','⌕','☰','♥'][i]}</span>{item}
          </button>
        )}
        <div className="side-divider"/>
        <div className="playlist-heading"><p className="side-label">YOUR PLAYLISTS</p><button title="Create playlist" onClick={()=>setActivePage('Your Library')}>ï¼‹</button></div>
        {playlists.map(p=><div className="playlist-link" key={p.id}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg> {p.name}</div>)}
        {!playlists.length&&<p className="muted small">Your playlists will appear here.</p>}
        <div className="sidebar-foot"><span className={`status-dot ${backendOnline?'online':''}`} />{backendOnline?'Connected to PlayTube':'Backend offline'}</div>
      </aside>

      <main className="content">
        <div className="welcome-banner">
          <div><span className="eyebrow">YOUR SOUND. YOUR UNIVERSE.</span><h1>Music without limits.</h1><p>Discover a track, click it, and enjoy playback in the built-in player.</p></div>
          <div className="orbit-art"><span>♫</span><i>✦</i><b>✧</b></div>
        </div>
        {error&&<div className="message error">{error}</div>}
        {notice&&<div className="message success">{notice}</div>}

        {activePage==='Your Library' ? <section className="section">
          <div className="section-head"><div><span className="eyebrow">YOUR COLLECTION</span><h2>Your Library</h2></div></div>
          <form className="create-playlist" onSubmit={createPlaylist}>
            <input value={playlistName} onChange={e=>setPlaylistName(e.target.value)} placeholder="Name your new playlist" maxLength="80"/>
            <button type="submit">Create playlist</button>
          </form>
          {playlists.map(p=><div className="library-card" key={p.id}><span className="library-icon">♫</span><div><strong>{p.name}</strong><small>{p.track_count??0} tracks</small></div></div>)}
          {!playlists.length&&<div className="empty-state"><div className="empty-icon">♫</div><h3>Your library is ready</h3><p>Create a playlist to start organizing your music.</p></div>}
        </section> : <section className="section">
          <div className="section-head">
            <div><span className="eyebrow">{activePage==='Liked Songs'?'YOUR COLLECTION':activePage==='Search'?'DISCOVER':'START EXPLORING'}</span>
              <h2>{activePage==='Liked Songs'?'Liked Songs':activePage==='Search'?'Search results':'Find your next favourite'}</h2>
            </div>
            {visibleSongs.length>0&&<span className="result-count">{visibleSongs.length} tracks</span>}
          </div>
          {visibleSongs.length ? <div className="track-list">
            {visibleSongs.map((song,index)=>{
              const isLiked=liked.some(item=>item.videoId===song.videoId);
              const isCurrent=currentSong?.videoId===song.videoId;
              return <div className={`track-row ${isCurrent?'selected':''}`} key={song.videoId||index}>
                <button className="play-index" onClick={()=>playTrack(song, visibleSongs)} aria-label={`Play ${song.title||'track'}`}>{isCurrent?'♫':<span>{index+1}</span>}</button>
                <img className="track-cover" src={song.thumbnail||''} alt="" onError={e=>{e.currentTarget.style.visibility='hidden';}}/>
                <button className="track-meta clickable-track" onClick={()=>playTrack(song, visibleSongs)}>
                  <strong>{song.title||'Unknown title'}</strong><span>{song.artist||'Unknown artist'}</span>
                </button>
                <span className="track-duration">{song.duration||'—'}</span>
                <button className={`like-button ${isLiked?'liked':''}`} onClick={()=>toggleLike(song)} aria-label={isLiked?'Unlike track':'Like track'}>{isLiked?'♥':'♡'}</button>
              </div>;
            })}
          </div> : <div className="empty-state">
            <div className="empty-icon">♫</div>
            <h3>{activePage==='Liked Songs'?'No liked tracks yet':'Discover music'}</h3>
            <p>{activePage==='Liked Songs'?'Tap the heart beside a track to save it here.':'Search for a song or artist above. Select any result to start playback.'}</p>
            {activePage==='Liked Songs'&&<button className="secondary-action" onClick={()=>setActivePage('Search')}>Explore music</button>}
          </div>}
        </section>}
      </main>
    </div>

    {currentSong&&<footer className="player youtube-audio-player">
      <div className="now-playing">
        <img className="now-playing-thumb" src={currentSong.thumbnail||''} alt="" onError={e=>{e.currentTarget.style.visibility='hidden';}}/>
        <div className="now-playing-info"><strong>{currentSong.title||'Now playing'}</strong><span>{currentSong.artist||'Unknown artist'}</span><small>Playing via YouTube</small></div>
      </div>
      <div className="youtube-player-frame">
        <iframe key={currentSong.videoId} src={playerUrl} title={`Play ${currentSong.title||'song'}`}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen" referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen/>
      </div>
      <div className="queue-controls">
<button onClick={playPrevious} title="Previous track" aria-label="Previous track">◀◀</button>
        <button onClick={playNext} title="Next track" aria-label="Next track">▶▶</button>
        <button className="close-player" onClick={()=>setCurrentSong(null)} aria-label="Close player">×</button>
      </div>
    </footer>}
  </div>;
}

export default App;


