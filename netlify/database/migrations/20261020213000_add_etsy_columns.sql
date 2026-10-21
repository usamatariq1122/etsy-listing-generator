-- Etsy draft support. One column set on the listing row remembers what was sent
-- to Etsy and when, so "Create Etsy Draft" can say it already did and show the
-- draft link again instead of making a second listing. The token itself is not
-- stored here - it is an encrypted row in the settings table.
-- The same columns are added on first boot by server/src/db.js for a local
-- database; this file is what Netlify's managed Postgres applies during a deploy.
ALTER TABLE products ADD COLUMN IF NOT EXISTS etsy_listing_id VARCHAR(64);
ALTER TABLE products ADD COLUMN IF NOT EXISTS etsy_draft_url VARCHAR(512);
ALTER TABLE products ADD COLUMN IF NOT EXISTS etsy_synced_at TIMESTAMPTZ;

-- Etsy's category tree, flattened once and kept for a day. It is public data
-- that changes rarely, and a seller should not have to wait for it on every
-- search they type. Cached the same way as the keyword suggestions.
CREATE TABLE IF NOT EXISTS taxonomy_cache (
  cache_key VARCHAR(64) NOT NULL PRIMARY KEY,
  nodes JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
