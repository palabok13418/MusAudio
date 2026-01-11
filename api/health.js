const { corsHeaders, getOrigin, handleOptions, sendJson } = require('./demucs/_util');

module.exports = async function handler(req, res) {
  const methods = 'GET,HEAD,OPTIONS';
  const origin = getOrigin(req);

  if (req && req.method === 'OPTIONS') {
    handleOptions(req, res, methods);
    return;
  }

  const m = String(req && req.method ? req.method : 'GET').toUpperCase();
  if (m !== 'GET' && m !== 'HEAD') {
    sendJson(res, origin, methods, 405, { ok: false, error: 'method_not_allowed' });
    return;
  }

  if (m === 'HEAD') {
    const h = { ...corsHeaders(origin, methods), 'Content-Type': 'application/json; charset=utf-8' };
    for (const k of Object.keys(h)) res.setHeader(k, h[k]);
    res.status(200).send('');
    return;
  }

  sendJson(res, origin, methods, 200, { ok: true, status: 'ok', runtime: 'vercel' });
};
