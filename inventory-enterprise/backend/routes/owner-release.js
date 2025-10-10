/**
 * Owner Release Routes - v3.1.0
 * Owner-gated model release management with checksums and audit trail
 * NO AUTO-PROMOTION - requires explicit owner confirmation
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const { authenticateToken } = require('../middleware/auth');
const { requireOwner } = require('../middleware/requireOwner');
const db = require('../config/database');
const logger = require('../config/logger');
const { getHardwareFingerprint } = require('../src/ai/local_training/appleHardware');
const { incPromotion, incRollback } = require('../utils/metricsExporter');

// All routes require authentication + owner access
router.use(authenticateToken);
router.use(requireOwner);

/**
 * Compute SHA256 checksum for a file
 */
async function computeFileSHA256(filePath) {
  const fileBuffer = await fs.readFile(filePath);
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
}

/**
 * POST /api/owner/release/prepare
 * Prepare a release manifest with checksums
 * Body: { notes?: string }
 */
router.post('/prepare', async (req, res) => {
  const { notes } = req.body;

  try {
    const manifestId = `manifest_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const hardwareFingerprint = getHardwareFingerprint();

    // Get recent successful training runs (last 7 days)
    const recentRuns = await db.all(
      `SELECT DISTINCT item_code, model_type, logs_path
       FROM ai_local_training_runs
       WHERE started_at >= datetime('now', '-7 days')
         AND mape IS NOT NULL
         AND rmse IS NOT NULL
       ORDER BY started_at DESC`
    );

    if (recentRuns.length === 0) {
      return res.status(400).json({
        error: 'No trained models available. Run training first.'
      });
    }

    // Get metrics snapshot
    const metricsSnapshot = await db.get(
      `SELECT
        COUNT(*) as total_models,
        AVG(mape) as avg_mape,
        AVG(rmse) as avg_rmse,
        MIN(started_at) as oldest_run,
        MAX(started_at) as newest_run
       FROM ai_local_training_runs
       WHERE started_at >= datetime('now', '-7 days')
         AND mape IS NOT NULL`
    );

    // Build manifest
    const manifest = {
      manifestId,
      createdAt: new Date().toISOString(),
      hardwareFingerprint,
      models: recentRuns.map(run => ({
        itemCode: run.item_code,
        modelType: run.model_type
      })),
      metricsSnapshot: {
        totalModels: metricsSnapshot.total_models || 0,
        avgMAPE: metricsSnapshot.avg_mape || null,
        avgRMSE: metricsSnapshot.avg_rmse || null,
        trainingWindow: {
          from: metricsSnapshot.oldest_run,
          to: metricsSnapshot.newest_run
        }
      },
      notes: notes || ''
    };

    // Compute manifest SHA256
    const manifestJson = JSON.stringify(manifest, Object.keys(manifest).sort());
    const manifestSHA256 = crypto.createHash('sha256').update(manifestJson).digest('hex');

    // Store manifest
    await db.run(
      `INSERT INTO ai_release_manifests (
        manifest_id, sha256, status, hw_fingerprint,
        prepared_at, prepared_by
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        manifestId,
        manifestSHA256,
        'prepared',
        hardwareFingerprint,
        new Date().toISOString(),
        req.user.id
      ]
    );

    // Store artifacts (reference to training runs)
    for (const run of recentRuns) {
      await db.run(
        `INSERT INTO ai_release_artifacts (
          manifest_id, item_code, model_type, path, sha256
        ) VALUES (?, ?, ?, ?, ?)`,
        [
          manifestId,
          run.item_code,
          run.model_type,
          run.logs_path || '',
          '' // Placeholder for actual model file checksum
        ]
      );
    }

    // Audit log
    await db.run(
      `INSERT INTO audit_logs (
        action_code, user_id, ip_address, details, created_at
      ) VALUES (?, ?, ?, ?, ?)`,
      [
        'RELEASE_PREPARE',
        req.user.id,
        req.ip,
        JSON.stringify({
          manifestId,
          modelCount: recentRuns.length
        }),
        new Date().toISOString()
      ]
    );

    logger.info('Release manifest prepared', {
      manifestId,
      sha256: manifestSHA256,
      modelCount: recentRuns.length,
      ownerId: req.user.id
    });

    res.json({
      success: true,
      manifestId,
      sha256: manifestSHA256,
      manifest,
      message: 'Release prepared. Use /review to inspect, then /promote to deploy.'
    });

  } catch (error) {
    logger.error('Failed to prepare release', { error: error.message });

    res.status(500).json({
      error: 'Failed to prepare release',
      message: error.message
    });
  }
});

