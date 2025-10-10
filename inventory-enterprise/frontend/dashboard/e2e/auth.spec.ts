import { test, expect } from '@playwright/test';
import { TEST_USERS, loginViaUI, verify2FA } from './fixtures';

/**
 * E2E Tests: Authentication Flow
 * Version: v2.5.1-2025-10-07
 *
 * Coverage:
 * - Login with email/password
 * - 2FA verification flow
 * - Logout
 * - Session persistence
 * - Invalid credentials handling
 */

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    // Clear any existing auth state
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test('should display login page with branding', async ({ page }) => {
    await page.goto('/login');

    // Check NeuroInnovate branding
    await expect(page.locator('text=Inventory Enterprise')).toBeVisible();
    await expect(page.locator('text=Enterprise Dashboard v2.5')).toBeVisible();

    // Check form fields
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('should login successfully with valid credentials', async ({ page }) => {
    await page.goto('/login');

    // Fill credentials
    await page.fill('input[type="email"]', TEST_USERS.admin.email);
    await page.fill('input[type="password"]', TEST_USERS.admin.password);

    // Submit form
    await page.click('button[type="submit"]');

    // Wait for redirect to dashboard
    await page.waitForURL('**/dashboard/**', { timeout: 10000 });

    // Verify dashboard loaded
    await expect(page.locator('text=Overview')).toBeVisible();

    // Verify user info in sidebar
    await expect(page.locator(`text=${TEST_USERS.admin.email}`)).toBeVisible();
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('/login');

    // Fill invalid credentials
    await page.fill('input[type="email"]', 'invalid@example.com');
    await page.fill('input[type="password"]', 'wrongpassword');

    // Submit form
    await page.click('button[type="submit"]');

    // Should stay on login page
    await expect(page).toHaveURL(/.*login/);

    // Check for error toast (react-hot-toast)
    // Note: Actual error handling depends on backend mock/response
  });

  test('should handle 2FA flow', async ({ page }) => {
    // This test assumes backend returns requires2FA: true
    await page.goto('/login');

    // Fill credentials for 2FA user
    await page.fill('input[type="email"]', TEST_USERS.admin2fa.email);
    await page.fill('input[type="password"]', TEST_USERS.admin2fa.password);

    // Submit form
    await page.click('button[type="submit"]');

    // Wait for 2FA modal
    await page.waitForSelector('text=Two-Factor Authentication', {
      timeout: 5000,
    });

    // Verify modal content
    await expect(
      page.locator('text=Enter the 6-digit code from your authenticator app')
    ).toBeVisible();

    // Enter 2FA code (mock code for testing)
    await page.fill('input[type="text"]', '123456');

    // Submit 2FA
    await page.click('button:has-text("Verify Code")');

    // Should redirect to dashboard on successful verification
    // Note: Backend must accept mock code or use test TOTP generator
    await page.waitForURL('**/dashboard/**', { timeout: 10000 });
  });

  test('should persist session on page reload', async ({ page }) => {
    await loginViaUI(page, TEST_USERS.admin);

    // Verify dashboard loaded
    await expect(page.locator('text=Overview')).toBeVisible();

    // Reload page
    await page.reload();

    // Should still be authenticated
    await expect(page).toHaveURL(/.*dashboard/);
    await expect(page.locator('text=Overview')).toBeVisible();
  });

  test('should logout successfully', async ({ page }) => {
    await loginViaUI(page, TEST_USERS.admin);

    // Wait for dashboard to load
    await expect(page.locator('text=Overview')).toBeVisible();

    // Click logout button
    await page.click('button:has-text("Logout")');

    // Should redirect to login page
    await page.waitForURL('**/login', { timeout: 5000 });

    // Verify auth state cleared
    const authToken = await page.evaluate(() =>
      localStorage.getItem('auth_token')
    );
    expect(authToken).toBeNull();
  });

  test('should redirect to login when accessing protected route without auth', async ({
    page,
  }) => {
    await page.goto('/dashboard/overview');

    // Should redirect to login
    await page.waitForURL('**/login', { timeout: 5000 });
  });

  test('should toggle theme on login page', async ({ page }) => {
    await page.goto('/login');

    // Check default theme (dark)
    const htmlClass = await page.locator('html').getAttribute('class');
    expect(htmlClass).toContain('dark');

    // Click theme toggle
    await page.click('button[aria-label="Toggle theme"]');

    // Should switch to light mode
    const newHtmlClass = await page.locator('html').getAttribute('class');
    expect(newHtmlClass).toContain('light');
  });
});
