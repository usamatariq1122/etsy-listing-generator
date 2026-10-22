import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// The GET /products/:id/validation route, driven in-process. The running
// `netlify dev` bundle does not hot-reload server/src/**, so curling the local
// server would exercise a stale build and prove nothing about the current
// source. Instead the router is imported here (which loads the real validateListing
// + assessListing) and its outside world - the database, Etsy and the taxonomy -
// is faked. That way the route's behaviour is observed against the code as it is
// on disk right now.

process.env.ETSY_ENABLED = 'true';
process.env.ETSY_KEYSTRING = 'test-keystring';
process.env.ETSY_SHARED_SECRET = 'test-secret';
delete process.env.NETLIFY;
delete process.env.LAMBDA_TASK_ROOT;

let images = [];
let documents = [];
let shop = { enabled: true, connected: true, shopName: 'TestShop' };
let defaults = { category: 'Crochet', quantity: '10', whoMade: 'i_did', whenMade: '2020_2026' };
let categoryResolvable = 99;
let current = null;

const noop = async () => null;
mock.module('../src/db.js', {
  namedExports: {
    initDb: noop, getSetting: noop, setSetting: noop, deleteSetting: noop,
    listSettings: async () => [], createUser: noop, getUserByEmail: noop, getUserById: noop,
    countUsers: async () => 1, getFirstAdmin: noop, updateUser: noop, consumeGeneration: noop,
    generationsToday: async () => ({ role: 'user', today: 0 }), listUsers: async () => [],
    adminUsers: async () => [], adminTotals: async () => ({ users: 1, products: 0, failed: 0 }),
    adminFailed: async () => [], createSessionRow: noop, getSessionUser: noop,
    deleteSessionRow: noop, deleteSessionsForUser: noop, storeVerification: noop,
    consumeVerification: noop, createProduct: noop, getProduct: noop,
    getProductForUser: async () => current, listProducts: async () => [], updateProduct: noop,
    deleteProduct: async () => false, clearProducts: async () => 0, clearProductsForUser: async () => 0,
    claimEtsyDraft: noop, claimEtsyResume: noop, releaseEtsyDraft: noop, DRAFT_CLAIM: '__etsy_draft_in_progress__',
    saveProductImage: noop, listProductImages: async () => images, getProductImage: noop,
    deleteProductImage: async () => false, saveProductDocument: noop,
    listProductDocuments: async () => documents, getProductDocument: noop,
    deleteProductDocument: async () => false, cachedKeywords: noop, storeKeywords: noop,
    cachedTaxonomy: noop, storeTaxonomy: noop, createBulkJob: noop, insertBulkRow: noop,
    getBulkJob: noop, listBulkJobs: async () => [], listBulkRows: async () => [], getBulkRow: noop,
    updateBulkRow: noop, resetFailedRows: async () => [], deleteBulkJob: async () => false,
    listPromptTemplates: async () => [], getPromptTemplate: noop, upsertPromptTemplate: noop,
    deletePromptTemplate: async () => false,
  },
});

mock.module('../src/taxonomy.js', {
  namedExports: {
    categoryTree: async () => [],
    resolveCategoryId: async () => categoryResolvable,
  },
});

mock.module('../src/etsy.js', {
  namedExports: {
    authorizeUrl: noop,
    completeConnect: noop,
    connection: async () => shop,
    disconnect: noop,
    etsyReady: async () => false,
  },
});

mock.module('../src/etsyDefaults.js', {
  namedExports: {
    clearEtsyDefaults: noop,
    etsyDefaultIssues: async () => [],
    etsyDefaults: async () => defaults,
    saveEtsyDefaults: noop,
  },
});

mock.module('../src/draft.js', {
  namedExports: {
    WHO_MADE: ['i_did', 'someone_else', 'i_did_and_designed'],
    WHEN_MADE: ['2020_2026', 'before_2020'],
    publishDraft: noop,
    sendDraft: noop,
  },
});

const { handleApi } = await import('../src/api.js');

