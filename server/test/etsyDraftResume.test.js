import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// Phase 4: the draft job-state and the resume path of POST /etsy/draft, driven
// in-process. The running `netlify dev` bundle does not hot-reload server/src/**,
// so curling the local server would test a stale build. Instead the router is
// imported here and its outside world - the database, Etsy, the taxonomy and the
// draft send - is faked, so the route's decisions (re-validate, refuse a repeat,
// resume only a partial, record the outcome) are observed against the current code.

process.env.ETSY_ENABLED = 'true';
process.env.ETSY_KEYSTRING = 'test-keystring';
process.env.ETSY_SHARED_SECRET = 'test-secret';
delete process.env.NETLIFY;
delete process.env.LAMBDA_TASK_ROOT;

const DRAFT_CLAIM = '__etsy_draft_in_progress__';

let current = null;
// Captures what the route records into etsy_draft_state, in call order.
let states = [];
// Captures how sendDraft was reached, so the resume arguments can be inspected.
let sendCalls = [];
// The faked atomic resume claim: true unless a test says the flip found no match.
let resumeClaim = true;
// How the faked sendDraft behaves: 'ok' | 'partial' (threw after a listing id) |
// 'fail' (threw before any listing existed).
let sendMode = 'ok';

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
    consumeVerification: noop, createProduct: noop,
    getProduct: async () => current,
    getProductForUser: async () => current, listProducts: async () => [],
    updateProduct: async (_id, patch) => { if (patch && 'etsy_draft_state' in patch) states.push(patch.etsy_draft_state); },
    deleteProduct: async () => false, clearProducts: async () => 0, clearProductsForUser: async () => 0,
    claimEtsyDraft: async () => true, releaseEtsyDraft: async () => true, DRAFT_CLAIM,
    claimEtsyResume: async () => {
      await Promise.resolve();
      return resumeClaim;
    },
    saveProductImage: noop, listProductImages: async () => [{ slot_id: 'a', file_name: 'a.png', format: 'png' }],
    getProductImage: noop, deleteProductImage: async () => false, saveProductDocument: noop,
    listProductDocuments: async () => [], getProductDocument: noop,
    deleteProductDocument: async () => false, cachedKeywords: noop, storeKeywords: noop,
    cachedTaxonomy: noop, storeTaxonomy: noop, createBulkJob: noop, insertBulkRow: noop,
    getBulkJob: noop, listBulkJobs: async () => [], listBulkRows: async () => [], getBulkRow: noop,
    updateBulkRow: noop, resetFailedRows: async () => [], deleteBulkJob: async () => false,
    listPromptTemplates: async () => [], getPromptTemplate: noop, upsertPromptTemplate: noop,
    deletePromptTemplate: async () => false,
  },
});

mock.module('../src/taxonomy.js', {
  namedExports: { categoryTree: async () => [], resolveCategoryId: async () => 99 },
});

mock.module('../src/etsy.js', {
  namedExports: {
    authorizeUrl: noop, completeConnect: noop, connection: async () => ({ enabled: true, connected: true, shopName: 'TestShop' }),
    disconnect: noop, etsyReady: () => true,
  },
});

mock.module('../src/etsyDefaults.js', {
  namedExports: {
    clearEtsyDefaults: noop, etsyDefaultIssues: async () => [],
    etsyDefaults: async () => ({ category: 'Crochet', quantity: '10', whoMade: 'i_did', whenMade: '2020_2026' }),
    saveEtsyDefaults: noop,
  },
});

// The gate is faked ready so these tests observe the resume dispatch, not the
// blocker logic (that gate behaviour is covered in etsyDraftGuard.test.js).
mock.module('../src/validateListing.js', {
  namedExports: {
    validateListing: async () => ({ ready: true, errors: [], warnings: [], info: [], findings: [], summary: {} }),
    submissionErrors: (v) => v.errors.map((e) => e.message),
  },
});

mock.module('../src/draft.js', {
  namedExports: {
    WHO_MADE: ['i_did'],
    WHEN_MADE: ['2020_2026'],
    publishDraft: noop,
    sendDraft: async (_product, _body, _taxonomyId, opts) => {
      sendCalls.push(opts ?? {});
      await Promise.resolve();
      if (sendMode === 'partial') {
        // A listing was created (sendDraft would have stored its id) and the
        // first buyer file attached, then the next step failed — resumable.
        const err = new Error('Etsy refused the second file upload.');
        err.draft = { listingId: opts?.resume?.listingId ?? '789', url: 'https://etsy/789', images: 1, files: 1 };
        throw err;
      }
      if (sendMode === 'fail') {
        // Failed before any listing existed — nothing to resume.
        throw new Error('Etsy is unreachable right now.');
      }
      return { listingId: '123', url: 'https://etsy/123', images: 1, files: 2, title: 'Crochet hat' };
    },
  },
});

const { handleApi } = await import('../src/api.js');

