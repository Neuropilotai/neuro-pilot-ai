#!/usr/bin/env node

/**
 * ENTERPRISE SECURE INVENTORY MANAGEMENT SYSTEM
 * Production-grade security implementation
 * COPYRIGHT © 2025 - ALL RIGHTS RESERVED
 */

// --- Enterprise security imports & setup (added) ---
const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const { v4: uuidv4 } = require("uuid");
const mongoSanitize = require("express-mongo-sanitize");
const compression = require("compression");
const speakeasy = require("speakeasy");
const path = require("path");
const fs = require("fs").promises;
// ---------------------------------------------------

const app = express();
const PORT = process.env.PORT || 3000;

// --- Enterprise security middleware (added) ---
app.set("trust proxy", 1); // Secure cookies behind Cloudflare/Fly

// Fail fast on missing secrets in prod
if (process.env.NODE_ENV === "production") {
  const required = [
    "JWT_SECRET",
    "REFRESH_SECRET",
    "ENCRYPTION_KEY",
    "ALLOWED_ORIGINS",
    "COOKIE_SECRET",
  ];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length)
    throw new Error("Missing required env secrets: " + missing.join(", "));
}

app.use(express.json({ limit: "1mb" }));
app.use(
  cookieParser(
    process.env.COOKIE_SECRET || crypto.randomBytes(32).toString("hex"),
  ),
);

// Load allowed origins from secrets (comma-separated)
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

console.log("✅ Allowed origins:", allowedOrigins);

// Configure CORS with enhanced validation
app.use(
  cors({
    origin: function (origin, callback) {
      // If no origin (e.g., curl/Postman) or in the list, allow it
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.warn("🚫 CORS blocked origin:", origin);
        callback(new Error("CORS not allowed for origin: " + origin));
      }
    },
    credentials: true, // allow cookies/auth headers
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token"],
  }),
);

// Handle preflight explicitly (optional but useful for some proxies)
app.options("*", cors());

// Helmet baseline + CSP via header below
app.use(
  helmet({
    hsts: { maxAge: 63072000, includeSubDomains: true, preload: true },
    frameguard: { action: "deny" },
    referrerPolicy: { policy: "no-referrer" },
    noSniff: true,
    xssFilter: true,
  }),
);

// CSP (no inline; allow Inter via Google Fonts)
app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data:",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
    ].join("; "),
  );
  next();
});

// Rate limits
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
});
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/auth/login", loginLimiter);
app.use("/auth/refresh", refreshLimiter);
app.use("/api", apiLimiter);

// Origin verification for cookie-auth state changes
function verifyOrigin(req, res, next) {
  const origin = req.headers.origin;
  if (!origin || allowedOrigins.includes(origin)) return next();
  console.warn("🚫 Origin verification failed:", origin);
  return res.status(403).json({ error: "Forbidden origin" });
}
// ---------------------------------------------------

// ═══════════════════════════════════════════════════════════════
// SECURITY CONFIGURATION - Use Fly.io secrets or env vars
// ═══════════════════════════════════════════════════════════════

// These MUST come from Fly secrets in production
const JWT_SECRET = process.env.JWT_SECRET;
const REFRESH_SECRET = process.env.REFRESH_SECRET;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY
  ? Buffer.from(process.env.ENCRYPTION_KEY, "hex")
  : null;

if (!JWT_SECRET || !REFRESH_SECRET || !ENCRYPTION_KEY) {
  console.error("FATAL: Required secrets not configured. Set via Fly secrets:");
  console.error("fly secrets set JWT_SECRET=<random-64-chars>");
  console.error("fly secrets set REFRESH_SECRET=<random-64-chars>");
  console.error("fly secrets set ENCRYPTION_KEY=<32-byte-hex>");
  process.exit(1);
}

// Security constants
const SALT_ROUNDS = 12;
const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY = "7d";
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_TIME = 30 * 60 * 1000; // 30 minutes

