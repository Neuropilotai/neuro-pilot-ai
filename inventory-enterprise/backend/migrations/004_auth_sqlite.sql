-- 004_auth_sqlite.sql
-- Password auth + refresh tokens for JWT (SQLite version)
-- Run with: sqlite3 database.db < migrations/004_auth_sqlite.sql

-- Create users table (app_user) if not exists
CREATE TABLE IF NOT EXISTS app_user (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  password_updated_at TEXT DEFAULT (datetime('now')),
  first_name TEXT,
  last_name TEXT,
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('owner', 'admin', 'manager', 'staff', 'readonly')),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login TEXT
);

CREATE INDEX IF NOT EXISTS idx_app_user_email ON app_user(email);
CREATE INDEX IF NOT EXISTS idx_app_user_role ON app_user(role);
CREATE INDEX IF NOT EXISTS idx_app_user_active ON app_user(is_active);

-- Refresh token store (rotating tokens per user/device)
CREATE TABLE IF NOT EXISTS refresh_token (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  user_agent TEXT,
  ip TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_refresh_user_expires ON refresh_token(user_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_refresh_token_hash ON refresh_token(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_revoked ON refresh_token(revoked_at) WHERE revoked_at IS NULL;

-- View for active refresh tokens
CREATE VIEW IF NOT EXISTS active_refresh_tokens AS
SELECT id, user_id, user_agent, ip, expires_at, created_at
FROM refresh_token
WHERE revoked_at IS NULL AND datetime(expires_at) > datetime('now');
