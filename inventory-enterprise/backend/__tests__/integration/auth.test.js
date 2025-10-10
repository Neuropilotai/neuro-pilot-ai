/**
 * Integration Tests - Authentication API
 */

const request = require('supertest');
const express = require('express');

// Mock config and dependencies
jest.mock('../../config', () => ({
  isDevelopment: false,
  isProduction: false,
  jwtSecret: 'test_secret_' + 'x'.repeat(50),
  jwtRefreshSecret: 'test_refresh_' + 'x'.repeat(50),
  jwtAccessExpiry: '15m',
  jwtRefreshExpiry: '7d',
  bcryptRounds: 10, // Lower for tests
  maxLoginAttempts: 5,
  lockoutTime: 1800000,
  logLevel: 'error'
}));

jest.mock('../../config/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  },
  auditLog: jest.fn(),
  securityLog: jest.fn()
}));

// Create test app
function createTestApp() {
  const app = express();
  app.use(express.json());

  const authRoutes = require('../../routes/auth');
  app.use('/api/auth', authRoutes);

  return app;
}

describe('Authentication API', () => {
  let app;

  beforeEach(() => {
    // Reset modules and create fresh app
    jest.resetModules();
    // Clear users map
    const { users } = require('../../middleware/auth');
    users.clear();

    app = createTestApp();
  });

  describe('POST /api/auth/register', () => {
    test('should register new user successfully', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'SecurePass123!',
          firstName: 'John',
          lastName: 'Doe'
        });

      expect(response.status).toBe(201);
      expect(response.body.user).toBeDefined();
      expect(response.body.user.email).toBe('test@example.com');
      expect(response.body.user.password).toBeUndefined(); // Should not expose password
    });

    test('should reject weak password', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'weak',
          firstName: 'John',
          lastName: 'Doe'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Validation failed');
    });

    test('should reject invalid email', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'invalid-email',
          password: 'SecurePass123!',
          firstName: 'John',
          lastName: 'Doe'
        });

      expect(response.status).toBe(400);
    });

    test('should reject duplicate email', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'SecurePass123!',
        firstName: 'John',
        lastName: 'Doe'
      };

      // Register first time
      await request(app)
        .post('/api/auth/register')
        .send(userData);

      // Try to register again
      const response = await request(app)
        .post('/api/auth/register')
        .send(userData);

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('USER_EXISTS');
    });

    test('should reject missing required fields', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com'
          // Missing password, firstName, lastName
        });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      // Register a test user
      await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'SecurePass123!',
          firstName: 'John',
          lastName: 'Doe'
        });
    });

    test('should login successfully with correct credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'SecurePass123!'
        });

      expect(response.status).toBe(200);
      expect(response.body.accessToken).toBeDefined();
      expect(response.body.user).toBeDefined();
      expect(response.body.user.email).toBe('test@example.com');
    });

    test('should reject incorrect password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'WrongPassword123!'
        });

      expect(response.status).toBe(401);
      expect(response.body.code).toBe('LOGIN_FAILED');
    });

    test('should reject non-existent user', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'SecurePass123!'
        });

      expect(response.status).toBe(401);
    });

    test('should set refresh token cookie', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'SecurePass123!'
        });

      expect(response.headers['set-cookie']).toBeDefined();
      const cookieHeader = response.headers['set-cookie'].find(c => c.startsWith('refreshToken='));
      expect(cookieHeader).toBeDefined();
      expect(cookieHeader).toContain('HttpOnly');
    });
  });

  describe('POST /api/auth/refresh', () => {
    let refreshToken;

    beforeEach(async () => {
      // Register and login to get tokens
      await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'SecurePass123!',
          firstName: 'John',
          lastName: 'Doe'
        });

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'SecurePass123!'
        });

      // Extract refresh token from cookie
      const cookies = loginResponse.headers['set-cookie'];
      const refreshCookie = cookies.find(c => c.startsWith('refreshToken='));
      refreshToken = refreshCookie.split(';')[0].split('=')[1];
    });

    test('should refresh access token successfully', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken });

      expect(response.status).toBe(200);
      expect(response.body.accessToken).toBeDefined();
      expect(response.body.code).toBe('TOKEN_REFRESHED');
    });

    test('should reject invalid refresh token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'invalid_token' });

      expect(response.status).toBe(401);
      expect(response.body.code).toBe('REFRESH_FAILED');
    });

    test('should reject missing refresh token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({});

      expect(response.status).toBe(401);
      expect(response.body.code).toBe('REFRESH_TOKEN_MISSING');
    });
  });

  describe('GET /api/auth/me', () => {
    let accessToken;

    beforeEach(async () => {
      // Register and login
      await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'SecurePass123!',
          firstName: 'John',
          lastName: 'Doe'
        });

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'SecurePass123!'
        });

      accessToken = loginResponse.body.accessToken;
    });

    test('should return current user info', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.user).toBeDefined();
      expect(response.body.user.email).toBe('test@example.com');
      expect(response.body.user.firstName).toBe('John');
      expect(response.body.user.password).toBeUndefined();
    });

    test('should reject request without token', async () => {
      const response = await request(app)
        .get('/api/auth/me');

      expect(response.status).toBe(401);
    });

    test('should reject invalid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid_token');

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    let accessToken, refreshToken;

    beforeEach(async () => {
      // Register and login
      await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'SecurePass123!',
          firstName: 'John',
          lastName: 'Doe'
        });

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'SecurePass123!'
        });

      accessToken = loginResponse.body.accessToken;

      const cookies = loginResponse.headers['set-cookie'];
      const refreshCookie = cookies.find(c => c.startsWith('refreshToken='));
      refreshToken = refreshCookie.split(';')[0].split('=')[1];
    });

    test('should logout successfully', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ refreshToken });

      expect(response.status).toBe(200);
      expect(response.body.code).toBe('LOGOUT_SUCCESS');
    });

    test('should clear refresh token cookie', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ refreshToken });

      const cookies = response.headers['set-cookie'];
      const refreshCookie = cookies?.find(c => c.startsWith('refreshToken='));

      if (refreshCookie) {
        expect(refreshCookie).toContain('Max-Age=0');
      }
    });
  });
});
