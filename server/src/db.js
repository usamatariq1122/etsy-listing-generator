import mysql from 'mysql2/promise';
import { config } from './config.js';

// Two database backends, one set of functions: MariaDB/MySQL while you run this
// locally (XAMPP), Netlify's managed Postgres once DATABASE_URL is set.

let pool = null;
let pgPool = null;

export const isPostgres = () => Boolean(process.env.DATABASE_URL);

export function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: config.db.database,
      waitForConnections: true,
      connectionLimit: 5,
      charset: 'utf8mb4_unicode_ci',
    });
  }
  return pool;
}

async function postgresPool() {
  if (!pgPool) {
    const { default: pg } = await import('pg');
    pgPool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DB_PGSSL === 'disable' ? false : { require: true, rejectUnauthorized: false },
      max: 5,
    });
  }
  return pgPool;
}

/** `?` placeholders and raw results are MySQL's; both backends get one shape. */
async function query(sql, params = []) {
  if (isPostgres()) {
    const db = await postgresPool();
    let index = 0;
    const text = sql.replace(/\?/g, () => `$${(index += 1)}`);
    const result = await db.query(text, params);
    return {
      rows: result.rows ?? [],
      affectedRows: result.rowCount ?? 0,
      changed: (result.rowCount ?? 0) > 0,
    };
  }
  const [rows, fields] = await getPool().query(sql, params);
  return { rows: rows ?? [], affectedRows: fields?.affectedRows ?? rows?.affectedRows ?? 0, changed: (fields?.changedRows ?? 0) > 0 };
}

const upsert = {
  // One settings row per key.
  setting: (isPg) =>
    isPg
      ? `INSERT INTO settings (setting_key, setting_value) VALUES (?, ?)
         ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = CURRENT_TIMESTAMP`
      : `INSERT INTO settings (setting_key, setting_value) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
  image: (isPg) =>
    isPg
      ? `INSERT INTO product_images (product_id, slot_id, file_name, width, height, format, bytes)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (product_id, slot_id) DO UPDATE SET file_name = EXCLUDED.file_name, width = EXCLUDED.width,
           height = EXCLUDED.height, format = EXCLUDED.format, bytes = EXCLUDED.bytes,
           uploaded_at = CURRENT_TIMESTAMP`
      : `INSERT INTO product_images (product_id, slot_id, file_name, width, height, format, bytes)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE file_name = VALUES(file_name), width = VALUES(width),
           height = VALUES(height), format = VALUES(format), bytes = VALUES(bytes),
           uploaded_at = CURRENT_TIMESTAMP`,
};

/** Creates the schema on first run so nobody has to run SQL by hand. */
export async function initDb() {
  if (isPostgres()) {
    // Two cold invocations can boot at once, so "it already exists" is success.
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
    return;
  }

  const bootstrap = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    multipleStatements: true,
  });
  await bootstrap.query(
    `CREATE DATABASE IF NOT EXISTS \`${config.db.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  await bootstrap.end();

  await query(`
    CREATE TABLE IF NOT EXISTS products (
      id CHAR(36) NOT NULL PRIMARY KEY,
      product_name VARCHAR(255) NOT NULL,
      file1_text MEDIUMTEXT NULL,
      file2_text MEDIUMTEXT NULL,
      mockup_prompts JSON NULL,
      infographic_prompts JSON NULL,
      zip_name VARCHAR(255) NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'created',
      warnings JSON NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS settings (
      setting_key VARCHAR(64) NOT NULL PRIMARY KEY,
      setting_value TEXT NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS keyword_cache (
      seed VARCHAR(190) NOT NULL PRIMARY KEY,
      terms JSON NOT NULL,
      fetched_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS product_images (
      product_id CHAR(36) NOT NULL,
      slot_id VARCHAR(24) NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      width INT NOT NULL,
      height INT NOT NULL,
      format VARCHAR(12) NOT NULL,
      bytes INT NOT NULL,
      uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (product_id, slot_id),
      CONSTRAINT fk_image_product FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

export async function getSetting(key) {
  const { rows } = await query('SELECT setting_value FROM settings WHERE setting_key = ?', [key]);
  return rows[0]?.setting_value ?? null;
}

export async function setSetting(key, value) {
  await query(upsert.setting(isPostgres()), [key, value]);
}

export async function deleteSetting(key) {
  await query('DELETE FROM settings WHERE setting_key = ?', [key]);
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
    mockup_prompts: parseJson(row.mockup_prompts, []),
    infographic_prompts: parseJson(row.infographic_prompts, []),
    warnings: parseJson(row.warnings, {}),
  };
}

export async function createProduct({ id, productName, status = 'created' }) {
  await query(`INSERT INTO products (id, product_name, status) VALUES (?, ?, ?)`, [id, productName, status]);
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
    'product_name', 'file1_text', 'file2_text', 'mockup_prompts',
    'infographic_prompts', 'zip_name', 'status', 'warnings',
  ];
  const entries = Object.entries(fields).filter(([key]) => allowed.includes(key));
  if (!entries.length) return getProduct(id);

  const jsonColumns = new Set(['mockup_prompts', 'infographic_prompts', 'warnings']);
  const quote = (key) => (isPostgres() ? `"${key}"` : `\`${key}\``);
  const sets = [...entries.map(([key]) => `${quote(key)} = ?`), 'updated_at = CURRENT_TIMESTAMP'].join(', ');
  const values = entries.map(([key, value]) => (jsonColumns.has(key) ? JSON.stringify(value ?? null) : value));

  await query(`UPDATE products SET ${sets} WHERE id = ?`, [...values, id]);
  return getProduct(id);
}

export async function deleteProduct(id) {
  const { affectedRows } = await query('DELETE FROM products WHERE id = ?', [id]);
  return affectedRows > 0;
}

export async function saveProductImage({ productId, slotId, fileName, width, height, format, bytes }) {
  await query(upsert.image(isPostgres()), [productId, slotId, fileName, width, height, format, bytes]);
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
  const { rows } = isPostgres()
    ? await query(
        `SELECT terms FROM keyword_cache
          WHERE seed = ? AND fetched_at > CURRENT_TIMESTAMP - make_interval(days => ?)`,
        [seed, days],
      )
    : await query(
        `SELECT terms FROM keyword_cache
          WHERE seed = ? AND fetched_at > DATE_SUB(NOW(), INTERVAL ? DAY)`,
        [seed, days],
      );
  if (!rows.length) return null;
  return parseJson(rows[0].terms, null);
}

export async function storeKeywords(seed, terms) {
  await query(
    isPostgres()
      ? `INSERT INTO keyword_cache (seed, terms) VALUES (?, ?)
         ON CONFLICT (seed) DO UPDATE SET terms = EXCLUDED.terms, fetched_at = CURRENT_TIMESTAMP`
      : `INSERT INTO keyword_cache (seed, terms) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE terms = VALUES(terms), fetched_at = CURRENT_TIMESTAMP`,
    [seed, JSON.stringify(terms)],
  );
}
