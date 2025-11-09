/**
 * 🛡️ BULLETPROOF AUTHENTICATION HARDENING
 * Military-grade authentication security with advanced threat protection
 */

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const speakeasy = require('speakeasy');
const { securityLog, auditLog } = require('../config/logger');

// 🔐 ADVANCED AUTHENTICATION FEATURES
class AuthenticationHardening {
  constructor() {
    this.failedAttempts = new Map();
    this.activeSessions = new Map();
    this.compromisedTokens = new Set();
    this.deviceFingerprints = new Map();
    this.securityQuestions = new Map();
    
    // Cleanup intervals
    this.startCleanupTasks();
  }
  
  // 🚨 ADVANCED FAILED ATTEMPT TRACKING
  trackFailedAttempt(identifier, req) {
    const key = `${identifier}_${req.ip}`;
    const current = this.failedAttempts.get(key) || {
      count: 0,
      firstAttempt: Date.now(),
      lastAttempt: null,
      ips: new Set(),
      userAgents: new Set(),
      patterns: []
    };
    
    current.count++;
    current.lastAttempt = Date.now();
    current.ips.add(req.ip);
    current.userAgents.add(req.get('user-agent'));
    
    // Detect attack patterns
    const timeDiff = current.lastAttempt - current.firstAttempt;
    if (current.count >= 5 && timeDiff < 60000) { // 5 attempts in 1 minute
      current.patterns.push('rapid_fire');
    }
    
    if (current.ips.size > 3) { // Multiple IPs for same account
      current.patterns.push('distributed_attack');
    }
    
    this.failedAttempts.set(key, current);
    
    // Log suspicious patterns
    if (current.patterns.length > 0) {
      securityLog('suspicious_auth_pattern', 'high', {
        identifier,
        ip: req.ip,
        attemptCount: current.count,
        patterns: current.patterns,
        timeSpan: timeDiff
      }, req);
    }
    
    return current;
  }
  
  // 🔍 DEVICE FINGERPRINTING
  generateDeviceFingerprint(req) {
    const components = [
      req.get('user-agent') || '',
      req.get('accept-language') || '',
      req.get('accept-encoding') || '',
      req.ip,
      req.connection?.remotePort || ''
    ];
    
    const fingerprint = crypto
      .createHash('sha256')
      .update(components.join('|'))
      .digest('hex');
    
    return fingerprint;
  }
  
  // 🔐 SESSION SECURITY MANAGER
  createSecureSession(user, req) {
    const sessionId = crypto.randomBytes(32).toString('hex');
    const deviceFingerprint = this.generateDeviceFingerprint(req);
    
    const sessionData = {
      sessionId,
      userId: user.id,
      deviceFingerprint,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      ip: req.ip,
      userAgent: req.get('user-agent'),
      isActive: true,
      securityLevel: 'standard',
      mfaVerified: false,
      permissions: user.permissions || []
    };
    
    this.activeSessions.set(sessionId, sessionData);
    
    auditLog('secure_session_created', {
      sessionId,
      userId: user.id,
      deviceFingerprint,
      ip: req.ip
    }, req);
    
    return sessionData;
  }
  
  // 🚨 SESSION VALIDATION WITH THREAT DETECTION
  validateSession(sessionId, req) {
    const session = this.activeSessions.get(sessionId);
    
    if (!session || !session.isActive) {
      return { valid: false, reason: 'session_not_found' };
    }
    
    // Check session expiration
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    if (Date.now() - session.createdAt > maxAge) {
      this.invalidateSession(sessionId, 'expired');
      return { valid: false, reason: 'session_expired' };
    }
    
    // Check inactivity timeout
    const inactivityTimeout = 2 * 60 * 60 * 1000; // 2 hours
    if (Date.now() - session.lastActivity > inactivityTimeout) {
      this.invalidateSession(sessionId, 'inactive');
      return { valid: false, reason: 'session_inactive' };
    }
    
    // Device fingerprint validation
    const currentFingerprint = this.generateDeviceFingerprint(req);
    if (session.deviceFingerprint !== currentFingerprint) {
      securityLog('device_fingerprint_mismatch', 'critical', {
        sessionId,
        userId: session.userId,
        originalFingerprint: session.deviceFingerprint,
        currentFingerprint,
        ip: req.ip
      }, req);
      
      this.invalidateSession(sessionId, 'device_mismatch');
      return { valid: false, reason: 'device_mismatch' };
    }
    
    // IP address change detection
    if (session.ip !== req.ip) {
      securityLog('ip_address_change', 'high', {
        sessionId,
        userId: session.userId,
        originalIP: session.ip,
        newIP: req.ip
      }, req);
      
      // Could require re-authentication or MFA challenge
      session.securityLevel = 'elevated_risk';
    }
    
    // Update last activity
    session.lastActivity = Date.now();
    this.activeSessions.set(sessionId, session);
    
    return { valid: true, session };
  }
  
