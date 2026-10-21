import { config } from './config.js';

// One database: Postgres. Hosted it is Netlify's managed Postgres, locally the
// one `netlify dev` starts, and in both cases the URL arrives as an environment
// variable. `pg` is loaded on demand so a bundle without it never touches it.

let pgPool = null;

// Netlify's managed Postgres insists on TLS; the local dev instance does not
// speak it, so the host decides unless DB_PGSSL says otherwise.
function useSsl(url) {
  if (process.env.DB_PGSSL === 'disable') return false;
  if (process.env.DB_PGSSL === 'require') return { require: true, rejectUnauthorized: false };
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    return { require: true, rejectUnauthorized: false };
  }
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return false;
  return { require: true, rejectUnauthorized: false };
}

async function pool() {
  if (!pgPool) {
    if (!config.databaseUrl) {
      throw new Error(
        'No database URL is set. Run this locally with `netlify dev`, which starts Postgres and hands it over as NETLIFY_DB_URL.',
      );
    }
    const { default: pg } = await import('pg');
    pgPool = new pg.Pool({
      connectionString: config.databaseUrl,
      ssl: useSsl(config.databaseUrl),
      max: 5,
    });
  }
  return pgPool;
}

/** Keeps the `?` placeholders the routes are written with. */
async function query(sql, params = []) {
  const db = await pool();
  let index = 0;
  const text = sql.replace(/\?/g, () => `$${(index += 1)}`);
  const result = await db.query(text, params);
  return {
    rows: result.rows ?? [],
    affectedRows: result.rowCount ?? 0,
    changed: (result.rowCount ?? 0) > 0,
  };
}

const upsert = {
  // One settings row per key.
  setting: `INSERT INTO settings (setting_key, setting_value) VALUES (?, ?)
     ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = CURRENT_TIMESTAMP`,
  image: `INSERT INTO product_images (product_id, slot_id, file_name, width, height, format, bytes)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (product_id, slot_id) DO UPDATE SET file_name = EXCLUDED.file_name, width = EXCLUDED.width,
       height = EXCLUDED.height, format = EXCLUDED.format, bytes = EXCLUDED.bytes,
       uploaded_at = CURRENT_TIMESTAMP`,
  document: `INSERT INTO product_documents (product_id, file_key, source, file_name, original_name, bytes)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (product_id, file_key) DO UPDATE SET source = EXCLUDED.source, file_name = EXCLUDED.file_name,
       original_name = EXCLUDED.original_name, bytes = EXCLUDED.bytes, uploaded_at = CURRENT_TIMESTAMP`,
};

/**
 * Creates the schema on first run so nobody has to run SQL by hand. The same
 * tables are committed as a Netlify migration, so this only ever has to catch a
 * freshly started local database — and two cold invocations can boot at once,
 * which makes "it already exists" a success.
 */
