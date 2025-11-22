// Audit Logging Middleware
// Neuro.Pilot.AI V21.1 - Production-ready immutable audit trail
// 7-year retention, async queue, Prometheus metrics

const { pool } = require('../db');
const promClient = require('prom-client');

// Prometheus metrics - get or create to avoid duplicate registration errors
const register = promClient.register;

let auditEventsTotal, auditQueueDepth;
try {
  auditEventsTotal = register.getSingleMetric('audit_events_total');
  if (!auditEventsTotal) {
    auditEventsTotal = new promClient.Counter({
      name: 'audit_events_total',
      help: 'Total audit events logged',
      labelNames: ['action', 'success']
    });
  }
} catch (e) {
  auditEventsTotal = new promClient.Counter({
    name: 'audit_events_total',
    help: 'Total audit events logged',
    labelNames: ['action', 'success']
  });
}

try {
  auditQueueDepth = register.getSingleMetric('audit_queue_depth');
  if (!auditQueueDepth) {
    auditQueueDepth = new promClient.Gauge({
      name: 'audit_queue_depth',
      help: 'Current audit event queue depth'
    });
  }
} catch (e) {
  auditQueueDepth = new promClient.Gauge({
    name: 'audit_queue_depth',
    help: 'Current audit event queue depth'
  });
}

// Async audit queue (non-blocking writes)
const auditQueue = [];
let processingQueue = false;

// Secret redaction patterns
const SECRET_PATTERNS = [
  /password/i,
  /token/i,
  /secret/i,
  /api[_-]?key/i,
  /authorization/i,
  /jwt/i,
  /bearer/i,
  /session/i
];