const base = () => ({
  id: 'p1',
  user_id: null,
  product_name: 'Crochet hat',
  product_type: null,
  status: 'created',
  selected_keywords: [],
  mockup_prompts: [],
  infographic_prompts: [],
  warnings: {},
  file1_text: 'x'.repeat(600),
  file2_text: '1. SEO Title: Crochet Hat Pattern\n3. Description: A friendly beginner hat guide.',
  price: 5,
  zip_name: null,
  etsy_listing_id: null,
  etsy_draft_url: null,
  etsy_synced_at: null,
  product_info: {},
  etsy_draft_state: null,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
});

// The listing a first attempt left half-built: a real numeric listing id and a
// recorded 'partial' state showing the buyer files still missing.
const partial = () => ({
  ...base(),
  etsy_listing_id: '123',
  etsy_draft_url: 'https://etsy/123',
  etsy_draft_state: { status: 'partial', listingId: '123', url: 'https://etsy/123', images: 1, files: 1, attempts: 1, error: 'upload failed', updatedAt: '2026-01-01' },
});

const draft = (extra = {}) =>
  handleApi({
    method: 'POST',
    path: '/etsy/draft',
    query: '',
    body: { productId: 'p1', category: 'Crochet', quantity: '999', whoMade: 'i_did', whenMade: '2020_2026', ...extra },
    raw: null,
    cookie: '',
  });

function reset() {
  current = null;
  states = [];
  sendCalls = [];
  resumeClaim = true;
  sendMode = 'ok';
}

test('a half-built draft is refused without the explicit resume, and never re-sent', async () => {
  reset();
  current = partial();

  await assert.rejects(draft(), (err) => {
    assert.equal(err.status, 409, 'a partial draft is a conflict when you try to start over');
    assert.match(err.message, /Continue/, 'the message points at the Continue action');
    return true;
  });
  assert.equal(sendCalls.length, 0, 'a plain "create" never touches a partial draft');
  assert.deepEqual(states, [], 'nothing is recorded — the request stopped before the claim');
});

test('continuing a partial draft resumes the same listing and skips its attached files', async () => {
  reset();
  current = partial();

  const res = await draft({ resume: true });

  assert.equal(res.status, 200, 'the continue path returns its finished draft');
  assert.equal(sendCalls.length, 1, 'sendDraft is reached exactly once');
  const opts = sendCalls[0];
  assert.ok(opts.resume, 'sendDraft is told this is a resume');
  assert.equal(opts.resume.listingId, '123', 'the existing listing is reused, not re-created');
  assert.equal(opts.resume.filesDone, 1, 'the one already-attached file is skipped so the buyer gets no duplicate');

  // The outcome is recorded: in_progress first, then complete.
  assert.equal(states[0].status, 'in_progress', 'the attempt is marked running before it sends');
  assert.equal(states.at(-1).status, 'complete', 'a finished resume is recorded complete');
  assert.equal(states.at(-1).attempts, 2, 'the attempt count carried over from the first try');
});

test('a concurrent continue loses the atomic flip and never re-attaches the files', async () => {
  reset();
  current = partial();
  resumeClaim = false;

  await assert.rejects(draft({ resume: true }), (err) => {
    assert.equal(err.status, 409, 'only one continue wins');
    return true;
  });
  assert.equal(sendCalls.length, 0, 'the loser never reaches Etsy, so no file is attached twice');
});

test('a fully-built draft is sent back to Etsy rather than resumed or re-created', async () => {
  reset();
  current = {
    ...base(),
    etsy_listing_id: '456',
    etsy_draft_url: 'https://etsy/456',
    etsy_draft_state: { status: 'complete', listingId: '456', url: 'https://etsy/456', files: 2, attempts: 1, updatedAt: '2026-01-01' },
  };

  await assert.rejects(draft(), (err) => {
    assert.equal(err.status, 409, 'a finished draft is not touched again');
    assert.match(err.message, /already in Etsy/, 'the message is the familiar "open it there" refusal');
    return true;
  });
  assert.equal(sendCalls.length, 0, 'a complete draft never re-sends');
});

test('a fresh send that fails part way is recorded partial so it can be continued', async () => {
  reset();
  current = base();
  sendMode = 'partial';

  await assert.rejects(draft(), (err) => {
    assert.equal(err.status, 502, 'a partly-built draft is a gateway failure, not a clean 200');
    assert.equal(err.resumable, true, 'the error flags the draft as resumable');
    return true;
  });
  assert.equal(states[0].status, 'in_progress', 'the send is marked running before reaching Etsy');
  const last = states.at(-1);
  assert.equal(last.status, 'partial', 'the interrupted send is recorded resumable');
  assert.equal(last.listingId, '789', 'the listing it did create is remembered');
  assert.equal(last.files, 1, 'the file already attached is remembered so a resume skips it');
});

test('a fresh send that fails before any listing exists is recorded failed', async () => {
  reset();
  current = base();
  sendMode = 'fail';

  await assert.rejects(draft(), (err) => {
    assert.match(err.message, /unreachable/);
    return true;
  });
  assert.equal(states.at(-1).status, 'failed', 'no listing was made, so it is failed, not partial');
  assert.equal(states.at(-1).listingId, null, 'nothing to resume — no listing id is stored');
});
