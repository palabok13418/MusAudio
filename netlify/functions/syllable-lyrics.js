const crypto = require('crypto');

const MAX_BYTES = 35 * 1024 * 1024;

function corsHeaders(origin) {
  const o = String(origin || '').trim();
  const allow = o ? o : '*';
  return {
    'Access-Control-Allow-Origin': allow,
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type,Accept,X-Filename',
    'Access-Control-Expose-Headers': 'Content-Type,Content-Length,ETag,Cache-Control',
    'Cache-Control': 'no-store',
  };
}

function sha256Hex(buf) {
  try {
    return crypto.createHash('sha256').update(buf).digest('hex');
  } catch {
    return '';
  }
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

    return parts.length ? parts : [pure];
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

exports.handler = async (event) => {
  const origin = event && event.headers ? (event.headers.origin || event.headers.Origin) : '';
  const h0 = corsHeaders(origin);

  if (event && event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: h0, body: '' };
  }

  if (!event || event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { ...h0, 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ ok: false, error: 'method_not_allowed' }),
    };
  }

  let buf = null;
  try {
    if (event.body) {
      buf = Buffer.from(String(event.body), event.isBase64Encoded ? 'base64' : 'binary');
    }
  } catch {
    buf = null;
  }

  if (!buf || !buf.length) {
    return {
      statusCode: 400,
      headers: { ...h0, 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ ok: false, error: 'empty_body' }),
    };
  }

  if (buf.length > MAX_BYTES) {
    return {
      statusCode: 400,
      headers: { ...h0, 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ ok: false, error: 'body_too_large' }),
    };
  }

  const inHeaders = event && event.headers ? event.headers : {};
  const filename = String(inHeaders['x-filename'] || inHeaders['X-Filename'] || 'audio').trim();
  const mime = String(inHeaders['content-type'] || inHeaders['Content-Type'] || 'application/octet-stream').trim();

  const deepgramKey = String(process.env.DEEPGRAM_API_KEY || '').trim();
  const openaiKey = String(process.env.OPENAI_API_KEY || '').trim();

  if (!deepgramKey && !openaiKey) {
    return {
      statusCode: 500,
      headers: { ...h0, 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ ok: false, error: 'missing_transcription_key', hint: 'Set DEEPGRAM_API_KEY or OPENAI_API_KEY' }),
    };
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

    return {
      statusCode: 200,
      headers: { ...h0, 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        ...base,
        provider: deepgramKey ? 'deepgram' : 'openai',
        transcript: tr.transcript || '',
        lrc,
        syllables,
      }),
    };
  } catch (e) {
    const msg = String(e && e.message ? e.message : e);
    return {
      statusCode: 500,
      headers: { ...h0, 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ ok: false, error: 'syllable_lyrics_failed', detail: msg }),
    };
  }
};
