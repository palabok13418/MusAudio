const crypto = require('crypto');

const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

function s3Config() {
  const endpoint = String(process.env.S3_ENDPOINT || process.env.R2_ENDPOINT || '').trim();
  const region = String(process.env.S3_REGION || process.env.AWS_REGION || 'auto').trim() || 'auto';
  const accessKeyId = String(process.env.S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = String(process.env.S3_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || '').trim();
  const bucket = String(process.env.S3_BUCKET || '').trim();
  return { endpoint, region, accessKeyId, secretAccessKey, bucket };
}

function hasS3Config() {
  const c = s3Config();
  return !!(c.endpoint && c.accessKeyId && c.secretAccessKey && c.bucket);
}

function getS3Client() {
  const c = s3Config();
  const forcePathStyle = (() => {
    try {
      const raw = String(process.env.S3_FORCE_PATH_STYLE || '').trim().toLowerCase();
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

function randId(prefix = '') {
  const id = crypto.randomBytes(12).toString('hex');
  return prefix ? `${prefix}${id}` : id;
}

async function signPutUrl(key, contentType = 'application/octet-stream', expiresSeconds = 60 * 30) {
  const c = s3Config();
  const s3 = getS3Client();
  const cmd = new PutObjectCommand({ Bucket: c.bucket, Key: key, ContentType: contentType });
  const url = await getSignedUrl(s3, cmd, { expiresIn: Math.max(60, Math.min(60 * 60, Number(expiresSeconds) || 1800)) });
  return url;
}

async function signGetUrl(key, expiresSeconds = 60 * 30) {
  const c = s3Config();
  const s3 = getS3Client();
  const cmd = new GetObjectCommand({ Bucket: c.bucket, Key: key });
  const url = await getSignedUrl(s3, cmd, { expiresIn: Math.max(60, Math.min(60 * 60, Number(expiresSeconds) || 1800)) });
  return url;
}

module.exports = {
  s3Config,
  hasS3Config,
  getS3Client,
  randId,
  signPutUrl,
  signGetUrl,
};
