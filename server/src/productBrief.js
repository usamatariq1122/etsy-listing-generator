// The seller-typed product brief. It never touches the product name (which seeds
// the keyword lookup and the title), so it is added to the model's user turn only.
// Labels match ProductForm.jsx; a blank field simply leaves its line out.
import { scrubBannedWord } from './validate.js';

const FIELD_LABELS = [
  ['audience', 'Target buyer'],
  ['occasion', 'Occasion or season'],
  ['language', 'Product language'],
  ['benefits', 'Main benefits'],
  ['contents', 'What is included'],
  ['skillLevel', 'Skill level'],
  ['materials', 'Materials or tools'],
  ['finishedSize', 'Finished size or specs'],
  ['intendedUse', 'Intended use'],
  ['notes', 'Internal notes'],
];

/** The keys the seller may save, so an unknown field never reaches the row. */
export const PRODUCT_INFO_KEYS = FIELD_LABELS.map(([key]) => key);

/**
 * Cleans the seller's free text before it is stored: only the known keys, trimmed
 * and length-capped, and with the marketplace word scrubbed out of every value,
 * because this brief feeds the model and a printed file must never carry it.
 */
export function normalizeProductInfo(incoming) {
  const source = incoming && typeof incoming === 'object' ? incoming : {};
  const info = {};
  for (const [key] of FIELD_LABELS) {
    const value = String(source[key] ?? '').trim().slice(0, 500);
    info[key] = value ? scrubBannedWord(value).text : '';
  }
  return info;
}

/** True when the seller filled at least one field, so an empty save stays NULL. */
export function hasProductInfo(info) {
  return PRODUCT_INFO_KEYS.some((key) => String(info?.[key] ?? '').trim());
}

/** Turns the stored product_info object into the block the text model is given. */
export function productBrief(info) {
  if (!info || typeof info !== 'object') return '';
  const lines = FIELD_LABELS
    .map(([key, label]) => {
      const raw = info[key];
      const value = typeof raw === 'string' ? raw.trim() : '';
      return value ? `- ${label}: ${value}` : '';
    })
    .filter(Boolean);
  if (!lines.length) return '';
  return `\n\nProduct details from the seller - make the listing match these exactly and never contradict or invent over them:\n${lines.join('\n')}`;
}

