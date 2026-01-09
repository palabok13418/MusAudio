const $ = (sel) => document.querySelector(sel);

const els = {
  files: $('#files'),
  queue: $('#queue'),
  queueMeta: $('#queueMeta'),
  nowMeta: $('#nowMeta'),
  prev: $('#prev'),
  toggle: $('#toggle'),
  next: $('#next'),
  time: $('#time'),
  seek: $('#seek'),
  vol: $('#vol'),
  lyricsBtn: $('#lyricsBtn'),
  lyrics: $('#lyrics'),
  lyricsMeta: $('#lyricsMeta'),
  openSettings: $('#openSettings'),
  settings: $('#settings'),
  storefront: $('#storefront'),
  devToken: $('#devToken'),
  userToken: $('#userToken'),
  testProxy: $('#testProxy'),
  settingsStatus: $('#settingsStatus'),
  audio: $('#audio'),
};

const STORAGE_KEY = 'musaudio_site_settings_v1';

const state = {
  tracks: [],
  index: -1,
  settings: {
    storefront: 'us',
    devToken: '',
    userToken: '',
  },
};

function proxifyAmp(url) {
  const direct = String(url || '').trim();
  if (!direct) return direct;
  return `/amp?url=${encodeURIComponent(direct)}`;
}

function getAmpHeaders() {
  const headers = {};
  const dev = String(state.settings.devToken || '').trim();
  const ut = String(state.settings.userToken || '').trim();
  if (dev) headers['Authorization'] = dev.startsWith('Bearer ') ? dev : `Bearer ${dev}`;
  if (ut) headers['Music-User-Token'] = ut;
  headers['Accept'] = 'application/json';
  return headers;
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const json = JSON.parse(raw);
    if (json && typeof json === 'object') {
      if (typeof json.storefront === 'string') state.settings.storefront = json.storefront;
      if (typeof json.devToken === 'string') state.settings.devToken = json.devToken;
      if (typeof json.userToken === 'string') state.settings.userToken = json.userToken;
    }
  } catch (e) {}
}

function saveSettings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.settings));
  } catch (e) {}
}

function applySettingsToUi() {
  try { els.storefront.value = state.settings.storefront || 'us'; } catch (e) {}
  try { els.devToken.value = state.settings.devToken || ''; } catch (e) {}
  try { els.userToken.value = state.settings.userToken || ''; } catch (e) {}
}

function readSettingsFromUi() {
  try { state.settings.storefront = String(els.storefront.value || '').trim() || 'us'; } catch (e) {}
  try { state.settings.devToken = String(els.devToken.value || '').trim(); } catch (e) {}
  try { state.settings.userToken = String(els.userToken.value || '').trim(); } catch (e) {}
  saveSettings();
}

function formatTime(sec) {
  const s = Math.max(0, Number(sec) || 0);
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}

function updateTimeUi() {
  try {
    const a = els.audio;
    const cur = a.currentTime || 0;
    const dur = a.duration || 0;
    els.time.textContent = `${formatTime(cur)} / ${formatTime(dur)}`;
    if (isFinite(dur) && dur > 0) {
      const v = Math.max(0, Math.min(1, cur / dur));
      els.seek.value = String(Math.round(v * 1000));
    } else {
      els.seek.value = '0';
    }
  } catch (e) {}
}

function getTrackLabel(t) {
  const name = String(t.name || '').trim();
  const artist = String(t.artist || '').trim();
  const title = String(t.title || '').trim();
  if (artist && title) return `${artist} — ${title}`;
  return title || name || 'Unknown';
}

function renderQueue() {
  try {
    els.queue.innerHTML = '';
    for (let i = 0; i < state.tracks.length; i++) {
      const t = state.tracks[i];
      const el = document.createElement('div');
      el.className = 'queue__item' + (i === state.index ? ' queue__item--active' : '');
      const title = document.createElement('div');
      title.className = 'queue__title';
      title.textContent = getTrackLabel(t);
      const meta = document.createElement('div');
      meta.className = 'queue__meta';
      meta.textContent = String(t.name || '').trim();
      el.appendChild(title);
      el.appendChild(meta);
      el.addEventListener('click', () => setIndex(i, { autoplay: true }));
      els.queue.appendChild(el);
    }
    els.queueMeta.textContent = `${state.tracks.length} track${state.tracks.length === 1 ? '' : 's'}`;
  } catch (e) {}
}

function setIndex(i, opts = {}) {
  const idx = Number(i);
  if (!isFinite(idx)) return;
  if (idx < 0 || idx >= state.tracks.length) return;
  state.index = idx;

  const t = state.tracks[state.index];
  try {
    els.audio.pause();
  } catch (e) {}
  try {
    els.audio.src = t.objectUrl;
    els.audio.currentTime = 0;
  } catch (e) {}

  try {
    els.nowMeta.textContent = getTrackLabel(t);
  } catch (e) {}

  try {
    els.toggle.textContent = 'Play';
  } catch (e) {}

  renderQueue();
  updateTimeUi();

  if (opts && opts.autoplay) {
    play();
  }
}

