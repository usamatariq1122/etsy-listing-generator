import { test } from 'node:test';
import assert from 'node:assert/strict';

import { productBrief, normalizeProductInfo, hasProductInfo, PRODUCT_INFO_KEYS } from '../src/productBrief.js';

test('productBrief renders only the fields the seller filled', () => {
  const brief = productBrief({ audience: 'beginner crocheters', contents: '12-page PDF', occasion: '' });
  assert.match(brief, /Target buyer: beginner crocheters/);
  assert.match(brief, /What is included: 12-page PDF/);
  assert.ok(!brief.includes('Occasion'), 'a blank field leaves its line out');
});

test('productBrief is empty for nothing, a null value or only blanks', () => {
  assert.equal(productBrief(null), '');
  assert.equal(productBrief(undefined), '');
  assert.equal(productBrief({}), '');
  assert.equal(productBrief({ audience: '   ', notes: '' }), '');
});

test('normalizeProductInfo keeps known keys, caps length and scrubs the marketplace word', () => {
  const info = normalizeProductInfo({
    audience: ' Etsy  sellers ',
    unknown: 'should be dropped',
    notes: 'x'.repeat(600),
  });
  assert.ok(!('unknown' in info), 'a field not on the list is never stored');
  assert.ok(!/etsy/i.test(info.audience), 'the marketplace word is scrubbed from a brief value');
  assert.equal(info.notes.length, 500, 'a value is capped at 500 characters');
  assert.deepEqual(Object.keys(info).sort(), [...PRODUCT_INFO_KEYS].sort());
});

test('hasProductInfo is false for an all-blank brief and true once one field is filled', () => {
  assert.equal(hasProductInfo({ audience: '', notes: '  ' }), false);
  assert.equal(hasProductInfo({ contents: 'SVG bundle' }), true);
});
