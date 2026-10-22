import { listingFields } from './listingFields.js';
import { SEO_LIMITS, validateFileOne, validateFileTwo } from './validate.js';
import { listProductDocuments, listProductImages } from './db.js';
import { connection } from './etsy.js';
import { etsyDefaults } from './etsyDefaults.js';
import { resolveCategoryId } from './taxonomy.js';
import { TEXT_FILES } from './documents.js';

// The single backend verdict on whether one listing could go to Etsy. It reads
// only the stored state (File 1/2, price, images, PDFs, the saved shop answers)
// so the browser's own checker is a convenience, never the gate.
//
// It grades findings three ways, exactly as the brief asks:
//   error   - Etsy would refuse the draft; publishing must wait.
//   warning - the listing is submittable but the seller should look.
//   info    - a suggestion that changes nothing about whether it can go.
//
// Every finding names the section it belongs to so the UI can offer a direct fix.

export const SECTIONS = ['content', 'seo', 'price', 'images', 'files', 'etsy', 'shop'];

// The word count under which the guide counts as thin, kept in step with the
// generation quality flag that already uses 900.
const MIN_GUIDE_WORDS = 900;
// Etsy takes up to 13 tags; a listing under this is submittable but weak.
const HEALTHY_TAG_MIN = 10;
const HEALTHY_IMAGE_MIN = 4;

const chars = (value) => [...String(value ?? '').trim()].length;
const words = (text) => (String(text ?? '').trim().split(/\s+/).filter(Boolean).length);

/** One graded finding. */
const at = (level, section, message, extra = {}) => ({ level, section, message, ...extra });

/**
 * The verdict from already-gathered facts. Pure and synchronous so it can be
 * unit tested without a database, Etsy or the file store.
 */
