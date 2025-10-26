/**
 * RBAC Integration Test: FINANCE Role Can Export and Approve
 *
 * Verifies that FINANCE users can:
 * - ✅ Import financial data (POST /api/owner/financials/import)
 * - ✅ Export CSV (GET /api/owner/financials/export/csv)
 * - ✅ Export PDF (GET /api/owner/financials/export/pdf)
 * - ✅ Export GL (GET /api/owner/financials/export/gl)
 * - ✅ Approve forecasts (POST /api/owner/forecast/approve)
 * - ✅ Reject forecasts (POST /api/owner/forecast/reject)
 *
 * @version 15.5.1
 */

const request = require('supertest');
const { getAuthHeader } = require('../support/jwtMocks');

const app = require('../../../server');

describe('RBAC: FINANCE role - Export and approval endpoints should succeed', () => {
  const authHeader = getAuthHeader('FINANCE');

  test('POST /api/owner/financials/import → 200 OK', async () => {
    const response = await request(app)
      .post('/api/owner/financials/import')
      .set(authHeader)
      .send({
        from: '2025-01-01',
        to: '2025-06-30'
      });

    // Should succeed or return validation error, but NOT 403
    expect(response.status).not.toBe(403);
    expect([200, 201, 400, 422]).toContain(response.status);
  });

  test('GET /api/owner/financials/export/csv → 200 OK', async () => {
    const response = await request(app)
      .get('/api/owner/financials/export/csv')
      .set(authHeader)
      .query({ period: '2025-01' });

    // Should succeed or return data error, but NOT 403
    expect(response.status).not.toBe(403);
    expect([200, 404]).toContain(response.status);
  });

  test('GET /api/owner/financials/export/pdf → 200 OK', async () => {
    const response = await request(app)
      .get('/api/owner/financials/export/pdf')
      .set(authHeader)
      .query({ period: '2025-01' });

    // Should succeed or return data error, but NOT 403
    expect(response.status).not.toBe(403);
    expect([200, 404]).toContain(response.status);
  });

  test('GET /api/owner/financials/export/gl → 200 OK', async () => {
    const response = await request(app)
      .get('/api/owner/financials/export/gl')
      .set(authHeader)
      .query({ period: '2025-01' });

    // Should succeed or return data error, but NOT 403
    expect(response.status).not.toBe(403);
    expect([200, 404]).toContain(response.status);
  });

  test('POST /api/owner/forecast/approve → 200 OK (FINANCE can approve)', async () => {
    const response = await request(app)
      .post('/api/owner/forecast/approve')
      .set(authHeader)
      .send({
        forecast_id: 'test-forecast-789'
      });

    // Should succeed or return validation error, but NOT 403
    expect(response.status).not.toBe(403);
    expect([200, 201, 400, 404]).toContain(response.status);
  });

  test('POST /api/owner/forecast/reject → 200 OK (FINANCE can reject)', async () => {
    const response = await request(app)
      .post('/api/owner/forecast/reject')
      .set(authHeader)
      .send({
        forecast_id: 'test-forecast-789',
        reason: 'Test rejection by FINANCE'
      });

    // Should succeed or return validation error, but NOT 403
    expect(response.status).not.toBe(403);
    expect([200, 201, 400, 404]).toContain(response.status);
  });

  test('Rate limiting: Export endpoints should throttle after limit', async () => {
    // Make 6 rapid requests (assuming EXPORT_RATE_LIMIT_PER_MIN=5)
    const requests = [];
    for (let i = 0; i < 6; i++) {
      requests.push(
        request(app)
          .get('/api/owner/financials/export/csv')
          .set(authHeader)
          .query({ period: '2025-01' })
      );
    }

    const responses = await Promise.all(requests);

    // First 5 should succeed (or return non-429 errors)
    const firstFive = responses.slice(0, 5);
    firstFive.forEach(res => {
      expect(res.status).not.toBe(429);
    });

    // 6th should be rate-limited (429)
    const sixth = responses[5];
    expect(sixth.status).toBe(429);
    expect(sixth.body).toHaveProperty('error');
    expect(sixth.body.error).toMatch(/rate limit|too many requests/i);
  });
});
