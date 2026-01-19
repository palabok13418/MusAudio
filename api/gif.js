const crypto = require('crypto');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');

const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');

const { corsHeaders, getOrigin, handleOptions, sendJson, publicBase } = require('./demucs/_util');

try {
  if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);
} catch {}

const TTL_SECONDS = 336 * 60 * 60;
const MAX_BYTES = 25 * 1024 * 1024;

const __gifInFlight = new Map();
const __gifMem = new Map();

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

async function streamToFile(resp, outPath) {
  const len = Number(resp && resp.headers ? resp.headers.get('content-length') : 0);
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

    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 25000);
    const resp = await fetch(norm, {
      method: 'GET',
      redirect: 'follow',
      signal: ac.signal,
      headers: { Accept: '*/*', 'User-Agent': 'musaudio-gif/1' },
    }).finally(() => clearTimeout(t));

    if (!resp || !resp.ok) {
      const status = resp ? resp.status : 0;
      throw Object.assign(new Error('upstream_fetch_failed'), { status });
    }

    await streamToFile(resp, inPath);

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
    const out = await p;
    return out;
  } finally {
    __gifInFlight.delete(key);
  }
}

function pickSrcFromReq(req) {
  try {
    const q = req && req.query ? req.query : {};
    const s = String(q.src || q.url || '').trim();
    return s;
  } catch {
    return '';
  }
}

function wantsJson(req) {
  try {
    const q = req && req.query ? req.query : {};
    const fmt = String(q.format || q.fmt || '').trim().toLowerCase();
    if (fmt === 'json') return true;
    const a = String((req && req.headers && (req.headers.accept || req.headers.Accept)) || '').toLowerCase();
    return a.includes('application/json');
  } catch {
    return false;
  }
}

module.exports = async function handler(req, res) {
  const methods = 'GET,HEAD,POST,OPTIONS';
  const origin = getOrigin(req);

  if (req && req.method === 'OPTIONS') {
    handleOptions(req, res, methods);
    return;
  }

  const m = String(req && req.method ? req.method : 'GET').toUpperCase();
  if (m !== 'GET' && m !== 'POST' && m !== 'HEAD') {
    sendJson(res, origin, methods, 405, { ok: false, error: 'method_not_allowed' });
    return;
  }

  let src = pickSrcFromReq(req);
  if (!src && m === 'POST') {
    let body = req && req.body !== undefined ? req.body : null;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = null; }
    }
    if (body && typeof body === 'object') {
      try { src = String(body.src || body.url || '').trim(); } catch {}
    }
  }

  if (!src) {
    sendJson(res, origin, methods, 400, { ok: false, error: 'missing_src' });
    return;
  }

  let u;
  try { u = new URL(src); } catch { u = null; }
  if (!u || !isAllowedUpstream(u)) {
    sendJson(res, origin, methods, 400, { ok: false, error: 'invalid_src' });
    return;
  }

  const key = sha256Hex(src);
  const base = publicBase(req);
  const gifUrl = base ? `${base}/gif?src=${encodeURIComponent(src)}` : `/gif?src=${encodeURIComponent(src)}`;
  const expiresAt = Date.now() + TTL_SECONDS * 1000;

  if (wantsJson(req)) {
    sendJson(res, origin, methods, 200, { ok: true, key, gifUrl, expiresAt });
    return;
  }

  const h = {
    ...corsHeaders(origin, methods),
    'Content-Type': 'image/gif',
    'Cache-Control': `public, max-age=0, s-maxage=${TTL_SECONDS}, stale-while-revalidate=86400`,
    ETag: `"${key}"`,
  };

  try {
    const inm = String((req && req.headers && (req.headers['if-none-match'] || req.headers['If-None-Match'])) || '').trim();
    if (inm && inm.replace(/\"/g, '"') === `"${key}"`) {
      for (const k of Object.keys(h)) res.setHeader(k, h[k]);
      res.status(304).end();
      return;
    }
  } catch {}

  if (m === 'HEAD') {
    for (const k of Object.keys(h)) res.setHeader(k, h[k]);
    res.status(200).end();
    return;
  }

  try {
    const out = await convertToGif(src);
    for (const k of Object.keys(h)) res.setHeader(k, h[k]);
    res.status(200).send(out.buf);
  } catch (e) {
    const msg = String(e && e.message ? e.message : e);
    sendJson(res, origin, methods, 500, { ok: false, error: 'gif_convert_failed', detail: msg });
  }
};
