import { consumeGeneration, getProduct, updateProduct } from './db.js';
import { removeDocuments, writeDocuments } from './zip.js';
import { generateListingText } from './service.js';
import { onNetlify } from './files.js';
import { ownerOf } from './paths.js';
import { runAs, setPromptBody } from './requestContext.js';
import { canGenerate, limitMessage, usageFor } from './quota.js';
import { templateBody } from './promptTemplates.js';

/** The message the seller sees when a generation attempt does not finish. */
function describe(error) {
  const raw = error?.message || 'Something went wrong.';
  if (!raw.startsWith('{"error"')) return raw;
  try {
    const parsed = JSON.parse(raw);
    const providerError = parsed.error || {};
    const suffix = providerError.code ? ` [${providerError.code}]` : '';
    return `${providerError.message || raw}${suffix}`;
  } catch {
    return raw;
  }
}

/**
 * Writes the listing text for a queued product. Runs inside a Netlify background
 * function when hosted, and in the local process otherwise, so the wait is never
 * bound to one HTTP request.
 */
export async function runGeneration(id) {
  // Every account's listings, keys, model choice and brand come from the owner
  // baked into the id, so nothing below has to be handed a user explicitly.
  return runAs(ownerOf(id), () => generate(id));
}

async function generate(id) {
  const product = await getProduct(id);
  if (!product) return null;

  // Hand the text model this product type's customised brief, if the owner saved
  // one; with none primed the built-in masterPrompt wording is used, so an unset
  // or unowned listing generates exactly as it did before templates existed.
  setPromptBody(await templateBody(product.product_type));

  const owner = ownerOf(id);
  if (owner) {
    // Stop a generation the account has not earned a slot for, before the text
    // model is called, and leave the reason on the product the browser polls.
    const usage = await usageFor(owner);
    if (!canGenerate(usage)) {
      await updateProduct(id, {
        status: 'failed',
        warnings: { ...(product.warnings || {}), error: limitMessage(usage), issues: [], status: 429 },
      });
      return null;
    }
  }

  await updateProduct(id, { status: 'generating' });
  try {
    // Charge the attempt to the daily counter the moment the model is asked.
    if (owner) await consumeGeneration(owner);
    const { result, cleaningNotes, seoWarnings, keywords, quality, seoCheck, attempts } = await generateListingText(
      product.product_name,
      product.selected_keywords || [],
      product.product_info || {},
    );
    // A short guide or a lite-model answer is flagged before anything is
    // printed, so no PDF appears as if nothing were wrong.
    if (!quality.notes.length) await writeDocuments({ id, product_name: product.product_name, ...result });
    else await removeDocuments({ id });

    return await updateProduct(id, {
      file1_text: result.file1_text,
      file2_text: result.file2_text,
      mockup_prompts: result.mockup_prompts,
      infographic_prompts: result.infographic_prompts,
      status: 'text',
      warnings: { ...(product.warnings || {}), cleaningNotes, seoWarnings, keywords, quality, seoCheck, attempts, error: null },
    });
  } catch (error) {
    await updateProduct(id, {
      status: 'failed',
      warnings: {
        ...(product.warnings || {}),
        error: describe(error),
        issues: error.issues || [],
        status: error.status || 500,
      },
    });
    return null;
  }
}

/**
 * Starts the work. On Netlify the caller has already reached the background
 * function, so there is nothing to schedule; locally the job runs in this
 * process and the caller polls for the result.
 */
export function startGeneration(id) {
  if (onNetlify()) return;
  setTimeout(() => {
    runGeneration(id).catch((error) => console.error('[generate]', error));
  }, 0);
}
