function setCors(res) {
  try {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization,Music-User-Token,Content-Type,Accept');
    res.setHeader('Cache-Control', 'no-store');
  } catch {}
}

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
    setCors(res);

    if (req && req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req && req.method && req.method !== 'GET' && req.method !== 'HEAD') {
      res.status(405).send('Method not allowed');
      return;
    }

    const body = JSON.stringify(engineProfile('vercel'));
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    if (req.method === 'HEAD') {
      res.status(200).send('');
      return;
    }

    res.status(200).send(body);
  } catch {
    try {
      res.status(200).send(JSON.stringify({ ok: true, status: 'ok', runtime: 'vercel', version: 'engine_v1' }));
    } catch {}
  }
};
