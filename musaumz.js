const $ = (sel) => document.querySelector(sel);

const els = {
  files: $('#files'),
  openSettings: $('#openSettings'),
  settings: $('#settings'),
  storefront: $('#storefront'),
  devToken: $('#devToken'),
  userToken: $('#userToken'),
  testApi: $('#testApi'),
  settingsStatus: $('#settingsStatus'),

  toggleAutomix: $('#toggleAutomix'),
  toggleSpatial: $('#toggleSpatial'),
  toggleAutoVol: $('#toggleAutoVol'),
  toggleAutoEq: $('#toggleAutoEq'),

  prev: $('#prev'),
  playPause: $('#playPause'),
  next: $('#next'),
  crossfadeNow: $('#crossfadeNow'),

  time: $('#time'),
  seek: $('#seek'),
  vol: $('#vol'),
  fadeSec: $('#fadeSec'),
  health: $('#health'),

  queue: $('#queue'),
  queueMeta: $('#queueMeta'),
  nowMeta: $('#nowMeta'),
  engineMeta: $('#engineMeta'),

  fetchLyrics: $('#fetchLyrics'),
  lyricsMeta: $('#lyricsMeta'),
  lyrics: $('#lyrics'),

  audioA: $('#audioA'),
  audioB: $('#audioB'),
};

const STORAGE_KEY = 'musaumz_site_settings_v1';

const state = {
  tracks: [],
  index: -1,
  activeSide: 'A',
  crossfading: false,
  crossfadeAt: 0,
  crossfadeDur: 1.6,

  preload: {
    idx: -1,
    side: 'B',
    startedAt: 0,
  },

  automix: false,
  spatial: false,
  autoVol: true,
  autoEq: false,

  settings: {
    storefront: 'us',
    devToken: '',
    userToken: '',
    volume: 1,
    fadeSec: 1.6,
  },

  agc: {
    targetRms: 0.15,
    maxBoostDb: 10,
    maxCutDb: 14,
    curDb: 0,
    lastT: 0,
  },

  spatialLfo: {
    t0: 0,
    phaseA: Math.random() * Math.PI * 2,
    phaseB: Math.random() * Math.PI * 2,
  },
};

let audioCtx = null;
let masterGain = null;
let userGain = null;
let autoGain = null;
let analyser = null;

let srcA = null;
let srcB = null;
let gainA = null;
let gainB = null;
let panA = null;
let panB = null;
let comp = null;
let eq = null;

let uiRaf = 0;
let motionRaf = 0;
let healthTimer = 0;

function clamp(v, a, b) {
  v = Number(v);
  if (!isFinite(v)) return a;
  return Math.max(a, Math.min(b, v));
}

function fmtTime(sec) {
  const s = Math.max(0, Number(sec) || 0);
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}

function trackLabel(t) {
  if (!t) return '—';
  const a = String(t.artist || '').trim();
  const ti = String(t.title || '').trim();
  if (a && ti) return `${a} — ${ti}`;
  return ti || String(t.name || '').trim() || 'Unknown';
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

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const j = JSON.parse(raw);
    if (!j || typeof j !== 'object') return;
    if (typeof j.storefront === 'string') state.settings.storefront = j.storefront;
    if (typeof j.devToken === 'string') state.settings.devToken = j.devToken;
    if (typeof j.userToken === 'string') state.settings.userToken = j.userToken;
    if (typeof j.volume === 'number' && isFinite(j.volume)) state.settings.volume = clamp(j.volume, 0, 1);
    if (typeof j.fadeSec === 'number' && isFinite(j.fadeSec)) state.settings.fadeSec = clamp(j.fadeSec, 0.2, 6);
    if (typeof j.automix === 'boolean') state.automix = j.automix;
    if (typeof j.spatial === 'boolean') state.spatial = j.spatial;
    if (typeof j.autoVol === 'boolean') state.autoVol = j.autoVol;
    if (typeof j.autoEq === 'boolean') state.autoEq = j.autoEq;
  } catch {}
}