function play() {
  try {
    els.audio.play();
    els.toggle.textContent = 'Pause';
  } catch (e) {}
}

function pause() {
  try {
    els.audio.pause();
    els.toggle.textContent = 'Play';
  } catch (e) {}
}

function next() {
  if (!state.tracks.length) return;
  const i = (state.index + 1) % state.tracks.length;
  setIndex(i, { autoplay: true });
}

function prev() {
  if (!state.tracks.length) return;
  const i = (state.index - 1 + state.tracks.length) % state.tracks.length;
  setIndex(i, { autoplay: true });
}

function parseNameToTags(name) {
  const raw = String(name || '').trim().replace(/\.[^/.]+$/, '');
  const parts = raw.split(' - ');
  if (parts.length >= 2) {
    const artist = String(parts[0]).trim();
    const title = String(parts.slice(1).join(' - ')).trim();
    if (artist && title) return { artist, title };
  }
  return { artist: '', title: raw };
}

function addFiles(fileList) {
  const files = Array.from(fileList || []);
  for (const f of files) {
    if (!f) continue;
    const objectUrl = URL.createObjectURL(f);
    const meta = parseNameToTags(f.name);
    state.tracks.push({
      file: f,
      name: f.name,
      objectUrl,
      artist: meta.artist,
      title: meta.title,
    });
  }
  renderQueue();
  if (state.index === -1 && state.tracks.length) setIndex(0, { autoplay: false });
}

function looksLikeTtml(s) {
  try {
    const x = String(s || '');
    if (!x) return false;
    if (x.includes('<tt') && x.includes('</tt>')) return true;
    if (x.includes('<p') && x.includes('</p>') && x.includes('http://www.w3.org/ns/ttml')) return true;
  } catch (e) {}
  return false;
}

