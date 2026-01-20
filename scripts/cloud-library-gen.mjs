import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parseFile } from 'music-metadata';

if (String(process.env.MUSAUDIO_ENABLE_CLOUD_LIBRARY_GEN || '').trim() !== '1') {
  console.log('[cloud-library-gen] Disabled until further notice. Set MUSAUDIO_ENABLE_CLOUD_LIBRARY_GEN=1 to enable.');
  process.exit(0);
}

const ROOT = process.cwd();

const PUBLIC_DIR = path.join(ROOT, 'public');
const CLOUD_DIR = path.join(PUBLIC_DIR, 'cloud');
const CLOUD_COVERS_DIR = path.join(CLOUD_DIR, 'covers');
const AUDIO_PUBLIC_DIR = path.join(PUBLIC_DIR, 'audio');
const MANIFEST_PATH = path.join(CLOUD_DIR, 'library.json');

const AUDIO_SUBDIRS = ['mp3', 'm4a', 'flac'];

const AUDIO_EXTS = new Set([
  '.mp3',
  '.m4a',
  '.flac',
]);

function posixify(p) {
  return String(p).replace(/\\/g, '/');
}

function parseTitleArtistFromFilename(filenameNoExt) {
  try {
    const raw = String(filenameNoExt || '').trim();
    const m = raw.match(/^\s*(.*?)\s*-\s*(.*?)\s*$/);
    if (m && m[1] && m[2]) {
      return { artist: m[1].trim(), title: m[2].trim() };
    }
    return { artist: '', title: raw };
  } catch {
    return { artist: '', title: '' };
  }
}

async function walkFiles(dir) {
  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...(await walkFiles(abs)));
    } else if (ent.isFile()) {
      out.push(abs);
    }
  }
  return out;
}

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

