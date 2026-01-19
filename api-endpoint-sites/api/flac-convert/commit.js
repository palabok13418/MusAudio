const { PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');

const { getOrigin, handleOptions, sendJson } = require('../_util');
const { hasS3Config, s3Config, getS3Client } = require('../_s3');
const { jobKey } = require('./_job');

async function readReqJson(req) {
  try {
    const chunks = [];
    for await (const c of req) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
    const raw = Buffer.concat(chunks).toString('utf-8');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return null;
  }
}

async function readText(body) {
  const chunks = [];
  for await (const c of body) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  return Buffer.concat(chunks).toString('utf-8');
}

async function loadJob(jobId) {
  const c = s3Config();
  const s3 = getS3Client();
  const r = await s3.send(new GetObjectCommand({ Bucket: c.bucket, Key: jobKey(jobId) }));
  const txt = await readText(r.Body);
  const j = txt ? JSON.parse(txt) : null;
  return j;
}

async function saveJob(job) {
  const c = s3Config();
  const s3 = getS3Client();
  await s3.send(new PutObjectCommand({ Bucket: c.bucket, Key: jobKey(job.id), Body: JSON.stringify(job), ContentType: 'application/json' }));
}

async function wakeWorker(jobId) {
  try {
    const base = String(process.env.FLAC_WORKER_WAKE_URL || process.env.FLAC_CONVERT_WORKER_WAKE_URL || '').trim();
    if (!base) return { ok: false, skipped: true };
    const secret = String(process.env.FLAC_WORKER_SECRET || process.env.FLAC_CONVERT_WORKER_SECRET || '').trim();
    const url = base.includes('://') ? base : `https://${base}`;
    const c = new AbortController();
    const to = setTimeout(() => { try { c.abort(); } catch { } }, 2500);
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (secret) headers['Authorization'] = `Bearer ${secret}`;
      const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ jobId }), signal: c.signal }).catch(() => null);
      if (!r) return { ok: false };
      const txt = await r.text().catch(() => '');
      return { ok: !!r.ok, status: r.status || 0, body: txt.slice(0, 800) };
    } finally {
      clearTimeout(to);
    }
  } catch {
    return { ok: false };
  }
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

  if (!hasS3Config()) {
    sendJson(res, origin, methods, 500, { ok: false, error: 'missing_storage_config' });
    return;
  }

  const body = await readReqJson(req);
  if (!body) {
    sendJson(res, origin, methods, 400, { ok: false, error: 'bad_json' });
    return;
  }

  const jobId = String(body.jobId || '').trim();
  if (!jobId) {
    sendJson(res, origin, methods, 400, { ok: false, error: 'missing_jobId' });
    return;
  }

  let job = null;
  try {
    job = await loadJob(jobId);
  } catch {
    job = null;
  }

  if (!job || job.id !== jobId) {
    sendJson(res, origin, methods, 404, { ok: false, error: 'job_not_found' });
    return;
  }

  try {
    job.status = 'queued';
    job.updatedAt = Date.now();
    await saveJob(job);
  } catch (e) {
    sendJson(res, origin, methods, 500, { ok: false, error: 'job_update_failed', detail: String(e && e.message ? e.message : e) });
    return;
  }

  const wake = await wakeWorker(jobId);
  sendJson(res, origin, methods, 200, { ok: true, jobId, status: job.status, wake });
};
