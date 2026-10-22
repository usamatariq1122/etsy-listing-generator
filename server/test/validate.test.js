import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// rules.js is git-ignored: the repository only carries a generic stand-in, so a
// fresh clone has a different banned word and a different list of retired shop
// names than this shop does. The two scrubbing assertions below depend on that
// list, so rules are stood up here and validate is imported after them - the
// checks then test the scrubber, whatever the owner's own file happens to say.
mock.module('../src/rules.js', {
  namedExports: {
    BANNED_WORD: 'Etsy',
    BANNED_WORD_RE: /etsy/gi,
    LEGACY_BRANDS: ['oldshopname'],
  },
});

const {
  cleanFileOne,
  validateFileOne,
  validateFileTwo,
  scrubBranding,
  normalizeShape,
  shapeIssues,
  seoIssues,
  repairSeo,
  alignSeo,
  summarizeCleaning,
  groove,
  applyBrandLicense,
  scrubBannedWord,
  countBannedWord,
} = await import('../src/validate.js');

const longBody = 'x'.repeat(500);

test('cleanFileOne removes brackets, urls, footnotes, citations and counts them', () => {
  const text = `${longBody} As (Smith, 2020) wrote, the pattern works.[^1] Some claim.²`;
  const { text: cleaned, removed } = cleanFileOne(`${text}\nA note [draft] here. See https://example.com/page and also www.foo.com/bar.\n\nReferences\nSmith, J. (2020). A book.`);
  assert.equal(removed.brackets, 2, `brackets: ${removed.brackets}`);
  assert.equal(removed.urls, 2);
  assert.equal(removed.footnotes, 1);
  assert.equal(removed.inlineCitations, 1);
  assert.ok(!cleaned.includes('[draft]'));
  assert.ok(!cleaned.includes('example.com'));
  assert.ok(!cleaned.includes('[^1]'));
  assert.ok(!/Smith, J\./.test(cleaned), 'reference lines dropped');
});

test('cleanFileOne drops a trailing reference section', () => {
  const { text, removed } = cleanFileOne(`${longBody}\n\nReferences\nSome source line here.`);
  assert.equal(removed.referenceSection, true);
  assert.ok(!/References/i.test(text));
});

test('cleanFileOne removes the banned word and reports it', () => {
  const { text, removed } = cleanFileOne(`Buy this ${longBody} on etsy today. Etsy approved.`);
  assert.equal(removed.bannedWord, 2);
  assert.ok(!/etsy/i.test(text));
});

test('summarizeCleaning reports only what was actually removed', () => {
  const notes = summarizeCleaning({ brackets: 2, urls: 0, footnotes: 1, inlineCitations: 0, citationLines: 0, bannedWord: 3, referenceSection: false });
  assert.deepEqual(notes, ['removed 2 bracketed span(s)', 'removed 1 footnote marker(s)', 'removed 3 occurrence(s) of "Etsy"']);
});

test('validateFileOne passes a clean long guide and fails each dirty case', () => {
  assert.deepEqual(validateFileOne(`${longBody}${longBody}`), []);
  assert.ok(validateFileOne('').some((i) => /empty/i.test(i)));
  assert.ok(validateFileOne(`${longBody} [leftover] ${longBody}`).some((i) => /bracket/.test(i)));
  assert.ok(validateFileOne(`${longBody} https://a.example ${longBody}`).some((i) => /URL/.test(i)));
  assert.ok(validateFileOne(`${longBody} sold on Etsy ${longBody}`).some((i) => /banned word/.test(i)));
  assert.ok(validateFileOne(`${longBody}\nReferences\none two ${longBody}`).some((i) => /reference/.test(i)));
  assert.ok(validateFileOne('too short').some((i) => /short/.test(i)));
});

test('validateFileTwo: empty, short and fine', () => {
  assert.deepEqual(validateFileTwo(''), ['File 2 came back empty.']);
  assert.equal(validateFileTwo('a'.repeat(399)).length, 1);
  assert.deepEqual(validateFileTwo('a'.repeat(400)), []);
});