// Redact secrets from objects
function redactSecrets(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(redactSecrets);

  const redacted = {};

  for (const [key, value] of Object.entries(obj)) {
    const shouldRedact = SECRET_PATTERNS.some(pattern => pattern.test(key));

    if (shouldRedact) {
      redacted[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      redacted[key] = redactSecrets(value);
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}

// Enqueue audit event (async, non-blocking)
function enqueueAudit(entry) {
  auditQueue.push({
    ...entry,
    queued_at: new Date()
  });

  auditQueueDepth.inc();

  // Start processing if not already running
  if (!processingQueue) {
    setImmediate(processAuditQueue);
  }
}

// Process audit queue (background worker)
async function processAuditQueue() {
  if (processingQueue || auditQueue.length === 0) {
    return;
  }

  processingQueue = true;

  try {
    while (auditQueue.length > 0) {
      const batch = auditQueue.splice(0, 100); // Process up to 100 at once

      for (const entry of batch) {
        try {
          await writeAuditLog(entry);
          auditQueueDepth.dec();
        } catch (err) {
          console.error('[AUDIT] Failed to write log entry:', err);
          // Don't re-queue to avoid infinite loops
        }
      }
    }
  } finally {
    processingQueue = false;

    // Check if more items were added while processing
    if (auditQueue.length > 0) {
      setImmediate(processAuditQueue);
    }
  }
}

// Helper to convert org_id to integer (handles "default-org" string)
function normalizeOrgId(orgId) {
  if (typeof orgId === 'number' && !isNaN(orgId)) return orgId;
  if (typeof orgId === 'string') {
    const parsed = parseInt(orgId, 10);
    if (!isNaN(parsed)) return parsed;
  }
  return 1; // Default org_id for single-tenant or fallback
}

// Write audit log to database
async function writeAuditLog(entry) {
  try {
    const client = await pool.connect();

    try {
      await client.query(`
        INSERT INTO audit_log (
          action, org_id, actor_id, ip,
          details, success, latency_ms, created_at
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, NOW())
      `, [
        entry.action,
        normalizeOrgId(entry.org_id),
        entry.actor_id || entry.user_id || null,  // Support both field names
        entry.ip || entry.ip_address || null,  // Support both field names
        JSON.stringify(redactSecrets(entry.details || entry.metadata || {})),
        entry.success !== false, // Default true
        entry.latency_ms || null
      ]);

      auditEventsTotal.inc({
        action: entry.action,
        success: entry.success !== false ? 'true' : 'false'
      });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[AUDIT] Database write failed:', err);
    throw err;
  }
}

// Audit middleware factory
function auditLog(action) {
  return (req, res, next) => {
    const startTime = Date.now();

    // Capture response finish
    res.on('finish', () => {
      const latencyMs = Date.now() - startTime;

      const auditEntry = {
        action,
        org_id: req.tenancy?.org_id || req.user?.org_id || 1,
        actor_id: req.user?.id || null,
        ip: req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress,
        success: res.statusCode >= 200 && res.statusCode < 400,
        latency_ms: latencyMs,
        details: {
          method: req.method,
          path: req.path,
          status: res.statusCode,
          user_email: req.user?.email || null,
          query: redactSecrets(req.query || {}),
          body: redactSecrets(req.body || {}),
          user_agent: req.headers['user-agent']
        }
      };

      enqueueAudit(auditEntry);
    });

    next();
  };
}

// Query audit logs (for compliance reports)
async function queryAuditLogs(filters = {}, limit = 1000) {
  try {
    const whereClauses = [];
    const params = [];
    let paramCount = 0;

    if (filters.user_id || filters.actor_id) {
      paramCount++;
      whereClauses.push(`actor_id = $${paramCount}`);
      params.push(filters.actor_id || filters.user_id);
    }

    if (filters.org_id) {
      paramCount++;
      whereClauses.push(`org_id = $${paramCount}`);
      params.push(normalizeOrgId(filters.org_id));
    }

    if (filters.action) {
      paramCount++;
      whereClauses.push(`action = $${paramCount}`);
      params.push(filters.action);
    }

    if (filters.start_date) {
      paramCount++;
      whereClauses.push(`created_at >= $${paramCount}`);
      params.push(filters.start_date);
    }

    if (filters.end_date) {
      paramCount++;
      whereClauses.push(`created_at <= $${paramCount}`);
      params.push(filters.end_date);
    }

    const whereClause = whereClauses.length > 0
      ? `WHERE ${whereClauses.join(' AND ')}`
      : '';

    paramCount++;
    const limitParam = `$${paramCount}`;
    params.push(limit);

    const result = await pool.query(`
      SELECT
        id, action, org_id, actor_id, ip,
        details, success, latency_ms, created_at
      FROM audit_log
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ${limitParam}
    `, params);

    return result.rows;
  } catch (err) {
    console.error('[AUDIT] Query failed:', err);
    throw err;
  }
}

// Get audit statistics
async function getAuditStats(orgId, days = 30) {
  try {
    const normalizedOrgId = normalizeOrgId(orgId);
    const result = await pool.query(`
      SELECT
        action,
        COUNT(*) AS count,
        AVG(latency_ms) AS avg_latency,
        SUM(CASE WHEN success THEN 1 ELSE 0 END) AS success_count,
        SUM(CASE WHEN NOT success THEN 1 ELSE 0 END) AS failure_count
      FROM audit_log
      WHERE org_id = $1
        AND created_at >= NOW() - INTERVAL '${days} days'
      GROUP BY action
      ORDER BY count DESC
    `, [normalizedOrgId]);

    const totalResult = await pool.query(`
      SELECT COUNT(*) AS total
      FROM audit_log
      WHERE org_id = $1
        AND created_at >= NOW() - INTERVAL '${days} days'
    `, [normalizedOrgId]);

    return {
      orgId,
      periodDays: days,
      totalEvents: parseInt(totalResult.rows[0].total, 10),
      byAction: result.rows.map(row => ({
        action: row.action,
        count: parseInt(row.count, 10),
        avgLatency: parseFloat(row.avg_latency) || 0,
        successCount: parseInt(row.success_count, 10),
        failureCount: parseInt(row.failure_count, 10)
      }))
    };
  } catch (err) {
    console.error('[AUDIT] Stats query failed:', err);
    throw err;
  }
}

// Export user audit trail (GDPR compliance)
async function exportUserAuditTrail(userId, days = 90) {
  try {
    const result = await pool.query(`
      SELECT
        action, ip, success, created_at,
        details->>'method' AS method,
        details->>'path' AS path,
        details->>'status' AS status
      FROM audit_log
      WHERE actor_id = $1
        AND created_at >= NOW() - INTERVAL '${days} days'
      ORDER BY created_at DESC
    `, [userId]);

    return result.rows;
  } catch (err) {
    console.error('[AUDIT] Export failed:', err);
    throw err;
  }
}

module.exports = {
  auditLog,
  enqueueAudit,
  queryAuditLogs,
  getAuditStats,
  exportUserAuditTrail,
  redactSecrets
};
