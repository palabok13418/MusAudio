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
    els.audio.src = t.playUrl || t.objectUrl;
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

const __decodeCache = new Map();
const __extScriptLoads = Object.create(null);
let __ffmpegShared = null;
let __ffmpegSharedLoading = null;
let __ffmpegDecodeSeq = 0;

function __fileKey(file) {
  try {
    if (!file) return '';
    return `${String(file.name || '')}|${Number(file.size || 0)}|${Number(file.lastModified || 0)}`;
  } catch (e) {
    return '';
  }
}

function __loadExtScript(url, testFn) {
  try {
    const u = String(url || '').trim();
    if (!u) return Promise.resolve(false);
    if (__extScriptLoads[u]) return __extScriptLoads[u];
    __extScriptLoads[u] = new Promise((resolve) => {
      try {
        if (testFn && testFn()) {
          resolve(true);
          return;
        }
        const s = document.createElement('script');
        s.async = true;
        s.src = u;
        s.onload = () => {
          try {
            resolve(testFn ? !!testFn() : true);
          } catch (e2) {
            resolve(true);
          }
        };
        s.onerror = () => resolve(false);
        document.head.appendChild(s);
      } catch (e2) {
        resolve(false);
      }
    });
    return __extScriptLoads[u];
  } catch (e) {
    return Promise.resolve(false);
  }
}

async function __ensureMp4Box() {
  const ok = await __loadExtScript(
    'https://cdn.jsdelivr.net/npm/mp4box@0.5.2/dist/mp4box.all.min.js',
    () => !!(window.MP4Box && typeof window.MP4Box.createFile === 'function')
  );
  return ok && window.MP4Box ? window.MP4Box : null;
}

async function __probeM4aCodecWithMp4box(file, bufOpt) {
  try {
    const MP4Box = await __ensureMp4Box();
    if (!MP4Box || !file) return null;
    const buf = bufOpt || (await file.arrayBuffer());
    if (!buf) return null;
    buf.fileStart = 0;
    return await new Promise((resolve) => {
      try {
        const mp4boxfile = MP4Box.createFile();
        mp4boxfile.onError = () => resolve(null);
        mp4boxfile.onReady = (info) => {
          try {
            const tracks = (info && info.tracks) || [];
            const audioTrack =
              tracks.find((t) => String(t.kind || '').toLowerCase() === 'audio') ||
              tracks.find((t) => String(t.type || '').toLowerCase() === 'audio') ||
              tracks.find((t) => {
                const c = String(t.codec || t.codecID || t.type || '').toLowerCase();
                return (
                  c.includes('mp4a') ||
                  c.includes('alac') ||
                  c.includes('ac-3') ||
                  c.includes('ac3') ||
                  c.includes('ec-3') ||
                  c.includes('ec3') ||
                  c.includes('eac3') ||
                  c.includes('ac-4') ||
                  c.includes('ac4')
                );
              }) ||
              tracks[0] ||
              null;
            if (!audioTrack) {
              resolve(null);
              return;
            }
            const codec = String(audioTrack.codec || audioTrack.codecID || audioTrack.type || '').toLowerCase();
            resolve({ codec, trackInfo: audioTrack });
          } catch (e2) {
            resolve(null);
          }
        };
        mp4boxfile.appendBuffer(buf);
        mp4boxfile.flush();
      } catch (e2) {
        resolve(null);
      }
    });
  } catch (e) {
    return null;
  }
}

function __normalizeMp4AudioCodec(codecStr) {
  try {
    const c0 = String(codecStr || '').toLowerCase();
    if (!c0) return '';
    if (c0.includes('alac')) return 'alac';
    if (c0.includes('ac-4') || c0.includes('ac4')) return 'ac-4';
    if (c0.includes('ec-3') || c0.includes('ec3') || c0.includes('eac3')) return 'ec-3';
    if (c0.includes('ac-3') || c0.includes('ac3')) return 'ac-3';
    return c0;
  } catch (e) {
    return '';
  }
}

function __canPlayMp4AudioCodec(codecStr) {
  try {
    const c = __normalizeMp4AudioCodec(codecStr);
    if (!c) return false;
    const a = document.createElement('audio');
    const r = a.canPlayType(`audio/mp4; codecs="${c}"`);
    return !!r;
  } catch (e) {
    return false;
  }
}

