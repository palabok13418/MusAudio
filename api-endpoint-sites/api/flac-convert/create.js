const crypto = require('crypto');

const { PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');

const { getOrigin, handleOptions, sendJson } = require('../_util');
const { hasS3Config, s3Config, getS3Client, signPutUrl } = require('../_s3');
const { normalizeOpts, jobKey, inputKey } = require('./_job');

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

function safeJobId() {
  try {
    return crypto.randomBytes(12).toString('hex');
  } catch {
    return String(Date.now());
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
    sendJson(res, origin, methods, 500, { ok: false, error: 'missing_storage_config', hint: 'Set S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET' });
    return;
  }

  const body = await readReqJson(req);
  if (!body) {
    sendJson(res, origin, methods, 400, { ok: false, error: 'bad_json' });
    return;
  }

  const filesIn = Array.isArray(body.files) ? body.files : [];
  const files = filesIn
    .map((f) => {
      const name = (f && typeof f.name === 'string') ? f.name : '';
      const type = (f && typeof f.type === 'string') ? f.type : '';
      const size = Number(f && f.size != null ? f.size : 0);
      return { name, type, size: isFinite(size) ? size : 0 };
    })
    .filter((f) => !!String(f.name || '').trim());

  if (!files.length) {
    sendJson(res, origin, methods, 400, { ok: false, error: 'no_files' });
    return;
  }

  const opts = normalizeOpts(body.options || body.opts || {});
  const jobId = safeJobId();

  const uploads = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const key = inputKey(jobId, i, f.name);
    const ct = String(f.type || 'application/octet-stream');
    const url = await signPutUrl(key, ct, 60 * 30);
    uploads.push({ idx: i, name: f.name, key, method: 'PUT', url, headers: { 'Content-Type': ct } });
  }

  const now = Date.now();
  const job = {
    id: jobId,
    createdAt: now,
    updatedAt: now,
    status: 'created',
    opts,
    inputs: uploads.map((u) => ({ idx: u.idx, name: u.name, key: u.key, contentType: u.headers['Content-Type'] })),
    result: null,
    errors: [],
  };

  try {
    const c = s3Config();
    const s3 = getS3Client();
    await s3.send(new PutObjectCommand({
      Bucket: c.bucket,
      Key: jobKey(jobId),
      Body: JSON.stringify(job),
      ContentType: 'application/json',
    }));
  } catch (e) {
    sendJson(res, origin, methods, 500, { ok: false, error: 'job_store_failed', detail: String(e && e.message ? e.message : e) });
    return;
  }

  const base = '';
  sendJson(res, origin, methods, 200, {
    ok: true,
    jobId,
    uploads,
    commit: { method: 'POST', path: '/flac-convert/commit', body: { jobId } },
    status: { method: 'GET', path: `/flac-convert/status?jobId=${encodeURIComponent(jobId)}` },
    result: { method: 'GET', path: `/flac-convert/result?jobId=${encodeURIComponent(jobId)}` },
    storage: { bucket: s3Config().bucket, endpoint: s3Config().endpoint },
    job,
  });
};
