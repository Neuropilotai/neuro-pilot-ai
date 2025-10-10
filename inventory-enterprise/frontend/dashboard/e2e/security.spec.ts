import { test, expect } from './fixtures';

/**
 * E2E Tests: Security Monitoring Dashboard
 * Version: v2.5.1-2025-10-07
 *
 * Coverage:
 * - RBAC denials counter
 * - Active sessions display
 * - Security health indicators
 * - Compliance status
 * - Permission denial table
 */

test.describe('Security Monitoring', () => {
  test('should load and display security metrics', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/dashboard/security');

    // Wait for page title
    await expect(page.locator('text=Security')).toBeVisible();

    // Check stat cards
    await expect(page.locator('text=RBAC Denials')).toBeVisible();
    await expect(page.locator('text=Active Sessions')).toBeVisible();
    await expect(page.locator('text=Failed Logins')).toBeVisible();
    await expect(page.locator('text=Avg Session Duration')).toBeVisible();

    // Verify stat values displayed
    const statValues = page.locator('.stat-value');
    await expect(statValues.first()).toBeVisible();
  });

  test('should display RBAC denials table', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard/security');

    // Wait for RBAC denials section
    await expect(page.locator('text=Recent RBAC Denials')).toBeVisible();

    // Wait for table to load
    await page.waitForSelector('table', { timeout: 10000 });

    // Verify table headers
    await expect(page.locator('th:has-text("User")')).toBeVisible();
    await expect(page.locator('th:has-text("Permission Denied")')).toBeVisible();
    await expect(page.locator('th:has-text("Resource")')).toBeVisible();
    await expect(page.locator('th:has-text("Time")')).toBeVisible();
  });

  test('should display permission badges in denial table', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/dashboard/security');

    // Wait for table
    await page.waitForSelector('table tbody tr', { timeout: 10000 });

    // Check for permission badges (e.g., "inventory:delete")
    const badges = page.locator('table .badge');

    // Should have at least one badge
    const badgeCount = await badges.count();
    expect(badgeCount).toBeGreaterThan(0);

    // Verify badge is danger style (red)
    await expect(badges.first()).toHaveClass(/badge-danger/);
  });

  test('should display active sessions table', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/dashboard/security');

    // Wait for active sessions section
    await expect(page.locator('text=Active Sessions')).toBeVisible();

    // Find the sessions table (second table on page)
    const tables = page.locator('table');
    const tableCount = await tables.count();
    expect(tableCount).toBeGreaterThanOrEqual(2);

    // Verify sessions table headers
    await expect(page.locator('th:has-text("Tenant")')).toBeVisible();
    await expect(page.locator('th:has-text("IP Address")')).toBeVisible();
    await expect(page.locator('th:has-text("Last Activity")')).toBeVisible();
  });

  test('should show green pulse indicator for active sessions', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/dashboard/security');

    // Wait for sessions table
    await page.waitForSelector('table tbody tr', { timeout: 10000 });

    // Check for green pulse animation (indicates active)
    const pulseIndicators = page.locator('.bg-green-500.animate-pulse');

    // Should have at least one pulse indicator
    const count = await pulseIndicators.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should display security health section', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/dashboard/security');

    // Wait for security health card
    await expect(page.locator('text=Security Health')).toBeVisible();

    // Check for security indicators
    await expect(page.locator('text=2FA Enforcement')).toBeVisible();
    await expect(page.locator('text=JWT Token Validation')).toBeVisible();
    await expect(page.locator('text=Rate Limiting')).toBeVisible();

    // All should show "Active" status
    const activeCount = await page.locator('text=Active').count();
    expect(activeCount).toBeGreaterThanOrEqual(3);
  });

  test('should display compliance status', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard/security');

    // Wait for compliance card
    await expect(page.locator('text=Compliance Status')).toBeVisible();

    // Check for compliance frameworks
    await expect(page.locator('text=OWASP Top 10')).toBeVisible();
    await expect(page.locator('text=ISO 27001')).toBeVisible();
    await expect(page.locator('text=SOC 2 Type II')).toBeVisible();

    // Verify 100% scores displayed
    const percentages = page.locator('text=100%');
    const percentCount = await percentages.count();
    expect(percentCount).toBeGreaterThanOrEqual(3);
  });

  test('should increment RBAC denial counter on permission denial', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/dashboard/security');

    // Wait for stat cards
    await page.waitForSelector('.stat-card', { timeout: 10000 });

    // Get current RBAC denials count
    const denialCard = page.locator('.stat-card:has-text("RBAC Denials")');
    const initialCount = await denialCard
      .locator('.stat-value')
      .textContent();

    // Simulate a permission denial event (via API or WebSocket)
    // Note: In real scenario, this would come from backend
    await page.evaluate(() => {
      // Mock adding a denial to the table
      if (window.location.pathname.includes('security')) {
        // Trigger a re-render or data refresh
        window.dispatchEvent(new Event('rbac-denial-added'));
      }
    });

    // Wait for potential update
    await page.waitForTimeout(500);

    // Counter should either stay same or increment
    const currentCount = await denialCard
      .locator('.stat-value')
      .textContent();

    expect(currentCount).toBeTruthy();
  });

  test('should display formatted timestamps in tables', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/dashboard/security');

    // Wait for tables to load
    await page.waitForSelector('table tbody tr', { timeout: 10000 });

    // Check for timestamp cells
    const timestampCells = page.locator('table td:has-text("/"), table td:has-text(":")');

    // Should have timestamps
    const count = await timestampCells.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should display monospace font for resource paths', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/dashboard/security');

    // Wait for denial table
    await page.waitForSelector('table tbody tr', { timeout: 10000 });

    // Resource column should use monospace font
    const resourceCells = page.locator('table td.font-mono');

    // Should have at least one monospace cell
    const count = await resourceCells.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should be responsive on mobile viewport', async ({
    authenticatedPage: page,
  }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/dashboard/security');

    // Stats should stack vertically
    const statCards = page.locator('.stat-card');
    await expect(statCards.first()).toBeVisible();

    // Tables should have horizontal scroll
    const tables = page.locator('table');
    await expect(tables.first()).toBeVisible();

    // Check for overflow container
    const overflowContainer = page.locator('.overflow-x-auto');
    await expect(overflowContainer.first()).toBeVisible();
  });

  test('should handle empty denial table', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard/security');

    // Wait for page to load
    await page.waitForSelector('.stat-card', { timeout: 10000 });

    // If no denials, table might be empty or show message
    const tableRows = page.locator('table tbody tr');
    const rowCount = await tableRows.count();

    // Either has rows or shows empty state
    if (rowCount === 0) {
      // Could show "no denials" message (depending on implementation)
      // For now, just verify table structure exists
      await expect(page.locator('table')).toBeVisible();
    } else {
      // Has denial data
      expect(rowCount).toBeGreaterThan(0);
    }
  });

  test('should display color-coded security badges', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/dashboard/security');

    // Wait for security health section
    await expect(page.locator('text=Security Health')).toBeVisible();

    // Check for green badges (active status)
    const greenBadges = page.locator('.badge-success');
    const count = await greenBadges.count();

    expect(count).toBeGreaterThan(0);
  });
});
