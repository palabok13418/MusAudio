import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const ASSETS = [
  {
    url: 'https://cdn.jsdelivr.net/npm/jsmediatags@3.9.7/dist/jsmediatags.min.js',
    out: 'public/vendor/jsmediatags/jsmediatags.min.js',
  },
  {
    url: 'https://cdn.jsdelivr.net/npm/mp3tag.js@3.14.0/dist/mp3tag.min.js',
    out: 'public/vendor/mp3tag/mp3tag.min.js',
  },
  {
    url: 'https://code.jquery.com/jquery-3.7.1.min.js',
    out: 'public/vendor/jquery/jquery-3.7.1.min.js',
  },
  {
    url: 'https://cdn.jsdelivr.net/npm/howler@2.2.4/dist/howler.min.js',
    out: 'public/vendor/howler/howler.min.js',
  },

  {
    url: 'https://cdnjs.cloudflare.com/ajax/libs/aurora.js/0.4.2/aurora.min.js',
    out: 'public/vendor/aurora/aurora.min.js',
  },
  {
    url: 'https://cdnjs.cloudflare.com/ajax/libs/aurora.js-mp3/0.1.0/mp3.min.js',
    out: 'public/vendor/aurora/mp3.min.js',
  },
  {
    url: 'https://cdnjs.cloudflare.com/ajax/libs/aurora.js-aac/0.1.0/aac.min.js',
    out: 'public/vendor/aurora/aac.min.js',
  },
  {
    url: 'https://cdnjs.cloudflare.com/ajax/libs/aurora.js-flac/0.2.1/flac.min.js',
    out: 'public/vendor/aurora/flac.min.js',
  },
  {
    url: 'https://cdnjs.cloudflare.com/ajax/libs/aurora.js-alac/0.1.0/alac.min.js',
    out: 'public/vendor/aurora/alac.min.js',
  },

  {
    url: 'https://cdn.jsdelivr.net/npm/mp4box@0.5.2/dist/mp4box.all.min.js',
    out: 'public/vendor/mp4box/mp4box.all.min.js',
  },
  {
    url: 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/umd/ffmpeg.min.js',
    out: 'public/vendor/ffmpeg/ffmpeg.min.js',
  },
  {
    url: 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.11.6/dist/ffmpeg.min.js',
    out: 'public/vendor/ffmpeg/ffmpeg.0.11.6.min.js',
  },
  {
    url: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js',
    out: 'public/vendor/ffmpeg/ffmpeg-core.js',
  },
  {
    url: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js',
    out: 'public/vendor/ffmpeg/ffmpeg-core.0.11.0.js',
  },

  { url: 'https://unpkg.com/mediainfo.js', out: 'public/vendor/mediainfo/mediainfo.min.js' },
  { url: 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.16.0/dist/tf.min.js', out: 'public/vendor/tfjs/tf.min.js' },
  {
    url: 'https://cdn.jsdelivr.net/npm/@tensorflow-models/blazeface@0.0.7/dist/blazeface.min.js',
    out: 'public/vendor/blazeface/blazeface.min.js',
  },

  {
    url: 'https://unpkg.com/@applemusic-like-lyrics/core@0.2.0/dist/amll-core.esm.js',
    out: 'public/vendor/amll/amll-core.esm.js',
  },
  {
    url: 'https://unpkg.com/@applemusic-like-lyrics/core@0.2.0/dist/amll-core.css',
    out: 'public/vendor/amll/amll-core.css',
  },

  {
    url: 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined',
    out: 'public/vendor/material-symbols/material-symbols-outlined.css',
  },

  { url: 'https://cdn.jsdelivr.net/npm/eruda', out: 'public/vendor/eruda/eruda.min.js' },
  { url: 'https://cdn.jsdelivr.net/npm/eruda-dom', out: 'public/vendor/eruda/eruda-dom.min.js' },
  { url: 'https://cdn.jsdelivr.net/npm/eruda-fps', out: 'public/vendor/eruda/eruda-fps.min.js' },
  { url: 'https://cdn.jsdelivr.net/npm/eruda-features', out: 'public/vendor/eruda/eruda-features.min.js' },
  { url: 'https://cdn.jsdelivr.net/npm/eruda-timing', out: 'public/vendor/eruda/eruda-timing.min.js' },
  { url: 'https://cdn.jsdelivr.net/npm/eruda-code', out: 'public/vendor/eruda/eruda-code.min.js' },
  { url: 'https://cdn.jsdelivr.net/npm/eruda-benchmark', out: 'public/vendor/eruda/eruda-benchmark.min.js' },
  { url: 'https://cdn.jsdelivr.net/npm/eruda-memory', out: 'public/vendor/eruda/eruda-memory.min.js' },
];

async function existsNonEmpty(path) {
  try {
    const s = await stat(path);
    return s.isFile() && s.size > 0;
  } catch {
    return false;
  }
}

async function fetchToFile(url, out) {
  await mkdir(dirname(out), { recursive: true });

  const res = await fetch(url, {
    headers: {
      'user-agent': 'musaudio-vendor-fetch/1.0',
      accept: '*/*',
    },
  });

  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

  const ab = await res.arrayBuffer();
  const buf = Buffer.from(ab);
  if (!buf.length) throw new Error('Empty response');
  await writeFile(out, buf);
}

async function main() {
  if (process.env.SKIP_VENDOR_FETCH === '1') return;

  let failures = 0;
  for (const a of ASSETS) {
    try {
      if (await existsNonEmpty(a.out)) continue;
      await fetchToFile(a.url, a.out);
    } catch (e) {
      failures++;
      console.warn(`[vendor-fetch] Failed: ${a.url} -> ${a.out}`);
      console.warn(`[vendor-fetch] ${e && e.message ? e.message : String(e)}`);
    }
  }

  if (failures && process.env.STRICT_VENDOR_FETCH === '1') {
    process.exitCode = 1;
  }
}

await main();
