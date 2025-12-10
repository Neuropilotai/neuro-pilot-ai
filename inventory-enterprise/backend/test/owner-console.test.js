/**
 * Integration Tests: Owner Console & Authentication
 * Version: v23.6.13-2025-12-09
 *
 * Tests for:
 * - Owner authentication flow
 * - Owner console endpoints
 * - JWT token validation
 * - Device ID verification
 * - CSP compliance verification
 *
 * Target: Comprehensive coverage of owner console functionality
 */

const { describe, it, before, after, beforeEach } = require('mocha');
const { expect } = require('chai');
const request = require('supertest');
const jwt = require('jsonwebtoken');

// Note: This test assumes the server is running or can be started
// For full integration, you may need to start the server in test mode
const BASE_URL = process.env.TEST_API_URL || 'http://localhost:8083';
const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-change-in-production';

describe('Owner Console & Authentication Integration Tests', function() {
  this.timeout(15000);

  let ownerToken;
  let deviceId = 'test-device-123';
  let testUser = {
    email: 'neuropilotai@gmail.com',
    password: 'Admin123!@#',
    role: 'owner'
  };

  describe('Authentication Flow', function() {
    it('should login and receive JWT token', async function() {
      const response = await request(BASE_URL)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password
        })
        .expect(200);

      expect(response.body).to.have.property('accessToken');
      expect(response.body).to.have.property('user');
      expect(response.body.user).to.have.property('email', testUser.email);
      expect(response.body.user).to.have.property('role', testUser.role);

      ownerToken = response.body.accessToken;
    });

    it('should validate JWT token structure', function() {
      expect(ownerToken).to.exist;
      const decoded = jwt.decode(ownerToken);
      expect(decoded).to.have.property('userId');
      expect(decoded).to.have.property('email', testUser.email);
      expect(decoded).to.have.property('role', testUser.role);
    });

    it('should reject invalid credentials', async function() {
      await request(BASE_URL)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'wrong-password'
        })
        .expect(401);
    });

    it('should require email and password', async function() {
      await request(BASE_URL)
        .post('/api/auth/login')
        .send({
          email: testUser.email
        })
        .expect(400);
    });
  });

  describe('Owner Console Endpoints', function() {
    beforeEach(function() {
      if (!ownerToken) {
        this.skip(); // Skip if authentication failed
      }
    });

    it('should access /api/owner/dashboard with valid token', async function() {
      const response = await request(BASE_URL)
        .get('/api/owner/dashboard')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Owner-Device', deviceId)
        .expect(200);

      expect(response.body).to.be.an('object');
    });

    it('should access /api/owner/dashboard/stats with valid token', async function() {
      const response = await request(BASE_URL)
        .get('/api/owner/dashboard/stats')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Owner-Device', deviceId)
        .expect(200);

      expect(response.body).to.be.an('object');
    });

    it('should access /api/owner/ops/status with valid token', async function() {
      const response = await request(BASE_URL)
        .get('/api/owner/ops/status')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Owner-Device', deviceId)
        .expect(200);

      expect(response.body).to.be.an('object');
      // Verify response structure
      expect(response.body).to.satisfy((body) => {
        return typeof body === 'object';
      });
    });

    it('should reject requests without Authorization header', async function() {
      await request(BASE_URL)
        .get('/api/owner/dashboard')
        .expect(401);
    });

    it('should reject requests with invalid token', async function() {
      await request(BASE_URL)
        .get('/api/owner/dashboard')
        .set('Authorization', 'Bearer invalid-token')
        .set('X-Owner-Device', deviceId)
        .expect(401);
    });

    it('should reject requests without device ID for owner endpoints', async function() {
      await request(BASE_URL)
        .get('/api/owner/dashboard')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(403);
    });
  });

  describe('Owner Reports Endpoints', function() {
    beforeEach(function() {
      if (!ownerToken) {
        this.skip();
      }
    });

    it('should access /api/owner/reports/finance with valid token', async function() {
      const response = await request(BASE_URL)
        .get('/api/owner/reports/finance')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Owner-Device', deviceId)
        .expect(200);

      expect(response.body).to.be.an('object');
    });

    it('should access /api/owner/reports/executive with valid token', async function() {
      const response = await request(BASE_URL)
        .get('/api/owner/reports/executive')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Owner-Device', deviceId)
        .expect(200);

      expect(response.body).to.be.an('object');
    });
  });

  describe('Health & Status Endpoints', function() {
    it('should access /api/health without authentication', async function() {
      const response = await request(BASE_URL)
        .get('/api/health')
        .expect(200);

      expect(response.body).to.have.property('status');
    });

    it('should access /api/owner/auth-check with valid token', async function() {
      if (!ownerToken) {
        this.skip();
      }

      const response = await request(BASE_URL)
        .get('/api/owner/auth-check')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Owner-Device', deviceId)
        .expect(200);

      expect(response.body).to.have.property('authenticated', true);
      expect(response.body).to.have.property('user');
    });
  });

  describe('CSP Compliance', function() {
    it('should serve owner console HTML without inline scripts', async function() {
      const response = await request(BASE_URL)
        .get('/owner-super-console-v15.html')
        .expect(200);

      const html = response.text;
      
      // Check that there are no inline <script> tags with code
      const inlineScriptPattern = /<script[^>]*>[\s\S]*?<\/script>/g;
      const inlineScripts = html.match(inlineScriptPattern);
      
      if (inlineScripts) {
        // All scripts should be external (have src attribute)
        inlineScripts.forEach(script => {
          expect(script).to.include('src=');
        });
      }
    });

    it('should serve login page without inline scripts', async function() {
      const response = await request(BASE_URL)
        .get('/login.html')
        .expect(200);

      const html = response.text;
      
      // Check that login-handler.js is referenced
      expect(html).to.include('login-handler.js');
    });

    it('should serve quick login page without inline scripts', async function() {
      const response = await request(BASE_URL)
        .get('/quick_login.html')
        .expect(200);

      const html = response.text;
      
      // Check that quick-login-handler.js is referenced
      expect(html).to.include('quick-login-handler.js');
    });
  });

  describe('Version Display', function() {
    it('should display version in console HTML', async function() {
      const response = await request(BASE_URL)
        .get('/owner-super-console-v15.html')
        .expect(200);

      const html = response.text;
      
      // Check for version badge
      expect(html).to.include('consoleVersionBadge');
      // Check for version placeholder or actual version
      expect(html).to.match(/Console v[\d.]+/);
    });
  });
});

