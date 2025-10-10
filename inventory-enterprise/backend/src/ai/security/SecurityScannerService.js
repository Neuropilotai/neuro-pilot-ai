/**
 * Security Scanner Service - Automated Security Anomaly Detection
 * Scans audit logs for suspicious patterns, failed auth, unusual access
 *
 * @version 3.0.0
 * @author NeuroInnovate AI Team
 */

const { logger } = require('../../../config/logger');
const crypto = require('crypto');

class SecurityScannerService {
  constructor(db, metricsExporter) {
    this.db = db;
    this.metricsExporter = metricsExporter;
    this.severityLevels = ['low', 'medium', 'high', 'critical'];
    this.alertTypes = [
      'brute_force_login',
      'failed_2fa_burst',
      'unfamiliar_geo',
      'role_escalation',
      'webhook_failures',
      'data_exfiltration',
      'suspicious_query_pattern'
    ];
  }

  /**
   * Scan audit logs for security anomalies
   * @param {Number} lookbackHours - Hours to look back (default: 24)
   * @returns {Array} Security findings
   */
  async scanAuditLogs(lookbackHours = 24) {
    const startTime = Date.now();
    const findings = [];

    try {
      logger.info('SecurityScanner: Starting scan', { lookbackHours });

      // Run all security checks in parallel
      const [
        bruteForceFindings,
        twoFAFindings,
        roleEscalationFindings,
        webhookFindings,
        suspiciousQueryFindings
      ] = await Promise.all([
        this.detectBruteForceAttempts(lookbackHours),
        this.detectFailed2FABursts(lookbackHours),
        this.detectRoleEscalations(lookbackHours),
        this.detectWebhookFailures(lookbackHours),
        this.detectSuspiciousQueries(lookbackHours)
      ]);

      findings.push(...bruteForceFindings);
      findings.push(...twoFAFindings);
      findings.push(...roleEscalationFindings);
      findings.push(...webhookFindings);
      findings.push(...suspiciousQueryFindings);

      // Store findings
      for (const finding of findings) {
        await this.storeFinding(finding);

        // Update metrics
        if (this.metricsExporter && this.metricsExporter.recordPhase3SecurityFinding) {
          this.metricsExporter.recordPhase3SecurityFinding(finding.severity, finding.type);
        }
      }

      const duration = (Date.now() - startTime) / 1000;
      logger.info('SecurityScanner: Scan complete', {
        findingsCount: findings.length,
        duration
      });

      return findings;

    } catch (error) {
      logger.error('SecurityScanner: Scan failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Detect brute force login attempts
   * @private
   */
  async detectBruteForceAttempts(lookbackHours) {
    try {
      const sql = `
        SELECT
          user_email,
          ip_address,
          COUNT(*) as attempts,
          MAX(created_at) as last_attempt
        FROM audit_logs
        WHERE created_at > datetime('now', '-${lookbackHours} hours')
          AND action = 'login_failed'
        GROUP BY user_email, ip_address
        HAVING attempts >= 5
        ORDER BY attempts DESC
      `;

      const results = await this.db.all(sql);
      const findings = [];

      for (const row of results) {
        const severity = row.attempts >= 10 ? 'high' : row.attempts >= 7 ? 'medium' : 'low';

        findings.push({
          id: this.generateFindingId('brute_force'),
          type: 'brute_force_login',
          severity: severity,
          title: `Brute force attack detected from ${row.ip_address}`,
          evidence: {
            userEmail: row.user_email,
            ipAddress: row.ip_address,
            attempts: row.attempts,
            lastAttempt: row.last_attempt,
            timeWindow: `${lookbackHours}h`
          },
          recommendation: this.getRecommendation('brute_force', severity, row),
          createdAt: new Date().toISOString()
        });
      }

      return findings;

    } catch (error) {
      logger.warn('Brute force detection failed', { error: error.message });
      return [];
    }
  }

  /**
   * Detect failed 2FA bursts
   * @private
   */
  async detectFailed2FABursts(lookbackHours) {
    try {
      const sql = `
        SELECT
          user_email,
          ip_address,
          COUNT(*) as failures,
          MAX(created_at) as last_failure
        FROM audit_logs
        WHERE created_at > datetime('now', '-${lookbackHours} hours')
          AND action = '2fa_failed'
        GROUP BY user_email, ip_address
        HAVING failures >= 3
        ORDER BY failures DESC
      `;

      const results = await this.db.all(sql);
      const findings = [];

      for (const row of results) {
        const severity = row.failures >= 5 ? 'high' : 'medium';

        findings.push({
          id: this.generateFindingId('2fa_burst'),
          type: 'failed_2fa_burst',
          severity: severity,
          title: `Multiple 2FA failures for ${row.user_email}`,
          evidence: {
            userEmail: row.user_email,
            ipAddress: row.ip_address,
            failures: row.failures,
            lastFailure: row.last_failure,
            timeWindow: `${lookbackHours}h`
          },
          recommendation: this.getRecommendation('failed_2fa', severity, row),
          createdAt: new Date().toISOString()
        });
      }

      return findings;

    } catch (error) {
      logger.warn('2FA burst detection failed', { error: error.message });
      return [];
    }
  }

  /**
   * Detect suspicious role escalations
   * @private
   */
  async detectRoleEscalations(lookbackHours) {
    try {
      const sql = `
        SELECT
          user_email,
          action,
          details,
          created_at
        FROM audit_logs
        WHERE created_at > datetime('now', '-${lookbackHours} hours')
          AND (action = 'role_changed' OR action = 'permission_granted')
          AND severity = 'CRITICAL'
        ORDER BY created_at DESC
      `;

      const results = await this.db.all(sql);
      const findings = [];

      for (const row of results) {
        const details = this.safeParseJSON(row.details);

        // Check for unusual patterns
        const isUnusual = details?.newRole === 'admin' || details?.permission?.includes('delete');

        if (isUnusual) {
          findings.push({
            id: this.generateFindingId('role_escalation'),
            type: 'role_escalation',
            severity: 'high',
            title: `Suspicious role change for ${row.user_email}`,
            evidence: {
              userEmail: row.user_email,
              action: row.action,
              details: details,
              timestamp: row.created_at
            },
            recommendation: this.getRecommendation('role_escalation', 'high', row),
            createdAt: new Date().toISOString()
          });
        }
      }

      return findings;

    } catch (error) {
      logger.warn('Role escalation detection failed', { error: error.message });
      return [];
    }
  }

  /**
   * Detect webhook failures
   * @private
   */
  async detectWebhookFailures(lookbackHours) {
    try {
      const sql = `
        SELECT
          endpoint,
          COUNT(*) as failures,
          MAX(created_at) as last_failure
        FROM webhook_deliveries
        WHERE created_at > datetime('now', '-${lookbackHours} hours')
          AND status = 'failed'
        GROUP BY endpoint
        HAVING failures >= 5
        ORDER BY failures DESC
      `;

      const results = await this.db.all(sql);
      const findings = [];

      for (const row of results) {
        const severity = row.failures >= 20 ? 'medium' : 'low';

        findings.push({
          id: this.generateFindingId('webhook_fail'),
          type: 'webhook_failures',
          severity: severity,
          title: `Webhook failures to ${row.endpoint}`,
          evidence: {
            endpoint: row.endpoint,
            failures: row.failures,
            lastFailure: row.last_failure,
            timeWindow: `${lookbackHours}h`
          },
          recommendation: this.getRecommendation('webhook_failures', severity, row),
          createdAt: new Date().toISOString()
        });
      }

      return findings;

    } catch (error) {
      logger.warn('Webhook failure detection failed', { error: error.message });
      return [];
    }
  }

  /**
   * Detect suspicious query patterns
   * @private
   */
  async detectSuspiciousQueries(lookbackHours) {
    try {
      // Check for unusual data access patterns
      const sql = `
        SELECT
          user_email,
          endpoint,
          COUNT(*) as requests,
          MAX(created_at) as last_request
        FROM audit_logs
        WHERE created_at > datetime('now', '-${lookbackHours} hours')
          AND action LIKE '%export%'
        GROUP BY user_email, endpoint
        HAVING requests >= 10
        ORDER BY requests DESC
      `;

      const results = await this.db.all(sql);
      const findings = [];

      for (const row of results) {
        const severity = row.requests >= 50 ? 'high' : row.requests >= 20 ? 'medium' : 'low';

        findings.push({
          id: this.generateFindingId('suspicious_query'),
          type: 'suspicious_query_pattern',
          severity: severity,
          title: `Unusual data export activity by ${row.user_email}`,
          evidence: {
            userEmail: row.user_email,
            endpoint: row.endpoint,
            requests: row.requests,
            lastRequest: row.last_request,
            timeWindow: `${lookbackHours}h`
          },
          recommendation: this.getRecommendation('data_exfiltration', severity, row),
          createdAt: new Date().toISOString()
        });
      }

      return findings;

    } catch (error) {
      logger.warn('Suspicious query detection failed', { error: error.message });
      return [];
    }
  }

  /**
   * Get security recommendation based on finding type
   * @private
   */
  getRecommendation(type, severity, evidence) {
    const recommendations = {
      brute_force: {
        critical: [
          `Immediately block IP ${evidence.ipAddress} for 24 hours`,
          'Enable CAPTCHA after 3 failed attempts',
          'Consider geo-blocking if pattern continues'
        ],
        high: [
          `Block IP ${evidence.ipAddress} for 12 hours`,
          'Enable rate limiting on login endpoint',
          'Alert security team for investigation'
        ],
        medium: [
          `Monitor IP ${evidence.ipAddress} for 1 hour`,
          'Consider implementing progressive delays',
          'Review firewall rules'
        ],
        low: [
          'Monitor for pattern escalation',
          'Log for future analysis'
        ]
      },
      failed_2fa: {
        high: [
          `Temporarily lock account ${evidence.userEmail}`,
          'Send security notification to user',
          'Require password reset on next login'
        ],
        medium: [
          `Alert ${evidence.userEmail} of suspicious activity`,
          'Monitor for continued failures',
          'Consider requiring additional verification'
        ]
      },
      role_escalation: {
        high: [
          'Immediately review role change with admin',
          'Audit all actions taken with elevated privileges',
          'Consider reverting role change pending review',
          'Enable additional logging for this user'
        ]
      },
      webhook_failures: {
        medium: [
          'Check webhook endpoint availability',
          'Review webhook authentication credentials',
          'Consider disabling endpoint if failures persist'
        ],
        low: [
          'Monitor for continued failures',
          'Check network connectivity',
          'Review endpoint logs'
        ]
      },
      data_exfiltration: {
        high: [
          'Immediately review export requests',
          'Temporarily revoke export permissions',
          'Alert security team for investigation',
          'Audit all exported data'
        ],
        medium: [
          'Monitor user activity closely',
          'Review business justification for exports',
          'Enable additional audit logging'
        ],
        low: [
          'Monitor for pattern escalation',
          'Log for compliance review'
        ]
      }
    };

    const typeRecs = recommendations[type] || {};
    const severityRecs = typeRecs[severity] || typeRecs.medium || [];

    return severityRecs.length > 0 ? severityRecs : ['Investigate finding manually'];
  }

  /**
   * Store finding in database
   * @private
   */
  async storeFinding(finding) {
    try {
      const sql = `
        INSERT INTO ai_security_findings (
          created_at, severity, type, evidence, recommendation
        ) VALUES (datetime('now'), ?, ?, ?, ?)
      `;

      await this.db.run(sql, [
        finding.severity,
        finding.type,
        JSON.stringify(finding.evidence),
        JSON.stringify(finding.recommendation)
      ]);

      logger.info('SecurityScanner: Finding stored', {
        type: finding.type,
        severity: finding.severity
      });
    } catch (error) {
      logger.error('SecurityScanner: Failed to store finding', {
        type: finding.type,
        error: error.message
      });
    }
  }

  /**
   * Get recent findings from database
   */
  async getRecentFindings(options = {}) {
    try {
      const limit = options.limit || 20;
      const severity = options.severity; // Optional filter

      let sql = `
        SELECT * FROM ai_security_findings
        WHERE 1=1
      `;

      const params = [];

      if (severity) {
        sql += ` AND severity = ?`;
        params.push(severity);
      }

      sql += ` ORDER BY created_at DESC LIMIT ?`;
      params.push(limit);

      const rows = await this.db.all(sql, params);

      return rows.map(row => ({
        id: row.id,
        createdAt: row.created_at,
        severity: row.severity,
        type: row.type,
        evidence: this.safeParseJSON(row.evidence),
        recommendation: this.safeParseJSON(row.recommendation)
      }));

    } catch (error) {
      logger.error('SecurityScanner: Failed to get findings', { error: error.message });
      return [];
    }
  }

  /**
   * Generate unique finding ID
   * @private
   */
  generateFindingId(type) {
    const timestamp = Date.now();
    const hash = crypto.createHash('md5').update(`${type}_${timestamp}`).digest('hex').substring(0, 6);
    return `sec_${type}_${hash}`;
  }

  /**
   * Safe JSON parse
   * @private
   */
  safeParseJSON(str) {
    try {
      return JSON.parse(str);
    } catch {
      return {};
    }
  }
}

module.exports = SecurityScannerService;