async function __ensureFfmpegReady() {
  try {
    if (__ffmpegShared && __ffmpegShared.loaded) return __ffmpegShared;
    if (__ffmpegSharedLoading) {
      try { await __ffmpegSharedLoading; } catch (e) {}
      return __ffmpegShared && __ffmpegShared.loaded ? __ffmpegShared : null;
    }

    const ok = await __loadExtScript(
      'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/umd/ffmpeg.js',
      () => !!(window.FFmpegWASM && typeof window.FFmpegWASM.FFmpeg === 'function')
    );
    if (!ok) return null;

    const inst = new window.FFmpegWASM.FFmpeg();
    __ffmpegShared = inst;
    __ffmpegSharedLoading = (async () => {
      try {
        await inst.load({
          coreURL: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js',
          wasmURL: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm',
        });
      } catch (e2) {
        try { await inst.load(); } catch (e3) {}
      }
    })();
    try { await __ffmpegSharedLoading; } catch (e) {}
    return inst.loaded ? inst : null;
  } catch (e) {
    return null;
  }
}

async function __decodeFileWithFfmpegToWavUrl(file, opts = {}) {
  let ff = null;
  let inName = '';
  let outName = '';
  try {
    ff = await __ensureFfmpegReady();
    if (!ff || !file) return null;
    const seq = ++__ffmpegDecodeSeq;
    const nameExt = String(opts.extHint || (file.name.split('.').pop() || 'dat')).toLowerCase();
    inName = `input_${seq}.${nameExt}`;
    outName = `output_${seq}.wav`;

    const buf = opts.buf || (await file.arrayBuffer());
    if (!buf || !buf.byteLength) return null;

    await ff.writeFile(inName, new Uint8Array(buf));

    const prefer = Array.isArray(opts.preferDecoder)
      ? opts.preferDecoder.map((x) => String(x || '').trim()).filter(Boolean)
      : [];
    const candidates = prefer.slice(0);
    if (!candidates.includes('')) candidates.push('');

    const mapAudio = opts.mapAudio ? ['0:a:0', '0:a:1', '0:a:2', null] : [null];
    const forceFmt = String(opts.forceInputFormat || '').trim();
    const forceStereo = opts.forceStereo !== false;
    const fastProbe = !!opts.fastProbe;

    let ok = false;
    for (const mapSpec of mapAudio) {
      for (const dec of candidates) {
        try {
          const args = [];
          if (fastProbe) {
            args.push('-analyzeduration', '0', '-probesize', '262144');
            args.push('-fflags', '+discardcorrupt');
          }
          if (forceFmt) args.push('-f', forceFmt);
          if (dec) args.push('-c:a', dec);
          args.push('-i', inName);
          if (mapSpec) args.push('-map', String(mapSpec));
          args.push('-vn', '-sn', '-dn');
          if (forceStereo) args.push('-ac', '2');
          args.push('-ar', '48000');
          args.push('-acodec', 'pcm_s16le', '-f', 'wav', outName);
          try { await ff.deleteFile(outName); } catch (e2) {}
          await ff.exec(args);
          ok = true;
          break;
        } catch (e2) {}
      }
      if (ok) break;
    }
    if (!ok) return null;

    const data = await ff.readFile(outName).catch(() => null);
    if (!data || !data.byteLength) return null;
    const blob = new Blob([data], { type: 'audio/wav' });
    return URL.createObjectURL(blob);
  } catch (e) {
    return null;
  } finally {
    try { if (ff && inName) await ff.deleteFile(inName); } catch (e2) {}
    try { if (ff && outName) await ff.deleteFile(outName); } catch (e2) {}
  }
}