function saveSettings() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        storefront: state.settings.storefront,
        devToken: state.settings.devToken,
        userToken: state.settings.userToken,
        volume: state.settings.volume,
        fadeSec: state.settings.fadeSec,
        automix: state.automix,
        spatial: state.spatial,
        autoVol: state.autoVol,
        autoEq: state.autoEq,
      })
    );
  } catch {}
}

function applySettingsToUi() {
  try { if (els.storefront) els.storefront.value = state.settings.storefront || 'us'; } catch {}
  try { if (els.devToken) els.devToken.value = state.settings.devToken || ''; } catch {}
  try { if (els.userToken) els.userToken.value = state.settings.userToken || ''; } catch {}
  try { if (els.toggleAutomix) els.toggleAutomix.checked = !!state.automix; } catch {}
  try { if (els.toggleSpatial) els.toggleSpatial.checked = !!state.spatial; } catch {}
  try { if (els.toggleAutoVol) els.toggleAutoVol.checked = !!state.autoVol; } catch {}
  try { if (els.toggleAutoEq) els.toggleAutoEq.checked = !!state.autoEq; } catch {}
  try { if (els.vol) els.vol.value = String(clamp(state.settings.volume, 0, 1)); } catch {}
  try { if (els.fadeSec) els.fadeSec.value = String(clamp(state.settings.fadeSec, 0.2, 6)); } catch {}
}

function readSettingsFromUi() {
  try { state.settings.storefront = String(els.storefront.value || '').trim() || 'us'; } catch {}
  try { state.settings.devToken = String(els.devToken.value || '').trim(); } catch {}
  try { state.settings.userToken = String(els.userToken.value || '').trim(); } catch {}
  try { state.automix = !!els.toggleAutomix.checked; } catch {}
  try { state.spatial = !!els.toggleSpatial.checked; } catch {}
  try { state.autoVol = !!els.toggleAutoVol.checked; } catch {}
  try { state.autoEq = !!els.toggleAutoEq.checked; } catch {}
  try { state.settings.volume = clamp(els.vol ? els.vol.value : state.settings.volume, 0, 1); } catch {}
  try { state.settings.fadeSec = clamp(els.fadeSec ? els.fadeSec.value : state.settings.fadeSec, 0.2, 6); } catch {}
  saveSettings();
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

function proxifyAmp(url) {
  const direct = String(url || '').trim();
  if (!direct) return direct;
  return `/amp?url=${encodeURIComponent(direct)}`;
}

async function apiHealthOnce() {
  const r = await fetch('/health', { headers: { Accept: 'application/json' } }).catch(() => null);
  if (!r || !r.ok) return false;
  const j = await r.json().catch(() => null);
  return !!(j && (j.ok === true || j.status === 'ok'));
}

async function updateHealthUi() {
  try {
    const ok = await apiHealthOnce();
    els.health.textContent = ok ? 'API: OK' : 'API: DOWN';
  } catch {
    try { els.health.textContent = 'API: DOWN'; } catch {}
  }
}

function ensureAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  masterGain = audioCtx.createGain();
  userGain = audioCtx.createGain();
  autoGain = audioCtx.createGain();

  comp = audioCtx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 24;
  comp.ratio.value = 3;
  comp.attack.value = 0.005;
  comp.release.value = 0.24;

  eq = audioCtx.createBiquadFilter();
  eq.type = 'lowshelf';
  eq.frequency.value = 140;
  eq.gain.value = 0;

  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.85;

  userGain.connect(autoGain);
  autoGain.connect(eq);
  eq.connect(comp);
  comp.connect(analyser);
  analyser.connect(masterGain);
  masterGain.connect(audioCtx.destination);

  gainA = audioCtx.createGain();
  gainB = audioCtx.createGain();
  gainA.gain.value = 1;
  gainB.gain.value = 0;

  panA = audioCtx.createStereoPanner();
  panB = audioCtx.createStereoPanner();
  panA.pan.value = 0;
  panB.pan.value = 0;

  gainA.connect(panA);
  gainB.connect(panB);
  panA.connect(userGain);
  panB.connect(userGain);

  try { srcA = audioCtx.createMediaElementSource(els.audioA); } catch {}
  try { srcB = audioCtx.createMediaElementSource(els.audioB); } catch {}
  if (srcA) srcA.connect(gainA);
  if (srcB) srcB.connect(gainB);

  updateEngineMeta();
}

