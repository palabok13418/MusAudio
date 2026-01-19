const crypto = require('crypto');
const os = require('os');
const path = require('path');
const fsp = require('fs/promises');

const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');

try {
  if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);
} catch {}

const TTL_SECONDS = 336 * 60 * 60;
const MAX_BYTES = 25 * 1024 * 1024;

const __gifInFlight = new Map();
const __gifMem = new Map();

function corsHeaders(origin) {
  const o = String(origin || '').trim();
  const allow = o ? o : '*';
  return {
    'Access-Control-Allow-Origin': allow,
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type,Accept,Range,If-None-Match,If-Modified-Since,X-Filename',
    'Access-Control-Expose-Headers': 'Content-Type,Content-Length,Content-Range,Accept-Ranges,ETag,Last-Modified,Cache-Control,Content-Encoding,Content-Disposition',
  };
}

function sha256Hex(s) {
  return crypto.createHash('sha256').update(String(s || ''), 'utf8').digest('hex');
}

function isPrivateHost(hostname) {
  const h = String(hostname || '').trim().toLowerCase();
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h.endsWith('.local')) return true;
  if (h === '127.0.0.1' || h === '0.0.0.0') return true;
  if (h === '::1') return true;
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(h)) return true;
  return false;
}

function isAllowedUpstream(u) {
  try {
    if (!u || u.protocol !== 'https:') return false;
    const host = String(u.hostname || '').toLowerCase();
    if (isPrivateHost(host)) return false;
    return (
      host.endsWith('.mzstatic.com') ||
      host.endsWith('.apple.com') ||
      host.endsWith('.itunes.apple.com') ||
      host.endsWith('.music.apple.com') ||
      host.endsWith('.applemusic.com')
    );
  } catch {
    return false;
  }
}

function publicBase(event) {
  try {
    const h = event && event.headers ? event.headers : {};
    const proto = String(h['x-forwarded-proto'] || h['X-Forwarded-Proto'] || 'https').split(',')[0].trim() || 'https';
    const host = String(h['x-forwarded-host'] || h['X-Forwarded-Host'] || h.host || '').split(',')[0].trim();
    if (!host) return '';
    return `${proto}://${host}`;
  } catch {
    return '';
  }
}

function wantsJson(event) {
  try {
    const qs = event && event.queryStringParameters ? event.queryStringParameters : {};
    const fmt = String(qs.format || qs.fmt || '').trim().toLowerCase();
    if (fmt === 'json') return true;
    const a = String((event && event.headers && (event.headers.accept || event.headers.Accept)) || '').toLowerCase();
    return a.includes('application/json');
  } catch {
    return false;
  }
}

async function fetchToFile(src, outPath) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 25000);
  const resp = await fetch(src, {
    method: 'GET',
    redirect: 'follow',
    signal: ac.signal,
    headers: { Accept: '*/*', 'User-Agent': 'musaudio-gif/1' },
  }).finally(() => clearTimeout(t));

  if (!resp || !resp.ok) {
    const status = resp ? resp.status : 0;
    throw Object.assign(new Error('upstream_fetch_failed'), { status });
  }

  const len = Number(resp.headers.get('content-length') || 0);
  if (len && isFinite(len) && len > MAX_BYTES) throw new Error('source_too_large');

  const ab = await resp.arrayBuffer().catch(() => null);
  if (!ab || !(ab.byteLength > 0)) throw new Error('missing_body');
  if (ab.byteLength > MAX_BYTES) throw new Error('source_too_large');

  await fsp.mkdir(path.dirname(outPath), { recursive: true });
  await fsp.writeFile(outPath, Buffer.from(ab));
}

