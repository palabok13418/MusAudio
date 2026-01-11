function corsHeaders(origin) {
  const o = String(origin || '').trim();
  const allow = o ? o : '*';
  return {
    'Access-Control-Allow-Origin': allow,
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Music-User-Token,Content-Type,Accept,Range,If-None-Match,If-Modified-Since',
    'Access-Control-Expose-Headers': 'Content-Type,Content-Length,Content-Range,Accept-Ranges,ETag,Last-Modified,Content-Disposition',
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

function isTextLikeContentType(ct) {
  try {
    const s = String(ct || '').toLowerCase();
    if (!s) return false;
    if (s.startsWith('text/')) return true;
    if (s.includes('json')) return true;
    if (s.includes('xml')) return true;
    if (s.includes('javascript')) return true;
    if (s.includes('ttml')) return true;
    if (s.includes('vtt')) return true;
    return false;
  } catch {
    return false;
  }
}

async function fetchWithRedirects(startUrl, opts) {
  const max = 8;
  let url = String(startUrl || '');
  for (let i = 0; i < max; i++) {
    const res = await fetch(url, { ...opts, redirect: 'manual' }).catch(() => null);
    if (!res) return null;
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location') || '';
      if (!loc) return res;
      const next = new URL(loc, url).toString();
      if (!allowedTarget(next)) return null;
      url = next;
      continue;
    }
    return res;
  }
  return null;
}

exports.handler = async (event) => {
  const origin = event && event.headers ? (event.headers.origin || event.headers.Origin) : '';
  if (event && event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(origin), body: '' };
  }

  const qp = event && event.queryStringParameters ? event.queryStringParameters : {};
  const target = qp && qp.url ? String(qp.url) : '';
  if (!target || !allowedTarget(target)) {
    return { statusCode: 400, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ ok: false, error: 'Invalid url' }) };
  }

  const inHeaders = event && event.headers ? event.headers : {};
  const headers = {};
  const auth = inHeaders.authorization || inHeaders.Authorization;
  const mut = inHeaders['music-user-token'] || inHeaders['Music-User-Token'] || inHeaders['Music-user-token'];
  const range = inHeaders.range || inHeaders.Range;
  const inm = inHeaders['if-none-match'] || inHeaders['If-None-Match'];
  const ims = inHeaders['if-modified-since'] || inHeaders['If-Modified-Since'];
  if (auth) headers['Authorization'] = auth;
  if (mut) headers['Music-User-Token'] = mut;
  if (range) headers['Range'] = range;
  if (inm) headers['If-None-Match'] = inm;
  if (ims) headers['If-Modified-Since'] = ims;
  headers['Accept'] = inHeaders.accept || inHeaders.Accept || '*/*';

  const res = await fetchWithRedirects(target, { method: 'GET', headers }).catch(() => null);
  if (!res) {
    return { statusCode: 502, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ ok: false, error: 'Upstream fetch failed' }) };
  }

  const contentType = res.headers.get('content-type') || 'application/octet-stream';
  const outHeaders = { ...corsHeaders(origin), 'Content-Type': contentType };
  try {
    const cd = res.headers.get('content-disposition');
    if (cd) outHeaders['Content-Disposition'] = cd;
  } catch {}
  try {
    const cr = res.headers.get('content-range');
    if (cr) outHeaders['Content-Range'] = cr;
  } catch {}
  try {
    const ar = res.headers.get('accept-ranges');
    if (ar) outHeaders['Accept-Ranges'] = ar;
  } catch {}
  try {
    const et = res.headers.get('etag');
    if (et) outHeaders['ETag'] = et;
  } catch {}
  try {
    const lm = res.headers.get('last-modified');
    if (lm) outHeaders['Last-Modified'] = lm;
  } catch {}

  if (isTextLikeContentType(contentType)) {
    const body = await res.text().catch(() => '');
    return {
      statusCode: res.status,
      headers: outHeaders,
      body,
    };
  }

  const ab = await res.arrayBuffer().catch(() => null);
  if (!ab) {
    return { statusCode: 502, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ ok: false, error: 'Upstream read failed' }) };
  }

  return {
    statusCode: res.status,
    headers: outHeaders,
    body: Buffer.from(ab).toString('base64'),
    isBase64Encoded: true,
  };
};
