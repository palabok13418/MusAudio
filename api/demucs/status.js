const { buildBackendUrl, proxyJson, sendJson, getOrigin, publicBase, handleOptions } = require('./_util');

function toPublicFilePath(u) {
  try {
    const s = String(u || '').trim();
    if (!s) return '';
    if (s.startsWith('/files/')) return s;
    const x = new URL(s);
    return String(x.pathname || '');
  } catch {
    return '';
  }
}

function rewritePredictionUrls(req, j) {
  try {
    if (!j || typeof j !== 'object') return j;
    if (!j.ok) return j;
    const pred = j.prediction;
    if (!pred || typeof pred !== 'object') return j;
    const out = pred.output;
    if (!out || typeof out !== 'object') return j;
    const stems = out.stems;
    if (!stems || typeof stems !== 'object') return j;

    const base = publicBase(req);
    const next = Object.assign({}, j);
    next.prediction = Object.assign({}, pred);
    next.prediction.output = Object.assign({}, out);
    next.prediction.output.stems = Object.assign({}, stems);

    for (const k of Object.keys(stems)) {
      const v = stems[k];
      const p = toPublicFilePath(v);
      if (!p.startsWith('/files/')) continue;
      const rel = p.slice('/files/'.length);
      const pub = `/demucs/files/${rel}`;
      next.prediction.output.stems[k] = base ? `${base}${pub}` : pub;
    }

    return next;
  } catch {
    return j;
  }
}

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

  const id = req && req.query && req.query.id ? String(req.query.id) : '';
  if (!id) {
    sendJson(res, origin, methods, 400, { ok: false, error: 'missing_id' });
    return;
  }

  const url = buildBackendUrl('/api/demucs/status', { id });
  await proxyJson(req, res, methods, url, { method: 'GET', headers: { Accept: 'application/json' } }, (j) => rewritePredictionUrls(req, j));
};
