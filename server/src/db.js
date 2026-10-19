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
  // Hosted databases get this column from the migration; a local one that was
  // created before the keyword step only has it after this line.
  await ddl('ALTER TABLE products ADD COLUMN IF NOT EXISTS selected_keywords JSONB');
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

export async function createProduct({ id, productName, keywords = [], status = 'created' }) {
  await query('INSERT INTO products (id, product_name, selected_keywords, status) VALUES (?, ?, ?, ?)', [
    id,
    productName,
    JSON.stringify(keywords),
    status,
  ]);
  return getProduct(id);
}

export async function getProduct(id) {
  const { rows } = await query('SELECT * FROM products WHERE id = ?', [id]);
  return hydrate(rows[0]);
}

export async function listProducts() {
  const { rows } = await query(
    `SELECT id, product_name, status, zip_name, created_at
       FROM products WHERE status <> 'failed' ORDER BY created_at DESC LIMIT 200`,
  );
  return rows;
}

export async function updateProduct(id, fields) {
  const allowed = [
    'product_name', 'selected_keywords', 'file1_text', 'file2_text', 'mockup_prompts',
    'infographic_prompts', 'zip_name', 'status', 'warnings',
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

export async function clearProducts() {
  const { affectedRows } = await query('DELETE FROM products');
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
