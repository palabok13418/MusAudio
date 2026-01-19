import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

const PUBLIC_AUDIO_DIR = path.join(ROOT, 'public', 'audio');
const DIST_AUDIO_DIR = path.join(ROOT, 'dist', 'audio');

async function isDirectory(p) {
  try {
    const s = await fs.stat(p);
    return s.isDirectory();
  } catch {
    return false;
  }
}

async function isFile(p) {
  try {
    const s = await fs.stat(p);
    return s.isFile();
  } catch {
    return false;
  }
}

async function fileSize(p) {
  try {
    const s = await fs.stat(p);
    return s.isFile() ? s.size : -1;
  } catch {
    return -1;
  }
}

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

async function walkDir(dir) {
  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push({ type: 'dir', abs });
      out.push(...(await walkDir(abs)));
    } else if (ent.isFile()) {
      out.push({ type: 'file', abs });
    }
  }
  return out;
}

async function copyTreeMissing(srcRoot, dstRoot) {
  const items = await walkDir(srcRoot);
  for (const it of items) {
    const rel = path.relative(srcRoot, it.abs);
    const dst = path.join(dstRoot, rel);
    if (it.type === 'dir') {
      await ensureDir(dst);
      continue;
    }

    await ensureDir(path.dirname(dst));

    const srcSize = await fileSize(it.abs);
    const dstSize = await fileSize(dst);
    if (dstSize === srcSize && dstSize >= 0) continue;

    await fs.copyFile(it.abs, dst);
  }
}

async function main() {
  const hasPublicAudio = await isDirectory(PUBLIC_AUDIO_DIR);
  if (!hasPublicAudio) {
    return;
  }

  await ensureDir(DIST_AUDIO_DIR);

  const hasAnyDistAudio = await isDirectory(DIST_AUDIO_DIR);
  if (!hasAnyDistAudio) {
    return;
  }

  await copyTreeMissing(PUBLIC_AUDIO_DIR, DIST_AUDIO_DIR);
}

main().catch((e) => {
  console.warn('[ensure-dist-audio] Failed:', e && e.message ? e.message : String(e));
  process.exitCode = 0;
});
