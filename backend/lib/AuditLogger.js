/**
 * ENTERPRISE AUDIT LOGGING SYSTEM
 *
 * Comprehensive audit trail for all physical count operations
 * Provides compliance, forensics, and operational intelligence
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class AuditLogger {
  constructor(options = {}) {
    this.logDir = options.logDir || path.join(__dirname, '../data/audit_logs');
    this.retentionDays = options.retentionDays || 365; // 1 year default
    this.enableEncryption = options.enableEncryption || false;
    this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024; // 10MB

    this._ensureLogDirectory();
  }

  /**
   * Log physical count operation
   */
  async logOperation(operation, data, metadata = {}) {
    const logEntry = {
      id: this._generateId(),
      timestamp: new Date().toISOString(),
      operation: operation,
      category: 'PHYSICAL_COUNT',
      data: this._sanitizeData(data),
      metadata: {
        ...metadata,
        sessionId: metadata.sessionId || 'SYSTEM',
        ipAddress: metadata.ipAddress || 'unknown',
        userAgent: metadata.userAgent || 'unknown'
      },
      checksum: null
    };

    // Generate checksum for integrity
    logEntry.checksum = this._generateChecksum(logEntry);

    // Write to log file
    await this._writeToLog(logEntry);

    return logEntry.id;
  }

  /**
   * Log count start
   */
  async logCountStart(userId, countData, metadata = {}) {
    return await this.logOperation('COUNT_START', {
      userId,
      countId: countData.countId,
      startDate: countData.startDate,
      endDate: countData.endDate,
      lastOrderDate: countData.lastOrderDate,
      peopleOnSite: countData.peopleOnSite
    }, {
      ...metadata,
      severity: 'HIGH',
      category: 'COUNT_LIFECYCLE'
    });
  }

  /**
   * Log item addition
   */
  async logItemAdd(userId, item, countId, metadata = {}) {
    return await this.logOperation('ITEM_ADD', {
      userId,
      countId,
      item: {
        location: item.location,
        itemCode: item.itemCode,
        itemName: item.itemName,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
        totalValue: item.totalValue
      }
    }, {
      ...metadata,
      severity: 'MEDIUM',
      category: 'ITEM_MANAGEMENT'
    });
  }

  /**
   * Log item deletion
   */
  async logItemDelete(userId, item, countId, metadata = {}) {
    return await this.logOperation('ITEM_DELETE', {
      userId,
      countId,
      deletedItem: item
    }, {
      ...metadata,
      severity: 'HIGH',
      category: 'ITEM_MANAGEMENT'
    });
  }

  /**
   * Log count completion
   */
  async logCountComplete(userId, countData, metadata = {}) {
    return await this.logOperation('COUNT_COMPLETE', {
      userId,
      countId: countData.countId,
      itemsCounted: countData.itemsCounted,
      totalValue: countData.totalValue,
      locationsCounted: countData.locationsCounted,
      completedAt: countData.completedAt
    }, {
      ...metadata,
      severity: 'CRITICAL',
      category: 'COUNT_LIFECYCLE'
    });
  }

  /**
   * Log validation failure
   */
  async logValidationFailure(operation, errors, data, metadata = {}) {
    return await this.logOperation('VALIDATION_FAILURE', {
      operation,
      errorCount: errors.length,
      errors: errors,
      attemptedData: this._sanitizeData(data)
    }, {
      ...metadata,
      severity: 'MEDIUM',
      category: 'VALIDATION'
    });
  }

  /**
   * Log validation warning
   */
  async logValidationWarning(operation, warnings, data, metadata = {}) {
    return await this.logOperation('VALIDATION_WARNING', {
      operation,
      warningCount: warnings.length,
      warnings: warnings,
      data: this._sanitizeData(data)
    }, {
      ...metadata,
      severity: 'LOW',
      category: 'VALIDATION'
    });
  }

  /**
   * Log data integrity check
   */
  async logIntegrityCheck(result, metadata = {}) {
    return await this.logOperation('INTEGRITY_CHECK', {
      passed: result.passed,
      checksPerformed: result.checks,
      issues: result.issues || []
    }, {
      ...metadata,
      severity: result.passed ? 'LOW' : 'CRITICAL',
      category: 'INTEGRITY'
    });
  }

  /**
   * Query audit logs
   */
  async queryLogs(filters = {}) {
    const {
      startDate,
      endDate,
      operation,
      userId,
      countId,
      severity,
      limit = 100
    } = filters;

    const logs = await this._readLogs(startDate, endDate);
    let filtered = logs;

    if (operation) {
      filtered = filtered.filter(log => log.operation === operation);
    }

    if (userId) {
      filtered = filtered.filter(log => log.data?.userId === userId);
    }

    if (countId) {
      filtered = filtered.filter(log => log.data?.countId === countId);
    }

    if (severity) {
      filtered = filtered.filter(log => log.metadata?.severity === severity);
    }

    // Sort by timestamp descending
    filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return filtered.slice(0, limit);
  }

  /**
   * Get audit trail for specific count
   */
  async getCountAuditTrail(countId) {
    const logs = await this.queryLogs({ countId, limit: 1000 });

    return {
      countId,
      totalOperations: logs.length,
      timeline: logs,
      summary: this._generateTrailSummary(logs)
    };
  }

  /**
   * Generate audit report
   */
  async generateAuditReport(startDate, endDate) {
    const logs = await this._readLogs(startDate, endDate);

    const report = {
      period: { startDate, endDate },
      totalOperations: logs.length,
      operationBreakdown: this._countByOperation(logs),
      severityBreakdown: this._countBySeverity(logs),
      userActivity: this._countByUser(logs),
      validationIssues: logs.filter(l => l.operation === 'VALIDATION_FAILURE').length,
      integrityChecks: logs.filter(l => l.operation === 'INTEGRITY_CHECK').length,
      generatedAt: new Date().toISOString()
    };

    return report;
  }

  /**
   * Verify log integrity
   */
  async verifyLogIntegrity(logId) {
    const logs = await this._readLogs();
    const log = logs.find(l => l.id === logId);

    if (!log) {
      return { valid: false, error: 'Log entry not found' };
    }

    const storedChecksum = log.checksum;
    const tempChecksum = log.checksum;
    log.checksum = null;

    const calculatedChecksum = this._generateChecksum(log);
    log.checksum = tempChecksum;

    return {
      valid: storedChecksum === calculatedChecksum,
      logId: logId,
      storedChecksum,
      calculatedChecksum,
      timestamp: new Date().toISOString()
    };
  }

  // ==================== PRIVATE METHODS ====================

  _ensureLogDirectory() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  _generateId() {
    return `AUDIT-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  }

  _generateChecksum(data) {
    const dataWithoutChecksum = { ...data };
    delete dataWithoutChecksum.checksum;

    return crypto
      .createHash('sha256')
      .update(JSON.stringify(dataWithoutChecksum))
      .digest('hex');
  }

  _sanitizeData(data) {
    // Remove sensitive information
    const sanitized = { ...data };

    // Remove password fields if any
    if (sanitized.password) delete sanitized.password;
    if (sanitized.token) delete sanitized.token;
    if (sanitized.apiKey) delete sanitized.apiKey;

    return sanitized;
  }

  async _writeToLog(logEntry) {
    const date = new Date().toISOString().split('T')[0];
    const filename = `audit-${date}.jsonl`;
    const filepath = path.join(this.logDir, filename);

    const logLine = JSON.stringify(logEntry) + '\n';

    try {
      fs.appendFileSync(filepath, logLine, 'utf8');
    } catch (error) {
      console.error('Failed to write audit log:', error);
      throw error;
    }
  }

  async _readLogs(startDate, endDate) {
    const logs = [];
    const files = fs.readdirSync(this.logDir)
      .filter(f => f.startsWith('audit-') && f.endsWith('.jsonl'))
      .sort();

    for (const file of files) {
      const filepath = path.join(this.logDir, file);
      const content = fs.readFileSync(filepath, 'utf8');
      const lines = content.trim().split('\n');

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const log = JSON.parse(line);

          // Filter by date if specified
          if (startDate && new Date(log.timestamp) < new Date(startDate)) continue;
          if (endDate && new Date(log.timestamp) > new Date(endDate)) continue;

          logs.push(log);
        } catch (error) {
          console.error('Failed to parse log line:', error);
        }
      }
    }

    return logs;
  }

  _generateTrailSummary(logs) {
    return {
      countStarts: logs.filter(l => l.operation === 'COUNT_START').length,
      itemsAdded: logs.filter(l => l.operation === 'ITEM_ADD').length,
      itemsDeleted: logs.filter(l => l.operation === 'ITEM_DELETE').length,
      countCompleted: logs.filter(l => l.operation === 'COUNT_COMPLETE').length > 0,
      validationFailures: logs.filter(l => l.operation === 'VALIDATION_FAILURE').length,
      validationWarnings: logs.filter(l => l.operation === 'VALIDATION_WARNING').length
    };
  }

  _countByOperation(logs) {
    const counts = {};
    logs.forEach(log => {
      counts[log.operation] = (counts[log.operation] || 0) + 1;
    });
    return counts;
  }

  _countBySeverity(logs) {
    const counts = {};
    logs.forEach(log => {
      const severity = log.metadata?.severity || 'UNKNOWN';
      counts[severity] = (counts[severity] || 0) + 1;
    });
    return counts;
  }

  _countByUser(logs) {
    const counts = {};
    logs.forEach(log => {
      const userId = log.data?.userId || 'SYSTEM';
      counts[userId] = (counts[userId] || 0) + 1;
    });
    return counts;
  }

  /**
   * Clean up old logs based on retention policy
   */
  async cleanupOldLogs() {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);

    const files = fs.readdirSync(this.logDir)
      .filter(f => f.startsWith('audit-') && f.endsWith('.jsonl'));

    let deletedCount = 0;

    for (const file of files) {
      const match = file.match(/audit-(\d{4}-\d{2}-\d{2})\.jsonl/);
      if (match) {
        const fileDate = new Date(match[1]);
        if (fileDate < cutoffDate) {
          fs.unlinkSync(path.join(this.logDir, file));
          deletedCount++;
        }
      }
    }

    return {
      deletedFiles: deletedCount,
      cutoffDate: cutoffDate.toISOString(),
      retentionDays: this.retentionDays
    };
  }
}

module.exports = AuditLogger;
