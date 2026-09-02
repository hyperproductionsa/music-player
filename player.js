(async function() {
  const res = await fetch('data.json');
  const DATA = await res.json();
  const { baseUrl, comingSoon, albums, comingSoonAlbum } = DATA;

  const isUnlocked = () => new Date() >= new Date(comingSoon);
  const audio = new Audio();
  const getAudio = (a, t) => `${baseUrl}/m4a/${a.folder}/${t.file}`;
  const getImage = (a) => `${baseUrl}/images/${a.cover}`;

  // Track the currently PLAYING album and track (separate from browsing)
  let playingAlbum = null;
  let playingTrack = null;
  let playingIdx = 0;
  let isPlaying = false;
  let timer = null;

  // Track the album being VIEWED (for tracklist display)
  let viewedAlbum = null;

  // Store full state for each album: which track was last played
  const albumStates = {};

  // DOM
  const $ = id => document.getElementById(id);
  const albumList = $('albumList');
  const tracklistWrap = $('tracklistWrap');
  const tracklist = $('tracklist');
  const tlTitle = $('tlTitle');
  const tlArtist = $('tlArtist');
  const backBtn = $('backBtn');
  const headerBadge = $('headerBadge');
  const artImg = $('artImg');
  const csOverlay = $('csOverlay');
  const csTitle = $('csTitle');
  const csSub = $('csSub');
  const csDate = $('csDate');
  const npPcTrack = $('npPcTrack');
  const npPcArtist = $('npPcArtist');
  const npPcFill = $('npPcFill');
  const npPcCur = $('npPcCur');
  const npPcTot = $('npPcTot');
  const npPcProgress = $('npPcProgress');
  const pcPlay = $('pcPlay');
  const pcPrev = $('pcPrev');
  const pcNext = $('pcNext');
  const pmArt = $('pmArt');
  const pmTitle = $('pmTitle');
  const pmArtist = $('pmArtist');
  const pmPlay = $('pmPlay');
  const pmNext = $('pmNext');
  const pmExpand = $('pmExpand');
  const pf = $('playerFull');
  const pfArt = $('pfArt');
  const pfTitle = $('pfTitle');
  const pfArtist = $('pfArtist');
  const pfFill = $('pfFill');
  const pfCur = $('pfCur');
  const pfTot = $('pfTot');
  const pfProgress = $('pfProgress');
  const pfPlay = $('pfPlay');
  const pfPrev = $('pfPrev');
  const pfNext = $('pfNext');
  const pfClose = $('pfClose');

  const allAlbums = [...albums, { ...comingSoonAlbum, isCS: true }];

  // ============================================================
  // UPDATE ARTWORK (separate from now playing)
  // ============================================================
  function updateArtwork() {
    // If playing, show playing album artwork
    // Otherwise show HTC5 (Coming Soon)
    if (playingAlbum) {
      artImg.src = getImage(playingAlbum);
      csOverlay.style.display = 'none';
    } else {
      const defaultAlbum = allAlbums[4];
      artImg.src = getImage(defaultAlbum);
      csOverlay.style.display = 'flex';
      csTitle.textContent = defaultAlbum.title;
      csSub.textContent = `${defaultAlbum.artist} · ${defaultAlbum.year} · ${defaultAlbum.trackCount} tracks`;
      csDate.textContent = new Date(defaultAlbum.releaseDate).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
    }
  }

  // ============================================================
  // UPDATE NOW PLAYING UI
  // ============================================================
  function updateNowPlaying() {
    if (!playingTrack || !playingAlbum) {
      npPcTrack.textContent = 'Select a track';
      npPcArtist.textContent = '—';
      pmTitle.textContent = 'Select a track';
      pmArtist.textContent = '—';
      pfTitle.textContent = 'Select a track';
      pfArtist.textContent = '—';
      return;
    }
    const title = playingTrack.mix ? `${playingTrack.title} (${playingTrack.mix})` : playingTrack.title;
    npPcTrack.textContent = title;
    npPcArtist.textContent = playingTrack.artist;
    pmTitle.textContent = title;
    pmArtist.textContent = playingTrack.artist;
    pfTitle.textContent = title;
    pfArtist.textContent = playingTrack.artist;
    
    // Artwork stays with the PLAYING album
    const art = getImage(playingAlbum);
    pmArt.src = art;
    pfArt.src = art;
    // Also update the main artwork
    updateArtwork();
  }

  // ============================================================
  // MEDIA SESSION API
  // ============================================================
  function setupMediaSession() {
    if (!('mediaSession' in navigator) || !playingTrack || !playingAlbum) return;
    
    const title = playingTrack.mix ? `${playingTrack.title} (${playingTrack.mix})` : playingTrack.title;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: title,
      artist: playingTrack.artist,
      album: playingAlbum.title,
      artwork: [{ src: getImage(playingAlbum), sizes: '512x512', type: 'image/jpeg' }]
    });

    navigator.mediaSession.setActionHandler('play', () => {
      audio.play();
      isPlaying = true;
      updatePlayBtn();
      startProgress();
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      audio.pause();
      isPlaying = false;
      updatePlayBtn();
      clearInterval(timer);
    });
    navigator.mediaSession.setActionHandler('previoustrack', () => {
      if (playingAlbum) prevTrack();
    });
    navigator.mediaSession.setActionHandler('nexttrack', () => {
      if (playingAlbum) nextTrack();
    });
  }

  // ============================================================
  // VIEW FUNCTIONS
  // ============================================================
  function showAlbumList() {
    albumList.style.display = 'flex';
    tracklistWrap.style.display = 'none';
    backBtn.style.display = 'none';
    headerBadge.style.display = 'inline';
    headerBadge.textContent = '5 albums';
  }

  function showTracklist() {
    albumList.style.display = 'none';
    tracklistWrap.style.display = 'flex';
    backBtn.style.display = 'inline';
    headerBadge.style.display = 'none';
  }

  // ============================================================
  // RENDER FUNCTIONS
  // ============================================================
  function renderAlbums() {
    const sorted = [...allAlbums].reverse();
    albumList.innerHTML = sorted.map((a) => {
      const idx = allAlbums.indexOf(a);
      const isCS = a.isCS || false;
      // Check if this album is currently playing
      const isPlayingAlbum = playingAlbum && playingAlbum.id === a.id;
      const hasState = albumStates[a.id] !== undefined;
      return `
        <div class="album-item" data-idx="${idx}">
          <div class="ai-art"><img src="${getImage(a)}" alt="${a.title}" /></div>
          <div class="ai-info">
            <div class="ai-title">${a.title} ${isPlayingAlbum ? '▶' : ''} ${hasState && !isPlayingAlbum ? '●' : ''}</div>
            <div class="ai-artist">${a.artist} · ${a.year}</div>
          </div>
          ${isCS ? `<div class="ai-badge">🔜</div>` : ''}
          <div class="ai-play"><i class="fas fa-play-circle"></i></div>
        </div>
      `;
    }).join('');
    albumList.querySelectorAll('.album-item').forEach(el => {
      el.onclick = () => loadAlbum(parseInt(el.dataset.idx));
    });
  }

  function renderTracklist(album, isLocked = false) {
    showTracklist();
    tlTitle.textContent = album.title;
    tlArtist.textContent = `${album.artist} · ${album.year}`;

    // Store which album is being viewed
    viewedAlbum = album;

    if (isLocked || album.isCS) {
      tracklist.innerHTML = `
        <div class="track-item locked" style="background:#1a1a1a;border-bottom:1px solid #2a2a2a;padding:12px 14px;cursor:default;">
          <div class="ti-info" style="text-align:center;">
            <div class="ti-title" style="color:#e5de69;font-size:.9rem;"><i class="fas fa-clock"></i> Coming ${new Date(album.releaseDate).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
            <div class="ti-artist" style="color:#888;">${album.trackCount || album.tracks.length} tracks</div>
          </div>
        </div>
      `;
      album.tracks.forEach((t) => {
        const title = t.mix ? `${t.title} (${t.mix})` : t.title;
        tracklist.innerHTML += `
          <div class="track-item locked">
            <div class="ti-play" style="color:#444;"><i class="fas fa-lock"></i></div>
            <div class="ti-info">
              <div class="ti-title" style="color:#666;">${title}</div>
              <div class="ti-artist" style="color:#555;">${t.artist}</div>
            </div>
            <div class="ti-dur" style="color:#444;">🔒</div>
          </div>
        `;
      });
      return;
    }

    // Get the saved state for this album
    const state = albumStates[album.id];
    const savedIdx = state ? state.playingIdx : 0;

    tracklist.innerHTML = album.tracks.map((t, i) => {
      // Check if this track matches the saved state for this album
      const isSavedTrack = (state && i === savedIdx);
      // Check if this is currently playing
      const isActive = (playingAlbum && playingAlbum.id === album.id && i === playingIdx);
      
      const title = t.mix ? `${t.title} (${t.mix})` : t.title;
      return `
        <div class="track-item ${isActive ? 'active' : ''}" data-idx="${i}">
          <div class="ti-play"><i class="fas ${isActive ? 'fa-play-circle' : 'fa-play'}"></i></div>
          <div class="ti-info">
            <div class="ti-title">${title}</div>
            <div class="ti-artist">${t.artist}</div>
          </div>
          <div class="ti-dur">${isActive ? '▶' : (isSavedTrack ? '●' : '♫')}</div>
        </div>
      `;
    }).join('');
    tracklist.querySelectorAll('.track-item:not(.locked)').forEach(el => {
      el.onclick = () => playTrack(parseInt(el.dataset.idx));
    });
  }

  // ============================================================
  // LOAD ALBUM (for viewing, NOT playing)
  // ============================================================
  function loadAlbum(idx) {
    const album = allAlbums[idx];
    const isLocked = album.isCS || false;

    // Update the viewed album
    viewedAlbum = album;

    // DON'T change the artwork - it should stay with playing song
    // DON'T change the now playing UI

    renderTracklist(album, isLocked);
  }

  // ============================================================
  // PLAY TRACK (starts playing the selected track)
  // ============================================================
  function playTrack(idx) {
    const album = viewedAlbum || allAlbums[0];
    if (!album || album.isCS) return;
    
    const track = album.tracks[idx];
    if (!track) return;

    // Set as playing album/track
    playingAlbum = album;
    playingTrack = track;
    playingIdx = idx;

    // Save state for this album
    albumStates[album.id] = { 
      playingIdx: idx,
      albumTitle: album.title,
      albumArtist: album.artist
    };

    const url = getAudio(album, track);
    
    // If same track, toggle play/pause
    if (audio.src === url) {
      if (isPlaying) {
        audio.pause();
        isPlaying = false;
        clearInterval(timer);
      } else {
        audio.play().then(() => {
          isPlaying = true;
          startProgress();
        }).catch(() => {});
      }
      updatePlayBtn();
      return;
    }

    // New track - load and play
    audio.src = url;
    audio.load();

    // Update NOW PLAYING (shows PLAYING track)
    updateNowPlaying();
    setupMediaSession();

    renderTracklist(album, false);
    renderAlbums(); // Update album list to show playing indicator
    audio.play().then(() => {
      isPlaying = true;
      updatePlayBtn();
      startProgress();
    }).catch(() => {
      isPlaying = false;
      updatePlayBtn();
    });
  }

  // ============================================================
  // CONTROLS - ALWAYS work on the PLAYING album
  // ============================================================
  function togglePlay() {
    if (!playingTrack) {
      // If nothing is playing but there's a viewed album, play first track
      if (viewedAlbum && !viewedAlbum.isCS) {
        playTrack(0);
      }
      return;
    }
    if (isPlaying) {
      audio.pause();
      isPlaying = false;
      clearInterval(timer);
    } else {
      audio.play().then(() => {
        isPlaying = true;
        startProgress();
      }).catch(() => {});
    }
    updatePlayBtn();
  }

  function updatePlayBtn() {
    const icon = isPlaying ? 'fa-pause-circle' : 'fa-play-circle';
    pcPlay.className = `fas ${icon}`;
    pmPlay.className = `fas ${icon}`;
    pfPlay.className = `fas ${icon}`;
  }

  function startProgress() {
    clearInterval(timer);
    timer = setInterval(() => {
      if (audio.duration && !isNaN(audio.duration)) {
        const p = (audio.currentTime / audio.duration) * 100;
        npPcFill.style.width = p + '%';
        pfFill.style.width = p + '%';
        const cm = Math.floor(audio.currentTime / 60);
        const cs = Math.floor(audio.currentTime % 60);
        const tm = Math.floor(audio.duration / 60);
        const ts = Math.floor(audio.duration % 60);
        npPcCur.textContent = `${cm}:${String(cs).padStart(2, '0')}`;
        pfCur.textContent = npPcCur.textContent;
        npPcTot.textContent = `${tm}:${String(ts).padStart(2, '0')}`;
        pfTot.textContent = npPcTot.textContent;
      }
    }, 200);
  }

  function seekTo(e, progressEl, fillEl, curTimeEl, totalTimeEl) {
    const rect = progressEl.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const percent = Math.min(1, Math.max(0, x));
    if (audio.duration && !isNaN(audio.duration)) {
      audio.currentTime = percent * audio.duration;
      fillEl.style.width = (percent * 100) + '%';
      const cm = Math.floor(audio.currentTime / 60);
      const cs = Math.floor(audio.currentTime % 60);
      curTimeEl.textContent = `${cm}:${String(cs).padStart(2, '0')}`;
      const tm = Math.floor(audio.duration / 60);
      const ts = Math.floor(audio.duration % 60);
      totalTimeEl.textContent = `${tm}:${String(ts).padStart(2, '0')}`;
    }
  }

  function nextTrack() {
    if (!playingAlbum) return;
    // Always skip on the PLAYING album
    const nextIdx = (playingIdx + 1) % playingAlbum.tracks.length;
    // Update the state for the playing album
    albumStates[playingAlbum.id] = { playingIdx: nextIdx };
    // Play the next track on the playing album
    playTrack(nextIdx);
  }

  function prevTrack() {
    if (!playingAlbum) return;
    // Always go previous on the PLAYING album
    const prevIdx = (playingIdx - 1 + playingAlbum.tracks.length) % playingAlbum.tracks.length;
    // Update the state for the playing album
    albumStates[playingAlbum.id] = { playingIdx: prevIdx };
    // Play the previous track on the playing album
    playTrack(prevIdx);
  }

  // ============================================================
  // NAVIGATION
  // ============================================================
  function goBack() {
    showAlbumList();
    // Artwork stays with playing song, or shows HTC5 if nothing playing
    updateArtwork();
  }

  function openFull() { pf.classList.add('active'); }
  function closeFull() { pf.classList.remove('active'); }

  // ============================================================
  // EVENT LISTENERS
  // ============================================================
  pcPlay.onclick = togglePlay;
  pcPrev.onclick = prevTrack;
  pcNext.onclick = nextTrack;
  pmPlay.onclick = togglePlay;
  pmNext.onclick = nextTrack;
  pmExpand.onclick = openFull;
  pfPlay.onclick = togglePlay;
  pfPrev.onclick = prevTrack;
  pfNext.onclick = nextTrack;
  pfClose.onclick = closeFull;
  backBtn.onclick = goBack;
  audio.onended = nextTrack;
  npPcProgress.addEventListener('click', (e) => seekTo(e, npPcProgress, npPcFill, npPcCur, npPcTot));
  pfProgress.addEventListener('click', (e) => seekTo(e, pfProgress, pfFill, pfCur, pfTot));

  // ============================================================
  // INIT
  // ============================================================
  renderAlbums();
  showAlbumList();

  // Default artwork: HTC5 (Coming Soon)
  updateArtwork();
  pmArt.src = getImage(allAlbums[4]);

  // Responsive
  const main = document.getElementById('main');
  const resize = () => main.style.flexDirection = window.innerWidth <= 860 ? 'column' : 'row';
  resize();
  window.onresize = resize;
})();
