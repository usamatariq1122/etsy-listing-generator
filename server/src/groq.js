import { config } from './config.js';
import { buildSystemPrompt } from './masterPrompt.js';
import { productBrief } from './productBrief.js';
import { extractJson } from './jsonparse.js';
import { withRetry } from './retry.js';
import { requireKey, resolveModel } from './apikeys.js';

const REQUEST_TIMEOUT_MS = 120000;

/** Turns a Groq failure into one readable line. */
function friendlyError(error, model) {
  const message = String(error?.message || '');
  if (/"code":\s*401|invalid_api_key|Unauthorized/i.test(message)) {
    const err = new Error(
      'Groq rejected the API key, so nothing was written. Open Settings, paste your Groq key and save it (or fix GROQ_API_KEY in server/.env).',
    );
    err.status = 401;
    return err;
  }
  if (/"code":\s*404|model_not_found|is not a valid model/i.test(message)) {
    const err = new Error(`Groq has no model called ${model}. Open Settings and pick one of the models listed there.`);
    err.status = 400;
    return err;
  }
  if (/"code":\s*429|rate_limit|quota/i.test(message)) {
    const err = new Error('Groq is out of requests too. Wait a minute and click Rewrite text.');
    err.status = 429;
    err.switchable = true;
    return err;
  }
  return error;
}

/**
 * Calls a Groq model through the OpenAI-compatible endpoint and returns the
 * parsed package JSON. Only reached after every Gemini model has declined.
 */
export async function callGroqText(productName, brand, keywords, modelOverride, info) {
  const apiKey = await requireKey('groq');
  const model = modelOverride || (await resolveModel('groq'));

  let response;
  try {
    response = await withRetry(async () => {
      const res = await fetch(config.groq.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        body: JSON.stringify({
          model,
          temperature: 0.7,
          max_tokens: 8000,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: buildSystemPrompt(productName, brand, keywords) },
            { role: 'user', content: `Create the complete listing package for: ${productName}${productBrief(info)}` },
          ],
        }),
      });
      const body = await res.text();
      if (!res.ok) {
        // The status is written in the provider's own shape so the retry and
        // failover rules, which read the message, classify it the same way.
        const err = new Error(`Groq failed ("code": ${res.status}): ${body.slice(0, 400)}`);
        err.status = res.status;
        throw err;
      }
      return body;
    });
  } catch (error) {
    throw friendlyError(error, model);
  }

  let content;
  try {
    content = JSON.parse(response).choices?.[0]?.message?.content;
  } catch {
    content = undefined;
  }
  if (!String(content ?? '').trim()) {
    const err = new Error(`Groq (${model}) returned an empty answer. Try again, or pick another Groq model in Settings.`);
    err.status = 502;
    err.switchable = true;
    throw err;
  }

  return extractJson(content);
}
