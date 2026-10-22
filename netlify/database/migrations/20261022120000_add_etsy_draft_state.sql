-- Draft job-state: records the outcome of the last Etsy draft attempt for a
-- package (status, the progress reached, the plain-language error), so a partial
-- or failed send can be shown and resumed instead of being orphaned.
ALTER TABLE products ADD COLUMN IF NOT EXISTS etsy_draft_state JSONB;