  // 🔒 MULTI-FACTOR AUTHENTICATION
  setupTOTP(userId) {
    const secret = speakeasy.generateSecret({
      name: `Inventory System (${userId})`,
      issuer: 'Neuro-Pilot Inventory',
      length: 32
    });
    
    return {
      secret: secret.base32,
      qrCode: secret.otpauth_url,
      backupCodes: this.generateBackupCodes()
    };
  }
  
  verifyTOTP(secret, token) {
    return speakeasy.totp.verify({
      secret: secret,
      encoding: 'base32',
      token: token,
      window: 2 // Allow 2 steps of tolerance
    });
  }
  
  generateBackupCodes() {
    const codes = [];
    for (let i = 0; i < 10; i++) {
      codes.push(crypto.randomBytes(4).toString('hex').toUpperCase());
    }
    return codes;
  }
  
  // 🚫 TOKEN BLACKLISTING
  blacklistToken(token, reason = 'manual') {
    try {
      const decoded = jwt.decode(token);
      const tokenId = decoded?.jti || crypto.createHash('sha256').update(token).digest('hex');
      
      this.compromisedTokens.add(tokenId);
      
      securityLog('token_blacklisted', 'medium', {
        tokenId,
        reason,
        userId: decoded?.id,
        expiration: decoded?.exp
      });
      
      // Auto-remove after expiration
      if (decoded?.exp) {
        setTimeout(() => {
          this.compromisedTokens.delete(tokenId);
        }, (decoded.exp * 1000) - Date.now());
      }
      
    } catch (error) {
      console.error('Token blacklisting failed:', error);
    }
  }
  
  isTokenBlacklisted(token) {
    try {
      const decoded = jwt.decode(token);
      const tokenId = decoded?.jti || crypto.createHash('sha256').update(token).digest('hex');
      return this.compromisedTokens.has(tokenId);
    } catch (error) {
      return true; // Treat invalid tokens as blacklisted
    }
  }
  
  // 🧠 BEHAVIORAL ANALYSIS
  analyzeBehavior(userId, req, action) {
    const userKey = `behavior_${userId}`;
    const behavior = this.deviceFingerprints.get(userKey) || {
      normalHours: new Set(),
      normalIPs: new Set(),
      normalUserAgents: new Set(),
      commonActions: new Map(),
      riskScore: 0
    };
    
    const currentHour = new Date().getHours();
    behavior.normalHours.add(currentHour);
    behavior.normalIPs.add(req.ip);
    behavior.normalUserAgents.add(req.get('user-agent'));
    
    const actionCount = behavior.commonActions.get(action) || 0;
    behavior.commonActions.set(action, actionCount + 1);
    
    // Calculate risk score
    let riskScore = 0;
    
    // Unusual time
    if (!behavior.normalHours.has(currentHour) && behavior.normalHours.size > 5) {
      riskScore += 20;
    }
    
    // New IP address
    if (!behavior.normalIPs.has(req.ip) && behavior.normalIPs.size > 2) {
      riskScore += 30;
    }
    
    // New user agent
    if (!behavior.normalUserAgents.has(req.get('user-agent')) && behavior.normalUserAgents.size > 1) {
      riskScore += 25;
    }
    
    behavior.riskScore = riskScore;
    this.deviceFingerprints.set(userKey, behavior);
    
    return { riskScore, isAnomalous: riskScore > 50 };
  }
  
  // 🔄 SECURITY QUESTIONS
  setSecurityQuestions(userId, questions) {
    const encrypted = questions.map(q => ({
      question: q.question,
      answer: bcrypt.hashSync(q.answer.toLowerCase().trim(), 10)
    }));
    
    this.securityQuestions.set(userId, encrypted);
    
    auditLog('security_questions_set', { userId, questionCount: questions.length });
  }
  
  verifySecurityAnswer(userId, questionIndex, answer) {
    const questions = this.securityQuestions.get(userId);
    if (!questions || !questions[questionIndex]) {
      return false;
    }
    
    const normalizedAnswer = answer.toLowerCase().trim();
    return bcrypt.compareSync(normalizedAnswer, questions[questionIndex].answer);
  }
  
