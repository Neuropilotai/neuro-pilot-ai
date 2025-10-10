const express = require('express');
const router = express.Router();
const AuditLogger = require('../lib/AuditLogger');

const auditLogger = new AuditLogger();

/**
 * GET /api/audit/logs - Query audit logs
 */
router.get('/logs', async (req, res) => {
  try {
    const { startDate, endDate, operation, userId, countId, severity, limit } = req.query;

    const logs = await auditLogger.queryLogs({
      startDate,
      endDate,
      operation,
      userId,
      countId,
      severity,
      limit: limit ? parseInt(limit) : 100
    });

    res.json({
      total: logs.length,
      logs: logs
    });
  } catch (error) {
    console.error('Error querying audit logs:', error);
    res.status(500).json({ error: 'Failed to query audit logs' });
  }
});

/**
 * GET /api/audit/count/:countId - Get audit trail for specific count
 */
router.get('/count/:countId', async (req, res) => {
  try {
    const { countId } = req.params;
    const trail = await auditLogger.getCountAuditTrail(countId);

    res.json(trail);
  } catch (error) {
    console.error('Error getting count audit trail:', error);
    res.status(500).json({ error: 'Failed to get audit trail' });
  }
});

/**
 * GET /api/audit/report - Generate audit report
 */
router.get('/report', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        error: 'Missing required parameters',
        required: ['startDate', 'endDate']
      });
    }

    const report = await auditLogger.generateAuditReport(startDate, endDate);

    res.json(report);
  } catch (error) {
    console.error('Error generating audit report:', error);
    res.status(500).json({ error: 'Failed to generate audit report' });
  }
});

/**
 * GET /api/audit/verify/:logId - Verify log integrity
 */
router.get('/verify/:logId', async (req, res) => {
  try {
    const { logId } = req.params;
    const result = await auditLogger.verifyLogIntegrity(logId);

    res.json(result);
  } catch (error) {
    console.error('Error verifying log integrity:', error);
    res.status(500).json({ error: 'Failed to verify log integrity' });
  }
});

/**
 * POST /api/audit/cleanup - Clean up old logs
 */
router.post('/cleanup', async (req, res) => {
  try {
    const result = await auditLogger.cleanupOldLogs();

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error cleaning up logs:', error);
    res.status(500).json({ error: 'Failed to clean up logs' });
  }
});

/**
 * GET /api/audit/stats - Get audit statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const now = new Date();
    const defaultStart = new Date(now.setDate(now.getDate() - 30)).toISOString().split('T')[0];
    const defaultEnd = new Date().toISOString().split('T')[0];

    const logs = await auditLogger.queryLogs({
      startDate: startDate || defaultStart,
      endDate: endDate || defaultEnd,
      limit: 10000
    });

    const stats = {
      totalOperations: logs.length,
      operationBreakdown: {},
      severityBreakdown: {},
      userActivity: {},
      recentActivity: logs.slice(0, 10).map(log => ({
        timestamp: log.timestamp,
        operation: log.operation,
        userId: log.data?.userId || 'SYSTEM',
        severity: log.metadata?.severity
      }))
    };

    // Count by operation
    logs.forEach(log => {
      stats.operationBreakdown[log.operation] = (stats.operationBreakdown[log.operation] || 0) + 1;
    });

    // Count by severity
    logs.forEach(log => {
      const severity = log.metadata?.severity || 'UNKNOWN';
      stats.severityBreakdown[severity] = (stats.severityBreakdown[severity] || 0) + 1;
    });

    // Count by user
    logs.forEach(log => {
      const userId = log.data?.userId || 'SYSTEM';
      stats.userActivity[userId] = (stats.userActivity[userId] || 0) + 1;
    });

    res.json(stats);
  } catch (error) {
    console.error('Error getting audit stats:', error);
    res.status(500).json({ error: 'Failed to get audit statistics' });
  }
});

module.exports = router;
