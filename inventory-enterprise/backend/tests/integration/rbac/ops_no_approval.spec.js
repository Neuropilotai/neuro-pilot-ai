/**
 * RBAC Integration Test: OPS Role Cannot Approve Forecasts
 *
 * Verifies that OPS users can:
 * - ✅ Submit counts (POST /api/owner/count)
 * - ✅ Provide feedback (POST /api/owner/ai/feedback)
 * - ✅ View forecasts (GET /api/owner/forecast/daily)
 *
 * But CANNOT:
 * - ❌ Approve forecasts (POST /api/owner/forecast/approve)
 * - ❌ Export financial data (GET /api/owner/financials/export/*)
 *
 * @version 15.5.1
 */

const request = require('supertest');
const { getAuthHeader } = require('../support/jwtMocks');

const app = require('../../../server');

describe('RBAC: OPS role - Approval endpoints should return 403', () => {
  const authHeader = getAuthHeader('OPS');

  test('POST /api/owner/forecast/approve → 403 Forbidden', async () => {
    const response = await request(app)
      .post('/api/owner/forecast/approve')
      .set(authHeader)
      .send({
        forecast_id: 'test-forecast-456'
      });

    expect(response.status).toBe(403);
    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toMatch(/forbidden|access denied|finance|owner/i);
  });

  test('POST /api/owner/forecast/reject → 403 Forbidden', async () => {
    const response = await request(app)
      .post('/api/owner/forecast/reject')
      .set(authHeader)
      .send({
        forecast_id: 'test-forecast-456',
        reason: 'Test rejection'
      });

    expect(response.status).toBe(403);
    expect(response.body).toHaveProperty('error');
  });

  test('GET /api/owner/financials/export/csv → 403 Forbidden', async () => {
    const response = await request(app)
      .get('/api/owner/financials/export/csv')
      .set(authHeader)
      .query({ period: '2025-01' });

    expect(response.status).toBe(403);
  });

  test('GET /api/owner/forecast/daily → 200 OK (OPS can view forecasts)', async () => {
    const response = await request(app)
      .get('/api/owner/forecast/daily')
      .set(authHeader);

    // OPS should be able to view forecasts (read-only)
    expect([200, 304]).toContain(response.status);
  });

  test('POST /api/owner/ai/feedback → 200 OK (OPS can submit feedback)', async () => {
    const response = await request(app)
      .post('/api/owner/ai/feedback')
      .set(authHeader)
      .send({
        feedback: 'Coffee consumption is higher on Mondays'
      });

    // OPS should be able to provide feedback
    expect([200, 201]).toContain(response.status);
  });

  test('GET /api/owner/dashboard → 200 OK (OPS can view dashboard)', async () => {
    const response = await request(app)
      .get('/api/owner/dashboard')
      .set(authHeader);

    expect([200, 304]).toContain(response.status);
  });
});
