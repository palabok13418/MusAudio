const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const Busboy = require('busboy');
const archiver = require('archiver');

const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');

const { corsHeaders, getOrigin, handleOptions, sendJson } = require('../_util');

try {
  if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);
} catch {}

function safeBaseName(name) {
  try {
    const raw = String(name || '').trim();
    const base = raw ? path.basename(raw) : 'audio';
    const noExt = base.replace(/\.[^.]+$/, '');
    return noExt.replace(/[^a-z0-9._-]+/gi, '_').slice(0, 120) || 'audio';
  } catch {
    return 'audio';
  }
}

function parseOpts(reqUrl) {
  try {
    const u = new URL(String(reqUrl || ''), 'http://localhost');
    const out = {
      channels: String(u.searchParams.get('channels') || '').trim().toLowerCase(),
      sampleRate: Number(u.searchParams.get('sampleRate') || u.searchParams.get('sr') || 0),
      compression: Number(u.searchParams.get('compression') || u.searchParams.get('level') || 0)
    };
    return out;
  } catch {
    return { channels: '', sampleRate: 0, compression: 0 };
  }
}

function normalizeChannels(ch) {
  const v = String(ch || '').trim().toLowerCase();
  if (!v || v === 'keep' || v === 'no' || v === 'none' || v === 'default') return { mode: 'keep', ac: null };
  if (v === 'mono' || v === '1') return { mode: 'mono', ac: 1 };
  if (v === 'stereo' || v === '2') return { mode: 'stereo', ac: 2 };
  if (v === 'surround' || v === '5.1' || v === '6') return { mode: 'surround', ac: 6 };
  return { mode: 'keep', ac: null };
}

function normalizeSampleRate(sr) {
  const n = Number(sr || 0);
  if (!isFinite(n) || n <= 0) return 0;
  const nn = Math.floor(n);
  if (nn < 41000) return 41000;
  if (nn > 192000) return 192000;
  return nn;
}

function normalizeCompression(level) {
  const n = Number(level || 0);
  const nn = isFinite(n) ? Math.floor(n) : 0;
  const clamped015 = Math.max(0, Math.min(15, nn));
  const applied = Math.max(0, Math.min(12, clamped015));
  return { requested: clamped015, applied };
}

async function convertOne(inputPath, outputPath, opts) {
  const ch = normalizeChannels(opts.channels);
  const sr = normalizeSampleRate(opts.sampleRate);
  const comp = normalizeCompression(opts.compression);

  await new Promise((resolve, reject) => {
    try {
      const cmd = ffmpeg(inputPath);
      cmd.outputOptions(['-vn']);
      cmd.audioCodec('flac');

      if (ch.ac) cmd.outputOptions(['-ac', String(ch.ac)]);
      if (sr) cmd.outputOptions(['-ar', String(sr)]);

      cmd.outputOptions(['-compression_level', String(comp.applied)]);

      cmd.on('error', (e) => reject(e));
      cmd.on('end', () => resolve());
      cmd.save(outputPath);
    } catch (e) {
      reject(e);
    }
  });

  return comp;
}

