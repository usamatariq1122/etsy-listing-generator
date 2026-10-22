import { GoogleGenAI } from '@google/genai';
import { requireKey, resolveModel } from './apikeys.js';
import { buildSystemPrompt } from './masterPrompt.js';
import { buildListingUserMessage } from './prompts/listing.js';
import { productBrief } from './productBrief.js';
import { extractJson } from './jsonparse.js';
import { withRetry } from './retry.js';

// Structured-output schema so Gemini must return the exact package shape.
const LISTING_SCHEMA = {
  type: 'OBJECT',
  properties: {
    file2_text: { type: 'STRING' },
    seo_title: { type: 'STRING' },
    seo_tags: { type: 'ARRAY', items: { type: 'STRING' } },
    pattern_formatted: { type: 'STRING' },
    mockup_prompts: { type: 'ARRAY', items: { type: 'STRING' } },
    infographic_prompts: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['file2_text', 'seo_title', 'seo_tags', 'mockup_prompts', 'infographic_prompts'],
  propertyOrdering: ['file2_text', 'seo_title', 'seo_tags', 'pattern_formatted', 'mockup_prompts', 'infographic_prompts'],
};

/** Gemini returns quota and key failures as a JSON blob; the UI shows one readable line. */
function friendlyError(error, model) {
  const message = error?.message || '';
  if (/"code":\s*401|UNAUTHENTICATED|API key not valid/i.test(message)) {
    const err = new Error(
      'Google rejected the Gemini API key, so no model was asked. Open Settings, paste your key and save it (or fix GEMINI_API_KEY in server/.env).',
    );
    err.status = 401;
    return err;
  }
  if (!/"code":\s*429|RESOURCE_EXHAUSTED|quota/i.test(message)) return error;
  const retry = message.match(/retry in\s+(?:(\d+h)\s*)?(?:(\d+m)\s*)?/i);
  const wait = (retry ? [retry[1], retry[2]].filter(Boolean).join(' ') : '').trim();
  const err = new Error(
    `${model} has no free requests left today${wait ? ` — it resets in ${wait}` : ''}. Another model may still answer.`,
  );
  err.status = 429;
  // The readable rewrite drops the status code the failover matches on, so the
  // "worth another model" verdict travels on the error itself.
  err.switchable = true;
  return err;
}

/** Calls a Gemini text model with the master prompt and returns the parsed package JSON. */
export async function callGeminiText(productName, brand, keywords, modelOverride, info, payload = {}) {
  const apiKey = await requireKey('gemini');
  const model = modelOverride || (await resolveModel('gemini'));

  const ai = new GoogleGenAI({ apiKey });
  let response;
  try {
    response = await withRetry(async () => {
      const result = await ai.models.generateContent({
        model,
        contents: buildListingUserMessage({ productName, keywords, details: productBrief(info).trim(), ...payload }),
        config: {
          systemInstruction: buildSystemPrompt(productName, brand, keywords),
          responseMimeType: 'application/json',
          responseSchema: LISTING_SCHEMA,
          temperature: 0.7,
        },
      });
      // A saturated model sometimes answers with a status 200 and no text at
      // all, so that is retried the same way a 503 is.
      if (!String(result?.text ?? '').trim()) {
        throw new Error(`Gemini (${model}) returned no text. This is usually temporary - try again later.`);
      }
      return result;
    });
  } catch (error) {
    throw friendlyError(error, model);
  }

  return extractJson(response.text);
}
