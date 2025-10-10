/**
 * Audit Logging Middleware - v2.8.0
 * Comprehensive logging for all API operations
 */

const crypto = require('crypto');
const metricsExporter = require('../utils/metricsExporter');

class AuditLogger {
  constructor(db) {
    this.db = db;
    this.enabled = process.env.AUDIT_LOG_ENABLED !== 'false';
    this.piiFields = ['password', 'secret', 'token', 'api_key', 'backup_codes'];
    this.samplingRate = parseFloat(process.env.AUDIT_SAMPLING_RATE) || 1.0; // 1.0 = 100%

    console.log(`Audit Logger initialized: ${this.enabled ? 'ENABLED' : 'DISABLED'}`);
  }

  /**
   * Main audit middleware
   * Apply after auth & tenant middleware
   */
  auditMiddleware() {
    return async (req, res, next) => {
      if (!this.enabled) {
        return next();
      }

      // Sample requests if sampling rate < 1.0
      if (Math.random() > this.samplingRate) {
        return next();
      }

      const startTime = Date.now();

      // Capture original methods
      const originalJson = res.json.bind(res);
      const originalSend = res.send.bind(res);

      // Store request metadata
      req.auditStart = startTime;
      req.auditId = crypto.randomBytes(16).toString('hex');

      // Override response methods to capture data
      res.json = (data) => {
        this.logRequest(req, res, data, startTime);
        return originalJson(data);
      };

      res.send = (data) => {
        this.logRequest(req, res, data, startTime);
        return originalSend(data);
      };

      next();
    };
  }

  /**
   * Log API request
   */
  async logRequest(req, res, responseData, startTime) {
    try {
      const duration = Date.now() - startTime;

      // Determine if this request should be logged
      const shouldLog = this.shouldLogRequest(req);

      if (!shouldLog) {
        return;
      }

      // Extract request details
      const auditEntry = {
        event_type: this.determineEventType(req),
        action: req.method,
        endpoint: req.path,
        user_id: req.user?.id || null,
        user_email: req.user?.email || null,
        tenant_id: req.tenant?.tenantId || null,
        ip_address: this.getClientIP(req),
        user_agent: req.headers['user-agent'] || null,
        request_body: this.scrubPII(req.body),
        response_status: res.statusCode,
        duration_ms: duration,
        success: res.statusCode >= 200 && res.statusCode < 400,
        severity: this.determineSeverity(req, res),
        metadata: {
          query: req.query,
          params: req.params,
          headers: this.scrubHeaders(req.headers)
        }
      };

      // Store in database
      await this.storeAuditLog(auditEntry);

      // Update Prometheus metrics
      metricsExporter.recordAuditEvent(
        auditEntry.event_type,
        auditEntry.action,
        this.getStatusClass(res.statusCode)
      );

    } catch (error) {
      // Don't fail the request if audit logging fails
      console.error('Audit logging error:', error);
    }
  }

  /**
   * Determine if request should be logged
   */
  shouldLogRequest(req) {
    const method = req.method;
    const path = req.path;

    // Always log mutations (POST, PUT, DELETE, PATCH)
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
      return true;
    }

    // Log authentication attempts
    if (path.includes('/auth/')) {
      return true;
    }

    // Log 2FA operations
    if (path.includes('/2fa/')) {
      return true;
    }

    // Log admin operations
    if (path.includes('/admin/') || path.includes('/users/')) {
      return true;
    }

    // Skip health checks and metrics
    if (path === '/health' || path === '/metrics') {
      return false;
    }

