// routes/auth-db.js
// Database-backed authentication routes for SQLite
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const db = require('../config/database');

const router = express.Router();

// Environment variables
const {
  JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production',
  REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || 'dev-refresh-secret-change-in-production',
  ACCESS_TTL_MIN = process.env.ACCESS_TTL_MIN || '30',
  REFRESH_TTL_DAYS = process.env.REFRESH_TTL_DAYS || '90'
} = process.env;

// Helper functions
function signAccessToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      id: user.id,
      email: user.email,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: `${ACCESS_TTL_MIN}m` }
  );
}

function signRefreshToken(user) {
  return jwt.sign(
    { sub: user.id, typ: 'refresh' },
    REFRESH_TOKEN_SECRET,
    { expiresIn: `${REFRESH_TTL_DAYS}d` }
  );
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

function verifyAccessToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

function verifyRefreshToken(token) {
  try {
    return jwt.verify(token, REFRESH_TOKEN_SECRET);
  } catch (error) {
    return null;
  }
}

// Rate limiters
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later' }
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many refresh requests' }
});

// Zod schemas
const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters').max(128)
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required')
});

// Database helper to run queries
const dbInstance = db.getConnection ? db : new db();
const runQuery = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    const connection = dbInstance.getConnection ? dbInstance.getConnection() : dbInstance.db;
    connection.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

const runUpdate = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    const connection = dbInstance.getConnection ? dbInstance.getConnection() : dbInstance.db;
    connection.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
};

// POST /auth/login
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const parse = loginSchema.safeParse(req.body || {});
    if (!parse.success) {
      return res.status(400).json({
        error: 'Invalid request',
        details: parse.error.errors
      });
    }

    const { email, password } = parse.data;

    // Find user by email
    const users = await runQuery(
      'SELECT id, email, role, password_hash, is_active FROM app_user WHERE email = ? LIMIT 1',
      [email]
    );

    const user = users[0];

    if (!user || !user.password_hash) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.is_active) {
      return res.status(403).json({ error: 'Account is inactive' });
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last login
    await runUpdate(
      'UPDATE app_user SET last_login = datetime(\'now\') WHERE id = ?',
      [user.id]
    );

    // Generate tokens
    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);

    // Store refresh token hash
    const expiresAt = new Date(Date.now() + parseInt(REFRESH_TTL_DAYS, 10) * 24 * 60 * 60 * 1000)
      .toISOString().replace('T', ' ').substring(0, 19);

    await runUpdate(
      'INSERT INTO refresh_token (user_id, token_hash, user_agent, ip, expires_at) VALUES (?, ?, ?, ?, ?)',
      [
        user.id,
        hashToken(refreshToken),
        req.headers['user-agent'] || null,
        req.ip || null,
        expiresAt
      ]
    );

    res.json({
      message: 'Login successful',
      token: accessToken,
      refreshToken: refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed', details: error.message });
  }
});

// POST /auth/refresh
router.post('/refresh', refreshLimiter, async (req, res) => {
  try {
    const parse = refreshSchema.safeParse(req.body || {});
    if (!parse.success) {
      return res.status(400).json({
        error: 'Invalid request',
        details: parse.error.errors
      });
    }

    const { refreshToken } = parse.data;

    // Verify refresh token JWT
    const payload = verifyRefreshToken(refreshToken);
    if (!payload || payload.typ !== 'refresh') {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    // Verify token exists in database and not revoked
    const tokenHash = hashToken(refreshToken);
    const tokens = await runQuery(
      `SELECT rt.id, u.id as user_id, u.email, u.role, u.is_active
       FROM refresh_token rt
       JOIN app_user u ON u.id = rt.user_id
       WHERE rt.user_id = ?
         AND rt.token_hash = ?
         AND rt.revoked_at IS NULL
         AND datetime(rt.expires_at) > datetime('now')
       LIMIT 1`,
      [payload.sub, tokenHash]
    );

    const tokenRecord = tokens[0];
    if (!tokenRecord) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    if (!tokenRecord.is_active) {
      return res.status(403).json({ error: 'Account is inactive' });
    }

    // Rotate tokens: revoke old, issue new
    await runUpdate(
      'UPDATE refresh_token SET revoked_at = datetime(\'now\') WHERE user_id = ? AND token_hash = ?',
      [payload.sub, tokenHash]
    );

    const user = {
      id: tokenRecord.user_id,
      email: tokenRecord.email,
      role: tokenRecord.role
    };

    const newAccessToken = signAccessToken(user);
    const newRefreshToken = signRefreshToken(user);

    // Store new refresh token
    const expiresAt = new Date(Date.now() + parseInt(REFRESH_TTL_DAYS, 10) * 24 * 60 * 60 * 1000)
      .toISOString().replace('T', ' ').substring(0, 19);

    await runUpdate(
      'INSERT INTO refresh_token (user_id, token_hash, user_agent, ip, expires_at) VALUES (?, ?, ?, ?, ?)',
      [
        user.id,
        hashToken(newRefreshToken),
        req.headers['user-agent'] || null,
        req.ip || null,
        expiresAt
      ]
    );

    res.json({
      token: newAccessToken,
      refreshToken: newRefreshToken
    });

  } catch (error) {
    console.error('Refresh error:', error);
    res.status(500).json({ error: 'Token refresh failed', details: error.message });
  }
});

// POST /auth/logout
router.post('/logout', async (req, res) => {
  try {
    const { refreshToken } = req.body || {};

    if (!refreshToken) {
      return res.json({ message: 'Logout successful' });
    }

    const payload = verifyRefreshToken(refreshToken);
    if (!payload) {
      return res.json({ message: 'Logout successful' });
    }

    // Revoke refresh token
    await runUpdate(
      'UPDATE refresh_token SET revoked_at = datetime(\'now\') WHERE user_id = ? AND token_hash = ? AND revoked_at IS NULL',
      [payload.sub, hashToken(refreshToken)]
    );

    res.json({ message: 'Logout successful' });

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed', details: error.message });
  }
});

// GET /auth/me (requires valid access token)
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    const payload = verifyAccessToken(token);

    if (!payload) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Get fresh user data from database
    const users = await runQuery(
      'SELECT id, email, first_name, last_name, role, is_active, created_at, last_login FROM app_user WHERE id = ? LIMIT 1',
      [payload.sub || payload.id]
    );

    const user = users[0];
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.is_active) {
      return res.status(403).json({ error: 'Account is inactive' });
    }

    res.json({
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role,
      isActive: user.is_active,
      createdAt: user.created_at,
      lastLogin: user.last_login
    });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user info', details: error.message });
  }
});

module.exports = router;
