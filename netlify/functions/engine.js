exports.handler = async () => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Music-User-Token,Content-Type,Accept',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  };

  const body = JSON.stringify({
    ok: true,
    status: 'ok',
    runtime: 'netlify',
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
  });

  return {
    statusCode: 200,
    headers,
    body,
  };
};
