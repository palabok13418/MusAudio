function corsHeaders(origin) {
  const o = String(origin || '').trim();
  const allow = o ? o : '*';
  return {
    'Access-Control-Allow-Origin': allow,
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Accept,X-Filename',
    'Cache-Control': 'no-store',
  };
}

function backendAnalyzeUrl() {
  try {
    const raw = String(process.env.ANALYZE_BACKEND_URL || process.env.PROBE_BACKEND_URL || process.env.DECODE_BACKEND_URL || process.env.DEMUCS_BACKEND_URL || '').trim();
    if (!raw) return '';
    return raw.replace(/\/+$/, '') + '/analyze';
  } catch {
    return '';
  }
}

function pickAnalyzeQuery(event) {
  try {
    const qs = event && event.queryStringParameters ? event.queryStringParameters : {};
    const sec = qs && qs.seconds != null ? String(qs.seconds) : '';
    if (!sec) return '';
    return `?seconds=${encodeURIComponent(sec)}`;
  } catch {
    return '';
  }
}

exports.handler = async (event) => {
  const origin = event && event.headers ? (event.headers.origin || event.headers.Origin) : '';

  if (event && event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(origin), body: '' };
  }

  if (!event || event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { ...corsHeaders(origin), 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ ok: false, error: 'method_not_allowed' }),
    };
  }

  const url = backendAnalyzeUrl();
  if (!url) {
    return {
      statusCode: 500,
      headers: { ...corsHeaders(origin), 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ ok: false, error: 'missing_analyze_backend', hint: 'Set ANALYZE_BACKEND_URL, PROBE_BACKEND_URL, DECODE_BACKEND_URL or DEMUCS_BACKEND_URL' }),
    };
  }

  let bodyBuf = null;
  try {
    if (event.body) {
      bodyBuf = Buffer.from(String(event.body), event.isBase64Encoded ? 'base64' : 'binary');
    }
  } catch {
    bodyBuf = null;
  }

  if (!bodyBuf || !bodyBuf.length) {
    return {
      statusCode: 400,
      headers: { ...corsHeaders(origin), 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ ok: false, error: 'empty_body' }),
    };
  }

  const inHeaders = event && event.headers ? event.headers : {};
  const fn = inHeaders['x-filename'] || inHeaders['X-Filename'] || '';

  const upHeaders = {
    'Content-Type': 'application/octet-stream',
    'Accept': 'application/json',
  };
  if (fn) upHeaders['X-Filename'] = fn;

  const q = pickAnalyzeQuery(event);
  const res = await fetch(url + q, { method: 'POST', headers: upHeaders, body: bodyBuf }).catch(() => null);
  if (!res) {
    return {
      statusCode: 502,
      headers: { ...corsHeaders(origin), 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ ok: false, error: 'upstream_fetch_failed' }),
    };
  }

  const ct = res.headers.get('content-type') || 'application/json';
  const text = await res.text().catch(() => '');

  return {
    statusCode: res.status,
    headers: { ...corsHeaders(origin), 'Content-Type': ct },
    body: text,
  };
};
