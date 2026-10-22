import { getFile } from './files.js';
import { imageKey } from './paths.js';
import { listProductImages, updateProduct } from './db.js';
import { listingFields } from './listingFields.js';
import { documentBytes } from './zip.js';
import { TEXT_FILES } from './documents.js';
import { HttpError } from './httperror.js';
import {
  createDraftListing,
  getListing,
  publishListing,
  shopId,
  updateListing,
  uploadListingFile,
  uploadListingImage,
} from './etsy.js';

// Turning a completed package into an Etsy listing, in the order Etsy's own
// documentation prescribes for a digital product: create the listing, attach the
// images, attach the PDF files, then mark it a download. It lands as a DRAFT.
//
// A draft is only made live when the seller explicitly publishes it (publishDraft
// below), so nothing goes on sale without a deliberate click. Either way the
// seller can still finish or unpublish in Etsy itself, where the listing is visible.

// Etsy's own required questions about a listing. Offered as a choice, never
// answered for the seller.
export const WHO_MADE = ['i_did', 'someone_else', 'collective'];
export const WHEN_MADE = [
  'made_to_order',
  '2020_2026',
  '2010_2019',
  '2007_2009',
  '2000_2006',
  '1990s',
  '1980s',
  '1970s',
  '1960s',
  '1950s',
  '1940s',
  '1930s',
  '1920s',
  '1910s',
  '1900s',
  '1800s',
  '1700s',
  'before_1700',
];

async function storedImages(product) {
  const rows = await listProductImages(product.id);
  const pairs = await Promise.all(
    rows.map(async (row) => {
      const bytes = await getFile(imageKey(product.id, row.file_name));
      // The ZIP packs in file-name order, which is slot order, so Etsy's image
      // rank ends up matching what the seller already saw in the manifest.
      return bytes ? { name: row.file_name, bytes, format: row.format } : null;
    }),
  );
  return pairs.filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
}

function draftFields(body, product, taxonomyId) {
  const listing = listingFields(product.file2_text);
  if (!listing.title) throw new HttpError('File 2 has no title for Etsy to use. Regenerate the listing text first.', 409);
  if (!listing.description) throw new HttpError('File 2 has no description for Etsy to use. Regenerate the listing text first.', 409);
  if (!product.price) throw new HttpError('Etsy requires a price, and only you set that. Enter one above first.', 409);

  const quantity = Number(String(body?.quantity ?? '').trim());
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new HttpError('Enter how many copies Etsy should list as available — a whole number of 1 or more.');
  }
  const whoMade = String(body?.whoMade ?? '').trim();
  const whenMade = String(body?.whenMade ?? '').trim();
  if (!WHO_MADE.includes(whoMade)) throw new HttpError('Choose who made the product — Etsy asks, and only you can answer.');
  if (!WHEN_MADE.includes(whenMade)) throw new HttpError('Choose when the product was made — Etsy asks, and only you can answer.');

  return {
    listing,
    fields: {
      quantity,
      title: listing.title,
      description: listing.description,
      price: Number(product.price),
      who_made: whoMade,
      when_made: whenMade,
      taxonomy_id: taxonomyId,
      tags: listing.tags.slice(0, 13),
    },
  };
}

/**
 * Sends one package to Etsy. The listing id is stored as soon as Etsy has it, so
 * a failure half way through still leaves the seller with the draft link instead
 * of an orphan listing they cannot find.
 *
 * `resume` lets an interrupted send finish rather than start over: when a previous
 * attempt already created the listing (its id is stored) this re-attaches only what
 * is still missing to that same listing, so no second draft is ever made. Etsy
 * replaces an image uploaded at a rank it already has, so the images are simply
 * re-sent from rank 1; a digital file is appended, not replaced, so the first
 * `filesDone` already-uploaded files are skipped to avoid handing the buyer a
 * duplicate.
 */
export async function sendDraft(product, body, taxonomyId, { resume = null } = {}) {
  const { fields, listing } = draftFields(body, product, taxonomyId);
  const images = await storedImages(product);
  if (!images.length) {
    throw new HttpError('Upload at least the cover image — Etsy needs an image before a listing can be published.', 409);
  }

  // Everything above is checked before the shop is even looked up, so a missing
  // answer never costs a request to Etsy.
  const shop = await shopId();

  // A resume reuses the listing the first attempt made; a fresh send creates one.
  let listingId = resume?.listingId ?? null;
  let url = resume?.url ?? null;
  if (listingId) {
    await remember(product.id, listingId, url);
  } else {
    const created = await createDraftListing(shop, fields);
    listingId = created?.listing_id;
    if (!listingId) throw new HttpError('Etsy accepted the request but did not return a listing.', 502);
    url = created.url ?? null;
    await remember(product.id, listingId, url);
  }

  // Images overwrite by rank, so every rank is (re)sent and the count ends at the
  // full set. Digital files append rather than replace, so the `filesDone` the
  // first attempt already attached are skipped to avoid a duplicate for the buyer.
  const filesDone = resume ? Math.max(0, Number(resume.filesDone) || 0) : 0;
  const sent = { listingId, url, images: 0, files: filesDone, title: listing.title };
  try {
    for (const [index, image] of images.entries()) {
      await uploadListingImage(shop, listingId, {
        bytes: image.bytes,
        name: image.name,
        type: image.format === 'jpg' ? 'image/jpeg' : `image/${image.format}`,
        rank: index + 1,
      });
      sent.images = index + 1;
    }
    const files = TEXT_FILES.map((file) => ({ file, bytes: null, name: null }));
    for (const [index, entry] of files.entries()) {
      if (index < filesDone) continue;
      const found = await documentBytes(product, entry.file.key);
      if (!found.bytes) continue;
      await uploadListingFile(shop, listingId, { bytes: found.bytes, name: found.name, rank: index + 1 });
      sent.files = index + 1;
    }
    // Digital files can only be attached after the listing exists, so the
    // listing is switched to a download once they are on it.
    await updateListing(shop, listingId, { type: 'download' });
  } catch (error) {
    // Partially built: the draft is real and the seller has to be able to find
    // it, so the counts made so far travel with the plain-language error.
    error.draft = sent;
    throw error;
  }

  const read = await getListing(listingId, 'Images').catch(() => null);
  sent.verified = read ? { state: read.state, type: read.type, images: (read.images ?? []).length } : null;
  await remember(product.id, listingId, read?.url ?? sent.url);
  return sent;
}

async function remember(productId, listingId, url) {
  await updateProduct(productId, {
    etsy_listing_id: String(listingId),
    etsy_draft_url: url ? String(url).slice(0, 500) : null,
    etsy_synced_at: new Date().toISOString(),
  });
}

/**
 * Makes a package's existing Etsy draft live. Only reached when the seller
 * presses Publish — the draft path never calls this. Etsy still needs the
 * category's required attributes filled before it will accept `active`, so a
 * refusal is reported back in plain words rather than papered over.
 */
export async function publishDraft(product) {
  if (!product.etsy_listing_id) {
    throw new HttpError('Save the Etsy draft first — there is nothing to publish until the listing exists on Etsy.', 409);
  }
  const shop = await shopId();
  await publishListing(shop, product.etsy_listing_id);
  const read = await getListing(product.etsy_listing_id).catch(() => null);
  await remember(product.id, product.etsy_listing_id, read?.url ?? product.etsy_draft_url);
  return {
    listingId: product.etsy_listing_id,
    state: read?.state ?? 'active',
    url: read?.url ?? product.etsy_draft_url ?? null,
  };
}
