const crypto = require('crypto');

const { getOrigin, handleOptions, sendJson } = require('./demucs/_util');

const MAX_BYTES = 35 * 1024 * 1024;

function sha256Hex(buf) {
  try {
    return crypto.createHash('sha256').update(buf).digest('hex');
  } catch {
    return '';
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    try {
      let total = 0;
      const chunks = [];
      req.on('data', (c) => {
        try {
          const b = Buffer.isBuffer(c) ? c : Buffer.from(c);
          total += b.length;
          if (total > MAX_BYTES) {
            reject(new Error('body_too_large'));
            try { req.destroy(); } catch {}
            return;
          }
          chunks.push(b);
        } catch (e) {
          reject(e);
        }
      });
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    } catch (e) {
      reject(e);
    }
  });
}

function splitIntoSyllables(word) {
  try {
    const w = String(word || '').trim();
    if (!w) return [];
    const pure = w.replace(/[^a-zA-Z0-9]+/g, '');
    if (!pure) return [w];

    const lower = pure.toLowerCase();
    const vowels = 'aeiouy';

    const parts = [];
    let cur = '';
    let lastWasVowel = false;

    for (let i = 0; i < lower.length; i++) {
      const ch = lower[i];
      const isV = vowels.includes(ch);
      cur += pure[i];
      if (isV && !lastWasVowel) {
        lastWasVowel = true;
      } else if (!isV && lastWasVowel) {
        lastWasVowel = false;
        if (cur.length >= 2) {
          parts.push(cur);
          cur = '';
        }
      }
    }
    if (cur) parts.push(cur);

    const out = parts.length ? parts : [pure];
    const re = new RegExp('^' + pure.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&') + '$', 'i');
    if (re.test(w)) return out;

    return out;
  } catch {
    return [String(word || '').trim()].filter(Boolean);
  }
}

function toTimestamp(sec) {
  const s = Math.max(0, Number(sec) || 0);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  const ss = Math.floor(r);
  const cs = Math.floor((r - ss) * 100);
  return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function buildEnhancedLrc(syllables) {
  try {
    if (!Array.isArray(syllables) || !syllables.length) return '';

    const lines = [];
    let cur = [];
    let lineStart = null;
    let lastT = null;

    const flush = () => {
      if (!cur.length || lineStart == null) return;
      const hdr = `[${toTimestamp(lineStart)}]`;
      lines.push(hdr + cur.join(''));
      cur = [];
      lineStart = null;
      lastT = null;
    };

    for (const s of syllables) {
      const t = Number(s.t0);
      if (!isFinite(t)) continue;
      if (lineStart == null) lineStart = t;
      if (lastT != null && (t - lastT) > 2.0) flush();
      if (lineStart == null) lineStart = t;

      const stamp = `<${toTimestamp(t)}>`;
      const text = String(s.text || '');
      const space = s.spaceBefore ? ' ' : '';
      cur.push(space + stamp + text);
      lastT = t;

      if (s.breakAfter) flush();
    }

    flush();
    return lines.join('\n');
  } catch {
    return '';
  }
}

async function transcribeDeepgram(buf, mime, apiKey) {
  const url = 'https://api.deepgram.com/v1/listen?punctuate=true&smart_format=true&utterances=true&words=true';
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': mime || 'application/octet-stream',
      Accept: 'application/json',
    },
    body: buf,
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j) throw Object.assign(new Error('deepgram_failed'), { status: r.status, detail: j });

  const alt = j?.results?.channels?.[0]?.alternatives?.[0] || null;
  const words = Array.isArray(alt?.words) ? alt.words : [];
  const transcript = String(alt?.transcript || '').trim();

  return { transcript, words: words.map((w) => ({ start: w.start, end: w.end, word: w.word })) };
}

async function transcribeOpenAI(buf, filename, apiKey) {
  const fd = new FormData();
  fd.append('model', 'whisper-1');
  fd.append('response_format', 'verbose_json');
  fd.append('file', new Blob([buf], { type: 'application/octet-stream' }), filename || 'audio');

  const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: fd,
  });

  const j = await r.json().catch(() => null);
  if (!r.ok || !j) throw Object.assign(new Error('openai_failed'), { status: r.status, detail: j });

  const transcript = String(j.text || '').trim();
  const segs = Array.isArray(j.segments) ? j.segments : [];

  const words = [];
  for (const s of segs) {
    const st = Number(s.start);
    const en = Number(s.end);
    const txt = String(s.text || '').trim();
    if (!isFinite(st) || !isFinite(en) || !txt) continue;
    const toks = txt.split(/\s+/g).filter(Boolean);
    if (!toks.length) continue;
    const dur = Math.max(0.02, en - st);
    const per = dur / toks.length;
    for (let i = 0; i < toks.length; i++) {
      const w0 = st + i * per;
      const w1 = Math.min(en, w0 + per);
      words.push({ start: w0, end: w1, word: toks[i] });
    }
  }

  return { transcript, words };
}

function buildSyllables(wordItems) {
  const out = [];
  for (const w of wordItems) {
    const word = String(w.word || '').trim();
    const start = Number(w.start);
    const end = Number(w.end);
    if (!word || !isFinite(start) || !isFinite(end) || end <= start) continue;

    const sylls = splitIntoSyllables(word);
    const n = Math.max(1, sylls.length);
    const dur = (end - start) / n;

    for (let i = 0; i < n; i++) {
      out.push({
        t0: start + i * dur,
        t1: start + (i + 1) * dur,
        text: sylls[i] || word,
        spaceBefore: i === 0,
        breakAfter: /[.!?]$/.test(word),
      });
    }
  }
  out.sort((a, b) => (a.t0 || 0) - (b.t0 || 0));
  return out;
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

  const filename = String((req.headers && (req.headers['x-filename'] || req.headers['X-Filename'])) || 'audio').trim();
  const mime = String((req.headers && (req.headers['content-type'] || req.headers['Content-Type'])) || 'application/octet-stream').trim();

  let buf;
  try {
    buf = await readBody(req);
  } catch (e) {
    sendJson(res, origin, methods, 400, { ok: false, error: String(e && e.message ? e.message : e) });
    return;
  }

  if (!buf || !buf.length) {
    sendJson(res, origin, methods, 400, { ok: false, error: 'empty_body' });
    return;
  }

  const deepgramKey = String(process.env.DEEPGRAM_API_KEY || '').trim();
  const openaiKey = String(process.env.OPENAI_API_KEY || '').trim();

  if (!deepgramKey && !openaiKey) {
    sendJson(res, origin, methods, 500, { ok: false, error: 'missing_transcription_key', hint: 'Set DEEPGRAM_API_KEY or OPENAI_API_KEY' });
    return;
  }

  try {
    const base = {
      ok: true,
      filename,
      mime,
      audioSha256: sha256Hex(buf),
      expiresAt: 0,
    };

    const tr = deepgramKey
      ? await transcribeDeepgram(buf, mime, deepgramKey)
      : await transcribeOpenAI(buf, filename, openaiKey);

    const syllables = buildSyllables(tr.words || []);
    const lrc = buildEnhancedLrc(syllables);

    sendJson(res, origin, methods, 200, {
      ...base,
      provider: deepgramKey ? 'deepgram' : 'openai',
      transcript: tr.transcript || '',
      lrc,
      syllables,
    });
  } catch (e) {
    const msg = String(e && e.message ? e.message : e);
    sendJson(res, origin, methods, 500, { ok: false, error: 'syllable_lyrics_failed', detail: msg });
  }
};
