import { test } from 'node:test';
import assert from 'node:assert/strict';

import { assessListing, SECTIONS } from '../src/validateListing.js';

const CLEAN_TAGS = Array.from({ length: 13 }, (_, i) => `tag ${i + 1}`);

/** A fully ready, Etsy-connected listing that answers every required question. */
const readyFacts = () => ({
  hasFile1: true,
  hasFile2: true,
  file1Issues: [],
  file2Issues: [],
  guideWords: 1100,
  listing: { title: 'Crochet Turtle Pattern PDF', tags: CLEAN_TAGS, description: 'A full pattern description.', attributes: [] },
  price: '6.50',
  imageCount: 5,
  documentCount: 2,
  etsy: { enabled: true, connected: true },
  defaults: { category: 'Craft Supplies > Yarn', quantity: '999', whoMade: 'i_did', whenMade: '2020_2026' },
  categoryResolvable: true,
  briefProvided: true,
  seoCheck: { score: 83 },
});

test('a complete, connected listing is ready with no errors', () => {
  const v = assessListing(readyFacts());
  assert.equal(v.ready, true);
  assert.deepEqual(v.errors, []);
  assert.equal(v.summary.price, '6.50');
  assert.equal(v.summary.shop, 'connected');
});

test('every finding names a section the UI can link a fix to', () => {
  const facts = readyFacts();
  facts.price = null;
  facts.imageCount = 0;
  const v = assessListing(facts);
  assert.ok(v.errors.every((error) => SECTIONS.includes(error.section)), 'each error carries a known section');
});

test('missing price, images, files, description and title all block the draft', () => {
  const facts = readyFacts();
  facts.price = null;
  facts.imageCount = 0;
  facts.documentCount = 0;
  facts.listing = { title: '', tags: [], description: '', attributes: [] };
  const v = assessListing(facts);
  assert.equal(v.ready, false);
  const sections = new Set(v.errors.map((error) => error.section));
  for (const section of ['price', 'images', 'files', 'content', 'seo']) {
    assert.ok(sections.has(section), `an error blocks ${section}`);
  }
});

test('a tag over 20 characters is an error, a short tag list is only a warning', () => {
  const facts = readyFacts();
  facts.listing.tags = [...Array.from({ length: 12 }, (_, i) => `tag ${i}`), 'a tag that is far too long to fit'];
  const v = assessListing(facts);
  assert.ok(v.errors.some((error) => error.section === 'seo' && /20 characters/.test(error.message)));
});

test('no tags is a warning, not a block', () => {
  const facts = readyFacts();
  facts.listing.tags = [];
  const v = assessListing(facts);
  assert.equal(v.ready, true);
  assert.ok(v.warnings.some((warning) => /search tags/i.test(warning.message)));
});

test('a disconnected shop blocks the draft; a category needing review is only a warning', () => {
  const off = assessListing({ ...readyFacts(), etsy: { enabled: true, connected: false } });
  assert.equal(off.ready, false);
  assert.ok(off.errors.some((error) => error.section === 'shop'));

  const review = assessListing({ ...readyFacts(), categoryResolvable: null });
  assert.ok(review.warnings.some((warning) => warning.needsReview), 'an unconfirmed category reads as needs-review');
  assert.equal(review.ready, true, 'a review warning still lets it through');
});

test('unanswered Etsy questions block once the shop is connected', () => {
  const facts = readyFacts();
  facts.defaults = { category: 'Craft Supplies > Yarn', quantity: '', whoMade: '', whenMade: '' };
  const v = assessListing(facts);
  assert.equal(v.ready, false);
  const messages = v.errors.filter((error) => error.section === 'etsy').map((error) => error.message).join(' ');
  assert.match(messages, /how many copies/i);
  assert.match(messages, /who made/i);
  assert.match(messages, /when the product was made/i);
});

test('a thin guide and a blank product brief are flagged, never blocking', () => {
  const v = assessListing({ ...readyFacts(), guideWords: 500, briefProvided: false });
  assert.equal(v.ready, true);
  assert.ok(v.warnings.some((warning) => /500 words/.test(warning.message)));
  assert.ok(v.info.some((note) => /Product details were left blank/.test(note.message)));
});

test('a listing whose only images are AI-generated is blocked until a real photo is added', () => {
  // Five images, none uploaded by the seller → realImageCount 0.
  const v = assessListing({ ...readyFacts(), imageCount: 5, realImageCount: 0 });
  assert.equal(v.ready, false);
  assert.ok(v.errors.some((error) => error.section === 'images' && /real photo/i.test(error.message)));

  // One real photo among them satisfies the rule.
  const ok = assessListing({ ...readyFacts(), imageCount: 5, realImageCount: 1 });
  assert.equal(ok.ready, true);
});

test('a crochet pattern carries a non-blocking AI functional-guide warning', () => {
  const v = assessListing({ ...readyFacts(), productType: 'crochet' });
  assert.equal(v.ready, true);
  assert.ok(v.warnings.some((warning) => /functional guides such as patterns/i.test(warning.message)));

  const art = assessListing({ ...readyFacts(), productType: 'art' });
  assert.ok(!art.warnings.some((warning) => /functional guides/i.test(warning.message)), 'wall art is not a functional guide');
});

test('submissionErrors flattens the blockers into readable lines', async () => {
  const { submissionErrors } = await import('../src/validateListing.js');
  const facts = readyFacts();
  facts.price = null;
  const v = assessListing(facts);
  const lines = submissionErrors(v);
  assert.ok(lines.every((line) => typeof line === 'string'));
  assert.ok(lines.some((line) => /price above zero/i.test(line)));
});