export function assessListing(facts) {
  const errors = [];
  const warnings = [];
  const info = [];

  const listing = facts.listing || { title: '', tags: [], description: '', attributes: [] };
  const tags = Array.isArray(listing.tags) ? listing.tags : [];
  const titleChars = chars(listing.title);

  // --- Content: the two documents and File 2's listing fields. ---
  if (!facts.hasFile1) {
    errors.push(at('error', 'content', 'The product guide is missing. Generate the listing text first.'));
  } else if (!facts.hasFile2) {
    errors.push(at('error', 'content', 'The listing and SEO package is missing. Generate the listing text first.'));
  }
  if (facts.file2Issues?.length) {
    errors.push(at('error', 'content', facts.file2Issues[0], { count: facts.file2Issues.length }));
  }
  if (facts.file1Issues?.length) {
    // The pipeline cleans File 1, so anything left is a review point, not a block.
    warnings.push(...facts.file1Issues.map((message) => at('warning', 'content', message)));
  }
  if (!String(listing.description ?? '').trim()) {
    errors.push(at('error', 'content', 'Etsy needs a description and this listing has none. Regenerate or add one.'));
  }
  if (facts.guideWords && facts.guideWords < MIN_GUIDE_WORDS && !facts.hasQualityFlag) {
    warnings.push(at('warning', 'content', `The guide is ${facts.guideWords} words, under the ${MIN_GUIDE_WORDS}-word brief.`));
  }
  if (facts.productType === 'crochet') {
    warnings.push(at('warning', 'content', 'Etsy now restricts AI-generated functional guides such as patterns. Confirm this is your own design and you have reviewed and edited the guide before listing it — a purely AI-written pattern is not allowed.'));
  }

  // --- SEO: title and tags against Etsy's own field limits. ---
  if (!titleChars) {
    errors.push(at('error', 'seo', 'The SEO title is empty. Etsy lists need one.'));
  } else if (titleChars > SEO_LIMITS.titleMax) {
    errors.push(at('error', 'seo', `The SEO title is ${titleChars} characters; Etsy's limit is ${SEO_LIMITS.titleMax}.`));
  }

  const tooLong = tags.filter((tag) => chars(tag) > SEO_LIMITS.tagMax);
  if (tooLong.length) {
    errors.push(at('error', 'seo', `${tooLong.length} tag(s) go over ${SEO_LIMITS.tagMax} characters; Etsy trims them out. Shorten them before saving the draft.`, { tags: tooLong }));
  }
  if (tags.length > SEO_LIMITS.tagCount) {
    errors.push(at('error', 'seo', `There are ${tags.length} tags; Etsy accepts at most ${SEO_LIMITS.tagCount}.`));
  }
  const seen = new Set();
  const duplicates = tags.filter((tag) => {
    const key = String(tag).trim().toLowerCase();
    if (!key || seen.has(key)) return true;
    seen.add(key);
    return false;
  });
  if (duplicates.length) {
    warnings.push(at('warning', 'seo', `Repeated tag(s): ${duplicates.map((tag) => `"${tag}"`).join(', ')}. Etsy reads them as one.`));
  }
  if (tags.length === 0) {
    warnings.push(at('warning', 'seo', 'No search tags yet — Etsy search relies on them.'));
  } else if (tags.length < HEALTHY_TAG_MIN) {
    warnings.push(at('warning', 'seo', `Only ${tags.length} tags filled; ${SEO_LIMITS.tagCount} use the whole field.`));
  }

  // --- Price. Currency always comes from the shop, so it is only information. ---
  const price = Number(facts.price);
  if (!facts.price || Number.isNaN(price) || price <= 0) {
    errors.push(at('error', 'price', 'Etsy needs a price above zero, and only you set it. Add one above.'));
  } else {
    info.push(at('info', 'price', `Charged in your shop's currency (${price.toFixed(2)}). Change the currency in Etsy, not here.`));
  }

  // --- Images: Etsy needs a picture, and now at least one unedited real photo. ---
  const imageCount = facts.imageCount || 0;
  const realImageCount = facts.realImageCount ?? imageCount;
  if (imageCount < 1) {
    errors.push(at('error', 'images', 'Upload at least the cover image — Etsy refuses a listing with no picture.'));
  } else if (realImageCount < 1) {
    errors.push(at('error', 'images', 'Etsy needs at least one unedited, real photo of the actual item against a real background. Every image here is AI-generated — upload a real photo before the draft.'));
  } else if (imageCount < HEALTHY_IMAGE_MIN) {
    warnings.push(at('warning', 'images', `${imageCount} of ${HEALTHY_IMAGE_MIN}+ images. More photos lift conversion; use the free prompts to fill the slots.`));
  }

  // --- Digital files: a download listing has to carry the product itself. ---
  const fileCount = facts.documentCount || 0;
  if (facts.requireFiles === false) {
    // On the submission path the two PDFs are re-rendered from the stored text
    // as the draft is built, so a package that has not been zipped yet is not a
    // blocker there. Every other surface keeps the file check on.
  } else if (fileCount < 1) {
    errors.push(at('error', 'files', 'No product file is attached yet. This is a digital listing — Etsy needs at least one buyer file.'));
  } else if (fileCount < TEXT_FILES.length) {
    warnings.push(at('warning', 'files', `Only ${fileCount} of ${TEXT_FILES.length} PDFs are in the package. Regenerate the text or add the missing file.`));
  }

  // --- Etsy shop connection and its required questions. ---
  const etsy = facts.etsy || { enabled: false, connected: false };
  if (!etsy.enabled) {
    errors.push(at('error', 'shop', 'Etsy is switched off for this account, so no draft can be made. Turn it on under Settings.'));
  } else if (!etsy.connected) {
    errors.push(at('error', 'shop', 'Connect your Etsy shop before saving a draft.'));
  }

  const defaults = facts.defaults || {};
  const answers = facts.answers || defaults;
  if (etsy.connected) {
    if (!String(answers.quantity ?? '').trim()) {
      errors.push(at('error', 'etsy', 'Etsy asks how many copies are available. Set the quantity in the Etsy panel.'));
    }
    if (!answers.whoMade) {
      errors.push(at('error', 'etsy', 'Etsy asks who made the product. Answer it in the Etsy panel (save it as a default to skip next time).'));
    }
    if (!answers.whenMade) {
      errors.push(at('error', 'etsy', 'Etsy asks when the product was made. Answer it in the Etsy panel.'));
    }
    const category = String(answers.category ?? '').trim();
    if (!category) {
      warnings.push(at('warning', 'etsy', 'No category chosen yet. Etsy drafts usually need one — pick it in the Etsy panel.'));
    } else if (facts.categoryResolvable === false) {
      errors.push(at('error', 'etsy', `The saved category "${category}" is not one Etsy recognises right now. Choose it again in the Etsy panel.`));
    } else if (facts.categoryResolvable === null) {
      warnings.push(at('warning', 'etsy', `Category "${category}" is set but not yet confirmed against Etsy's list — review it before the draft.`, { needsReview: true }));
    }
  }

  // --- Optional niceties that never block. ---
  if (!facts.briefProvided) {
    info.push(at('info', 'content', 'Product details were left blank, so the model guessed the buyer, sizes and contents. Filling them in makes the listing more accurate.'));
  }
  if (facts.seoCheck && typeof facts.seoCheck.score === 'number' && facts.seoCheck.score < 60) {
    warnings.push(at('warning', 'seo', `SEO checklist scored ${facts.seoCheck.score}/100 — the main keyword may be missing from the title or first lines.`));
  }

  const findings = [...errors, ...warnings, ...info];
  return {
    ready: errors.length === 0,
    errors,
    warnings,
    info,
    findings,
    summary: {
      content: facts.hasFile1 && facts.hasFile2 && String(listing.description ?? '').trim() ? 'complete' : 'incomplete',
      seo: titleChars && tags.length ? `title ${titleChars}/${SEO_LIMITS.titleMax}, ${tags.length} tag(s)` : 'needs title and tags',
      price: price > 0 ? price.toFixed(2) : 'missing',
      images: `${imageCount} uploaded`,
      files: `${fileCount} of ${TEXT_FILES.length} PDFs`,
      category: String(answers.category ?? '').trim() ? 'set' : 'needs review',
      shop: etsy.connected ? 'connected' : etsy.enabled ? 'not connected' : 'off',
    },
  };
}

