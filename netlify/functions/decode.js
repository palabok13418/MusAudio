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

function backendDecodeUrl() {
  try {
    const raw = String(process.env.DECODE_BACKEND_URL || process.env.DEMUCS_BACKEND_URL || '').trim();
    if (!raw) return '';
    return raw.replace(/\/+$/, '') + '/decode';
  } catch {
    return '';
  }
}

function pickDecodeQuery(event) {
  try {
    const allow = new Set(['format', 'sr', 'ar', 'ac', 'channels']);
    const qs = event && event.queryStringParameters ? event.queryStringParameters : {};
    const out = [];
    for (const k of Object.keys(qs || {})) {
      if (!allow.has(k)) continue;
      const v = qs[k];
      if (v == null) continue;
      out.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    }
    return out.length ? `?${out.join('&')}` : '';
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

  const url = backendDecodeUrl();
  if (!url) {
    return {
      statusCode: 500,
      headers: { ...corsHeaders(origin), 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ ok: false, error: 'missing_decode_backend', hint: 'Set DECODE_BACKEND_URL or DEMUCS_BACKEND_URL' }),
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
    'Accept': 'audio/wav',
  };
  if (fn) upHeaders['X-Filename'] = fn;

  const q = pickDecodeQuery(event);
  const res = await fetch(url + q, { method: 'POST', headers: upHeaders, body: bodyBuf }).catch(() => null);
  if (!res) {
    return {
      statusCode: 502,
      headers: { ...corsHeaders(origin), 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ ok: false, error: 'upstream_fetch_failed' }),
    };
  }

  const ct = res.headers.get('content-type') || 'application/octet-stream';
  const isAudio = ct.toLowerCase().includes('audio/') || ct.toLowerCase().includes('wav') || ct.toLowerCase().includes('octet-stream');

  if (!isAudio) {
    const text = await res.text().catch(() => '');
    return {
      statusCode: res.status,
      headers: { ...corsHeaders(origin), 'Content-Type': ct },
      body: text,
    };
  }

  const ab = await res.arrayBuffer().catch(() => null);
  if (!ab) {
    return {
      statusCode: 502,
      headers: { ...corsHeaders(origin), 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ ok: false, error: 'upstream_read_failed' }),
    };
  }

  return {
    statusCode: res.status,
    headers: { ...corsHeaders(origin), 'Content-Type': ct },
    body: Buffer.from(ab).toString('base64'),
    isBase64Encoded: true,
  };
};
