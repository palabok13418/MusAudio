function allowedTarget(u: string): boolean {
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

export async function onRequest(context: any): Promise<Response> {
  const req = context?.request as Request;

  if (req && req.method === 'OPTIONS') {
    return new Response('', {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization,Music-User-Token,Content-Type,Accept',
        'Cache-Control': 'no-store',
      },
    });
  }

  const url = new URL(req.url);
  const target = String(url.searchParams.get('url') || '').trim();
  if (!target || !allowedTarget(target)) {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid url' }), {
      status: 400,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization,Music-User-Token,Content-Type,Accept',
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json; charset=utf-8',
      },
    });
  }

  const auth = req.headers.get('authorization') || req.headers.get('Authorization') || '';
  const mut = req.headers.get('music-user-token') || req.headers.get('Music-User-Token') || '';

  const headers = new Headers();
  if (auth) headers.set('Authorization', auth);
  if (mut) headers.set('Music-User-Token', mut);
  headers.set('Accept', req.headers.get('accept') || '*/*');

  const upstream = await fetch(target, { method: 'GET', headers }).catch(() => null);
  if (!upstream) {
    return new Response(JSON.stringify({ ok: false, error: 'Upstream fetch failed' }), {
      status: 502,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization,Music-User-Token,Content-Type,Accept',
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json; charset=utf-8',
      },
    });
  }

  const body = await upstream.text();
  const contentType = upstream.headers.get('content-type') || 'application/octet-stream';

  return new Response(body, {
    status: upstream.status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization,Music-User-Token,Content-Type,Accept',
      'Cache-Control': 'no-store',
      'Content-Type': contentType,
    },
  });
}
