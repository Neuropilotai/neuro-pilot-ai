/**
 * Jest Tests for Owner Release Routes (v3.1.0)
 * Tests owner-gated release management with checksums
 */

const request = require('supertest');
const express = require('express');
const ownerReleaseRoutes = require('../routes/owner-release');
const db = require('../config/database');
const crypto = require('crypto');

// Mock dependencies
jest.mock('../middleware/auth', () => ({
  authenticateToken: (req, res, next) => {
    req.user = { id: 'owner-user-id', email: 'owner@test.com' };
    req.ip = '127.0.0.1';
    next();
  }
}));

jest.mock('../middleware/requireOwner', () => (req, res, next) => next());

jest.mock('../config/database');
jest.mock('../config/logger', () => ({
  info: jest.fn(),
  error: jest.fn()
}));
jest.mock('../utils/metricsExporter', () => ({
  incPromotion: jest.fn(),
  incRollback: jest.fn()
}));

const app = express();
app.use(express.json());
app.use('/api/owner/release', ownerReleaseRoutes);

describe('POST /api/owner/release/prepare', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should prepare a release manifest successfully', async () => {
    db.all = jest.fn().mockResolvedValue([
      {
        item_code: 'ITEM-001',
        model_type: 'prophet',
        logs_path: '/logs/run_1.json'
      },
      {
        item_code: 'ITEM-002',
        model_type: 'arima',
        logs_path: '/logs/run_2.json'
      }
    ]);

    db.get = jest.fn().mockResolvedValue({
      total_models: 2,
      avg_mape: 17.5,
      avg_rmse: 11.2,
      oldest_run: '2025-10-03T00:00:00.000Z',
      newest_run: '2025-10-09T00:00:00.000Z'
    });

    db.run = jest.fn().mockResolvedValue({});

    const response = await request(app)
      .post('/api/owner/release/prepare')
      .send({
        notes: 'Weekly release'
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.manifestId).toBeDefined();
    expect(response.body.sha256).toBeDefined();
    expect(response.body.manifest.models).toHaveLength(2);

    // Verify manifest was stored
    expect(db.run).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO ai_release_manifests'),
      expect.any(Array)
    );

    // Verify artifacts were stored
    expect(db.run).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO ai_release_artifacts'),
      expect.any(Array)
    );

    // Verify audit log
    expect(db.run).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO audit_logs'),
      expect.arrayContaining(['RELEASE_PREPARE', 'owner-user-id'])
    );
  });

  it('should reject prepare when no trained models available', async () => {
    db.all = jest.fn().mockResolvedValue([]);

    const response = await request(app)
      .post('/api/owner/release/prepare')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('No trained models available');
  });
});

describe('GET /api/owner/release/review', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return manifest details for review', async () => {
    const manifestId = 'manifest_123';

    db.get = jest.fn().mockResolvedValue({
      manifest_id: manifestId,
      sha256: 'abc123',
      status: 'prepared',
      hw_fingerprint: 'hw_abc',
      prepared_at: '2025-10-09T10:00:00.000Z',
      prepared_by: 'owner-user-id',
      promoted_at: null,
      promoted_by: null,
      rolled_back_at: null,
      rollback_by: null
    });

    db.all = jest.fn()
      .mockResolvedValueOnce([
        {
          item_code: 'ITEM-001',
          model_type: 'prophet',
          path: '/logs/run_1.json',
          sha256: 'sha1'
        }
      ])
      .mockResolvedValueOnce([
        {
          item_code: 'ITEM-001',
          model_type: 'prophet',
          mape: 18.5,
          rmse: 12.3,
          wall_sec: 2.5,
          peak_mb: 150,
          samples: 30
        }
      ]);

    const response = await request(app)
      .get('/api/owner/release/review')
      .query({ manifestId });

    expect(response.status).toBe(200);
    expect(response.body.manifest.manifestId).toBe(manifestId);
    expect(response.body.artifacts).toHaveLength(1);
    expect(response.body.metrics).toHaveLength(1);
    expect(response.body.actions.canPromote).toBe(true);
    expect(response.body.actions.canRollback).toBe(false);
  });

  it('should reject review without manifestId', async () => {
    const response = await request(app).get('/api/owner/release/review');

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('manifestId');
  });

  it('should return 404 for non-existent manifest', async () => {
    db.get = jest.fn().mockResolvedValue(null);

    const response = await request(app)
      .get('/api/owner/release/review')
      .query({ manifestId: 'nonexistent' });

    expect(response.status).toBe(404);
    expect(response.body.error).toContain('not found');
  });
});

