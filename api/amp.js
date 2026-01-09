function corsHeaders(origin) {
  const o = String(origin || '').trim();
  const allow = o ? o : '*';
  return {
    'Access-Control-Allow-Origin': allow,
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Music-User-Token,Content-Type,Accept,Range,If-None-Match,If-Modified-Since',
    'Cache-Control': 'no-store',
  };
}

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

module.exports = async function handler(req, res) {
  const origin = req && req.headers ? (req.headers.origin || req.headers.Origin) : '';

  if (req && req.method === 'OPTIONS') {
    const h = corsHeaders(origin);
    for (const k of Object.keys(h)) res.setHeader(k, h[k]);
    res.status(204).send('');
    return;
  }

  const target = req && req.query && req.query.url ? String(req.query.url) : '';
  if (!target || !allowedTarget(target)) {
    const h = { ...corsHeaders(origin), 'Content-Type': 'application/json; charset=utf-8' };
    for (const k of Object.keys(h)) res.setHeader(k, h[k]);
    res.status(400).json({ ok: false, error: 'Invalid url' });
    return;
  }

  if (req && req.method && req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
    const h = { ...corsHeaders(origin), 'Content-Type': 'application/json; charset=utf-8' };
    for (const k of Object.keys(h)) res.setHeader(k, h[k]);
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  const h = corsHeaders(origin);
  for (const k of Object.keys(h)) res.setHeader(k, h[k]);

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

  const upstream = await fetch(target, { method: (req && req.method === 'HEAD') ? 'HEAD' : 'GET', headers }).catch(() => null);
  if (!upstream) {
    res.status(502).json({ ok: false, error: 'Upstream fetch failed' });
    return;
  }

  try {
    const pass = ['content-type','content-length','content-range','accept-ranges','etag','last-modified','cache-control','content-encoding'];
    for (const k of pass) {
      const v = upstream.headers.get(k);
      if (v) {
        const name = k.split('-').map(p=>p ? (p[0].toUpperCase()+p.slice(1)) : p).join('-');
        res.setHeader(name, v);
      }
    }
  } catch {}

  res.status(upstream.status);
  if (req && req.method === 'HEAD') {
    res.send('');
    return;
  }

  const ab = await upstream.arrayBuffer().catch(() => null);
  if (!ab) {
    res.status(502).json({ ok: false, error: 'Upstream read failed' });
    return;
  }
  res.send(Buffer.from(ab));
}
