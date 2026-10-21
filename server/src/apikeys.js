import { decryptSecret, encryptSecret } from './secrets.js';
import { readScoped, writeScoped, clearScoped } from './scopedSettings.js';
import { config } from './config.js';
import { brandName } from './brand.js';
import { modelCatalog } from './modelCatalog.js';

export const PROVIDERS = ['gemini', 'anthropic', 'groq', 'openrouter'];
// The provider groups the Settings dropdown offers. Claude stays a .env choice.
const SELECTABLE = ['gemini', 'groq', 'openrouter'];

const settingKey = (provider) => `api_key.${provider}`;
const modelSetting = (provider) => `text_model.${provider}`;
// One dropdown across providers, so the choice remembers who serves the model.
const SELECTION = 'text_model.selected';
const ENV_KEYS = {
  gemini: () => config.gemini.apiKey,
  anthropic: () => config.anthropic.apiKey,
  groq: () => config.groq.apiKey,
  openrouter: () => config.openrouter.apiKey,
};
const envKey = (provider) => (ENV_KEYS[provider] ?? (() => ''))();
const ENV_VARS = { gemini: 'GEMINI_API_KEY', anthropic: 'ANTHROPIC_API_KEY', groq: 'GROQ_API_KEY', openrouter: 'OPENROUTER_API_KEY' };
const envVar = (provider) => ENV_VARS[provider] ?? 'API key';
const unusable = (key) => !key || /your-key-here/i.test(key);

const ENV_MODELS = {
  gemini: () => config.gemini.textModel,
  anthropic: () => config.anthropic.model,
  groq: () => config.groq.model,
  openrouter: () => config.openrouter.model,
};

// Groq can be asked first from the dropdown, but TEXT_PROVIDER still only
// picks the primary backend, and Claude has no fallback chain.
const TEXT_PROVIDERS = ['gemini', 'anthropic'];

export const activeProvider = () => (TEXT_PROVIDERS.includes(config.textProvider) ? config.textProvider : 'gemini');

/** The model to fall back on for a provider: the .env override, else the best listed one. */
async function defaultModel(provider) {
  const catalog = await modelCatalog();
  return (ENV_MODELS[provider]?.() ?? '').trim() || catalog[provider]?.models?.[0] || '';
}

/** The names the dropdown offers for a provider, best first. */
export async function modelChoices(provider) {
  const catalog = await modelCatalog();
  const list = catalog[provider]?.models ?? [];
  const preferred = await defaultModel(provider);
  return list.includes(preferred) ? list : [preferred, ...list];
}

/** The model saved for one provider, otherwise its default. */
export async function resolveModel(provider = activeProvider()) {
  const saved = (await readScoped(modelSetting(provider))).value?.trim() ?? '';
  return saved || (await defaultModel(provider));
}

/**
 * Which provider is asked first and with which model. A choice made in the
 * grouped dropdown wins; otherwise the older per-provider setting is honoured.
 */
export async function selectedModel() {
  const [provider, model] = ((await readScoped(SELECTION)).value ?? '').split('|');
  if (provider && model && (await modelChoices(provider)).includes(model)) return { provider, model };
  const gemini = (await readScoped(modelSetting('gemini'))).value?.trim() ?? '';
  if (gemini && (await modelChoices('gemini')).includes(gemini)) return { provider: 'gemini', model: gemini };
  return { provider: 'gemini', model: await defaultModel('gemini') };
}

export async function saveModel(provider, model) {
  const value = String(model ?? '').trim();
  if (!SELECTABLE.includes(provider)) {
    const err = new Error('Only a Gemini, Groq or OpenRouter model can be chosen here.');
    err.status = 400;
    throw err;
  }
  const choices = await modelChoices(provider);
  if (!choices.includes(value)) {
    const err = new Error(`Choose one of: ${choices.join(', ')}.`);
    err.status = 400;
    throw err;
  }
  await writeScoped(SELECTION, `${provider}|${value}`);
  return keyStatus();
}

export async function removeModel(provider) {
  await clearScoped(SELECTION);
  await clearScoped(modelSetting(provider));
  return keyStatus();
}

const mask = (key) => (key.length <= 8 ? '****' : `****${key.slice(-4)}`);