describe('POST /api/owner/release/promote', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should promote a prepared manifest to live', async () => {
    const manifestId = 'manifest_123';

    db.get = jest.fn().mockResolvedValue({
      manifest_id: manifestId,
      status: 'prepared'
    });

    db.run = jest.fn().mockResolvedValue({});

    const response = await request(app)
      .post('/api/owner/release/promote')
      .send({
        manifestId,
        confirm: 'PROMOTE_TO_LIVE'
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.promoted).toBe(true);
    expect(response.body.status).toBe('promoted');

    // Verify previous live was superseded
    expect(db.run).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE ai_release_manifests'),
      expect.any(Array)
    );

    // Verify promotion recorded
    expect(db.run).toHaveBeenCalledWith(
      expect.stringContaining("status = 'promoted'"),
      expect.any(Array)
    );

    // Verify audit log
    expect(db.run).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO audit_logs'),
      expect.arrayContaining(['RELEASE_PROMOTE'])
    );
  });

  it('should reject promotion without confirmation string', async () => {
    const response = await request(app)
      .post('/api/owner/release/promote')
      .send({
        manifestId: 'manifest_123',
        confirm: 'WRONG_STRING'
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Confirmation required');
  });

  it('should reject promotion of non-prepared manifest', async () => {
    db.get = jest.fn().mockResolvedValue({
      manifest_id: 'manifest_123',
      status: 'promoted'
    });

    const response = await request(app)
      .post('/api/owner/release/promote')
      .send({
        manifestId: 'manifest_123',
        confirm: 'PROMOTE_TO_LIVE'
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Cannot promote');
  });
});

describe('POST /api/owner/release/rollback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should rollback to most recent superseded manifest', async () => {
    db.get = jest.fn()
      .mockResolvedValueOnce({
        manifest_id: 'manifest_old',
        status: 'superseded'
      })
      .mockResolvedValueOnce({
        manifest_id: 'manifest_current',
        status: 'promoted'
      });

    db.run = jest.fn().mockResolvedValue({});

    const response = await request(app)
      .post('/api/owner/release/rollback')
      .send({});

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.rolledBack).toBe(true);
    expect(response.body.manifestId).toBe('manifest_old');

    // Verify current was marked as rolled_back
    expect(db.run).toHaveBeenCalledWith(
      expect.stringContaining("status = 'rolled_back'"),
      expect.any(Array)
    );

    // Verify audit log
    expect(db.run).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO audit_logs'),
      expect.arrayContaining(['RELEASE_ROLLBACK'])
    );
  });

  it('should rollback to specific manifest', async () => {
    db.get = jest.fn()
      .mockResolvedValueOnce({
        manifest_id: 'manifest_specific',
        status: 'superseded'
      })
      .mockResolvedValueOnce({
        manifest_id: 'manifest_current',
        status: 'promoted'
      });

    db.run = jest.fn().mockResolvedValue({});

    const response = await request(app)
      .post('/api/owner/release/rollback')
      .send({
        manifestId: 'manifest_specific'
      });

    expect(response.status).toBe(200);
    expect(response.body.manifestId).toBe('manifest_specific');
  });

  it('should reject rollback when no previous manifest exists', async () => {
    db.get = jest.fn().mockResolvedValue(null);

    const response = await request(app)
      .post('/api/owner/release/rollback')
      .send({});

    expect(response.status).toBe(404);
    expect(response.body.error).toContain('No previous manifest');
  });
});

describe('GET /api/owner/release/history', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return release history', async () => {
    db.all = jest.fn().mockResolvedValue([
      {
        manifest_id: 'manifest_1',
        sha256: 'sha1',
        status: 'promoted',
        prepared_at: '2025-10-09T10:00:00.000Z',
        prepared_by: 'owner-user-id',
        promoted_at: '2025-10-09T11:00:00.000Z',
        promoted_by: 'owner-user-id',
        rolled_back_at: null,
        rollback_by: null
      }
    ]);

    const response = await request(app).get('/api/owner/release/history');

    expect(response.status).toBe(200);
    expect(response.body.history).toHaveLength(1);
    expect(response.body.history[0].manifestId).toBe('manifest_1');
  });

  it('should respect limit parameter', async () => {
    db.all = jest.fn().mockResolvedValue([]);

    await request(app).get('/api/owner/release/history?limit=10');

    expect(db.all).toHaveBeenCalledWith(
      expect.any(String),
      [10]
    );
  });
});
