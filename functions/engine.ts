export async function onRequest(context: any): Promise<Response> {
  const req = context?.request as Request;

  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Music-User-Token,Content-Type,Accept',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  };

  if (req && req.method === 'OPTIONS') {
    return new Response('', { status: 204, headers });
  }

  if (req && req.method && req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers });
  }

  const body = JSON.stringify({
    ok: true,
    status: 'ok',
    runtime: 'cloudflare-pages',
    version: 'engine_v1',
    engine: {
      automix: {
        preloadLeadSec: 14,
        preloadMinSec: 8,
        triggerLeadSec: 0.35,
        hardSwitchIfNotReadyMs: 1200,
      },
      spatialize: {
        updateHz: 30,
        cycleHz: 0.08,
        depth: 0.65,
        crossfadeDepth: 0.9,
        smoothingSec: 0.08,
      },
    },
  });

  if (req.method === 'HEAD') {
    return new Response('', { status: 200, headers });
  }

  return new Response(body, { status: 200, headers });
}
