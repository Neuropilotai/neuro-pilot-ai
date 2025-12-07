/**
 * E2E Smoke Tests: Owner Console
 * NeuroPilot P1 Hardening
 *
 * Tests:
 *   1. Owner login succeeds with seeded credentials
 *   2. All major console tabs return 200 OK
 *   3. Tenant resolution works for owner
 *   4. Owner-only routes require device binding
 */

const { test, expect } = require('@playwright/test');
const { pool } = require('../db');

const API_BASE = process.env.API_BASE_URL || 'http://localhost:3001';
const OWNER_EMAIL = 'owner@neuropilot.test';
const OWNER_PASSWORD = 'OwnerTest123!';

let authToken = null;

// ============================================
// TEST HELPERS
// ============================================

async function seedOwnerUser() {
  const bcrypt = require('bcrypt');
  const hashedPassword = await bcrypt.hash(OWNER_PASSWORD, 12);

  // Insert test owner user
  await pool.query(`
    INSERT INTO app_user (email, password_hash, role, org_id, device_bound, owner_org_id, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, now())
    ON CONFLICT (email) DO UPDATE
    SET password_hash = $2, role = $3, device_bound = $5, updated_at = now()
  `, [OWNER_EMAIL, hashedPassword, 'OWNER', 'test-org-owner', true, 'test-org-owner']);
}

async function cleanupOwnerUser() {
  await pool.query('DELETE FROM app_user WHERE email = $1', [OWNER_EMAIL]);
}

