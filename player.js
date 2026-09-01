(async function() {
  const res = await fetch('data.json');
  const DATA = await res.json();
  const { baseUrl, comingSoon, albums, comingSoonAlbum } = DATA;

  const isUnlocked = () => new Date() >= new Date(comingSoon);
  const audio = new Audio();
  const getAudio = (a, t) => `${baseUrl}/aac/${a.folder}/${t.file}`;
  const getImage = (a) => `${baseUrl}/images/${a.cover}`;

  let curAlbum = null, curTrack = null, curIdx = 0, isPlaying = false, timer = null, albumIdx = 0;

  // DOM
  const $ = id => document.getElementById(id);
  const artImg = $('artImg'), csOverlay = $('csOverlay'), csTitle = $('csTitle'), csSub = $('csSub'), csDate = $('csDate');
  const albumList = $('albumList'), tracklist = $('tracklist'), tracklistWrap = $('tracklistWrap'), tlTitle = $('tlAlbumTitle'), tlArtist = $('tlAlbumArtist');
  const npPcTrack = $('npPcTrack'), npPcArtist = $('npPcArtist'), npPcFill = $('npPcFill'), npPcCur = $('npPcCur'), npPcTot = $('npPcTot');
  const pcPlay = $('pcPlay'), pcPrev = $('pcPrev'), pcNext = $('pcNext');
  const pmArt = $('pmArt'), pmTitle = $('pmTitle'), pmArtist = $('pmArtist'), pmPlay = $('pmPlay'), pmNext = $('pmNext'), pmExpand = $('pmExpand');
  const pf = $('playerFull'), pfArt = $('pfArt'), pfTitle = $('pfTitle'), pfArtist = $('pfArtist'), pfFill = $('pfFill'), pfCur = $('pfCur'), pfTot = $('pfTot');
  const pfPlay = $('pfPlay'), pfPrev = $('pfPrev'), pfNext = $('pfNext'), pfClose = $('pfClose');

  const allAlbums = [...albums, { ...comingSoonAlbum, isCS: true }];

  // Render Album List
  function renderAlbums() {
    albumList.innerHTML = allAlbums.map((a, i) => {
      const isActive = i === albumIdx;
      const isCS = a.isCS || false;
      return `
        <div class="album-item ${isActive ? 'active' : ''}" data-idx="${i}">
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
    tracklistWrap.style.display = 'flex';
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

    // Handle HTC5 locked
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

    // HTC5 unlocked or other albums
    if (album.isCS && unlocked) {
      curAlbum = { id: 'htc5', title: album.title, artist: album.artist, year: album.year, cover: album.cover, folder: 'HTC5', tracks: album.tracks };
    } else {
      curAlbum = album;
    }

    csOverlay.style.display = 'none';
    artImg.src = getImage(curAlbum);
    audio.pause(); audio.src = ''; isPlaying = false; curTrack = null; curIdx = 0;
    npPcTrack.textContent = 'Select a track';
    npPcArtist.textContent = `${curAlbum.artist} · ${curAlbum.year}`;
    npPcFill.style.width = '0%'; npPcCur.textContent = '0:00'; npPcTot.textContent = '0:00';
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

  function nextTrack() { if (curAlbum) playTrack((curIdx + 1) % curAlbum.tracks.length); }
  function prevTrack() { if (curAlbum) playTrack((curIdx - 1 + curAlbum.tracks.length) % curAlbum.tracks.length); }

  // Mobile full player
  function openFull() { pf.classList.add('active'); }
  function closeFull() { pf.classList.remove('active'); }

  // Events
  pcPlay.onclick = togglePlay; pcPrev.onclick = prevTrack; pcNext.onclick = nextTrack;
  pmPlay.onclick = togglePlay; pmNext.onclick = nextTrack; pmExpand.onclick = openFull;
  pfPlay.onclick = togglePlay; pfPrev.onclick = prevTrack; pfNext.onclick = nextTrack; pfClose.onclick = closeFull;
  audio.onended = nextTrack;

  // Init
  renderAlbums();
  loadAlbum(4); // Start with HTC5 (coming soon)

  // Responsive
  const main = document.getElementById('main');
  const resize = () => main.style.flexDirection = window.innerWidth <= 860 ? 'column' : 'row';
  resize(); window.onresize = resize;
})(); 