test('scrubBranding removes legacy and foreign shop names, keeps the configured single-word brand', () => {
  assert.ok(!/oldshopname/i.test(scrubBranding('Made by OldShopName with love')));
  assert.equal(scrubBranding('Buy at oldshopname shop today'), 'Buy at my shop today');
  assert.ok(!/UnknownBrand/.test(scrubBranding('Created by UnknownBrand studio')));
  assert.equal(scrubBranding('Made by Willow, the best', { allow: ['willow'] }), 'Made by Willow, the best');
  assert.equal(scrubBranding('Visit Willow shop', { allow: ['willow'] }), 'Visit Willow shop');
});

test('normalizeShape scrubs brand names and prompt-list Etsy, trims lists, keeps File 2 prose intact', () => {
  const shape = normalizeShape({
    seo_title: 'Great Title [edit] ',
    seo_tags: ['crochet hat', '', ' etsy buyer '],
    file1_text: 'body text [x]',
    file2_text: 'title: Great Title',
    mockup_prompts: ['a etsy scene', 'b', 'c', 'd', 'e', 'f'],
    infographic_prompts: ['one', 'two', 'three', 'four'],
  });
  // Only branding is scrubbed here; brackets and the platform name are cleaned
  // elsewhere (File 1 by cleanFileOne, prompts by scrubBannedWord), and File 2
  // is allowed to carry the marketplace word.
  assert.equal(shape.seo_title, 'Great Title [edit]');
  assert.deepEqual(shape.seo_tags, ['crochet hat', 'etsy buyer']);
  assert.deepEqual(shape.mockup_prompts, ['a scene', 'b', 'c', 'd']);
  assert.equal(shape.infographic_prompts.length, 3);
  assert.ok(shape.mockup_prompts.every((p) => !/etsy/i.test(p)), 'image prompts are Etsy-free');
});

test('shapeIssues demands exactly 4 mockup and 3 infographic prompts', () => {
  const issues = shapeIssues({ mockup_prompts: ['a', 'b', 'c'], infographic_prompts: ['x', 'y', 'z', 'w'] });
  assert.equal(issues.length, 2);
  assert.match(issues.join('\n'), /4 mockup prompts, got 3/);
  assert.match(issues.join('\n'), /3 infographic prompts, got 4/);
  assert.deepEqual(shapeIssues({ mockup_prompts: ['a', 'b', 'c', 'd'], infographic_prompts: ['x', 'y', 'z'] }), []);
});

const shapeOf = (overrides = {}) =>
  normalizeShape({
    seo_title: 'Crochet Bucket Hat Pattern Easy Summer Hat PDF',
    seo_tags: Array.from({ length: 13 }, (_, i) => `crochet hat ${i}`),
    file2_text: 'seo title: Crochet Bucket Hat Pattern Easy Summer Hat PDF\n13 SEO Tags: crochet hat 0',
    ...overrides,
  });

test('seoIssues: title length boundary 140', () => {
  assert.deepEqual(seoIssues(shapeOf({ seo_title: 'a'.repeat(140) })), []);
  assert.equal(seoIssues(shapeOf({ seo_title: 'a'.repeat(141) })).length, 1);
  assert.ok(seoIssues(shapeOf({ seo_title: '' })).some((i) => /missing/i.test(i)));
});

test('seoIssues: 13 tags, 20-character tag limit, duplicates', () => {
  assert.ok(seoIssues(shapeOf({ seo_tags: ['a', 'b'] })).some((i) => /13 SEO tags, got 2/.test(i)));
  assert.ok(seoIssues(shapeOf({ seo_tags: Array.from({ length: 13 }, (_, i) => 'x'.repeat(21)) }))
    .some((i) => /exceed 20 characters/.test(i)));
  const dupes = Array.from({ length: 13 }, (_, i) => (i < 2 ? 'Crochet Hat' : `tag ${i}`));
  assert.ok(seoIssues(shapeOf({ seo_tags: dupes })).some((i) => /Duplicate/.test(i)));
});

