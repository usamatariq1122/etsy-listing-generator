import { cachedKeywords, storeKeywords } from './db.js';

// Real buyer phrasing for the niche. Etsy's own suggestion call needs a browser
// session and a bot check, so it cannot be called from a server; these public
// autocomplete endpoints return the same kind of demand data and need no key.
const ENDPOINT = 'https://suggestqueries.google.com/complete/search';
const LENS = ['sh', 'general'];
const TTL_DAYS = 1;
const TIMEOUT = 5000;
const MAX_TERMS = 40;

// Extra seeds only when the product name does not already say it, so a query
// like "crochet bucket hat pattern" is not asked twice.
const QUALIFIERS = ['pattern', 'digital download', 'gift'];

// Autocomplete returns everything shoppers type, including queries that belong
// to another shop entirely. A marketplace tag must never name a rival channel,
// a place, or a price.
const OFF_PLATFORM =
  /\b(near me|nearby|amazon|walmart|ebay|temu|target|costco|argos|asda|online store|shop|store|website|wholesale|bulk|price|cheap|free download|in|nz|uk|usa|au|ie|ca|de|fr|pk|india|pakistan|australia|canada)\b/iu;

// Words expected to appear in a niche's suggestions without repeating. Anything
// else that shows up in only one suggestion reads as a character or brand
// ("frog bucket hat") and is dropped.
const GENERIC = new Set(
  'pattern patterns free pdf digital download instant printable tutorial instructions chart size kit set maker machine women men girls boys baby kids adult unisex for with and easy quick handmade custom gift ideas summer winter christmas wedding party large small mini boho modern minimalist vintage classic handmade diy decor decoration wall hanging home'.split(
    ' ',
  ),
);

const norm = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

// Marketplace tags hold 20 characters, so the useful queries are the short
// heads. Asking only the full product name usually returns phrases that are too
// long to be a tag, therefore the first two and three words are asked as well.
export function seedQueries(productName) {
  const base = String(productName ?? '').trim();
  if (!base) return [];
  const words = base.split(/\s+/);
  const core = words.slice(0, Math.min(2, words.length)).join(' ');
  const short = words.slice(0, Math.min(3, words.length)).join(' ');
  const lower = base.toLowerCase();
  const seeds = new Set([base, short, core]);
  for (const q of QUALIFIERS) {
    if (!lower.includes(q.split(' ')[0])) seeds.add(`${core} ${q}`);
  }
  return [...seeds].slice(0, 5);
}

async function fromCache(cacheKey) {
  return cachedKeywords(cacheKey, TTL_DAYS);
}

async function store(cacheKey, list) {
  // An empty answer is not worth caching: it would block a retry for a day.
  if (!list.length) return;
  await storeKeywords(cacheKey, list);
}

async function liveTerms(query, lens) {
  const ds = lens === 'sh' ? '&ds=sh' : '';
  const url = `${ENDPOINT}?client=firefox${ds}&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) });
  if (!res.ok) throw new Error(`suggestion lookup failed (${res.status})`);
  const body = JSON.parse(await res.text());
  return Array.isArray(body?.[1]) ? body[1] : [];
}

/** One seed through one lens, from cache when it is fresh. */
async function termsFor(query, lens) {
  const cacheKey = `${lens}|${query}`;
  const cached = await fromCache(cacheKey);
  if (cached) return cached;
  const live = await liveTerms(query, lens);
  await store(cacheKey, live);
  return live;
}

function dropBrandPhrases(terms, productName) {
  const named = new Set(norm(productName).split(' ').filter(Boolean));
  const count = new Map();
  for (const term of terms) {
    for (const word of term.split(' ')) {
      if (named.has(word) || GENERIC.has(word)) continue;
      count.set(word, (count.get(word) || 0) + 1);
    }
  }
  return terms.filter((term) =>
    term.split(' ').every((word) => named.has(word) || GENERIC.has(word) || (count.get(word) || 0) > 1),
  );
}

/**
 * Buyer queries for one product name. Every seed/lens pair is looked up in
 * parallel and cached in MySQL for a day, so a niche costs one round trip.
 * Never fatal: when the network is unavailable the listing generates from the
 * model's own judgement, exactly as before.
 */
export async function buyerQueries(productName) {
  const seeds = seedQueries(productName);
  const jobs = seeds.flatMap((seed) => LENS.map((lens) => termsFor(seed, lens)));

  let live = false;
  const results = await Promise.allSettled(jobs);
  const terms = [];
  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    live = true;
    for (const raw of result.value) {
      const term = norm(raw);
      if (!term || terms.includes(term) || OFF_PLATFORM.test(term)) continue;
      terms.push(term);
    }
  }

  const kept = dropBrandPhrases(terms, productName);
  return { terms: kept.slice(0, MAX_TERMS), seeds, source: live ? 'autocomplete' : 'none' };
}
