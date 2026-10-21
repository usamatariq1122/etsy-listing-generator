import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const SERVER_ROOT = path.resolve(here, '..');
export const DATA_DIR = path.join(SERVER_ROOT, 'data');

// Keys are the portable name for where a file lives. With accounts they are
// namespaced by owner: `users/<uid>/products/<pid>/...`. The owner travels inside
// the product id itself — `<uid>:<pid>` — so every key below is scoped without
// the generation pipeline having to pass a user around. A legacy id with no
// colon is an ownerless row from before accounts, kept readable under the old
// `products/...` prefix.

export const OWNER_SEPARATOR = ':';

/** A listing id for one account: the owner's id, a separator, then a fresh uuid. */
export const ownedId = (userId, rawId) => `${userId}${OWNER_SEPARATOR}${rawId}`;

/** The owner baked into a listing id, or null for a pre-account (bare) id. */
export function ownerOf(id) {
  if (typeof id !== 'string') return null;
  const index = id.indexOf(OWNER_SEPARATOR);
  if (index === -1) return null;
  const owner = id.slice(0, index);
  return isSafeSegment(owner) ? owner : null;
}

/** Everything after the owner, i.e. the id without its namespace prefix. */
export function innerIdOf(id) {
  if (typeof id !== 'string') return id;
  const index = id.indexOf(OWNER_SEPARATOR);
  return index === -1 ? id : id.slice(index + 1);
}

const isSafeSegment = (value) => typeof value === 'string' && /^[a-zA-Z0-9-]{1,64}$/.test(value);

// Accepts either an owned id (`<uid>:<pid>`) or a legacy bare id. The segments
// stay inside the character set that can never traverse a path.
export const isSafeId = (id) => {
  if (typeof id !== 'string' || !id || id.length > 129) return false;
  const index = id.indexOf(OWNER_SEPARATOR);
  if (index === -1) return isSafeSegment(id);
  const tail = id.slice(index + 1);
  return isSafeSegment(id.slice(0, index)) && isSafeSegment(tail) && !tail.includes(OWNER_SEPARATOR);
};

// The folder a product's files live in, from its (possibly owned) id.
export const productPrefix = (id) => {
  const owner = ownerOf(id);
  return owner ? `users/${owner}/products/${innerIdOf(id)}/` : `products/${id}/`;
};
export const zipKey = (id) => `${productPrefix(id)}listing-package.zip`;
export const documentKey = (id, fileName) => `${productPrefix(id)}${fileName}`;

// A PDF the seller uploaded lives beside the generated one, under the same file
// name, so dropping the upload falls back to what the portal rendered.
export const uploadPrefix = (id) => `${productPrefix(id)}uploads/`;
export const uploadedDocumentKey = (id, fileName) => `${uploadPrefix(id)}${fileName}`;

// Uploaded listing images live in their own folder so they never collide with
// the generated PDFs, and so the ZIP can name each entry after its slot.
export const imagePrefix = (id) => `${productPrefix(id)}images/`;
export const imageKey = (id, fileName) => `${imagePrefix(id)}${fileName}`;
