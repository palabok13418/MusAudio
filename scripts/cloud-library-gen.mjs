import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

const AUDIO_SRC_DIR = path.join(ROOT, 'audio');
const PUBLIC_DIR = path.join(ROOT, 'public');
const CLOUD_DIR = path.join(PUBLIC_DIR, 'cloud');
const AUDIO_PUBLIC_DIR = path.join(PUBLIC_DIR, 'audio');
const MANIFEST_PATH = path.join(CLOUD_DIR, 'library.json');

const AUDIO_EXTS = new Set([
  '.mp3',
  '.m4a',
  '.wav',
  '.flac',
  '.ogg',
  '.webm',
  '.aac',
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

async function generateManifest() {
  const exists = await fs
    .stat(AUDIO_SRC_DIR)
    .then((s) => s.isDirectory())
    .catch(() => false);

  if (!exists) {
    console.log('[cloud-library-gen] audio/ folder not found; skipping manifest generation');
    return { count: 0 };
  }

  const absFiles = await walkFiles(AUDIO_SRC_DIR);
  const tracks = [];

  for (const abs of absFiles) {
    const ext = path.extname(abs).toLowerCase();
    if (!AUDIO_EXTS.has(ext)) continue;

    const relFromAudio = path.relative(AUDIO_SRC_DIR, abs);
    const relPosix = posixify(relFromAudio);

    const base = path.basename(abs, path.extname(abs));
    const parsed = parseTitleArtistFromFilename(base);

    tracks.push({
      url: `/audio/${relPosix}`,
      title: parsed.title || base,
      artist: parsed.artist || '',
      album: '',
      weblink: '',
      id: `cloud::${relPosix}`,
    });
  }

  tracks.sort((a, b) => {
    const aa = `${a.artist || ''} ${a.title || ''}`.toLowerCase();
    const bb = `${b.artist || ''} ${b.title || ''}`.toLowerCase();
    return aa.localeCompare(bb);
  });

  await ensureDir(CLOUD_DIR);
  await fs.writeFile(MANIFEST_PATH, JSON.stringify(tracks, null, 2) + '\n', 'utf8');

  console.log(`[cloud-library-gen] Wrote ${tracks.length} tracks to ${posixify(path.relative(ROOT, MANIFEST_PATH))}`);
  return { count: tracks.length };
}

async function syncAudioToPublic() {
  const mode = String(process.env.MUSAUDIO_CLOUD_COPY_AUDIO || '1').trim();
  if (mode === '0' || mode.toLowerCase() === 'false' || mode.toLowerCase() === 'no') {
    console.log('[cloud-library-gen] Skipping public/audio sync (MUSAUDIO_CLOUD_COPY_AUDIO=0)');
    return false;
  }

  const exists = await fs
    .stat(AUDIO_SRC_DIR)
    .then((s) => s.isDirectory())
    .catch(() => false);

  if (!exists) return false;

  await ensureDir(PUBLIC_DIR);

  await fs.cp(AUDIO_SRC_DIR, AUDIO_PUBLIC_DIR, {
    recursive: true,
    force: true,
    errorOnExist: false,
  });

  console.log(`[cloud-library-gen] Synced audio/ -> ${posixify(path.relative(ROOT, AUDIO_PUBLIC_DIR))}`);
  return true;
}

async function main() {
  await syncAudioToPublic();
  await generateManifest();
}

main().catch((e) => {
  console.error('[cloud-library-gen] Failed:', e);
  process.exitCode = 1;
});
