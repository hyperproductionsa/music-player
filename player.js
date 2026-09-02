(async function() {
  const res = await fetch('data.json');
  const DATA = await res.json();
  const { baseUrl, comingSoon, albums, comingSoonAlbum } = DATA;

  const isUnlocked = () => new Date() >= new Date(comingSoon);
  const audio = new Audio();
  const getAudio = (a, t) => `${baseUrl}/m4a/${a.folder}/${t.file}`;
  const getImage = (a) => `${baseUrl}/images/${a.cover}`;

  let curAlbum = null, curTrack = null, curIdx = 0, isPlaying = false, timer = null;
  let isTracklistView = false;

  // DOM
  const $ = id => document.getElementById(id);
  const artImg = $('artImg'), csOverlay = $('csOverlay'), csTitle = $('csTitle'), csSub = $('csSub'), csDate = $('csDate');
  const albumList = $('albumList'), tracklist = $('tracklist'), tracklistWrap = $('tracklistWrap'), tlTitle = $('tlTitle'), tlArtist = $('tlArtist');
  const npPcTrack = $('npPcTrack'), npPcArtist = $('npPcArtist'), npPcFill = $('npPcFill'), npPcCur = $('npPcCur'), npPcTot = $('npPcTot');
  const npPcProgress = $('npPcProgress');
  const pcPlay = $('pcPlay'), pcPrev = $('pcPrev'), pcNext = $('pcNext');
  const pmArt = $('pmArt'), pmTitle = $('pmTitle'), pmArtist = $('pmArtist'), pmPlay = $('pmPlay'), pmNext = $('pmNext'), pmExpand = $('pmExpand');
  const pf = $('playerFull'), pfArt = $('pfArt'), pfTitle = $('pfTitle'), pfArtist = $('pfArtist'), pfFill = $('pfFill'), pfCur = $('pfCur'), pfTot = $('pfTot');
  const pfProgress = $('pfProgress');
  const pfPlay = $('pfPlay'), pfPrev = $('pfPrev'), pfNext = $('pfNext'), pfClose = $('pfClose');
  const backBtn = $('backBtn'), headerBadge = $('headerBadge');

  // Media Session API
  function updateMediaSession(album, track) {
    if ('mediaSession' in navigator) {
      const title = track.mix ? `${track.title} (${track.mix})` : track.title;
      navigator.mediaSession.metadata = new MediaMetadata({
        title: title,
        artist: track.artist,
        album: album.title,
        artwork: [{ src: getImage(album), sizes: '512x512', type: 'image/jpeg' }]
      });
    }
  }

  const allAlbums = [...albums, { ...comingSoonAlbum, isCS: true }];

  // View functions
  function showAlbumListView() {
    isTracklistView = false;
    albumList.style.display = 'flex';
    tracklistWrap.style.display = 'none';
    backBtn.style.display = 'none';
    headerBadge.style.display = 'inline';
    headerBadge.textContent = '5 albums';
  }

  function showTracklistView() {
    isTracklistView = true;
    albumList.style.display = 'none';
    tracklistWrap.style.display = 'flex';
    backBtn.style.display = 'inline';
    headerBadge.style.display = 'none';
  }

  // Render album list (HTC5 first)
  function renderAlbums() {
    const sorted = [...allAlbums].reverse();
    albumList.innerHTML = sorted.map((a, i) => {
      const idx = allAlbums.length - 1 - i;
      const isCS = a.isCS || false;
      return `
        <div class="album-item" data-idx="${idx}">
          <div class="ai-art"><img src="${getImage(a)}" alt="${a.title}" /></div>
          <div class="ai-info">
            <div class="ai-title">${a.title}</div>
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

  // Render tracklist
  function renderTracklist(album, isLocked = false) {
    showTracklistView();
    
    if (!album) return;
    
    tlTitle.textContent = album.title;
    tlArtist.textContent = `${album.artist} · ${album.year}`;
    
    if (isLocked || album.isCS) {
      tracklist.innerHTML = `
        <div class="track-item locked" style="background:#1a1a1a;border-bottom:1px solid #2a2a2a;padding:12px 14px;cursor:default;">
          <div class="ti-info" style="text-align:center;">
            <div class="ti-title" style="color:#e5de69;font-size:.9rem;"><i class="fas fa-clock"></i> Coming ${new Date(album.releaseDate).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
            <div class="ti-artist" style="color:#888;">${album.trackCount || album.tracks.length} tracks</div>
          </div>
        </div>
      `;
      album.tracks.forEach((t, i) => {
        const title = t.mix ? `${t.title} (${t.mix})` : t.title;
        tracklist.innerHTML += `
          <div class="track-item locked" style="opacity:.5;cursor:default;pointer-events:none;">
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
    
    tracklist.innerHTML = album.tracks.map((t, i) => {
      const active = curTrack === t;
      const title = t.mix ? `${t.title} (${t.mix})` : t.title;
      return `
        <div class="track-item ${active ? 'active' : ''}" data-idx="${i}">
          <div class="ti-play"><i class="fas ${active ? 'fa-play-circle' : 'fa-play'}"></i></div>
          <div class="ti-info">
            <div class="ti-title">${title}</div>
            <div class="ti-artist">${t.artist}</div>
          </div>
          <div class="ti-dur">${active ? '▶' : '♫'}</div>
        </div>
      `;
    }).join('');
    tracklist.querySelectorAll('.track-item:not(.locked)').forEach(el => {
      el.onclick = () => playTrack(parseInt(el.dataset.idx));
    });
  }

  // Load album
  function loadAlbum(idx) {
    const album = allAlbums[idx];
    const isLocked = album.isCS || false;
    
    audio.pause();
    audio.src = '';
    isPlaying = false;
    clearInterval(timer);
    updatePlayBtn();
    
    artImg.src = getImage(album);
    if (isLocked) {
      csOverlay.style.display = 'flex';
      csTitle.textContent = album.title;
      csSub.textContent = `${album.artist} · ${album.year} · ${album.trackCount || album.tracks.length} tracks`;
      csDate.textContent = new Date(album.releaseDate).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
    } else {
      csOverlay.style.display = 'none';
    }
    
    pmArt.src = getImage(album);
    curAlbum = isLocked ? null : album;
    curTrack = null;
    curIdx = 0;
    
    npPcTrack.textContent = 'Select a track';
    npPcArtist.textContent = isLocked ? `${album.artist} · ${album.year}` : '—';
    npPcFill.style.width = '0%';
    npPcCur.textContent = '0:00';
    npPcTot.textContent = '0:00';
    pmTitle.textContent = 'Select a track';
    pmArtist.textContent = isLocked ? `${album.artist} · ${album.year}` : '—';
    
    renderTracklist(album, isLocked);
  }

  // Play track
  function playTrack(idx) {
    if (!curAlbum) return;
    const track = curAlbum.tracks[idx];
    if (!track) return;
    
    curTrack = track;
    curIdx = idx;
    const url = getAudio(curAlbum, track);
    audio.src = url;
    audio.load();
    
    const title = track.mix ? `${track.title} (${track.mix})` : track.title;
    npPcTrack.textContent = title;
    npPcArtist.textContent = track.artist;
    pmTitle.textContent = title;
    pmArtist.textContent = track.artist;
    pfTitle.textContent = title;
    pfArtist.textContent = track.artist;
    pfArt.src = getImage(curAlbum);
    pmArt.src = getImage(curAlbum);
    
    updateMediaSession(curAlbum, track);
    renderTracklist(curAlbum, false);
    
    audio.play().then(() => {
      isPlaying = true;
      updatePlayBtn();
      startProgress();
    }).catch(() => {
      isPlaying = false;
      updatePlayBtn();
    });
  }

  // Play controls
  function togglePlay() {
    if (!curTrack) return;
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
        npPcCur.textContent = `${cm}:${String(cs).padStart(2,'0')}`;
        pfCur.textContent = npPcCur.textContent;
        npPcTot.textContent = `${tm}:${String(ts).padStart(2,'0')}`;
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
      curTimeEl.textContent = `${cm}:${String(cs).padStart(2,'0')}`;
      const tm = Math.floor(audio.duration / 60);
      const ts = Math.floor(audio.duration % 60);
      totalTimeEl.textContent = `${tm}:${String(ts).padStart(2,'0')}`;
    }
  }

  function nextTrack() {
    if (curAlbum) playTrack((curIdx + 1) % curAlbum.tracks.length);
  }
  function prevTrack() {
    if (curAlbum) playTrack((curIdx - 1 + curAlbum.tracks.length) % curAlbum.tracks.length);
  }

  function openFull() { pf.classList.add('active'); }
  function closeFull() { pf.classList.remove('active'); }

  function goBack() {
    showAlbumListView();
    const defaultAlbum = allAlbums[4];
    artImg.src = getImage(defaultAlbum);
    csOverlay.style.display = 'flex';
    csTitle.textContent = defaultAlbum.title;
    csSub.textContent = `${defaultAlbum.artist} · ${defaultAlbum.year} · ${defaultAlbum.trackCount} tracks`;
    csDate.textContent = new Date(defaultAlbum.releaseDate).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
    pmArt.src = getImage(defaultAlbum);
    npPcTrack.textContent = 'Select a track';
    npPcArtist.textContent = '—';
    npPcFill.style.width = '0%';
    npPcCur.textContent = '0:00';
    npPcTot.textContent = '0:00';
    pmTitle.textContent = 'Select a track';
    pmArtist.textContent = '—';
    audio.pause();
    audio.src = '';
    isPlaying = false;
    updatePlayBtn();
  }

  // Event listeners
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
  // INIT - Album list visible, NO auto-load
  // ============================================================
  renderAlbums();
  showAlbumListView(); // ← This is the key fix
  
  // Set default artwork to HTC5 (Coming Soon)
  const defaultAlbum = allAlbums[4];
  artImg.src = getImage(defaultAlbum);
  csOverlay.style.display = 'flex';
  csTitle.textContent = defaultAlbum.title;
  csSub.textContent = `${defaultAlbum.artist} · ${defaultAlbum.year} · ${defaultAlbum.trackCount} tracks`;
  csDate.textContent = new Date(defaultAlbum.releaseDate).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
  pmArt.src = getImage(defaultAlbum);

  // Responsive
  const main = document.getElementById('main');
  const resize = () => main.style.flexDirection = window.innerWidth <= 860 ? 'column' : 'row';
  resize();
  window.onresize = resize;
})(); 
