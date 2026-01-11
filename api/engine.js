const { corsHeaders, getOrigin, handleOptions, sendJson } = require('./demucs/_util');

function engineProfile(runtime) {
  return {
    ok: true,
    status: 'ok',
    runtime,
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
  };
}

module.exports = async function handler(req, res) {
  try {
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

    sendJson(res, origin, methods, 200, engineProfile('vercel'));
  } catch {
    try {
      const origin = getOrigin(req);
      sendJson(res, origin, 'GET,HEAD,OPTIONS', 200, { ok: true, status: 'ok', runtime: 'vercel', version: 'engine_v1' });
    } catch {}
  }
};
