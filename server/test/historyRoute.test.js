import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// The GET /products history route as the Listing Tracker reads it. Driven
// in-process (the running `netlify dev` bundle does not hot-reload server/src/**),
// with the database faked, so the row mapping - product type, price, updated and
// the honest Etsy stage - is checked against the current source.

process.env.ETSY_ENABLED = 'true';
delete process.env.NETLIFY;
delete process.env.LAMBDA_TASK_ROOT;

const DRAFT_CLAIM = '__etsy_draft_in_progress__';
let rows = [];

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
    consumeVerification: noop, createProduct: noop, getProduct: noop, getProductForUser: noop,
    listProducts: async () => rows, updateProduct: noop, deleteProduct: async () => false,
    clearProducts: async () => 0, clearProductsForUser: async () => 0,
    claimEtsyDraft: noop, claimEtsyResume: noop, releaseEtsyDraft: noop, DRAFT_CLAIM,
    saveProductImage: noop, listProductImages: async () => [], getProductImage: noop,
    deleteProductImage: async () => false, saveProductDocument: noop,
    listProductDocuments: async () => [], getProductDocument: noop,
    deleteProductDocument: async () => false, cachedKeywords: noop, storeKeywords: noop,
    cachedTaxonomy: noop, storeTaxonomy: noop, createBulkJob: noop, insertBulkRow: noop,
    getBulkJob: noop, listBulkJobs: async () => [], listBulkRows: async () => [], getBulkRow: noop,
    updateBulkRow: noop, resetFailedRows: async () => [], deleteBulkJob: async () => false,
    listPromptTemplates: async () => [], getPromptTemplate: noop, upsertPromptTemplate: noop,
    deletePromptTemplate: async () => false,
  },
});

mock.module('../src/taxonomy.js', { namedExports: { categoryTree: async () => [], resolveCategoryId: noop } });
mock.module('../src/etsy.js', {
  namedExports: { authorizeUrl: noop, completeConnect: noop, connection: noop, disconnect: noop, etsyReady: () => false },
});
mock.module('../src/etsyDefaults.js', {
  namedExports: { clearEtsyDefaults: noop, etsyDefaultIssues: async () => [], etsyDefaults: async () => ({}), saveEtsyDefaults: noop },
});
mock.module('../src/draft.js', {
  namedExports: { WHO_MADE: ['i_did'], WHEN_MADE: ['2020_2026'], publishDraft: noop, sendDraft: noop },
});

const { handleApi } = await import('../src/api.js');

const history = async () => {
  const res = await handleApi({ method: 'GET', path: '/products', query: '', body: null, raw: null, cookie: '' });
  assert.equal(res.status, 200);
  return JSON.parse(res.body).products;
};

test('the history route carries the tracker columns and an honest Etsy stage', async () => {
  rows = [
    {
      id: 'u1:a', product_name: 'Crochet hat', product_type: 'crochet', status: 'packaged', price: '5.00',
      zip_name: 'crochet-hat.zip', etsy_listing_id: '123', etsy_draft_url: 'https://etsy/123',
      etsy_draft_state: { status: 'partial', files: 1 }, created_at: '2026-01-01', updated_at: '2026-01-05',
    },
    {
      id: 'u1:b', product_name: 'Wall art', product_type: 'art', status: 'text', price: null,
      zip_name: null, etsy_listing_id: null, etsy_draft_url: null, etsy_draft_state: null,
      created_at: '2026-01-02', updated_at: '2026-01-02',
    },
    // A draft mid-flight stores the sentinel, which is not a real listing and must
    // read as "no Etsy" rather than a link to a listing that does not exist yet.
    {
      id: 'u1:c', product_name: 'Planner', product_type: 'planner', status: 'packaged', price: '9.00',
      zip_name: 'planner.zip', etsy_listing_id: DRAFT_CLAIM, etsy_draft_url: null, etsy_draft_state: { status: 'in_progress' },
      created_at: '2026-01-03', updated_at: '2026-01-03',
    },
  ];

  const products = await history();
  const byId = Object.fromEntries(products.map((p) => [p.id, p]));

  assert.equal(byId['u1:a'].productType, 'crochet', 'the product type travels to the tracker');
  assert.equal(byId['u1:a'].price, '5.00', 'the price travels for the price column');
  assert.equal(byId['u1:a'].updatedAt, '2026-01-05', 'the updated stamp drives the default sort');
  assert.equal(byId['u1:a'].etsy.status, 'partial', 'a part-built draft reads as partial, never "live"');
  assert.equal(byId['u1:a'].etsy.url, 'https://etsy/123', 'the real draft link is carried for the Etsy cell');

  assert.equal(byId['u1:b'].etsy, null, 'a package never sent to Etsy has no Etsy stage');
  assert.equal(byId['u1:b'].zipReady, false, 'no ZIP, no download');

  assert.equal(byId['u1:c'].etsy, null, 'the in-flight sentinel is not reported as a listing');
});
