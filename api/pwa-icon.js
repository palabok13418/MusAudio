function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function u32be(n) {
  const b = Buffer.allocUnsafe(4);
  b.writeUInt32BE(n >>> 0, 0);
  return b;
}

function pngChunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const d = data ? Buffer.from(data) : Buffer.alloc(0);
  const len = u32be(d.length);
  const crc = u32be(crc32(Buffer.concat([t, d])));
  return Buffer.concat([len, t, d, crc]);
}

function drawIconRgba(size) {
  const w = size;
  const h = size;
  const stride = 1 + w * 4;
  const out = Buffer.allocUnsafe(stride * h);

  const bg = [0x0b, 0x0f, 0x17, 0xff];
  const fg = [0xe6, 0xe9, 0xef, 0xff];

  const xMid0 = Math.floor(w * 0.46);
  const xMid1 = Math.floor(w * 0.54);
  const xL0 = Math.floor(w * 0.34);
  const xL1 = Math.floor(w * 0.40);
  const xR0 = Math.floor(w * 0.60);
  const xR1 = Math.floor(w * 0.66);

  const yTop = Math.floor(h * 0.28);
  const yBot = Math.floor(h * 0.72);
  const ySideTop = Math.floor(h * 0.40);
  const ySideBot = Math.floor(h * 0.60);

  for (let y = 0; y < h; y++) {
    const row = y * stride;
    out[row] = 0; // filter type 0
    let p = row + 1;

    for (let x = 0; x < w; x++) {
      let c = bg;
      const inMid = x >= xMid0 && x < xMid1 && y >= yTop && y < yBot;
      const inL = x >= xL0 && x < xL1 && y >= ySideTop && y < ySideBot;
      const inR = x >= xR0 && x < xR1 && y >= ySideTop && y < ySideBot;
      if (inMid || inL || inR) c = fg;

      out[p++] = c[0];
      out[p++] = c[1];
      out[p++] = c[2];
      out[p++] = c[3];
    }
  }

  return { w, h, raw: out };
}

function buildPng(size) {
  const zlib = require('zlib');
  const { w, h, raw } = drawIconRgba(size);

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const idat = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

module.exports = async function handler(req, res) {
  const sizeRaw = req && req.query && req.query.size ? String(req.query.size) : '';
  const size = sizeRaw === '512' ? 512 : 192;

  if (req && req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req && req.method && req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405).send('Method not allowed');
    return;
  }

  const png = buildPng(size);

  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('Content-Length', String(png.length));

  if (req.method === 'HEAD') {
    res.status(200).send('');
    return;
  }

  res.status(200).send(png);
};
