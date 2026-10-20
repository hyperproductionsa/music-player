(async function(){
  const res = await fetch('data.json');
  if (!res.ok) {
    throw new Error(`Failed to load data.json (HTTP ${res.status})`);
  }
  const DATA = await res.json();
  if (!DATA || !Array.isArray(DATA.albums) || DATA.albums.length === 0) {
    throw new Error('data.json is missing album data');
  }
  const { baseUrl, albums } = DATA;
  const audio = new Audio();
  const getAudio = (a, t) => {
    if (!a || !a.folder) { console.warn('⚠️ Missing folder on album:', a && a.id, a && a.title); return ''; }
    return `${baseUrl}/m4a/${a.folder}/${t.file}`;
  };
  const getImage = a => `${baseUrl}/images/${a.cover}`;

  let playingAlbum = null, playingTrack = null, playingIdx = 0, isPlaying = false, timer = null, viewedAlbum = null;
  let currentInfoSlug = null, policyPagesPromise = null;
  const albumStates = {};
  const $ = id => document.getElementById(id);
  const albumList = $('albumList'), tracklistWrap = $('tracklistWrap'), tracklist = $('tracklist'),
        tlTitle = $('tlTitle'), tlArtist = $('tlArtist'), tlBuyBtn = $('tlBuyBtn'),
        backBtn = $('backBtn'), headerBadge = $('headerBadge'), artImg = $('artImg'),
        artBuyContainer = $('artBuyContainer'),
        artBuyBtn = $('artBuyBtn'), artBuyPrice = $('artBuyPrice'),
        footerArt = $('footerArt'), footerTitle = $('footerTitle'), footerArtist = $('footerArtist'),
        footerFill = $('footerFill'), footerCur = $('footerCur'), footerTot = $('footerTot'),
        footerProgress = $('footerProgress'), footerPlay = $('footerPlay'), footerPrev = $('footerPrev'), footerNext = $('footerNext'),
        volumeSlider = $('volumeSlider'), volumeIcon = $('volumeIcon'),
        pmArt = $('pmArt'), pmTitle = $('pmTitle'), pmArtist = $('pmArtist'), pmPlay = $('pmPlay'), pmNext = $('pmNext'), pmExpand = $('pmExpand'),
        pf = $('playerFull'), pfArt = $('pfArt'), pfTitle = $('pfTitle'), pfArtist = $('pfArtist'),
        pfFill = $('pfFill'), pfCur = $('pfCur'), pfTot = $('pfTot'), pfProgress = $('pfProgress'),
        pfPlay = $('pfPlay'), pfPrev = $('pfPrev'), pfNext = $('pfNext'), pfClose = $('pfClose');

  const allAlbums = albums;

  // -------- ROUTING --------
  const pathMatch = window.location.pathname.match(/^\/htc([1-5])$/);
  const activeAlbumIdFromUrl = pathMatch ? `htc${pathMatch[1]}` : null;
  const infoPageFromUrl = getInfoSlug(window.location.pathname);

  function setUrl(path) {
    if (window.location.pathname === path) return;
    history.pushState({}, '', path);
  }

  function getInfoSlug(path) {
    const allowed = ['terms', 'refund-policy', 'privacy-policy'];
    const slug = String(path || '').replace(/^\/+|\/+$/g, '');
    return allowed.includes(slug) ? slug : null;
  }

  window.addEventListener('popstate', (event) => {
    // The Android/browser Back button first dismisses the expanded player.
    // A second Back then navigates from an album to the main album list.
    if (pf && pf.classList.contains('active') && !(event.state && event.state.playerExpanded)) {
      closeFull(true);
      return;
    }
    // Forward navigation can restore the expanded-player state.
    if (event.state && event.state.playerExpanded) {
      openFull(false);
      return;
    }
    const infoSlug = getInfoSlug(window.location.pathname);
    if (infoSlug) { showInfoPage(infoSlug, false); return; }
    const m = window.location.pathname.match(/^\/htc([1-5])$/);
    if (m) {
      const id = `htc${m[1]}`;
      const idx = allAlbums.findIndex(a => a.id === id);
      if (idx >= 0) {
        document.body.classList.remove('info-mode');
        const artSection = $('artSection');
        if (artSection) artSection.style.display = '';
        loadAlbum(idx, { push: false });
        return;
      }
    }
    goBack({ push: false });
  });

  // -------- LOCAL STORAGE (A + B) --------
  const STORAGE_KEY = 'htcoll-last';

  function saveState() {
    try {
      const previous = loadState() || {};
      const state = { ...previous, volume: audio.volume, timestamp: Date.now() };
      if (playingAlbum && playingTrack) {
        state.albumId = playingAlbum.id;
        state.trackIdx = playingIdx;
        state.position = Number.isFinite(audio.currentTime) ? audio.currentTime : (previous.position || 0);
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {}
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || typeof s !== 'object') return null;
      if (s.albumId && typeof s.trackIdx === 'number') return s;
      return Number.isFinite(s.volume) ? s : null;
    } catch (e) { return null; }
  }

  window.addEventListener('beforeunload', saveState);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveState();
  });

  // -------- VOLUME --------
  const initialState = loadState();
  const savedVolume = initialState && Number.isFinite(initialState.volume)
    ? Math.min(1, Math.max(0, initialState.volume))
    : .8;
  audio.volume = savedVolume;
  if (volumeSlider) {
    volumeSlider.value = savedVolume;
    volumeSlider.addEventListener('input', function () {
      audio.volume = Math.min(1, Math.max(0, parseFloat(this.value) || 0));
      updateVolumeIcon();
      saveState();
    });
  }
  function updateVolumeIcon() {
    if (!volumeIcon) return;
    const v = audio.volume;
    volumeIcon.className = v === 0 ? 'fas fa-volume-mute' : v < .5 ? 'fas fa-volume-down' : 'fas fa-volume-up';
  }
  if (volumeIcon) volumeIcon.addEventListener('click', function () {
    if (audio.volume > 0) { audio.volume = 0; if (volumeSlider) volumeSlider.value = 0; }
    else {
      const remembered = initialState && Number.isFinite(initialState.volume) && initialState.volume > 0 ? initialState.volume : .8;
      audio.volume = remembered;
      if (volumeSlider) volumeSlider.value = remembered;
    }
    updateVolumeIcon();
    saveState();
  });

  // -------- BUY --------
  window.buyAlbum = async function (id) {
    const u = 'https://yoco-checkout.hyperproductionsa.workers.dev';
    try {
      const r = await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId: id }) });
      const d = await r.json();
      if (r.ok && d.redirectUrl) window.location.href = d.redirectUrl;
      else alert('Payment error: ' + (d.error || 'Please try again.'));
    } catch (e) { console.error('❌ Payment error:', e); alert('Payment error. Please try again.'); }
  };

  function updateArtwork(a) {
    if (!artImg) return;
    const artworkAlbum = a || allAlbums[allAlbums.length - 1];
    if (artworkAlbum) artImg.src = getImage(artworkAlbum);
  }

  function updateBuyButton(a) {
    if (!a) {
      if (artBuyContainer) { artBuyContainer.style.display = 'none'; artBuyContainer.classList.add('hidden'); }
      if (tlBuyBtn) { tlBuyBtn.style.display = 'none'; tlBuyBtn.classList.add('hidden'); }
      return;
    }
    if (artBuyContainer) { artBuyContainer.style.display = 'flex'; artBuyContainer.classList.remove('hidden'); if (artBuyBtn) artBuyBtn.onclick = () => buyAlbum(a.id); if (artBuyPrice) artBuyPrice.textContent = 'R150'; }
    if (tlBuyBtn) { tlBuyBtn.style.display = 'flex'; tlBuyBtn.classList.remove('hidden'); tlBuyBtn.onclick = () => buyAlbum(a.id); }
  }

  function updateNowPlaying() {
    if (!playingTrack || !playingAlbum) {
      if (footerTitle) footerTitle.textContent = 'HTs Collections';
      if (footerArtist) footerArtist.textContent = 'HyperSOUL-X';
      if (pfTitle) pfTitle.textContent = 'HTs Collections';
      if (pfArtist) pfArtist.textContent = 'HyperSOUL-X';
      updateMobileText('HTs Collections', 'HyperSOUL-X');
      return;
    }
    const t = playingTrack.mix ? `${playingTrack.title} (${playingTrack.mix})` : playingTrack.title;
    if (footerTitle) footerTitle.textContent = t;
    if (footerArtist) footerArtist.textContent = playingTrack.artist;
    if (pfTitle) pfTitle.textContent = t;
    if (pfArtist) pfArtist.textContent = playingTrack.artist;
    updateMobileText(t, playingTrack.artist);
    const art = getImage(playingAlbum);
    if (footerArt) footerArt.src = art;
    if (pmArt) pmArt.src = art;
    if (pfArt) pfArt.src = art;
  }

  function updateMobileText(t, a) {
    if (!pmTitle || !pmArtist) return;
    pmTitle.textContent = t || 'HTs Collections';
    pmArtist.textContent = a || '—';
    pmTitle.classList.remove('scroll'); void pmTitle.offsetWidth;
    if (pmTitle.scrollWidth > pmTitle.clientWidth) pmTitle.classList.add('scroll');
    pmArtist.classList.remove('scroll'); void pmArtist.offsetWidth;
    if (pmArtist.scrollWidth > pmArtist.clientWidth) pmArtist.classList.add('scroll');
  }

  function setupMediaSession() {
    if (!('mediaSession' in navigator) || !playingTrack || !playingAlbum) return;
    const t = playingTrack.mix ? `${playingTrack.title} (${playingTrack.mix})` : playingTrack.title;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: t, artist: playingTrack.artist, album: playingAlbum.title,
      artwork: [{ src: getImage(playingAlbum), sizes: '512x512', type: 'image/jpeg' }]
    });
    navigator.mediaSession.setActionHandler('play', () => { audio.play(); isPlaying = true; updatePlayBtn(); startProgress(); });
    navigator.mediaSession.setActionHandler('pause', () => { audio.pause(); isPlaying = false; updatePlayBtn(); clearInterval(timer); saveState(); });
    navigator.mediaSession.setActionHandler('previoustrack', () => { if (playingAlbum) prevTrack(); });
    navigator.mediaSession.setActionHandler('nexttrack', () => { if (playingAlbum) nextTrack(); });
  }

  function showAlbumList() {
    currentInfoSlug = null;
    document.body.classList.remove('info-mode');
    const artSection = $('artSection');
    if (artSection) artSection.style.display = '';
    if (albumList) albumList.style.display = 'flex';
    const policyLinks = $('policyLinks'), infoPage = $('infoPage');
    if (policyLinks) policyLinks.style.display = 'flex';
    if (infoPage) infoPage.style.display = 'none';
    if (tracklistWrap) tracklistWrap.style.display = 'none';
    if (backBtn) backBtn.style.display = 'none';
    if (headerBadge) { headerBadge.style.display = 'inline'; headerBadge.textContent = allAlbums.length + ' albums'; }
    if (tlBuyBtn) tlBuyBtn.style.display = 'none';
  }
  function showInfoPage(slug, push = true) {
    const infoPage = $('infoPage');
    if (!infoPage || !getInfoSlug(slug)) return;
    if (push) {
      setUrl('/' + slug);
      saveState();
    }
    currentInfoSlug = slug;
    // Load policy copy into the existing page shell without navigating away from
    // the document, so the same Audio instance keeps playing.
    if (!policyPagesPromise) {
      policyPagesPromise = fetch('/policy-pages.json')
        .then(response => {
          if (!response.ok) throw new Error('Could not load policy pages');
          return response.json();
        });
    }
    policyPagesPromise.then(pages => {
      if (currentInfoSlug !== slug || !pages[slug]) return;
      const page = pages[slug];
      infoPage.innerHTML = '<h1>' + page.title + '</h1><div class="info-copy">' + page.body + '</div>';
    }).catch(error => console.warn('Policy page content unavailable:', error));
    document.body.classList.add('info-mode');
    if (albumList) albumList.style.display = 'none';
    const policyLinks = $('policyLinks');
    if (policyLinks) policyLinks.style.display = 'none';
    if (tracklistWrap) tracklistWrap.style.display = 'none';
    const artSection = $('artSection');
    if (artSection) artSection.style.display = 'none';
    infoPage.style.display = 'block';
    if (backBtn) backBtn.style.display = 'inline';
    if (headerBadge) headerBadge.style.display = 'none';
  }

  function showTracklist() {
    if (albumList) albumList.style.display = 'none';
    const policyLinks = $('policyLinks');
    if (policyLinks) policyLinks.style.display = 'none';
    if (tracklistWrap) tracklistWrap.style.display = 'flex';
    if (backBtn) backBtn.style.display = 'inline';
    if (headerBadge) headerBadge.style.display = 'none';
  }

  function renderAlbums() {
    if (!albumList) return;
    const s = [...allAlbums].reverse();
    albumList.innerHTML = s.map(a => {
      const i = allAlbums.indexOf(a), p = playingAlbum && playingAlbum.id === a.id, h = albumStates[a.id] !== undefined;
      return `<a class="album-item" href="/${a.id}" data-idx="${i}">
        <div class="ai-art"><img src="${getImage(a)}" alt="${a.title}" /></div>
        <div class="ai-info">
          <div class="ai-title">${a.title} ${p ? '▶' : ''} ${h && !p ? '●' : ''}</div>
          <div class="ai-artist">${a.artist} · ${a.year}</div>
        </div>
        <div class="ai-cart" onclick="event.stopPropagation(); buyAlbum('${a.id}')" title="Buy album"><i class="fas fa-shopping-cart"></i></div>
        <div class="ai-play"><i class="fas fa-play-circle"></i></div>
      </a>`;
    }).join('');
    albumList.querySelectorAll('.album-item').forEach(el => {
      el.onclick = (e) => {
        if (e.target.closest('.ai-cart')) return;
        e.preventDefault();
        const i = parseInt(el.dataset.idx);
        loadAlbum(i, { push: true });
      };
    });
  }

  function renderTracklist(a) {
    if (!tracklistWrap || !tracklist) return;
    showTracklist();
    if (tlTitle) tlTitle.textContent = a.title;
    if (tlArtist) tlArtist.textContent = `${a.artist} · ${a.year}`;
    viewedAlbum = a;
    updateBuyButton(a);
    const st = albumStates[a.id], si = st ? st.playingIdx : 0;
    tracklist.innerHTML = a.tracks.map((t, i) => {
      const sa = st && i === si, ac = playingAlbum && playingAlbum.id === a.id && i === playingIdx, ti = t.mix ? `${t.title} (${t.mix})` : t.title;
      return `<div class="track-item ${ac ? 'active' : ''}" data-idx="${i}">
        <div class="ti-play"><i class="fas ${ac ? 'fa-play-circle' : 'fa-play'}"></i></div>
        <div class="ti-info"><div class="ti-title">${ti}</div><div class="ti-artist">${t.artist}</div></div>
        <div class="ti-dur">${ac ? '▶' : (sa ? '●' : '♫')}</div>
      </div>`;
    }).join('');
    tracklist.querySelectorAll('.track-item').forEach(el => {
      el.onclick = () => {
        const al = viewedAlbum;
        if (!al) return;
        playTrack(parseInt(el.dataset.idx), al);
        if (window.innerWidth <= 860) openFull();
      };
    });
  }

  function loadAlbum(i, opts) {
    opts = opts || {};
    const a = allAlbums[i];
    if (!a) return;
    if (opts.push !== false) setUrl('/' + a.id);
    viewedAlbum = a;
    updateArtwork(a);
    updateBuyButton(a);
    renderTracklist(a);
  }

  function playTrack(i, a) {
    if (!a) a = viewedAlbum;
    if (!a) return;
    const t = a.tracks[i];
    if (!t) return;
    playingAlbum = a; playingTrack = t; playingIdx = i;
    albumStates[a.id] = { playingIdx: i };
    const u = getAudio(a, t);
    if (!u) { console.warn('No audio URL for', a.id, i); return; }
    if (audio.src === u) {
      if (isPlaying) { audio.pause(); isPlaying = false; clearInterval(timer); updatePlayBtn(); saveState(); return; }
      else { audio.play().then(() => { isPlaying = true; updatePlayBtn(); startProgress(); }).catch(e => { console.warn('Playback blocked:', e); isPlaying = false; updatePlayBtn(); }); return; }
    }
    audio.src = u; audio.load();
    updateNowPlaying(); setupMediaSession(); renderTracklist(a); renderAlbums(); updateArtwork(a);
    saveState();
    audio.play().then(() => { isPlaying = true; updatePlayBtn(); startProgress(); }).catch(e => { console.warn('Playback blocked:', e); isPlaying = false; updatePlayBtn(); });
  }

  function togglePlay() {
    if (!playingTrack) { if (viewedAlbum) playTrack(0, viewedAlbum); return; }
    if (isPlaying) { audio.pause(); isPlaying = false; clearInterval(timer); updatePlayBtn(); saveState(); }
    else { audio.play().then(() => { isPlaying = true; updatePlayBtn(); startProgress(); }).catch(e => { console.warn('Playback blocked:', e); isPlaying = false; updatePlayBtn(); }); }
  }

  function updatePlayBtn() {
    const i = isPlaying ? 'fa-pause-circle' : 'fa-play-circle';
    if (footerPlay) footerPlay.className = `fas ${i}`;
    if (pmPlay) pmPlay.className = `fas ${i}`;
    if (pfPlay) pfPlay.className = `fas ${i}`;
  }

  function updateProgressDisplay() {
    if (!audio.duration || !Number.isFinite(audio.duration)) return;
    const percent = Math.min(100, Math.max(0, audio.currentTime / audio.duration * 100));
    if (footerFill) footerFill.style.width = percent + '%';
    if (pfFill) pfFill.style.width = percent + '%';
    const cm = Math.floor(audio.currentTime / 60), cs = Math.floor(audio.currentTime % 60);
    const tm = Math.floor(audio.duration / 60), ts = Math.floor(audio.duration % 60);
    const current = `${cm}:${String(cs).padStart(2, '0')}`;
    const total = `${tm}:${String(ts).padStart(2, '0')}`;
    if (footerCur) footerCur.textContent = current;
    if (pfCur) pfCur.textContent = current;
    if (footerTot) footerTot.textContent = total;
    if (pfTot) pfTot.textContent = total;
  }

  let progressTick = 0;
  function startProgress() {
    clearInterval(timer);
    progressTick = 0;
    timer = setInterval(() => {
      updateProgressDisplay();
      if (audio.duration && Number.isFinite(audio.duration)) {
        progressTick++;
        if (progressTick >= 25) { progressTick = 0; saveState(); }
      }
    }, 200);
  }
  audio.addEventListener('timeupdate', updateProgressDisplay);

  function seekTo(e, p, f, c, t) {
    const r = p.getBoundingClientRect(), x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    if (audio.duration && !isNaN(audio.duration)) {
      audio.currentTime = x * audio.duration;
      f.style.width = x * 100 + '%';
      const cm = Math.floor(audio.currentTime / 60), cs = Math.floor(audio.currentTime % 60), tm = Math.floor(audio.duration / 60), ts = Math.floor(audio.duration % 60);
      c.textContent = `${cm}:${String(cs).padStart(2, '0')}`;
      t.textContent = `${tm}:${String(ts).padStart(2, '0')}`;
      saveState();
    }
  }

  function nextTrack() { if (!playingAlbum) return; const n = (playingIdx + 1) % playingAlbum.tracks.length; albumStates[playingAlbum.id] = { playingIdx: n }; playTrack(n, playingAlbum); }
  function prevTrack() { if (!playingAlbum) return; const p = (playingIdx - 1 + playingAlbum.tracks.length) % playingAlbum.tracks.length; albumStates[playingAlbum.id] = { playingIdx: p }; playTrack(p, playingAlbum); }

  function goBack(opts) {
    opts = opts || {};
    if (opts.push !== false) setUrl('/');
    showAlbumList();
    updateArtwork(playingAlbum);
    if (artBuyContainer) { artBuyContainer.style.display = 'none'; artBuyContainer.classList.add('hidden'); }
    if (tlBuyBtn) { tlBuyBtn.style.display = 'none'; tlBuyBtn.classList.add('hidden'); }
  }

  function openFull(pushHistory = true) {
    if (!pf || pf.classList.contains('active')) return;
    // Give the expanded player its own history entry so Back collapses it
    // instead of leaving the site. Keep the current URL (including album routes).
    if (pushHistory && !(history.state && history.state.playerExpanded)) {
      history.pushState({ ...(history.state || {}), playerExpanded: true }, '', window.location.href);
    }
    pf.classList.add('active');
    document.body.classList.add('player-expanded');
  }
  function closeFull(fromPopState = false) {
    if (!pf) return;
    if (!fromPopState && history.state && history.state.playerExpanded) {
      history.back();
      return;
    }
    pf.classList.remove('active');
    document.body.classList.remove('player-expanded');
  }

  // Finger-tracking drag: the expanded player follows the pointer, then snaps
  // open/closed on release. Controls and progress bars remain normal tap targets.
  function setupPlayerDrag() {
    const mini = $('playerMobile');
    if (!mini || !pf) return;
    let drag = null;
    const ignored = '#pmPlay, #pmNext, #pmExpand, .pm-controls, .pf-btns, .pf-bar, #pfClose, .pf-header i:not(#pfClose)';
    const height = () => Math.max(1, window.innerHeight);

    function begin(event, mode) {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if (event.target.closest(ignored)) return;
      if (mode === 'open' && pf.classList.contains('active')) return;
      if (mode === 'close' && !pf.classList.contains('active')) return;
      event.preventDefault();
      drag = { mode, id: event.pointerId, startY: event.clientY, lastY: event.clientY,
        lastTime: performance.now(), velocity: 0, moved: false };
      if (mode === 'open') {
        // Put the full player below the viewport BEFORE revealing it.
        // This prevents the active-state CSS from flashing it at the top
        // before the first pointermove arrives.
        pf.classList.add('dragging');
        pf.style.transform = 'translateY(100%)';
        pf.classList.add('active');
        document.body.classList.add('player-expanded');
      } else {
        pf.classList.add('dragging');
      }
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch (_) {}
    }

    function move(event) {
      if (!drag || event.pointerId !== drag.id) return;
      const now = performance.now();
      const dy = event.clientY - drag.startY;
      drag.velocity = (event.clientY - drag.lastY) / Math.max(1, now - drag.lastTime);
      drag.lastY = event.clientY;
      drag.lastTime = now;
      // Ignore tiny finger jitter; it should behave like a tap, not a drag.
      if (Math.abs(dy) > 12) drag.moved = true;
      if (drag.mode === 'open') {
        pf.style.transform = 'translateY(calc(100% + ' + Math.min(0, dy) + 'px))';
      } else {
        pf.style.transform = 'translateY(' + Math.max(0, dy) + 'px)';
      }
    }

    function finish(event) {
      if (!drag || (event && event.pointerId !== drag.id)) return;
      const d = drag;
      const dy = (event ? event.clientY : d.lastY) - d.startY;
      const h = height();
      // Require meaningful travel before either distance or velocity can commit.
      // Fast micro-movements are usually touch jitter, not an intentional swipe.
      const minTravel = Math.max(64, h * .09);
      const intentional = Math.abs(dy) >= minTravel;
      const shouldOpen = d.mode === 'open' && intentional && (dy < -h * .18 || d.velocity < -.7);
      const shouldClose = d.mode === 'close' && intentional && (dy > h * .18 || d.velocity > .7);
      drag = null;
      pf.classList.remove('dragging');
      pf.style.transform = '';
      if (shouldOpen) {
        if (!(history.state && history.state.playerExpanded)) {
          history.pushState({ ...(history.state || {}), playerExpanded: true }, '', window.location.href);
        }
        pf.classList.add('active');
        document.body.classList.add('player-expanded');
      } else if (shouldClose) {
        // Let popstate perform the close when the expanded player owns a history entry.
        if (history.state && history.state.playerExpanded) {
          history.back();
          return;
        }
        pf.classList.remove('active');
        document.body.classList.remove('player-expanded');
      } else if (d.mode === 'open') {
        pf.classList.remove('active');
        document.body.classList.remove('player-expanded');
      } else {
        pf.classList.add('active');
        document.body.classList.add('player-expanded');
      }
      if (d.moved) {
        // Suppress the synthetic click produced by a completed drag.
        const suppress = e => { e.preventDefault(); e.stopPropagation(); };
        pf.addEventListener('click', suppress, { capture: true, once: true });
        mini.addEventListener('click', suppress, { capture: true, once: true });
      }
    }

    mini.addEventListener('pointerdown', e => begin(e, 'open'));
    pf.addEventListener('pointerdown', e => begin(e, 'close'));
    [mini, pf].forEach(el => {
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', finish);
      el.addEventListener('pointercancel', finish);
    });
  }
  setupPlayerDrag();

  // -------- PRIME A TRACK (no autoplay) --------
  function primeTrack(album, trackIdx, position) {
    const t = album.tracks[trackIdx];
    if (!t) return;
    playingAlbum = album;
    playingTrack = t;
    playingIdx = trackIdx;
    albumStates[album.id] = { playingIdx: trackIdx };
    const u = getAudio(album, t);
    if (u) {
      audio.src = u;
      audio.load();
      // Set currentTime after metadata is loaded (browsers may reject before)
      const setPos = () => {
        try {
          const maxPosition = Number.isFinite(audio.duration) ? Math.max(0, audio.duration - 0.25) : 0;
          audio.currentTime = Math.min(Math.max(0, Number(position) || 0), maxPosition);
        } catch (e) {}
        updateProgressDisplay();
        audio.removeEventListener('loadedmetadata', setPos);
      };
      audio.addEventListener('loadedmetadata', setPos);
    }
    updateNowPlaying();
    setupMediaSession();
    updatePlayBtn(); // shows "play" because isPlaying is false
  }

  // -------- WIRING --------
  if (footerPlay) footerPlay.onclick = togglePlay;
  if (footerPrev) footerPrev.onclick = prevTrack;
  if (footerNext) footerNext.onclick = nextTrack;
  if (pmPlay) pmPlay.onclick = togglePlay;
  if (pmNext) pmNext.onclick = nextTrack;
  if (pmExpand) pmExpand.onclick = openFull;
  const mobileFooterTapTarget = $('playerMobile');
  if (mobileFooterTapTarget) mobileFooterTapTarget.addEventListener('click', e => {
    // The whole mini-player opens the full player except its playback controls.
    if (e.target.closest('#pmPlay, #pmNext')) return;
    openFull();
  });
  if (pfPlay) pfPlay.onclick = togglePlay;
  if (pfPrev) pfPrev.onclick = prevTrack;
  if (pfNext) pfNext.onclick = nextTrack;
  if (pfClose) pfClose.onclick = closeFull;
  if (backBtn) backBtn.onclick = () => goBack({ push: true });
  const policyLinks = $('policyLinks');
  if (policyLinks) policyLinks.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', event => {
      const url = new URL(link.href, window.location.href);
      const slug = getInfoSlug(url.pathname);
      if (!slug || url.origin !== window.location.origin) return;
      event.preventDefault();
      if (window.location.pathname !== '/' + slug) history.pushState({}, '', '/' + slug);
      saveState();
      showInfoPage(slug, false);
    });
  });

  audio.onended = () => { saveState(); nextTrack(); };
  if (footerProgress) footerProgress.addEventListener('click', e => seekTo(e, footerProgress, footerFill, footerCur, footerTot));
  if (pfProgress) pfProgress.addEventListener('click', e => seekTo(e, pfProgress, pfFill, pfCur, pfTot));

  // -------- INIT --------
  renderAlbums();

  const stored = loadState();

  if (infoPageFromUrl) {
    // Direct policy URLs start a fresh document, so restore Now Playing metadata
    // from storage without autoplaying; in-app policy navigation never reloads audio.
    const savedAlbum = stored && allAlbums.find(x => x.id === stored.albumId);
    if (savedAlbum) {
      primeTrack(savedAlbum, Math.min(Math.max(0, stored.trackIdx), savedAlbum.tracks.length - 1), stored.position);
      renderAlbums();
      updateArtwork(savedAlbum);
    }
    showAlbumList();
    showInfoPage(infoPageFromUrl, false);
  } else if (activeAlbumIdFromUrl) {
    const idx = allAlbums.findIndex(a => a.id === activeAlbumIdFromUrl);
    if (idx >= 0) {
      const a = allAlbums[idx];
      viewedAlbum = a;
      updateArtwork(a);
      updateBuyButton(a);
      // If the stored album matches the URL album, restore its last track and position.
      if (stored && stored.albumId === a.id) {
        primeTrack(a, Math.min(stored.trackIdx, a.tracks.length - 1), stored.position);
      } else {
        primeTrack(a, 0, 0);
      }
      renderTracklist(a);
      renderAlbums();
    } else {
      showAlbumList();
      updateArtwork(null);
    }
  } else if (stored) {
    // Restore the last-played track and playback position for Now Playing,
    // but never restore the album's page as the landing screen. Only an
    // explicit /htc* URL should open an album's tracklist.
    const a = allAlbums.find(x => x.id === stored.albumId);
    showAlbumList();
    if (a) {
      primeTrack(a, Math.min(Math.max(0, stored.trackIdx), a.tracks.length - 1), stored.position);
      renderAlbums();
      updateArtwork(a);
    } else {
      updateArtwork(null);
    }
  } else {
    showAlbumList();
    updateArtwork(null);
  }

  if (!playingTrack) updateNowPlaying();
  // Keep buy buttons visible for a directly opened album route; showAlbumList() handles list visibility.
  updateArtwork(playingAlbum);
  updateVolumeIcon();

  const main = document.getElementById('main'), pcFooter = document.getElementById('pcFooter'), mobileFooter = document.getElementById('playerMobile');
  function handleResize() {
    const m = window.innerWidth <= 860;
    if (main) main.style.flexDirection = m ? 'column' : 'row';
    if (pcFooter) pcFooter.style.display = m ? 'none' : 'flex';
    if (mobileFooter) mobileFooter.style.display = m ? 'flex' : 'none';
    updateArtwork(playingAlbum);
  }
  handleResize();
  window.addEventListener('resize', handleResize);
})();
