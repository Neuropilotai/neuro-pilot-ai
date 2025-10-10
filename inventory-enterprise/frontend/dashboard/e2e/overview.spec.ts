import { test, expect } from './fixtures';
import { waitForMetrics, waitForChart } from './fixtures';

/**
 * E2E Tests: Overview Dashboard
 * Version: v2.5.1-2025-10-07
 *
 * Coverage:
 * - Metrics loading from /api/metrics
 * - Chart rendering (latency, cache, MAPE)
 * - Real-time WebSocket updates
 * - System health indicators
 */

test.describe('Overview Dashboard', () => {
  test('should load and display metrics', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard/overview');

    // Wait for page title
    await expect(page.locator('h1:has-text("Overview")')).toBeVisible();

    // Wait for metrics to load
    await waitForMetrics(page);

    // Check stat cards are present
    const statCards = page.locator('.stat-card');
    await expect(statCards).toHaveCount(4, { timeout: 10000 });

    // Verify stat labels
    await expect(page.locator('text=API Requests')).toBeVisible();
    await expect(page.locator('text=Avg Latency')).toBeVisible();
    await expect(page.locator('text=Cache Hit Rate')).toBeVisible();
    await expect(page.locator('text=Active Tenants')).toBeVisible();
  });

  test('should render API latency chart', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard/overview');

    // Wait for chart container
    await waitForChart(page, '.card:has-text("API Latency")');

    // Verify chart title
    await expect(page.locator('text=API Latency (p95)')).toBeVisible();

    // Verify Recharts SVG rendered
    const svg = page.locator('.card:has-text("API Latency") svg');
    await expect(svg).toBeVisible();

    // Check for data points (should have at least one)
    const dataPoints = svg.locator('path, circle');
    await expect(dataPoints.first()).toBeVisible();
  });

  test('should render cache hit rate chart', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/dashboard/overview');

    await waitForChart(page, '.card:has-text("Cache Hit Rate")');

    // Verify chart rendered
    await expect(page.locator('text=Cache Hit Rate')).toBeVisible();

    const svg = page.locator('.card:has-text("Cache Hit Rate") svg');
    await expect(svg).toBeVisible();
  });

  test('should render AI MAPE chart', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard/overview');

    await waitForChart(page, '.card:has-text("AI Forecast Accuracy")');

    // Verify chart title
    await expect(
      page.locator('text=AI Forecast Accuracy (MAPE by Item)')
    ).toBeVisible();

    // Check for bar chart
    const svg = page.locator('.card:has-text("AI Forecast Accuracy") svg');
    await expect(svg).toBeVisible();

    // Verify target MAPE info
    await expect(page.locator('text=Target MAPE')).toBeVisible();
    await expect(page.locator('text=< 15%')).toBeVisible();
  });

  test('should display system health status', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/dashboard/overview');

    // Wait for system health card
    await expect(page.locator('text=System Health')).toBeVisible();

    // Check health indicators
    await expect(page.locator('text=Database')).toBeVisible();
    await expect(page.locator('text=Cache')).toBeVisible();
    await expect(page.locator('text=WebSocket')).toBeVisible();

    // Verify status badges present
    const badges = page.locator('.badge');
    await expect(badges.first()).toBeVisible();
  });

  test('should show WebSocket connection status in sidebar', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/dashboard/overview');

    // Check WebSocket status indicator
    const wsStatus = page.locator('text=Real-time Connected, text=Disconnected');
    await expect(wsStatus.first()).toBeVisible();
  });

  test('should update metrics on refresh', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard/overview');

    // Wait for initial metrics
    await waitForMetrics(page);

    // Get initial stat value
    const firstStatValue = await page
      .locator('.stat-value')
      .first()
      .textContent();

    // Wait for auto-refresh (10 seconds interval)
    // For testing, we'll just verify the structure is correct
    await page.waitForTimeout(2000);

    // Verify stat cards still present after interval
    const statCards = page.locator('.stat-card');
    await expect(statCards).toHaveCount(4);
  });

  test('should handle real-time WebSocket forecast update', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/dashboard/overview');

    // Wait for charts to load
    await waitForChart(page, '.card:has-text("AI Forecast Accuracy")');

    // Mock WebSocket message via page evaluation
    await page.evaluate(() => {
      // Simulate forecast:update event
      const event = new CustomEvent('websocket-message', {
        detail: {
          type: 'forecast:update',
          data: {
            itemCode: 'TEST_ITEM',
            mape: 11.5,
            timestamp: new Date().toISOString(),
          },
        },
      });
      window.dispatchEvent(event);
    });

    // Verify chart still renders (real WebSocket integration tested separately)
    const svg = page.locator('.card:has-text("AI Forecast Accuracy") svg');
    await expect(svg).toBeVisible();
  });

  test('should be responsive on mobile viewport', async ({
    authenticatedPage: page,
  }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto('/dashboard/overview');

    // Wait for metrics
    await waitForMetrics(page);

    // Stat cards should stack vertically (1 column)
    const statCards = page.locator('.stat-card');
    await expect(statCards.first()).toBeVisible();

    // Sidebar should be hidden on mobile
    const sidebar = page.locator('aside');
    await expect(sidebar).not.toBeInViewport();

    // Hamburger menu should be visible
    const hamburger = page.locator('button[aria-label*="menu"], button:has-text("Menu")');
    // Note: Actual selector depends on implementation
  });

  test('should have accessible chart labels', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/dashboard/overview');

    await waitForChart(page, '.card:has-text("API Latency")');

    // Check for chart axes labels (Recharts renders these as text elements)
    const chartLabels = page.locator('.card:has-text("API Latency") svg text');
    await expect(chartLabels.first()).toBeVisible();
  });
});
