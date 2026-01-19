const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const http = require('http');

const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');

const archiver = require('archiver');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');

const { normalizeOpts, jobKey, resultKey } = require('../../api/flac-convert/_job');

try {
  if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);
} catch {}

function env(name, def = '') {
  const v = String(process.env[name] || '').trim();
  return v || def;
}

function s3Config() {
  return {
    endpoint: env('S3_ENDPOINT', env('R2_ENDPOINT', '')),
    region: env('S3_REGION', env('AWS_REGION', 'auto')),
    accessKeyId: env('S3_ACCESS_KEY_ID', env('AWS_ACCESS_KEY_ID', '')),
    secretAccessKey: env('S3_SECRET_ACCESS_KEY', env('AWS_SECRET_ACCESS_KEY', '')),
    bucket: env('S3_BUCKET', ''),
  };
}

function ensureS3Config() {
  const c = s3Config();
  if (!c.endpoint || !c.accessKeyId || !c.secretAccessKey || !c.bucket) {
    throw new Error('missing_storage_config');
  }
  return c;
}

function getS3Client() {
  const c = ensureS3Config();
  const forcePathStyle = (() => {
    try {
      const raw = env('S3_FORCE_PATH_STYLE', '').toLowerCase();
      if (raw === '1' || raw === 'true' || raw === 'yes') return true;
      const ep = String(c.endpoint || '').toLowerCase();
      if (ep.includes('r2.cloudflarestorage.com')) return true;
    } catch {}
    return false;
  })();
  return new S3Client({
    region: c.region,
    endpoint: c.endpoint,
    credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey },
    forcePathStyle,
  });
}

function requireAuth(req) {
  try {
    const secret = env('FLAC_WORKER_SECRET', env('FLAC_CONVERT_WORKER_SECRET', ''));
    if (!secret) return true;
    const auth = String(req.headers && (req.headers.authorization || req.headers.Authorization) || '').trim();
    const want = `Bearer ${secret}`;
    return auth === want;
  } catch {
    return false;
  }
}

async function streamToFile(stream, outPath) {
  await fsp.mkdir(path.dirname(outPath), { recursive: true });
  const ws = fs.createWriteStream(outPath);
  await new Promise((resolve, reject) => {
    ws.on('error', reject);
    ws.on('finish', resolve);
    stream.on('error', reject);
    stream.pipe(ws);
  });
}

async function readText(body) {
  const chunks = [];
  for await (const c of body) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  return Buffer.concat(chunks).toString('utf-8');
}

async function loadJob(s3, c, jobId) {
  const r = await s3.send(new GetObjectCommand({ Bucket: c.bucket, Key: jobKey(jobId) }));
  const txt = await readText(r.Body);
  const j = txt ? JSON.parse(txt) : null;
  return j;
}

async function saveJob(s3, c, job) {
  await s3.send(
    new PutObjectCommand({
      Bucket: c.bucket,
      Key: jobKey(job.id),
      Body: JSON.stringify(job),
      ContentType: 'application/json',
    })
  );
}

function fileBaseName(name) {
  const b = String(name || '').trim();
  const base = b ? path.basename(b) : 'audio';
  const noExt = base.replace(/\.[^.]+$/, '');
  const safe = noExt.replace(/[^a-z0-9._-]+/gi, '_').slice(0, 140) || 'audio';
  return safe;
}

async function convertOne(inputPath, outputPath, opts) {
  await new Promise((resolve, reject) => {
    try {
      const cmd = ffmpeg(inputPath);
      cmd.outputOptions(['-vn']);
      cmd.audioCodec('flac');

      if (opts.channels === 'mono') cmd.outputOptions(['-ac', '1']);
      else if (opts.channels === 'stereo') cmd.outputOptions(['-ac', '2']);
      else if (opts.channels === 'surround') cmd.outputOptions(['-ac', '6']);

      if (opts.sampleRate) cmd.outputOptions(['-ar', String(opts.sampleRate)]);

      cmd.outputOptions(['-compression_level', String(opts.compressionApplied)]);

      cmd.on('error', (e) => reject(e));
      cmd.on('end', () => resolve());
      cmd.save(outputPath);
    } catch (e) {
      reject(e);
    }
  });
}

async function buildZip(zipPath, files) {
  await new Promise((resolve, reject) => {
    const ws = fs.createWriteStream(zipPath);
    ws.on('error', reject);
    ws.on('finish', resolve);

    const zip = archiver('zip', { zlib: { level: 0 } });
    zip.on('error', reject);
    zip.pipe(ws);

    for (const f of files) {
      zip.file(f.path, { name: f.name });
    }

    zip.finalize();
  });
}

async function uploadFile(s3, c, key, filePath, contentType) {
  const body = fs.createReadStream(filePath);
  await s3.send(
    new PutObjectCommand({
      Bucket: c.bucket,
      Key: key,
      Body: body,
      ContentType: contentType || 'application/octet-stream',
    })
  );
}

