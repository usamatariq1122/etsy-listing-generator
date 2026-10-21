import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textToPdf } from '../src/pdf.js';

const BODY = `1. SEO Title: Crochet Bucket Hat

Section Heading
- first bullet
- second bullet

Some prose long enough to be treated as a paragraph and to justify across the width of the page nicely.`;

test('textToPdf renders with the default palette when no theme is given', async () => {
  const bytes = await textToPdf(BODY, 'Fallback Title', 'A subtitle', { cover: true });
  assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
  assert.ok(bytes.length > 1000);
});

test('a saved theme recolours the PDF without breaking the layout', async () => {
  const plain = await textToPdf(BODY, 'Fallback Title', 'A subtitle', { cover: true });
  const themed = await textToPdf(BODY, 'Fallback Title', 'A subtitle', {
    cover: true,
    theme: { ink: '#000000', accent: '#c0ffee', muted: '#ff0000', hairline: '#00ff00' },
  });
  assert.equal(themed.subarray(0, 5).toString(), '%PDF-');
  assert.notDeepEqual(Buffer.from(plain).toString('hex'), Buffer.from(themed).toString('hex'));
});
