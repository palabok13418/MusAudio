const { getOrigin, handleOptions, sendJson, proxyStream } = require('./demucs/_util');

function buildDecodeBackendUrl() {
  try {
    const raw = String(process.env.DECODE_BACKEND_URL || process.env.DEMUCS_BACKEND_URL || '').trim();
    if (!raw) return null;
    const base = raw.replace(/\/+$/, '');
    return new URL('/decode', base);
  } catch {
    return null;
  }
}

function pickDecodeQuery(reqUrl) {
  try {
    const u = new URL(String(reqUrl || ''), 'http://localhost');
    const allow = new Set(['format', 'sr', 'ar', 'ac', 'channels']);
    const out = new URLSearchParams();
    for (const [k, v] of u.searchParams.entries()) {
      if (!allow.has(k)) continue;
      if (typeof v !== 'string') continue;
      out.set(k, v);
    }
    const s = out.toString();
    return s ? `?${s}` : '';
  } catch {
    return '';
  }
}

module.exports = async function handler(req, res) {
  const methods = 'POST,OPTIONS';
  const origin = getOrigin(req);

  if (req && req.method === 'OPTIONS') {
    handleOptions(req, res, methods);
    return;
  }

  const m = String(req && req.method ? req.method : 'POST').toUpperCase();
  if (m !== 'POST') {
    sendJson(res, origin, methods, 405, { ok: false, error: 'method_not_allowed' });
    return;
  }

  const url = buildDecodeBackendUrl();
  if (!url) {
    sendJson(res, origin, methods, 500, { ok: false, error: 'missing_decode_backend', hint: 'Set DECODE_BACKEND_URL or DEMUCS_BACKEND_URL' });
    return;
  }

  try {
    const qs = pickDecodeQuery(req && req.url);
    if (qs) url.search = qs.slice(1);
  } catch {}

  proxyStream(req, res, methods, url);
};