async function processJob(jobId) {
  const c = ensureS3Config();
  const s3 = getS3Client();

  if (!ffmpegPath) throw new Error('ffmpeg_unavailable');

  const tmpBase = path.join(os.tmpdir(), `musaudio-flac-worker-${jobId}-${Date.now()}`);
  const inDir = path.join(tmpBase, 'in');
  const outDir = path.join(tmpBase, 'out');

  let job = null;
  try {
    await fsp.mkdir(inDir, { recursive: true });
    await fsp.mkdir(outDir, { recursive: true });

    job = await loadJob(s3, c, jobId);
    if (!job || job.id !== jobId) throw new Error('job_not_found');

    job.status = 'processing';
    job.updatedAt = Date.now();
    await saveJob(s3, c, job);

    const opts = normalizeOpts(job.opts || {});

    const inputs = Array.isArray(job.inputs) ? job.inputs : [];
    if (!inputs.length) throw new Error('no_inputs');

    const downloaded = [];
    for (const it of inputs) {
      const key = String(it.key || '').trim();
      if (!key) continue;
      const name = String(it.name || '').trim();
      const p = path.join(inDir, path.basename(key));
      const r = await s3.send(new GetObjectCommand({ Bucket: c.bucket, Key: key }));
      await streamToFile(r.Body, p);
      downloaded.push({ name, path: p });
    }

    if (!downloaded.length) throw new Error('no_downloaded_inputs');

    const outputs = [];
    for (let i = 0; i < downloaded.length; i++) {
      const it = downloaded[i];
      const base = fileBaseName(it.name || `audio-${i + 1}`);
      const outPath = path.join(outDir, `${String(i).padStart(3, '0')}-${base}.flac`);
      await convertOne(it.path, outPath, opts);
      outputs.push({ name: `${base}.flac`, path: outPath });
    }

    let result = null;
    if (outputs.length === 1) {
      const one = outputs[0];
      const key = resultKey(jobId, one.name);
      await uploadFile(s3, c, key, one.path, 'audio/flac');
      result = { key, fileName: one.name, contentType: 'audio/flac', files: 1 };
    } else {
      const zipName = 'flac-convert.zip';
      const zipPath = path.join(outDir, zipName);
      await buildZip(zipPath, outputs);
      const key = resultKey(jobId, zipName);
      await uploadFile(s3, c, key, zipPath, 'application/zip');
      result = { key, fileName: zipName, contentType: 'application/zip', files: outputs.length };
    }

    job.status = 'done';
    job.updatedAt = Date.now();
    job.result = result;
    await saveJob(s3, c, job);

    return { ok: true, jobId, result };
  } catch (e) {
    const msg = String(e && e.message ? e.message : e);
    try {
      if (job && job.id === jobId) {
        job.status = 'error';
        job.updatedAt = Date.now();
        if (!Array.isArray(job.errors)) job.errors = [];
        job.errors.push({ at: Date.now(), error: msg });
        await saveJob(s3, c, job);
      }
    } catch {}
    return { ok: false, jobId, error: msg };
  } finally {
    try { await fsp.rm(tmpBase, { recursive: true, force: true }); } catch {}
  }
}

function readReqBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', () => resolve(''));
  });
}

async function startServer(port) {
  const p = Number(port || 8787) || 8787;

  const srv = http.createServer(async (req, res) => {
    try {
      const u = new URL(String(req.url || '/'), 'http://localhost');
      if (req.method === 'POST' && u.pathname === '/wake') {
        if (!requireAuth(req)) {
          res.statusCode = 401;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: false, error: 'unauthorized' }));
          return;
        }
        const raw = await readReqBody(req);
        let body = null;
        try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
        const jobId = String((body && body.jobId) || u.searchParams.get('jobId') || '').trim();
        if (!jobId) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: false, error: 'missing_jobId' }));
          return;
        }
        const out = await processJob(jobId);
        res.statusCode = out.ok ? 200 : 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(out));
        return;
      }

      if (req.method === 'GET' && u.pathname === '/health') {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true, status: 'ok' }));
        return;
      }

      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: false, error: 'not_found' }));
    } catch {
      try {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: false, error: 'server_error' }));
      } catch {}
    }
  });

  await new Promise((resolve) => srv.listen(p, resolve));
  return srv;
}

async function main() {
  const args = process.argv.slice(2);
  const once = args.includes('--once');
  const jobIdx = args.findIndex((a) => a === '--job');
  const jobId = (jobIdx >= 0 && args[jobIdx + 1]) ? String(args[jobIdx + 1]).trim() : '';
  const listenIdx = args.findIndex((a) => a === '--listen');
  const port = (listenIdx >= 0 && args[listenIdx + 1]) ? Number(args[listenIdx + 1]) : 8787;

  ensureS3Config();

  if (once) {
    if (!jobId) throw new Error('missing_job');
    const out = await processJob(jobId);
    process.stdout.write(JSON.stringify(out) + '\n');
    process.exit(out.ok ? 0 : 1);
    return;
  }

  await startServer(port);
}

main().catch((e) => {
  try { process.stderr.write(String(e && e.stack ? e.stack : e) + '\n'); } catch {}
  process.exit(1);
});
