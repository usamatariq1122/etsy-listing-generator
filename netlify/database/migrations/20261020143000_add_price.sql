-- The seller's own price for the listing. Nothing in the portal guesses it, so
-- the column starts empty and only changes when the seller types a number.
-- The same column is added on first boot by server/src/db.js for a local database.
ALTER TABLE products ADD COLUMN IF NOT EXISTS price NUMERIC(10,2);
