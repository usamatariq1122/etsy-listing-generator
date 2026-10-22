import { callTextModel } from './textgen.js';
import { brandName } from './brand.js';
import { buyerQueries } from './keywords.js';
import { checkSeo } from './seoCheck.js';
import {
  alignSeo,
  applyBrandLicense,
  cleanFileOne,
  countBannedWord,
  groove,
  normalizeShape,
  repairSeo,
  seoIssues,
  shapeIssues,
  summarizeCleaning,
  validateFileOne,
  validateFileTwo,
} from './validate.js';

const MAX_TEXT_ATTEMPTS = 2;

// The brief asks for a 900-1,300 word guide. Under 900 words the seller is
// told, because a thin guide is the failure the free models produce most often.
const MIN_GUIDE_WORDS = 900;

const wordCount = (text) => String(text ?? '').trim().split(/\s+/).filter(Boolean).length;

/**
 * Reports how much trust the finished guide deserves: which provider and model
 * wrote it, whether that model is a short-answer one, and how long the guide
 * turned out.
 */
function guideQuality(provider, model, skipped, file1Text) {
  const words = wordCount(file1Text);
  const notes = [];
  if (provider === 'gemini' && /lite/i.test(model)) {
    notes.push(`${model} is the fast model: it answers sooner but writes shorter guides than the brief asks for.`);
  }
  if (words < MIN_GUIDE_WORDS) {
    notes.push(`File 1 came out at ${words} words, under the ${MIN_GUIDE_WORDS}-word minimum.`);
  }
  return { provider, model, words, notes, skipped };
}

/**
 * Generates the listing text. File 1 is cleaned first; only a broken File 1 or
 * File 2 costs a second model call, because a slow retry doubles the wait.
 * SEO limit breaches are fixed on the spot by repairSeo and reported as
 * warnings instead. The title and tags are checked against real buyer queries
 * for the niche: the ones the seller ticked when they ticked any, otherwise the
 * ones the autocomplete lookup returned. The finished fields then get scored.
 */
export async function generateListingText(productName, picked = [], info = null) {
  let lastIssues = [];
  const brand = await brandName();
  const live = picked.length ? null : await buyerQueries(productName);
  const terms = picked.length ? picked : live.terms;
  const keywords = picked.length
    ? { terms: picked, picked, seeds: [], source: 'picked' }
    : { ...live, picked: [] };

  for (let attempt = 1; attempt <= MAX_TEXT_ATTEMPTS; attempt += 1) {
    const { json: raw, provider, model, skipped } = await callTextModel(productName, brand, keywords.terms, info);
    const shape = normalizeShape(raw, { allow: [brand] });
    const cleaned = cleanFileOne(shape.file1_text);
    const repaired = repairSeo({ ...shape, file1_text: cleaned.text });
    const aligned = alignSeo(repaired.shape, keywords.terms);
    // A model that returns one long line would print as one solid block.
    const result = {
      ...aligned.shape,
      file1_text: applyBrandLicense(groove(aligned.shape.file1_text), brand),
      file2_text: groove(aligned.shape.file2_text),
    };

    const blocking = [
      ...validateFileOne(result.file1_text),
      ...validateFileTwo(result.file2_text),
      ...shapeIssues(result),
    ];
    const promptWords =
      countBannedWord(raw?.mockup_prompts) + countBannedWord(raw?.infographic_prompts);
    const seoWarnings = [...repaired.notes, ...aligned.notes, ...seoIssues(result)];
    const cleaningNotes = [
      ...summarizeCleaning(cleaned.removed),
      ...(promptWords ? [`removed the banned word ${promptWords} time(s) from the image prompts`] : []),
    ];
    const quality = guideQuality(provider, model, skipped, result.file1_text);
    const seoCheck = checkSeo({
      shape: result,
      file2Text: result.file2_text,
      picked,
      terms,
      productName,
    });

    if (!blocking.length) {
      return { result, cleaningNotes, seoWarnings, keywords, quality, seoCheck, attempts: attempt };
    }
    lastIssues = [...blocking, ...seoWarnings];
  }

  const err = new Error(
    `The text model returned output that still failed validation after ${MAX_TEXT_ATTEMPTS} attempts.`,
  );
  err.status = 422;
  err.issues = lastIssues;
  throw err;
}
