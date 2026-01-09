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

  return new Response(JSON.stringify({ ok: true, status: 'ok', runtime: 'cloudflare-pages' }), {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization,Music-User-Token,Content-Type,Accept',
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}
