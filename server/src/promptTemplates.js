import {
  deletePromptTemplate,
  getPromptTemplate,
  listPromptTemplates,
  upsertPromptTemplate,
} from './db.js';

// The product types a listing can be written for. These are just names and
// hints — no prompt wording lives here — so they are safe to ship in the public
// repository. The editable brief for each type is stored in the database only
// once a seller customises it; an unset type falls back to masterPrompt.js, so
// the wording itself never leaves that git-ignored file unless a person saves it.
export const PRODUCT_TYPES = [
  { value: 'general', label: 'Auto-detect', hint: 'infer the most likely digital product type from the product name' },
  { value: 'crochet', label: 'Crochet or knitting pattern', hint: 'yarn, hook or needle size, gauge, skill level and finished size' },
  { value: 'planner', label: 'Printable planner or journal', hint: 'page count, sizes, layouts and what is inside' },
  { value: 'svg', label: 'SVG or cut-file bundle', hint: 'file formats, cut-machine compatibility and commercial use' },
  { value: 'art', label: 'Printable wall art', hint: 'aspect ratios, print sizes, paper and framing' },
];

const KNOWN = new Set(PRODUCT_TYPES.map((type) => type.value));
const isKnown = (value) => KNOWN.has(value);
const MAX_BODY = 8000;

/** The catalogue entry a chosen value maps to, or null for "Auto" (general). */
export function resolveProductType(value) {
  const key = String(value ?? '').trim().toLowerCase();
  return isKnown(key) && key !== 'general' ? key : null;
}

export function templateIssues(value, body) {
  const issues = [];
  if (!isKnown(String(value ?? '').trim().toLowerCase())) {
    issues.push('Choose one of the listed product types.');
  }
  const text = String(body ?? '');
  if (!text.trim()) issues.push('The prompt cannot be empty.');
  else if (text.length > MAX_BODY) issues.push(`The prompt is too long (${text.length} characters; the limit is ${MAX_BODY}).`);
  return issues;
}

/**
 * The brief to hand the text model for one product type: the saved template when
 * this type has been customised, otherwise null so masterPrompt.js uses its
 * built-in wording. A database hiccup must never stop a generation, so a read
 * failure is swallowed and treated as "not customised".
 */
export async function templateBody(value) {
  const key = resolveProductType(value) ?? 'general';
  try {
    return await getPromptTemplate(key);
  } catch {
    return null;
  }
}

/** Every product type, marked only as customised or not. The prompt text itself
 *  is a locked server constant and is never returned here, so no surface can
 *  read it. */
export async function listTemplateTypes() {
  const saved = new Set();
  try {
    for (const row of await listPromptTemplates()) saved.add(row.product_type);
  } catch {
    // No table yet: every type reads as un-customised, matching the pipeline's
    // fallback to the locked brief.
  }
  return PRODUCT_TYPES.map((type) => ({
    value: type.value, label: type.label, hint: type.hint, customised: saved.has(type.value),
  }));
}

export async function saveTemplate(value, body) {
  const key = String(value ?? '').trim().toLowerCase();
  await upsertPromptTemplate(key, String(body));
}

export async function clearTemplate(value) {
  const key = String(value ?? '').trim().toLowerCase();
  return deletePromptTemplate(key);
}