    // Log everything else based on sampling
    return true;
  }

  /**
   * Determine event type
   */
  determineEventType(req) {
    const path = req.path;

    if (path.includes('/auth/login')) return 'AUTHENTICATION';
    if (path.includes('/auth/logout')) return 'AUTHENTICATION';
    if (path.includes('/2fa/')) return '2FA_EVENT';
    if (path.includes('/users/')) return 'USER_MANAGEMENT';
    if (path.includes('/inventory/')) return 'INVENTORY_OPERATION';
    if (path.includes('/forecast/')) return 'FORECAST_OPERATION';

    if (['POST', 'PUT', 'PATCH'].includes(req.method)) return 'DATA_MUTATION';
    if (req.method === 'DELETE') return 'DATA_DELETION';

    return 'API_REQUEST';
  }

  /**
   * Determine severity level
   */
  determineSeverity(req, res) {
    // Critical: Failed auth, deletions, 500 errors
    if (req.path.includes('/auth/') && res.statusCode >= 400) return 'CRITICAL';
    if (req.method === 'DELETE') return 'CRITICAL';
    if (res.statusCode >= 500) return 'CRITICAL';

    // Warning: 4xx errors, 2FA failures
    if (res.statusCode >= 400) return 'WARNING';

    // Info: Everything else
    return 'INFO';
  }

  /**
   * Get status class (2xx, 4xx, 5xx)
   */
  getStatusClass(statusCode) {
    if (statusCode >= 200 && statusCode < 300) return '2xx';
    if (statusCode >= 300 && statusCode < 400) return '3xx';
    if (statusCode >= 400 && statusCode < 500) return '4xx';
    if (statusCode >= 500) return '5xx';
    return 'unknown';
  }

  /**
   * Get client IP address
   */
  getClientIP(req) {
    return (
      req.headers['x-forwarded-for']?.split(',')[0].trim() ||
      req.headers['x-real-ip'] ||
      req.connection?.remoteAddress ||
      req.socket?.remoteAddress ||
      'unknown'
    );
  }

  /**
   * Scrub PII from request body
   */
  scrubPII(body) {
    if (!body || typeof body !== 'object') {
      return body;
    }

    const scrubbed = { ...body };

    for (const field of this.piiFields) {
      if (scrubbed[field]) {
        scrubbed[field] = '[REDACTED]';
      }
    }

    // Also scrub nested objects
    for (const key in scrubbed) {
      if (typeof scrubbed[key] === 'object' && scrubbed[key] !== null) {
        scrubbed[key] = this.scrubPII(scrubbed[key]);
      }
    }

    return scrubbed;
  }

  /**
   * Scrub sensitive headers
   */
  scrubHeaders(headers) {
    const scrubbed = { ...headers };

    const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key'];

    for (const header of sensitiveHeaders) {
      if (scrubbed[header]) {
        scrubbed[header] = '[REDACTED]';
      }
    }

    return scrubbed;
  }

  /**
   * Store audit log in database
   */
  async storeAuditLog(entry) {
    if (!this.db) {
      console.warn('Database not configured for audit logging');
      return;
    }

    try {
      const sql = `
        INSERT INTO audit_logs (
          event_type, action, endpoint, user_id, user_email, tenant_id,
          ip_address, user_agent, request_body, response_status,
          duration_ms, success, severity, metadata, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `;

      await this.db.run(sql, [
        entry.event_type,
        entry.action,
        entry.endpoint,
        entry.user_id,
        entry.user_email,
        entry.tenant_id,
        entry.ip_address,
        entry.user_agent,
        JSON.stringify(entry.request_body),
        entry.response_status,
        entry.duration_ms,
        entry.success ? 1 : 0,
        entry.severity,
        JSON.stringify(entry.metadata)
      ]);

    } catch (error) {
      console.error('Failed to store audit log:', error);
    }
  }

  /**
   * Query audit logs
   * @param {Object} filters - Filter criteria
   * @param {number} limit - Max results
   * @returns {Promise<Array>}
   */
  async queryAuditLogs(filters = {}, limit = 100) {
    if (!this.db) {
      throw new Error('Database not configured');
    }

    const whereClauses = [];
    const params = [];

    if (filters.user_id) {
      whereClauses.push('user_id = ?');
      params.push(filters.user_id);
    }

    if (filters.tenant_id) {
      whereClauses.push('tenant_id = ?');
      params.push(filters.tenant_id);
    }

    if (filters.event_type) {
      whereClauses.push('event_type = ?');
      params.push(filters.event_type);
    }

    if (filters.severity) {
      whereClauses.push('severity = ?');
      params.push(filters.severity);
    }

    if (filters.start_date) {
      whereClauses.push('created_at >= ?');
      params.push(filters.start_date);
    }

    if (filters.end_date) {
      whereClauses.push('created_at <= ?');
      params.push(filters.end_date);
    }

    const whereClause = whereClauses.length > 0
      ? `WHERE ${whereClauses.join(' AND ')}`
      : '';

    const sql = `
      SELECT *
      FROM audit_logs
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ?
    `;

    params.push(limit);

    const logs = await this.db.all(sql, params);

    return logs.map(log => ({
      ...log,
      request_body: JSON.parse(log.request_body || '{}'),
      metadata: JSON.parse(log.metadata || '{}')
    }));
  }

  /**
   * Get audit statistics
   * @param {string} tenantId - Tenant ID
   * @param {number} days - Days to look back
   * @returns {Promise<Object>}
   */
  async getAuditStats(tenantId, days = 7) {
    if (!this.db) {
      throw new Error('Database not configured');
    }

    const sql = `
      SELECT
        event_type,
        COUNT(*) as count,
        AVG(duration_ms) as avg_duration,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as success_count,
        SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failure_count
      FROM audit_logs
      WHERE tenant_id = ?
        AND created_at >= DATE('now', '-' || ? || ' days')
      GROUP BY event_type
      ORDER BY count DESC
    `;

    const stats = await this.db.all(sql, [tenantId, days]);

    const totalSql = `
      SELECT COUNT(*) as total
      FROM audit_logs
      WHERE tenant_id = ?
        AND created_at >= DATE('now', '-' || ? || ' days')
    `;

    const total = await this.db.get(totalSql, [tenantId, days]);

    return {
      tenantId,
      periodDays: days,
      totalEvents: total.total,
      byEventType: stats
    };
  }
}

module.exports = AuditLogger;
