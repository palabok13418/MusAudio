const { buildBackendUrl, proxyStream, sendJson, getOrigin, handleOptions } = require('./_util');

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

  const raw = req && req.query && req.query.path ? String(req.query.path) : '';
  if (!raw) {
    sendJson(res, origin, methods, 400, { ok: false, error: 'missing_path' });
    return;
  }

  const safe = raw.replace(/^\/+/, '').replace(/\.{2,}/g, '');
  const url = buildBackendUrl(`/files/${safe}`);
  proxyStream(req, res, methods, url);
};