  // 🧹 CLEANUP TASKS
  startCleanupTasks() {
    // Clean expired sessions every 30 minutes
    setInterval(() => {
      this.cleanupExpiredSessions();
    }, 30 * 60 * 1000);
    
    // Clean old failed attempts every hour
    setInterval(() => {
      this.cleanupFailedAttempts();
    }, 60 * 60 * 1000);
    
    // Clean behavioral data every 24 hours
    setInterval(() => {
      this.cleanupBehavioralData();
    }, 24 * 60 * 60 * 1000);
  }
  
  cleanupExpiredSessions() {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    
    for (const [sessionId, session] of this.activeSessions.entries()) {
      if (now - session.createdAt > maxAge || !session.isActive) {
        this.activeSessions.delete(sessionId);
      }
    }
  }
  
  cleanupFailedAttempts() {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    
    for (const [key, attempt] of this.failedAttempts.entries()) {
      if (now - attempt.firstAttempt > maxAge) {
        this.failedAttempts.delete(key);
      }
    }
  }
  
  cleanupBehavioralData() {
    // Keep only recent behavioral data (30 days)
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    
    for (const [key, behavior] of this.deviceFingerprints.entries()) {
      // Reset if too old (simplified - could be more sophisticated)
      if (behavior.lastUpdate && behavior.lastUpdate < thirtyDaysAgo) {
        this.deviceFingerprints.delete(key);
      }
    }
  }
  
  invalidateSession(sessionId, reason) {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.isActive = false;
      
      auditLog('session_invalidated', {
        sessionId,
        userId: session.userId,
        reason,
        duration: Date.now() - session.createdAt
      });
      
      this.activeSessions.delete(sessionId);
    }
  }
  
  // 📊 SECURITY METRICS
  getSecurityMetrics() {
    const activeSessions = Array.from(this.activeSessions.values()).filter(s => s.isActive);
    const elevatedRiskSessions = activeSessions.filter(s => s.securityLevel === 'elevated_risk');
    
    return {
      activeSessions: activeSessions.length,
      elevatedRiskSessions: elevatedRiskSessions.length,
      blacklistedTokens: this.compromisedTokens.size,
      failedAttemptsTracked: this.failedAttempts.size,
      behavioralProfiles: this.deviceFingerprints.size,
      securityQuestions: this.securityQuestions.size
    };
  }
}

// Singleton instance
const authHardening = new AuthenticationHardening();

// 🛡️ HARDENED AUTHENTICATION MIDDLEWARE
const hardenedAuthMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({
      error: 'Authentication token required',
      code: 'TOKEN_MISSING'
    });
  }
  
  // Check if token is blacklisted
  if (authHardening.isTokenBlacklisted(token)) {
    securityLog('blacklisted_token_attempt', 'critical', {
      ip: req.ip,
      userAgent: req.get('user-agent'),
      endpoint: req.path
    }, req);
    
    return res.status(403).json({
      error: 'Token has been revoked',
      code: 'TOKEN_BLACKLISTED'
    });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    
    // Behavioral analysis
    const behaviorAnalysis = authHardening.analyzeBehavior(decoded.id, req, req.path);
    
    if (behaviorAnalysis.isAnomalous) {
      securityLog('anomalous_behavior_detected', 'high', {
        userId: decoded.id,
        riskScore: behaviorAnalysis.riskScore,
        ip: req.ip,
        endpoint: req.path
      }, req);
      
      // Could trigger additional verification steps
      req.securityFlags = { 
        requireMFA: true, 
        riskScore: behaviorAnalysis.riskScore 
      };
    }
    
    next();
    
  } catch (error) {
    securityLog('token_verification_failed', 'medium', {
      error: error.message,
      ip: req.ip,
      userAgent: req.get('user-agent')
    }, req);
    
    return res.status(403).json({
      error: 'Invalid authentication token',
      code: 'TOKEN_INVALID'
    });
  }
};

// 🚨 REQUIRE MFA MIDDLEWARE
const requireMFA = (req, res, next) => {
  if (req.securityFlags?.requireMFA) {
    return res.status(403).json({
      error: 'Multi-factor authentication required',
      code: 'MFA_REQUIRED',
      riskScore: req.securityFlags.riskScore
    });
  }
  next();
};

module.exports = {
  AuthenticationHardening,
  authHardening,
  hardenedAuthMiddleware,
  requireMFA
};