import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listingFields } from '../src/listingFields.js';

const file2 = `1. SEO Title: Crochet Bucket Hat Pattern Easy Summer Sun Hat PDF

2. 13 SEO Tags:
- crochet bucket hat
- crochet hat pattern
- summer sun hat
- crochet pdf pattern

3. Description:
Make a crochet bucket hat with this easy PDF pattern.
Perfect summer sun hat for beginners.

4. Category & Attributes:
Category path: Crafts > Needlework > Crochet
Digital files: PDF

5. Image Placement Guide:
Use the cover image first.`;

test('listingFields reads title, tags, description and attributes from File 2', () => {
  const fields = listingFields(file2);
  assert.equal(fields.title, 'Crochet Bucket Hat Pattern Easy Summer Sun Hat PDF');
  assert.deepEqual(fields.tags, ['crochet bucket hat', 'crochet hat pattern', 'summer sun hat', 'crochet pdf pattern']);
  assert.equal(
    fields.description,
    'Make a crochet bucket hat with this easy PDF pattern.\nPerfect summer sun hat for beginners.',
  );
  assert.deepEqual(fields.attributes, [
    { label: 'Category path', value: 'Crafts > Needlework > Crochet' },
    { label: 'Digital files', value: 'PDF' },
  ]);
});

test('listingFields reads inline heading values', () => {
  const fields = listingFields('SEO Title: One Line Title\n13 Tags: alpha, beta, gamma\nDescription: Sold as a digital download only.\nAttributes: Instant download');
  assert.equal(fields.title, 'One Line Title');
  assert.deepEqual(fields.tags, ['alpha', 'beta', 'gamma']);
  assert.equal(fields.description, 'Sold as a digital download only.');
  // The heading word is consumed by the section itself, so the value keeps its
  // text and the label stays empty — the preview still shows the seller line.
  assert.deepEqual(fields.attributes, [{ label: '', value: 'Instant download' }]);
});

test('listingFields keeps body prose out of headings and stops at the next section', () => {
  const fields = listingFields(`# SEO Title: Markdown Heading Title

# Description
First paragraph.

Still the description.

# Category
Craft patterns`);
  assert.equal(fields.title, 'Markdown Heading Title');
  assert.equal(fields.description, 'First paragraph.\n\nStill the description.');
  assert.deepEqual(fields.attributes, [{ label: '', value: 'Craft patterns' }]);
});

test('listingFields tolerates a missing File 2', () => {
  assert.deepEqual(listingFields(''), { title: '', tags: [], description: '', attributes: [] });
  assert.deepEqual(listingFields(null).tags, []);
});
