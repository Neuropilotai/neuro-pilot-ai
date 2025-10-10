import { test as base, expect } from '@playwright/test';

/**
 * Test Fixtures for Inventory Enterprise Dashboard
 * Version: v2.5.1-2025-10-07
 *
 * Provides:
 * - Authenticated page context (JWT pre-seeded)
 * - Test user credentials
 * - Environment configuration
 */

// Test user credentials
export const TEST_USERS = {
  admin: {
    email: 'admin@example.com',
    password: 'Admin123!',
    role: 'Admin',
    has2FA: false,
  },
  manager: {
    email: 'manager@example.com',
    password: 'Manager123!',
    role: 'Manager',
    has2FA: false,
  },
  analyst: {
    email: 'analyst@example.com',
    password: 'Analyst123!',
    role: 'Analyst',
    has2FA: false,
  },
  viewer: {
    email: 'viewer@example.com',
    password: 'Viewer123!',
    role: 'Auditor',
    has2FA: false,
  },
  admin2fa: {
    email: 'admin2fa@example.com',
    password: 'Admin2FA123!',
    role: 'Admin',
    has2FA: true,
    totpSecret: 'JBSWY3DPEHPK3PXP', // Base32 secret for testing
  },
};

// Mock JWT token for testing (valid structure, expired signature OK for frontend tests)
export const MOCK_JWT_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ0ZXN0LXVzZXItMTIzIiwiZW1haWwiOiJhZG1pbkBleGFtcGxlLmNvbSIsInJvbGUiOiJBZG1pbiIsInRlbmFudElkIjoidGVuYW50XzAwMSIsImlhdCI6MTcwNzMyMDAwMCwiZXhwIjoyMDA3MzIwMDAwfQ.test-signature';

export const MOCK_USER = {
  userId: 'test-user-123',
  email: 'admin@example.com',
  role: 'Admin',
  tenantId: 'tenant_001',
};

// Extended test fixture with authentication
type AuthenticatedFixtures = {
  authenticatedPage: any;
};

export const test = base.extend<AuthenticatedFixtures>({
  authenticatedPage: async ({ page }, use) => {
    // Pre-seed localStorage with auth token and user data
    await page.goto('/');

    await page.evaluate(
      ({ token, user }) => {
        localStorage.setItem('auth_token', token);
        localStorage.setItem('user', JSON.stringify(user));
        localStorage.setItem('tenant_id', user.tenantId);
      },
      { token: MOCK_JWT_TOKEN, user: MOCK_USER }
    );

    // Navigate to dashboard (will be authenticated)
    await page.goto('/dashboard');

    // Wait for authentication to be processed
    await page.waitForSelector('[data-testid="dashboard-layout"]', {
      timeout: 10000,
    });

    await use(page);
  },
});

export { expect };

/**
 * Helper: Login via UI
 */
export async function loginViaUI(
  page: any,
  credentials: { email: string; password: string }
) {
  await page.goto('/login');

  await page.fill('input[type="email"]', credentials.email);
  await page.fill('input[type="password"]', credentials.password);

  await page.click('button[type="submit"]');

  // Wait for redirect to dashboard
  await page.waitForURL('**/dashboard/**', { timeout: 10000 });
}

/**
 * Helper: Verify 2FA code (for testing)
 */
export async function verify2FA(page: any, code: string) {
  await page.waitForSelector('[data-testid="2fa-modal"]', { timeout: 5000 });

  await page.fill('input[type="text"]', code);

  await page.click('button[type="submit"]');

  // Wait for modal to close and redirect
  await page.waitForURL('**/dashboard/**', { timeout: 10000 });
}

/**
 * Helper: Wait for metrics to load
 */
export async function waitForMetrics(page: any) {
  // Wait for at least one stat card to show non-zero value
  await page.waitForFunction(
    () => {
      const statValues = document.querySelectorAll('.stat-value');
      return Array.from(statValues).some(
        (el) => el.textContent && el.textContent.trim() !== '0'
      );
    },
    { timeout: 10000 }
  );
}

/**
 * Helper: Wait for chart to render
 */
export async function waitForChart(page: any, chartSelector: string) {
  await page.waitForSelector(chartSelector, { timeout: 10000 });

  // Wait for Recharts SVG to render
  await page.waitForSelector(`${chartSelector} svg`, { timeout: 5000 });
}

/**
 * Helper: Check accessibility with axe-core
 */
export async function checkAccessibility(page: any) {
  const { injectAxe, checkA11y } = await import('@axe-core/playwright');

  await injectAxe(page);

  await checkA11y(page, null, {
    detailedReport: true,
    detailedReportOptions: {
      html: true,
    },
  });
}
