const { GetObjectCommand } = require('@aws-sdk/client-s3');

const { corsHeaders, getOrigin, handleOptions, sendJson } = require('../_util');
const { hasS3Config, s3Config, getS3Client, signGetUrl } = require('../_s3');
const { jobKey } = require('./_job');

async function readText(body) {
  const chunks = [];
  for await (const c of body) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  return Buffer.concat(chunks).toString('utf-8');
}

module.exports = async function handler(req, res) {
  const methods = 'GET,OPTIONS';
  const origin = getOrigin(req);

  if (req && req.method === 'OPTIONS') {
    handleOptions(req, res, methods);
    return;
  }

  const m = String(req && req.method ? req.method : 'GET').toUpperCase();
  if (m !== 'GET') {
    sendJson(res, origin, methods, 405, { ok: false, error: 'method_not_allowed' });
    return;
  }

  if (!hasS3Config()) {
    sendJson(res, origin, methods, 500, { ok: false, error: 'missing_storage_config' });
    return;
  }

  const u = new URL(String(req.url || ''), 'http://localhost');
  const jobId = String(u.searchParams.get('jobId') || '').trim();
  const mode = String(u.searchParams.get('mode') || '').trim().toLowerCase();
  if (!jobId) {
    sendJson(res, origin, methods, 400, { ok: false, error: 'missing_jobId' });
    return;
  }

  let job = null;
  try {
    const c = s3Config();
    const s3 = getS3Client();
    const r = await s3.send(new GetObjectCommand({ Bucket: c.bucket, Key: jobKey(jobId) }));
    const txt = await readText(r.Body);
    job = txt ? JSON.parse(txt) : null;
  } catch {
    job = null;
  }

  if (!job) {
    sendJson(res, origin, methods, 404, { ok: false, error: 'job_not_found' });
    return;
  }

  if (job.status !== 'done' || !job.result || !job.result.key) {
    sendJson(res, origin, methods, 409, { ok: false, error: 'not_ready', status: String(job.status || '') });
    return;
  }

  const signed = await signGetUrl(String(job.result.key), 60 * 30);

  try {
    const h = corsHeaders(origin, methods);
    for (const k of Object.keys(h)) res.setHeader(k, h[k]);
  } catch {}

  if (mode === 'json') {
    sendJson(res, origin, methods, 200, { ok: true, url: signed, result: job.result });
    return;
  }

  try {
    res.statusCode = 302;
    res.setHeader('Location', signed);
    res.end('');
  } catch {
    sendJson(res, origin, methods, 200, { ok: true, url: signed, result: job.result });
  }
};
