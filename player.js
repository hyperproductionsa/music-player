(async function() {
  const res = await fetch('data.json');
  const DATA = await res.json();
  const { baseUrl, comingSoon, albums, comingSoonAlbum } = DATA;

  const isUnlocked = () => new Date() >= new Date(comingSoon);
  const audio = new Audio();
  const getAudio = (a, t) => `${baseUrl}/m4a/${a.folder}/${t.file}`;
  const getImage = (a) => `${baseUrl}/images/${a.cover}`;

  let curAlbum = null, curTrack = null, curIdx = 0, isPlaying = false, timer = null, albumIdx = 0;
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
        artwork: [
          { src: getImage(album), sizes: '512x512', type: 'image/jpeg' }
        ]
      });
    }
  }

  const allAlbums = [...albums, { ...comingSoonAlbum, isCS: true }];

  // Show/Hide views
  function showAlbumList() {
    isTracklistView = false;
    albumList.style.display = 'flex';
    tracklistWrap.style.display = 'none';
    backBtn.style.display = 'none';
    headerBadge.style.display = 'inline';
    headerBadge.textContent = '5 albums';
  }

  function showTracklist() {
    isTracklistView = true;
    albumList.style.display = 'none';
    tracklistWrap.style.display = 'flex';
    backBtn.style.display = 'inline';
    headerBadge.style.display = 'none';
  }

  // Render Album List (HTC5 first)
  function renderAlbums() {
    const sortedAlbums = [...allAlbums].reverse();
    albumList.innerHTML = sortedAlbums.map((a, i) => {
      const originalIdx = allAlbums.length - 1 - i;
      const isActive = originalIdx === albumIdx;
      const isCS = a.isCS || false;
      return `
        <div class="album-item ${isActive ? 'active' : ''}" data-idx="${originalIdx}">
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
    albumList.querySelectorAll('.album-item').forEach(el => el.onclick = () => loadAlbum(+el.dataset.idx));
  }

  // Render Tracklist
  function renderTracks(album, locked = false) {
    showTracklist();
    if (!album || locked) {
      tlTitle.textContent = 'Coming Soon';
      tlArtist.textContent = '—';
      tracklist.innerHTML = `<div class="track-item" style="opacity:.4;cursor:default;pointer-events:none;justify-content:center;padding:20px;color:#666;">🔒 This album is coming soon</div>`;
      return;
    }
    tlTitle.textContent = album.title;
    tlArtist.textContent = `${album.artist} · ${album.year}`;
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
    tracklist.querySelectorAll('.track-item').forEach(el => el.onclick = () => playTrack(+el.dataset.idx));
  }

  // Load Album
  function loadAlbum(idx) {
    const album = allAlbums[idx];
    albumIdx = idx;
    const unlocked = isUnlocked();

    // Stop current audio
    audio.pause();
    audio.src = '';
    isPlaying = false;
    clearInterval(timer);
    updatePlayBtn();

    if (album.isCS && !unlocked) {
      curAlbum = null; curTrack = null;
      artImg.src = getImage(album);
      csOverlay.style.display = 'flex';
      csTitle.textContent = album.title;
      csSub.textContent = `${album.artist} · ${album.year} · ${album.trackCount} tracks`;
      csDate.textContent = new Date(album.releaseDate).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
      renderTracks(null, true);
      renderAlbums();
      updatePlayBtn();
      return;
    }

    if (album.isCS && unlocked) {
      curAlbum = { id: 'htc5', title: album.title, artist: album.artist, year: album.year, cover: album.cover, folder: 'HTC5', tracks: album.tracks };
    } else {
      curAlbum = album;
    }

    csOverlay.style.display = 'none';
    artImg.src = getImage(curAlbum);
    curTrack = null; curIdx = 0;
    npPcTrack.textContent = 'Select a track';
    npPcArtist.textContent = `${curAlbum.artist} · ${curAlbum.year}`;
    npPcFill.style.width = '0%'; npPcCur.textContent = '0:00'; npPcTot.textContent = '0:00';
    pfFill.style.width = '0%'; pfCur.textContent = '0:00'; pfTot.textContent = '0:00';
    pmArt.src = getImage(curAlbum); pmTitle.textContent = 'Select a track'; pmArtist.textContent = '—';
    renderTracks(curAlbum);
    renderAlbums();
    updatePlayBtn();
  }

  // Play Track
  function playTrack(idx) {
    if (!curAlbum) return;
    const track = curAlbum.tracks[idx];
    if (!track) return;
    curTrack = track; curIdx = idx;
    const url = getAudio(curAlbum, track);
    audio.src = url; audio.load();
    const title = track.mix ? `${track.title} (${track.mix})` : track.title;
    npPcTrack.textContent = title; npPcArtist.textContent = track.artist;
    pmTitle.textContent = title; pmArtist.textContent = track.artist;
    pfTitle.textContent = title; pfArtist.textContent = track.artist;
    pfArt.src = getImage(curAlbum);
    pmArt.src = getImage(curAlbum);
    updateMediaSession(curAlbum, track);
    renderTracks(curAlbum);
    audio.play().then(() => { isPlaying = true; updatePlayBtn(); startProgress(); }).catch(() => { isPlaying = false; updatePlayBtn(); });
  }

  // Toggle Play
  function togglePlay() {
    if (!curTrack) return;
    if (isPlaying) { audio.pause(); isPlaying = false; clearInterval(timer); }
    else { audio.play().then(() => { isPlaying = true; startProgress(); }).catch(() => {}); }
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
        npPcFill.style.width = p + '%'; pfFill.style.width = p + '%';
        const cm = Math.floor(audio.currentTime / 60), cs = Math.floor(audio.currentTime % 60);
        const tm = Math.floor(audio.duration / 60), ts = Math.floor(audio.duration % 60);
        npPcCur.textContent = `${cm}:${String(cs).padStart(2,'0')}`; pfCur.textContent = npPcCur.textContent;
        npPcTot.textContent = `${tm}:${String(ts).padStart(2,'0')}`; pfTot.textContent = npPcTot.textContent;
      }
    }, 200);
  }

  // Seek function
  function seekTo(e, progressEl, fillEl, curTimeEl, totalTimeEl) {
    const rect = progressEl.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const percent = Math.min(1, Math.max(0, x));
    if (audio.duration && !isNaN(audio.duration)) {
      audio.currentTime = percent * audio.duration;
      fillEl.style.width = (percent * 100) + '%';
      const cm = Math.floor(audio.currentTime / 60), cs = Math.floor(audio.currentTime % 60);
      curTimeEl.textContent = `${cm}:${String(cs).padStart(2,'0')}`;
      const tm = Math.floor(audio.duration / 60), ts = Math.floor(audio.duration % 60);
      totalTimeEl.textContent = `${tm}:${String(ts).padStart(2,'0')}`;
    }
  }

  // Progress bar click events
  npPcProgress.addEventListener('click', (e) => seekTo(e, npPcProgress, npPcFill, npPcCur, npPcTot));
  pfProgress.addEventListener('click', (e) => seekTo(e, pfProgress, pfFill, pfCur, pfTot));

  function nextTrack() { if (curAlbum) playTrack((curIdx + 1) % curAlbum.tracks.length); }
  function prevTrack() { if (curAlbum) playTrack((curIdx - 1 + curAlbum.tracks.length) % curAlbum.tracks.length); }

  // Mobile full player
  function openFull() { pf.classList.add('active'); }
  function closeFull() { pf.classList.remove('active'); }

  // Back button
  backBtn.onclick = showAlbumList;

  // Events
  pcPlay.onclick = togglePlay; pcPrev.onclick = prevTrack; pcNext.onclick = nextTrack;
  pmPlay.onclick = togglePlay; pmNext.onclick = nextTrack; pmExpand.onclick = openFull;
  pfPlay.onclick = togglePlay; pfPrev.onclick = prevTrack; pfNext.onclick = nextTrack; pfClose.onclick = closeFull;
  audio.onended = nextTrack;

  // ============================================================
  // INIT - Show album list, don't auto-load any album
  // ============================================================
  renderAlbums();
  showAlbumList();

  // Set default artwork to HTC5 (coming soon)
  artImg.src = getImage(allAlbums[4]);
  csOverlay.style.display = 'flex';
  csTitle.textContent = allAlbums[4].title;
  csSub.textContent = `${allAlbums[4].artist} · ${allAlbums[4].year} · ${allAlbums[4].trackCount} tracks`;
  csDate.textContent = new Date(allAlbums[4].releaseDate).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
  pmArt.src = getImage(allAlbums[4]);

  // Responsive
  const main = document.getElementById('main');
  const resize = () => main.style.flexDirection = window.innerWidth <= 860 ? 'column' : 'row';
  resize(); window.onresize = resize;
})();
