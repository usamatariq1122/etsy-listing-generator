-- Which PDF file the portal will pack for each deliverable: the one it rendered
-- from the listing text, or the one the seller uploaded in its place. One row
-- per product and deliverable, so the manifest can name and size the real file
-- without opening it. Locally the same table is created on first boot by
-- server/src/db.js; this file is what Netlify's managed Postgres applies.
CREATE TABLE IF NOT EXISTS product_documents (
  product_id VARCHAR(36) NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  file_key VARCHAR(40) NOT NULL,
  source VARCHAR(12) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  original_name VARCHAR(255),
  bytes INT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (product_id, file_key)
);
