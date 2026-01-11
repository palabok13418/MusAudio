#!/usr/bin/env bash
set -euo pipefail

fetch() {
  local url="$1"
  local out="$2"
  mkdir -p "$(dirname "$out")"
  curl -fsSL "$url" -o "$out"
}

fetch 'https://cdn.jsdelivr.net/npm/jsmediatags@3.9.7/dist/jsmediatags.min.js' './public/vendor/jsmediatags/jsmediatags.min.js'
fetch 'https://cdn.jsdelivr.net/npm/mp3tag.js@3.14.0/dist/mp3tag.min.js' './public/vendor/mp3tag/mp3tag.min.js'
fetch 'https://code.jquery.com/jquery-3.7.1.min.js' './public/vendor/jquery/jquery-3.7.1.min.js'
fetch 'https://cdn.jsdelivr.net/npm/howler@2.2.4/dist/howler.min.js' './public/vendor/howler/howler.min.js'

fetch 'https://cdnjs.cloudflare.com/ajax/libs/aurora.js/0.4.2/aurora.min.js' './public/vendor/aurora/aurora.min.js'
fetch 'https://cdnjs.cloudflare.com/ajax/libs/aurora.js-mp3/0.1.0/mp3.min.js' './public/vendor/aurora/mp3.min.js'
fetch 'https://cdnjs.cloudflare.com/ajax/libs/aurora.js-aac/0.1.0/aac.min.js' './public/vendor/aurora/aac.min.js'
fetch 'https://cdnjs.cloudflare.com/ajax/libs/aurora.js-flac/0.2.1/flac.min.js' './public/vendor/aurora/flac.min.js'
fetch 'https://cdnjs.cloudflare.com/ajax/libs/aurora.js-alac/0.1.0/alac.min.js' './public/vendor/aurora/alac.min.js'

fetch 'https://cdn.jsdelivr.net/npm/mp4box@0.5.2/dist/mp4box.all.min.js' './public/vendor/mp4box/mp4box.all.min.js'
fetch 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/umd/ffmpeg.min.js' './public/vendor/ffmpeg/ffmpeg.min.js'
fetch 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.11.6/dist/ffmpeg.min.js' './public/vendor/ffmpeg/ffmpeg.0.11.6.min.js'
fetch 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js' './public/vendor/ffmpeg/ffmpeg-core.js'
fetch 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js' './public/vendor/ffmpeg/ffmpeg-core.0.11.0.js'

fetch 'https://unpkg.com/mediainfo.js' './public/vendor/mediainfo/mediainfo.min.js'
fetch 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.16.0/dist/tf.min.js' './public/vendor/tfjs/tf.min.js'
fetch 'https://cdn.jsdelivr.net/npm/@tensorflow-models/blazeface@0.0.7/dist/blazeface.min.js' './public/vendor/blazeface/blazeface.min.js'

fetch 'https://unpkg.com/@applemusic-like-lyrics/core@0.2.0/dist/amll-core.esm.js' './public/vendor/amll/amll-core.esm.js'
fetch 'https://unpkg.com/@applemusic-like-lyrics/core@0.2.0/dist/amll-core.css' './public/vendor/amll/amll-core.css'

fetch 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined' './public/vendor/material-symbols/material-symbols-outlined.css'

fetch 'https://cdn.jsdelivr.net/npm/eruda' './public/vendor/eruda/eruda.min.js'
fetch 'https://cdn.jsdelivr.net/npm/eruda-dom' './public/vendor/eruda/eruda-dom.min.js'
fetch 'https://cdn.jsdelivr.net/npm/eruda-fps' './public/vendor/eruda/eruda-fps.min.js'
fetch 'https://cdn.jsdelivr.net/npm/eruda-features' './public/vendor/eruda/eruda-features.min.js'
fetch 'https://cdn.jsdelivr.net/npm/eruda-timing' './public/vendor/eruda/eruda-timing.min.js'
fetch 'https://cdn.jsdelivr.net/npm/eruda-code' './public/vendor/eruda/eruda-code.min.js'
fetch 'https://cdn.jsdelivr.net/npm/eruda-benchmark' './public/vendor/eruda/eruda-benchmark.min.js'
fetch 'https://cdn.jsdelivr.net/npm/eruda-memory' './public/vendor/eruda/eruda-memory.min.js'