async function resumeAudio() {
  ensureAudio();
  try { if (audioCtx.state !== 'running') await audioCtx.resume(); } catch {}
}

function updateEngineMeta() {
  try {
    const r = [];
    r.push(`A/B`);
    if (state.automix) r.push('AutoMix');
    if (state.spatial) r.push('Spatial');
    if (state.autoVol) r.push('AutoVol');
    if (state.autoEq) r.push('AutoEQ');
    els.engineMeta.textContent = `Engine: ${r.join(' • ')}`;
  } catch {}
}

function activeEl() {
  return state.activeSide === 'A' ? els.audioA : els.audioB;
}

function inactiveEl() {
  return state.activeSide === 'A' ? els.audioB : els.audioA;
}

function inactiveSide() {
  return state.activeSide === 'A' ? 'B' : 'A';
}

function safePause(el) {
  try { if (el && !el.paused) el.pause(); } catch {}
}

function safePlay(el) {
  try {
    if (!el) return;
    const p = el.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch {}
}

function activeGain() {
  return state.activeSide === 'A' ? gainA : gainB;
}

function inactiveGain() {
  return state.activeSide === 'A' ? gainB : gainA;
}

function isPlaying() {
  const a = activeEl();
  return !!(a && !a.paused);
}

function renderQueue() {
  try {
    els.queue.innerHTML = '';
    for (let i = 0; i < state.tracks.length; i++) {
      const t = state.tracks[i];
      const row = document.createElement('button');
      row.type = 'button';
      row.className =
        'w-full text-left rounded-xl border border-white/10 bg-black/20 px-3 py-2 hover:bg-white/5 ' +
        (i === state.index ? 'ring-1 ring-cyan-300/50' : '');
      const title = document.createElement('div');
      title.className = 'text-sm font-medium';
      title.textContent = trackLabel(t);
      const meta = document.createElement('div');
      meta.className = 'text-xs text-slate-400';
      meta.textContent = String(t.name || '').trim();
      row.appendChild(title);
      row.appendChild(meta);
      row.addEventListener('click', () => setIndex(i, { autoplay: true }));
      els.queue.appendChild(row);
    }
    els.queueMeta.textContent = `${state.tracks.length} track${state.tracks.length === 1 ? '' : 's'}`;
  } catch {}
}

function updateControlsEnabled() {
  try {
    const has = state.tracks.length > 0;
    const hasSel = state.index >= 0 && state.index < state.tracks.length;
    if (els.prev) els.prev.disabled = !has;
    if (els.next) els.next.disabled = !has;
    if (els.crossfadeNow) els.crossfadeNow.disabled = !has;
    if (els.playPause) els.playPause.disabled = !hasSel;
    if (els.seek) els.seek.disabled = !hasSel;
    if (els.fetchLyrics) els.fetchLyrics.disabled = !hasSel;
  } catch {}
}

function setIndex(i, opts = {}) {
  const idx = Number(i);
  if (!isFinite(idx)) return;
  if (idx < 0 || idx >= state.tracks.length) return;
  state.index = idx;

  const t = state.tracks[state.index];
  const a = activeEl();
  const b = inactiveEl();
  safePause(a);
  safePause(b);

  try {
    if (gainA && gainA.gain) gainA.gain.value = (state.activeSide === 'A') ? 1 : 0;
    if (gainB && gainB.gain) gainB.gain.value = (state.activeSide === 'B') ? 1 : 0;
  } catch {}

  try {
    a.src = t.objectUrl;
    a.currentTime = 0;
  } catch {}

  try {
    state.preload.idx = -1;
    state.preload.side = inactiveSide();
    state.preload.startedAt = 0;
  } catch {}

  try {
    els.nowMeta.textContent = trackLabel(t);
  } catch {}

  state.crossfading = false;
  renderQueue();
  updateControlsEnabled();
  updateTimeUiOnce();

  if (opts.autoplay) {
    play();
  } else {
    updatePlayPauseUi();
  }
}

function updatePlayPauseUi() {
  try {
    els.playPause.textContent = isPlaying() ? 'Pause' : 'Play';
  } catch {}
}

async function play() {
  await resumeAudio();
  const a = activeEl();
  if (!a || state.index < 0) return;
  safePlay(a);
  try {
    if (state.crossfading) safePlay(inactiveEl());
  } catch {}
  updatePlayPauseUi();
  ensureUiLoop();
  ensureMotionLoop();
}

function pause() {
  safePause(activeEl());
  safePause(inactiveEl());
  updatePlayPauseUi();
}

function nextIndex() {
  if (!state.tracks.length) return -1;
  if (state.index < 0) return 0;
  return (state.index + 1) % state.tracks.length;
}

function prevIndex() {
  if (!state.tracks.length) return -1;
  if (state.index < 0) return 0;
  return (state.index - 1 + state.tracks.length) % state.tracks.length;
}

function next(opts = {}) {
  const ni = nextIndex();
  if (ni < 0) return;
  if (opts && opts.crossfade) {
    crossfadeToIndex(ni);
  } else {
    setIndex(ni, { autoplay: true });
  }
}

function prev() {
  const pi = prevIndex();
  if (pi < 0) return;
  setIndex(pi, { autoplay: true });
}

function getFadeSec() {
  const s = clamp(els.fadeSec ? els.fadeSec.value : state.crossfadeDur, 0.2, 6);
  state.crossfadeDur = s;
  try { state.settings.fadeSec = s; saveSettings(); } catch {}
  return s;
}

function ensureTrackLoadedOnEl(el, t) {
  try {
    if (!el || !t) return false;
    const cur = String(el.src || '');
    const want = String(t.objectUrl || '');
    if (!want) return false;
    if (cur === want) return true;
    safePause(el);
    el.src = want;
    try { el.currentTime = 0; } catch {}
    return true;
  } catch {
    return false;
  }
}

function maybePreloadNext() {
  try {
    if (!state.automix) return;
    if (state.crossfading) return;
    if (state.index < 0 || state.index >= state.tracks.length) return;

    const outEl = activeEl();
    if (!outEl || outEl.paused) return;
    const dur = outEl.duration || 0;
    const cur = outEl.currentTime || 0;
    if (!isFinite(dur) || dur <= 0) return;

    const fade = getFadeSec();
    const remain = dur - cur;
    const preloadWhen = Math.max(8, fade + 5);
    if (remain > preloadWhen) return;

    const ni = nextIndex();
    if (ni < 0) return;
    const side = inactiveSide();
    const inEl = inactiveEl();
    if (!inEl) return;
    if (state.preload.idx === ni && state.preload.side === side) return;

    const t = state.tracks[ni];
    if (!t) return;
    ensureTrackLoadedOnEl(inEl, t);
    state.preload.idx = ni;
    state.preload.side = side;
    state.preload.startedAt = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  } catch {}
}

async function crossfadeToIndex(i) {
  if (state.crossfading) return;
  if (!audioCtx) ensureAudio();
  if (!audioCtx) return;
  if (i < 0 || i >= state.tracks.length) return;
  if (state.index === -1) {
    setIndex(i, { autoplay: true });
    return;
  }

  const fade = getFadeSec();
  const outEl = activeEl();
  const inEl = inactiveEl();
  const outG = activeGain();
  const inG = inactiveGain();

  try {
    if (outEl && outEl.paused) {
      setIndex(i, { autoplay: true });
      return;
    }
  } catch {}

  const t = state.tracks[i];
  state.index = i;
  renderQueue();
  try { els.nowMeta.textContent = trackLabel(t); } catch {}

  try {
    ensureTrackLoadedOnEl(inEl, t);
  } catch {}

  await resumeAudio();
  try {
    safePlay(inEl);
  } catch {}

  const now = audioCtx.currentTime;
  state.crossfading = true;
  state.crossfadeAt = now;

  try { outG.gain.cancelScheduledValues(now); } catch {}
  try { inG.gain.cancelScheduledValues(now); } catch {}

  const outCur = outG.gain.value;
  try { outG.gain.setValueAtTime(isFinite(outCur) ? outCur : 1, now); } catch {}
  try { inG.gain.setValueAtTime(0, now); } catch {}
  try { inG.gain.linearRampToValueAtTime(1, now + fade); } catch {}
  try { outG.gain.linearRampToValueAtTime(0, now + fade); } catch {}

  setTimeout(() => {
    try {
      safePause(outEl);
      outEl.currentTime = 0;
    } catch {}
    try {
      outG.gain.value = 0;
      inG.gain.value = 1;
    } catch {}
    state.activeSide = state.activeSide === 'A' ? 'B' : 'A';
    state.crossfading = false;
    try {
      state.preload.idx = -1;
      state.preload.side = inactiveSide();
      state.preload.startedAt = 0;
    } catch {}
    updatePlayPauseUi();
  }, Math.max(0, fade * 1000 + 30));

  updatePlayPauseUi();
}

function updateTimeUiOnce() {
  try {
    const a = activeEl();
    const cur = a.currentTime || 0;
    const dur = a.duration || 0;
    els.time.textContent = `${fmtTime(cur)} / ${fmtTime(dur)}`;
    if (isFinite(dur) && dur > 0) {
      els.seek.value = String(Math.round(clamp(cur / dur, 0, 1) * 1000));
    } else {
      els.seek.value = '0';
    }
  } catch {}
}

function maybeAutoCrossfade() {
  if (!state.automix) return;
  if (state.crossfading) return;
  const a = activeEl();
  if (!a || a.paused) return;
  const dur = a.duration || 0;
  const cur = a.currentTime || 0;
  if (!isFinite(dur) || dur <= 0) return;

  const fade = getFadeSec();
  const remain = dur - cur;
  if (remain <= Math.max(0.3, fade + 0.30)) {
    const ni = nextIndex();
    if (ni >= 0) crossfadeToIndex(ni);
  }
}

function ensureUiLoop() {
  if (uiRaf) return;
  const step = () => {
    uiRaf = requestAnimationFrame(step);
    updateTimeUiOnce();
    maybePreloadNext();
    maybeAutoCrossfade();
    updateAgc();
    updateAutoEq();
  };
  uiRaf = requestAnimationFrame(step);
}

function ensureMotionLoop() {
  if (motionRaf) return;
  state.spatialLfo.t0 = (performance.now ? performance.now() : Date.now()) / 1000;
  const step = () => {
    motionRaf = requestAnimationFrame(step);
    updateSpatialMotion();
  };
  motionRaf = requestAnimationFrame(step);
}

function updateSpatialMotion() {
  try {
    if (!audioCtx || !panA || !panB) return;
    if (!state.spatial) {
      panA.pan.value = 0;
      panB.pan.value = 0;
      return;
    }
    const t = (performance.now ? performance.now() : Date.now()) / 1000;
    const cycle = 0.08;
    const a = Math.sin(t * cycle + state.spatialLfo.phaseA);
    const b = Math.sin(t * cycle + state.spatialLfo.phaseB);
    const wob = state.crossfading ? 0.9 : 0.65;
    panA.pan.value = clamp(a * wob, -1, 1);
    panB.pan.value = clamp(b * wob, -1, 1);
  } catch {}
}

function updateAgc() {
  try {
    if (!audioCtx || !analyser || !autoGain) return;
    if (!state.autoVol) {
      autoGain.gain.value = 1;
      state.agc.curDb = 0;
      return;
    }

    const now = audioCtx.currentTime;
    const last = state.agc.lastT || 0;
    if (now - last < 0.10) return;
    state.agc.lastT = now;

    const buf = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    const rms = Math.sqrt(sum / Math.max(1, buf.length));

    const target = clamp(state.agc.targetRms, 0.04, 0.25);
    const ratio = target / Math.max(1e-6, rms);
    let desiredDb = 20 * Math.log10(ratio);
    desiredDb = clamp(desiredDb, -state.agc.maxCutDb, state.agc.maxBoostDb);

    const cur = state.agc.curDb || 0;
    const alpha = desiredDb > cur ? 0.06 : 0.10;
    const next = cur + (desiredDb - cur) * alpha;
    state.agc.curDb = next;

    const lin = Math.pow(10, next / 20);
    autoGain.gain.value = clamp(lin, 0.2, 3.2);
  } catch {}
}

function updateAutoEq() {
  try {
    if (!eq || !analyser) return;
    if (!state.autoEq) {
      eq.gain.value = 0;
      return;
    }

    const bins = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(bins);

    const len = bins.length;
    if (!len) return;

    let low = 0;
    let mid = 0;
    for (let i = 0; i < len; i++) {
      const v = bins[i] / 255;
      const f = (i / len) * (audioCtx.sampleRate / 2);
      if (f < 160) low += v;
      else if (f >= 400 && f < 2000) mid += v;
    }

    low /= Math.max(1, len * 0.08);
    mid /= Math.max(1, len * 0.12);

    const tilt = (mid - low);
    const desired = clamp(tilt * 14, -6, 6);
    eq.gain.value = eq.gain.value + (desired - eq.gain.value) * 0.07;
  } catch {}
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
  updateControlsEnabled();
  if (state.index === -1 && state.tracks.length) setIndex(0, { autoplay: false });
}

function looksLikeTtml(s) {
  try {
    const x = String(s || '');
    if (!x) return false;
    if (x.includes('<tt') && x.includes('</tt>')) return true;
    if (x.includes('<p') && x.includes('</p>') && x.includes('http://www.w3.org/ns/ttml')) return true;
  } catch {}
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
  } catch {}
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
  } catch {
    return 0;
  }
}

