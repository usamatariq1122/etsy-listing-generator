import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// The listing brief is data the repository never carries: a local run reads the
// git-ignored wording file, a deployment reads the same text from Netlify Blobs.
// Both are stood up here so the tests touch neither a network nor server/.env.
const blobs = new Map();
const testConfig = { deployed: true };

mock.module('@netlify/blobs', {
  namedExports: {
    getStore: ({ name }) => ({
      get: async (key) => blobs.get(`${name}/${key}`) ?? null,
    }),
  },
});
mock.module('../src/config.js', { namedExports: { config: testConfig } });

const { lockedWording, buildListingSystemPrompt } = await import('../src/prompts/listing.js');

test('a deployment with no brief installed fails loudly instead of guessing', async () => {
  await assert.rejects(() => lockedWording(), /not installed on this deployment/);
});

test('a deployment reads the brief from the blob store and fills its tokens', async () => {
  blobs.set('listora-locked/listing-wording', 'Brand: {{brand}}. Banned: {{banned_word}}. Product: {{product}}.{{keywords}}');
  const prompt = await buildListingSystemPrompt('Card', 'Willow', ['greeting card']);
  assert.ok(prompt.startsWith('Brand: Willow. Banned: Etsy. Product: Card.'), `got: ${prompt}`);
  assert.ok(prompt.includes('- greeting card'), 'the buyer queries are injected at the marker');
});

test('a brief that forgot the keywords marker still receives the queries', async () => {
  blobs.set('listora-locked/listing-wording', 'A brief with no marker at all.');
  const prompt = await buildListingSystemPrompt('Card', 'Willow', ['greeting card']);
  assert.ok(prompt.endsWith('- greeting card\n\nUse them as the keyword source for Deliverable 2: open the SEO Title with the first; copy tags straight from the list whenever an entry is 20 characters or fewer; invent a tag only when nothing fits; never add a qualifier ("cute", "trendy") that none of these carry.'));
});

test('off a deployment the brief comes from the local wording file', async () => {
  testConfig.deployed = false;
  const wording = await lockedWording();
  assert.ok(wording.length > 0, 'there is a brief to build from');
  assert.ok(wording.includes('{{brand}}'), 'it carries the tokens the mechanics fill in');
});
