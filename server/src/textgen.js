import { config } from './config.js';
import { callClaude } from './claude.js';
import { callGeminiText } from './gemini.js';
import { callGroqText } from './groq.js';
import { callOpenRouterText } from './openrouter.js';
import { hasKey, modelChoices, resolveModel, selectedModel } from './apikeys.js';

// A saturated or exhausted model gives up within seconds, and the free tier
// counts quota per model, so the next one down often still answers. Anything
// else - a missing key, a malformed answer - is for the seller to fix, so it is
// never swallowed by a model chain.
const SWITCHABLE = /"code":\s*(429|502|503)|high demand|UNAVAILABLE|RESOURCE_EXHAUSTED|quota|rate limit|returned no text/i;

const worthAnotherModel = (error) => error?.switchable === true || SWITCHABLE.test(String(error?.message || ''));

/** The chosen model first, then the rest of the list from best to lite. */
export function modelChain(preferred, choices = []) {
  return [preferred, ...choices.filter((model) => model !== preferred)];
}

const cap = (text) => String(text).charAt(0).toUpperCase() + String(text).slice(1);

/**
 * Dispatches text generation to the provider chosen in Settings and hands the
 * job to the others when it declines: the Gemini models are walked from the
 * chosen one down to lite, Groq and OpenRouter are asked with their own selected
 * model. Resolves to the package JSON plus which provider and model wrote it and
 * which Gemini models had to be skipped, so the caller can say so out loud.
 */
export async function callTextModel(productName, brand, keywords = []) {
  if (config.textProvider === 'anthropic') {
    const model = await resolveModel('anthropic');
    return { json: await callClaude(productName, brand, keywords), provider: 'anthropic', model, skipped: [] };
  }

  const choice = await selectedModel();
  const skipped = [];
  const declined = [];
  /** Records why a provider could not take the job, then hands over to the next. */
  const note = (entry) => {
    declined.push({ called: true, status: 503, ...entry });
    return null;
  };

  async function viaGemini(preferred) {
    if (!(await hasKey('gemini'))) {
      return note({ who: 'Gemini', called: false, detail: 'no Gemini API key is saved, so its models were not asked' });
    }
    const chain = modelChain(preferred, await modelChoices('gemini'));
    for (const model of chain) {
      try {
        return { json: await callGeminiText(productName, brand, keywords, model), provider: 'gemini', model };
      } catch (error) {
        if (!worthAnotherModel(error)) {
          return note({ who: 'Gemini', called: false, detail: error.message, fatal: error, status: error.status });
        }
        skipped.push(model);
        console.warn(`[failover] ${model} is unavailable; trying the next Gemini model.`);
      }
    }
    return note({
      who: 'Gemini',
      detail: `All ${chain.length} Gemini models are busy or out of free requests (${chain.join(', ')}). Demand spikes usually pass within 15 minutes, and the free daily quota resets around 05:00.`,
    });
  }

  async function viaGroq(model) {
    const who = `Groq (${model})`;
    if (!(await hasKey('groq'))) {
      return note({ who, called: false, detail: 'no Groq API key is saved, so it was not asked' });
    }
    try {
      return { json: await callGroqText(productName, brand, keywords, model), provider: 'groq', model };
    } catch (error) {
      return note({ who, detail: error.message, status: error?.status });
    }
  }

  async function viaOpenRouter(model) {
    const who = `OpenRouter (${model})`;
    if (!(await hasKey('openrouter'))) {
      return note({ who, called: false, detail: 'no OpenRouter API key is saved, so it was not asked' });
    }
    try {
      return { json: await callOpenRouterText(productName, brand, keywords, model), provider: 'openrouter', model };
    } catch (error) {
      return note({ who, detail: error.message, status: error?.status });
    }
  }

  // The chosen provider is asked with the chosen model, then the others walk
  // down to their own default.
  const runners = { gemini: viaGemini, groq: viaGroq, openrouter: viaOpenRouter };
  const order = [choice.provider, ...Object.keys(runners).filter((provider) => provider !== choice.provider)];
  const attempts = order.map(
    (provider) => async () =>
      runners[provider](provider === choice.provider ? choice.model : await resolveModel(provider)),
  );

  for (const attempt of attempts) {
    const hit = await attempt();
    if (hit) return { ...hit, skipped };
  }

  // Only one provider could be contacted and it failed for a reason the seller
  // has to fix, so report that as it is instead of wrapping it in a summary.
  const fatal = declined.find((entry) => entry.fatal);
  if (fatal && !declined.some((entry) => entry !== fatal && entry.called)) throw fatal.fatal;

  const [lead, ...rest] = declined;
  const tail = rest.map((entry) => `Then ${entry.who}: ${entry.detail}`).join(' ');
  const err = new Error(`No provider wrote the listing. ${cap(lead.detail)}${tail ? ` ${tail}` : ''}`);
  err.status = declined.find((entry) => entry.status === 401)?.status ?? 503;
  throw err;
}