function isLikelyTtmlUrl(s) {
  try {
    const x = String(s || '').trim();
    if (!x) return false;
    if (!/^https?:\/\//i.test(x)) return false;
    const lx = x.toLowerCase();
    if (lx.endsWith('.ttml')) return true;
    if (lx.includes('lyric') && lx.includes('ttml')) return true;
    if (lx.includes('lyric-ttml')) return true;
  } catch (e) {}
  return false;
}

function deepFind(obj, pred) {
  try {
    if (!obj) return null;
    if (pred(obj)) return obj;
    if (typeof obj === 'string' || typeof obj === 'number' || typeof obj === 'boolean') return null;
    if (Array.isArray(obj)) {
      for (const it of obj) {
        const r = deepFind(it, pred);
        if (r != null) return r;
      }
      return null;
    }
    if (typeof obj === 'object') {
      for (const k of Object.keys(obj)) {
        const r = deepFind(obj[k], pred);
        if (r != null) return r;
      }
    }
  } catch (e) {}
  return null;
}

function scoreSong(track, song) {
  try {
    const tTitle = String(track.title || '').trim().toLowerCase();
    const tArtist = String(track.artist || '').trim().toLowerCase();
    const sTitle = String(song?.attributes?.name || '').trim().toLowerCase();
    const sArtist = String(song?.attributes?.artistName || '').trim().toLowerCase();
    let score = 0;
    if (tTitle && sTitle && tTitle === sTitle) score += 6;
    else if (tTitle && sTitle && (tTitle.includes(sTitle) || sTitle.includes(tTitle))) score += 3;
    if (tArtist && sArtist && tArtist === sArtist) score += 6;
    else if (tArtist && sArtist && (tArtist.includes(sArtist) || sArtist.includes(tArtist))) score += 3;
    return score;
  } catch (e) {
    return 0;
  }
}

async function ampFetchJson(url) {
  const res = await fetch(proxifyAmp(url), { headers: getAmpHeaders() }).catch(() => null);
  if (!res || !res.ok) return null;
  return await res.json().catch(() => null);
}

async function ampFetchText(url) {
  const res = await fetch(proxifyAmp(url), { headers: getAmpHeaders() }).catch(() => null);
  if (!res || !res.ok) return '';
  return await res.text().catch(() => '');
}

async function fetchAppleLyricsForTrack(track) {
  const sf = String(state.settings.storefront || '').trim() || 'us';
  const dev = String(state.settings.devToken || '').trim();
  const ut = String(state.settings.userToken || '').trim();
  if (!dev || !ut) {
    return { ok: false, reason: 'Missing Apple Music developer token and/or user token.' };
  }

  const term = `${String(track.artist || '').trim()} ${String(track.title || '').trim()}`.trim();
  if (!term) return { ok: false, reason: 'Missing track metadata.' };

  const searchUrl = `https://amp-api.music.apple.com/v1/catalog/${encodeURIComponent(sf)}/search?types=songs&limit=10&term=${encodeURIComponent(term)}`;
  const searchJson = await ampFetchJson(searchUrl);
  const songs = searchJson?.results?.songs?.data;
  if (!Array.isArray(songs) || !songs.length) return { ok: false, reason: 'No Apple Music matches found.' };

  let best = null;
  let bestScore = -1;
  for (const s of songs) {
    const sc = scoreSong(track, s);
    if (sc > bestScore) {
      bestScore = sc;
      best = s;
    }
  }
  const songId = String(best?.id || '').trim();
  if (!songId) return { ok: false, reason: 'Could not resolve Apple song id.' };

  const lyrUrl = `https://amp-api.music.apple.com/v1/catalog/${encodeURIComponent(sf)}/songs/${encodeURIComponent(songId)}/lyrics`;
  const lyrJson = await ampFetchJson(lyrUrl);
  if (!lyrJson) return { ok: false, reason: 'Lyrics request failed.' };

  const ttml = deepFind(lyrJson, (x) => typeof x === 'string' && looksLikeTtml(x));
  if (typeof ttml === 'string' && ttml.trim()) return { ok: true, kind: 'ttml', text: ttml.trim() };

  const ttmlUrl = deepFind(lyrJson, (x) => typeof x === 'string' && isLikelyTtmlUrl(x));
  if (typeof ttmlUrl === 'string' && ttmlUrl.trim()) {
    const txt = await ampFetchText(ttmlUrl.trim());
    if (txt && looksLikeTtml(txt)) return { ok: true, kind: 'ttml', text: txt.trim() };
  }

  return { ok: false, reason: 'No TTML lyrics found in response.' };
}

async function onFetchLyrics() {
  try {
    els.lyricsMeta.textContent = 'Fetching…';
    els.lyrics.textContent = '';

    const t = state.tracks[state.index];
    if (!t) {
      els.lyricsMeta.textContent = 'No track selected.';
      return;
    }

    const r = await fetchAppleLyricsForTrack(t);
    if (!r || !r.ok) {
      els.lyricsMeta.textContent = r && r.reason ? r.reason : 'Failed.';
      return;
    }

    els.lyricsMeta.textContent = 'Apple Music (TTML)';
    els.lyrics.textContent = r.text || '';
  } catch (e) {
    try { els.lyricsMeta.textContent = 'Failed.'; } catch (e2) {}
  }
}

async function onTestProxy() {
  try {
    readSettingsFromUi();
    els.settingsStatus.textContent = 'Testing…';
    const r = await fetch(`/health`, { headers: { 'Accept': 'application/json' } }).catch(() => null);
    if (!r || !r.ok) {
      els.settingsStatus.textContent = `Health failed (${r ? r.status : 'no response'})`;
      return;
    }
    const j = await r.json().catch(() => null);
    if (j && (j.ok === true || j.status === 'ok')) {
      els.settingsStatus.textContent = 'OK';
      return;
    }
    els.settingsStatus.textContent = 'Unexpected health response.';
  } catch (e) {
    try { els.settingsStatus.textContent = 'Health failed.'; } catch (e2) {}
  }
}

function init() {
  loadSettings();
  applySettingsToUi();

  if (els.files) {
    els.files.addEventListener('change', (ev) => {
      const input = ev && ev.target ? ev.target : null;
      const files = input && input.files ? input.files : null;
      if (files && files.length) addFiles(files);
      try { input.value = ''; } catch (e) {}
    });
  }

  if (els.openSettings && els.settings) {
    els.openSettings.addEventListener('click', () => {
      try { applySettingsToUi(); } catch (e) {}
      try { els.settings.showModal(); } catch (e) {}
    });
  }

  for (const el of [els.storefront, els.devToken, els.userToken]) {
    if (!el) continue;
    el.addEventListener('change', () => {
      readSettingsFromUi();
    });
  }

  if (els.testProxy) els.testProxy.addEventListener('click', onTestProxy);

  if (els.toggle) {
    els.toggle.addEventListener('click', () => {
      try {
        if (els.audio.paused) play();
        else pause();
      } catch (e) {}
    });
  }
  if (els.prev) els.prev.addEventListener('click', prev);
  if (els.next) els.next.addEventListener('click', next);

  if (els.seek) {
    els.seek.addEventListener('input', () => {
      try {
        const dur = els.audio.duration || 0;
        const v = Number(els.seek.value || 0) / 1000;
        if (isFinite(dur) && dur > 0) els.audio.currentTime = Math.max(0, Math.min(dur, dur * v));
      } catch (e) {}
    });
  }

  if (els.vol) {
    els.vol.addEventListener('input', () => {
      try { els.audio.volume = Math.max(0, Math.min(1, Number(els.vol.value))); } catch (e) {}
    });
    try { els.audio.volume = Math.max(0, Math.min(1, Number(els.vol.value))); } catch (e) {}
  }

  if (els.audio) {
    els.audio.addEventListener('timeupdate', updateTimeUi);
    els.audio.addEventListener('loadedmetadata', updateTimeUi);
    els.audio.addEventListener('ended', next);
    els.audio.addEventListener('play', () => { try { els.toggle.textContent = 'Pause'; } catch (e) {} });
    els.audio.addEventListener('pause', () => { try { els.toggle.textContent = 'Play'; } catch (e) {} });
  }

  if (els.lyricsBtn) els.lyricsBtn.addEventListener('click', onFetchLyrics);

  renderQueue();
  updateTimeUi();
}

init();
