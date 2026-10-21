import { cachedTaxonomy, storeTaxonomy } from './db.js';
import { publicCall } from './etsy.js';
import { HttpError } from './httperror.js';

// Etsy will not accept a draft listing without a `taxonomy_id` — the category
// the listing lives in. The tree is public and changes rarely, so it is fetched
// once a day, flattened into leaf paths, and handed to the interface whole for
// it to filter locally. A seller typing "crochet" should not wait on a request
// per keystroke.

const CACHE_KEY = 'seller_taxonomy';
const CACHE_DAYS = 1;

/**
 * The tree arrives as nested nodes. Only the leaves are useful for picking,
 * because a listing must name one specific category; each keeps the names of its
 * parents so the picker can show "Craft Supplies > Patterns > Digital Patterns".
 */
function flatten(nodes, trail = [], out = []) {
  for (const node of nodes ?? []) {
    if (!node?.name) continue;
    const path = [...trail, node.name];
    const children = Array.isArray(node.children) ? node.children : [];
    if (children.length) flatten(children, path, out);
    else out.push({ id: Number(node.id), path });
  }
  return out;
}

async function fetchLeaves() {
  const payload = await publicCall('/v3/application/seller-taxonomy/nodes');
  const leaves = flatten(payload?.results ?? payload);
  if (!leaves.length) throw new Error('Etsy returned no categories.');
  return leaves;
}

/** Every leaf category, from the cache when it is less than a day old. */
export async function categoryTree() {
  const cached = await cachedTaxonomy(CACHE_KEY, CACHE_DAYS);
  if (cached?.length) return cached;
  const leaves = await fetchLeaves();
  await storeTaxonomy(CACHE_KEY, leaves);
  return leaves;
}

/**
 * The category id for a seller's choice. A number is taken as an id straight
 * from the picker; anything else has to name a category that really exists, so
 * a mistyped or invented one is refused instead of sending Etsy a bad draft.
 */
export async function resolveCategoryId(value) {
  const text = String(value ?? '').trim();
  if (!text) throw new HttpError('Choose an Etsy category for the listing.');
  const leaves = await categoryTree();
  if (/^\d+$/.test(text)) {
    const match = leaves.find((leaf) => leaf.id === Number(text));
    if (!match) throw new HttpError('That Etsy category id is not one Etsy offers right now.', 400);
    return match.id;
  }
  const wanted = text.toLowerCase();
  const match = leaves.find((leaf) => leaf.path.join(' > ').toLowerCase() === wanted);
  if (!match) throw new HttpError('Choose one of the categories the list offers.', 400);
  return match.id;
}