// ═══════════════════════════════════════════════════════════════
// IN-MEMORY STORES (Replace with Redis/DB in production)
// ═══════════════════════════════════════════════════════════════

const stores = {
  users: new Map(),
  refreshTokens: new Map(), // token -> { userId, deviceId, createdAt, family }
  tokenFamilies: new Map(), // family -> Set of all tokens in rotation chain
  loginAttempts: new Map(),
  deviceFingerprints: new Map(),
  sessions: new Map(),
};

// Data sanitization - temporarily removed mongoSanitize due to conflict
app.use(compression());

// ═══════════════════════════════════════════════════════════════
// DEVICE FINGERPRINTING
// ═══════════════════════════════════════════════════════════════

function generateDeviceId(req) {
  const components = [
    req.headers["user-agent"] || "",
    req.headers["accept-language"] || "",
    req.headers["accept-encoding"] || "",
    // Don't use IP as it changes for mobile users
  ];

  const fingerprint = components.join("|");
  return crypto
    .createHash("sha256")
    .update(fingerprint)
    .digest("hex")
    .substring(0, 16);
}

app.use((req, res, next) => {
  req.deviceId = generateDeviceId(req);
  next();
});

// ═══════════════════════════════════════════════════════════════
// TOKEN MANAGEMENT WITH ROTATION
// ═══════════════════════════════════════════════════════════════

class TokenManager {
  static generateTokenFamily() {
    return uuidv4(); // More robust than hex
  }

  static generateAccessToken(userId, role, sessionId = null) {
    const jti = uuidv4();
    return jwt.sign(
      {
        userId,
        role,
        type: "access",
        jti,
        sessionId: sessionId || uuidv4(),
        iat: Math.floor(Date.now() / 1000),
        // Add nonce for replay protection
        nonce: crypto.randomBytes(16).toString("hex"),
      },
      JWT_SECRET,
      {
        expiresIn: ACCESS_TOKEN_EXPIRY,
        issuer: "secure-inventory",
        audience: "inventory-api",
        algorithm: "HS256",
      },
    );
  }

  static generateRefreshToken(userId, deviceId, family, generation = 0) {
    const tokenId = uuidv4();
    const iat = Math.floor(Date.now() / 1000);

    const token = jwt.sign(
      {
        userId,
        deviceId,
        family,
        tokenId,
        generation, // Track rotation count
        type: "refresh",
        iat,
        // Additional security claims
        fingerprint: this.generateTokenFingerprint(userId, deviceId, family),
        nonce: crypto.randomBytes(16).toString("hex"),
      },
      REFRESH_SECRET,
      {
        expiresIn: REFRESH_TOKEN_EXPIRY,
        issuer: "secure-inventory",
        algorithm: "HS256",
      },
    );

    // Store token metadata with enhanced tracking
    stores.refreshTokens.set(tokenId, {
      userId,
      deviceId,
      family,
      generation,
      createdAt: Date.now(),
      lastUsed: null,
      used: false,
      rotatedTo: null, // Track what token this was rotated to
      ipAddress: null, // Will be set during login
      userAgent: null,
    });

    // Add to family tracking
    if (!stores.tokenFamilies.has(family)) {
      stores.tokenFamilies.set(family, {
        userId,
        createdAt: Date.now(),
        tokens: new Set(),
        currentGeneration: generation,
        maxGeneration: generation,
        revoked: false,
      });
    }

    const familyData = stores.tokenFamilies.get(family);
    familyData.tokens.add(tokenId);
    familyData.maxGeneration = Math.max(familyData.maxGeneration, generation);
    stores.tokenFamilies.set(family, familyData);

    return { token, tokenId, generation };
  }

  static generateTokenFingerprint(userId, deviceId, family) {
    return crypto
      .createHmac("sha256", REFRESH_SECRET)
      .update(`${userId}:${deviceId}:${family}`)
      .digest("hex");
  }