/**
 * GET /api/owner/release/review
 * Review a prepared release manifest
 * Query params: manifestId
 */
router.get('/review', async (req, res) => {
  const { manifestId } = req.query;

  if (!manifestId) {
    return res.status(400).json({
      error: 'manifestId query parameter is required'
    });
  }

  try {
    // Get manifest
    const manifest = await db.get(
      `SELECT * FROM ai_release_manifests WHERE manifest_id = ?`,
      [manifestId]
    );

    if (!manifest) {
      return res.status(404).json({
        error: 'Manifest not found'
      });
    }

    // Get artifacts
    const artifacts = await db.all(
      `SELECT * FROM ai_release_artifacts WHERE manifest_id = ?`,
      [manifestId]
    );

    // Get associated training metrics
    const metrics = await db.all(
      `SELECT
        item_code, model_type, mape, rmse, wall_sec, peak_mb, samples
       FROM ai_local_training_runs
       WHERE item_code IN (${artifacts.map(() => '?').join(',')})
         AND model_type IN (${artifacts.map(() => '?').join(',')})
       ORDER BY started_at DESC`,
      [
        ...artifacts.map(a => a.item_code),
        ...artifacts.map(a => a.model_type)
      ]
    );

    res.json({
      manifest: {
        manifestId: manifest.manifest_id,
        sha256: manifest.sha256,
        status: manifest.status,
        hardwareFingerprint: manifest.hw_fingerprint,
        preparedAt: manifest.prepared_at,
        preparedBy: manifest.prepared_by,
        promotedAt: manifest.promoted_at,
        promotedBy: manifest.promoted_by,
        rolledBackAt: manifest.rolled_back_at,
        rollbackBy: manifest.rollback_by
      },
      artifacts: artifacts.map(a => ({
        itemCode: a.item_code,
        modelType: a.model_type,
        path: a.path,
        sha256: a.sha256
      })),
      metrics: metrics.map(m => ({
        itemCode: m.item_code,
        modelType: m.model_type,
        mape: m.mape,
        rmse: m.rmse,
        wallClockSec: m.wall_sec,
        peakMemoryMB: m.peak_mb,
        samples: m.samples
      })),
      actions: {
        canPromote: manifest.status === 'prepared',
        canRollback: manifest.status === 'promoted'
      }
    });

  } catch (error) {
    logger.error('Failed to review release', { error: error.message });

    res.status(500).json({
      error: 'Failed to review release',
      message: error.message
    });
  }
});

/**
 * POST /api/owner/release/promote
 * Promote a prepared release to live (requires confirmation)
 * Body: { manifestId: string, confirm: "PROMOTE_TO_LIVE" }
 */
router.post('/promote', async (req, res) => {
  const { manifestId, confirm } = req.body;

  // Strict confirmation check
  if (confirm !== 'PROMOTE_TO_LIVE') {
    return res.status(400).json({
      error: 'Confirmation required',
      message: 'Set confirm: "PROMOTE_TO_LIVE" to proceed'
    });
  }

  if (!manifestId) {
    return res.status(400).json({
      error: 'manifestId is required'
    });
  }

  try {
    // Get manifest
    const manifest = await db.get(
      `SELECT * FROM ai_release_manifests WHERE manifest_id = ?`,
      [manifestId]
    );

    if (!manifest) {
      return res.status(404).json({
        error: 'Manifest not found'
      });
    }

    if (manifest.status !== 'prepared') {
      return res.status(400).json({
        error: `Cannot promote manifest with status: ${manifest.status}`,
        message: 'Only prepared manifests can be promoted'
      });
    }

    // Mark previous live manifest as superseded
    await db.run(
      `UPDATE ai_release_manifests
       SET status = 'superseded'
       WHERE status = 'promoted'`
    );

    // Promote this manifest
    await db.run(
      `UPDATE ai_release_manifests
       SET status = 'promoted',
           promoted_at = ?,
           promoted_by = ?
       WHERE manifest_id = ?`,
      [
        new Date().toISOString(),
        req.user.id,
        manifestId
      ]
    );

    // Audit log
    await db.run(
      `INSERT INTO audit_logs (
        action_code, user_id, ip_address, details, created_at
      ) VALUES (?, ?, ?, ?, ?)`,
      [
        'RELEASE_PROMOTE',
        req.user.id,
        req.ip,
        JSON.stringify({ manifestId }),
        new Date().toISOString()
      ]
    );

    // Increment Prometheus counter
    incPromotion();

    logger.info('Release promoted to live', {
      manifestId,
      ownerId: req.user.id
    });

    res.json({
      success: true,
      promoted: true,
      manifestId,
      status: 'promoted',
      promotedAt: new Date().toISOString(),
      message: 'Release promoted to live successfully'
    });

  } catch (error) {
    logger.error('Failed to promote release', { error: error.message });

    res.status(500).json({
      error: 'Failed to promote release',
      message: error.message
    });
  }
});