/**
 * Reads the stored listing and gathers the facts assessListing needs, then grades
 * them. Etsy's category resolution is only attempted when a shop is connected and
 * a category is saved, so this never reaches the network on a plain draft-less
 * listing.
 *
 * `options.answers` overrides the saved standing answers for one grading - the
 * submission path passes the seller's per-listing choices merged over the
 * defaults, so the gate judges exactly what this draft would send.
 * `options.requireFiles` (default true) turns the "no buyer file attached" blocker
 * off where the pipeline re-renders the PDFs itself, as the draft path does.
 */
export async function validateListing(product, options = {}) {
  const { answers: answerOverride = null, requireFiles = true } = options;
  const listing = listingFields(product.file2_text);
  const file1Issues = product.file1_text ? validateFileOne(product.file1_text) : [];
  const file2Issues = product.file2_text ? validateFileTwo(product.file2_text) : [];
  const [images, documents, etsy, savedDefaults] = await Promise.all([
    listProductImages(product.id),
    listProductDocuments(product.id),
    connection(),
    etsyDefaults(),
  ]);
  const defaults = answerOverride || savedDefaults;

  let categoryResolvable = null;
  const category = String(defaults.category ?? '').trim();
  if (etsy.connected && category) {
    try {
      categoryResolvable = Boolean(await resolveCategoryId(category));
    } catch {
      categoryResolvable = false;
    }
  }

  const quality = product.warnings?.quality;
  return assessListing({
    productName: product.product_name,
    productType: product.product_type,
    hasFile1: Boolean(product.file1_text),
    hasFile2: Boolean(product.file2_text),
    file1Issues,
    file2Issues,
    guideWords: words(product.file1_text),
    hasQualityFlag: Boolean(quality?.notes?.length),
    listing,
    price: product.price,
    imageCount: images.length,
    realImageCount: images.filter((image) => (image.source ?? 'upload') !== 'generate').length,
    documentCount: documents.length,
    etsy,
    defaults,
    requireFiles,
    categoryResolvable,
    briefProvided: Object.values(product.product_info || {}).some((v) => String(v ?? '').trim()),
    seoCheck: product.warnings?.seoCheck ?? null,
  });
}

/** The plain-language blockers a submission path reports when validation fails. */
export function submissionErrors(validation) {
  return validation.errors.map((error) => error.message);
}
