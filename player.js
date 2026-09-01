(async function() {
  const res = await fetch('data.json');
  const DATA = await res.json();
  const { baseUrl, comingSoon, albums, comingSoonAlbum } = DATA;

  const isUnlocked = () => new Date() >= new Date(comingSoon);
  const audio = new Audio();
  const getAudio = (a, t) => `${baseUrl}/aac/${a.folder}/${t.file}.aac`;
  const getImage = (a) => `${baseUrl}/images/${a.cover}`;

  let curAlbum = null, curTrack = null, curIdx = 0, isPlaying = false, timer = null, albumIdx = 0;

  // DOM
  const $ = id => document.getElementById(id);
  const artImg = $('artImg'), csOverlay = $('csOverlay'), csTitle = $('csTitle'), csSub = $('csSub'), csDate = $('csDate');
  const albumsEl = $('albums'), listEl = $('list');
  const npTrack = $('npTrack'), npArtist = $('npArtist'), npFill = $('npFill'), npCur = $('npCur'), npTot = $('npTot');
  const btnPlay = $('btnPlay'), btnPrev = $('btnPrev'), btnNext = $('btnNext');
  const miniArt = $('miniArt'), miniTitle = $('miniTitle'), miniArtist = $('miniArtist'), miniPlay = $('miniPlay'), miniNext = $('miniNext'), miniExpand = $('miniExpand');
  const full = $('full'), fullArt = $('fullArt'), fullTitle = $('fullTitle'), fullArtist = $('fullArtist'), fullFill = $('fullFill'), fullCur = $('fullCur'), fullTot = $('fullTot');
  const fullPlay = $('fullPlay'), fullPrev = $('fullPrev'), fullNext = $('fullNext'), fullClose = $('fullClose');

  const allAlbums = [...albums, { ...comingSoonAlbum, isCS: true }];

  function renderAlbums() {
    albumsEl.innerHTML = allAlbums.map((a, i) =>
      `<button class="${i === albumIdx ? 'active' : ''} ${a.isCS ? 'cs' : ''}" data-i="${i}">${a.title}${a.isCS ? ' 🔜' : ''}</button>`
    ).join('');
    albumsEl.querySelectorAll('button').forEach(b => b.onclick = () => loadAlbum(+b.dataset.i));
  }

  function renderTracks(album, locked = false) {
    if (!album || locked) {
      listEl.innerHTML = `<div class="list-item locked"><span class="num">🔒</span><span class="title">Coming Soon</span><span class="artist">${album?.artist || '—'}</span><span class="dur">—</span></div>`;
      return;
    }
    listEl.innerHTML = album.tracks.map((t, i) => {
      const active = curTrack === t;
      const title = t.mix ? `${t.title} (${t.mix})` : t.title;
      return `<div class="list-item ${active ? 'active' : ''}" data-i="${i}">
        <span class="num">${i+1}</span>
        <span class="title">${title}</span>
        <span class="artist">${t.artist}</span>
        <span class="dur">${active ? '▶' : '♫'}</span>
      </div>`;
    }).join('');
    listEl.querySelectorAll('.list-item').forEach(el => el.onclick = () => playTrack(+el.dataset.i));
  }

  function loadAlbum(idx) {
    const album = allAlbums[idx];
    albumIdx = idx;
    const unlocked = isUnlocked();

    if (album.isCS && !unlocked) {
      curAlbum = null; curTrack = null;
      artImg.src = getImage(album);
      csOverlay.style.display = 'flex';
      csTitle.textContent = album.title;
      csSub.textContent = `${album.artist} · ${album.year} · ${album.trackCount} tracks`;
      csDate.textContent = new Date(album.releaseDate).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
      npTrack.textContent = 'Coming Soon';
      npArtist.textContent = `${album.artist} · ${album.year}`;
      npFill.style.width = '0%'; npCur.textContent = '0:00'; npTot.textContent = '0:00';
      miniArt.src = getImage(album); miniTitle.textContent = 'Coming Soon'; miniArtist.textContent = `${album.artist} · ${album.year}`;
      renderTracks(null, true);
      renderAlbums();
      return;
    }

    if (album.isCS && unlocked) {
      curAlbum = { id: 'htc5', title: album.title, artist: album.artist, year: album.year, cover: album.cover, folder: 'HTC5', tracks: album.tracks };
    } else {
      curAlbum = album;
    }

    csOverlay.style.display = 'none';
    artImg.src = getImage(curAlbum);
    audio.pause(); audio.src = ''; isPlaying = false; curTrack = null; curIdx = 0;
    npTrack.textContent = 'Select a track';
    npArtist.textContent = `${curAlbum.artist} · ${curAlbum.year}`;
    npFill.style.width = '0%'; npCur.textContent = '0:00'; npTot.textContent = '0:00';
    miniArt.src = getImage(curAlbum); miniTitle.textContent = 'Select a track'; miniArtist.textContent = `${curAlbum.artist} · ${curAlbum.year}`;
    renderTracks(curAlbum);
    renderAlbums();
    updatePlayBtn();
  }

  function playTrack(idx) {
    if (!curAlbum) return;
    const track = curAlbum.tracks[idx];
    if (!track) return;
    curTrack = track; curIdx = idx;
    const url = getAudio(curAlbum, track);
    audio.src = url; audio.load();
    const title = track.mix ? `${track.title} (${track.mix})` : track.title;
    npTrack.textContent = title; npArtist.textContent = track.artist;
    miniTitle.textContent = title; miniArtist.textContent = track.artist;
    fullTitle.textContent = title; fullArtist.textContent = track.artist;
    fullArt.src = getImage(curAlbum);
    renderTracks(curAlbum);
    audio.play().then(() => { isPlaying = true; updatePlayBtn(); startProgress(); }).catch(() => { isPlaying = false; updatePlayBtn(); });
  }

  function togglePlay() {
    if (!curTrack) return;
    if (isPlaying) { audio.pause(); isPlaying = false; clearInterval(timer); }
    else { audio.play().then(() => { isPlaying = true; startProgress(); }).catch(() => {}); }
    updatePlayBtn();
  }

  function updatePlayBtn() {
    const icon = isPlaying ? 'fa-pause-circle' : 'fa-play-circle';
    btnPlay.className = `fas ${icon}`;
    miniPlay.className = `fas ${icon}`;
    fullPlay.className = `fas ${icon}`;
  }

  function startProgress() {
    clearInterval(timer);
    timer = setInterval(() => {
      if (audio.duration && !isNaN(audio.duration)) {
        const p = (audio.currentTime / audio.duration) * 100;
        npFill.style.width = p + '%'; fullFill.style.width = p + '%';
        const cm = Math.floor(audio.currentTime / 60), cs = Math.floor(audio.currentTime % 60);
        const tm = Math.floor(audio.duration / 60), ts = Math.floor(audio.duration % 60);
        npCur.textContent = `${cm}:${String(cs).padStart(2,'0')}`; fullCur.textContent = npCur.textContent;
        npTot.textContent = `${tm}:${String(ts).padStart(2,'0')}`; fullTot.textContent = npTot.textContent;
      }
    }, 200);
  }

  function nextTrack() { if (curAlbum) playTrack((curIdx + 1) % curAlbum.tracks.length); }
  function prevTrack() { if (curAlbum) playTrack((curIdx - 1 + curAlbum.tracks.length) % curAlbum.tracks.length); }
  function openFull() { full.classList.add('active'); }
  function closeFull() { full.classList.remove('active'); }

  // Events
  btnPlay.onclick = togglePlay; btnPrev.onclick = prevTrack; btnNext.onclick = nextTrack;
  miniPlay.onclick = togglePlay; miniNext.onclick = nextTrack; miniExpand.onclick = openFull;
  fullPlay.onclick = togglePlay; fullPrev.onclick = prevTrack; fullNext.onclick = nextTrack; fullClose.onclick = closeFull;
  audio.onended = nextTrack;

  // Init
  renderAlbums();
  loadAlbum(0);

  // Responsive
  const main = document.getElementById('main');
  const resize = () => main.style.flexDirection = window.innerWidth <= 860 ? 'column' : 'row';
  resize(); window.onresize = resize;
})();