async function convertToGif(src) {
  const norm = String(src || '').trim();
  const key = sha256Hex(norm);

  const mem = __gifMem.get(key);
  if (mem && mem.buf && (Date.now() - mem.at) < 5 * 60 * 1000) return { key, buf: mem.buf };

  if (__gifInFlight.has(key)) return __gifInFlight.get(key);

  const p = (async () => {
    const dir = path.join(os.tmpdir(), 'musaudio_gif');
    const inPath = path.join(dir, `${key}.src`);
    const outPath = path.join(dir, `${key}.gif`);

    try {
      const cached = await fsp.readFile(outPath).catch(() => null);
      if (cached && cached.length) {
        __gifMem.set(key, { at: Date.now(), buf: cached });
        return { key, buf: cached };
      }
    } catch {}

    await fetchToFile(norm, inPath);

    await new Promise((resolve, reject) => {
      try {
        ffmpeg(inPath)
          .outputOptions([
            '-vf',
            'fps=12,scale=256:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse',
            '-loop',
            '0',
          ])
          .on('error', reject)
          .on('end', resolve)
          .save(outPath);
      } catch (e) {
        reject(e);
      }
    });

    const buf = await fsp.readFile(outPath);
    __gifMem.set(key, { at: Date.now(), buf });
    return { key, buf };
  })();

  __gifInFlight.set(key, p);
  try {
    return await p;
  } finally {
    __gifInFlight.delete(key);
  }
}

exports.handler = async (event) => {
  const origin = event && event.headers ? (event.headers.origin || event.headers.Origin) : '';
  const h0 = corsHeaders(origin);

  if (event && event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: h0, body: '' };
  }

  const m = String(event && event.httpMethod ? event.httpMethod : 'GET').toUpperCase();
  if (m !== 'GET' && m !== 'POST' && m !== 'HEAD') {
    return {
      statusCode: 405,
      headers: { ...h0, 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ ok: false, error: 'method_not_allowed' }),
    };
  }

  const qs = event && event.queryStringParameters ? event.queryStringParameters : {};
  let src = String(qs.src || qs.url || '').trim();

  if (!src && m === 'POST') {
    try {
      const raw = event.body ? String(event.body) : '';
      const j = raw ? JSON.parse(raw) : null;
      if (j && typeof j === 'object') src = String(j.src || j.url || '').trim();
    } catch {}
  }

  if (!src) {
    return {
      statusCode: 400,
      headers: { ...h0, 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ ok: false, error: 'missing_src' }),
    };
  }

  let u;
  try { u = new URL(src); } catch { u = null; }
  if (!u || !isAllowedUpstream(u)) {
    return {
      statusCode: 400,
      headers: { ...h0, 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ ok: false, error: 'invalid_src' }),
    };
  }

  const key = sha256Hex(src);
  const base = publicBase(event);
  const gifUrl = base ? `${base}/gif?src=${encodeURIComponent(src)}` : `/gif?src=${encodeURIComponent(src)}`;
  const expiresAt = Date.now() + TTL_SECONDS * 1000;

  if (wantsJson(event)) {
    return {
      statusCode: 200,
      headers: { ...h0, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
      body: JSON.stringify({ ok: true, key, gifUrl, expiresAt }),
    };
  }

  const cacheHeaders = {
    ...h0,
    'Content-Type': 'image/gif',
    'Cache-Control': `public, max-age=0, s-maxage=${TTL_SECONDS}, stale-while-revalidate=86400`,
    ETag: `"${key}"`,
  };

  try {
    const inm = String((event && event.headers && (event.headers['if-none-match'] || event.headers['If-None-Match'])) || '').trim();
    if (inm && inm.replace(/\"/g, '"') === `"${key}"`) {
      return { statusCode: 304, headers: cacheHeaders, body: '' };
    }
  } catch {}

  if (m === 'HEAD') {
    return { statusCode: 200, headers: cacheHeaders, body: '' };
  }

  try {
    const out = await convertToGif(src);
    return {
      statusCode: 200,
      headers: cacheHeaders,
      isBase64Encoded: true,
      body: Buffer.from(out.buf).toString('base64'),
    };
  } catch (e) {
    const msg = String(e && e.message ? e.message : e);
    return {
      statusCode: 500,
      headers: { ...h0, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
      body: JSON.stringify({ ok: false, error: 'gif_convert_failed', detail: msg }),
    };
  }
};
