const MAX_BYTES = 35 * 1024 * 1024;

function toTimestamp(sec: number): string {
  const s = Math.max(0, Number(sec) || 0);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  const ss = Math.floor(r);
  const cs = Math.floor((r - ss) * 100);
  return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function splitIntoSyllables(word: string): string[] {
  try {
    const w = String(word || '').trim();
    if (!w) return [];
    const pure = w.replace(/[^a-zA-Z0-9]+/g, '');
    if (!pure) return [w];

    const lower = pure.toLowerCase();
    const vowels = 'aeiouy';

    const parts: string[] = [];
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

function buildSyllables(words: Array<{ start: number; end: number; word: string }>) {
  const out: Array<{ t0: number; t1: number; text: string; spaceBefore: boolean; breakAfter: boolean }> = [];
  for (const w of words || []) {
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

function buildEnhancedLrc(syllables: any[]): string {
  try {
    if (!Array.isArray(syllables) || !syllables.length) return '';

    const lines: string[] = [];
    let cur: string[] = [];
    let lineStart: number | null = null;
    let lastT: number | null = null;

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
      if (lastT != null && t - lastT > 2.0) flush();
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

async function sha256Hex(ab: ArrayBuffer): Promise<string> {
  try {
    const dig = await crypto.subtle.digest('SHA-256', ab);
    const arr = Array.from(new Uint8Array(dig));
    return arr.map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return '';
  }
}

async function transcribeDeepgram(ab: ArrayBuffer, mime: string, apiKey: string): Promise<{ transcript: string; words: any[] }> {
  const url = 'https://api.deepgram.com/v1/listen?punctuate=true&smart_format=true&utterances=true&words=true';
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': mime || 'application/octet-stream',
      Accept: 'application/json',
    },
    body: ab,
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j) throw new Error('deepgram_failed');

  const alt = (j as any)?.results?.channels?.[0]?.alternatives?.[0] || null;
  const words = Array.isArray(alt?.words) ? alt.words : [];
  const transcript = String(alt?.transcript || '').trim();
  return { transcript, words: words.map((w: any) => ({ start: w.start, end: w.end, word: w.word })) };
}

async function transcribeOpenAI(ab: ArrayBuffer, filename: string, apiKey: string): Promise<{ transcript: string; words: any[] }> {
  const fd = new FormData();
  fd.append('model', 'whisper-1');
  fd.append('response_format', 'verbose_json');
  fd.append('file', new Blob([ab], { type: 'application/octet-stream' }), filename || 'audio');

  const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: fd,
  });

  const j = await r.json().catch(() => null);
  if (!r.ok || !j) throw new Error('openai_failed');

  const transcript = String((j as any).text || '').trim();
  const segs = Array.isArray((j as any).segments) ? (j as any).segments : [];

  const words: any[] = [];
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

export async function onRequest(context: any): Promise<Response> {
  const req = context?.request as Request;
  const env = context?.env || {};

  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type,Accept,X-Filename',
    'Cache-Control': 'no-store',
  };

  if (req && req.method === 'OPTIONS') {
    return new Response('', { status: 204, headers });
  }

  if (!req || req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'method_not_allowed' }), {
      status: 405,
      headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  const raw = await req.arrayBuffer().catch(() => null);
  if (!raw || !(raw as ArrayBuffer).byteLength) {
    return new Response(JSON.stringify({ ok: false, error: 'empty_body' }), {
      status: 400,
      headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  if ((raw as ArrayBuffer).byteLength > MAX_BYTES) {
    return new Response(JSON.stringify({ ok: false, error: 'body_too_large' }), {
      status: 400,
      headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  const filename = String(req.headers.get('x-filename') || 'audio').trim();
  const mime = String(req.headers.get('content-type') || 'application/octet-stream').trim();

  const deepgramKey = String(env.DEEPGRAM_API_KEY || '').trim();
  const openaiKey = String(env.OPENAI_API_KEY || '').trim();

  if (!deepgramKey && !openaiKey) {
    return new Response(JSON.stringify({ ok: false, error: 'missing_transcription_key', hint: 'Set DEEPGRAM_API_KEY or OPENAI_API_KEY' }), {
      status: 500,
      headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  try {
    const tr = deepgramKey
      ? await transcribeDeepgram(raw as ArrayBuffer, mime, deepgramKey)
      : await transcribeOpenAI(raw as ArrayBuffer, filename, openaiKey);

    const syllables = buildSyllables(tr.words || []);
    const lrc = buildEnhancedLrc(syllables);

    const out = {
      ok: true,
      filename,
      mime,
      audioSha256: await sha256Hex(raw as ArrayBuffer),
      expiresAt: 0,
      provider: deepgramKey ? 'deepgram' : 'openai',
      transcript: tr.transcript || '',
      lrc,
      syllables,
    };

    return new Response(JSON.stringify(out), {
      status: 200,
      headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' },
    });
  } catch (e) {
    const msg = String((e as any)?.message || e);
    return new Response(JSON.stringify({ ok: false, error: 'syllable_lyrics_failed', detail: msg }), {
      status: 500,
      headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
}
