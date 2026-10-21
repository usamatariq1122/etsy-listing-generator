-- Phase 2: named accounts, sessions and email verification, plus the ownership
-- column that scopes every stored listing to the account that made it. Nothing
-- here rewrites or removes an earlier migration; existing products simply get a
-- NULL user_id until the first account (the owner) claims them.

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) PRIMARY KEY,
  email VARCHAR(320) NOT NULL UNIQUE,
  name VARCHAR(200),
  password_hash TEXT NOT NULL,
  role VARCHAR(16) NOT NULL DEFAULT 'user',
  verified_at TIMESTAMPTZ,
  generation_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS user_sessions_expires_at ON user_sessions (expires_at);

-- One row per outstanding email token (verify / reset). The token itself is
-- never stored, only its hash, so a database read cannot hand out a live link.
CREATE TABLE IF NOT EXISTS user_verifications (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind VARCHAR(16) NOT NULL,
  token_hash VARCHAR(64) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS user_verifications_token_hash ON user_verifications (token_hash);

ALTER TABLE products ADD COLUMN IF NOT EXISTS user_id VARCHAR(36);
CREATE INDEX IF NOT EXISTS products_user_id ON products (user_id);
-- A new listing's id carries its owner (`<user>:<uuid>`), so its files are
-- namespaced with no change to the pipeline. Widen the key to hold that prefix.
ALTER TABLE products ALTER COLUMN id TYPE VARCHAR(80);

ALTER TABLE bulk_jobs ADD COLUMN IF NOT EXISTS user_id VARCHAR(36);
CREATE INDEX IF NOT EXISTS bulk_jobs_user_id ON bulk_jobs (user_id);
ALTER TABLE bulk_jobs ALTER COLUMN id TYPE VARCHAR(80);