test('repairSeo shortens the title, trims and dedupes tags, rewrites File 2', () => {
  const shape = shapeOf({
    seo_title: `${'crochet bucket hat pattern '.repeat(6)}overflowing tail`,
    seo_tags: ['crochet bucket hat patterns and more words beyond', 'crochet hat', 'crochet HAT', ...Array.from({ length: 14 }, (_, i) => `extra tag ${i}`)],
  });
  const { shape: fixed, notes } = repairSeo(shape);
  assert.ok([...fixed.seo_title].length <= 140);
  const original = shape.seo_title.trim();
  assert.ok(original.startsWith(fixed.seo_title), 'the shortened title stays a prefix');
  assert.match(original[fixed.seo_title.length] ?? ' ', /\s/, 'the cut lands on a word boundary');
  assert.ok(fixed.seo_tags.length <= 13);
  assert.ok(fixed.seo_tags.every((t) => [...t].length <= 20));
  assert.equal(new Set(fixed.seo_tags.map((t) => t.toLowerCase())).size, fixed.seo_tags.length);
  assert.ok(notes.length >= 3);
});

test('repairSeo leaves a compliant shape almost untouched', () => {
  const shape = shapeOf();
  const { shape: fixed, notes } = repairSeo(shape);
  assert.deepEqual(notes, []);
  assert.equal(fixed.seo_title, shape.seo_title);
  assert.deepEqual(fixed.seo_tags, shape.seo_tags);
});

test('alignSeo swaps unbacked tags for buyer queries and fills with the remaining queries', () => {
  const shape = shapeOf({ seo_tags: ['totally unrelated phrase'] });
  const { shape: aligned, notes } = alignSeo(shape, ['crochet bucket hat', 'macrame wall hanging', 'knit hat pattern']);
  assert.ok(aligned.seo_tags.includes('crochet bucket hat'), aligned.seo_tags.join('|'));
  assert.equal(aligned.seo_tags.length, 3, 'only the three available queries can be used');
  assert.ok(notes.some((n) => /replaced the tag/.test(n)));
  assert.ok(notes.some((n) => /added the buyer query/.test(n)));
  // Already-backed tags are kept, plurals folded: "crochet hat" fits "crochet bucket hats".
  const backed = alignSeo(shapeOf({ seo_tags: ['crochet hat'] }), ['crochet bucket hats']);
  assert.ok(backed.shape.seo_tags.includes('crochet hat'));
});

test('alignSeo without terms returns the shape unchanged', () => {
  const shape = shapeOf();
  const { shape: same, notes } = alignSeo(shape, []);
  assert.equal(same, shape);
  assert.deepEqual(notes, []);
});

test('groove re-lines a collapsed guide but leaves structured text alone', () => {
  const collapsed = 'Materials: yarn, hook, scissors and tape. This pattern is worked in the round.';
  const grooved = groove(collapsed);
  assert.match(grooved, /^Materials:/m);
  assert.match(grooved, /- yarn/);
  assert.match(grooved, /- tape/);
  const structured = `line one\nline two\nline three\nline four`;
  assert.equal(groove(structured), structured);
});

test('applyBrandLicense inserts the brand line, rewrites old stamps, creates a section', () => {
  const withHeading = applyBrandLicense('Intro text.\n\nLicense:\nDo not resell.', 'My Yarn Studio');
  assert.match(withHeading, /My Yarn Studio holds all rights/);
  assert.match(withHeading, /Do not resell\./);

  const oldStamp = applyBrandLicense('License:\nOld Brand holds all rights to this guide and to the designs in it.\nMore terms.', 'New Brand');
  assert.ok(!/Old Brand/.test(oldStamp), oldStamp);
  assert.match(oldStamp, /New Brand holds all rights/);

  const created = applyBrandLicense('Just a guide with no licence at all.', 'My Brand');
  assert.match(created, /^License:/m);
  assert.equal(applyBrandLicense('body', ''), 'body');
});

test('scrubBannedWord and countBannedWord', () => {
  assert.equal(scrubBannedWord('on etsy and Etsy').count, 2);
  assert.equal(scrubBannedWord('clean').count, 0);
  assert.equal(countBannedWord(['a etsy b', 'clean', null]), 1);
  assert.equal(countBannedWord('not an array'), 0);
});
