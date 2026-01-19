const TTL_SECONDS = 336 * 60 * 60;

export async function onRequest(context: any): Promise<Response> {
  const req = context?.request as Request;

  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type,Accept,Range,If-None-Match,If-Modified-Since,X-Filename',
  };

  if (req && req.method === 'OPTIONS') {
    return new Response('', { status: 204, headers });
  }

  return new Response(JSON.stringify({ ok: false, error: 'not_supported', hint: 'GIF conversion requires ffmpeg and is not supported on Cloudflare Pages functions. Deploy on Vercel or Netlify for /gif.' }), {
    status: 501,
    headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=0, s-maxage=${TTL_SECONDS}` },
  });
}