module.exports = async function handler(req, res) {
  const methods = 'POST,OPTIONS';
  const origin = getOrigin(req);

  if (req && req.method === 'OPTIONS') {
    handleOptions(req, res, methods);
    return;
  }

  const m = String(req && req.method ? req.method : 'POST').toUpperCase();
  if (m !== 'POST') {
    sendJson(res, origin, methods, 405, { ok: false, error: 'method_not_allowed' });
    return;
  }

  if (!ffmpegPath) {
    sendJson(res, origin, methods, 500, { ok: false, error: 'ffmpeg_unavailable' });
    return;
  }

  const opts = parseOpts(req && req.url);

  const tmpBase = path.join(os.tmpdir(), `musaudio-flac-${crypto.randomBytes(8).toString('hex')}`);
  const inDir = path.join(tmpBase, 'in');
  const outDir = path.join(tmpBase, 'out');

  let cleaned = false;
  async function cleanupTmp() {
    if (cleaned) return;
    cleaned = true;
    try { await fsp.rm(tmpBase, { recursive: true, force: true }); } catch {}
  }
  try {
    res.on('close', () => { cleanupTmp(); });
    res.on('finish', () => { cleanupTmp(); });
  } catch {}

  try {
    await fsp.mkdir(inDir, { recursive: true });
    await fsp.mkdir(outDir, { recursive: true });
  } catch (e) {
    sendJson(res, origin, methods, 500, { ok: false, error: 'tmp_unavailable' });
    return;
  }

  const inputs = [];

  let bb;
  try {
    bb = Busboy({ headers: req.headers || {} });
  } catch {
    try { bb = new Busboy({ headers: req.headers || {} }); } catch { bb = null; }
  }
  if (!bb) {
    sendJson(res, origin, methods, 500, { ok: false, error: 'multipart_unavailable' });
    await cleanupTmp();
    return;
  }

  const fileWrites = [];

  bb.on('file', (fieldname, file, info) => {
    try {
      const filename = (info && info.filename) ? String(info.filename) : 'audio';
      const base = safeBaseName(filename);
      const ext = String(path.extname(filename || '') || '').toLowerCase();

      if (ext === '.flac') {
        try { file.resume(); } catch {}
        return;
      }

      const id = crypto.randomBytes(6).toString('hex');
      const inPath = path.join(inDir, `${base}-${id}${ext || '.bin'}`);
      const ws = fs.createWriteStream(inPath);

      const p = new Promise((resolve, reject) => {
        ws.on('error', reject);
        ws.on('finish', resolve);
      });

      file.pipe(ws);
      fileWrites.push(p);

      inputs.push({ filename, base, ext, inPath, id });
    } catch {
      try { file.resume(); } catch {}
    }
  });

  const done = new Promise((resolve, reject) => {
    bb.on('error', reject);
    bb.on('finish', resolve);
  });

  try {
    req.pipe(bb);
  } catch (e) {
    sendJson(res, origin, methods, 400, { ok: false, error: 'bad_request' });
    return;
  }

  try {
    await done;
    await Promise.all(fileWrites);
  } catch (e) {
    sendJson(res, origin, methods, 400, { ok: false, error: 'upload_failed' });
    await cleanupTmp();
    return;
  }

  if (!inputs.length) {
    sendJson(res, origin, methods, 400, { ok: false, error: 'no_files' });
    await cleanupTmp();
    return;
  }

  const outputs = [];
  let lastComp = null;

  try {
    for (const it of inputs) {
      const outPath = path.join(outDir, `${it.base}-${it.id}.flac`);
      const comp = await convertOne(it.inPath, outPath, opts);
      lastComp = comp;
      outputs.push({ name: `${it.base}.flac`, outPath });
    }
  } catch (e) {
    sendJson(res, origin, methods, 500, { ok: false, error: 'convert_failed', detail: String(e && e.message ? e.message : e) });
    await cleanupTmp();
    return;
  }

  try {
    const h = corsHeaders(origin, methods);
    for (const k of Object.keys(h)) res.setHeader(k, h[k]);
  } catch {}

  try {
    res.setHeader('X-Files', String(outputs.length));
  } catch {}

  try {
    if (lastComp) res.setHeader('X-Compression-Level-Applied', String(lastComp.applied));
  } catch {}

  if (outputs.length === 1) {
    const one = outputs[0];
    try {
      res.setHeader('Content-Type', 'audio/flac');
      res.setHeader('Content-Disposition', `attachment; filename="${one.name.replace(/\"/g, '')}"`);
    } catch {}

    const rs = fs.createReadStream(one.outPath);
    rs.on('error', () => {
      try { if (!res.headersSent) sendJson(res, origin, methods, 500, { ok: false, error: 'read_failed' }); else res.end(); } catch {}
    });
    rs.pipe(res);
    return;
  }

  try {
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="flac-convert.zip"');
  } catch {}

  const zip = archiver('zip', { zlib: { level: 0 } });
  zip.on('error', () => {
    try { if (!res.headersSent) sendJson(res, origin, methods, 500, { ok: false, error: 'zip_failed' }); else res.end(); } catch {}
  });

  zip.pipe(res);
  for (const o of outputs) {
    zip.file(o.outPath, { name: o.name });
  }
  try {
    zip.finalize();
  } catch {
    try { res.end(); } catch {}
  }
};
