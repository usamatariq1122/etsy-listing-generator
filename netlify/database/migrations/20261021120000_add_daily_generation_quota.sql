-- Phase 3: per-user daily generation quota.
-- Adds the columns initDb() already mirrors, so a hosted Postgres reaches the
-- same shape as a local database. generation_today counts generations started on
-- generation_date; when the stored date is no longer CURRENT_DATE the day has
-- rolled over and consumeGeneration() restarts it. generation_count stays the
-- lifetime total for the admin dashboard.

ALTER TABLE users ADD COLUMN IF NOT EXISTS generation_today INT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS generation_date DATE;