async function __maybeDecodeTrackToPlayableUrl(track, opts = {}) {
  try {
    if (!track || !track.file) return false;
    if (track.__decodeInFlight) {
      if (opts.wait && track.__decodePromise) {
        try { await track.__decodePromise; } catch (e) {}
        return !!(track.playUrl && track.playUrl !== track.objectUrl);
      }
      return false;
    }
    if (track.__decodeDone && !opts.force) return false;

    const prevUrl = String(track.playUrl || track.objectUrl || '');
    const file = track.file;
    const ext = String((file.name || '').split('.').pop() || '').toLowerCase();
    const isM4a = ext === 'm4a' || ext === 'mp4';
    const isDolbyExt = ext === 'ac3' || ext === 'eac3' || ext === 'ec3' || ext === 'ac4' || ext === 'ac-4';
    if (!isM4a && !isDolbyExt) return false;

    const key = __fileKey(file);
    if (key && __decodeCache.has(key) && !opts.force) {
      track.playUrl = __decodeCache.get(key);
      track.__decodeDone = true;
      return String(track.playUrl || '') !== prevUrl;
    }

    track.__decodeInFlight = true;
    track.__decodePromise = (async () => {
      let buf = null;
      try { buf = await file.arrayBuffer(); } catch (e2) {}

      let codec = '';
      if (isM4a && buf) {
        const info = await __probeM4aCodecWithMp4box(file, buf);
        codec = info && info.codec ? String(info.codec) : '';
      }

      const c = String(codec || '').toLowerCase();
      const isAlac = c.includes('alac');
      const isDolby =
        c.includes('ac-4') ||
        c.includes('ac4') ||
        c.includes('ec-3') ||
        c.includes('ec3') ||
        c.includes('eac3') ||
        c.includes('ac-3') ||
        c.includes('ac3');

      const playable = isM4a && codec ? __canPlayMp4AudioCodec(codec) : false;

      const shouldDecode =
        opts.force ||
        (isDolbyExt ? true : false) ||
        (isM4a && isAlac && !playable) ||
        (isM4a && isDolby && !playable);
      if (!shouldDecode) {
        track.__decodeDone = true;
        track.__decodeInFlight = false;
        return false;
      }

      const prefer = (() => {
        if (isAlac) return ['alac'];
        if (c.includes('ac-4') || c.includes('ac4') || ext === 'ac4' || ext === 'ac-4') return ['ac4', 'eac3', 'ac3'];
        if (c.includes('ec-3') || c.includes('ec3') || c.includes('eac3') || ext === 'eac3' || ext === 'ec3') return ['eac3', 'ac3'];
        if (c.includes('ac-3') || c.includes('ac3') || ext === 'ac3') return ['ac3'];
        return ['eac3', 'ac3', 'ac4', 'alac'];
      })();

      const wavUrl = await __decodeFileWithFfmpegToWavUrl(file, {
        extHint: isM4a ? 'm4a' : ext,
        buf,
        preferDecoder: prefer,
        fastProbe: true,
        mapAudio: true,
        forceStereo: true,
        forceInputFormat: isM4a ? 'mp4' : '',
      });

      if (wavUrl) {
        track.playUrl = wavUrl;
        if (key) __decodeCache.set(key, wavUrl);
        track.__decodeDone = true;
        track.__decodeInFlight = false;
        return true;
      }

      track.__decodeDone = true;
      track.__decodeInFlight = false;
      return false;
    })();

    const changed = await track.__decodePromise;
    return changed && String(track.playUrl || '') !== prevUrl;
  } catch (e) {
    try {
      if (track) {
        track.__decodeDone = true;
        track.__decodeInFlight = false;
        track.__decodePromise = null;
      }
    } catch (e2) {}
    return false;
  }
}

async function __repairAudioElIfNeeded(el) {
  try {
    if (!el) return;
    const t = state.tracks[state.index];
    if (!t || !t.file) return;
    if (t.__decodeRepairTried) return;
    t.__decodeRepairTried = true;

    const wasPlaying = !el.paused;
    const curT = el.currentTime || 0;
    const old = String(el.src || '');
    const changed = await __maybeDecodeTrackToPlayableUrl(t, { force: true, wait: true });
    if (!changed) return;
    const next = String(t.playUrl || t.objectUrl || '');
    if (next && next !== old) {
      try { el.pause(); } catch (e2) {}
      el.src = next;
      try { el.load(); } catch (e2) {}
      try { el.currentTime = curT; } catch (e2) {}
      if (wasPlaying) {
        try { el.play(); } catch (e2) {}
      }
      try { renderQueue(); } catch (e2) {}
    }
  } catch (e) {}
}

function addFiles(fileList) {
  const files = Array.from(fileList || []);
  for (const f of files) {
    if (!f) continue;
    const objectUrl = URL.createObjectURL(f);
    const meta = parseNameToTags(f.name);
    const track = {
      file: f,
      name: f.name,
      objectUrl,
      playUrl: objectUrl,
      artist: meta.artist,
      title: meta.title,
      __decodeDone: false,
      __decodeInFlight: false,
      __decodeRepairTried: false,
      __decodePromise: null,
    };
    state.tracks.push(track);
    __maybeDecodeTrackToPlayableUrl(track).then(() => {
      try {
        const cur = state.tracks[state.index];
        if (cur === track && els.audio) {
          const want = String(track.playUrl || track.objectUrl || '');
          if (want && String(els.audio.src || '') !== want) {
            const wasPlaying = !els.audio.paused;
            const curT = els.audio.currentTime || 0;
            try { els.audio.pause(); } catch (e2) {}
            els.audio.src = want;
            try { els.audio.load(); } catch (e2) {}
            try { els.audio.currentTime = curT; } catch (e2) {}
            if (wasPlaying) play();
          }
        }
      } catch (e2) {}
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

  try {
    const isViteDev = (() => {
      try { return String(location && location.port ? location.port : '') === '5174'; } catch { return false; }
    })();
    if (!isViteDev && 'serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
  } catch (e) {}

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
    els.audio.addEventListener('error', () => { __repairAudioElIfNeeded(els.audio); });
    els.audio.addEventListener('play', () => { try { els.toggle.textContent = 'Pause'; } catch (e) {} });
    els.audio.addEventListener('pause', () => { try { els.toggle.textContent = 'Play'; } catch (e) {} });
  }

  if (els.lyricsBtn) els.lyricsBtn.addEventListener('click', onFetchLyrics);

  renderQueue();
  updateTimeUi();
}

init();
