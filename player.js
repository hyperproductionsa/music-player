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
  let countdownVisible = true;
  let popupCheckInterval = null;

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
  // VOLUME
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
    volumeIcon.className = vol === 0 ? 'fas fa-volume-mute' : vol < 0.5 ? 'fas fa-volume-down' : 'fas fa-volume-up';
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
  // BUY ALBUM - POPUP METHOD
  // ============================================================
  window.buyAlbum = async function(albumId) {
    const workerUrl = 'https://yoco-checkout.hyperproductionsa.workers.dev';
    console.log('🔵 Buy Album:', albumId);

    try {
      const response = await fetch(workerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: albumId })
      });
      const data = await response.json();
      console.log('🔵 Response:', data);

      if (response.ok && data.redirectUrl) {
        localStorage.setItem('lastPurchasedAlbum', albumId);

        // Try popup first
        const popup = window.open(data.redirectUrl, 'yocoCheckout', 'width=500,height=700,scrollbars=yes,resizable=yes');

        if (!popup || popup.closed || typeof popup.closed === 'undefined') {
          // Popup blocked — open in new tab
          window.open(data.redirectUrl, '_blank');
          alert('Please complete payment in the new tab, then refresh this page.');
        } else {
          // Popup opened successfully — check when it closes
          if (popupCheckInterval) clearInterval(popupCheckInterval);
          popupCheckInterval = setInterval(() => {
            if (popup.closed) {
              clearInterval(popupCheckInterval);
              popupCheckInterval = null;
              // Check if payment was successful
              checkPaymentStatus();
            }
          }, 500);
        }
      } else {
        alert('Payment error: ' + (data.error || 'Please try again.'));
      }
    } catch (error) {
      console.error('❌ Payment error:', error);
      alert('Payment error. Please try again.');
    }
  };

  // ============================================================
  // CHECK PAYMENT STATUS
  // ============================================================
  function checkPaymentStatus() {
    // Check URL params
    const url = new URL(window.location.href);
    let checkoutId = url.searchParams.get('checkoutId');

    if (checkoutId) {
      showSuccessModal(checkoutId);
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    // Check localStorage
    checkoutId = localStorage.getItem('yocoCheckoutId');
    if (checkoutId) {
      showSuccessModal(checkoutId);
      localStorage.removeItem('yocoCheckoutId');
      return;
    }

    // If no checkoutId found, check with the success worker
    const productId = localStorage.getItem('lastPurchasedAlbum');
    if (productId) {
      // Try to get checkoutId from session
      fetch('https://yoco-success.hyperproductionsa.workers.dev/last-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId })
      })
      .then(r => r.json())
      .then(data => {
        if (data.checkoutId) {
          showSuccessModal(data.checkoutId);
        }
      })
      .catch(() => {});
    }
  }

  // ============================================================
  // SUCCESS MODAL
  // ============================================================
  function showSuccessModal(checkoutId) {
    const productId = localStorage.getItem('lastPurchasedAlbum') || 'htc1';
    const album = allAlbums.find(a => a.id === productId);
    const productName = album ? album.title : 'HTs Collections';

    // Close any existing modal
    closeModal();

    const overlay = document.createElement('div');
    overlay.id = 'successModal';
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.85); display: flex; justify-content: center; align-items: center;
      z-index: 9999; backdrop-filter: blur(8px);
    `;

    overlay.innerHTML = `
      <div style="background:#0f0f0f;border-radius:24px;padding:40px;max-width:500px;width:90%;border:1px solid #2a2a2a;text-align:center;position:relative;box-shadow:0 20px 60px rgba(0,0,0,0.9);">
        <div style="font-size:64px;color:#e5de69;margin-bottom:16px;">✓</div>
        <h2 style="color:#e5de69;font-size:1.8rem;font-weight:700;margin-bottom:8px;">Payment Successful!</h2>
        <p style="color:#aaa;margin-bottom:12px;">Thank you for your purchase.</p>
        <div style="color:#fff;font-weight:500;font-size:1.1rem;padding:12px;background:#1a1a1a;border-radius:12px;border:1px solid #2a2a2a;margin:16px 0;">${productName}</div>
        <div style="display:flex;flex-direction:column;gap:12px;margin:20px 0;">
          <button onclick="fetchDownloadLink('${checkoutId}','${productId}')" style="background:#e5de69;color:#0f0f0f;padding:14px 24px;border-radius:40px;border:none;cursor:pointer;font-size:1rem;font-weight:700;display:flex;align-items:center;justify-content:center;gap:10px;width:100%;">
            <i class="fas fa-download"></i> Download Now
          </button>
          <button onclick="sendEmailModal('${checkoutId}','${productName}')" style="background:transparent;color:#e5de69;padding:14px 24px;border-radius:40px;border:2px solid #e5de69;cursor:pointer;font-size:1rem;font-weight:700;display:flex;align-items:center;justify-content:center;gap:10px;width:100%;">
            <i class="fas fa-envelope"></i> Send Via Email
          </button>
        </div>
        <p style="color:#666;font-size:.85rem;">🔒 Download link expires in 24 hours.</p>
        <button onclick="closeModal()" style="margin-top:20px;background:none;border:none;color:#666;cursor:pointer;font-size:.85rem;">Close</button>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  window.fetchDownloadLink = async function(checkoutId, productId) {
    try {
      const response = await fetch('https://yoco-success.hyperproductionsa.workers.dev/generate-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkoutId, productId })
      });
      const data = await response.json();
      if (data.success && data.downloadUrl) {
        window.open(data.downloadUrl, '_blank');
        alert('✅ Download started!');
      } else {
        alert('❌ ' + (data.error || 'Could not generate download link.'));
      }
    } catch (error) {
      console.error('Download error:', error);
      alert('❌ Error generating download link.');
    }
  };

  window.closeModal = function() {
    const modal = document.getElementById('successModal');
    if (modal) modal.remove();
  };

  window.sendEmailModal = function(checkoutId, productName) {
    const email = prompt('Enter your email address:');
    if (!email || !email.includes('@')) {
      if (email) alert('Please enter a valid email address.');
      return;
    }
    fetch('https://yoco-success.hyperproductionsa.workers.dev/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checkoutId, email, productName })
    })
    .then(r => r.json())
    .then(data => {
      if (data.success) {
        alert('✅ Link sent to ' + email + '!');
      } else {
        alert('❌ Failed to send: ' + (data.error || ''));
      }
    })
    .catch(() => alert('❌ Error sending email.'));
  };

  // ============================================================
  // CHECK PAYMENT ON PAGE LOAD
  // ============================================================
  (function initPaymentCheck() {
    // Check URL params
    const url = new URL(window.location.href);
    const checkoutId = url.searchParams.get('checkoutId');
    if (checkoutId) {
      console.log('✅ Payment detected on load!');
      setTimeout(() => showSuccessModal(checkoutId), 500);
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    // Check localStorage
    const storedId = localStorage.getItem('yocoCheckoutId');
    if (storedId) {
      console.log('✅ Payment detected from localStorage!');
      setTimeout(() => showSuccessModal(storedId), 500);
      localStorage.removeItem('yocoCheckoutId');
      return;
    }
  })();

  // ============================================================
  // COUNTDOWN - FIXED
  // ============================================================
  function updateCountdown() {
    if (!countdownOverlay) return;

    if (!countdownVisible) {
      countdownOverlay.style.display = 'none';
      return;
    }

    countdownOverlay.style.display = 'flex';

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
  // ARTWORK - FIXED
  // ============================================================
  function updateArtwork(album) {
    if (!artImg || !countdownOverlay) return;

    if (album && !album.isCS) {
      artImg.src = getImage(album);
      countdownOverlay.style.display = 'none';
      countdownVisible = false;
      return;
    }

    const defaultAlbum = allAlbums[4];
    artImg.src = getImage(defaultAlbum);
    countdownVisible = true;
    countdownOverlay.style.display = 'flex';
    updateCountdown();
  }

  // ============================================================
  // REST OF PLAYER LOGIC
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

  function updateMobileText(title, artist) {
    if (!pmTitle || !pmArtist) return;
    pmTitle.textContent = title || 'Select a track';
    pmArtist.textContent = artist || '—';
    pmTitle.classList.remove('scroll');
    void pmTitle.offsetWidth;
    if (pmTitle.scrollWidth > pmTitle.clientWidth) pmTitle.classList.add('scroll');
    pmArtist.classList.remove('scroll');
    void pmArtist.offsetWidth;
    if (pmArtist.scrollWidth > pmArtist.clientWidth) pmArtist.classList.add('scroll');
  }

  function setupMediaSession() {
    if (!('mediaSession' in navigator) || !playingTrack || !playingAlbum) return;
    const title = playingTrack.mix ? `${playingTrack.title} (${playingTrack.mix})` : playingTrack.title;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: title,
      artist: playingTrack.artist,
      album: playingAlbum.title,
      artwork: [{ src: getImage(playingAlbum), sizes: '512x512', type: 'image/jpeg' }]
    });
    navigator.mediaSession.setActionHandler('play', () => { audio.play(); isPlaying = true; updatePlayBtn(); startProgress(); });
    navigator.mediaSession.setActionHandler('pause', () => { audio.pause(); isPlaying = false; updatePlayBtn(); clearInterval(timer); });
    navigator.mediaSession.setActionHandler('previoustrack', () => { if (playingAlbum) prevTrack(); });
    navigator.mediaSession.setActionHandler('nexttrack', () => { if (playingAlbum) nextTrack(); });
  }

  function showAlbumList() {
    if (albumList) albumList.style.display = 'flex';
    if (tracklistWrap) tracklistWrap.style.display = 'none';
    if (backBtn) backBtn.style.display = 'none';
    if (headerBadge) { headerBadge.style.display = 'inline'; headerBadge.textContent = '5 albums'; }
    if (tlBuyBtn) tlBuyBtn.style.display = 'none';
  }

  function showTracklist() {
    if (albumList) albumList.style.display = 'none';
    if (tracklistWrap) tracklistWrap.style.display = 'flex';
    if (backBtn) backBtn.style.display = 'inline';
    if (headerBadge) headerBadge.style.display = 'none';
  }

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

  function loadAlbum(idx) {
    const album = allAlbums[idx];
    const isLocked = album.isCS || false;
    viewedAlbum = album;
    updateArtwork(album);
    updateBuyButton(album);
    renderTracklist(album, isLocked);
  }

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
      if (isPlaying) { audio.pause(); isPlaying = false; clearInterval(timer); }
      else { audio.play().then(() => { isPlaying = true; startProgress(); }).catch(err => console.warn('Playback blocked:', err)); }
      updatePlayBtn();
      return;
    }
    audio.src = url;
    audio.load();
    updateNowPlaying();
    setupMediaSession();
    renderTracklist(album, false);
    renderAlbums();
    updateArtwork(album);
    audio.play().then(() => { isPlaying = true; updatePlayBtn(); startProgress(); }).catch(err => { isPlaying = false; updatePlayBtn(); });
  }

  function togglePlay() {
    if (!playingTrack) { if (viewedAlbum && !viewedAlbum.isCS) playTrack(0, viewedAlbum); return; }
    if (isPlaying) { audio.pause(); isPlaying = false; clearInterval(timer); }
    else { audio.play().then(() => { isPlaying = true; startProgress(); }).catch(err => console.warn('Playback blocked:', err)); }
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
        if (pfCur) pfCur.textContent = footerCur.textContent;
        if (footerTot) footerTot.textContent = `${tm}:${String(ts).padStart(2, '0')}`;
        if (pfTot) pfTot.textContent = footerTot.textContent;
      }
    }, 200);
  }

  function seekTo(e, progressEl, fillEl, curTimeEl, totalTimeEl) {
    const rect = progressEl.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    if (audio.duration && !isNaN(audio.duration)) {
      audio.currentTime = x * audio.duration;
      fillEl.style.width = (x * 100) + '%';
      const cm = Math.floor(audio.currentTime / 60);
      const cs = Math.floor(audio.currentTime % 60);
      const tm = Math.floor(audio.duration / 60);
      const ts = Math.floor(audio.duration % 60);
      curTimeEl.textContent = `${cm}:${String(cs).padStart(2, '0')}`;
      totalTimeEl.textContent = `${tm}:${String(ts).padStart(2, '0')}`;
    }
  }

  function nextTrack() { if (!playingAlbum) return; const nextIdx = (playingIdx + 1) % playingAlbum.tracks.length; albumStates[playingAlbum.id] = { playingIdx: nextIdx }; playTrack(nextIdx, playingAlbum); }
  function prevTrack() { if (!playingAlbum) return; const prevIdx = (playingIdx - 1 + playingAlbum.tracks.length) % playingAlbum.tracks.length; albumStates[playingAlbum.id] = { playingIdx: prevIdx }; playTrack(prevIdx, playingAlbum); }

  function goBack() { showAlbumList(); updateArtwork(playingAlbum); if (artBuyContainer) artBuyContainer.style.display = 'none'; if (tlBuyBtn) tlBuyBtn.style.display = 'none'; }
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
  if (footerProgress) footerProgress.addEventListener('click', (e) => seekTo(e, footerProgress, footerFill, footerCur, footerTot));
  if (pfProgress) pfProgress.addEventListener('click', (e) => seekTo(e, pfProgress, pfFill, pfCur, pfTot));

  // ============================================================
  // INIT
  // ============================================================
  renderAlbums();
  showAlbumList();
  updateArtwork(null);
  updateMobileText('Select a track', '—');
  if (footerArt) footerArt.src = getImage(allAlbums[4]);
  if (pmArt) pmArt.src = getImage(allAlbums[4]);
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
