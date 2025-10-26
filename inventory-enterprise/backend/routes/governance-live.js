/**
 * Live Governance Dashboard Routes (v16.4.0)
 * Real-time composite + pillar scores with sparklines
 *
 * Endpoints:
 * - GET /api/governance/live/status - Latest scores for all pillars
 * - GET /api/governance/live/sparklines - Time series data for sparklines
 * - GET /api/governance/live/events - SSE stream for real-time updates (optional)
 */

'use strict';
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const dbModule = require('../config/database');

const cacheSeconds = 30;

// --- DB helpers: work with node-sqlite3 (callback) OR better-sqlite3 (sync) ---
function dbAllCompat(db, sql, params = []) {
  // better-sqlite3 path (sync .prepare().all())
  if (typeof db.prepare === 'function' && !db.all) {
    const stmt = db.prepare(sql);
    return Promise.resolve(stmt.all(...params));
  }
  // node-sqlite3 path (callback .all)
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

function dbGetCompat(db, sql, params = []) {
  if (typeof db.prepare === 'function' && !db.get) {
    const stmt = db.prepare(sql);
    return Promise.resolve(stmt.get(...params));
  }
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

async function withBusyTimeout(db, ms = 3000) {
  try {
    // Works in both drivers; no-op if already set
    if (typeof db.exec === 'function') db.exec(`PRAGMA busy_timeout=${ms};`);
    else if (typeof db.run === 'function') await new Promise((res, rej) => db.run(`PRAGMA busy_timeout=${ms};`, (e)=> e?rej(e):res()));
  } catch (_) {}
}

// Middleware to check for required roles
function requireAnyRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userRole = req.user.role?.toUpperCase();
    const allowedRoles = roles.map(r => r.toUpperCase());

    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
}

/**
 * GET /api/governance/live/status
 * Returns latest governance scores for all pillars
 */
router.get('/api/governance/live/status',
  authenticateToken,
  requireAnyRole('OWNER', 'FINANCE', 'OPS'),
  async (req, res) => {
    const t0 = Date.now();
    try {
      const db = req.app.locals.db || dbModule;
      await withBusyTimeout(db, 3000);

      // Get last 30 days of data for all pillars
      const series = await dbAllCompat(
        db,
        `SELECT as_of as date, pillar, score
         FROM governance_daily
         WHERE as_of >= date('now', '-30 day')
         ORDER BY as_of ASC`
      );

      // Get latest scores for each pillar
      const latest = await dbGetCompat(
        db,
        `SELECT
           MAX(as_of) as as_of,
           (SELECT score FROM governance_daily WHERE pillar='composite' ORDER BY as_of DESC LIMIT 1) AS composite,
           (SELECT score FROM governance_daily WHERE pillar='finance'   ORDER BY as_of DESC LIMIT 1) AS finance,
           (SELECT score FROM governance_daily WHERE pillar='health'    ORDER BY as_of DESC LIMIT 1) AS health,
           (SELECT score FROM governance_daily WHERE pillar='ai'        ORDER BY as_of DESC LIMIT 1) AS ai,
           (SELECT score FROM governance_daily WHERE pillar='menu'      ORDER BY as_of DESC LIMIT 1) AS menu
         FROM governance_daily
         LIMIT 1`
      );

      // Calculate status based on composite score
      const comp = Number(latest?.composite || 0);
      const status = comp >= 90 ? 'green' : comp >= 75 ? 'amber' : 'red';

      res.set('Cache-Control', `public, max-age=${cacheSeconds}`);
      res.json({
        success: true,
        as_of: latest?.as_of || null,
        scores: {
          composite: comp,
          finance: Number(latest?.finance || 0),
          health: Number(latest?.health || 0),
          ai: Number(latest?.ai || 0),
          menu: Number(latest?.menu || 0),
        },
        status,
        series  // [{date:'YYYY-MM-DD', pillar:'finance', score:NN}]
      });

      // Record Prometheus metrics (guard if not wired)
      try {
        const m = req.app.locals.metrics;
        if (m?.setGovernanceLiveLatency) m.setGovernanceLiveLatency(Date.now() - t0);
        if (m?.recordGovernanceLiveHit) m.recordGovernanceLiveHit();
      } catch {}
    } catch (err) {
      console.error('[Governance Live] status error:', err);
      res.status(500).json({ success: false, error: String(err && err.message || err) });
    }
  }
);

/**
 * GET /api/governance/live/sparklines?p=finance&days=30
 * Returns time series data for a specific pillar
 */
router.get('/api/governance/live/sparklines',
  authenticateToken,
  requireAnyRole('OWNER', 'FINANCE', 'OPS'),
  async (req, res) => {
    try {
      const pillar = (req.query.p || 'composite').toLowerCase();
      const days = Math.max(7, Math.min(Number(req.query.days || 30), 180));
      const validPillars = new Set(['composite', 'finance', 'health', 'ai', 'menu']);
      const selectedPillar = validPillars.has(pillar) ? pillar : 'composite';

      const db = req.app.locals.db || dbModule;
      await withBusyTimeout(db, 3000);

      const rows = await dbAllCompat(
        db,
        `SELECT as_of as date, score
         FROM governance_daily
         WHERE pillar = ?
           AND as_of >= date('now', ?)
         ORDER BY as_of ASC`,
        [selectedPillar, `-${days} day`]
      );

      res.set('Cache-Control', `public, max-age=${cacheSeconds}`);
      res.json({
        success: true,
        pillar: selectedPillar,
        days,
        series: rows
      });

      // Record Prometheus metrics (guard if not wired)
      try {
        req.app.locals.metrics?.recordGovernanceSparklineHit?.(selectedPillar);
      } catch {}
    } catch (err) {
      console.error('[Governance Live] sparkline error:', err);
      res.status(500).json({ success: false, error: String(err && err.message || err) });
    }
  }
);

/**
 * GET /api/governance/live/events
 * SSE stream for real-time governance updates
 */
router.get('/api/governance/live/events',
  authenticateToken,
  requireAnyRole('OWNER', 'FINANCE', 'OPS'),
  async (req, res) => {
    // Set SSE headers
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'  // Disable nginx buffering
    });
    res.flushHeaders?.();

    // Send initial connection message
    res.write(`event: connected\n`);
    res.write(`data: ${JSON.stringify({ ts: Date.now(), message: 'Connected to governance stream' })}\n\n`);

    let timer;
    const tick = async () => {
      try {
        const db = req.app.locals.db || require('../config/database');
        const row = await dbGetCompat(
          db,
          `SELECT as_of, score FROM governance_daily
           WHERE pillar='composite'
           ORDER BY as_of DESC LIMIT 1`
        );

        res.write(`event: heartbeat\n`);
        res.write(`data: ${JSON.stringify({
          ts: Date.now(),
          as_of: row?.as_of || null,
          composite: Number(row?.score || 0)
        })}\n\n`);

        // Record Prometheus metrics (guard if not wired)
        try {
          req.app.locals.metrics?.recordGovernanceSseTick?.();
        } catch {}
      } catch (err) {
        // Keep stream alive; log and continue
        console.warn('[Governance Live] SSE tick error:', err?.message || err);
      }
    };

    // First tick immediately, then every 5 seconds
    timer = setInterval(tick, 5000);
    tick();

    // Cleanup on client disconnect
    req.on('close', () => {
      clearInterval(timer);
      try { res.end(); } catch {}
      console.log('[Governance Live] SSE client disconnected');
    });
  }
);

module.exports = router;
