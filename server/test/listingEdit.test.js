import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyListingEdits, tagIssues, listingIssues } from '../src/listingEdit.js';

const TAGS = [
  'crochet bucket hat', 'crochet hat pattern', 'summer sun hat', 'crochet pdf pattern',
  'easy crochet pattern', 'beginner crochet', 'bucket hat tutorial', 'crochet hat pdf',
  'sun hat pattern', 'diy hat pattern', 'crochet stitch guide', 'pdf download pattern',
  'handmade hat pattern',
];

const body = TAGS.map((tag) => `- ${tag}`).join('\n');
const file2 = `1. SEO Title: Crochet Bucket Hat Pattern Easy Summer Sun Hat PDF

2. 13 SEO Tags:
${body}

3. Description:
Make a crochet bucket hat with this easy PDF pattern.

4. Category & Attributes:
Digital files: PDF

5. Listing Checklist:
- Test swatch`;

test('applyListingEdits writes the seller words back and reads them out unchanged', () => {
  const { text, changed } = applyListingEdits(file2, {
    title: 'Crochet Bucket Hat Pattern for Beginners',
    tags: ['renamed tag one', ...TAGS.slice(1)],
    description: 'A fresh description line.',
  });
  assert.deepEqual(changed.sort(), ['description', 'tags', 'title']);
  assert.equal(listingIssues(text).length, 0, 'the edited file passes every limit');
  assert.match(text, /1\. SEO Title: Crochet Bucket Hat Pattern for Beginners/);
  assert.match(text, /A fresh description line\./);
  // Regression: the section splice used to swallow the next heading.
  assert.match(text, /Listing Checklist:/);
});

test('applyListingEdits keeps an untouched section exactly as the model wrote it', () => {
  const { text } = applyListingEdits(file2, { title: 'Only the title changes' });
  assert.match(text, /- crochet bucket hat/);
  assert.match(text, /Make a crochet bucket hat with this easy PDF pattern\./);
});

test('applyListingEdits refuses an empty edit', () => {
  assert.throws(() => applyListingEdits(file2, {}), /Nothing to save/);
});

test('tagIssues reports over-long tags, duplicates and the wrong count', () => {
  const tooLong = ['a'.repeat(21), ...TAGS.slice(1)];
  assert.ok(tagIssues(tooLong).some((issue) => /limit is 20/.test(issue)));
  assert.ok(tagIssues([...TAGS, TAGS[0]]).some((issue) => /Duplicate/.test(issue)));
  assert.ok(tagIssues(TAGS.slice(0, 12)).some((issue) => /exactly 13/.test(issue)));
  assert.deepEqual(tagIssues(TAGS), []);
});

test('listingIssues blocks an empty or over-long title', () => {
  const emptyTitle = file2.replace(/1\. SEO Title: .*/, '1. SEO Title:');
  assert.ok(listingIssues(emptyTitle).some((issue) => /title is empty/.test(issue)));

  const longTitle = file2.replace(/1\. SEO Title: .*/, `1. SEO Title: ${'word '.repeat(40).trim()}`);
  assert.ok(listingIssues(longTitle).some((issue) => /SEO title is \d+ characters/.test(issue)));
});

test('listingIssues never locks out a valid model listing', () => {
  assert.deepEqual(listingIssues(file2), []);
});
