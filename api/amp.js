const { Readable } = require('stream');

const { corsHeaders, getOrigin, handleOptions, sendJson } = require('./demucs/_util');

function allowedTarget(u) {
  try {
    const url = new URL(String(u || ''));
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
    const host = url.hostname.toLowerCase();
    if (host === 'amp-api.music.apple.com') return true;
    if (host.endsWith('.music.apple.com')) return true;
    if (host.endsWith('.mzstatic.com')) return true;
    return false;
  } catch (e) {
    return false;
  }

}

async function fetchAllowed(url, init, maxRedirects = 3) {
  try {
    let cur = String(url || '').trim();
    if (!cur) return null;
    for (let i = 0; i <= maxRedirects; i++) {
      if (!allowedTarget(cur)) return null;
      const r = await fetch(cur, { ...init, redirect: 'manual' }).catch(() => null);
      if (!r) return null;
      const s = r.status || 0;
      if (s === 301 || s === 302 || s === 303 || s === 307 || s === 308) {
        const loc = r.headers ? r.headers.get('location') : '';
        if (!loc) return r;
        try {
          const next = new URL(String(loc), cur);
          cur = next.toString();
          continue;
        } catch {
          return null;
        }
      }
      return r;
    }
    return null;
  } catch {
    return null;
  }
}

module.exports = async function handler(req, res) {
  const methods = 'GET,HEAD,OPTIONS';
  const origin = getOrigin(req);

  if (req && req.method === 'OPTIONS') {
    handleOptions(req, res, methods);
    return;
  }

  const target = req && req.query && req.query.url ? String(req.query.url) : '';
  if (!target || !allowedTarget(target)) {
    sendJson(res, origin, methods, 400, { ok: false, error: 'invalid_url' });
    return;
  }

  const m = String(req && req.method ? req.method : 'GET').toUpperCase();
  if (m !== 'GET' && m !== 'HEAD') {
    sendJson(res, origin, methods, 405, { ok: false, error: 'method_not_allowed' });
    return;
  }

  const headers = {};
  const auth = req && req.headers ? (req.headers.authorization || req.headers.Authorization) : '';
  const mut = req && req.headers ? (req.headers['music-user-token'] || req.headers['Music-User-Token'] || req.headers['Music-user-token']) : '';
  if (auth) headers['Authorization'] = auth;
  if (mut) headers['Music-User-Token'] = mut;
  headers['Accept'] = (req && req.headers ? (req.headers.accept || req.headers.Accept) : '') || '*/*';

  const range = req && req.headers ? (req.headers.range || req.headers.Range) : '';
  if (range) headers['Range'] = range;
  const inm = req && req.headers ? (req.headers['if-none-match'] || req.headers['If-None-Match']) : '';
  if (inm) headers['If-None-Match'] = inm;
  const ims = req && req.headers ? (req.headers['if-modified-since'] || req.headers['If-Modified-Since']) : '';
  if (ims) headers['If-Modified-Since'] = ims;

  const upstream = await fetchAllowed(target, { method: m, headers }, 3);
  if (!upstream) {
    sendJson(res, origin, methods, 502, { ok: false, error: 'upstream_fetch_failed' });
    return;
  }

  try {
    const h = corsHeaders(origin, methods);
    for (const k of Object.keys(h)) res.setHeader(k, h[k]);
  } catch {}

  try {
    const pass = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified', 'cache-control', 'content-encoding', 'content-disposition'];
    for (const k of pass) {
      const v = upstream.headers ? upstream.headers.get(k) : '';
      if (v) {
        const name = k.split('-').map((p) => (p ? (p[0].toUpperCase() + p.slice(1)) : p)).join('-');
        res.setHeader(name, v);
      }
    }
  } catch {}

  res.statusCode = upstream.status || 502;
  if (m === 'HEAD') {
    try {
      res.end('');
    } catch {}
    return;
  }

  try {
    if (!upstream.body) {
      const ab = await upstream.arrayBuffer().catch(() => null);
      if (!ab) {
        sendJson(res, origin, methods, 502, { ok: false, error: 'upstream_read_failed' });
        return;
      }
      res.end(Buffer.from(ab));
      return;
    }
  } catch {}

  try {
    const s = Readable.fromWeb(upstream.body);
    s.on('error', () => {
      try {
        if (!res.headersSent) sendJson(res, origin, methods, 502, { ok: false, error: 'upstream_stream_failed' });
        else res.end();
      } catch {}
    });
    s.pipe(res);
  } catch {
    const ab = await upstream.arrayBuffer().catch(() => null);
    if (!ab) {
      sendJson(res, origin, methods, 502, { ok: false, error: 'upstream_read_failed' });
      return;
    }
    res.end(Buffer.from(ab));
  }
};