async function ampFetchJson(url) {
  const res = await fetch(proxifyAmp(url), { headers: getAmpHeaders() }).catch(() => null);
  if (!res || !res.ok) return null;
  return await res.json().catch(() => null);
}

async function ampFetchText(url) {
  const res = await fetch(proxifyAmp(url), { headers: { ...getAmpHeaders(), Accept: '*/*' } }).catch(() => null);
  if (!res || !res.ok) return '';
  return await res.text().catch(() => '');
}

function ttmlToPlainText(ttml) {
  try {
    const s = String(ttml || '').trim();
    if (!s) return '';
    const doc = new DOMParser().parseFromString(s, 'application/xml');
    const ps = Array.from(doc.getElementsByTagName('p'));
    if (!ps.length) return s;
    const lines = [];
    for (const p of ps) {
      const t = (p.textContent || '').trim();
      if (t) lines.push(t);
    }
    return lines.join('\n');
  } catch {
    return String(ttml || '').trim();
  }
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
  if (typeof ttml === 'string' && ttml.trim()) {
    return { ok: true, kind: 'ttml', text: ttml.trim() };
  }

  const ttmlUrl = deepFind(lyrJson, (x) => typeof x === 'string' && /ttml/i.test(x));
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
    els.lyrics.textContent = ttmlToPlainText(r.text || '');
  } catch {
    try { els.lyricsMeta.textContent = 'Failed.'; } catch {}
  }
}

