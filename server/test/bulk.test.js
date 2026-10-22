import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRows, parseCsv } from '../src/bulk.js';

test('parseRows keeps commas inside quotes and unwraps doubled quotes', () => {
  const rows = parseRows('a,"b, c","he said ""hi"""\n1,2,3\n');
  assert.deepEqual(rows[0], ['a', 'b, c', 'he said "hi"']);
  assert.deepEqual(rows[1], ['1', '2', '3']);
});

test('parseCsv reads a header row in any column order', () => {
  const { rows } = parseCsv('keywords,product_name\nred;blue,Fidget toy\n,\n');
  assert.deepEqual(rows, [{ productName: 'Fidget toy', keywords: ['red', 'blue'], pattern: '' }]);
});

test('parseCsv reads a pattern column when the header names one', () => {
  const { rows } = parseCsv('product_name,keywords,pattern\nFidget toy,red;blue,a tested pattern text\n');
  assert.deepEqual(rows, [{ productName: 'Fidget toy', keywords: ['red', 'blue'], pattern: 'a tested pattern text' }]);
});

test('parseCsv treats a headerless file as name then keywords', () => {
  const { rows, skipped } = parseCsv('Crochet hat, yarn; pattern\nab, x');
  assert.deepEqual(rows[0], { productName: 'Crochet hat', keywords: ['yarn', 'pattern'], pattern: '' });
  // "ab" is under the 3-character floor, so it is skipped and reported.
  assert.equal(skipped, 1);
  assert.equal(rows.length, 1);
});

test('parseCsv is empty and harmless on nothing to read', () => {
  assert.deepEqual(parseCsv(''), { rows: [], skipped: 0 });
  assert.deepEqual(parseCsv(null).rows, []);
});

test('a long product name is trimmed to the portal limit, not dropped', () => {
  const { rows } = parseCsv(`name\n${'x'.repeat(300)}`);
  assert.equal(rows[0].productName.length, 200);
});
