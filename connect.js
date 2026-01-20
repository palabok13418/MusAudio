const d = (sel) => document.querySelector(sel);

const ui = {
  statusBadge: d('#statusBadge'),
  codeInput: d('#codeInput'),
  nameInput: d('#nameInput'),
  joinBtn: d('#joinBtn'),
  disconnectBtn: d('#disconnectBtn'),
  syncBtn: d('#syncBtn'),
  playBtn: d('#playBtn'),
  pauseBtn: d('#pauseBtn'),
  prevBtn: d('#prevBtn'),
  nextBtn: d('#nextBtn'),
  peerId: d('#peerId'),
  hostId: d('#hostId'),
  streamState: d('#streamState'),
  streamAudio: d('#streamAudio'),
  npCover: d('#npCover'),
  npTitle: d('#npTitle'),
  npArtist: d('#npArtist'),
  npState: d('#npState'),
  library: d('#library'),
  libMeta: d('#libMeta'),
};

const state = {
  peer: null,
  conn: null,
  call: null,
  hostCode: '',
  lib: [],
  lastHostState: null,
  connected: false,
};

function setBadge(text, ok) {
  try {
    ui.statusBadge.textContent = text;
    ui.statusBadge.style.borderColor = ok ? 'color-mix(in oklab, var(--accent) 60%, transparent)' : 'rgba(255,255,255,.14)';
    ui.statusBadge.style.color = ok ? 'color-mix(in oklab, var(--accent) 70%, white)' : 'var(--muted)';
  } catch {}
}

function normalizeCode(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/^mus-\d{5}$/i.test(s)) return s.toLowerCase();
  const digits = s.replace(/\D+/g, '');
  if (digits.length === 5) return `mus-${digits}`;
  return s.toLowerCase();
}

function setConnectedUI(on) {
  const v = !!on;
  ui.disconnectBtn.disabled = !v;
  ui.syncBtn.disabled = !v;
  ui.playBtn.disabled = !v;
  ui.pauseBtn.disabled = !v;
  ui.prevBtn.disabled = !v;
  ui.nextBtn.disabled = !v;
  ui.joinBtn.disabled = v;
  ui.codeInput.disabled = v;
  ui.nameInput.disabled = v;
}

function renderLibrary() {
  try {
    ui.library.innerHTML = '';
    const items = Array.isArray(state.lib) ? state.lib : [];
    ui.libMeta.textContent = `${items.length} track${items.length === 1 ? '' : 's'}`;

    for (const it of items) {
      const row = document.createElement('div');
      row.className = 'item';

      const cov = document.createElement('div');
      cov.className = 'cover';
      cov.style.width = '40px';
      cov.style.height = '40px';
      cov.style.borderRadius = '12px';
      if (it && it.cover) cov.style.backgroundImage = `url(${String(it.cover)})`;

      const meta = document.createElement('div');
      meta.style.minWidth = '0';
      const t = document.createElement('div');
      t.className = 't';
      t.textContent = String(it?.title || '');
      const a = document.createElement('div');
      a.className = 'a';
      a.textContent = String(it?.artist || '');
      meta.append(t, a);

      const act = document.createElement('button');
      act.className = 'btn';
      act.type = 'button';
      act.style.padding = '8px 10px';
      act.innerHTML = '<span class="icon">play_arrow</span>Play';
      act.addEventListener('click', (e) => {
        try { e.preventDefault(); e.stopPropagation(); } catch {}
        const idx = Number(it?.idx);
        if (!isFinite(idx)) return;
        sendCtl({ a: 'playTrack', idx });
      });

      row.append(cov, meta, act);
      ui.library.appendChild(row);
    }
  } catch {}
}

function setNowPlaying(np) {
  try {
    const title = String(np?.title || '').trim() || '—';
    const artist = String(np?.artist || '').trim() || '—';
    ui.npTitle.textContent = title;
    ui.npArtist.textContent = artist;
    const cover = String(np?.cover || '').trim();
    ui.npCover.style.backgroundImage = cover ? `url(${cover})` : '';
  } catch {}
}

function setHostState(stMsg) {
  try {
    state.lastHostState = stMsg && typeof stMsg === 'object' ? stMsg : null;
    const idx = Number(stMsg?.idx);
    const pos = Number(stMsg?.pos);
    const paused = !!stMsg?.paused;
    const text = `idx=${isFinite(idx) ? idx : '—'} pos=${isFinite(pos) ? pos.toFixed(2) : '—'} ${paused ? 'paused' : 'playing'}`;
    ui.npState.textContent = text;
  } catch {}
}

