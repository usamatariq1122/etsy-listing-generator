import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SLOTS, SLOT_IDS, getSlot, promptFor, imageFileName } from '../src/slots.js';

test('seven slots in ZIP order with stable ids', () => {
  assert.equal(SLOTS.length, 7);
  assert.deepEqual(SLOT_IDS, ['cover', 'detail', 'materials', 'lifestyle', 'digital', 'specs', 'license']);
  assert.deepEqual(SLOTS.map((s) => s.zipName), [
    '01-cover', '02-detail', '03-materials', '04-lifestyle', '05-digital-download', '06-size-skill', '07-license',
  ]);
});

test('images map to 01-cover.png … 07-license.png; jpeg is written as .jpg', () => {
  assert.equal(imageFileName(getSlot('cover'), 'png'), '01-cover.png');
  assert.equal(imageFileName(getSlot('license'), 'png'), '07-license.png');
  assert.equal(imageFileName(getSlot('digital'), 'png'), '05-digital-download.png');
  assert.equal(imageFileName(getSlot('specs'), 'jpeg'), '06-size-skill.jpg');
  assert.equal(imageFileName(getSlot('specs'), 'webp'), '06-size-skill.jpg', 'unknown formats fall back to jpg');
  assert.equal(SLOTS.map((s) => imageFileName(s, 'png')).join(','), [
    '01-cover.png', '02-detail.png', '03-materials.png', '04-lifestyle.png',
    '05-digital-download.png', '06-size-skill.png', '07-license.png',
  ].join(','));
});

test('getSlot returns null for an unknown id', () => {
  assert.equal(getSlot('nope'), null);
});

test('promptFor maps slots onto the four mockups then the three infographics', () => {
  const product = {
    mockup_prompts: ['m0', 'm1', 'm2', 'm3'],
    infographic_prompts: ['i0', 'i1', 'i2'],
  };
  const byId = Object.fromEntries(SLOTS.map((s) => [s.id, promptFor(s, product)]));
  assert.deepEqual(byId, {
    cover: 'm0', detail: 'm1', materials: 'm2', lifestyle: 'm3',
    digital: 'i0', specs: 'i1', license: 'i2',
  });
  assert.equal(promptFor(getSlot('cover'), {}), '');
  assert.equal(promptFor(getSlot('specs'), { infographic_prompts: [] }), '');
});
