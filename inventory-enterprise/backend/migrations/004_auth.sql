-- 004_auth.sql
-- Password auth + refresh tokens for JWT

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Add password fields to app_user (if not present; safe ALTERs)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='app_user' AND column_name='password_hash'
  ) THEN
    ALTER TABLE app_user
      ADD COLUMN password_hash text,
      ADD COLUMN password_updated_at timestamptz;
  END IF;
END
$$;

-- Refresh token store (rotating tokens per user/device)
CREATE TABLE IF NOT EXISTS refresh_token (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  token_hash    text NOT NULL,             -- hash of the refresh token
  user_agent    text,
  ip            inet,
  expires_at    timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  revoked_at    timestamptz
);

CREATE INDEX IF NOT EXISTS idx_refresh_user_expires
  ON refresh_token(user_id, expires_at DESC);

-- Simple view useful for audits
CREATE OR REPLACE VIEW active_refresh_tokens AS
SELECT id, user_id, user_agent, ip, expires_at, created_at
FROM refresh_token
WHERE revoked_at IS NULL AND expires_at > now();

-- RLS (optional: usually not needed for internal auth tables; keep closed)
ALTER TABLE refresh_token ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON refresh_token FROM PUBLIC;
