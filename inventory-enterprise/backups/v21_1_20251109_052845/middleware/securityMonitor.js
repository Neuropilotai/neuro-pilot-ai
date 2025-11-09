/**
 * 🔍 ADVANCED SECURITY MONITORING & ALERT SYSTEM
 * Real-time threat detection and automated response
 */

const { securityLog, auditLog, logger } = require('../config/logger');
const { EventEmitter } = require('events');

// 🚨 SECURITY EVENT EMITTER
class SecurityEventEmitter extends EventEmitter {}
const securityEvents = new SecurityEventEmitter();

// 📊 SECURITY METRICS STORAGE
const securityMetrics = {
  threats: new Map(),
  ips: new Map(),
  users: new Map(),
  endpoints: new Map(),
  attacks: new Map(),
  alerts: []
};

// ⚡ THREAT LEVELS
const ThreatLevels = {
  LOW: { level: 1, name: 'LOW', color: '🟢' },
  MEDIUM: { level: 2, name: 'MEDIUM', color: '🟡' },
  HIGH: { level: 3, name: 'HIGH', color: '🟠' },
  CRITICAL: { level: 4, name: 'CRITICAL', color: '🔴' }
};

// 🎯 ATTACK SIGNATURES
const AttackSignatures = {
  SQL_INJECTION: {
    patterns: [
      /(\bunion\b.*\bselect\b)|(\bselect\b.*\bunion\b)/gi,
      /\b(drop|delete|insert|update)\b.*\b(table|database|schema)\b/gi,
      /(--|\/\*|\*\/|;)/g,
      /\b(exec|execute|sp_|xp_)\b/gi
    ],
    threat: ThreatLevels.HIGH,
    description: 'SQL Injection attempt detected'
  },
  
  XSS: {
    patterns: [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
      /javascript\s*:/gi,
      /on\w+\s*=/gi,
      /eval\s*\(/gi
    ],
    threat: ThreatLevels.HIGH,
    description: 'Cross-Site Scripting (XSS) attempt detected'
  },
  
  PATH_TRAVERSAL: {
    patterns: [
      /\.\.\//g,
      /%2e%2e%2f/gi,
      /\.\.\\/g,
      /%2e%2e%5c/gi
    ],
    threat: ThreatLevels.MEDIUM,
    description: 'Path traversal attempt detected'
  },
  
  COMMAND_INJECTION: {
    patterns: [
      /[;&|`$(){}[\]]/g,
      /\b(cat|ls|pwd|whoami|id|uname|ps|netstat|wget|curl)\b/gi,
      /\$\(.*\)/g,
      /`.*`/g
    ],
    threat: ThreatLevels.CRITICAL,
    description: 'Command injection attempt detected'
  },
  
  BRUTE_FORCE: {
    threshold: 10,
    window: 5 * 60 * 1000, // 5 minutes
    threat: ThreatLevels.HIGH,
    description: 'Brute force attack detected'
  }
};

// 🔍 REAL-TIME THREAT ANALYZER
class ThreatAnalyzer {
  static analyzeRequest(req) {
    const threats = [];
    const requestData = this.extractRequestData(req);
    
    // Analyze against attack signatures
    for (const [attackType, config] of Object.entries(AttackSignatures)) {
      if (config.patterns) {
        for (const pattern of config.patterns) {
          if (pattern.test(requestData.combined)) {
            threats.push({
              type: attackType,
              threat: config.threat,
              description: config.description,
              pattern: pattern.source,
              matched: requestData.combined.match(pattern)?.[0] || 'N/A'
            });
          }
        }
      }
    }
    
    return threats;
  }
  
  static extractRequestData(req) {
    const body = JSON.stringify(req.body || {});
    const query = JSON.stringify(req.query || {});
    const params = JSON.stringify(req.params || {});
    const headers = JSON.stringify(req.headers || {});
    const url = req.originalUrl || '';
    
    return {
      body,
      query,
      params,
      headers,
      url,
      combined: `${body} ${query} ${params} ${url}`.toLowerCase()
    };
  }
}

// 🚨 ALERT MANAGER
class AlertManager {
  static async sendAlert(alert) {
    // Add to alerts history
    securityMetrics.alerts.unshift({
      ...alert,
      id: this.generateAlertId(),
      timestamp: new Date().toISOString()
    });
    
    // Keep only last 1000 alerts
    if (securityMetrics.alerts.length > 1000) {
      securityMetrics.alerts = securityMetrics.alerts.slice(0, 1000);
    }
    
    // Log the alert
    securityLog('security_alert', alert.threat.name.toLowerCase(), alert);
    
    // Emit security event
    securityEvents.emit('alert', alert);
    
    // Handle critical alerts
    if (alert.threat.level >= ThreatLevels.HIGH.level) {
      await this.handleCriticalAlert(alert);
    }
  }
  
  static async handleCriticalAlert(alert) {
    // Auto-block IP for critical threats
    if (alert.threat.level >= ThreatLevels.CRITICAL.level) {
      await this.autoBlockIP(alert.ip, alert.reason);
    }
    
    // Could integrate with external alerting systems here:
    // - Email notifications
    // - Slack/Discord webhooks
    // - PagerDuty
    // - SIEM systems
  }
  
  static async autoBlockIP(ip, reason) {
    // This would integrate with firewall/security infrastructure
    logger.warn(`Auto-blocking IP ${ip} due to: ${reason}`);
    
    // For demo purposes, we'll use the suspicious IP tracker
    const { trackSuspiciousActivity } = require('./security');
    trackSuspiciousActivity(ip, 'auto_blocked');
  }
  
  static generateAlertId() {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// 📊 BEHAVIORAL ANALYTICS
class BehaviorAnalyzer {
  static analyzeUserBehavior(req) {
    const userId = req.user?.id;
    if (!userId) return [];
    
    const userMetrics = securityMetrics.users.get(userId) || {
      requests: 0,
      endpoints: new Set(),
      ips: new Set(),
      lastSeen: null,
      failedAuth: 0
    };
    
    const anomalies = [];
    
    // IP change detection
    if (userMetrics.ips.size > 0 && !userMetrics.ips.has(req.ip)) {
      anomalies.push({
        type: 'IP_CHANGE',
        description: 'User accessing from new IP address',
        threat: ThreatLevels.MEDIUM,
        details: { newIP: req.ip, knownIPs: Array.from(userMetrics.ips) }
      });
    }
    
    // Unusual endpoint access
    const endpoint = req.route?.path || req.path;
    const adminEndpoints = ['/admin', '/backup', '/config'];
    
    if (adminEndpoints.some(admin => endpoint.startsWith(admin)) && 
        req.user?.role !== 'admin') {
      anomalies.push({
        type: 'PRIVILEGE_ESCALATION',
        description: 'Non-admin user accessing admin endpoints',
        threat: ThreatLevels.HIGH,
        details: { endpoint, userRole: req.user.role }
      });
    }
    
    // Update metrics
    userMetrics.requests++;
    userMetrics.endpoints.add(endpoint);
    userMetrics.ips.add(req.ip);
    userMetrics.lastSeen = new Date().toISOString();
    
    securityMetrics.users.set(userId, userMetrics);
    
    return anomalies;
  }
}

// 🔍 SECURITY MONITORING MIDDLEWARE
const securityMonitoringMiddleware = async (req, res, next) => {
  const startTime = Date.now();
  
  try {
    // 1. Analyze request for threats
    const threats = ThreatAnalyzer.analyzeRequest(req);
    
    // 2. Analyze user behavior (if authenticated)
    const behaviorAnomalies = BehaviorAnalyzer.analyzeUserBehavior(req);
    
    // 3. Track IP metrics
    const ipMetrics = securityMetrics.ips.get(req.ip) || {
      requests: 0,
      threats: 0,
      firstSeen: new Date().toISOString(),
      lastSeen: null,
      endpoints: new Set(),
      userAgents: new Set()
    };
    
    ipMetrics.requests++;
    ipMetrics.lastSeen = new Date().toISOString();
    ipMetrics.endpoints.add(req.path);
    ipMetrics.userAgents.add(req.get('user-agent'));
    
    if (threats.length > 0) {
      ipMetrics.threats += threats.length;
    }
    
    securityMetrics.ips.set(req.ip, ipMetrics);
    
    // 4. Generate alerts for detected threats
    for (const threat of threats) {
      await AlertManager.sendAlert({
        type: 'THREAT_DETECTED',
        threat: threat.threat,
        ip: req.ip,
        endpoint: req.path,
        method: req.method,
        userAgent: req.get('user-agent'),
        userId: req.user?.id || null,
        details: threat,
        reason: threat.description
      });
    }
    
    // 5. Generate alerts for behavior anomalies
    for (const anomaly of behaviorAnomalies) {
      await AlertManager.sendAlert({
        type: 'BEHAVIOR_ANOMALY',
        threat: anomaly.threat,
        ip: req.ip,
        endpoint: req.path,
        userId: req.user?.id || null,
        details: anomaly.details,
        reason: anomaly.description
      });
    }
    
    // 6. Track endpoint metrics
    const endpointKey = `${req.method} ${req.path}`;
    const endpointMetrics = securityMetrics.endpoints.get(endpointKey) || {
      requests: 0,
      threats: 0,
      uniqueIPs: new Set(),
      avgResponseTime: 0
    };
    
    endpointMetrics.requests++;
    endpointMetrics.uniqueIPs.add(req.ip);
    
    if (threats.length > 0) {
      endpointMetrics.threats += threats.length;
    }
    
    // Update response time on response
    res.on('finish', () => {
      const responseTime = Date.now() - startTime;
      endpointMetrics.avgResponseTime = 
        (endpointMetrics.avgResponseTime * (endpointMetrics.requests - 1) + responseTime) / 
        endpointMetrics.requests;
    });
    
    securityMetrics.endpoints.set(endpointKey, endpointMetrics);
    
    // 7. Store threat info in request for later use
    req.securityInfo = {
      threats,
      behaviorAnomalies,
      ipMetrics,
      monitoringTime: Date.now() - startTime
    };
    
  } catch (error) {
    logger.error('Security monitoring error:', error);
  }
  
  next();
};

// 📊 SECURITY DASHBOARD DATA
const getSecurityDashboard = (req, res) => {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  const oneDayAgo = now - (24 * oneHour);
  
  // Filter recent alerts
  const recentAlerts = securityMetrics.alerts.filter(alert => 
    new Date(alert.timestamp).getTime() > oneDayAgo
  );
  
  const dashboard = {
    timestamp: new Date().toISOString(),
    overview: {
      totalIPs: securityMetrics.ips.size,
      totalUsers: securityMetrics.users.size,
      totalEndpoints: securityMetrics.endpoints.size,
      recentAlerts: recentAlerts.length
    },
    threatSummary: {
      critical: recentAlerts.filter(a => a.threat.level === 4).length,
      high: recentAlerts.filter(a => a.threat.level === 3).length,
      medium: recentAlerts.filter(a => a.threat.level === 2).length,
      low: recentAlerts.filter(a => a.threat.level === 1).length
    },
    topThreats: this.getTopThreats(recentAlerts),
    riskyIPs: this.getRiskyIPs(),
    recentAlerts: recentAlerts.slice(0, 20),
    systemHealth: {
      monitoringActive: true,
      lastUpdated: new Date().toISOString(),
      alertingEnabled: true
    }
  };
  
  res.json(dashboard);
};

// 🔥 TOP THREATS ANALYZER
const getTopThreats = (alerts) => {
  const threatCounts = new Map();
  
  alerts.forEach(alert => {
    const key = alert.details?.type || alert.type;
    threatCounts.set(key, (threatCounts.get(key) || 0) + 1);
  });
  
  return Array.from(threatCounts.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([threat, count]) => ({ threat, count }));
};

// 🚨 RISKY IPS ANALYZER
const getRiskyIPs = () => {
  const riskyIPs = [];
  
  for (const [ip, metrics] of securityMetrics.ips.entries()) {
    const riskScore = this.calculateRiskScore(metrics);
    
    if (riskScore > 50) {
      riskyIPs.push({
        ip,
        riskScore: Math.round(riskScore),
        requests: metrics.requests,
        threats: metrics.threats,
        uniqueEndpoints: metrics.endpoints.size,
        firstSeen: metrics.firstSeen,
        lastSeen: metrics.lastSeen
      });
    }
  }
  
  return riskyIPs.sort((a, b) => b.riskScore - a.riskScore).slice(0, 20);
};

// 📊 RISK SCORE CALCULATOR
const calculateRiskScore = (metrics) => {
  let score = 0;
  
  // High request volume
  if (metrics.requests > 1000) score += 30;
  else if (metrics.requests > 500) score += 15;
  
  // Threat detection
  score += metrics.threats * 20;
  
  // Diverse endpoint access (potential reconnaissance)
  if (metrics.endpoints.size > 20) score += 25;
  else if (metrics.endpoints.size > 10) score += 10;
  
  // Multiple user agents (potential bot)
  if (metrics.userAgents.size > 5) score += 15;
  
  return Math.min(score, 100);
};

// 🧹 CLEANUP FUNCTION
const cleanupSecurityMetrics = () => {
  const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
  
  // Clean old IP metrics
  for (const [ip, metrics] of securityMetrics.ips.entries()) {
    if (new Date(metrics.lastSeen).getTime() < oneDayAgo) {
      securityMetrics.ips.delete(ip);
    }
  }
  
  // Clean old user metrics
  for (const [userId, metrics] of securityMetrics.users.entries()) {
    if (new Date(metrics.lastSeen).getTime() < oneDayAgo) {
      securityMetrics.users.delete(userId);
    }
  }
  
  // Keep only recent alerts
  securityMetrics.alerts = securityMetrics.alerts.slice(0, 5000);
};

// Run cleanup every hour
setInterval(cleanupSecurityMetrics, 60 * 60 * 1000);

module.exports = {
  securityMonitoringMiddleware,
  getSecurityDashboard,
  securityEvents,
  ThreatLevels,
  AlertManager,
  securityMetrics,
  cleanupSecurityMetrics
};