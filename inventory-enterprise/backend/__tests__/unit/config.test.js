/**
 * Unit Tests - Configuration Module
 */

describe('Config Module', () => {
  beforeEach(() => {
    // Reset modules before each test
    jest.resetModules();
  });

  describe('Configuration Validation', () => {
    test('should load configuration successfully with valid env', () => {
      const config = require('../../config');

      expect(config.nodeEnv).toBe('test');
      expect(config.isDevelopment).toBe(false);
      expect(config.port).toBe(8083);
    });

    test('should have encryption key as Buffer', () => {
      const config = require('../../config');

      expect(Buffer.isBuffer(config.encryptionKey)).toBe(true);
      expect(config.encryptionKey.length).toBe(32); // AES-256 requires 32 bytes
    });

    test('should parse boolean values correctly', () => {
      const config = require('../../config');

      expect(typeof config.metricsEnabled).toBe('boolean');
      expect(typeof config.backupEnabled).toBe('boolean');
      expect(typeof config.aiEnabled).toBe('boolean');
    });

    test('should parse integer values correctly', () => {
      const config = require('../../config');

      expect(typeof config.port).toBe('number');
      expect(typeof config.bcryptRounds).toBe('number');
      expect(typeof config.maxLoginAttempts).toBe('number');
      expect(config.bcryptRounds).toBeGreaterThanOrEqual(10);
    });

    test('should parse array values correctly', () => {
      const config = require('../../config');

      expect(Array.isArray(config.supportedLanguages)).toBe(true);
      expect(config.supportedLanguages).toContain('en');
      expect(config.supportedLanguages).toContain('fr');
    });

    test('should provide default values when env vars missing', () => {
      // Clear optional env vars
      const originalLogLevel = process.env.LOG_LEVEL;
      delete process.env.LOG_LEVEL;

      jest.resetModules();
      const config = require('../../config');

      expect(config.logLevel).toBe('error'); // test env default

      // Restore
      if (originalLogLevel) process.env.LOG_LEVEL = originalLogLevel;
    });
  });

  describe('Security Settings', () => {
    test('should have secure JWT settings', () => {
      const config = require('../../config');

      expect(config.jwtSecret).toBeTruthy();
      expect(config.jwtSecret.length).toBeGreaterThanOrEqual(50);
      expect(config.jwtAccessExpiry).toBeTruthy();
      expect(config.jwtRefreshExpiry).toBeTruthy();
    });

    test('should have rate limiting configured', () => {
      const config = require('../../config');

      expect(config.rateLimitMax).toBeGreaterThan(0);
      expect(config.authRateLimitMax).toBeGreaterThan(0);
      expect(config.rateLimitWindow).toBeGreaterThan(0);
    });

    test('should have session timeout configured', () => {
      const config = require('../../config');

      expect(config.sessionTimeout).toBeGreaterThan(0);
      expect(config.lockoutTime).toBeGreaterThan(0);
    });
  });

  describe('Feature Flags', () => {
    test('should expose feature flags', () => {
      const config = require('../../config');

      expect(typeof config.featureBarcodeScanning).toBe('boolean');
      expect(typeof config.featurePdfUpload).toBe('boolean');
      expect(typeof config.featureExcelImport).toBe('boolean');
      expect(typeof config.featureMultiLocation).toBe('boolean');
      expect(typeof config.featureCaseTracking).toBe('boolean');
    });

    test('should have AI features configurable', () => {
      const config = require('../../config');

      expect(typeof config.aiEnabled).toBe('boolean');
      expect(typeof config.aiForecasting).toBe('boolean');
      expect(typeof config.aiAnomalyDetection).toBe('boolean');
      expect(config.aiConfidenceThreshold).toBeGreaterThan(0);
      expect(config.aiConfidenceThreshold).toBeLessThanOrEqual(1);
    });
  });

  describe('toString method', () => {
    test('should return JSON representation', () => {
      const config = require('../../config');

      const str = config.toString();
      expect(() => JSON.parse(str)).not.toThrow();

      const parsed = JSON.parse(str);
      expect(parsed.nodeEnv).toBe('test');
      expect(parsed.port).toBe(8083);
    });

    test('should not expose sensitive data', () => {
      const config = require('../../config');

      const str = config.toString();
      expect(str).not.toContain(config.jwtSecret);
      expect(str).not.toContain(config.adminPassword);
    });
  });
});
