// Draws the toolbar icon (white "T" and gold "+" on TRACS blue) as PNGs. No dependencies:
//   node dev/make-icons.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const BLUE = [0x26, 0x5a, 0x87];
const WHITE = [0xff, 0xff, 0xff];
const GOLD = [0xf5, 0xc5, 0x42];

// Shapes on a 128 x 128 canvas, painted in order.
const inRoundRect = (x, y, x0, y0, x1, y1, r) => {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};
const SHAPES = [
  [BLUE, (x, y) => inRoundRect(x, y, 4, 4, 124, 124, 26)],
  [WHITE, (x, y) => inRoundRect(x, y, 20, 26, 82, 44, 4)], // T bar
  [WHITE, (x, y) => inRoundRect(x, y, 42, 26, 60, 104, 4)], // T stem
  [GOLD, (x, y) => inRoundRect(x, y, 70, 74, 112, 88, 3)], // + across
  [GOLD, (x, y) => inRoundRect(x, y, 84, 60, 98, 102, 3)], // + down
];

function render(size) {
  const SS = 4; // supersampling per axis, for smooth edges
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = ((x + (sx + 0.5) / SS) / size) * 128;
          const v = ((y + (sy + 0.5) / SS) / size) * 128;
          let c = null;
          for (const [color, hit] of SHAPES) if (hit(u, v)) c = color;
          if (c) { r += c[0]; g += c[1]; b += c[2]; a++; }
        }
      }
      const i = (y * size + x) * 4;
      if (a) { px[i] = r / a; px[i + 1] = g / a; px[i + 2] = b / a; }
      px[i + 3] = Math.round((a / (SS * SS)) * 255);
    }
  }
  return png(size, px);
}

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const out = path.join(__dirname, '..', 'icons');
fs.mkdirSync(out, { recursive: true });
for (const size of [16, 32, 48, 128]) fs.writeFileSync(path.join(out, `icon${size}.png`), render(size));
console.log('icons written to', out);
