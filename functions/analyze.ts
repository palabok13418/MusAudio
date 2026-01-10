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

  if ((raw as ArrayBuffer).byteLength > 250 * 1024 * 1024) {
    return new Response(JSON.stringify({ ok: false, error: 'too_large' }), {
      status: 413,
      headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  const base = String(env.ANALYZE_BACKEND_URL || env.PROBE_BACKEND_URL || env.DECODE_BACKEND_URL || env.DEMUCS_BACKEND_URL || '').trim();
  if (!base) {
    return new Response(
      JSON.stringify({ ok: false, error: 'missing_analyze_backend', hint: 'Set ANALYZE_BACKEND_URL, PROBE_BACKEND_URL, DECODE_BACKEND_URL or DEMUCS_BACKEND_URL' }),
      { status: 500, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' } }
    );
  }

  const u = new URL(req.url);
  const seconds = u.searchParams.get('seconds') || '';
  const qs = seconds ? `?seconds=${encodeURIComponent(seconds)}` : '';

  const url = base.replace(/\/+$/, '') + '/analyze' + qs;

  const fn = req.headers.get('x-filename') || '';
  const upHeaders: Record<string, string> = {
    'Content-Type': 'application/octet-stream',
    'Accept': 'application/json',
  };
  if (fn) upHeaders['X-Filename'] = fn;

  const upstream = await fetch(url, { method: 'POST', headers: upHeaders, body: raw }).catch(() => null);
  if (!upstream) {
    return new Response(JSON.stringify({ ok: false, error: 'upstream_fetch_failed' }), {
      status: 502,
      headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  const ct = upstream.headers.get('content-type') || 'application/json';
  const text = await upstream.text().catch(() => '');
  return new Response(text, { status: upstream.status, headers: { ...headers, 'Content-Type': ct } });
}