// A complete, well-formed File 2: title, thirteen in-limit tags and a
// description, all read back by listingFields.
const FILE2 = [
  '1. SEO Title: Crochet Hat Pattern Beginner Friendly Beanie',
  '',
  '2. 13 SEO Tags:',
  '- crochet hat pattern',
  '- beginner crochet',
  '- crochet pdf',
  '- hat tutorial',
  '- easy crochet',
  '- handmade hat',
  '- crochet pattern',
  '- winter hat',
  '- crochet beanie',
  '- crochet gift',
  '- download crochet',
  '- crochet instructions',
  '- yarn hat pattern',
  '',
  '3. Description:',
  'This crochet hat pattern is a beginner friendly PDF with step by step photos.',
  'Make a warm winter beanie in an afternoon using only basic stitches and worsted yarn.',
].join('\n');

// Long enough to clear the thin-guide check, clean of brackets/urls/banned word.
const FILE1 = `Intro:\n\n${'This guide explains every stitch in detail. '.repeat(45)}\n\nLicense:\n\nTestShop holds all rights to this guide and to the designs in it. Buying it grants you a personal and commercial-use licence for items you make yourself.`;

const product = (over = {}) => ({
  id: 'p1',
  user_id: null,
  product_name: 'Crochet hat',
  product_type: null,
  status: 'created',
  selected_keywords: [],
  mockup_prompts: [],
  infographic_prompts: [],
  warnings: {},
  file1_text: FILE1,
  file2_text: FILE2,
  price: 5,
  zip_name: null,
  etsy_listing_id: null,
  etsy_draft_url: null,
  etsy_synced_at: null,
  product_info: {},
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
  ...over,
});

const validation = async () => {
  const res = await handleApi({
    method: 'GET',
    path: '/products/p1/validation',
    query: '',
    body: null,
    raw: null,
    cookie: '',
  });
  assert.equal(res.status, 200, 'the validation route answers 200 for a listing you own');
  return JSON.parse(res.body).validation;
};

test('the route returns the backend verdict for a complete listing', async () => {
  images = [{ id: 'i1' }, { id: 'i2' }, { id: 'i3' }, { id: 'i4' }];
  documents = [{ name: 'product-content.pdf' }, { name: 'listing-seo-package.pdf' }];
  shop = { enabled: true, connected: true, shopName: 'TestShop' };
  defaults = { category: 'Crochet', quantity: '10', whoMade: 'i_did', whenMade: '2020_2026' };
  categoryResolvable = 99;
  current = product();

  const v = await validation();

  // Shape the review panel reads.
  for (const key of ['ready', 'errors', 'warnings', 'info', 'findings', 'summary']) {
    assert.ok(key in v, `the verdict carries the ${key} field`);
  }
  assert.equal(v.ready, true, 'a fully-filled, connected listing is ready');
  assert.deepEqual(v.errors, [], 'nothing blocks a complete listing');
  assert.equal(v.summary.shop, 'connected');
  assert.equal(v.summary.price, '5.00');
});

test('the verdict reflects broken stored state, not a cached copy', async () => {
  // Same route, but the listing now has no price and no picture: the errors have
  // to come from the current state on this call, proving it is computed live.
  images = [];
  documents = [{ name: 'product-content.pdf' }, { name: 'listing-seo-package.pdf' }];
  current = product({ price: null });

  const v = await validation();

  assert.equal(v.ready, false, 'a missing price and cover image block it');
  const sections = new Set(v.errors.map((e) => e.section));
  assert.ok(sections.has('price'), 'the price section reports the missing price');
  assert.ok(sections.has('images'), 'the images section reports the missing picture');
});

test('an unconnected shop is a blocker on the verdict', async () => {
  images = [{ id: 'i1' }];
  documents = [{ name: 'product-content.pdf' }, { name: 'listing-seo-package.pdf' }];
  shop = { enabled: true, connected: false, shopName: '' };
  current = product();

  const v = await validation();

  assert.equal(v.ready, false);
  assert.ok(v.errors.some((e) => e.section === 'shop'), 'the shop section says a draft needs a connected shop');
  assert.equal(v.summary.shop, 'not connected');
});
