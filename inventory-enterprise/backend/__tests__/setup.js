/**
 * Jest setup file
 * Runs before all tests
 */

// Set test environment
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret_' + 'x'.repeat(50);
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_' + 'x'.repeat(50);
process.env.SESSION_SECRET = 'test_session_secret_' + 'x'.repeat(50);
process.env.ENCRYPTION_KEY = 'a'.repeat(64); // 32 bytes = 64 hex chars
process.env.ADMIN_EMAIL = 'test@example.com';
process.env.ADMIN_PASSWORD = 'TestPassword123!';
process.env.DB_PATH = ':memory:'; // In-memory database for tests
process.env.TRANSACTION_LOG_ENABLED = 'false'; // Disable for unit tests
process.env.LOG_LEVEL = 'error'; // Reduce log noise

// Global test timeout
jest.setTimeout(10000);

// Mock console methods to reduce test output noise
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
