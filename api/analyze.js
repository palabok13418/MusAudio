const { getOrigin, handleOptions, sendJson, proxyStream } = require('./demucs/_util');

function buildAnalyzeBackendUrl(reqUrl) {
  try {
    const raw = String(process.env.ANALYZE_BACKEND_URL || process.env.PROBE_BACKEND_URL || process.env.DECODE_BACKEND_URL || process.env.DEMUCS_BACKEND_URL || '').trim();
    if (!raw) return null;
    const base = raw.replace(/\/+$/, '');
    const u = new URL('/analyze', base);

    try {
      const inUrl = new URL(String(reqUrl || ''), 'http://localhost');
      const sec = String(inUrl.searchParams.get('seconds') || '').trim();
      if (sec) u.searchParams.set('seconds', sec);
    } catch {}

    return u;
  } catch {
    return null;
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

  const url = buildAnalyzeBackendUrl(req && req.url);
  if (!url) {
    sendJson(res, origin, methods, 500, { ok: false, error: 'missing_analyze_backend', hint: 'Set ANALYZE_BACKEND_URL, PROBE_BACKEND_URL, DECODE_BACKEND_URL or DEMUCS_BACKEND_URL' });
    return;
  }

  proxyStream(req, res, methods, url);
};
