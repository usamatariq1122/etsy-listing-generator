import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// The template store is an in-memory map so nothing needs a database. masterPrompt
// is the real module, so its built-in default body is what an un-customised type
// falls back to here, exactly as in production.
const templates = new Map();
mock.module('../src/db.js', {
  namedExports: {
    listPromptTemplates: async () => [...templates].map(([product_type, body]) => ({ product_type, body })),
    getPromptTemplate: async (type) => templates.get(type) ?? null,
    upsertPromptTemplate: async (type, body) => { templates.set(type, body); },
    deletePromptTemplate: async (type) => { const had = templates.has(type); templates.delete(type); return had; },
  },
});

const {
  PRODUCT_TYPES,
  resolveProductType,
  templateBody,
  listTemplates,
  saveTemplate,
  clearTemplate,
  templateIssues,
} = await import('../src/promptTemplates.js');

test('only a specific known type is kept; general and unknown collapse to auto', () => {
  assert.equal(resolveProductType('crochet'), 'crochet');
  assert.equal(resolveProductType('SVG'), 'svg');
  assert.equal(resolveProductType('general'), null);
  assert.equal(resolveProductType('not-a-type'), null);
  assert.equal(resolveProductType(undefined), null);
});

test('an un-customised type has no body, so the built-in wording is used', async () => {
  templates.clear();
  assert.equal(await templateBody('crochet'), null);
  assert.equal(await templateBody(null), null, 'auto reads the general template');
  templates.set('general', 'General brief');
  assert.equal(await templateBody(null), 'General brief');
});

test('listTemplates shows the saved wording for customised types and a default for the rest', async () => {
  templates.clear();
  templates.set('crochet', 'My crochet brief');
  const list = await listTemplates();
  assert.equal(list.length, PRODUCT_TYPES.length);
  const crochet = list.find((type) => type.value === 'crochet');
  assert.equal(crochet.customised, true);
  assert.equal(crochet.body, 'My crochet brief');
  const art = list.find((type) => type.value === 'art');
  assert.equal(art.customised, false);
  assert.ok(art.body.length > 0, 'an un-customised type still shows the built-in brief to edit');
});

test('a save and a clear round-trip the store', async () => {
  templates.clear();
  await saveTemplate('planner', 'Planner brief');
  assert.equal(templates.get('planner'), 'Planner brief');
  assert.equal(await clearTemplate('planner'), true);
  assert.equal(templates.has('planner'), false);
  assert.equal(await clearTemplate('planner'), false);
});

test('templateIssues rejects unknown types, blanks and oversized bodies', () => {
  assert.deepEqual(templateIssues('svg', 'A real brief'), []);
  assert.ok(templateIssues('nope', 'text').length, 'unknown type rejected');
  assert.ok(templateIssues('svg', '   ').length, 'blank rejected');
  assert.ok(templateIssues('svg', 'x'.repeat(9000)).length, 'oversized rejected');
});
