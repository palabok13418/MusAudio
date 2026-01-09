const http = require('http');
const https = require('https');

const { buildBackendUrl, sendJson, getOrigin, publicBase, handleOptions } = require('./_util');

function toPublicFilePath(u) {
  try {
    const s = String(u || '').trim();
    if (!s) return '';
    if (s.startsWith('/files/')) return s;
    const x = new URL(s);
    return String(x.pathname || '');
  } catch {
    return '';
  }
}

function rewriteUploadResponse(req, j) {
  try {
    if (!j || typeof j !== 'object') return j;
    if (!j.ok) return j;
    if (typeof j.audio_url !== 'string') return j;
    const p = toPublicFilePath(j.audio_url);
    if (!p.startsWith('/files/')) return j;
    const rel = p.slice('/files/'.length);
    const pub = `/demucs/files/${rel}`;
    const base = publicBase(req);
    return Object.assign({}, j, { audio_url: base ? `${base}${pub}` : pub });
  } catch {
    return j;
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

  const url = buildBackendUrl('/api/demucs/upload');
  if (!url) {
    sendJson(res, origin, methods, 500, { ok: false, error: 'missing_demucs_backend', hint: 'Set DEMUCS_BACKEND_URL' });
    return;
  }

  const client = url.protocol === 'https:' ? https : http;
  const headers = Object.assign({}, req.headers || {});
  delete headers.connection;
  delete headers.host;

  const upstreamReq = client.request(
    String(url),
    {
      method: 'POST',
      headers,
    },
    (upstreamRes) => {
      const chunks = [];
      let total = 0;
      upstreamRes.on('data', (c) => {
        try {
          const b = Buffer.isBuffer(c) ? c : Buffer.from(c);
          total += b.length;
          if (total <= 2 * 1024 * 1024) chunks.push(b);
        } catch {}
      });
      upstreamRes.on('end', () => {
        const status = upstreamRes.statusCode || 502;
        const body = Buffer.concat(chunks).toString('utf8');
        let j = null;
        try { j = body ? JSON.parse(body) : null; } catch { j = null; }
        if (j) {
          sendJson(res, origin, methods, status, rewriteUploadResponse(req, j));
        } else {
          sendJson(res, origin, methods, status, { ok: false, error: 'upstream_non_json', status, body: String(body || '').slice(0, 2000) });
        }
      });
    }
  );

  upstreamReq.on('error', (e) => {
    sendJson(res, origin, methods, 502, { ok: false, error: 'upstream_stream_failed', detail: String(e && e.message ? e.message : e) });
  });

  try {
    req.pipe(upstreamReq);
  } catch (e) {
    try { upstreamReq.destroy(); } catch {}
    sendJson(res, origin, methods, 400, { ok: false, error: 'bad_request', detail: String(e && e.message ? e.message : e) });
  }
};
