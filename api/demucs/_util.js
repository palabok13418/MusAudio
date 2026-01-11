const http = require('http');
const https = require('https');

function corsHeaders(origin, methods) {
  const o = String(origin || '').trim();
  const allow = o ? o : '*';
  return {
    'Access-Control-Allow-Origin': allow,
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': 'Authorization,Music-User-Token,Content-Type,Accept,Range,If-None-Match,If-Modified-Since,X-Filename',
    'Access-Control-Expose-Headers': 'Content-Type,Content-Length,Content-Range,Accept-Ranges,ETag,Last-Modified,Cache-Control,Content-Encoding,Content-Disposition',
    'Cache-Control': 'no-store',
  };
}

function getOrigin(req) {
  try {
    return req && req.headers ? (req.headers.origin || req.headers.Origin || '') : '';
  } catch {
    return '';
  }
}

function backendBase() {
  const raw = (process.env.DEMUCS_BACKEND_URL || '').trim();
  if (!raw) return '';
  return raw.replace(/\/+$/, '');
}

function buildBackendUrl(path, query) {
  const base = backendBase();
  if (!base) return null;
  const u = new URL(path.replace(/^\//, ''), `${base}/`);
  if (query && typeof query === 'object') {
    for (const k of Object.keys(query)) {
      const v = query[k];
      if (v === undefined || v === null) continue;
      u.searchParams.set(k, String(v));
    }
  }
  return u;
}

function publicBase(req) {
  try {
    const h = req && req.headers ? req.headers : {};
    const proto = String(h['x-forwarded-proto'] || h['X-Forwarded-Proto'] || 'https').split(',')[0].trim() || 'https';
    const host = String(h['x-forwarded-host'] || h['X-Forwarded-Host'] || h.host || '').split(',')[0].trim();
    if (!host) return '';
    return `${proto}://${host}`;
  } catch {
    return '';
  }
}

function sendJson(res, origin, methods, status, obj) {
  const h = corsHeaders(origin, methods);
  for (const k of Object.keys(h)) res.setHeader(k, h[k]);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(status).json(obj);
}

function handleOptions(req, res, methods) {
  const origin = getOrigin(req);
  const h = corsHeaders(origin, methods);
  for (const k of Object.keys(h)) res.setHeader(k, h[k]);
  res.status(204).send('');
}

async function proxyJson(req, res, methods, url, init, transform) {
  const origin = getOrigin(req);
  if (req && req.method === 'OPTIONS') {
    handleOptions(req, res, methods);
    return;
  }

  if (!url) {
    sendJson(res, origin, methods, 500, { ok: false, error: 'missing_demucs_backend', hint: 'Set DEMUCS_BACKEND_URL' });
    return;
  }

  try {
    const r = await fetch(String(url), init);
    const text = await r.text().catch(() => '');
    let j = null;
    try {
      j = text ? JSON.parse(text) : null;
    } catch {
      j = null;
    }

    const h = corsHeaders(origin, methods);
    for (const k of Object.keys(h)) res.setHeader(k, h[k]);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    if (j !== null) {
      let out = j;
      try {
        if (typeof transform === 'function') out = transform(j);
      } catch {
        out = j;
      }
      res.status(r.status).json(out);
    } else {
      res.status(r.status).json({ ok: false, error: 'upstream_non_json', status: r.status, body: text.slice(0, 2000) });
    }
  } catch (e) {
    sendJson(res, origin, methods, 502, { ok: false, error: 'upstream_fetch_failed', detail: String(e && e.message ? e.message : e) });
  }
}

function proxyStream(req, res, methods, url) {
  const origin = getOrigin(req);
  if (req && req.method === 'OPTIONS') {
    handleOptions(req, res, methods);
    return;
  }

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
      method: req.method || 'POST',
      headers,
    },
    (upstreamRes) => {
      try {
        const h = corsHeaders(origin, methods);
        for (const k of Object.keys(h)) res.setHeader(k, h[k]);
      } catch {}

      const allow = new Set([
        'content-type',
        'content-length',
        'cache-control',
        'accept-ranges',
        'content-range',
        'content-disposition',
        'content-encoding',
        'etag',
        'last-modified',
      ]);
      for (const [k, v] of Object.entries(upstreamRes.headers || {})) {
        if (!k) continue;
        const lk = String(k).toLowerCase();
        if (!allow.has(lk)) continue;
        try {
          if (typeof v === 'string') res.setHeader(k, v);
          else if (Array.isArray(v)) res.setHeader(k, v.join(', '));
        } catch {}
      }

      res.statusCode = upstreamRes.statusCode || 502;
      upstreamRes.pipe(res);
    }
  );

  upstreamReq.on('error', (e) => {
    try {
      sendJson(res, origin, methods, 502, { ok: false, error: 'upstream_stream_failed', detail: String(e && e.message ? e.message : e) });
    } catch {
      try { res.statusCode = 502; res.end('upstream_stream_failed'); } catch {}
    }
  });

  try {
    req.pipe(upstreamReq);
  } catch (e) {
    try {
      upstreamReq.destroy();
    } catch {}
    sendJson(res, origin, methods, 400, { ok: false, error: 'bad_request', detail: String(e && e.message ? e.message : e) });
  }
}

module.exports = {
  corsHeaders,
  getOrigin,
  buildBackendUrl,
  publicBase,
  handleOptions,
  proxyJson,
  proxyStream,
  sendJson,
};
