(async function() {
  const res = await fetch('data.json');
  const DATA = await res.json();
  const { baseUrl, comingSoon, albums, comingSoonAlbum } = DATA;

  const releaseDate = new Date(comingSoon);
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
  const volumeSlider = $('volumeSlider');
  const volumeIcon = $('volumeIcon');
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
  // VOLUME CONTROL
  // ============================================================
  audio.volume = 0.8;
  if (volumeSlider) {
    volumeSlider.value = 0.8;
    volumeSlider.addEventListener('input', function() {
      audio.volume = parseFloat(this.value);
      updateVolumeIcon();
    });
  }

  function updateVolumeIcon() {
    if (!volumeIcon) return;
    const vol = audio.volume;
    if (vol === 0) {
      volumeIcon.className = 'fas fa-volume-mute';
    } else if (vol < 0.5) {
      volumeIcon.className = 'fas fa-volume-down';
    } else {
      volumeIcon.className = 'fas fa-volume-up';
    }
  }

  if (volumeIcon) {
    volumeIcon.addEventListener('click', function() {
      if (audio.volume > 0) {
        audio.volume = 0;
        if (volumeSlider) volumeSlider.value = 0;
      } else {
        audio.volume = 0.8;
        if (volumeSlider) volumeSlider.value = 0.8;
      }
      updateVolumeIcon();
    });
  }

  // ============================================================
  // BUY ALBUM FUNCTION
  // ============================================================
  window.buyAlbum = async function(albumId) {
    const workerUrl = 'https://yoco-checkout.hyperproductionsa.workers.dev';
    
    console.log('🔵 Buy Album clicked:', albumId);
    console.log('🔵 Calling worker:', workerUrl);
    
    try {
      const response = await fetch(workerUrl, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ 
          productId: albumId,
          price: 15000
        })
      });
      
      console.log('🔵 Response status:', response.status);
      const data = await response.json();
      console.log('🔵 Response data:', data);
      
      const redirectUrl = data.redirectUrl || data.checkoutUrl;
      
      if (response.ok && redirectUrl) {
        console.log('✅ Redirecting to:', redirectUrl);
        window.location.href = redirectUrl;
      } else {
        alert('Payment error: ' + (data.error || data.message || 'Please try again.'));
        console.error('❌ Payment error:', data);
      }
    } catch (error) {
      console.error('❌ Fetch error:', error);
      alert('Payment error: ' + error.message);
    }
  };

  // ============================================================
  // COUNTDOWN TIMER
  // ============================================================
  function updateCountdown() {
    if (!countdownOverlay) return;
    const now = new Date();
    const diff = releaseDate - now;
    
    if (diff <= 0) {
      countdownOverlay.innerHTML = `
        <div style="color:#e5de69;font-size:2rem;margin-bottom:8px;"><i class="fas fa-check-circle"></i></div>
        <div style="color:#e5de69;font-size:1rem;font-weight:700;background:#1e1d12;padding:6px 20px;border-radius:40px;border:2px solid #e5de69;margin-bottom:10px;">NOW AVAILABLE</div>
        <h2 style="color:#fff;font-size:1.6rem;">HTs Collections V</h2>
        <p style="color:#aaa;font-size:.85rem;margin:4px 0;">HyperSOUL-X · 2026 · 14 tracks</p>
      `;
      return;
    }
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    
    if (cdDays) cdDays.textContent = String(days).padStart(2, '0');
    if (cdHours) cdHours.textContent = String(hours).padStart(2, '0');
    if (cdMinutes) cdMinutes.textContent = String(minutes).padStart(2, '0');
    if (cdSeconds) cdSeconds.textContent = String(seconds).padStart(2, '0');
    if (csDate) csDate.textContent = releaseDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
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
    if (!artImg || !countdownOverlay) return;
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
      if (artBuyContainer) artBuyContainer.style.display = 'none';
      if (tlBuyBtn) tlBuyBtn.style.display = 'none';
      return;
    }
    if (artBuyContainer) {
      artBuyContainer.style.display = 'flex';
      if (artBuyBtn) artBuyBtn.onclick = () => buyAlbum(album.id);
      if (artBuyPrice) artBuyPrice.textContent = 'R150';
    }
    if (tlBuyBtn) {
      tlBuyBtn.style.display = 'flex';
      tlBuyBtn.onclick = () => buyAlbum(album.id);
    }
  }

  // ============================================================
  // UPDATE NOW PLAYING UI
  // ============================================================
  function updateNowPlaying() {
    if (!playingTrack || !playingAlbum) {
      if (footerTitle) footerTitle.textContent = 'Select a track';
      if (footerArtist) footerArtist.textContent = '—';
      if (pfTitle) pfTitle.textContent = 'Select a track';
      if (pfArtist) pfArtist.textContent = '—';
      updateMobileText('Select a track', '—');
      return;
    }
    const title = playingTrack.mix ? `${playingTrack.title} (${playingTrack.mix})` : playingTrack.title;
    if (footerTitle) footerTitle.textContent = title;
    if (footerArtist) footerArtist.textContent = playingTrack.artist;
    if (pfTitle) pfTitle.textContent = title;
    if (pfArtist) pfArtist.textContent = playingTrack.artist;
    updateMobileText(title, playingTrack.artist);
    
    const art = getImage(playingAlbum);
    if (footerArt) footerArt.src = art;
    if (pmArt) pmArt.src = art;
    if (pfArt) pfArt.src = art;
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
    if (albumList) albumList.style.display = 'flex';
    if (tracklistWrap) tracklistWrap.style.display = 'none';
    if (backBtn) backBtn.style.display = 'none';
    if (headerBadge) {
      headerBadge.style.display = 'inline';
      headerBadge.textContent = '5 albums';
    }
    if (tlBuyBtn) tlBuyBtn.style.display = 'none';
  }

  function showTracklist() {
    if (albumList) albumList.style.display = 'none';
    if (tracklistWrap) tracklistWrap.style.display = 'flex';
    if (backBtn) backBtn.style.display = 'inline';
    if (headerBadge) headerBadge.style.display = 'none';
  }

  // ============================================================
  // RENDER FUNCTIONS
  // ============================================================
  function renderAlbums() {
    if (!albumList) return;
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
    if (!tracklistWrap || !tracklist) return;
    showTracklist();
    if (tlTitle) tlTitle.textContent = album.title;
    if (tlArtist) tlArtist.textContent = `${album.artist} · ${album.year}`;
    viewedAlbum = album;
    
    updateBuyButton(album);

    if (isLocked || album.isCS) {
      tracklist.innerHTML = `
        <div class="track-item locked" style="background:#1a1a1a;border-bottom:1px solid #2a2a2a;padding:10px 14px;cursor:default;">
          <div class="ti-info" style="text-align:center;">
            <div class="ti-title" style="color:#e5de69;font-size:.85rem;"><i class="fas fa-clock"></i> Coming ${new Date(album.releaseDate).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
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
    if (footerPlay) footerPlay.className = `fas ${icon}`;
    if (pmPlay) pmPlay.className = `fas ${icon}`;
    if (pfPlay) pfPlay.className = `fas ${icon}`;
  }

  function startProgress() {
    clearInterval(timer);
    timer = setInterval(() => {
      if (audio.duration && !isNaN(audio.duration)) {
        const p = (audio.currentTime / audio.duration) * 100;
        if (footerFill) footerFill.style.width = p + '%';
        if (pfFill) pfFill.style.width = p + '%';
        const cm = Math.floor(audio.currentTime / 60);
        const cs = Math.floor(audio.currentTime % 60);
        const tm = Math.floor(audio.duration / 60);
        const ts = Math.floor(audio.duration % 60);
        if (footerCur) footerCur.textContent = `${cm}:${String(cs).padStart(2, '0')}`;
        if (pfCur) pfCur.textContent = footerCur ? footerCur.textContent : '0:00';
        if (footerTot) footerTot.textContent = `${tm}:${String(ts).padStart(2, '0')}`;
        if (pfTot) pfTot.textContent = footerTot ? footerTot.textContent : '0:00';
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
    const defaultAlbum = allAlbums[4];
    updateArtwork(defaultAlbum);
    if (artBuyContainer) artBuyContainer.style.display = 'none';
    if (tlBuyBtn) tlBuyBtn.style.display = 'none';
  }

  function openFull() { if (pf) pf.classList.add('active'); }
  function closeFull() { if (pf) pf.classList.remove('active'); }

  // ============================================================
  // EVENT LISTENERS
  // ============================================================
  if (footerPlay) footerPlay.onclick = togglePlay;
  if (footerPrev) footerPrev.onclick = prevTrack;
  if (footerNext) footerNext.onclick = nextTrack;
  if (pmPlay) pmPlay.onclick = togglePlay;
  if (pmNext) pmNext.onclick = nextTrack;
  if (pmExpand) pmExpand.onclick = openFull;
  if (pfPlay) pfPlay.onclick = togglePlay;
  if (pfPrev) pfPrev.onclick = prevTrack;
  if (pfNext) pfNext.onclick = nextTrack;
  if (pfClose) pfClose.onclick = closeFull;
  if (backBtn) backBtn.onclick = goBack;
  audio.onended = nextTrack;
  if (footerProgress) {
    footerProgress.addEventListener('click', (e) => seekTo(e, footerProgress, footerFill, footerCur, footerTot));
  }
  if (pfProgress) {
    pfProgress.addEventListener('click', (e) => seekTo(e, pfProgress, pfFill, pfCur, pfTot));
  }

  // ============================================================
  // INIT - COUNTDOWN VISIBLE ON HTC5
  // ============================================================
  renderAlbums();
  showAlbumList();

  // Start with HTC5 - COUNTDOWN VISIBLE
  const defaultAlbum = allAlbums[4];
  artImg.src = getImage(defaultAlbum);
  countdownOverlay.style.display = 'flex';
  csTitle.textContent = defaultAlbum.title;
  csSub.textContent = `${defaultAlbum.artist} · ${defaultAlbum.year} · ${defaultAlbum.trackCount} tracks`;
  csDate.textContent = new Date(defaultAlbum.releaseDate).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });

  updateMobileText('Select a track', '—');
  if (footerArt) footerArt.src = getImage(defaultAlbum);
  if (pmArt) pmArt.src = getImage(defaultAlbum);

  if (artBuyContainer) artBuyContainer.style.display = 'none';
  if (tlBuyBtn) tlBuyBtn.style.display = 'none';

  updateCountdown();
  setInterval(updateCountdown, 1000);

  updateVolumeIcon();

  const main = document.getElementById('main');
  const resize = () => {
    if (main) main.style.flexDirection = window.innerWidth <= 860 ? 'column' : 'row';
    const footer = document.getElementById('pcFooter');
    if (footer) footer.style.display = window.innerWidth <= 860 ? 'none' : 'flex';
  };
  resize();
  window.onresize = resize;
})();
