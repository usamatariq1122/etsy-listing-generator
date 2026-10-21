import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// The double-click guard on "Save as draft". The check that a package is not
// already in Etsy is a single atomic UPDATE (claimEtsyDraft) in db.js, so of any
// number of simultaneous requests exactly one wins the claim and reaches Etsy.
// Here the database and the Etsy layer are faked so the router's behaviour under
// two overlapping requests can be observed without a server, a shop or Postgres.
//
// claimEtsyDraft is stubbed to behave like that UPDATE: the first caller flips an
// internal flag and gets true, every caller after it gets false. sendDraft counts
// how many times the Etsy side is actually reached.

process.env.ETSY_ENABLED = 'true';
process.env.ETSY_KEYSTRING = 'test-keystring';
process.env.ETSY_SHARED_SECRET = 'test-secret';
delete process.env.NETLIFY;
delete process.env.LAMBDA_TASK_ROOT;

const DRAFT_CLAIM = '__etsy_draft_in_progress__';

let claimed = false;
let sendCalls = 0;

const product = () => ({
  id: 'p1',
  user_id: null,
  product_name: 'Crochet hat',
  product_type: null,
  status: 'created',
  selected_keywords: [],
  mockup_prompts: [],
  infographic_prompts: [],
  warnings: {},
  file1_text: '',
  file2_text: '',
  price: 5,
  zip_name: null,
  etsy_listing_id: null,
  etsy_draft_url: null,
  etsy_synced_at: null,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
});

const noop = async () => null;
mock.module('../src/db.js', {
  namedExports: {
    initDb: noop,
    getSetting: noop,
    setSetting: noop,
    deleteSetting: noop,
    listSettings: async () => [],
    createUser: noop,
    getUserByEmail: noop,
    getUserById: noop,
    countUsers: async () => 1,
    getFirstAdmin: noop,
    updateUser: noop,
    consumeGeneration: noop,
    generationsToday: async () => ({ role: 'user', today: 0 }),
    listUsers: async () => [],
    adminUsers: async () => [],
    adminTotals: async () => ({ users: 1, products: 0, failed: 0 }),
    adminFailed: async () => [],
    createSessionRow: noop,
    getSessionUser: noop,
    deleteSessionRow: noop,
    deleteSessionsForUser: noop,
    storeVerification: noop,
    consumeVerification: noop,
    createProduct: noop,
    getProduct: async () => ({ ...product(), etsy_listing_id: '123', etsy_draft_url: 'https://etsy/123' }),
    getProductForUser: async () => product(),
    listProducts: async () => [],
    updateProduct: noop,
    deleteProduct: async () => false,
    clearProducts: async () => 0,
    clearProductsForUser: async () => 0,
    // The atomic claim, modelled as a real UPDATE would behave: one winner only.
    claimEtsyDraft: async () => {
      await Promise.resolve();
      if (claimed) return false;
      claimed = true;
      return true;
    },
    releaseEtsyDraft: async () => {
      claimed = false;
      return true;
    },
    DRAFT_CLAIM,
    saveProductImage: noop,
    listProductImages: async () => [],
    getProductImage: noop,
    deleteProductImage: async () => false,
    saveProductDocument: noop,
    listProductDocuments: async () => [],
    getProductDocument: noop,
    deleteProductDocument: async () => false,
    cachedKeywords: noop,
    storeKeywords: noop,
    cachedTaxonomy: noop,
    storeTaxonomy: noop,
    createBulkJob: noop,
    insertBulkRow: noop,
    getBulkJob: noop,
    listBulkJobs: async () => [],
    listBulkRows: async () => [],
    getBulkRow: noop,
    updateBulkRow: noop,
    resetFailedRows: async () => [],
    deleteBulkJob: async () => false,
    listPromptTemplates: async () => [],
    getPromptTemplate: noop,
    upsertPromptTemplate: noop,
    deletePromptTemplate: async () => false,
  },
});

mock.module('../src/taxonomy.js', {
  namedExports: {
    categoryTree: async () => [],
    resolveCategoryId: async () => 99,
  },
});

mock.module('../src/draft.js', {
  namedExports: {
    WHO_MADE: ['i_did'],
    WHEN_MADE: ['2020_2026'],
    publishDraft: noop,
    sendDraft: async () => {
      sendCalls += 1;
      await Promise.resolve();
      return { listingId: '123', url: 'https://etsy/123', images: 1, files: 1, title: 'Crochet hat' };
    },
  },
});

const { handleApi } = await import('../src/api.js');

const draft = () =>
  handleApi({
    method: 'POST',
    path: '/etsy/draft',
    query: '',
    body: { productId: 'p1', category: 'Crochet', quantity: '999', whoMade: 'i_did', whenMade: '2020_2026' },
    raw: null,
    cookie: '',
  });

test('two concurrent draft requests create exactly one Etsy draft', async () => {
  claimed = false;
  sendCalls = 0;

  // Neither is awaited before the other starts, so both read the package as not
  // yet a draft and both attempt the claim at the same moment.
  const results = await Promise.allSettled([draft(), draft()]);

  const rejected = results.filter((r) => r.status === 'rejected');
  const fulfilled = results.filter((r) => r.status === 'fulfilled');

  assert.equal(sendCalls, 1, 'the Etsy side is reached only once');
  assert.equal(fulfilled.length, 1, 'one request wins and returns its draft');
  assert.equal(rejected.length, 1, 'the other request is refused');
  assert.equal(rejected[0].reason.status, 409, 'the loser gets a conflict, not a second draft');
});

test('a package already claimed mid-flight is refused before it is created', async () => {
  // The sentinel left by an in-progress create is not a real listing, but it does
  // block a fresh attempt until that create finishes or is released.
  claimed = true;
  sendCalls = 0;

  await assert.rejects(draft(), (err) => err.status === 409);
  assert.equal(sendCalls, 0, 'a refused draft never reaches Etsy');
});
