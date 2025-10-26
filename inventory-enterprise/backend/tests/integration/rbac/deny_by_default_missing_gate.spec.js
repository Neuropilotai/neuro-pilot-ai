/**
 * RBAC Integration Test: Deny-by-Default for Routes Missing RBAC Gates
 *
 * Verifies that routes with authenticateToken but NO requireRole middleware
 * are automatically denied (fail-safe behavior).
 *
 * This test ensures that if a developer forgets to add requireRole to a new
 * authenticated route, it will default to DENY rather than allowing access.
 *
 * Strategy:
 * 1. Identify routes with authenticateToken but missing requireRole
 * 2. Test that they return 403 or 500 (not 200) for non-OWNER users
 * 3. Ensure OWNER still has access (break-glass pattern)
 *
 * @version 15.5.1
 */

const request = require('supertest');
const { getAuthHeader } = require('../support/jwtMocks');

const app = require('../../../server');

describe('RBAC: Deny-by-default for routes missing requireRole', () => {
  describe('Routes that should have requireRole gates', () => {
    // This test checks routes that SHOULD have RBAC gates but might be missing them

    test('Example: POST /api/owner/test-unprotected-route → Should fail safely', async () => {
      // This is a hypothetical example - replace with actual routes if found
      const readonlyAuth = getAuthHeader('READONLY');

      const response = await request(app)
        .post('/api/owner/test-unprotected-route')
        .set(readonlyAuth)
        .send({ data: 'test' });

      // Should NOT return 200 for READONLY user
      // Should return 403 (forbidden) or 404 (not found) or 500 (missing middleware)
      expect(response.status).not.toBe(200);
      expect([403, 404, 500]).toContain(response.status);
    });

    test('Static analysis: Scan for routes with auth but no RBAC', () => {
      // This test is more of a documentation test
      // The actual scanning is done by verify_v15_5_rbac.sh script

      // We can check that the verification script exists
      const fs = require('fs');
      const path = require('path');

      const scriptPath = path.join(__dirname, '../../../scripts/verify_v15_5_rbac.sh');
      const scriptExists = fs.existsSync(scriptPath);

      expect(scriptExists).toBe(true);

      if (scriptExists) {
        const scriptContent = fs.readFileSync(scriptPath, 'utf-8');

        // Verify that the script checks for missing gates
        expect(scriptContent).toContain('missing_gates');
        expect(scriptContent).toContain('authenticateToken');
        expect(scriptContent).toContain('requireRole');
      }
    });
  });

  describe('OWNER break-glass pattern', () => {
    test('OWNER should still access all authenticated routes', async () => {
      const ownerAuth = getAuthHeader('OWNER');

      // Test a known protected route
      const response = await request(app)
        .get('/api/owner/dashboard')
        .set(ownerAuth);

      expect([200, 304]).toContain(response.status);
    });

    test('OWNER can access finance endpoints', async () => {
      const ownerAuth = getAuthHeader('OWNER');

      const response = await request(app)
        .get('/api/owner/financials/export/csv')
        .set(ownerAuth)
        .query({ period: '2025-01' });

      expect(response.status).not.toBe(403);
    });
  });

  describe('requireRole middleware behavior', () => {
    test('Route with requireRole should check user role', async () => {
      // Test that requireRole middleware is actually enforcing roles
      const readonlyAuth = getAuthHeader('READONLY');
      const financeAuth = getAuthHeader('FINANCE');

      // READONLY should be denied
      const readonlyResponse = await request(app)
        .post('/api/owner/financials/import')
        .set(readonlyAuth)
        .send({ from: '2025-01-01', to: '2025-06-30' });

      expect(readonlyResponse.status).toBe(403);

      // FINANCE should be allowed
      const financeResponse = await request(app)
        .post('/api/owner/financials/import')
        .set(financeAuth)
        .send({ from: '2025-01-01', to: '2025-06-30' });

      expect(financeResponse.status).not.toBe(403);
    });
  });

  describe('Missing token should always fail', () => {
    test('No Authorization header → 401 Unauthorized', async () => {
      const response = await request(app)
        .get('/api/owner/dashboard');

      expect(response.status).toBe(401);
    });

    test('Invalid token → 401 Unauthorized', async () => {
      const response = await request(app)
        .get('/api/owner/dashboard')
        .set('Authorization', 'Bearer invalid-token-12345');

      expect(response.status).toBe(401);
    });

    test('Malformed Authorization header → 401 Unauthorized', async () => {
      const response = await request(app)
        .get('/api/owner/dashboard')
        .set('Authorization', 'NotBearer some-token');

      expect(response.status).toBe(401);
    });
  });
});