  static async rotateRefreshToken(oldTokenId, decoded, req) {
    const tokenData = stores.refreshTokens.get(oldTokenId);
    const familyData = stores.tokenFamilies.get(decoded.family);

    if (!tokenData || !familyData) {
      console.warn(`SECURITY: Token ${oldTokenId} not found - possible attack`);
      this.revokeTokenFamily(decoded.family);
      throw new Error("Invalid refresh token - family revoked");
    }

    if (familyData.revoked) {
      console.warn(
        `SECURITY: Attempt to use token from revoked family ${decoded.family}`,
      );
      throw new Error("Token family has been revoked");
    }

    // Check for reuse detection
    if (tokenData.used || tokenData.rotatedTo) {
      console.warn(`SECURITY: Refresh token reuse detected!`, {
        tokenId: oldTokenId,
        family: decoded.family,
        generation: decoded.generation,
        userId: decoded.userId,
        usedAt: tokenData.lastUsed,
        rotatedTo: tokenData.rotatedTo,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      });

      // Revoke entire token family on reuse
      this.revokeTokenFamily(decoded.family);
      throw new Error(
        "Token reuse detected - all sessions revoked for security",
      );
    }

    // Verify token fingerprint
    const expectedFingerprint = this.generateTokenFingerprint(
      decoded.userId,
      decoded.deviceId,
      decoded.family,
    );

    if (decoded.fingerprint !== expectedFingerprint) {
      console.warn(`SECURITY: Token fingerprint mismatch for ${oldTokenId}`);
      this.revokeTokenFamily(decoded.family);
      throw new Error("Token fingerprint invalid - family revoked");
    }

    // Check generation sequence
    if (decoded.generation !== familyData.currentGeneration) {
      console.warn(`SECURITY: Generation mismatch`, {
        expected: familyData.currentGeneration,
        received: decoded.generation,
        family: decoded.family,
      });

      // Allow for some clock skew, but be suspicious
      if (Math.abs(decoded.generation - familyData.currentGeneration) > 2) {
        this.revokeTokenFamily(decoded.family);
        throw new Error("Generation sequence violation - family revoked");
      }
    }

    // Mark old token as used and update metadata
    tokenData.used = true;
    tokenData.lastUsed = Date.now();
    tokenData.ipAddress = req.ip;
    tokenData.userAgent = req.headers["user-agent"];

    // Generate new token with incremented generation
    const newGeneration = decoded.generation + 1;
    const newTokenResult = this.generateRefreshToken(
      decoded.userId,
      decoded.deviceId,
      decoded.family,
      newGeneration,
    );

    // Link old token to new token for audit trail
    tokenData.rotatedTo = newTokenResult.tokenId;
    stores.refreshTokens.set(oldTokenId, tokenData);

    // Update family tracking
    familyData.currentGeneration = newGeneration;
    stores.tokenFamilies.set(decoded.family, familyData);

    console.log(
      `Token rotated: ${oldTokenId} -> ${newTokenResult.tokenId} (gen ${newGeneration})`,
    );

    return newTokenResult;
  }

  static revokeTokenFamily(family) {
    const familyData = stores.tokenFamilies.get(family);
    if (familyData) {
      // Mark family as revoked
      familyData.revoked = true;
      familyData.revokedAt = Date.now();
      stores.tokenFamilies.set(family, familyData);

      // Remove all tokens in family
      familyData.tokens.forEach((tokenId) => {
        const tokenData = stores.refreshTokens.get(tokenId);
        if (tokenData) {
          tokenData.revoked = true;
          tokenData.revokedAt = Date.now();
          stores.refreshTokens.set(tokenId, tokenData);
        }
      });

      console.warn(`SECURITY: Token family ${family} completely revoked`);
    }
  }

  static revokeUserSessions(userId) {
    // Revoke all token families for a user
    for (const [family, familyData] of stores.tokenFamilies.entries()) {
      if (familyData.userId === userId) {
        this.revokeTokenFamily(family);
      }
    }
  }

