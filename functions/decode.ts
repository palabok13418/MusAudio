export async function onRequest(context: any): Promise<Response> {
  const req = context?.request as Request;
  const env = context?.env || {};

  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Accept,X-Filename',
    'Cache-Control': 'no-store',
  };

  if (req && req.method === 'OPTIONS') {
    return new Response('', { status: 204, headers });
  }

  if (!req || req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'method_not_allowed' }), {
      status: 405,
      headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  const raw = await req.arrayBuffer().catch(() => null);
  if (!raw || !(raw as ArrayBuffer).byteLength) {
    return new Response(JSON.stringify({ ok: false, error: 'empty_body' }), {
      status: 400,
      headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  const base = String(env.DECODE_BACKEND_URL || env.DEMUCS_BACKEND_URL || '').trim();
  if (!base) {
    return new Response(
      JSON.stringify({ ok: false, error: 'missing_decode_backend', hint: 'Set DECODE_BACKEND_URL or DEMUCS_BACKEND_URL' }),
      { status: 500, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }

  const url = base.replace(/\/+$/, '') + '/decode';

  const fn = req.headers.get('x-filename') || '';
  const upHeaders: Record<string, string> = {
    'Content-Type': 'application/octet-stream',
    'Accept': 'audio/wav',
  };
  if (fn) upHeaders['X-Filename'] = fn;

  const upstream = await fetch(url, { method: 'POST', headers: upHeaders, body: raw }).catch(() => null);
  if (!upstream) {
    return new Response(JSON.stringify({ ok: false, error: 'upstream_fetch_failed' }), {
      status: 502,
      headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  const ct = upstream.headers.get('content-type') || 'application/octet-stream';
  const isText = ct.toLowerCase().includes('application/json') || ct.toLowerCase().startsWith('text/');

  if (isText) {
    const text = await upstream.text().catch(() => '');
    return new Response(text, { status: upstream.status, headers: { ...headers, 'Content-Type': ct } });
  }

  const ab = await upstream.arrayBuffer().catch(() => null);
  if (!ab) {
    return new Response(JSON.stringify({ ok: false, error: 'upstream_read_failed' }), {
      status: 502,
      headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  return new Response(ab, { status: upstream.status, headers: { ...headers, 'Content-Type': ct } });
}
