// server.production-minimal.js
// Lean Express server with strict CORS, security headers, rate limiting,
// pino logging, Postgres pool (Neon), health check, JWT auth, and RLS session propagation.

require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const compression = require("compression");
const pinoHttp = require("pino-http");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

const {
  PORT = 8080,
  NODE_ENV = "production",
  ALLOW_ORIGIN,
  DATABASE_URL,
  JWT_SECRET,
} = process.env;

if (!DATABASE_URL || !JWT_SECRET || !ALLOW_ORIGIN) {
  console.error("❌ Missing env vars: DATABASE_URL, JWT_SECRET, ALLOW_ORIGIN");
  process.exit(1);
}

const app = express();

// Structured JSON logging (redacts auth headers)
app.use(
  pinoHttp({
    redact: ["req.headers.authorization"],
    customSuccessMessage: (res) => `✅ ${res.statusCode}`,
  })
);

// Strict CORS (add staging domain if needed)
app.use(
  cors({
    origin: [ALLOW_ORIGIN],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
    maxAge: 600,
  })
);

// Security headers with safe CSP for API
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'none'"],
        "connect-src": ["'self'", ALLOW_ORIGIN],
      },
    },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    crossOriginResourcePolicy: { policy: "same-origin" },
    crossOriginOpenerPolicy: { policy: "same-origin" },
    crossOriginEmbedderPolicy: true,
  })
);

// Rate limiting (300 req/10min globally)
app.use(
  rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.use(express.json({ limit: "512kb" }));
app.use(compression());

// PostgreSQL connection pool (Neon)
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/**
 * Per-request DB helper with RLS session vars
 * Sets app.role and app.user_id for Row-Level Security policies
 */
async function withDb(userOrNull, fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL app.role = $1", [userOrNull?.role || "viewer"]);
    if (userOrNull?.id) {
      await client.query("SET LOCAL app.user_id = $1", [userOrNull.id]);
    }
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/**
 * JWT authentication middleware
 * @param {string[]} requiredRoles - Array of allowed roles (e.g., ['admin', 'manager'])
 */
function auth(requiredRoles = []) {
  return (req, res, next) => {
    try {
      const token = (req.headers.authorization || "").replace(/^Bearer /, "");
      if (!token) return res.status(401).json({ error: "unauthorized" });

      const payload = jwt.verify(token, JWT_SECRET);
      const user = { id: payload.sub, role: payload.role, email: payload.email };

      if (requiredRoles.length && !requiredRoles.includes(user.role)) {
        return res.status(403).json({ error: "forbidden" });
      }

      req.user = user;
      next();
    } catch (e) {
      req.log?.warn({ err: e }, "auth_failed");
      res.status(401).json({ error: "unauthorized" });
    }
  };
}

// ============================================================================
// Routes
// ============================================================================

/**
 * Health check endpoint
 * Returns database connectivity status
 */
app.get("/health", async (req, res) => {
  try {
    const { rows } = await withDb(null, (db) => db.query("SELECT NOW() AS now"));
    res.json({ status: "ok", time: rows[0].now });
  } catch (e) {
    req.log?.error({ err: e }, "health_failed");
    res.status(500).json({ status: "error", error: e.message });
  }
});

/**
 * Low stock report (requires manager/admin)
 * Returns items below minimum quantity threshold
 */
app.get("/inventory/low-stock", auth(["manager", "admin"]), async (req, res) => {
  try {
    const { rows } = await withDb(req.user, (db) =>
      db.query(`
        SELECT
          i.item_number,
          i.name,
          COALESCE(SUM(ic.qty_on_hand), 0) AS qty,
          i.min_qty
        FROM item i
        LEFT JOIN inventory_count ic ON ic.item_id = i.id
        GROUP BY i.id
        HAVING COALESCE(SUM(ic.qty_on_hand), 0) < i.min_qty
        ORDER BY qty ASC
      `)
    );
    res.json(rows);
  } catch (e) {
    req.log?.error({ err: e }, "low_stock_failed");
    res.status(500).json({ error: "server_error" });
  }
});

/**
 * Create inventory movement (requires counter/manager/admin)
 */
app.post("/movement", auth(["counter", "manager", "admin"]), async (req, res) => {
  const { item_id, location_id, type, qty, note } = req.body || {};

  // Minimal validation
  if (!item_id || !location_id || !qty || !["receive", "use", "adjust", "transfer"].includes(type)) {
    return res.status(400).json({ error: "invalid_body" });
  }

  try {
    await withDb(req.user, (db) =>
      db.query(
        `INSERT INTO movement (item_id, location_id, type, qty, note, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [item_id, location_id, type, qty, note || null, req.user.id]
      )
    );
    res.status(201).json({ ok: true });
  } catch (e) {
    req.log?.error({ err: e }, "movement_create_failed");
    res.status(500).json({ error: "server_error" });
  }
});

// ============================================================================
// Server Start
// ============================================================================

const server = app.listen(PORT, () => {
  console.log(`🚀 Minimal API on :${PORT} (${NODE_ENV})`);
  console.log(`🔒 CORS allowed: ${ALLOW_ORIGIN}`);
  console.log(`📊 Database: ${DATABASE_URL.split('@')[1]?.split('/')[0] || 'connected'}`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("🛑 SIGTERM received, closing server...");
  server.close(() => {
    console.log("✅ Server closed");
    pool.end(() => {
      console.log("✅ DB pool closed");
      process.exit(0);
    });
  });
});

module.exports = app;