  static cleanupExpiredTokens() {
    const now = Date.now();
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days

    // Clean up old tokens
    for (const [tokenId, tokenData] of stores.refreshTokens.entries()) {
      if (now - tokenData.createdAt > maxAge) {
        stores.refreshTokens.delete(tokenId);
      }
    }

    // Clean up old families
    for (const [family, familyData] of stores.tokenFamilies.entries()) {
      if (now - familyData.createdAt > maxAge) {
        stores.tokenFamilies.delete(family);
      }
    }
  }

  static verifyAccessToken(token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET, {
        issuer: "secure-inventory",
        audience: "inventory-api",
        algorithms: ["HS256"],
      });

      if (decoded.type !== "access") {
        throw new Error("Invalid token type");
      }

      // Additional validation
      if (!decoded.jti || !decoded.sessionId || !decoded.nonce) {
        throw new Error("Token missing required claims");
      }

      return decoded;
    } catch (error) {
      if (error.name === "TokenExpiredError") {
        throw new Error("Access token expired");
      } else if (error.name === "JsonWebTokenError") {
        throw new Error("Invalid access token");
      }
      throw error;
    }
  }

  static verifyRefreshToken(token) {
    try {
      const decoded = jwt.verify(token, REFRESH_SECRET, {
        issuer: "secure-inventory",
        algorithms: ["HS256"],
      });

      if (decoded.type !== "refresh") {
        throw new Error("Invalid token type");
      }

      // Additional validation
      if (
        !decoded.tokenId ||
        !decoded.family ||
        decoded.generation === undefined
      ) {
        throw new Error("Token missing required claims");
      }

      return decoded;
    } catch (error) {
      if (error.name === "TokenExpiredError") {
        throw new Error("Refresh token expired");
      } else if (error.name === "JsonWebTokenError") {
        throw new Error("Invalid refresh token");
      }
      throw error;
    }
  }
}

// Cleanup expired tokens every hour
setInterval(
  () => {
    TokenManager.cleanupExpiredTokens();
  },
  60 * 60 * 1000,
);

// ═══════════════════════════════════════════════════════════════
// AUTHENTICATION MIDDLEWARE
// ═══════════════════════════════════════════════════════════════

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Access token required" });
  }

  try {
    const decoded = TokenManager.verifyAccessToken(token);
    req.user = { id: decoded.userId, role: decoded.role };
    next();
  } catch (error) {
    return res.status(401).json({ error: error.message });
  }
};

const requireRole = (role) => {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
};

// Note: Auth routes are defined in the simplified section below

// ═══════════════════════════════════════════════════════════════
// ERROR HANDLING
// ═══════════════════════════════════════════════════════════════