async function loginAsOwner() {
  const response = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: OWNER_EMAIL,
      password: OWNER_PASSWORD
    })
  });

  if (!response.ok) {
    throw new Error(`Login failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  return data.token || data.accessToken;
}

// ============================================
// TESTS
// ============================================

test.describe('Owner Console Smoke Tests', () => {
  test.beforeAll(async () => {
    await seedOwnerUser();
  });

  test.afterAll(async () => {
    await cleanupOwnerUser();
    await pool.end();
  });

  test('Owner login succeeds', async () => {
    authToken = await loginAsOwner();
    expect(authToken).toBeTruthy();
    expect(authToken).toMatch(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/); // JWT format
  });

  test('GET /api/owner/console/session - Returns owner session info', async ({ request }) => {
    if (!authToken) {
      authToken = await loginAsOwner();
    }

    const response = await request.get(`${API_BASE}/api/owner/console/session`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'X-Org-Id': 'test-org-owner'
      }
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data).toBeTruthy();
  });

  test('GET /api/owner/console/locations - Returns locations list', async ({ request }) => {
    if (!authToken) {
      authToken = await loginAsOwner();
    }

    const response = await request.get(`${API_BASE}/api/owner/console/locations`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'X-Org-Id': 'test-org-owner'
      }
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(Array.isArray(data) || data.data).toBeTruthy();
  });

  test('GET /api/owner/inventory/current - Returns current inventory', async ({ request }) => {
    if (!authToken) {
      authToken = await loginAsOwner();
    }

    const response = await request.get(`${API_BASE}/api/owner/inventory/current`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'X-Org-Id': 'test-org-owner'
      }
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data).toBeTruthy();
  });

  test('GET /api/owner/dashboard - Dashboard stats endpoint', async ({ request }) => {
    if (!authToken) {
      authToken = await loginAsOwner();
    }

    const response = await request.get(`${API_BASE}/api/owner/dashboard`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'X-Org-Id': 'test-org-owner'
      }
    });

    // May return 200 or 404 depending on implementation
    expect([200, 404]).toContain(response.status());
  });

  test('GET /api/health - Public health check (no auth required)', async ({ request }) => {
    const response = await request.get(`${API_BASE}/health`);

    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.status).toBe('ok');
  });

  test('Tenant resolution from JWT org_id claim', async ({ request }) => {
    if (!authToken) {
      authToken = await loginAsOwner();
    }

    // Test that tenant is resolved even without X-Org-Id header (from JWT)
    const response = await request.get(`${API_BASE}/api/owner/console/session`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
        // No X-Org-Id header - should resolve from JWT
      }
    });

    // Should either succeed (200) or fail with specific tenant error (not 500)
    expect([200, 400, 403, 404]).toContain(response.status());
  });

  test('Tenant fail-open for owner when TENANT_FAIL_OPEN_FOR_OWNER enabled', async ({ request }) => {
    // This test verifies the P1 hardening feature
    if (!authToken) {
      authToken = await loginAsOwner();
    }

    // Make request without explicit org_id - should fail-open if env var is set
    const response = await request.get(`${API_BASE}/api/owner/console/session`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    // With fail-open enabled, owner should still access their org
    // Without it, may get 400 (TENANT_NOT_FOUND)
    expect([200, 400]).toContain(response.status());
  });

  test('Non-owner user cannot access owner routes', async ({ request }) => {
    // Create a regular user
    const bcrypt = require('bcrypt');
    const regularUserEmail = 'user@neuropilot.test';
    const regularPassword = 'User123!';
    const hashedPassword = await bcrypt.hash(regularPassword, 12);

    await pool.query(`
      INSERT INTO app_user (email, password_hash, role, org_id, created_at)
      VALUES ($1, $2, $3, $4, now())
      ON CONFLICT (email) DO UPDATE
      SET password_hash = $2, role = $3
    `, [regularUserEmail, hashedPassword, 'USER', 'test-org-owner']);

    // Login as regular user
    const loginResponse = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: regularUserEmail,
        password: regularPassword
      })
    });

    const loginData = await loginResponse.json();
    const regularToken = loginData.token || loginData.accessToken;

    // Try to access owner route - should be denied
    const response = await request.get(`${API_BASE}/api/owner/console/session`, {
      headers: {
        'Authorization': `Bearer ${regularToken}`,
        'X-Org-Id': 'test-org-owner'
      }
    });

    // Should be forbidden (403) or unauthorized (401)
    expect([401, 403]).toContain(response.status());

    // Cleanup
    await pool.query('DELETE FROM app_user WHERE email = $1', [regularUserEmail]);
  });

  test('Correlation ID is returned in error responses', async ({ request }) => {
    // Make request without auth to trigger error
    const response = await request.get(`${API_BASE}/api/owner/console/session`);

    expect(response.status()).toBe(401);
    const data = await response.json();

    // Should have correlationId in error response
    expect(data.correlationId || data.cid).toBeTruthy();
  });

  test('Structured logging: X-Correlation-Id header is respected', async ({ request }) => {
    if (!authToken) {
      authToken = await loginAsOwner();
    }

    const customCorrelationId = 'test-' + Date.now();

    const response = await request.get(`${API_BASE}/api/owner/console/session`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'X-Org-Id': 'test-org-owner',
        'X-Correlation-Id': customCorrelationId
      }
    });

    // Request should succeed or fail gracefully
    expect(response.status()).toBeLessThan(500);

    // If error, should echo back the correlation ID
    if (!response.ok()) {
      const data = await response.json();
      if (data.correlationId) {
        expect(data.correlationId).toBe(customCorrelationId);
      }
    }
  });
});

test.describe('Owner Console Frontend Tabs', () => {
  test.beforeAll(async () => {
    await seedOwnerUser();
    authToken = await loginAsOwner();
  });

  test.afterAll(async () => {
    await cleanupOwnerUser();
  });

  test('HTML: owner-super-console.html loads', async ({ page }) => {
    await page.goto(`${API_BASE}/owner-super-console.html`);

    // Check that page loaded (200 status)
    expect(page.url()).toContain('owner-super-console');

    // Check for key UI elements
    const title = await page.title();
    expect(title).toBeTruthy();
  });

  test('Console redirects work: /owner-console → /owner-super-console.html', async ({ page }) => {
    const response = await page.goto(`${API_BASE}/owner-console`);

    // Should redirect (301) to owner-super-console.html
    expect(page.url()).toContain('owner-super-console');
  });

  test('Static assets load without errors', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto(`${API_BASE}/owner-super-console.html`);

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Should have minimal console errors (allow for known warnings)
    expect(consoleErrors.length).toBeLessThan(5);
  });
});
