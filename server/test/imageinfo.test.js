import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { imageDimensions, checkImage } from '../src/imageinfo.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(join(here, 'fixtures', name));

// A JPEG whose only real content is an SOF0 frame header: imageinfo reads
// dimensions from markers, so this is enough for the parser under test.
const jpegBuffer = (width, height) => {
  const b = Buffer.alloc(24);
  let i = 0;
  b[i++] = 0xff; b[i++] = 0xd8;
  b[i++] = 0xff; b[i++] = 0xc0;
  b.writeUInt16BE(11, i); i += 2;
  b[i++] = 8;
  b.writeUInt16BE(height, i); i += 2;
  b.writeUInt16BE(width, i); i += 2;
  b[i++] = 1;
  b[i++] = 1; b[i++] = 0x11; b[i++] = 0;
  b[i++] = 0xff; b[i++] = 0xd9;
  return b.subarray(0, i);
};

test('imageDimensions reads real PNG and JPEG headers', () => {
  assert.deepEqual(imageDimensions(fixture('good-4x3.png')), { width: 2000, height: 1500, format: 'png' });
  assert.deepEqual(imageDimensions(jpegBuffer(2400, 1800)), { width: 2400, height: 1800, format: 'jpeg' });
  assert.equal(imageDimensions(Buffer.from('not an image')), null);
  assert.equal(imageDimensions(Buffer.alloc(0)), null);
});

test('checkImage accepts 4:3 at 2000px+ wide', () => {
  const res = checkImage(fixture('good-4x3.png'));
  assert.equal(res.ok, true);
  assert.equal(res.width, 2000);
  assert.equal(res.height, 1500);
  assert.equal(res.format, 'png');
  assert.equal(res.ratio, 1.333);
});

test('checkImage rejects a wrong shape', () => {
  const res = checkImage(fixture('bad-ratio.png'));
  assert.equal(res.ok, false);
  assert.match(res.message, /Wrong shape/);
});

test('checkImage rejects an image that is too narrow', () => {
  const res = checkImage(fixture('narrow-4x3.png'));
  assert.equal(res.ok, false);
  assert.match(res.message, /Too small: 1000px wide/);
});

test('checkImage tolerates rounding drift inside 2% but not beyond', () => {
  // 2000x1510 drifts to 1.325, ~0.6% off 4:3 — within tolerance.
  const b = Buffer.from(fixture('good-4x3.png'));
  b.writeUInt32BE(1510, 20);
  assert.equal(checkImage(b).ok, true);
  b.writeUInt32BE(1600, 20); // 1.25:1, 6% off — beyond tolerance.
  assert.match(checkImage(b).message, /Wrong shape/);
});

test('checkImage rejects empty, unreadable and oversized input', () => {
  assert.match(checkImage(Buffer.alloc(0)).message, /empty/i);
  assert.match(checkImage(Buffer.from('hello world')).message, /not a readable JPG or PNG/);
  const big = Buffer.alloc(26 * 1024 * 1024);
  big.set(fixture('good-4x3.png'));
  assert.match(checkImage(big).message, /too large/i);
});

test('checkImage accepts a 4:3 JPEG at full width', () => {
  const res = checkImage(jpegBuffer(2400, 1800));
  assert.equal(res.ok, true);
  assert.equal(res.format, 'jpeg');
});
