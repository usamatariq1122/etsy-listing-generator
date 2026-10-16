import Anthropic from '@anthropic-ai/sdk';
import { requireKey, resolveModel } from './apikeys.js';
import { buildSystemPrompt } from './masterPrompt.js';
import { extractJson } from './jsonparse.js';

/**
 * Calls Claude (Anthropic) for one listing package. The assistant turn is
 * prefilled with "{" so the model has to continue with JSON.
 */
export async function callClaude(productName, brand, keywords) {
  const apiKey = await requireKey('anthropic');
  const model = await resolveModel('anthropic');

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model,
    max_tokens: 8000,
    temperature: 0.7,
    system: buildSystemPrompt(productName, brand, keywords),
    messages: [
      {
        role: 'user',
        content: `Create the complete listing package for: ${productName}`,
      },
      { role: 'assistant', content: '{' },
    ],
  });

  if (response.stop_reason === 'max_tokens') {
    const err = new Error(
      'Claude hit the output token limit before finishing. Ask for a shorter guide or raise max_tokens in server/src/claude.js.',
    );
    err.status = 502;
    throw err;
  }

  const body = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');

  return extractJson(`{${body}`);
}
