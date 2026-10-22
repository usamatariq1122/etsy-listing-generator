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
  listTemplateTypes,
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

test('listTemplateTypes names the customised types but never returns prompt text', async () => {
  templates.clear();
  templates.set('crochet', 'My crochet brief');
  const list = await listTemplateTypes();
  assert.equal(list.length, PRODUCT_TYPES.length);
  const crochet = list.find((type) => type.value === 'crochet');
  assert.equal(crochet.customised, true);
  assert.equal(crochet.body, undefined, 'the prompt text is never exposed to callers');
  const art = list.find((type) => type.value === 'art');
  assert.equal(art.customised, false);
  assert.equal(art.body, undefined, 'no built-in brief is returned either');
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