async function onTestApi() {
  try {
    readSettingsFromUi();
    els.settingsStatus.textContent = 'Testing…';
    const ok = await apiHealthOnce();
    els.settingsStatus.textContent = ok ? 'OK' : 'DOWN';
  } catch {
    try { els.settingsStatus.textContent = 'Failed.'; } catch {}
  }
}

function wireUi() {
  if (els.files) {
    els.files.addEventListener('change', (ev) => {
      const input = ev && ev.target ? ev.target : null;
      const files = input && input.files ? input.files : null;
      if (files && files.length) addFiles(files);
      try { input.value = ''; } catch {}
    });
  }

  if (els.openSettings && els.settings) {
    els.openSettings.addEventListener('click', () => {
      try { applySettingsToUi(); } catch {}
      try { els.settings.showModal(); } catch {}
    });
  }

  for (const el of [els.storefront, els.devToken, els.userToken, els.toggleAutomix, els.toggleSpatial, els.toggleAutoVol, els.toggleAutoEq]) {
    if (!el) continue;
    el.addEventListener('change', () => {
      readSettingsFromUi();
      updateEngineMeta();
    });
  }

  if (els.testApi) els.testApi.addEventListener('click', onTestApi);

  if (els.playPause) {
    els.playPause.addEventListener('click', () => {
      if (isPlaying()) pause();
      else play();
    });
  }
  if (els.prev) els.prev.addEventListener('click', prev);
  if (els.next) els.next.addEventListener('click', () => next({ crossfade: false }));

  if (els.crossfadeNow) els.crossfadeNow.addEventListener('click', () => next({ crossfade: true }));

  if (els.seek) {
    els.seek.addEventListener('input', () => {
      try {
        const a = activeEl();
        const dur = a.duration || 0;
        const v = Number(els.seek.value || 0) / 1000;
        if (isFinite(dur) && dur > 0) a.currentTime = Math.max(0, Math.min(dur, dur * v));
      } catch {}
    });
  }

  if (els.vol) {
    els.vol.addEventListener('input', () => {
      try {
        const v = clamp(els.vol.value, 0, 1);
        if (userGain) userGain.gain.value = v;
        state.settings.volume = v;
        saveSettings();
      } catch {}
    });
  }

  if (els.fadeSec) {
    els.fadeSec.addEventListener('input', () => {
      getFadeSec();
    });
  }

  if (els.fetchLyrics) els.fetchLyrics.addEventListener('click', onFetchLyrics);

  for (const a of [els.audioA, els.audioB]) {
    if (!a) continue;
    a.addEventListener('play', updatePlayPauseUi);
    a.addEventListener('pause', updatePlayPauseUi);
    a.addEventListener('ended', () => {
      try {
        if (state.crossfading) return;
        if (a !== activeEl()) return;
        const ni = nextIndex();
        if (ni < 0) return;
        setIndex(ni, { autoplay: true });
      } catch {}
    });
  }
}

function init() {
  loadSettings();
  applySettingsToUi();
  wireUi();
  updateEngineMeta();

  ensureAudio();
  try {
    const v = clamp(els.vol ? els.vol.value : state.settings.volume, 0, 1);
    userGain.gain.value = v;
  } catch {}

  try { getFadeSec(); } catch {}

  updateHealthUi();
  try { if (healthTimer) clearInterval(healthTimer); } catch {}
  healthTimer = setInterval(updateHealthUi, 8000);

  renderQueue();
  updateControlsEnabled();
  updateTimeUiOnce();
}

init();
