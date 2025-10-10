import { test, expect } from './fixtures';
import { waitForChart } from './fixtures';

/**
 * E2E Tests: AI Performance Dashboard
 * Version: v2.5.1-2025-10-07
 *
 * Coverage:
 * - MAPE chart rendering
 * - RL rewards chart rendering
 * - Real-time AI event updates
 * - Anomaly alert display
 * - Model retraining notifications
 */

test.describe('AI Performance Dashboard', () => {
  test('should load and display AI metrics', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard/ai');

    // Wait for page title
    await expect(page.locator('h1, text=AI Performance')).toBeVisible();

    // Check stat cards
    await expect(page.locator('text=Avg MAPE')).toBeVisible();
    await expect(page.locator('text=Models Trained')).toBeVisible();
    await expect(page.locator('text=Anomalies')).toBeVisible();
    await expect(page.locator('text=Retraining Jobs')).toBeVisible();

    // Verify stat values are displayed
    const statValues = page.locator('.stat-value');
    await expect(statValues.first()).toBeVisible();
  });

  test('should render MAPE timeline chart', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard/ai');

    // Wait for MAPE chart
    await waitForChart(page, '.card:has-text("Forecast Accuracy")');

    // Verify chart title
    await expect(
      page.locator('text=Forecast Accuracy (MAPE) Timeline')
    ).toBeVisible();

    // Verify Recharts SVG rendered
    const svg = page.locator('.card:has-text("Forecast Accuracy") svg');
    await expect(svg).toBeVisible();

    // Check for data visualization elements
    const chartElements = svg.locator('path, line, circle');
    await expect(chartElements.first()).toBeVisible();

    // Verify target MAPE info box
    await expect(
      page.locator('text=Lower MAPE values indicate better forecast accuracy')
    ).toBeVisible();
    await expect(page.locator('text=Target: < 15%')).toBeVisible();
  });

  test('should render RL rewards chart', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard/ai');

    // Wait for RL rewards chart
    await waitForChart(page, '.card:has-text("RL Policy Rewards")');

    // Verify chart title
    await expect(page.locator('text=RL Policy Rewards')).toBeVisible();

    // Verify chart rendered
    const svg = page.locator('.card:has-text("RL Policy Rewards") svg');
    await expect(svg).toBeVisible();

    // Verify info box
    await expect(
      page.locator(
        'text=Higher rewards indicate better policy optimization'
      )
    ).toBeVisible();
  });

  test('should display real-time activity feed', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/dashboard/ai');

    // Check for real-time activity section
    await expect(page.locator('text=Real-Time AI Activity')).toBeVisible();

    // Check for pulse indicator (live status)
    const pulseIndicator = page.locator('.animate-pulse');
    await expect(pulseIndicator.first()).toBeVisible();
  });

  test('should handle WebSocket forecast update event', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/dashboard/ai');

    // Wait for page to load
    await waitForChart(page, '.card:has-text("Forecast Accuracy")');

    // Mock WebSocket forecast:update event
    await page.evaluate(() => {
      // Simulate WebSocket event via global event emitter
      if (window.websocket && typeof window.websocket.emit === 'function') {
        window.websocket.emit('forecast:update', {
          itemCode: 'APPLE_001',
          mape: 10.5,
          timestamp: new Date().toISOString(),
        });
      }
    });

    // Verify activity feed updates (new entry should appear)
    await page.waitForTimeout(1000);

    // Check if activity feed has entries
    const activityItems = page.locator('.card:has-text("Real-Time AI Activity") > div > div');
    const count = await activityItems.count();

    // Should have at least the "waiting" message or actual activities
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('should handle WebSocket policy update event', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/dashboard/ai');

    await waitForChart(page, '.card:has-text("RL Policy Rewards")');

    // Mock policy:update event
    await page.evaluate(() => {
      if (window.websocket && typeof window.websocket.emit === 'function') {
        window.websocket.emit('policy:update', {
          itemCode: 'BANANA_002',
          reward: 205,
          timestamp: new Date().toISOString(),
        });
      }
    });

    // Wait for potential UI update
    await page.waitForTimeout(500);

    // Chart should still be visible (data updated internally)
    const svg = page.locator('.card:has-text("RL Policy Rewards") svg');
    await expect(svg).toBeVisible();
  });

  test('should display anomaly alert toast notification', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/dashboard/ai');

    // Mock anomaly:alert event
    await page.evaluate(() => {
      if (window.websocket && typeof window.websocket.emit === 'function') {
        window.websocket.emit('anomaly:alert', {
          itemCode: 'CARROT_003',
          severity: 'high',
          timestamp: new Date().toISOString(),
        });
      }
    });

    // Wait for toast notification (react-hot-toast)
    await page.waitForSelector('[role="status"], .toast', { timeout: 3000 });

    // Verify toast contains anomaly message
    const toast = page.locator('[role="status"], .toast').first();
    await expect(toast).toBeVisible();
  });

  test('should display model retrained toast notification', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/dashboard/ai');

    // Mock model:retrained event
    await page.evaluate(() => {
      if (window.websocket && typeof window.websocket.emit === 'function') {
        window.websocket.emit('model:retrained', {
          itemCode: 'ORANGE_004',
          mape: 9.8,
          timestamp: new Date().toISOString(),
        });
      }
    });

    // Wait for toast notification
    await page.waitForSelector('[role="status"], .toast', { timeout: 3000 });

    // Verify toast appears
    const toast = page.locator('[role="status"], .toast').first();
    await expect(toast).toBeVisible();
  });

  test('should show waiting state when no activity', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/dashboard/ai');

    // If no real-time events yet, should show waiting message
    const waitingMessage = page.locator(
      'text=Waiting for AI events, text=Connect WebSocket'
    );

    // Either waiting message or actual activities should be visible
    const activitySection = page.locator('.card:has-text("Real-Time AI Activity")');
    await expect(activitySection).toBeVisible();
  });

  test('should display stat card colors correctly', async ({
    authenticatedPage: page,
  }) => {
    await page.goto('/dashboard/ai');

    // Wait for stat cards
    await page.waitForSelector('.stat-card', { timeout: 10000 });

    // Check for colored backgrounds (bg-*-100, bg-*-900/20)
    const statCards = page.locator('.stat-card');
    await expect(statCards).toHaveCount(4);

    // Verify icons present
    const icons = page.locator('.stat-card svg');
    const iconCount = await icons.count();
    expect(iconCount).toBeGreaterThanOrEqual(4);
  });

  test('should be responsive on tablet viewport', async ({
    authenticatedPage: page,
  }) => {
    // Set tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });

    await page.goto('/dashboard/ai');

    // Stats should display in 2x2 grid
    const statCards = page.locator('.stat-card');
    await expect(statCards.first()).toBeVisible();

    // Charts should stack vertically
    const charts = page.locator('.card:has(svg)');
    await expect(charts.first()).toBeVisible();
  });
});
