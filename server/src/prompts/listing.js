// The mechanics of the locked listing brief. The wording itself is the one piece
// of text the repository never carries: a local run reads prompts/wording.js
// (git-ignored, made by npm run setup) while a hosted deployment reads the same
// text from Netlify Blobs, because a checkout only ever holds the stand-in in
// prompts/wording.example.js. Nothing serves the brief to the browser and no
// route can edit it.
import { getStore } from '@netlify/blobs';
import { config } from '../config.js';
import { BANNED_WORD } from '../rules.js';
import { LISTING_WORDING } from './wording.js';

const STORE_NAME = 'listora-locked';
const WORDING_KEY = 'listing-wording';

/** The brief installed on this deployment, or a clear failure. */
async function hostedWording() {
  const entry = await getStore({ name: STORE_NAME, consistency: 'strong' }).get(WORDING_KEY);
  if (!entry) {
    throw new Error('The listing brief is not installed on this deployment. Upload it to the "listora-locked" blob store as "listing-wording".');
  }
  return String(entry);
}

/** The stored wording: Blobs on a deployment, the git-ignored local file off one. */
export const lockedWording = () => (config.deployed ? hostedWording() : Promise.resolve(LISTING_WORDING));

/** The built-in buyer-query guidance, kept out of the model's own wording. */
function keywordBlock(keywords = []) {
  const list = (keywords || []).filter((t) => typeof t === 'string' && t.trim()).slice(0, 30);
  if (!list.length) return '';
  return `\n\nBuyer queries for this niche, in priority order - real shoppers type these exact words:\n${list
    .map((t) => `- ${t}`).join('\n')}\n\nUse them as the keyword source for Deliverable 2: open the SEO Title with the first; copy tags straight from the list whenever an entry is 20 characters or fewer; invent a tag only when nothing fits; never add a qualifier ("cute", "trendy") that none of these carry.`;
}

/**
 * The locked system prompt for one generation. The brief carries the
 * {{keywords}}, {{brand}}, {{product}} and {{banned_word}} tokens; a wording
 * without the keywords marker gets the block appended, so the buyer queries
 * never silently drop out of the prompt.
 */
export async function buildListingSystemPrompt(productName, brand, keywords = []) {
  const name = String(brand ?? '').trim() || 'none';
  const block = keywordBlock(keywords);
  const body = await lockedWording();
  const withKeywords = body.includes('{{keywords}}')
    ? body.replaceAll('{{keywords}}', block)
    : `${body}${block}`;
  return withKeywords
    .replaceAll('{{product}}', String(productName ?? ''))
    .replaceAll('{{brand}}', name)
    .replaceAll('{{banned_word}}', BANNED_WORD);
}

/** The structured user turn: exactly the fields the brief says to send. */
export function buildListingUserMessage({ productName, patternText, commercialLicense, formatMode, keywords = [], details = '' }) {
  const payload = {
    product_name: String(productName ?? ''),
    pattern_text: String(patternText ?? ''),
    commercial_license: Boolean(commercialLicense),
    format_mode: formatMode === 'format_only' ? 'format_only' : 'none',
    keywords: (keywords || []).filter(Boolean).slice(0, 30),
  };
  const block = JSON.stringify(payload, null, 2);
  return details ? `${block}\n\nExtra seller details - make the listing match these and never contradict them:\n${details}` : block;
}
