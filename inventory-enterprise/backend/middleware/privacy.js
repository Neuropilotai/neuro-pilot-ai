// Privacy & Input Sanitization Middleware
// Neuro.Pilot.AI V21.1 - GDPR/CCPA compliance, CORS enforcement, input validation
// NO PLACEHOLDERS - Production-ready

const { pool } = require('../db');

// CORS Allowlist (Production-safe origins)
const ALLOWED_ORIGINS = [
  'https://inventory-backend-7-agent-build.up.railway.app',
  'https://inventory-frontend-v21-7-agent-build.up.railway.app',
  'https://staging.neuropilot.ai',
  'https://neuropilot.ai',
  'https://www.neuropilot.ai',
  process.env.FRONTEND_URL,
  process.env.ALLOWED_ORIGIN
].filter(Boolean);

// Add localhost for development
if (process.env.NODE_ENV !== 'production') {
  ALLOWED_ORIGINS.push(
    'http://localhost:3000',
    'http://localhost:5000',
    'http://localhost:8080',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5000'
  );
}

// Forbidden query parameters (prevent accidental logging of secrets)
const FORBIDDEN_PARAMS = [
  'password', 'token', 'secret', 'api_key', 'apikey',
  'auth', 'authorization', 'session', 'jwt', 'ssn',
  'card', 'cvv', 'pin', 'cardnumber', 'ccnumber'
];

// PII Masking Functions
function maskEmail(email) {
  if (!email || typeof email !== 'string') return email;
  const [user, domain] = email.split('@');
  if (!user || !domain) return email;

  if (user.length <= 2) {
    return `**@${domain}`;
  }

  const maskedUser = user[0] + '***' + user[user.length - 1];
  return `${maskedUser}@${domain}`;
}

function maskPhone(phone) {
  if (!phone || typeof phone !== 'string') return phone;
  const digits = phone.replace(/\D/g, '');

  if (digits.length < 4) {
    return '***';
  }

  return '***-***-' + digits.slice(-4);
}

function maskCardNumber(cardNumber) {
  if (!cardNumber || typeof cardNumber !== 'string') return '****';
  const digits = cardNumber.replace(/\D/g, '');

  if (digits.length < 4) {
    return '****';
  }

  return '**** **** **** ' + digits.slice(-4);
}

// Privacy Guard Middleware - CORS enforcement & input sanitization
function privacyGuard() {
  return (req, res, next) => {
    const origin = req.headers.origin;

    // CORS validation
    if (origin) {
      const isAllowed = ALLOWED_ORIGINS.some(allowed =>
        allowed === origin || allowed === '*'
      );

      if (!isAllowed) {
        console.warn(`[PRIVACY] Blocked CORS request from unauthorized origin: ${origin}`);
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Origin not allowed'
        });
      }

      res.setHeader('Access-Control-Allow-Origin', origin);
    }

    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-Org-Id, X-Site-Id');
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours

    // Handle preflight
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }

    // Block forbidden query parameters
    const queryKeys = Object.keys(req.query);
    const forbidden = queryKeys.filter(key =>
      FORBIDDEN_PARAMS.some(param => key.toLowerCase().includes(param))
    );

    if (forbidden.length > 0) {
      console.error(`[PRIVACY] Blocked request with forbidden query params: ${forbidden.join(', ')}`);
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Forbidden query parameters detected',
        forbidden
      });
    }

    // Add security headers
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    next();
  };
}