app.use((err, req, res, next) => {
  console.error("Error:", err);

  // Never leak error details in production
  if (process.env.NODE_ENV === "production") {
    res.status(500).json({ error: "Internal server error" });
  } else {
    res.status(500).json({ error: err.message });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

// --- Token utilities & secure auth routes (added) ---

// Replace with Postgres in production
const tokenStore = {
  families: new Map(), // familyId -> { userId, deviceId, revokedAt: number|null }
  tokens: new Map(), // hash -> { familyId, userId, deviceId, status: 'active'|'rotated'|'revoked', expiresAt: number }
};
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

function signAccessToken(user) {
  return jwt.sign(
    { sub: String(user.id), role: user.role || "user" },
    process.env.JWT_SECRET,
    { expiresIn: "15m" },
  );
}
function issueRefreshToken(userId, deviceId, familyId) {
  const raw = crypto.randomBytes(64).toString("base64url");
  const hash = sha256(raw);
  tokenStore.tokens.set(hash, {
    familyId,
    userId,
    deviceId,
    status: "active",
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
  });
  if (!tokenStore.families.has(familyId))
    tokenStore.families.set(familyId, { userId, deviceId, revokedAt: null });
  return { raw, hash };
}
function setRefreshCookie(res, raw) {
  res.cookie("rt", raw, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/auth/refresh",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}
function revokeFamily(familyId) {
  const fam = tokenStore.families.get(familyId);
  if (fam) fam.revokedAt = Date.now();
  for (const [h, rec] of tokenStore.tokens)
    if (rec.familyId === familyId) rec.status = "revoked";
}

// Stub: replace with real DB lookup (ADMIN_EMAIL + ADMIN_HASH via env)
async function findUserByEmail(email) {
  if (email === process.env.ADMIN_EMAIL)
    return {
      id: 1,
      email,
      role: "admin",
      passwordHash: process.env.ADMIN_HASH,
    };
  return null;
}

// Bearer middleware
function authenticateAccess(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing access token" });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

// /auth/login
app.post("/auth/login", verifyOrigin, async (req, res) => {
  const { email, password, deviceId: deviceFromClient } = req.body || {};
  if (!email || !password)
    return res.status(400).json({ error: "Email and password are required" });

  const user = await findUserByEmail(email);
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  const deviceId = deviceFromClient || uuidv4();
  const familyId = uuidv4();

  const accessToken = signAccessToken(user);
  const { raw: refreshRaw } = issueRefreshToken(user.id, deviceId, familyId);
  setRefreshCookie(res, refreshRaw);

  res.json({ accessToken, deviceId });
});

// /auth/refresh (rotation + reuse detection)
app.post("/auth/refresh", verifyOrigin, (req, res) => {
  const presented = req.cookies.rt;
  if (!presented)
    return res.status(401).json({ error: "Missing refresh token" });

  const hash = sha256(presented);
  const rec = tokenStore.tokens.get(hash);
  if (!rec) {
    res.clearCookie("rt", { path: "/auth/refresh" });
    return res.status(401).json({ error: "Invalid refresh token" });
  }
  const fam = tokenStore.families.get(rec.familyId);
  if (fam?.revokedAt) {
    res.clearCookie("rt", { path: "/auth/refresh" });
    return res.status(401).json({ error: "Session revoked" });
  }
  if (rec.status !== "active") {
    // REUSE detected
    revokeFamily(rec.familyId);
    res.clearCookie("rt", { path: "/auth/refresh" });
    return res
      .status(401)
      .json({ error: "Token reuse detected. Re-login required." });
  }

  // Rotate
  rec.status = "rotated";
  const { userId, deviceId, familyId } = rec;
  const accessToken = jwt.sign(
    { sub: String(userId), role: "user" },
    process.env.JWT_SECRET,
    { expiresIn: "15m" },
  );
  const { raw: newRefreshRaw } = issueRefreshToken(userId, deviceId, familyId);
  setRefreshCookie(res, newRefreshRaw);

  res.json({ accessToken });
});

// /auth/logout
app.post("/auth/logout", verifyOrigin, (req, res) => {
  const presented = req.cookies.rt;
  if (presented) {
    const hash = sha256(presented);
    const rec = tokenStore.tokens.get(hash);
    if (rec) revokeFamily(rec.familyId);
  }
  res.clearCookie("rt", { path: "/auth/refresh" });
  res.json({ success: true });
});

// Serve static files (HTML, CSS, JS)
app.use(express.static(path.join(__dirname, "../public")));
app.use(express.static(path.join(__dirname, "../frontend")));

// Main inventory interface
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/professional-inventory.html"));
});

// Example protected API
app.get("/api/health", authenticateAccess, (req, res) => {
  res.json({ ok: true, user: req.user, ts: new Date().toISOString() });
});
// ----------------------------------------------------

// ═══════════════════════════════════════════════════════════════
// SERVER INITIALIZATION
// ═══════════════════════════════════════════════════════════════

const server = app.listen(PORT, () => {
  console.log(`🔒 Enterprise Secure Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);

  if (process.env.NODE_ENV !== "production") {
    console.log(
      "\n⚠️  Development mode - Some security features may be relaxed",
    );
    console.log("Set NODE_ENV=production for full security");
  }
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully...");
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});

module.exports = app;
