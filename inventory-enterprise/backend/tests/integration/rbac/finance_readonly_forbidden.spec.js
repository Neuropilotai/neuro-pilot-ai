/**
 * RBAC Integration Test: READONLY Role Forbidden on Finance Endpoints
 *
 * Verifies that READONLY users receive 403 Forbidden on protected finance endpoints:
 * - POST /api/owner/financials/import
 * - GET /api/owner/financials/export/csv
 * - GET /api/owner/financials/export/pdf
 * - POST /api/owner/forecast/approve
 *
 * @version 15.5.1
 */

const request = require('supertest');
const { getAuthHeader } = require('../support/jwtMocks');

// Assume app is exported from server.js
// If not, you may need to adjust this import
const app = require('../../../server');

describe('RBAC: READONLY role - Finance endpoints should return 403', () => {
  const authHeader = getAuthHeader('READONLY');

  test('POST /api/owner/financials/import → 403 Forbidden', async () => {
    const response = await request(app)
      .post('/api/owner/financials/import')
      .set(authHeader)
      .send({
        from: '2025-01-01',
        to: '2025-06-30'
      });

    expect(response.status).toBe(403);
    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toMatch(/forbidden|access denied|insufficient permissions/i);
  });

  test('GET /api/owner/financials/export/csv → 403 Forbidden', async () => {
    const response = await request(app)
      .get('/api/owner/financials/export/csv')
      .set(authHeader)
      .query({ period: '2025-01' });

    expect(response.status).toBe(403);
    expect(response.body).toHaveProperty('error');
  });

  test('GET /api/owner/financials/export/pdf → 403 Forbidden', async () => {
    const response = await request(app)
      .get('/api/owner/financials/export/pdf')
      .set(authHeader)
      .query({ period: '2025-01' });

    expect(response.status).toBe(403);
    expect(response.body).toHaveProperty('error');
  });

  test('POST /api/owner/forecast/approve → 403 Forbidden', async () => {
    const response = await request(app)
      .post('/api/owner/forecast/approve')
      .set(authHeader)
      .send({
        forecast_id: 'test-forecast-123'
      });

    expect(response.status).toBe(403);
    expect(response.body).toHaveProperty('error');
  });

  test('GET /api/owner/dashboard → 200 OK (READONLY can view dashboard)', async () => {
    const response = await request(app)
      .get('/api/owner/dashboard')
      .set(authHeader);

    // READONLY should be able to view dashboard
    expect([200, 304]).toContain(response.status);
  });
});