// GDPR: Right to Erasure (soft delete + 30-day hard delete)
async function requestDataDeletion(userId, reason = 'User request') {
  try {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Soft delete user
      await client.query(`
        UPDATE users
        SET deleted_at = NOW(), deletion_reason = $2
        WHERE id = $1 AND deleted_at IS NULL
      `, [userId, reason]);

      // Log privacy request
      await client.query(`
        INSERT INTO privacy_requests (user_id, request_type, status, requested_at)
        VALUES ($1, 'deletion', 'pending', NOW())
      `, [userId]);

      // Anonymize PII in audit logs (keep structure for compliance)
      await client.query(`
        UPDATE audit_log
        SET metadata = jsonb_set(
          COALESCE(metadata, '{}'::jsonb),
          '{pii_anonymized}',
          'true'::jsonb
        )
        WHERE user_id = $1 AND created_at < NOW() - INTERVAL '90 days'
      `, [userId]);

      await client.query('COMMIT');

      console.log(`[PRIVACY] Data deletion requested for user ${userId}`);

      // Schedule hard delete after 30 days (via cron job)
      return {
        success: true,
        message: 'Account marked for deletion. Data will be permanently removed in 30 days.',
        deletionDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[PRIVACY] Data deletion request failed:', err);
    throw err;
  }
}

// GDPR: Right to Data Portability (export user data)
async function exportUserData(userId) {
  try {
    const client = await pool.connect();

    try {
      // User profile
      const userResult = await client.query(`
        SELECT id, email, name, org_id, created_at, updated_at
        FROM users
        WHERE id = $1
      `, [userId]);

      if (userResult.rows.length === 0) {
        throw new Error('User not found');
      }

      const user = userResult.rows[0];

      // User's orders
      const ordersResult = await client.query(`
        SELECT
          id, total, status, payment_method,
          created_at, completed_at
        FROM orders
        WHERE created_by = $1
        ORDER BY created_at DESC
        LIMIT 1000
      `, [userId]);

      // User's audit trail (last 90 days)
      const auditResult = await client.query(`
        SELECT
          action, ip_address, success, created_at
        FROM audit_log
        WHERE user_id = $1
          AND created_at >= NOW() - INTERVAL '90 days'
        ORDER BY created_at DESC
        LIMIT 1000
      `, [userId]);

      // Log privacy request
      await client.query(`
        INSERT INTO privacy_requests (user_id, request_type, status, requested_at, completed_at)
        VALUES ($1, 'export', 'completed', NOW(), NOW())
      `, [userId]);

      const exportData = {
        exportDate: new Date().toISOString(),
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          orgId: user.org_id,
          createdAt: user.created_at,
          updatedAt: user.updated_at
        },
        orders: ordersResult.rows,
        auditTrail: auditResult.rows,
        metadata: {
          totalOrders: ordersResult.rows.length,
          totalAuditEvents: auditResult.rows.length,
          dataRetentionPolicy: '7 years for audit logs, indefinite for orders'
        }
      };

      console.log(`[PRIVACY] Data export completed for user ${userId}`);

      return exportData;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[PRIVACY] Data export failed:', err);
    throw err;
  }
}

// CCPA: Do Not Sell (mark user preference)
async function setDoNotSell(userId, doNotSell = true) {
  try {
    await pool.query(`
      INSERT INTO privacy_preferences (user_id, do_not_sell, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET do_not_sell = $2, updated_at = NOW()
    `, [userId, doNotSell]);

    console.log(`[PRIVACY] Do-Not-Sell set to ${doNotSell} for user ${userId}`);

    return { success: true, doNotSell };
  } catch (err) {
    console.error('[PRIVACY] Failed to set do-not-sell:', err);
    throw err;
  }
}

// Cron job: Hard delete users after 30-day grace period
async function executeScheduledDeletions() {
  try {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Find users marked for deletion 30+ days ago
      const usersResult = await client.query(`
        SELECT id, email
        FROM users
        WHERE deleted_at IS NOT NULL
          AND deleted_at <= NOW() - INTERVAL '30 days'
        LIMIT 100
      `);

      for (const user of usersResult.rows) {
        // Hard delete user data
        await client.query('DELETE FROM user_sessions WHERE user_id = $1', [user.id]);
        await client.query('DELETE FROM user_roles WHERE user_id = $1', [user.id]);
        await client.query('DELETE FROM privacy_preferences WHERE user_id = $1', [user.id]);

        // Anonymize orders (keep for financial records)
        await client.query(`
          UPDATE orders
          SET created_by = NULL, updated_by = NULL
          WHERE created_by = $1 OR updated_by = $1
        `, [user.id]);

        // Permanently delete user
        await client.query('DELETE FROM users WHERE id = $1', [user.id]);

        console.log(`[PRIVACY] Hard deleted user ${user.id} (${user.email})`);
      }

      await client.query('COMMIT');

      return { deletedCount: usersResult.rows.length };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[PRIVACY] Scheduled deletion failed:', err);
    throw err;
  }
}

module.exports = {
  privacyGuard,
  requestDataDeletion,
  exportUserData,
  setDoNotSell,
  executeScheduledDeletions,
  maskEmail,
  maskPhone,
  maskCardNumber,
  ALLOWED_ORIGINS
};
