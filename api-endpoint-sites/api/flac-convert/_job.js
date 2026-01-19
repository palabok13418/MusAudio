const path = require('path');

function safeName(name) {
  try {
    const raw = String(name || '').trim();
    const base = raw ? path.basename(raw) : 'audio';
    return base.replace(/[^a-z0-9._-]+/gi, '_').slice(0, 160) || 'audio';
  } catch {
    return 'audio';
  }
}

function normalizeChannels(ch) {
  const v = String(ch || '').trim().toLowerCase();
  if (!v || v === 'keep' || v === 'no' || v === 'none' || v === 'default') return 'keep';
  if (v === 'mono' || v === '1') return 'mono';
  if (v === 'stereo' || v === '2') return 'stereo';
  if (v === 'surround' || v === '5.1' || v === '6') return 'surround';
  return 'keep';
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
  const requested = Math.max(0, Math.min(15, nn));
  const applied = Math.max(0, Math.min(12, requested));
  return { requested, applied };
}

function normalizeOpts(obj) {
  const o = obj && typeof obj === 'object' ? obj : {};
  const channels = normalizeChannels(o.channels);
  const sampleRate = normalizeSampleRate(o.sampleRate || o.sr);
  const comp = normalizeCompression(o.compression || o.level);
  return {
    channels,
    sampleRate,
    compressionRequested: comp.requested,
    compressionApplied: comp.applied,
  };
}

function jobKey(jobId) {
  return `flac-convert/jobs/${String(jobId)}/job.json`;
}

function inputKey(jobId, idx, fileName) {
  const name = safeName(fileName);
  return `flac-convert/jobs/${String(jobId)}/in/${String(idx).padStart(3, '0')}-${name}`;
}

function resultKey(jobId, fileName = '') {
  const name = safeName(fileName);
  return `flac-convert/jobs/${String(jobId)}/out/${name || 'result'}`;
}

module.exports = {
  safeName,
  normalizeOpts,
  jobKey,
  inputKey,
  resultKey,
};
