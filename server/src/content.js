import { getSetting, setSetting, deleteSetting } from './db.js';
import { BANNED_WORD, LEGACY_BRANDS } from './rules.js';
import { buildSystemPrompt } from './masterPrompt.js';

// The prompt and the scrubbing rules can be pasted into the running app
// (Settings → Listing prompt) instead of edited in a file. Files win on your
// own machine until something is saved; a hosted database starts empty, so the
// pasted copy is all it ever has. Nothing here is ever written to git.

const PROMPT = 'prompt.system';
const BANNED = 'rules.banned_word';
const LEGACY = 'rules.legacy_brands';

const CONTRACT_KEYS = [
  'file1_text', 'file2_text', 'seo_title', 'seo_tags', 'mockup_prompts', 'infographic_prompts',
];

const brandList = (value) => (Array.isArray(value) ? value : String(value ?? '').split(','))
  .map((name) => String(name).trim())
  .filter(Boolean);

const escapeRe = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const keywordLine = (keywords) => {
  const list = (keywords ?? []).filter(Boolean);
  if (!list.length) return '';
  return `Buyers also search for these phrases, so work them in where they read naturally: ${list.join(', ')}.`;
};

/** Live values the rest of the server reads, kept in step with the database. */
export const activeRules = {
  bannedWord: BANNED_WORD,
  // A test pattern, never a /g/ one: .test() on a global regex is stateful.
  bannedTest: new RegExp(escapeRe(BANNED_WORD), 'i'),
  legacyBrands: LEGACY_BRANDS,
};

/** A fresh find/replace pattern for the banned word, every time it is needed. */
export const bannedRe = () => new RegExp(escapeRe(activeRules.bannedWord), 'gi');

const savedBanned = async () => (await getSetting(BANNED))?.trim() || null;

export async function refreshRules() {
  const banned = await savedBanned();
  if (banned) {
    activeRules.bannedWord = banned;
    activeRules.bannedTest = new RegExp(escapeRe(banned), 'i');
  }
  const legacy = await getSetting(LEGACY);
  if (legacy != null) activeRules.legacyBrands = brandList(legacy);
  return activeRules;
}

/** What the Settings screen shows: the saved copy, or the file this machine loads. */
export async function promptSettings() {
  const saved = await getSetting(PROMPT);
  const banned = (await getSetting(BANNED))?.trim();
  const legacy = (await getSetting(LEGACY))?.trim();
  return {
    source: saved?.trim() ? 'saved in this app' : "this machine's prompt file",
    text: saved ?? '',
    usingFile: !saved?.trim(),
    bannedWord: banned || BANNED_WORD,
    legacyBrands: legacy == null ? LEGACY_BRANDS : brandList(legacy),
  };
}

export function promptIssues(text) {
  const value = String(text ?? '');
  if (!value.trim()) return ['Paste your master prompt first, or use “Use the file again” to go back to it.'];
  if (value.length > 30_000) return [`That is ${value.length} characters. The limit is 30,000.`];
  const missing = CONTRACT_KEYS.filter((key) => !value.includes(key));
  if (missing.length) {
    return [
      'The prompt must ask for the JSON keys this portal stores. Missing: '
        + `${missing.join(', ')}.`,
    ];
  }
  return [];
}

export async function savePrompt({ text, bannedWord, legacyBrands }) {
  await setSetting(PROMPT, String(text).trim());
  await setSetting(BANNED, String(bannedWord ?? '').trim() || BANNED_WORD);
  await setSetting(LEGACY, brandList(legacyBrands).join(', '));
  await refreshRules();
  return promptSettings();
}

export async function clearPrompt() {
  await deleteSetting(PROMPT);
  await deleteSetting(BANNED);
  await deleteSetting(LEGACY);
  activeRules.bannedWord = BANNED_WORD;
  activeRules.bannedTest = new RegExp(escapeRe(BANNED_WORD), 'i');
  activeRules.legacyBrands = LEGACY_BRANDS;
  return promptSettings();
}

/**
 * The system prompt for one generation. A prompt saved in the app is filled in
 * here: `{{brand}}`, `{{keywords}}` and `{{product}}` are replaced, and the
 * product line is appended when the text does not ask for it itself.
 */
export async function buildPrompt(productName, brand, keywords) {
  // Every generation starts here, so this is where the database rules are pulled
  // into the in-memory values the validator reads a moment later.
  await refreshRules();
  const saved = (await getSetting(PROMPT))?.trim();
  if (!saved) return buildSystemPrompt(productName, brand, keywords);

  const shop = String(brand ?? '').trim() || 'the shop';
  let text = saved
    .replaceAll('{{brand}}', shop)
    .replaceAll('{{keywords}}', keywordLine(keywords))
    .replaceAll('{{product}}', productName);
  if (!saved.includes('{{product}}')) text += `\n\nThe product to write for is: ${productName}.`;
  return text.trim();
}
