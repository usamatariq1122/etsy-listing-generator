import { test } from 'node:test';
import assert from 'node:assert/strict';

// masterPrompt is now a thin re-export of the locked listing brief: it does not
// read the ambient primed body any more, so the same brief comes out whatever a
// caller tried to prime. Only the brand token is substituted.
const { buildSystemPrompt, DEFAULT_PROMPT_BODY } = await import('../src/masterPrompt.js');
const { runAs, setPromptBody } = await import('../src/requestContext.js');

test('the locked brief names the configured brand and leaves no placeholders', () => {
  const prompt = buildSystemPrompt('Crochet bear', 'Willow');
  assert.ok(prompt.includes('Willow'), 'the configured brand reaches the prompt');
  assert.ok(!prompt.includes('{{brand}}'), 'the brand placeholder is filled in');
  assert.ok(!prompt.includes('{{product}}'), 'no product placeholder is left dangling');
  assert.ok(prompt.includes('pattern_text'), 'the brief is built around the seller pattern input');
  assert.ok(prompt.includes('seo_tags'), 'the output contract is appended');
});

test('priming a body has no effect: the brief is locked, not editable', () => {
  const builtIn = buildSystemPrompt('Thank you note', 'Acme');
  const primed = runAs('u1', () => {
    setPromptBody('Write a tiny card that says {{brand}} for {{product}}');
    return buildSystemPrompt('Thank you note', 'Acme');
  });
  assert.equal(primed, builtIn, 'a primed body cannot change the locked system prompt');
  assert.ok(!primed.includes('Write a tiny card'), 'the primed wording is never used');
});

test('DEFAULT_PROMPT_BODY is the locked brief the model is given', () => {
  assert.ok(DEFAULT_PROMPT_BODY.length > 0);
  assert.ok(DEFAULT_PROMPT_BODY.includes('You do NOT author a product guide'), 'the no-authoring rule is in the locked brief');
});
