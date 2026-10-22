import { config } from './config.js';
import { buildSystemPrompt } from './masterPrompt.js';
import { productBrief } from './productBrief.js';
import { extractJson } from './jsonparse.js';
import { withRetry } from './retry.js';
import { requireKey, resolveModel } from './apikeys.js';

const REQUEST_TIMEOUT_MS = 120000;

/** Turns an OpenRouter failure into one readable line. */
function friendlyError(error, model) {
  const message = String(error?.message || '');
  if (/"code":\s*401|UNAUTHENTICATED|No auth credentials|invalid.*api.*key/i.test(message)) {
    const err = new Error(
      'OpenRouter rejected the API key, so nothing was written. Open Settings, paste your OpenRouter key and save it (or fix OPENROUTER_API_KEY in server/.env).',
    );
    err.status = 401;
    return err;
  }
  if (/"code":\s*404|not a valid model|is not a supported model|model_not_found/i.test(message)) {
    const err = new Error(
      `OpenRouter has no model called ${model}. Model names there are written as provider/name - pick one of the names in Settings or add it to server/models.json.`,
    );
    err.status = 400;
    return err;
  }
  if (/"code":\s*402|insufficient.*credit|credit balance/i.test(message)) {
    const err = new Error(
      `OpenRouter has no credits left for ${model}. Choose a cheaper model in Settings, or add credit to your OpenRouter account.`,
    );
    err.status = 402;
    err.switchable = true;
    return err;
  }
  if (/"code":\s*429|rate.?limit|quota/i.test(message)) {
    const err = new Error('OpenRouter is out of requests too. Wait a minute and click Rewrite text.');
    err.status = 429;
    err.switchable = true;
    return err;
  }
  return error;
}

/**
 * Calls a model through OpenRouter's OpenAI-compatible gateway and returns the
 * parsed package JSON. Reached when the providers asked before it decline, or
 * first when one of its models is chosen in Settings. No response_format is
 * sent: the gateway routes to many models and not every one supports it, so the
 * answer is read back out of whatever the model wraps the JSON in.
 */
export async function callOpenRouterText(productName, brand, keywords, modelOverride, info) {
  const apiKey = await requireKey('openrouter');
  const model = modelOverride || (await resolveModel('openrouter'));

  let response;
  try {
    response = await withRetry(async () => {
      const res = await fetch(config.openrouter.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'X-Title': 'Listora',
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        body: JSON.stringify({
          model,
          temperature: 0.7,
          max_tokens: 8000,
          messages: [
            { role: 'system', content: buildSystemPrompt(productName, brand, keywords) },
            { role: 'user', content: `Create the complete listing package for: ${productName}${productBrief(info)}. Reply with the JSON object only.` },
          ],
        }),
      });
      const body = await res.text();
      if (!res.ok) {
        // The status is written in the provider's own shape so the retry and
        // failover rules, which read the message, classify it the same way.
        const err = new Error(`OpenRouter failed ("code": ${res.status}): ${body.slice(0, 400)}`);
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
    const err = new Error(`OpenRouter (${model}) returned an empty answer. Try again, or pick another model in Settings.`);
    err.status = 502;
    err.switchable = true;
    throw err;
  }

  return extractJson(content);
}