/**
 * POST /api/owner/release/rollback
 * Rollback to a previous manifest
 * Body: { manifestId?: string } - if omitted, rolls back to most recent superseded
 */
router.post('/rollback', async (req, res) => {
  const { manifestId } = req.body;

  try {
    let targetManifest;

    if (manifestId) {
      // Rollback to specific manifest
      targetManifest = await db.get(
        `SELECT * FROM ai_release_manifests WHERE manifest_id = ?`,
        [manifestId]
      );

      if (!targetManifest) {
        return res.status(404).json({
          error: 'Manifest not found'
        });
      }

      if (targetManifest.status === 'promoted') {
        return res.status(400).json({
          error: 'Manifest is already promoted (live)'
        });
      }

    } else {
      // Rollback to most recent superseded manifest
      targetManifest = await db.get(
        `SELECT * FROM ai_release_manifests
         WHERE status = 'superseded'
         ORDER BY promoted_at DESC
         LIMIT 1`
      );

      if (!targetManifest) {
        return res.status(404).json({
          error: 'No previous manifest to rollback to'
        });
      }
    }

    // Get current live manifest
    const currentLive = await db.get(
      `SELECT * FROM ai_release_manifests WHERE status = 'promoted'`
    );

    // Mark current live as rolled_back
    if (currentLive) {
      await db.run(
        `UPDATE ai_release_manifests
         SET status = 'rolled_back',
             rolled_back_at = ?,
             rollback_by = ?
         WHERE manifest_id = ?`,
        [
          new Date().toISOString(),
          req.user.id,
          currentLive.manifest_id
        ]
      );
    }

    // Promote target manifest
    await db.run(
      `UPDATE ai_release_manifests
       SET status = 'promoted',
           promoted_at = ?,
           promoted_by = ?
       WHERE manifest_id = ?`,
      [
        new Date().toISOString(),
        req.user.id,
        targetManifest.manifest_id
      ]
    );

    // Audit log
    await db.run(
      `INSERT INTO audit_logs (
        action_code, user_id, ip_address, details, created_at
      ) VALUES (?, ?, ?, ?, ?)`,
      [
        'RELEASE_ROLLBACK',
        req.user.id,
        req.ip,
        JSON.stringify({
          from: currentLive?.manifest_id,
          to: targetManifest.manifest_id
        }),
        new Date().toISOString()
      ]
    );

    // Increment Prometheus counter
    incRollback();

    logger.info('Release rolled back', {
      from: currentLive?.manifest_id,
      to: targetManifest.manifest_id,
      ownerId: req.user.id
    });

    res.json({
      success: true,
      rolledBack: true,
      manifestId: targetManifest.manifest_id,
      previous: currentLive?.manifest_id,
      message: 'Successfully rolled back to previous manifest'
    });

  } catch (error) {
    logger.error('Failed to rollback release', { error: error.message });

    res.status(500).json({
      error: 'Failed to rollback release',
      message: error.message
    });
  }
});

/**
 * GET /api/owner/release/history
 * Get release history
 */
router.get('/history', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);

    const history = await db.all(
      `SELECT * FROM ai_release_manifests
       ORDER BY prepared_at DESC
       LIMIT ?`,
      [limit]
    );

    res.json({
      history: history.map(h => ({
        manifestId: h.manifest_id,
        sha256: h.sha256,
        status: h.status,
        preparedAt: h.prepared_at,
        preparedBy: h.prepared_by,
        promotedAt: h.promoted_at,
        promotedBy: h.promoted_by,
        rolledBackAt: h.rolled_back_at,
        rollbackBy: h.rollback_by
      })),
      total: history.length
    });

  } catch (error) {
    logger.error('Failed to fetch release history', { error: error.message });

    res.status(500).json({
      error: 'Failed to fetch release history',
      message: error.message
    });
  }
});

module.exports = router;
