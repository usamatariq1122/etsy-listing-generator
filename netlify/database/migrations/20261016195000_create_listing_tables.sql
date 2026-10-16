-- The listing store: one row per generated listing, the portal's settings,
-- the keyword cache, and one row per uploaded slot image.
-- Locally the same schema is created on first boot by server/src/db.js (MySQL);
-- this file is what Netlify's managed Postgres applies during a deploy.

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
);

CREATE TABLE IF NOT EXISTS settings (
  setting_key VARCHAR(64) PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS keyword_cache (
  seed VARCHAR(190) PRIMARY KEY,
  terms JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

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
);

CREATE INDEX IF NOT EXISTS products_created_at ON products (created_at DESC);
