import { readScoped, writeScoped, clearScoped } from './scopedSettings.js';
import { WHEN_MADE, WHO_MADE } from './draft.js';

// The seller's standing answers to Etsy's required draft questions. Saved once
// in Settings, they let a finished package go to a draft in a single click
// instead of re-typing the same four answers every listing. Price, category and
// the images stay per-listing — Etsy needs a real price and at least one image
// before a draft can exist, and only the seller sets those.
//
// These are stored the same scoped way as the brand and the PDF theme, so a
// solo run keeps one shared set and a signed-in account can have its own.

const SETTING = 'etsy_defaults';
const MAX_CATEGORY = 200;

const EMPTY = { category: '', quantity: '', whoMade: '', whenMade: '' };

function safeParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/** Whatever was saved, trimmed to the four known fields; missing ones stay blank. */
function normalise(raw) {
  const saved = typeof raw === 'string' ? safeParse(raw) : raw;
  if (!saved || typeof saved !== 'object') return { ...EMPTY };
  return {
    category: String(saved.category ?? '').trim().slice(0, MAX_CATEGORY),
    quantity: String(saved.quantity ?? '').trim().replace(/\D/g, '').slice(0, 9),
    whoMade: WHO_MADE.includes(saved.whoMade) ? saved.whoMade : '',
    whenMade: WHEN_MADE.includes(saved.whenMade) ? saved.whenMade : '',
  };
}

export async function etsyDefaults() {
  return normalise((await readScoped(SETTING)).value);
}

/**
 * Every field is optional here — a partly-filled set is a valid choice, because
 * anything left blank simply is not pre-filled and the seller answers it in the
 * Etsy panel as before. Only a value that is present but wrong is refused.
 */
export function etsyDefaultIssues(body) {
  const issues = [];
  if (!body || typeof body !== 'object') return ['Nothing to save.'];

  const category = String(body.category ?? '').trim();
  if (category.length > MAX_CATEGORY) issues.push(`A category name is too long (max ${MAX_CATEGORY} characters).`);

  const quantity = String(body.quantity ?? '').trim();
  if (quantity) {
    if (!/^\d+$/.test(quantity) || Number(quantity) < 1) {
      issues.push('Copies available must be a whole number of 1 or more.');
    }
  }

  const whoMade = String(body.whoMade ?? '').trim();
  if (whoMade && !WHO_MADE.includes(whoMade)) issues.push('Choose who made the product from the list.');

  const whenMade = String(body.whenMade ?? '').trim();
  if (whenMade && !WHEN_MADE.includes(whenMade)) issues.push('Choose when the product was made from the list.');

  return issues;
}

export async function saveEtsyDefaults(body) {
  const defaults = normalise(body);
  await writeScoped(SETTING, JSON.stringify(defaults));
  return defaults;
}

export async function clearEtsyDefaults() {
  await clearScoped(SETTING);
  return { ...EMPTY };
}