export async function initDb() {
  const ddl = async (sql) => {
    try {
      await query(sql);
    } catch (error) {
      if (!['42710', '42P07', '23505'].includes(error.code)) throw error;
    }
  };

  await ddl(`
    CREATE TABLE IF NOT EXISTS products (
      id VARCHAR(36) PRIMARY KEY,
      product_name VARCHAR(255) NOT NULL,
      selected_keywords JSONB,
      file1_text TEXT,
      file2_text TEXT,
      mockup_prompts JSONB,
      infographic_prompts JSONB,
      price NUMERIC(10,2),
      zip_name VARCHAR(255),
      status VARCHAR(40) NOT NULL DEFAULT 'created',
      warnings JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await ddl(`
    CREATE TABLE IF NOT EXISTS settings (
      setting_key VARCHAR(64) PRIMARY KEY,
      setting_value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await ddl(`
    CREATE TABLE IF NOT EXISTS keyword_cache (
      seed VARCHAR(190) PRIMARY KEY,
      terms JSONB NOT NULL,
      fetched_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await ddl(`
    CREATE TABLE IF NOT EXISTS product_images (
      product_id VARCHAR(36) NOT NULL REFERENCES products (id) ON DELETE CASCADE,
      slot_id VARCHAR(24) NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      width INT NOT NULL,
      height INT NOT NULL,
      format VARCHAR(12) NOT NULL,
      bytes INT NOT NULL,
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (product_id, slot_id)
    )
  `);
  await ddl('CREATE INDEX IF NOT EXISTS products_created_at ON products (created_at DESC)');
  await ddl(`
    CREATE TABLE IF NOT EXISTS product_documents (
      product_id VARCHAR(36) NOT NULL REFERENCES products (id) ON DELETE CASCADE,
      file_key VARCHAR(40) NOT NULL,
      source VARCHAR(12) NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      original_name VARCHAR(255),
      bytes INT NOT NULL,
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (product_id, file_key)
    )
  `);
  // Hosted databases get these columns from the migrations; a local one that was
  // created before those steps only has them after these lines.
  await ddl('ALTER TABLE products ADD COLUMN IF NOT EXISTS selected_keywords JSONB');
  await ddl('ALTER TABLE products ADD COLUMN IF NOT EXISTS price NUMERIC(10,2)');
  await ddl('ALTER TABLE products ADD COLUMN IF NOT EXISTS etsy_listing_id VARCHAR(64)');
  await ddl('ALTER TABLE products ADD COLUMN IF NOT EXISTS etsy_draft_url VARCHAR(512)');
  await ddl('ALTER TABLE products ADD COLUMN IF NOT EXISTS etsy_synced_at TIMESTAMPTZ');
  await ddl(`
    CREATE TABLE IF NOT EXISTS taxonomy_cache (
      cache_key VARCHAR(64) NOT NULL PRIMARY KEY,
      nodes JSONB NOT NULL,
      fetched_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await ddl(`
    CREATE TABLE IF NOT EXISTS bulk_jobs (
      id VARCHAR(36) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await ddl(`
    CREATE TABLE IF NOT EXISTS bulk_rows (
      job_id VARCHAR(36) NOT NULL REFERENCES bulk_jobs (id) ON DELETE CASCADE,
      idx INT NOT NULL,
      product_name VARCHAR(255) NOT NULL,
      keywords JSONB,
      product_id VARCHAR(36),
      status VARCHAR(24) NOT NULL DEFAULT 'queued',
      attempts INT NOT NULL DEFAULT 0,
      PRIMARY KEY (job_id, idx)
    )
  `);
  // Phase 2: named accounts. A local database created before this only grows
  // these tables after these lines; a hosted one gets them from the migration.
  await ddl(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(36) PRIMARY KEY,
      email VARCHAR(320) NOT NULL UNIQUE,
      name VARCHAR(200),
      password_hash TEXT NOT NULL,
      role VARCHAR(16) NOT NULL DEFAULT 'user',
      verified_at TIMESTAMPTZ,
      generation_count INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await ddl(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await ddl('CREATE INDEX IF NOT EXISTS user_sessions_expires_at ON user_sessions (expires_at)');
  await ddl(`
    CREATE TABLE IF NOT EXISTS user_verifications (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      kind VARCHAR(16) NOT NULL,
      token_hash VARCHAR(64) NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await ddl('CREATE INDEX IF NOT EXISTS user_verifications_token_hash ON user_verifications (token_hash)');
  await ddl('ALTER TABLE products ADD COLUMN IF NOT EXISTS user_id VARCHAR(36)');
  await ddl('CREATE INDEX IF NOT EXISTS products_user_id ON products (user_id)');
  await ddl('ALTER TABLE bulk_jobs ADD COLUMN IF NOT EXISTS user_id VARCHAR(36)');
  await ddl('CREATE INDEX IF NOT EXISTS bulk_jobs_user_id ON bulk_jobs (user_id)');
  // Widen the primary keys on any local table created before ids carried an owner.
  await ddl('ALTER TABLE products ALTER COLUMN id TYPE VARCHAR(80)');
  await ddl('ALTER TABLE bulk_jobs ALTER COLUMN id TYPE VARCHAR(80)');
  // …and the child columns that store that same owned id, or saving a listing's
  // PDFs/images/bulk rows overflows the original VARCHAR(36).
  await ddl('ALTER TABLE product_images ALTER COLUMN product_id TYPE VARCHAR(80)');
  await ddl('ALTER TABLE product_documents ALTER COLUMN product_id TYPE VARCHAR(80)');
  await ddl('ALTER TABLE bulk_rows ALTER COLUMN job_id TYPE VARCHAR(80)');
  await ddl('ALTER TABLE bulk_rows ALTER COLUMN product_id TYPE VARCHAR(80)');
  // Phase 3: per-user daily generation quota. `generation_date` records which
  // day `generation_today` counts; when it no longer matches CURRENT_DATE the
  // day has rolled over and the count restarts. `generation_count` stays the
  // lifetime total for the admin dashboard.
  await ddl('ALTER TABLE users ADD COLUMN IF NOT EXISTS generation_today INT NOT NULL DEFAULT 0');
  await ddl('ALTER TABLE users ADD COLUMN IF NOT EXISTS generation_date DATE');
  // Phase 4: editable per-product-type listing prompts. A missing row falls back
  // to the built-in masterPrompt wording, so this table only stores deliberate
  // customisations and the pipeline works with it empty.
  await ddl(`
    CREATE TABLE IF NOT EXISTS prompt_templates (
      product_type VARCHAR(32) PRIMARY KEY,
      body TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await ddl('ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type VARCHAR(32)');
}

export async function getSetting(key) {
  const { rows } = await query('SELECT setting_value FROM settings WHERE setting_key = ?', [key]);
  return rows[0]?.setting_value ?? null;
}

export async function setSetting(key, value) {
  await query(upsert.setting, [key, value]);
}

export async function deleteSetting(key) {
  await query('DELETE FROM settings WHERE setting_key = ?', [key]);
}

/** Every stored settings pair, for the one-off pass that encrypts saved keys. */
export async function listSettings(prefix) {
  const { rows } = await query(
    'SELECT setting_key, setting_value FROM settings WHERE setting_key LIKE ? ORDER BY setting_key',
    [`${prefix}%`],
  );
  return rows;
}

const parseJson = (value, fallback) => {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

function hydrate(row) {
  if (!row) return null;
  return {
    ...row,
    selected_keywords: parseJson(row.selected_keywords, []),
    mockup_prompts: parseJson(row.mockup_prompts, []),
    infographic_prompts: parseJson(row.infographic_prompts, []),
    warnings: parseJson(row.warnings, {}),
  };
}

export async function createProduct({ id, productName, keywords = [], status = 'created', userId = null, productType = null }) {
  await query(
    'INSERT INTO products (id, product_name, selected_keywords, status, user_id, product_type) VALUES (?, ?, ?, ?, ?, ?)',
    [id, productName, JSON.stringify(keywords), status, userId, productType],
  );
  return getProduct(id);
}

export async function getProduct(id) {
  const { rows } = await query('SELECT * FROM products WHERE id = ?', [id]);
  return hydrate(rows[0]);
}

/** The row only when it both exists and belongs to `userId`. Ownership is the
 *  whole check: an id that is not yours reads as "no such product". */
export async function getProductForUser(id, userId) {
  const { rows } = await query('SELECT * FROM products WHERE id = ? AND user_id = ?', [id, userId]);
  return hydrate(rows[0]);
}

export async function listProducts(userId = null) {
  const { rows } = userId
    ? await query(
        `SELECT id, product_name, status, zip_name, created_at
           FROM products WHERE status <> 'failed' AND user_id = ? ORDER BY created_at DESC LIMIT 200`,
        [userId],
      )
    : await query(
        `SELECT id, product_name, status, zip_name, created_at
           FROM products WHERE status <> 'failed' ORDER BY created_at DESC LIMIT 200`,
      );
  return rows;
}

export async function updateProduct(id, fields) {
  const allowed = [
    'product_name', 'selected_keywords', 'file1_text', 'file2_text', 'mockup_prompts',
    'infographic_prompts', 'price', 'zip_name', 'status', 'warnings', 'product_type',
    'etsy_listing_id', 'etsy_draft_url', 'etsy_synced_at',
  ];
  const entries = Object.entries(fields).filter(([key]) => allowed.includes(key));
  if (!entries.length) return getProduct(id);

  const jsonColumns = new Set(['selected_keywords', 'mockup_prompts', 'infographic_prompts', 'warnings']);
  const sets = [...entries.map(([key]) => `"${key}" = ?`), 'updated_at = CURRENT_TIMESTAMP'].join(', ');
  const values = entries.map(([key, value]) => (jsonColumns.has(key) ? JSON.stringify(value ?? null) : value));

  await query(`UPDATE products SET ${sets} WHERE id = ?`, [...values, id]);
  return getProduct(id);
}

export async function deleteProduct(id) {
  const { affectedRows } = await query('DELETE FROM products WHERE id = ?', [id]);
  return affectedRows > 0;
}

// A sentinel written into `etsy_listing_id` while a draft is being created, so
// two simultaneous "save draft" clicks cannot both reach Etsy. It is never a real
// listing id (Etsy ids are numeric) and never leaves the row behind: the real id
// replaces it on success, or releaseEtsyDraft clears it on failure.
export const DRAFT_CLAIM = '__etsy_draft_in_progress__';

/**
 * Atomically claims a package for draft creation: flips `etsy_listing_id` from
 * NULL to the sentinel only if it is still NULL, in a single UPDATE. Exactly one
 * of any number of concurrent callers gets `true`; the rest see the row already
 * taken and must not proceed. Ownership is assumed to have been checked already.
 */
export async function claimEtsyDraft(id) {
  const { rows } = await query(
    `UPDATE products SET etsy_listing_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND etsy_listing_id IS NULL
      RETURNING id`,
    [DRAFT_CLAIM, id],
  );
  return rows.length > 0;
}

/**
 * Gives the claim back after a failed create, so the seller can try again. Only
 * clears the sentinel — once a real listing id has been stored this is a no-op,
 * so a partially-built draft keeps its link instead of being orphaned.
 */
export async function releaseEtsyDraft(id) {
  const { affectedRows } = await query(
    'UPDATE products SET etsy_listing_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND etsy_listing_id = ?',
    [id, DRAFT_CLAIM],
  );
  return affectedRows > 0;
}

export async function saveProductImage({ productId, slotId, fileName, width, height, format, bytes }) {
  await query(upsert.image, [productId, slotId, fileName, width, height, format, bytes]);
}

const IMAGE_COLUMNS = 'slot_id, file_name, width, height, format, bytes, uploaded_at';

export async function listProductImages(productId) {
  const { rows } = await query(
    `SELECT ${IMAGE_COLUMNS} FROM product_images WHERE product_id = ? ORDER BY slot_id`,
    [productId],
  );
  return rows;
}

export async function getProductImage(productId, slotId) {
  const { rows } = await query(
    `SELECT ${IMAGE_COLUMNS} FROM product_images WHERE product_id = ? AND slot_id = ?`,
    [productId, slotId],
  );
  return rows[0] ?? null;
}

export async function deleteProductImage(productId, slotId) {
  const { affectedRows } = await query(
    'DELETE FROM product_images WHERE product_id = ? AND slot_id = ?',
    [productId, slotId],
  );
  return affectedRows > 0;
}

const DOCUMENT_COLUMNS = 'file_key, source, file_name, original_name, bytes, uploaded_at';

/** Records which PDF the portal will pack for one deliverable, and how big it is. */
export async function saveProductDocument({ productId, fileKey, source, fileName, originalName, bytes }) {
  await query(upsert.document, [productId, fileKey, source, fileName, originalName ?? null, bytes]);
}

export async function listProductDocuments(productId) {
  const { rows } = await query(
    `SELECT ${DOCUMENT_COLUMNS} FROM product_documents WHERE product_id = ? ORDER BY file_key`,
    [productId],
  );
  return rows;
}

export async function getProductDocument(productId, fileKey) {
  const { rows } = await query(
    `SELECT ${DOCUMENT_COLUMNS} FROM product_documents WHERE product_id = ? AND file_key = ?`,
    [productId, fileKey],
  );
  return rows[0] ?? null;
}

export async function deleteProductDocument(productId, fileKey) {
  const { affectedRows } = await query(
    'DELETE FROM product_documents WHERE product_id = ? AND file_key = ?',
    [productId, fileKey],
  );
  return affectedRows > 0;
}

export async function clearProducts() {
  const { affectedRows } = await query('DELETE FROM products');
  return affectedRows;
}

export async function clearProductsForUser(userId) {
  const { affectedRows } = await query('DELETE FROM products WHERE user_id = ?', [userId]);
  return affectedRows;
}

/** Cached search suggestions that are no older than `days`. */
export async function cachedKeywords(seed, days) {
  const { rows } = await query(
    `SELECT terms FROM keyword_cache
      WHERE seed = ? AND fetched_at > CURRENT_TIMESTAMP - make_interval(days => ?)`,
    [seed, days],
  );
  if (!rows.length) return null;
  return parseJson(rows[0].terms, null);
}

export async function storeKeywords(seed, terms) {
  await query(
    `INSERT INTO keyword_cache (seed, terms) VALUES (?, ?)
       ON CONFLICT (seed) DO UPDATE SET terms = EXCLUDED.terms, fetched_at = CURRENT_TIMESTAMP`,
    [seed, JSON.stringify(terms)],
  );
}

/** Etsy's category tree, kept for `days` so a seller's search is instant. */
export async function cachedTaxonomy(key, days) {
  const { rows } = await query(
    `SELECT nodes FROM taxonomy_cache
      WHERE cache_key = ? AND fetched_at > CURRENT_TIMESTAMP - make_interval(days => ?)`,
    [key, days],
  );
  if (!rows.length) return null;
  return parseJson(rows[0].nodes, null);
}

export async function storeTaxonomy(key, nodes) {
  await query(
    `INSERT INTO taxonomy_cache (cache_key, nodes) VALUES (?, ?)
       ON CONFLICT (cache_key) DO UPDATE SET nodes = EXCLUDED.nodes, fetched_at = CURRENT_TIMESTAMP`,
    [key, JSON.stringify(nodes)],
  );
}

// --- Bulk CSV jobs -------------------------------------------------------

export async function createBulkJob({ id, name, userId = null }) {
  await query('INSERT INTO bulk_jobs (id, name, user_id) VALUES (?, ?, ?)', [id, name, userId]);
}

export async function insertBulkRow({ jobId, idx, productName, keywords = [], productId = null, status = 'queued' }) {
  await query(
    `INSERT INTO bulk_rows (job_id, idx, product_name, keywords, product_id, status)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (job_id, idx) DO UPDATE SET product_name = EXCLUDED.product_name,
         keywords = EXCLUDED.keywords, product_id = EXCLUDED.product_id, status = EXCLUDED.status`,
    [jobId, idx, productName, JSON.stringify(keywords), productId, status],
  );
}

export async function getBulkJob(id) {
  const { rows } = await query('SELECT id, name, created_at, user_id FROM bulk_jobs WHERE id = ?', [id]);
  return rows[0] ?? null;
}

export async function listBulkJobs(userId = null) {
  const { rows } = userId
    ? await query(
        `SELECT j.id, j.name, j.created_at,
                count(r.idx) AS rows,
                count(r.idx) FILTER (WHERE r.status = 'done') AS done,
                count(r.idx) FILTER (WHERE r.status = 'failed') AS failed
           FROM bulk_jobs j LEFT JOIN bulk_rows r ON r.job_id = j.id
          WHERE j.user_id = ?
          GROUP BY j.id ORDER BY j.created_at DESC LIMIT 100`,
        [userId],
      )
    : await query(
        `SELECT j.id, j.name, j.created_at,
                count(r.idx) AS rows,
                count(r.idx) FILTER (WHERE r.status = 'done') AS done,
                count(r.idx) FILTER (WHERE r.status = 'failed') AS failed
           FROM bulk_jobs j LEFT JOIN bulk_rows r ON r.job_id = j.id
          GROUP BY j.id ORDER BY j.created_at DESC LIMIT 100`,
      );
  return rows;
}

const BULK_ROW_COLUMNS = 'idx, product_name, keywords, product_id, status, attempts';

export async function listBulkRows(jobId) {
  const { rows } = await query(
    `SELECT ${BULK_ROW_COLUMNS} FROM bulk_rows WHERE job_id = ? ORDER BY idx`,
    [jobId],
  );
  return rows.map((row) => ({ ...row, keywords: parseJson(row.keywords, []) }));
}

export async function getBulkRow(jobId, idx) {
  const { rows } = await query(`SELECT ${BULK_ROW_COLUMNS} FROM bulk_rows WHERE job_id = ? AND idx = ?`, [jobId, idx]);
  if (!rows.length) return null;
  return { ...rows[0], keywords: parseJson(rows[0].keywords, []) };
}

export async function updateBulkRow(jobId, idx, fields) {
  const entries = Object.entries(fields).filter(([key]) => ['product_id', 'status', 'attempts'].includes(key));
  if (!entries.length) return getBulkRow(jobId, idx);
  const sets = entries.map(([key]) => `"${key}" = ?`).join(', ');
  const values = entries.map(([, value]) => value);
  await query(`UPDATE bulk_rows SET ${sets} WHERE job_id = ? AND idx = ?`, [...values, jobId, idx]);
  return getBulkRow(jobId, idx);
}

/** Sends every failed row of a job back to the queue and counts the attempt. */
export async function resetFailedRows(jobId) {
  await query(
    `UPDATE bulk_rows SET status = 'queued', attempts = attempts + 1
       WHERE job_id = ? AND status = 'failed'`,
    [jobId],
  );
  const { rows } = await query(`SELECT ${BULK_ROW_COLUMNS} FROM bulk_rows WHERE job_id = ? AND status = 'queued' ORDER BY idx`, [jobId]);
  return rows.map((row) => ({ ...row, keywords: parseJson(row.keywords, []) }));
}

export async function deleteBulkJob(id) {
  const { affectedRows } = await query('DELETE FROM bulk_jobs WHERE id = ?', [id]);
  return affectedRows > 0;
}

// --- Accounts (Phase 2) --------------------------------------------------
//
// Named email/password accounts. The single portal password still exists and
// still bootstraps the very first owner; these tables are what turns one shared
// login into many, each owning its own listings, settings and files.

const USER_COLUMNS = 'id, email, name, role, verified_at, generation_count, created_at, updated_at';

export async function createUser({ id, email, name = null, passwordHash, role = 'user' }) {
  await query(
    'INSERT INTO users (id, email, name, password_hash, role) VALUES (?, ?, ?, ?, ?)',
    [id, String(email).trim().toLowerCase(), name, passwordHash, role],
  );
  return getUserById(id);
}

export async function getUserByEmail(email) {
  const { rows } = await query('SELECT * FROM users WHERE email = ?', [String(email).trim().toLowerCase()]);
  return rows[0] ?? null;
}

export async function getUserById(id) {
  const { rows } = await query(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, [id]);
  return rows[0] ?? null;
}

export async function countUsers() {
  const { rows } = await query('SELECT count(*)::int AS n FROM users');
  return rows[0]?.n ?? 0;
}

/** The original owner account, used to give a legacy portal-password session an
 *  identity so it can still reach the listings made before named accounts. */
export async function getFirstAdmin() {
  const { rows } = await query(
    `SELECT ${USER_COLUMNS} FROM users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1`,
  );
  return rows[0] ?? null;
}

export async function updateUser(id, fields) {
  const allowed = ['password_hash', 'role', 'verified_at', 'name', 'generation_count'];
  const entries = Object.entries(fields).filter(([key]) => allowed.includes(key));
  if (!entries.length) return getUserById(id);
  const sets = entries.map(([key]) => `"${key}" = ?`).join(', ');
  await query(`UPDATE users SET ${sets}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [
    ...entries.map(([, value]) => value),
    id,
  ]);
  return getUserById(id);
}

/**
 * Charges one generation to the account's daily counter and its lifetime total,
 * restarting the daily count when the stored day is no longer today. Returns the
 * post-increment count for the current day, so a caller can compare it to the cap.
 */
export async function consumeGeneration(userId) {
  const { rows } = await query(
    `UPDATE users
        SET generation_today = CASE WHEN generation_date = CURRENT_DATE THEN generation_today + 1 ELSE 1 END,
            generation_date  = CURRENT_DATE,
            generation_count = generation_count + 1,
            updated_at       = CURRENT_TIMESTAMP
      WHERE id = ?
      RETURNING generation_today`,
    [userId],
  );
  return rows[0]?.generation_today ?? 0;
}

/** Reads how many generations the account has used today, without spending one.
 *  A day other than today reads as zero, so the count rolls over on its own. */
export async function generationsToday(userId) {
  const { rows } = await query(
    `SELECT role,
            CASE WHEN generation_date = CURRENT_DATE THEN generation_today ELSE 0 END::int AS today
       FROM users WHERE id = ?`,
    [userId],
  );
  const row = rows[0];
  return row ? { role: row.role, today: row.today } : null;
}

/** The owner's account, listed for the admin dashboard. */
export async function listUsers() {
  const { rows } = await query(
    `SELECT u.id, u.email, u.name, u.role, u.verified_at, u.generation_count, u.created_at,
            (SELECT count(*) FROM products p WHERE p.user_id = u.id)::int AS product_count
       FROM users u ORDER BY u.created_at ASC`,
  );
  return rows;
}

// --- Admin dashboard (Phase 8c) ------------------------------------------
//
// Read-only roll-ups for the owner: who has an account, how much of today's
// quota each has spent, and which listings failed. Nothing here reaches a
// password hash or an API key — only counts and the display fields an owner
// needs to support their users.

/** Every account with its lifetime and today's generation counts and listing
 *  total. The daily count reads as zero once its day is no longer today. */
export async function adminUsers() {
  const { rows } = await query(
    `SELECT u.id, u.email, u.name, u.role, u.verified_at, u.created_at,
            u.generation_count,
            CASE WHEN u.generation_date = CURRENT_DATE THEN u.generation_today ELSE 0 END::int AS generation_today,
            (SELECT count(*) FROM products p WHERE p.user_id = u.id)::int AS product_count
       FROM users u ORDER BY u.created_at ASC`,
  );
  return rows;
}

/** Portal-wide totals for the summary tiles. */
export async function adminTotals() {
  const { rows } = await query(
    `SELECT (SELECT count(*) FROM users)::int AS users,
            (SELECT count(*) FROM products)::int AS products,
            (SELECT count(*) FROM products WHERE status = 'failed')::int AS failed`,
  );
  return rows[0] ?? { users: 0, products: 0, failed: 0 };
}

/** The listings that did not finish, newest first, with the account that owns
 *  each and the sentence the pipeline stored against it. */
export async function adminFailed(limit = 50) {
  const { rows } = await query(
    `SELECT p.id, p.product_name, p.created_at, u.email,
            COALESCE(p.warnings->>'error', 'The text model did not finish this listing.') AS error
       FROM products p LEFT JOIN users u ON u.id = p.user_id
      WHERE p.status = 'failed'
      ORDER BY p.created_at DESC LIMIT ?`,
    [limit],
  );
  return rows;
}

// Sessions are opaque database rows, not signed blobs: signing out is a delete,
// and revoking one account never touches the shared portal-password secret.

export async function createSessionRow({ id, userId, expiresAt }) {
  await query(
    'INSERT INTO user_sessions (id, user_id, expires_at) VALUES (?, ?, ?)',
    [id, userId, new Date(expiresAt).toISOString()],
  );
}

/** The session's user, or null when the id is unknown or past its expiry. */
export async function getSessionUser(sessionId) {
  if (!sessionId) return null;
  const { rows } = await query(
    `SELECT s.id AS session_id, s.expires_at,
            u.id, u.email, u.name, u.role, u.verified_at, u.generation_count, u.created_at, u.updated_at
       FROM user_sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = ? AND s.expires_at > CURRENT_TIMESTAMP`,
    [sessionId],
  );
  return rows[0] ?? null;
}

export async function deleteSessionRow(id) {
  await query('DELETE FROM user_sessions WHERE id = ?', [id]);
}

export async function deleteSessionsForUser(userId) {
  await query('DELETE FROM user_sessions WHERE user_id = ?', [userId]);
}

// One-time email tokens (verification, and later reset). Only the SHA-256 of the
// token is stored, and each is single-use.

export async function storeVerification({ id, userId, kind, tokenHash, expiresAt }) {
  await query(
    'INSERT INTO user_verifications (id, user_id, kind, token_hash, expires_at) VALUES (?, ?, ?, ?, ?)',
    [id, userId, kind, tokenHash, new Date(expiresAt).toISOString()],
  );
}

export async function consumeVerification(tokenHash, kind) {
  const { rows } = await query(
    `SELECT * FROM user_verifications
      WHERE token_hash = ? AND kind = ? AND expires_at > CURRENT_TIMESTAMP`,
    [tokenHash, kind],
  );
  const row = rows[0] ?? null;
  if (row) await query('DELETE FROM user_verifications WHERE id = ?', [row.id]);
  return row;
}

// --- Prompt templates (Phase 4) ------------------------------------------
//
// The text-model brief for each product type, editable in Settings. Absence is
// meaningful: with no row the pipeline uses the built-in masterPrompt wording,
// so a fresh or cleared database behaves exactly as it did before templates
// existed. Only customised types are stored.

export async function listPromptTemplates() {
  const { rows } = await query('SELECT product_type, body, updated_at FROM prompt_templates ORDER BY product_type');
  return rows;
}

/** The saved body for one product type, or null when it has not been customised. */
export async function getPromptTemplate(productType) {
  const { rows } = await query('SELECT body FROM prompt_templates WHERE product_type = ?', [productType]);
  return rows[0]?.body ?? null;
}

export async function upsertPromptTemplate(productType, body) {
  await query(
    `INSERT INTO prompt_templates (product_type, body) VALUES (?, ?)
       ON CONFLICT (product_type) DO UPDATE SET body = EXCLUDED.body, updated_at = CURRENT_TIMESTAMP`,
    [productType, body],
  );
}

export async function deletePromptTemplate(productType) {
  const { affectedRows } = await query('DELETE FROM prompt_templates WHERE product_type = ?', [productType]);
  return affectedRows > 0;
}
