import { test } from 'node:test';
import assert from 'node:assert/strict';

// masterPrompt and requestContext are both real modules: the generation pipeline
// primes a body on the ambient scope and buildSystemPrompt must read it, then fall
// back to the built-in brief when nothing is primed.
const { buildSystemPrompt, DEFAULT_PROMPT_BODY } = await import('../src/masterPrompt.js');
const { runAs, setPromptBody, currentPromptBody } = await import('../src/requestContext.js');

test('with nothing primed the built-in brief is used and the product is named', () => {
  assert.equal(currentPromptBody(), null);
  const prompt = buildSystemPrompt('Crochet bear', 'Willow');
  assert.ok(prompt.includes('Crochet bear'));
  assert.ok(!prompt.includes('{{product}}'), 'the product placeholder is filled in');
  assert.ok(!prompt.includes('{{brand}}'), 'the brand placeholder is filled in');
  assert.ok(prompt.includes('Willow'), 'the configured brand reaches the prompt');
});

test('a primed body replaces the brief but the JSON contract still wraps it', async () => {
  await runAs('u1', () => {
    setPromptBody('Write a tiny card that says {{brand}} for {{product}}');
    const prompt = buildSystemPrompt('Thank you note', 'Acme');
    assert.ok(prompt.includes('Write a tiny card'), 'the customised brief is used');
    assert.ok(prompt.includes('Thank you note'), 'the product placeholder still fills inside a custom brief');
    assert.ok(prompt.includes('Acme'), 'the brand placeholder still fills inside a custom brief');
    assert.ok(prompt.includes('seo_tags'), 'the output contract is appended whatever the brief says');
  });
  assert.equal(currentPromptBody(), null, 'the primed body does not leak back out');
});

test('DEFAULT_PROMPT_BODY is the built-in brief an unset type falls back to', () => {
  assert.ok(DEFAULT_PROMPT_BODY.length > 0);
  // The built-in default must not be mistaken for a customisation: priming it
  // explicitly yields exactly the prompt the built-in path already produces.
  const builtIn = buildSystemPrompt('Widget', 'Acme');
  const primed = runAs('u1', () => {
    setPromptBody(DEFAULT_PROMPT_BODY);
    return buildSystemPrompt('Widget', 'Acme');
  });
  assert.equal(primed, builtIn);
});
