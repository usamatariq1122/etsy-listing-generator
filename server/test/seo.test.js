import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { descriptionOf, mainKeyword, checkSeo } from '../src/seoCheck.js';

// keywords.js reaches the network and the database only through db.js;
// stubbing it keeps the pure helpers importable without config/.env loading.
mock.module('../src/db.js', {
  namedExports: { cachedKeywords: async () => null, storeKeywords: async () => {} },
});
const { seedQueries, pickedKeywords } = await import('../src/keywords.js');

test('descriptionOf reads a standalone heading section up to the next one', () => {
  const text = `3. Description:
A hat pattern.

More prose here.

4. Category & Attributes:
Crafts > Crochet`;
  assert.equal(descriptionOf(text), 'A hat pattern.\n\nMore prose here.');
});

test('descriptionOf reads inline and bold descriptions', () => {
  assert.equal(descriptionOf('Description: Sold as a digital PDF.'), 'Sold as a digital PDF.');
  assert.equal(descriptionOf('**Description:** A comfy hat.'), 'A comfy hat.');
  assert.equal(descriptionOf('nothing here at all'), '');
});

test('mainKeyword prefers the picked list, then terms, then the product name', () => {
  assert.equal(mainKeyword({ picked: ['Crochet  Hat'], terms: ['x'], productName: 'y' }), 'crochet hat');
  assert.equal(mainKeyword({ picked: [], terms: ['Bucket Hat'], productName: 'y' }), 'bucket hat');
  assert.equal(mainKeyword({}), '');
});

const goodTags = [
  'crochet bucket hat', 'crochet hat pattern', 'summer sun hat', 'crochet pdf',
  'easy crochet pattern', 'beginner hat', 'sun hat pattern', 'bucket hat pdf',
  'crochet download', 'digital pattern', 'hat tutorial', 'beach hat', 'gift for crafter',
];

test('checkSeo passes everything for a well-built listing', () => {
  const result = checkSeo({
    shape: { seo_title: 'Crochet Bucket Hat Pattern Easy Summer Sun Hat PDF', seo_tags: goodTags },
    file2Text: 'Description:\nMake a crochet bucket hat with this easy PDF pattern.\nA summer sun hat even beginners can finish.',
    picked: ['crochet bucket hat'],
    terms: ['crochet bucket hat'],
    productName: 'Crochet Bucket Hat',
  });
  assert.equal(result.score, 100);
  assert.equal(result.keyword, 'crochet bucket hat');
  assert.ok(result.items.every((item) => item.pass), result.items.filter((i) => !i.pass).map((i) => i.label).join('; '));
  assert.match(result.note, /not a ranking guarantee/i);
});

test('checkSeo flags missing tags, a title that ignores the keyword, and stuffing', () => {
  const result = checkSeo({
    shape: { seo_title: 'Beautiful Handmade Wonder', seo_tags: ['crochet bucket hat', 'Crochet Bucket Hat', 'x'.repeat(21)] },
    file2Text: 'Description:\nNothing related here.\n' + 'crochet bucket hat '.repeat(5),
    picked: ['crochet bucket hat'],
  });
  const byLabel = Object.fromEntries(result.items.map((i) => [i.label, i.pass]));
  assert.equal(byLabel['13 tags'], false);
  assert.equal(byLabel['Every tag 20 characters or less'], false);
  assert.equal(byLabel['No duplicate tags'], false);
  assert.ok(!result.items.find((i) => i.pass && /opens the title/.test(i.label)));
  assert.equal(byLabel['No keyword used more than 3 times'], false);
  assert.ok(result.score < 50);
});

test('checkSeo copes with an absent shape', () => {
  const result = checkSeo({ shape: null, file2Text: '', picked: [] });
  assert.equal(result.total, 6);
  assert.equal(result.passed, 1, 'only the stuffing check passes vacuously with no keywords tracked');
});

test('seedQueries asks short heads and appends missing qualifiers, capped at 5', () => {
  const seeds = seedQueries('Crochet Bucket Hat');
  assert.deepEqual(seeds, [
    'Crochet Bucket Hat',
    'Crochet Bucket',
    'Crochet Bucket pattern',
    'Crochet Bucket digital download',
    'Crochet Bucket gift',
  ]);
  assert.ok(seedQueries('macrame pattern').every((s) => !/ pattern pattern/.test(s)));
  assert.deepEqual(seedQueries('  '), []);
});

test('pickedKeywords trims, lowercases, dedupes, drops long entries and caps at 20', () => {
  assert.deepEqual(pickedKeywords(['  Crochet Hat  ', 'crochet hat', '']), ['crochet hat']);
  assert.deepEqual(pickedKeywords(['x'.repeat(61)]), []);
  assert.deepEqual(pickedKeywords('not a list'), []);
  const many = Array.from({ length: 40 }, (_, i) => `keyword number ${i}`);
  assert.equal(pickedKeywords(many).length, 20);
});
