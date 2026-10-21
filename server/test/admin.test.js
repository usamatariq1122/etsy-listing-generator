import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// Phase 8c: the admin dashboard. The route table lives in api.js, which pulls in
// the whole app, so the only thing that must be faked is the database layer.
// Every db export the router (and its transitive imports) touches is stubbed; the
// handful the admin path actually calls are given real shapes. This checks the
// gating and the response payload without a server or a live Postgres.

const store = {
  users: [
    { id: 'u1', email: 'owner@example.com', name: 'Owner', role: 'admin', verified_at: null, created_at: '2026-01-01', generation_count: 40, generation_today: 3, product_count: 12 },
    { id: 'u2', email: 'seller@example.com', name: null, role: 'user', verified_at: '2026-02-02', created_at: '2026-02-01', generation_count: 5, generation_today: 5, product_count: 5 },
  ],
  totals: { users: 2, products: 17, failed: 1 },
  failed: [
    { id: 'u2:p1', product_name: 'Crochet hat', created_at: '2026-03-03', email: 'seller@example.com', error: 'The text model timed out.' },
  ],
};

const noop = async () => null;
mock.module('../src/db.js', {
  namedExports: {
    initDb: noop,
    getSetting: noop,
    setSetting: noop,
    deleteSetting: noop,
    listSettings: async () => [],
    createUser: noop,
    getUserByEmail: async (email) => store.users.find((u) => u.email === email) ?? null,
    getUserById: async (id) => store.users.find((u) => u.id === id) ?? null,
    countUsers: async () => store.users.length,
    getFirstAdmin: async () => store.users.find((u) => u.role === 'admin') ?? null,
    updateUser: noop,
    consumeGeneration: noop,
    generationsToday: async (id) => {
      const u = store.users.find((x) => x.id === id);
      return u ? { role: u.role, today: u.generation_today } : null;
    },
    listUsers: async () => store.users,
    adminUsers: async () => store.users,
    adminTotals: async () => store.totals,
    adminFailed: async () => store.failed,
    createSessionRow: noop,
    // A known token resolves to the owner account; anything else is signed out.
    getSessionUser: async (t) => (t === 'admin-token' ? { session_id: 'admin-token', ...store.users[0] } : null),
    deleteSessionRow: noop,
    deleteSessionsForUser: noop,
    storeVerification: noop,
    consumeVerification: noop,
    createProduct: noop,
    getProduct: noop,
    getProductForUser: noop,
    listProducts: async () => [],
    updateProduct: noop,
    deleteProduct: async () => false,
    clearProducts: async () => 0,
    clearProductsForUser: async () => 0,
    // The Etsy draft double-click guard reads these off db; the admin path never
    // calls them, but api.js imports them, so the mock must provide them.
    DRAFT_CLAIM: '__etsy_draft_in_progress__',
    claimEtsyDraft: async () => false,
    releaseEtsyDraft: async () => false,
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

const { handleApi } = await import('../src/api.js');

const call = (cookie = '') =>
  handleApi({ method: 'GET', path: '/admin/overview', query: '', body: null, raw: null, cookie });

test('the admin dashboard is refused when nobody is signed in as the owner', async () => {
  // handleApi lets the HttpError propagate to the runtime wrapper, which turns
  // it into the 403 the browser sees.
  await assert.rejects(call, (err) => err.status === 403 && /owner/i.test(err.message));
});

test('the admin dashboard returns users, totals and failures for the owner', async () => {
  const res = await call('listora_account=admin-token');
  assert.equal(res.status, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.totals.users, 2);
  assert.equal(body.users.length, 2);
  assert.equal(body.failed[0].error, 'The text model timed out.');
  assert.ok('dailyLimit' in body);
});
