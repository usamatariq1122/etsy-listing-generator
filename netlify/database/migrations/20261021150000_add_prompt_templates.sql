-- Phase 4: per-product-type listing prompts, editable in Settings.
-- One row per product type holds the seller's own wording for the text-model
-- brief. No row for a type means the built-in masterPrompt.js wording is used,
-- so a fresh database behaves exactly as before and this table only ever records
-- deliberate customisations. The wording itself is never committed here — it is
-- written into the database from the app, so a public repository stays generic.

CREATE TABLE IF NOT EXISTS prompt_templates (
  product_type VARCHAR(32) PRIMARY KEY,
  body TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- A listing may carry the product type whose template it was written from. Empty
-- means "Auto": the general template, which asks the model to infer the type from
-- the product name just as it always has.
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type VARCHAR(32);
