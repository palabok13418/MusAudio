const { buildBackendUrl, proxyJson, sendJson, getOrigin, handleOptions } = require('./_util');

function backendBase() {
  const raw = (process.env.DEMUCS_BACKEND_URL || '').trim();
  if (!raw) return '';
  return raw.replace(/\/+$/, '');
}

function toBackendAudioUrl(audioUrl) {
  try {
    const base = backendBase();
    const s = String(audioUrl || '').trim();
    if (!base || !s) return s;
    if (s.startsWith('/demucs/files/')) {
      const p = s.slice('/demucs/files/'.length).replace(/\.{2,}/g, '');
      return `${base}/files/${p}`;
    }
    const u = new URL(s);
    const p = String(u.pathname || '');
    if (p.startsWith('/demucs/files/')) {
      const rel = p.slice('/demucs/files/'.length).replace(/\.{2,}/g, '');
      return `${base}/files/${rel}`;
    }
    return s;
  } catch {
    return String(audioUrl || '').trim();
  }
}

module.exports = async function handler(req, res) {
  const methods = 'POST,OPTIONS';
  const origin = getOrigin(req);

  if (req && req.method === 'OPTIONS') {
    handleOptions(req, res, methods);
    return;
  }

  if (req && req.method !== 'POST') {
    sendJson(res, origin, methods, 405, { ok: false, error: 'method_not_allowed' });
    return;
  }

  let payload = req && req.body !== undefined ? req.body : null;
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload); } catch { payload = null; }
  }

  if (!payload || typeof payload !== 'object') {
    sendJson(res, origin, methods, 400, { ok: false, error: 'invalid_json_body' });
    return;
  }

  try {
    if (payload && typeof payload.audio_url === 'string') {
      payload.audio_url = toBackendAudioUrl(payload.audio_url);
    }
  } catch {}

  const url = buildBackendUrl('/api/demucs/start');
  await proxyJson(req, res, methods, url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });
};
