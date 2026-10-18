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
    const allowed = ['how-purchases-work', 'terms', 'refund-policy', 'privacy-policy'];
    const slug = String(path || '').replace(/^\/+|\/+$/g, '');
    return allowed.includes(slug) ? slug : null;
  }

  window.addEventListener('popstate', () => {
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
    const policyLinks = $('policyLinks'), infoPage = $('infoPage');
    if (!infoPage) return;
    const pages = {
      'how-purchases-work': {
        title: 'How purchases work',
        body: `
          <p>Each purchase is for one complete HTs Collections album. After your payment is confirmed by Yoco, a download link is sent to the email address you provide at checkout.</p>
          <ol><li>Choose an album and press <strong>Buy Now</strong>.</li><li>Complete payment on Yoco’s checkout page.</li><li>Check your email for the album download link.</li><li>Open the link and download the album ZIP within 24 hours, before the link expires.</li><li>Extract the ZIP file on your device to access the album’s MP3 tracks.</li></ol>
          <p>Check your inbox and spam/junk folder if the email does not appear. If payment succeeded but the email or download link is missing or does not work, use your purchase confirmation to contact support.</p>
          <p>The link expires 24 hours after it is issued. Download and save your ZIP promptly.</p>`
      },
      'terms': {
        title: 'Terms & Conditions',
        body: `
          <p>By purchasing an album through HTs Collections, you agree to these purchase terms.</p>
          <h3>Digital delivery</h3><p>Albums are supplied as ZIP files containing MP3 audio tracks. After successful payment through Yoco, a download link is sent to the email address entered at checkout. The link expires 24 hours after issue, so download the file in time and keep your downloaded copy safe.</p>
          <h3>Licence and copyright</h3><p>Your purchase grants you a personal-use licence to listen to the purchased music. Copyright and other intellectual-property rights remain with their respective owners. Unless you have separate written permission, you may not resell, redistribute, publicly share, upload, or commercially exploit the files or claim the music as your own.</p>
          <h3>Payments and technical requirements</h3><p>Payments are processed through Yoco. You need a compatible device, software capable of extracting ZIP files and playing MP3 audio, and an internet connection to download your purchase. If payment is deducted but your order or link is missing, retain your payment confirmation and contact support.</p>
          <p>These terms do not remove any rights you may have under applicable consumer-protection law.</p>`
      },
      'refund-policy': {
        title: 'Refund Policy',
        body: `
          <p>HTs Collections aims to ensure that every paid album can be downloaded successfully.</p>
          <ul><li><strong>Payment succeeded but no link arrived:</strong> check your spam/junk folder and retain your payment confirmation. Contact support so delivery can be investigated.</li><li><strong>Broken or incomplete ZIP:</strong> contact support with your purchase details so we can investigate and help resolve the problem.</li><li><strong>Duplicate or incorrect charge:</strong> provide the payment confirmation so the transaction can be checked.</li><li><strong>Expired link:</strong> links expire 24 hours after issue. Contact support if a technical or delivery problem prevented downloading.</li></ul>
          <p>Refund requests are assessed individually and handled in accordance with applicable South African consumer-protection law. Nothing in this policy limits rights that cannot legally be excluded. A refund is not automatically guaranteed simply because a link expired after successful delivery, but genuine delivery or product faults will be considered.</p>`
      },
      'privacy-policy': {
        title: 'Privacy Policy',
        body: `
          <p>HTs Collections aims to collect as little customer information as practical. The email address entered at checkout is used to send the album download link and, where needed, information about that purchase or a support request.</p>
          <p>Payments are handled by Yoco. Payment processing may involve information provided directly to Yoco; HTs Collections does not ask you to send card details by email. Please review Yoco’s privacy information for details about its processing.</p>
          <p>Purchase-related information may be used for delivery, payment/order verification, customer support, and applicable legal or accounting obligations. We do not sell your email address.</p>
          <p>The download link expires 24 hours after it is issued. This does not necessarily mean related purchase records or emails are deleted at that time; records may be retained where reasonably necessary for support, security or legal obligations.</p>
          <p>For privacy questions or requests concerning your information, reply to the email relating to your purchase and identify the order without sending payment-card details.</p>`
      }
    };
    const page = pages[slug];
    if (!page) return;
    if (push) setUrl('/' + slug);
    document.body.classList.add('info-mode');
    if (albumList) albumList.style.display = 'none';
    if (policyLinks) policyLinks.style.display = 'none';
    if (tracklistWrap) tracklistWrap.style.display = 'none';
    const artSection = $('artSection');
    if (artSection) artSection.style.display = 'none';
    infoPage.innerHTML = '<h1>' + page.title + '</h1><div class="info-copy">' + page.body + '</div>';
    infoPage.style.display = 'block';
    if (backBtn) backBtn.style.display = 'inline';
    if (headerBadge) headerBadge.style.display = 'none';
  }

  function showTracklist() {
    if (albumList) albumList.style.display = 'none';
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

  function openFull() { if (pf) pf.classList.add('active'); }
  function closeFull() { if (pf) pf.classList.remove('active'); }

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
  if (policyLinks) policyLinks.addEventListener('click', e => {
    const link = e.target.closest('[data-info-page]');
    if (!link) return;
    e.preventDefault();
    showInfoPage(link.dataset.infoPage, true);
  });
  audio.onended = () => { saveState(); nextTrack(); };
  if (footerProgress) footerProgress.addEventListener('click', e => seekTo(e, footerProgress, footerFill, footerCur, footerTot));
  if (pfProgress) pfProgress.addEventListener('click', e => seekTo(e, pfProgress, pfFill, pfCur, pfTot));

  // -------- INIT --------
  renderAlbums();

  const stored = loadState();

  if (infoPageFromUrl) {
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
    const a = allAlbums.find(x => x.id === stored.albumId);
    if (a) {
      viewedAlbum = a;
      updateArtwork(a);
      updateBuyButton(a);
      primeTrack(a, Math.min(Math.max(0, stored.trackIdx), a.tracks.length - 1), stored.position);
      renderTracklist(a);
      renderAlbums();
    } else {
      showAlbumList();
      updateArtwork(null);
    }
  } else {
    showAlbumList();
    updateArtwork(null);
  }

  if (!playingTrack) updateNowPlaying();
  if (artBuyContainer) { artBuyContainer.style.display = 'none'; artBuyContainer.classList.add('hidden'); }
  if (tlBuyBtn) { tlBuyBtn.style.display = 'none'; tlBuyBtn.classList.add('hidden'); }
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
