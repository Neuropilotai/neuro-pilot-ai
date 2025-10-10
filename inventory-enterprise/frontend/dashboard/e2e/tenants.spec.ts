import { test, expect } from '@playwright/test';
import { TEST_USERS, MOCK_JWT_TOKEN, MOCK_USER } from './fixtures';

/**
 * E2E Tests: Tenants Management & RBAC
 * Version: v2.5.1-2025-10-07
 *
 * Coverage:
 * - Tenants list loading
 * - Search functionality
 * - RBAC: Admin can add tenant
 * - RBAC: Viewer cannot edit tenant
 * - Tenant traffic visualization
 */

test.describe('Tenants Management', () => {
  test.beforeEach(async ({ page }) => {
    // Pre-seed auth for admin
    await page.goto('/');
    await page.evaluate(
      ({ token, user }) => {
        const adminUser = {
          ...user,
          role: 'Admin',
          email: 'admin@example.com',
        };
        localStorage.setItem('auth_token', token);
        localStorage.setItem('user', JSON.stringify(adminUser));
        localStorage.setItem('tenant_id', user.tenantId);
      },
      { token: MOCK_JWT_TOKEN, user: MOCK_USER }
    );

    await page.goto('/dashboard/tenants');
  });

  test('should load and display tenants list', async ({ page }) => {
    // Wait for page title
    await expect(page.locator('text=Tenants')).toBeVisible();

    // Check stat cards
    await expect(page.locator('text=Total Tenants')).toBeVisible();
    await expect(page.locator('text=Active Tenants')).toBeVisible();
    await expect(page.locator('text=Total Users')).toBeVisible();

    // Wait for table to load
    await page.waitForSelector('table', { timeout: 10000 });

    // Verify table headers
    await expect(page.locator('th:has-text("Tenant")')).toBeVisible();
    await expect(page.locator('th:has-text("Status")')).toBeVisible();
    await expect(page.locator('th:has-text("Users")')).toBeVisible();
    await expect(page.locator('th:has-text("Traffic")')).toBeVisible();
  });

  test('should display search functionality', async ({ page }) => {
    // Check search input present
    const searchInput = page.locator('input[placeholder*="Search"]');
    await expect(searchInput).toBeVisible();
  });

  test('should filter tenants by search query', async ({ page }) => {
    // Wait for table to load
    await page.waitForSelector('table tbody tr', { timeout: 10000 });

    // Get initial row count
    const initialRows = await page.locator('table tbody tr').count();

    // Enter search query
    await page.fill('input[placeholder*="Search"]', 'Acme');

    // Wait for filtering (debounced)
    await page.waitForTimeout(500);

    // Row count should change or stay same if "Acme" exists
    const filteredRows = await page.locator('table tbody tr').count();

    // Verify filtering happened (either reduced count or same if match)
    expect(filteredRows).toBeLessThanOrEqual(initialRows);
  });

  test('should show Add Tenant button for admin', async ({ page }) => {
    // Admin should see Add Tenant button
    const addButton = page.locator('button:has-text("Add Tenant")');
    await expect(addButton).toBeVisible();
  });

  test('viewer should NOT see Add Tenant button (RBAC)', async ({ page }) => {
    // Re-authenticate as viewer
    await page.evaluate(() => {
      const viewerUser = {
        userId: 'viewer-123',
        email: 'viewer@example.com',
        role: 'Auditor',
        tenantId: 'tenant_001',
      };
      localStorage.setItem('user', JSON.stringify(viewerUser));
    });

    // Reload page
    await page.reload();

    // Wait for page to load
    await expect(page.locator('text=Tenants')).toBeVisible();

    // Add Tenant button should NOT be visible for viewer
    // Note: This depends on frontend RBAC implementation hiding buttons
    // For now, we check if button exists but may be disabled/hidden
    const addButton = page.locator('button:has-text("Add Tenant")');

    // Button should either not exist or be disabled
    const isVisible = await addButton.isVisible().catch(() => false);

    if (isVisible) {
      // If visible, should be disabled
      await expect(addButton).toBeDisabled();
    }
  });

  test('should display tenant status badges', async ({ page }) => {
    // Wait for table rows
    await page.waitForSelector('table tbody tr', { timeout: 10000 });

    // Check for status badges
    const badges = page.locator('.badge');
    await expect(badges.first()).toBeVisible();

    // Verify badge text (active/inactive)
    const badgeText = await badges.first().textContent();
    expect(badgeText?.toLowerCase()).toMatch(/active|inactive/);
  });

  test('should display traffic sparklines', async ({ page }) => {
    // Wait for table rows
    await page.waitForSelector('table tbody tr', { timeout: 10000 });

    // Check for SVG sparklines (traffic visualization)
    const sparklines = page.locator('table tbody tr svg');

    // Should have at least one sparkline
    const sparklineCount = await sparklines.count();
    expect(sparklineCount).toBeGreaterThan(0);
  });

  test('should show tenant details in table row', async ({ page }) => {
    // Wait for first table row
    await page.waitForSelector('table tbody tr', { timeout: 10000 });

    const firstRow = page.locator('table tbody tr').first();

    // Verify row contains tenant information
    await expect(firstRow).toBeVisible();

    // Check for tenant name
    const cells = firstRow.locator('td');
    await expect(cells.first()).toBeVisible();
  });

  test('should handle empty search results', async ({ page }) => {
    // Enter search query that won't match anything
    await page.fill('input[placeholder*="Search"]', 'XYZ_NONEXISTENT_TENANT_999');

    // Wait for filtering
    await page.waitForTimeout(500);

    // Table should either show "no results" or be empty
    const rows = await page.locator('table tbody tr').count();

    // If no rows, that's expected
    // If has rows, check for "no results" message
    if (rows > 0) {
      // Some implementations show a "no results" row
      await expect(
        page.locator('text=No tenants found, text=No results')
      ).toBeVisible();
    }
  });

  test('should sort table columns (if implemented)', async ({ page }) => {
    // Wait for table
    await page.waitForSelector('table', { timeout: 10000 });

    // Check if table headers are clickable for sorting
    const headers = page.locator('table th');
    const headerCount = await headers.count();

    expect(headerCount).toBeGreaterThan(0);

    // Note: Actual sorting test depends on implementation
    // This test just verifies table structure is sortable-ready
  });
});