/**
 * Reads the key at call time so a key saved through the app takes effect on the
 * very next request, without restarting the backend. An account's own saved key
 * wins; otherwise the shared one this portal used before accounts; otherwise the
 * server's environment.
 */
export async function resolveKey(provider = activeProvider()) {
  const { value, scope } = await readScoped(settingKey(provider));
  const saved = (decryptSecret(value) ?? '').trim();
  const fromEnv = (envKey(provider) ?? '').trim();
  const key = saved || fromEnv;
  const source = saved ? scope : unusable(fromEnv) ? null : 'env';
  return { provider, key, source };
}

/** Whether a provider can be called at all, without throwing. */
export async function hasKey(provider) {
  const { key } = await resolveKey(provider);
  return !unusable(key);
}

/** The key the text model must be called with, or a message the UI can show. */
export async function requireKey(provider = activeProvider()) {
  const { key } = await resolveKey(provider);
  if (unusable(key)) {
    const err = new Error(
      `No ${provider} API key is set. Open Settings, paste your key under Access keys (or put it in server/.env as ${envVar(provider)}).`,
    );
    err.status = 503;
    err.code = 'missing_key';
    throw err;
  }
  return key;
}

// Each service hands out a visibly different key, so a paste into the wrong row
// can be caught here instead of turning into a confusing provider error later.
const WRONG_PREFIX = {
  gemini: { gsk_: 'Groq', 'sk-ant-': 'Anthropic', 'sk-or-': 'OpenRouter' },
  groq: { 'AQ.': 'Google AI Studio', AIza: 'Google AI Studio', 'sk-ant-': 'Anthropic', 'sk-or-': 'OpenRouter' },
  anthropic: { gsk_: 'Groq', 'AQ.': 'Google AI Studio', AIza: 'Google AI Studio', 'sk-or-': 'OpenRouter' },
  openrouter: { gsk_: 'Groq', 'sk-ant-': 'Anthropic', 'AQ.': 'Google AI Studio', AIza: 'Google AI Studio' },
};

/** Problems with a pasted key, so a typo is caught here instead of at generate time. */
export function keyIssues(provider, raw) {
  const key = String(raw ?? '').trim();
  if (!key) return ['Paste an API key first.'];
  if (/\s/.test(key)) return ['The key contains a space. Paste it without spaces or line breaks.'];
  if (key.length < 20) return [`That looks too short (${key.length} characters). A provider key is at least 20.`];
  if (!/^[\w.\-:]+$/.test(key)) return ['The key has characters that API keys never contain.'];
  const wrong = Object.entries(WRONG_PREFIX[provider] ?? {}).find(([prefix]) => key.startsWith(prefix));
  if (wrong) {
    return [`That key starts with ${wrong[0]}, which is ${wrong[1]}'s format. Save it in that row, not this one.`];
  }
  return [];
}

export async function saveKey(provider, raw) {
  await writeScoped(settingKey(provider), encryptSecret(String(raw).trim()));
  return keyStatus();
}

export async function removeKey(provider) {
  await clearScoped(settingKey(provider));
  return keyStatus();
}

/**
 * Which provider a generation starts with, and the providers whose missing key
 * stops any listing. Each dropdown provider covers for the others,
 * so only none-configured blocks the studio.
 */
export async function keyCoverage() {
  const status = await keyStatus();
  if (status.textProvider === 'anthropic') {
    return { askedFirst: 'anthropic', blocking: status.providers.anthropic.configured ? [] : ['anthropic'] };
  }
  const missing = SELECTABLE.filter((provider) => !status.providers[provider].configured);
  return { askedFirst: (await selectedModel()).provider, blocking: missing.length < SELECTABLE.length ? [] : missing };
}

/** What the Settings panel shows: never the whole key, only where it comes from. */
export async function keyStatus() {
  const catalog = await modelCatalog();
  const status = { brand: await brandName(), textProvider: config.textProvider, selected: await selectedModel(), groups: [], providers: {} };
  status.groups = SELECTABLE.filter((provider) => catalog[provider]).map((provider) => ({
    provider,
    label: catalog[provider].label,
    models: catalog[provider].models,
  }));
  for (const provider of PROVIDERS) {
    const { key, source } = await resolveKey(provider);
    status.providers[provider] = {
      configured: !unusable(key),
      source,
      hint: unusable(key) ? null : mask(key),
      envVar: envVar(provider),
    };
  }
  return status;
}
