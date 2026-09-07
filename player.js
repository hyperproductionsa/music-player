(async function() {
  const res = await fetch('data.json');
  const DATA = await res.json();
  const { baseUrl, comingSoon, albums, comingSoonAlbum } = DATA;

  const releaseDate = new Date(comingSoon);
  const isUnlocked = () => new Date() >= releaseDate;
  const audio = new Audio();
  const getAudio = (a, t) => `${baseUrl}/m4a/${a.folder}/${t.file}`;
  const getImage = (a) => `${baseUrl}/images/${a.cover}`;

  let playingAlbum = null;
  let playingTrack = null;
  let playingIdx = 0;
  let isPlaying = false;
  let timer = null;
  let viewedAlbum = null;
  const albumStates = {};

  // DOM
  const $ = id => document.getElementById(id);
  const albumList = $('albumList');
  const tracklistWrap = $('tracklistWrap');
  const tracklist = $('tracklist');
  const tlTitle = $('tlTitle');
  const tlArtist = $('tlArtist');
  const tlBuyBtn = $('tlBuyBtn');
  const backBtn = $('backBtn');
  const headerBadge = $('headerBadge');
  const artImg = $('artImg');
  const countdownOverlay = $('countdownOverlay');
  const artBuyContainer = $('artBuyContainer');
  const artBuyBtn = $('artBuyBtn');
  const artBuyPrice = $('artBuyPrice');
  const cdDays = $('cdDays');
  const cdHours = $('cdHours');
  const cdMinutes = $('cdMinutes');
  const cdSeconds = $('cdSeconds');
  const csDate = $('csDate');
  const footerArt = $('footerArt');
  const footerTitle = $('footerTitle');
  const footerArtist = $('footerArtist');
  const footerFill = $('footerFill');
  const footerCur = $('footerCur');
  const footerTot = $('footerTot');
  const footerProgress = $('footerProgress');
  const footerPlay = $('footerPlay');
  const footerPrev = $('footerPrev');
  const footerNext = $('footerNext');
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
  // BUY ALBUM FUNCTION
  // ============================================================
  window.buyAlbum = async function(albumId) {
    // TODO: Replace with your Cloudflare Worker URL
    const workerUrl = 'https://your-worker.workers.dev/checkout';
    
    try {
      const response = await fetch(workerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          productId: albumId,
          price: 15000 // R150 in cents
        })
      });
      
      const data = await response.json();
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        alert('Payment error. Please try again.');
      }
    } catch (error) {
      console.error('Payment error:', error);
      alert('Payment error. Please try again.');
    }
  };

  // ============================================================
  // COUNTDOWN TIMER
  // ============================================================
  function updateCountdown() {
    const now = new Date();
    const diff = releaseDate - now;
    
    if (diff <= 0) {
      countdownOverlay.innerHTML = `
        <div style="color:#e5de69;font-size:2.5rem;margin-bottom:10px;"><i class="fas fa-check-circle"></i></div>
        <div style="color:#e5de69;font-size:1.2rem;font-weight:700;background:#1e1d12;padding:8px 24px;border-radius:40px;border:2px solid #e5de69;margin-bottom:12px;">NOW AVAILABLE</div>
        <h2 style="color:#fff;font-size:2rem;">HTs Collections V</h2>
        <p style="color:#aaa;font-size:1rem;margin:6px 0;">HyperSOUL-X · 2026 · 14 tracks</p>
      `;
      return;
    }
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    
    cdDays.textContent = String(days).padStart(2, '0');
    cdHours.textContent = String(hours).padStart(2, '0');
    cdMinutes.textContent = String(minutes).padStart(2, '0');
    cdSeconds.textContent = String(seconds).padStart(2, '0');
    
    csDate.textContent = releaseDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  // ============================================================
  // SMART CAROUSEL
  // ============================================================
  function updateMobileText(title, artist) {
    if (!pmTitle || !pmArtist) return;
    
    pmTitle.textContent = title || 'Select a track';
    pmArtist.textContent = artist || '—';
    
    pmTitle.classList.remove('scroll');
    void pmTitle.offsetWidth;
    if (pmTitle.scrollWidth > pmTitle.clientWidth) {
      pmTitle.classList.add('scroll');
    }
    
    pmArtist.classList.remove('scroll');
    void pmArtist.offsetWidth;
    if (pmArtist.scrollWidth > pmArtist.clientWidth) {
      pmArtist.classList.add('scroll');
    }
  }

  // ============================================================
  // UPDATE ARTWORK
  // ============================================================
  function updateArtwork(album) {
    if (album) {
      artImg.src = getImage(album);
      countdownOverlay.style.display = 'none';
    } else {
      const defaultAlbum = allAlbums[4];
      artImg.src = getImage(defaultAlbum);
      countdownOverlay.style.display = 'flex';
      updateCountdown();
    }
  }

  // ============================================================
  // UPDATE BUY BUTTON
  // ============================================================
  function updateBuyButton(album) {
    if (!album || album.isCS) {
      artBuyContainer.style.display = 'none';
      tlBuyBtn.style.display = 'none';
      return;
    }
    artBuyContainer.style.display = 'flex';
    artBuyBtn.onclick = () => buyAlbum(album.id);
    artBuyPrice.textContent = 'R150';
    
    tlBuyBtn.style.display = 'flex';
    tlBuyBtn.onclick = () => buyAlbum(album.id);
  }

  // ============================================================
  // UPDATE NOW PLAYING UI
  // ============================================================
  function updateNowPlaying() {
    if (!playingTrack || !playingAlbum) {
      footerTitle.textContent = 'Select a track';
      footerArtist.textContent = '—';
      pfTitle.textContent = 'Select a track';
      pfArtist.textContent = '—';
      updateMobileText('Select a track', '—');
      return;
    }
    const title = playingTrack.mix ? `${playingTrack.title} (${playingTrack.mix})` : playingTrack.title;
    footerTitle.textContent = title;
    footerArtist.textContent = playingTrack.artist;
    pfTitle.textContent = title;
    pfArtist.textContent = playingTrack.artist;
    updateMobileText(title, playingTrack.artist);
    
    const art = getImage(playingAlbum);
    footerArt.src = art;
    pmArt.src = art;
    pfArt.src = art;
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
    // Hide tracklist buy button when in album list view
    tlBuyBtn.style.display = 'none';
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
          <div class="ai-cart" onclick="event.stopPropagation(); buyAlbum('${a.id}')" title="Buy album"><i class="fas fa-shopping-cart"></i></div>
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
    viewedAlbum = album;
    
    // Update buy button in tracklist header
    updateBuyButton(album);

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

    const state = albumStates[album.id];
    const savedIdx = state ? state.playingIdx : 0;

    tracklist.innerHTML = album.tracks.map((t, i) => {
      const isSavedTrack = (state && i === savedIdx);
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
      el.onclick = () => {
        const albumToPlay = viewedAlbum;
        if (!albumToPlay || albumToPlay.isCS) return;
        const trackIdx = parseInt(el.dataset.idx);
        playTrack(trackIdx, albumToPlay);
      };
    });
  }

  // ============================================================
  // LOAD ALBUM
  // ============================================================
  function loadAlbum(idx) {
    const album = allAlbums[idx];
    const isLocked = album.isCS || false;
    viewedAlbum = album;
    
    // Update artwork and buy button
    updateArtwork(album);
    updateBuyButton(album);
    
    renderTracklist(album, isLocked);
  }

  // ============================================================
  // PLAY TRACK
  // ============================================================
  function playTrack(idx, album) {
    if (!album) album = viewedAlbum;
    if (!album || album.isCS) return;
    
    const track = album.tracks[idx];
    if (!track) return;

    playingAlbum = album;
    playingTrack = track;
    playingIdx = idx;

    albumStates[album.id] = { playingIdx: idx };

    const url = getAudio(album, track);
    
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

    audio.src = url;
    audio.load();

    updateNowPlaying();
    setupMediaSession();

    renderTracklist(album, false);
    renderAlbums();
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
  // CONTROLS
  // ============================================================
  function togglePlay() {
    if (!playingTrack) {
      if (viewedAlbum && !viewedAlbum.isCS) {
        playTrack(0, viewedAlbum);
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
    footerPlay.className = `fas ${icon}`;
    pmPlay.className = `fas ${icon}`;
    pfPlay.className = `fas ${icon}`;
  }

  function startProgress() {
    clearInterval(timer);
    timer = setInterval(() => {
      if (audio.duration && !isNaN(audio.duration)) {
        const p = (audio.currentTime / audio.duration) * 100;
        footerFill.style.width = p + '%';
        pfFill.style.width = p + '%';
        const cm = Math.floor(audio.currentTime / 60);
        const cs = Math.floor(audio.currentTime % 60);
        const tm = Math.floor(audio.duration / 60);
        const ts = Math.floor(audio.duration % 60);
        footerCur.textContent = `${cm}:${String(cs).padStart(2, '0')}`;
        pfCur.textContent = footerCur.textContent;
        footerTot.textContent = `${tm}:${String(ts).padStart(2, '0')}`;
        pfTot.textContent = footerTot.textContent;
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
    const nextIdx = (playingIdx + 1) % playingAlbum.tracks.length;
    albumStates[playingAlbum.id] = { playingIdx: nextIdx };
    playTrack(nextIdx, playingAlbum);
  }

  function prevTrack() {
    if (!playingAlbum) return;
    const prevIdx = (playingIdx - 1 + playingAlbum.tracks.length) % playingAlbum.tracks.length;
    albumStates[playingAlbum.id] = { playingIdx: prevIdx };
    playTrack(prevIdx, playingAlbum);
  }

  // ============================================================
  // NAVIGATION
  // ============================================================
  function goBack() {
    showAlbumList();
    // Reset to HTC5 artwork
    const defaultAlbum = allAlbums[4];
    updateArtwork(defaultAlbum);
    // Hide buy button
    artBuyContainer.style.display = 'none';
    tlBuyBtn.style.display = 'none';
  }

  function openFull() { pf.classList.add('active'); }
  function closeFull() { pf.classList.remove('active'); }

  // ============================================================
  // EVENT LISTENERS
  // ============================================================
  footerPlay.onclick = togglePlay;
  footerPrev.onclick = prevTrack;
  footerNext.onclick = nextTrack;
  pmPlay.onclick = togglePlay;
  pmNext.onclick = nextTrack;
  pmExpand.onclick = openFull;
  pfPlay.onclick = togglePlay;
  pfPrev.onclick = prevTrack;
  pfNext.onclick = nextTrack;
  pfClose.onclick = closeFull;
  backBtn.onclick = goBack;
  audio.onended = nextTrack;
  footerProgress.addEventListener('click', (e) => seekTo(e, footerProgress, footerFill, footerCur, footerTot));
  pfProgress.addEventListener('click', (e) => seekTo(e, pfProgress, pfFill, pfCur, pfTot));

  // ============================================================
  // INIT
  // ============================================================
  renderAlbums();
  showAlbumList();
  
  // Start with HTC5 (Coming Soon)
  const defaultAlbum = allAlbums[4];
  updateArtwork(defaultAlbum);
  updateMobileText('Select a track', '—');
  footerArt.src = getImage(defaultAlbum);
  pmArt.src = getImage(defaultAlbum);
  
  // Hide buy button initially
  artBuyContainer.style.display = 'none';
  tlBuyBtn.style.display = 'none';
  
  // Update countdown every second
  updateCountdown();
  setInterval(updateCountdown, 1000);

  const main = document.getElementById('main');
  const resize = () => {
    main.style.flexDirection = window.innerWidth <= 860 ? 'column' : 'row';
    document.getElementById('pcFooter').style.display = window.innerWidth <= 860 ? 'none' : 'flex';
  };
  resize();
  window.onresize = resize;
})();
