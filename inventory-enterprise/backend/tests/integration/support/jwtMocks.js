/**
 * JWT Token Mocking Utilities for RBAC Integration Tests
 *
 * Provides pre-signed JWT tokens for each role tier:
 * - READONLY: View-only access
 * - OPS: Operations (counts, proposals, feedback)
 * - FINANCE: Financial operations (imports, exports, approvals)
 * - OWNER: Full administrative access
 *
 * @version 15.5.1
 */

const jwt = require('jsonwebtoken');

// Use the same secret as the application (or fallback for testing)
const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-rbac-tests';

// Token expiration (1 hour for tests)
const JWT_EXPIRES_IN = '1h';

/**
 * Create a JWT token for a given role
 * @param {string} role - Role name (READONLY, OPS, FINANCE, OWNER)
 * @param {object} overrides - Optional payload overrides
 * @returns {string} Signed JWT token
 */
function createToken(role, overrides = {}) {
  const payload = {
    sub: `test-user-${role.toLowerCase()}@neuro-pilot.ai`,
    email: `test-${role.toLowerCase()}@neuro-pilot.ai`,
    role,
    tenant_id: 'test-tenant',
    location_id: 'test-location',
    ...overrides
  };

  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Pre-generated tokens for each role
 */
const tokens = {
  READONLY: null,
  OPS: null,
  FINANCE: null,
  OWNER: null
};

/**
 * Generate all role tokens
 * Call this once before running tests
 */
function generateTokens() {
  tokens.READONLY = createToken('READONLY');
  tokens.OPS = createToken('OPS');
  tokens.FINANCE = createToken('FINANCE');
  tokens.OWNER = createToken('OWNER');
}

/**
 * Get token for a specific role
 * @param {string} role - Role name
 * @returns {string} JWT token
 */
function getToken(role) {
  if (!tokens[role]) {
    generateTokens();
  }
  return tokens[role];
}

/**
 * Get authorization header for a role
 * @param {string} role - Role name
 * @returns {object} Authorization header object
 */
function getAuthHeader(role) {
  return {
    Authorization: `Bearer ${getToken(role)}`
  };
}

// Generate tokens on module load
generateTokens();

module.exports = {
  createToken,
  generateTokens,
  getToken,
  getAuthHeader,
  tokens
};