function ensurePeer() {
  if (state.peer) return state.peer;
  if (!window.Peer) throw new Error('PeerJS missing');
  state.peer = new Peer(undefined, {});
  state.peer.on('open', (id) => {
    try { ui.peerId.textContent = String(id || '—'); } catch {}
  });
  state.peer.on('call', (call) => {
    try {
      state.call = call;
      try { ui.streamState.textContent = 'Answering stream…'; } catch {}
      try { call.answer(); } catch {}
      call.on('stream', (remoteStream) => {
        try {
          ui.streamAudio.srcObject = remoteStream;
          ui.streamState.textContent = 'Streaming';
        } catch {}
      });
      call.on('close', () => {
        try { ui.streamState.textContent = 'Stream closed'; } catch {}
      });
      call.on('error', () => {
        try { ui.streamState.textContent = 'Stream error'; } catch {}
      });
    } catch {
      try { ui.streamState.textContent = 'Stream error'; } catch {}
    }
  });
  state.peer.on('error', () => {
    setBadge('Peer error', false);
  });
  return state.peer;
}

function sendCtl(obj) {
  try {
    if (!state.conn || !state.conn.open) return;
    state.conn.send({ t: 'ctl', ...(obj || {}) });
  } catch {}
}

async function join() {
  const code = normalizeCode(ui.codeInput.value);
  const name = String(ui.nameInput.value || '').trim();
  if (!code || !/^mus-\d{5}$/.test(code)) {
    setBadge('Invalid code', false);
    return;
  }
  if (!name) {
    setBadge('Enter name', false);
    return;
  }

  disconnect();

  state.hostCode = code;
  try { ui.hostId.textContent = code; } catch {}
  setBadge('Connecting…', false);
  setConnectedUI(true);

  const peer = ensurePeer();

  const conn = peer.connect(code, { reliable: true });
  state.conn = conn;

  conn.on('open', () => {
    setBadge('Connected', true);
    try { ui.streamState.textContent = 'Waiting for host stream…'; } catch {}
    try { conn.send({ t: 'hello', name }); } catch {}
    try { sendCtl({ a: 'sync' }); } catch {}
  });

  conn.on('data', (msg) => {
    try {
      if (!msg || typeof msg !== 'object') return;
      if (msg.t === 'np') setNowPlaying(msg);
      if (msg.t === 'lib') {
        state.lib = Array.isArray(msg.items) ? msg.items : [];
        renderLibrary();
      }
      if (msg.t === 'st') setHostState(msg);
    } catch {}
  });

  conn.on('close', () => {
    setBadge('Disconnected', false);
    disconnect();
  });

  conn.on('error', () => {
    setBadge('Connection error', false);
    disconnect();
  });

  // Stream is initiated by the host (it will call this peer id).
}

function disconnect() {
  try {
    if (state.call) {
      try { state.call.close(); } catch {}
      state.call = null;
    }
    if (state.conn) {
      try { state.conn.close(); } catch {}
      state.conn = null;
    }
  } catch {}

  try {
    ui.streamAudio.srcObject = null;
    ui.streamAudio.removeAttribute('src');
  } catch {}

  state.lib = [];
  state.lastHostState = null;
  renderLibrary();
  setNowPlaying({ title: '—', artist: '—', cover: '' });
  try { ui.npState.textContent = '—'; } catch {}
  try { ui.hostId.textContent = '—'; } catch {}
  try { ui.streamState.textContent = '—'; } catch {}

  setConnectedUI(false);
}

function initFromUrl() {
  try {
    const u = new URL(location.href);
    const code = normalizeCode(u.searchParams.get('code') || '');
    const name = String(u.searchParams.get('name') || '').trim();
    if (code) ui.codeInput.value = code;
    if (name) ui.nameInput.value = name;
  } catch {}
}

ui.joinBtn.addEventListener('click', () => join());
ui.disconnectBtn.addEventListener('click', () => {
  setBadge('Disconnected', false);
  disconnect();
});
ui.syncBtn.addEventListener('click', () => sendCtl({ a: 'sync' }));
ui.playBtn.addEventListener('click', () => sendCtl({ a: 'play' }));
ui.pauseBtn.addEventListener('click', () => sendCtl({ a: 'pause' }));
ui.prevBtn.addEventListener('click', () => sendCtl({ a: 'prev' }));
ui.nextBtn.addEventListener('click', () => sendCtl({ a: 'next' }));

document.addEventListener('keydown', (e) => {
  try {
    if (e.key === 'Enter' && !ui.joinBtn.disabled) {
      const active = document.activeElement;
      if (active === ui.codeInput || active === ui.nameInput) {
        e.preventDefault();
        join();
      }
    }
  } catch {}
});

initFromUrl();
setConnectedUI(false);
setBadge('Disconnected', false);
