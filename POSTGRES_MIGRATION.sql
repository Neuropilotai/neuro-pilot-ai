-- Refresh Token Persistence Schema
-- Use this when scaling beyond single VM (multi-instance deployment)

-- Drop existing tables if they exist (use with caution in production)
-- DROP TABLE IF EXISTS refresh_tokens CASCADE;
-- DROP TABLE IF EXISTS refresh_token_families CASCADE;

-- Main tables for distributed refresh token management
CREATE TABLE refresh_token_families (
  family_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL,
  device_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ NULL,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_agent TEXT,
  ip_address INET,
  CONSTRAINT families_user_device_unique UNIQUE (user_id, device_id)
);

CREATE TABLE refresh_tokens (
  jti UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES refresh_token_families(family_id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL,
  device_id UUID NOT NULL,
  token_hash TEXT NOT NULL UNIQUE, -- SHA-256 of raw token
  status TEXT NOT NULL CHECK (status IN ('active', 'rotated', 'revoked')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rotated_at TIMESTAMPTZ NULL,
  ip_address INET,
  user_agent TEXT
);

-- Indexes for performance
CREATE INDEX refresh_tokens_family_idx ON refresh_tokens(family_id);
CREATE INDEX refresh_tokens_hash_idx ON refresh_tokens(token_hash);
CREATE INDEX refresh_tokens_status_idx ON refresh_tokens(status) WHERE status = 'active';
CREATE INDEX refresh_tokens_expires_idx ON refresh_tokens(expires_at);
CREATE INDEX refresh_token_families_user_idx ON refresh_token_families(user_id);
CREATE INDEX refresh_token_families_revoked_idx ON refresh_token_families(revoked_at) WHERE revoked_at IS NULL;

-- Migration helper views
CREATE VIEW active_refresh_tokens AS
SELECT rt.*, rtf.revoked_at as family_revoked_at
FROM refresh_tokens rt
JOIN refresh_token_families rtf ON rt.family_id = rtf.family_id
WHERE rt.status = 'active' 
  AND rtf.revoked_at IS NULL 
  AND rt.expires_at > NOW();

CREATE VIEW token_family_stats AS
SELECT 
  rtf.family_id,
  rtf.user_id,
  rtf.device_id,
  rtf.created_at as family_created,
  rtf.revoked_at,
  COUNT(rt.jti) as total_tokens,
  COUNT(CASE WHEN rt.status = 'active' THEN 1 END) as active_tokens,
  MAX(rt.created_at) as last_token_created
FROM refresh_token_families rtf
LEFT JOIN refresh_tokens rt ON rtf.family_id = rt.family_id
GROUP BY rtf.family_id, rtf.user_id, rtf.device_id, rtf.created_at, rtf.revoked_at;

-- Cleanup procedures
CREATE OR REPLACE FUNCTION cleanup_expired_tokens()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete expired tokens
  DELETE FROM refresh_tokens 
  WHERE expires_at < NOW() - INTERVAL '1 day';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- Delete families with no active tokens
  DELETE FROM refresh_token_families rtf
  WHERE NOT EXISTS (
    SELECT 1 FROM refresh_tokens rt 
    WHERE rt.family_id = rtf.family_id 
    AND rt.status = 'active'
  );
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Sample migration code (Node.js/JavaScript)
/*
// Refresh token rotation with DB persistence
async function rotateRefreshToken(tokenHash, ipAddress, userAgent) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Find current token with row lock
    const tokenResult = await client.query(`
      SELECT rt.*, rtf.revoked_at as family_revoked_at
      FROM refresh_tokens rt
      JOIN refresh_token_families rtf ON rt.family_id = rtf.family_id
      WHERE rt.token_hash = $1
      FOR UPDATE
    `, [tokenHash]);
    
    if (tokenResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { error: 'INVALID_TOKEN' };
    }
    
    const token = tokenResult.rows[0];
    
    // Check if family is revoked
    if (token.family_revoked_at) {
      await client.query('ROLLBACK');
      return { error: 'FAMILY_REVOKED' };
    }
    
    // Check if token was already rotated (reuse detection)
    if (token.status !== 'active') {
      // Revoke entire family
      await client.query(`
        UPDATE refresh_token_families 
        SET revoked_at = NOW() 
        WHERE family_id = $1
      `, [token.family_id]);
      
      await client.query(`
        UPDATE refresh_tokens 
        SET status = 'revoked' 
        WHERE family_id = $1
      `, [token.family_id]);
      
      await client.query('COMMIT');
      return { error: 'TOKEN_REUSE_DETECTED' };
    }
    
    // Mark current token as rotated
    await client.query(`
      UPDATE refresh_tokens 
      SET status = 'rotated', rotated_at = NOW() 
      WHERE jti = $1
    `, [token.jti]);
    
    // Create new token
    const newJti = crypto.randomUUID();
    const newTokenRaw = crypto.randomBytes(32).toString('base64url');
    const newTokenHash = crypto.createHash('sha256').update(newTokenRaw).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    
    await client.query(`
      INSERT INTO refresh_tokens 
      (jti, family_id, user_id, device_id, token_hash, status, expires_at, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5, 'active', $6, $7, $8)
    `, [newJti, token.family_id, token.user_id, token.device_id, newTokenHash, expiresAt, ipAddress, userAgent]);
    
    // Update family last_used_at
    await client.query(`
      UPDATE refresh_token_families 
      SET last_used_at = NOW() 
      WHERE family_id = $1
    `, [token.family_id]);
    
    await client.query('COMMIT');
    
    return {
      success: true,
      refreshToken: newTokenRaw,
      jti: newJti,
      expiresAt
    };
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Daily cleanup job
setInterval(async () => {
  try {
    const result = await pool.query('SELECT cleanup_expired_tokens()');
    console.log(`Cleaned up ${result.rows[0].cleanup_expired_tokens} expired tokens`);
  } catch (error) {
    console.error('Token cleanup failed:', error);
  }
}, 24 * 60 * 60 * 1000); // Daily
*/

-- Performance monitoring queries
/*
-- Active sessions by user
SELECT user_id, COUNT(*) as active_sessions
FROM active_refresh_tokens
GROUP BY user_id
ORDER BY active_sessions DESC;

-- Token family health
SELECT 
  COUNT(*) as total_families,
  COUNT(CASE WHEN revoked_at IS NULL THEN 1 END) as active_families,
  COUNT(CASE WHEN revoked_at IS NOT NULL THEN 1 END) as revoked_families
FROM refresh_token_families;

-- Token reuse incidents (last 24h)
SELECT user_id, device_id, COUNT(*) as reuse_count
FROM refresh_tokens
WHERE status = 'revoked' 
  AND rotated_at > NOW() - INTERVAL '24 hours'
GROUP BY user_id, device_id
ORDER BY reuse_count DESC;
*/