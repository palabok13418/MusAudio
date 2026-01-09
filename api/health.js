function corsHeaders(origin) {
  const o = String(origin || '').trim();
  const allow = o ? o : '*';
  return {
    'Access-Control-Allow-Origin': allow,
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Music-User-Token,Content-Type,Accept',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  };
}

module.exports = async function handler(req, res) {
  const origin = req && req.headers ? (req.headers.origin || req.headers.Origin) : '';

  if (req && req.method === 'OPTIONS') {
    const h = corsHeaders(origin);
    for (const k of Object.keys(h)) res.setHeader(k, h[k]);
    res.status(204).send('');
    return;
  }

  const h = corsHeaders(origin);
  for (const k of Object.keys(h)) res.setHeader(k, h[k]);
  res.status(200).json({ ok: true, status: 'ok', runtime: 'vercel' });
}
