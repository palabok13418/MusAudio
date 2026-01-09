function corsHeaders(origin) {
  const o = String(origin || '').trim();
  const allow = o ? o : '*';
  return {
    'Access-Control-Allow-Origin': allow,
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Music-User-Token,Content-Type,Accept',
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
  if (auth) headers['Authorization'] = auth;
  if (mut) headers['Music-User-Token'] = mut;
  headers['Accept'] = inHeaders.accept || inHeaders.Accept || '*/*';

  const res = await fetch(target, { method: 'GET', headers }).catch(() => null);
  if (!res) {
    return { statusCode: 502, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ ok: false, error: 'Upstream fetch failed' }) };
  }

  const body = await res.text().catch(() => '');
  const contentType = res.headers.get('content-type') || 'application/octet-stream';

  return {
    statusCode: res.status,
    headers: { ...corsHeaders(origin), 'Content-Type': contentType },
    body,
  };
};
