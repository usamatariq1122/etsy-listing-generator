-- The keyword tick step: the phrases the seller picked for one listing, kept on
-- the row so a rewrite uses the same selection. Same column is added on first
-- boot by server/src/db.js for a local database.
ALTER TABLE products ADD COLUMN IF NOT EXISTS selected_keywords JSONB;
