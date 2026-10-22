import { test } from 'node:test';
import assert from 'node:assert/strict';

// masterPrompt is a thin re-export of the listing brief's mechanics. The wording
// itself is data the repository never carries (see prompts/listing.js), so these
// tests assert only the shape the generation pipeline relies on - which holds for
// a fresh clone's stand-in as well as for this shop's own brief.
const { buildSystemPrompt } = await import('../src/masterPrompt.js');
const { runAs, setPromptBody } = await import('../src/requestContext.js');

test('every token a brief can carry is filled in', async () => {
  const prompt = await buildSystemPrompt('Crochet bear', 'Willow', ['crochet bear pdf', 'amigurumi pattern']);
  for (const token of ['{{brand}}', '{{product}}', '{{keywords}}', '{{banned_word}}']) {
    assert.ok(!prompt.includes(token), `${token} is not left dangling`);
  }
  assert.ok(prompt.includes('Willow'), 'the configured brand reaches the prompt');
});

test('the ticked buyer queries reach the prompt, and only when there are some', async () => {
  const withKeywords = await buildSystemPrompt('Crochet bear', 'Willow', ['greeting card']);
  assert.ok(withKeywords.includes('Buyer queries for this niche'), 'the query block is injected');
  assert.ok(withKeywords.includes('- greeting card'), 'the query itself is listed');

  const bare = await buildSystemPrompt('Crochet bear', 'Willow');
  const empty = await buildSystemPrompt('Crochet bear', 'Willow', []);
  assert.equal(bare, empty, 'an empty list is the same as none');
  assert.ok(!bare.includes('Buyer queries for this niche'), 'nothing is claimed about queries that were not given');
});

test('a listing with no brand configured still gets a name filled in', async () => {
  const prompt = await buildSystemPrompt('Crochet bear', '   ');
  assert.ok(!prompt.includes('{{brand}}'), 'the brand slot is never left raw');
  assert.ok(prompt.includes('none'), 'it falls back to the none placeholder');
});

test('priming a body has no effect: the brief is locked, not editable', async () => {
  const builtIn = await buildSystemPrompt('Thank you note', 'Acme');
  const primed = await runAs('u1', async () => {
    setPromptBody('Write a tiny card that says {{brand}} for {{product}}');
    return buildSystemPrompt('Thank you note', 'Acme');
  });
  assert.equal(primed, builtIn, 'a primed body cannot change the locked system prompt');
});
