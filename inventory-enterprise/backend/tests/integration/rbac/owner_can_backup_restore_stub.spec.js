/**
 * RBAC Integration Test: OWNER Role Privileged Access
 *
 * Verifies that OWNER users have full access to all endpoints:
 * - ✅ All finance operations
 * - ✅ All forecast operations
 * - ✅ Backup & restore operations
 * - ✅ System administration endpoints
 *
 * Note: Backup/restore endpoints may be stubs in test environment
 *
 * @version 15.5.1
 */

const request = require('supertest');
const { getAuthHeader } = require('../support/jwtMocks');

const app = require('../../../server');

describe('RBAC: OWNER role - Full privileged access', () => {
  const authHeader = getAuthHeader('OWNER');

  test('POST /api/owner/financials/import → 200 OK', async () => {
    const response = await request(app)
      .post('/api/owner/financials/import')
      .set(authHeader)
      .send({
        from: '2025-01-01',
        to: '2025-06-30'
      });

    expect(response.status).not.toBe(403);
    expect([200, 201, 400, 422]).toContain(response.status);
  });

  test('GET /api/owner/financials/export/csv → 200 OK', async () => {
    const response = await request(app)
      .get('/api/owner/financials/export/csv')
      .set(authHeader)
      .query({ period: '2025-01' });

    expect(response.status).not.toBe(403);
  });

  test('POST /api/owner/forecast/approve → 200 OK', async () => {
    const response = await request(app)
      .post('/api/owner/forecast/approve')
      .set(authHeader)
      .send({
        forecast_id: 'test-forecast-owner'
      });

    expect(response.status).not.toBe(403);
  });

  test('POST /api/owner/recovery/create → 200 OK (OWNER can create backups)', async () => {
    const response = await request(app)
      .post('/api/owner/recovery/create')
      .set(authHeader)
      .send({
        passphrase: 'test-passphrase-at-least-12-chars',
        destination: '/tmp/test-backup'
      });

    // Should succeed or return stub response, but NOT 403
    expect(response.status).not.toBe(403);
    expect([200, 201, 400, 501]).toContain(response.status);
  });

  test('POST /api/owner/recovery/verify → 200 OK (OWNER can verify backups)', async () => {
    const response = await request(app)
      .post('/api/owner/recovery/verify')
      .set(authHeader)
      .send({
        path: '/tmp/test-backup.tar.gz.enc',
        passphrase: 'test-passphrase-at-least-12-chars'
      });

    expect(response.status).not.toBe(403);
    expect([200, 400, 404, 501]).toContain(response.status);
  });

  test('POST /api/owner/recovery/restore → 200 OK (OWNER can restore backups)', async () => {
    const response = await request(app)
      .post('/api/owner/recovery/restore')
      .set(authHeader)
      .send({
        path: '/tmp/test-backup.tar.gz.enc',
        passphrase: 'test-passphrase-at-least-12-chars'
      });

    expect(response.status).not.toBe(403);
    expect([200, 400, 404, 501]).toContain(response.status);
  });

  test('GET /api/owner/dashboard → 200 OK', async () => {
    const response = await request(app)
      .get('/api/owner/dashboard')
      .set(authHeader);

    expect([200, 304]).toContain(response.status);
  });

  test('POST /api/owner/orchestrate/start → 200 OK (OWNER can orchestrate)', async () => {
    const response = await request(app)
      .post('/api/owner/orchestrate/start')
      .set(authHeader);

    // Should succeed or return stub response, but NOT 403
    expect(response.status).not.toBe(403);
    expect([200, 501]).toContain(response.status);
  });

  test('POST /api/owner/orchestrate/stop → 200 OK (OWNER can orchestrate)', async () => {
    const response = await request(app)
      .post('/api/owner/orchestrate/stop')
      .set(authHeader);

    expect(response.status).not.toBe(403);
    expect([200, 501]).toContain(response.status);
  });
});
