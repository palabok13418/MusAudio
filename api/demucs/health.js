const { buildBackendUrl, proxyJson, sendJson, getOrigin, handleOptions } = require('./_util');

module.exports = async function handler(req, res) {
  const methods = 'GET,OPTIONS';
  const origin = getOrigin(req);

  if (req && req.method === 'OPTIONS') {
    handleOptions(req, res, methods);
    return;
  }

  if (req && req.method !== 'GET') {
    sendJson(res, origin, methods, 405, { ok: false, error: 'method_not_allowed' });
    return;
  }

  const url = buildBackendUrl('/health');
  await proxyJson(req, res, methods, url, { method: 'GET', headers: { Accept: 'application/json' } });
};
