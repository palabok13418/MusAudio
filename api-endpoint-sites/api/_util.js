function corsHeaders(origin, methods) {
  const o = String(origin || '').trim();
  const allow = o ? o : '*';
  return {
    'Access-Control-Allow-Origin': allow,
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': 'Content-Type,Accept,Authorization,Range,If-None-Match,If-Modified-Since,X-Filename',
    'Access-Control-Expose-Headers': 'Content-Type,Content-Length,Content-Disposition,X-Files,X-Compression-Level-Applied',
    'Cache-Control': 'no-store'
  };
}

function getOrigin(req) {
  try {
    return req && req.headers ? (req.headers.origin || req.headers.Origin || '') : '';
  } catch {
    return '';
  }
}

function sendJson(res, origin, methods, status, obj) {
  const h = corsHeaders(origin, methods);
  for (const k of Object.keys(h)) res.setHeader(k, h[k]);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(status).json(obj);
}

function handleOptions(req, res, methods) {
  const origin = getOrigin(req);
  const h = corsHeaders(origin, methods);
  for (const k of Object.keys(h)) res.setHeader(k, h[k]);
  res.status(204).send('');
}

module.exports = {
  corsHeaders,
  getOrigin,
  sendJson,
  handleOptions
};