function normalizeForMatch(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

function extFromMime(mime) {
  const m = String(mime || '').toLowerCase();
  if (m.includes('png')) return '.png';
  if (m.includes('gif')) return '.gif';
  if (m.includes('webp')) return '.webp';
  if (m.includes('bmp')) return '.bmp';
  if (m.includes('tiff')) return '.tiff';
  return '.jpg';
}

function makeStableId(relPosix) {
  return createHash('sha1').update(String(relPosix || '')).digest('hex').slice(0, 16);
}

function jsonSafe(v) {
  try {
    if (v == null) return null;
    const t = typeof v;
    if (t === 'string' || t === 'number' || t === 'boolean') return v;
    if (Array.isArray(v)) {
      const arr = [];
      for (const it of v) {
        const s = jsonSafe(it);
        if (s !== undefined) arr.push(s);
      }
      return arr;
    }
    if (typeof Buffer !== 'undefined' && Buffer && Buffer.isBuffer && Buffer.isBuffer(v)) return undefined;
    if (v instanceof ArrayBuffer) return undefined;
    if (ArrayBuffer.isView && ArrayBuffer.isView(v)) return undefined;
    if (t === 'object') {
      const out = {};
      for (const [k, val] of Object.entries(v)) {
        if (k === 'picture') continue;
        const s = jsonSafe(val);
        if (s !== undefined) out[k] = s;
      }
      return out;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

async function readJson(url, timeoutMs = 12_000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' } }).catch(() => null);
    if (!res || !res.ok) return null;
    return await res.json().catch(() => null);
  } finally {
    clearTimeout(t);
  }
}

async function enrichFromITunes({ title, artist, album }) {
  try {
    const term = encodeURIComponent(String([artist, title].filter(Boolean).join(' ')).trim());
    if (!term) return null;
    const country = String(process.env.MUSAUDIO_ITUNES_COUNTRY || 'us').trim() || 'us';
    const url = `https://itunes.apple.com/search?media=music&entity=song&limit=10&country=${encodeURIComponent(country)}&term=${term}`;
    const json = await readJson(url);
    const items = Array.isArray(json && json.results) ? json.results : [];
    if (!items.length) return null;

    const wantT = normalizeForMatch(title);
    const wantA = normalizeForMatch(artist);
    const wantAl = normalizeForMatch(album);

    let best = null;
    let bestScore = -1;
    for (const it of items) {
      const t = normalizeForMatch(it && it.trackName);
      const a = normalizeForMatch(it && it.artistName);
      const al = normalizeForMatch(it && it.collectionName);
      let score = 0;
      if (wantT && t === wantT) score += 6;
      else if (wantT && t && (t.includes(wantT) || wantT.includes(t))) score += 3;
      if (wantA && a === wantA) score += 6;
      else if (wantA && a && (a.includes(wantA) || wantA.includes(a))) score += 3;
      if (wantAl && al && (al === wantAl || al.includes(wantAl) || wantAl.includes(al))) score += 2;
      if (!wantA && a) score += 1;
      if (!wantT && t) score += 1;
      if (score > bestScore) {
        bestScore = score;
        best = it;
      }
    }
    if (!best) return null;
    return {
      title: best.trackName || '',
      artist: best.artistName || '',
      album: best.collectionName || '',
      genre: best.primaryGenreName || '',
      year: best.releaseDate ? String(best.releaseDate).slice(0, 4) : '',
      weblink: best.trackViewUrl || best.collectionViewUrl || '',
      artworkUrl: best.artworkUrl100 || '',
    };
  } catch {
    return null;
  }
}

async function walkFilesIfExists(dir) {
  const ok = await fs
    .stat(dir)
    .then((s) => s.isDirectory())
    .catch(() => false);
  if (!ok) return [];
  return walkFiles(dir);
}

async function mapPool(items, concurrency, fn) {
  const list = Array.isArray(items) ? items : [];
  const n = Math.max(1, Math.min(32, parseInt(String(concurrency || 4), 10) || 4));
  const out = new Array(list.length);
  let i = 0;
  const worker = async () => {
    while (true) {
      const idx = i++;
      if (idx >= list.length) return;
      out[idx] = await fn(list[idx], idx);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, worker));
  return out;
}

async function generateManifest() {
  const absFiles = [];
  for (const sub of AUDIO_SUBDIRS) {
    try {
      const dir = path.join(AUDIO_PUBLIC_DIR, sub);
      absFiles.push(...(await walkFilesIfExists(dir)));
    } catch {}
  }

  await ensureDir(CLOUD_DIR);
  await ensureDir(CLOUD_COVERS_DIR);

  if (!absFiles.length) {
    await fs.writeFile(MANIFEST_PATH, '[]\n', 'utf8');
    console.log('[cloud-library-gen] public/audio/{mp3,m4a,flac} empty; wrote empty manifest');
    return { count: 0 };
  }

  const enrichMode = String(process.env.MUSAUDIO_CLOUD_ENRICH || 'auto').trim().toLowerCase();
  const lifecycle = String(process.env.npm_lifecycle_event || '').trim().toLowerCase();
  const inCi = !!(process.env.CI || process.env.NETLIFY || process.env.VERCEL || process.env.CLOUDFLARE || lifecycle.includes('build'));
  const allowEnrich = enrichMode === '1' || enrichMode === 'true' || (enrichMode === 'auto' && inCi);
  const downloadRemote = String(process.env.MUSAUDIO_CLOUD_DOWNLOAD_REMOTE_COVERS || '0').trim().toLowerCase() === '1';
  const enrichMax = Math.max(0, parseInt(String(process.env.MUSAUDIO_CLOUD_ENRICH_MAX || '250'), 10) || 250);
  let enrichUsed = 0;

  const parseConc = Math.max(1, parseInt(String(process.env.MUSAUDIO_CLOUD_PARSE_CONC || '4'), 10) || 4);
  const enrichConc = Math.max(1, parseInt(String(process.env.MUSAUDIO_CLOUD_ENRICH_CONC || '2'), 10) || 2);

  const wantedAbs = absFiles.filter((abs) => {
    const ext = path.extname(abs).toLowerCase();
    return AUDIO_EXTS.has(ext);
  });

  const coverWriteCache = new Set();
  const tracks = [];

  const parsed = await mapPool(wantedAbs, parseConc, async (abs) => {
    try {
      const relFromAudio = path.relative(AUDIO_PUBLIC_DIR, abs);
      const relPosix = posixify(relFromAudio);
      const base = path.basename(abs, path.extname(abs));
      const fromName = parseTitleArtistFromFilename(base);

      const meta = await parseFile(abs, { duration: true });
      const c = meta && meta.common ? meta.common : {};
      const fmt = meta && meta.format ? meta.format : {};

      let title = String(c.title || '').trim();
      let artist = String(c.artist || '').trim();
      let album = String(c.album || '').trim();
      let albumArtist = String(c.albumartist || '').trim();
      let year = c.year != null ? String(c.year) : '';
      if (!year && c.date) year = String(c.date).slice(0, 4);
      let genre = '';
      if (Array.isArray(c.genre) && c.genre.length) genre = String(c.genre[0] || '').trim();
      else genre = String(c.genre || '').trim();
      const composer = Array.isArray(c.composer) ? String(c.composer[0] || '').trim() : String(c.composer || '').trim();
      const bpm = c.bpm != null ? String(c.bpm) : '';

      const trackNo = c.track && c.track.no != null ? String(c.track.no) : '';
      const trackTotal = c.track && c.track.of != null ? String(c.track.of) : '';
      const disc = c.disk && c.disk.no != null ? String(c.disk.no) : '';
      const discTotal = c.disk && c.disk.of != null ? String(c.disk.of) : '';

      let lyrics = '';
      try {
        if (Array.isArray(c.lyrics) && c.lyrics.length) lyrics = String(c.lyrics[0] || '');
        else if (typeof c.lyrics === 'string') lyrics = c.lyrics;
      } catch {}

      if (!title) title = fromName.title || base;
      if (!artist) artist = fromName.artist || '';

      let coverUrl = '';
      let coverMime = '';
      let coverAnimated = false;

      try {
        const pics = Array.isArray(c.picture) ? c.picture : [];
        const pic = pics && pics.length ? pics[0] : null;
        if (pic && pic.data && pic.data.length) {
          coverMime = String(pic.format || '').trim();
          const ext = extFromMime(coverMime);
          if (coverMime.toLowerCase().includes('gif') || ext === '.gif') coverAnimated = true;
          const hash = makeStableId(relPosix);
          const outRel = `cloud/covers/${hash}${ext}`;
          const outAbs = path.join(PUBLIC_DIR, outRel);
          if (!coverWriteCache.has(outAbs)) {
            coverWriteCache.add(outAbs);
            await fs.writeFile(outAbs, pic.data);
          }
          coverUrl = `/${posixify(outRel)}`;
        }
      } catch {}

      const t = {
        url: `/audio/${relPosix}`,
        title: title || base,
        artist: artist || '',
        album: album || '',
        albumArtist: albumArtist || '',
        year: year || '',
        genre: genre || '',
        composer: composer || '',
        bpm: bpm || '',
        trackNo: trackNo || '',
        trackTotal: trackTotal || '',
        disc: disc || '',
        discTotal: discTotal || '',
        duration: fmt && isFinite(fmt.duration) ? Math.round(fmt.duration * 1000) : 0,
        tags: jsonSafe(c) || {},
        format: jsonSafe(fmt) || {},
        weblink: '',
        coverUrl: coverUrl || '',
        coverMime: coverMime || '',
        coverAnimated: !!coverAnimated,
        lyrics: lyrics || '',
        id: `cloud::${relPosix}`,
      };

      return t;
    } catch (e) {
      return null;
    }
  });

  for (const t of parsed) {
    if (t) tracks.push(t);
  }

  if (allowEnrich) {
    const needs = tracks.filter((t) => !t.coverUrl && (t.title || t.artist));
    const targets = needs.slice(0, enrichMax);

    const results = await mapPool(targets, enrichConc, async (t) => {
      if (!t || enrichUsed >= enrichMax) return null;
      enrichUsed++;
      const info = await enrichFromITunes({ title: t.title, artist: t.artist, album: t.album });
      if (!info) return null;

      try {
        if (!t.title && info.title) t.title = info.title;
        if (!t.artist && info.artist) t.artist = info.artist;
        if (!t.album && info.album) t.album = info.album;
        if (!t.genre && info.genre) t.genre = info.genre;
        if (!t.year && info.year) t.year = info.year;
        if (!t.weblink && info.weblink) t.weblink = info.weblink;
      } catch {}

      const art = String(info.artworkUrl || '').trim();
      if (!art) return null;
      const hi = art.replace(/\b(\d{2,4})x(\d{2,4})bb\b/i, '600x600bb');

      if (!downloadRemote) {
        t.coverUrl = hi;
        t.coverMime = 'image/jpeg';
        t.coverAnimated = false;
        return true;
      }

      try {
        const res = await fetch(hi).catch(() => null);
        if (!res || !res.ok) return null;
        const ab = await res.arrayBuffer();
        const buf = Buffer.from(ab);
        if (!buf.length) return null;
        const ct = String(res.headers.get('content-type') || '').toLowerCase();
        const ext = extFromMime(ct);
        const hash = makeStableId(t.id);
        const outRel = `cloud/covers/${hash}${ext}`;
        const outAbs = path.join(PUBLIC_DIR, outRel);
        await fs.writeFile(outAbs, buf);
        t.coverUrl = `/${posixify(outRel)}`;
        t.coverMime = ct || 'image/jpeg';
        t.coverAnimated = (ct.includes('gif') || ext === '.gif');
        return true;
      } catch {
        return null;
      }
    });

    const enrichedCount = results.filter(Boolean).length;
    if (enrichedCount) {
      console.log(`[cloud-library-gen] Enriched ${enrichedCount} tracks from iTunes (downloadRemote=${downloadRemote ? '1' : '0'})`);
    }
  }

  tracks.sort((a, b) => {
    const aa = `${a.artist || ''} ${a.title || ''}`.toLowerCase();
    const bb = `${b.artist || ''} ${b.title || ''}`.toLowerCase();
    return aa.localeCompare(bb);
  });

  await fs.writeFile(MANIFEST_PATH, JSON.stringify(tracks, null, 2) + '\n', 'utf8');

  console.log(`[cloud-library-gen] Wrote ${tracks.length} tracks to ${posixify(path.relative(ROOT, MANIFEST_PATH))}`);
  return { count: tracks.length };
}

async function main() {
  await generateManifest();
}

main().catch((e) => {
  console.error('[cloud-library-gen] Failed:', e);
  process.exitCode = 1;
});
