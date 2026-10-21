-- A CSV of product names becomes one listing per row. A bulk job keeps its rows
-- so History can show how far a batch got and a retry can find the ones that
-- failed. Each row links to the product the studio generated for it. Locally the
-- same two tables are created on first boot by server/src/db.js; this file is what
-- Netlify's managed Postgres applies.
CREATE TABLE IF NOT EXISTS bulk_jobs (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bulk_rows (
  job_id VARCHAR(36) NOT NULL REFERENCES bulk_jobs (id) ON DELETE CASCADE,
  idx INT NOT NULL,
  product_name VARCHAR(255) NOT NULL,
  keywords JSONB,
  product_id VARCHAR(36),
  status VARCHAR(24) NOT NULL DEFAULT 'queued',
  attempts INT NOT NULL DEFAULT 0,
  PRIMARY KEY (job_id, idx)
);
