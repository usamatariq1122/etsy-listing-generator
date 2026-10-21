// Builds the tiny PNG fixtures used by imageinfo.test.js. Committed outputs:
// good-4x3.png (2000x1500), bad-ratio.png (2000x1200), narrow-4x3.png (1000x750).
// Run from the server directory: node test/fixtures/generate.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

const crc32 = (bytes) => {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type, data) => {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length);
  return out;
};

/** A real, decodable grayscale PNG of solid black. */
export const makePng = (width, height) => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // grayscale
  const rows = Buffer.alloc(height * (1 + width));
  for (let y = 0; y < height; y += 1) rows[y * (1 + width)] = 0; // filter byte per scanline
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = {
  'good-4x3.png': [2000, 1500],
  'bad-ratio.png': [2000, 1200],
  'narrow-4x3.png': [1000, 750],
};
for (const [name, [w, h]] of Object.entries(fixtures)) {
  writeFileSync(join(here, name), makePng(w, h));
  console.log(`${name} ${w}x${h}`);
}
