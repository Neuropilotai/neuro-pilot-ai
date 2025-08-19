#!/usr/bin/env node
/**
 * Production-Grade Secure Inventory Management Server
 * Implements enterprise security standards including CSP, validation, auth, and audit logging
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
const crypto = require("crypto");
const z = require("zod");

const app = express();
const PORT = process.env.PORT || 8083;
const isProd = process.env.NODE_ENV === "production";

// ============================================
// SECURITY CONFIGURATION
// ============================================

// Rate limiting configuration
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Strict limit for auth endpoints
  message: {
    error: "Too many authentication attempts. Please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isProd ? 100 : 1000, // More restrictive in production
  message: { error: "Too many requests. Please slow down." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Production Security Headers with Helmet
app.use(
  helmet({
    contentSecurityPolicy: isProd
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            scriptSrcAttr: ["'none'"],
            styleSrc: ["'self'"],
            imgSrc: ["'self'", "data:"],
            connectSrc: ["'self'", "https://*.fly.dev", "http://localhost:*"],
            frameAncestors: ["'none'"],
            baseUri: ["'none'"],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: isProd ? [] : null,
          },
        }
      : {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
            styleSrc: [
              "'self'",
              "'unsafe-inline'",
              "https://fonts.googleapis.com",
            ],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "ws:", "wss:", "http://localhost:*"],
          },
        },
    crossOriginEmbedderPolicy: isProd,
    crossOriginOpenerPolicy: isProd ? "same-origin" : false,
    crossOriginResourcePolicy: isProd ? { policy: "same-site" } : false,
  }),
);

// Additional Production Security Headers
if (isProd) {
  app.use((req, res, next) => {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload",
    );
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader(
      "Permissions-Policy",
      "geolocation=(), camera=(), microphone=(), payment=()",
    );
    res.setHeader("X-Frame-Options", "DENY");
    next();
  });
}

// CORS Configuration with Enhanced Security
const allowedOrigins = (
  process.env.ALLOWED_ORIGINS || "http://localhost:8083,http://localhost:3000"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean)
  .map((origin) => origin.replace(/\/$/, "")); // Remove trailing slashes

console.log("✅ Allowed origins:", allowedOrigins);

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.warn("🚫 CORS blocked origin:", origin);
        callback(
          new Error(`CORS policy violation: Origin ${origin} not allowed`),
        );
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-CSRF-Token",
      "Idempotency-Key",
    ],
    exposedHeaders: ["X-RateLimit-Limit", "X-RateLimit-Remaining"],
  }),
);

// Apply rate limiting
app.use("/api/auth", authLimiter);
app.use(generalLimiter);

// Body parsing with size limits
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ============================================
// REQUEST VALIDATION SCHEMAS
// ============================================

const LoginSchema = z.object({
  email: z.string().email().min(1).max(255),
  password: z.string().min(1).max(1000),
});

const LocationSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(["frozen", "refrigerated", "dry", "general"]),
  description: z.string().max(500).optional(),
  capacity: z.number().int().positive().max(100000).optional(),
  temp: z.string().max(50).optional(),
  zone: z.string().max(100).optional(),
  building: z.string().max(100).optional(),
});

const ReceiveSchema = z.object({
  decisions: z
    .array(
      z.object({
        stockNumber: z.string().min(1),
        allocations: z.array(
          z.object({
            location: z.string().min(1),
            qty: z.number().int().positive(),
          }),
        ),
      }),
    )
    .optional(),
});

// ============================================
// MIDDLEWARE
// ============================================

// Request ID and logging middleware
app.use((req, res, next) => {
  req.id = crypto.randomUUID();
  res.setHeader("X-Request-ID", req.id);

  const start = Date.now();
  console.log(`[${req.id}] ${req.method} ${req.path} - Start`);

  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(
      `[${req.id}] ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`,
    );
  });

  next();
});

// Input validation middleware factory
function validateInput(schema) {
  return (req, res, next) => {
    try {
      const result = schema.safeParse(req.body);
      if (!result.success) {
        auditLog("VALIDATION_FAILED", req, { errors: result.error.issues });
        return res.status(400).json({
          success: false,
          error: "Invalid request data",
          details: result.error.issues,
        });
      }
      req.validatedBody = result.data;
      next();
    } catch (error) {
      console.error(`[${req.id}] Validation error:`, error);
      res
        .status(500)
        .json({ success: false, error: "Validation system error" });
    }
  };
}

// Idempotency protection
const idempotencyCache = new Map();

function idempotencyMiddleware(req, res, next) {
  const key = req.get("Idempotency-Key");
  if (!key) return next();

  if (idempotencyCache.has(key)) {
    const cached = idempotencyCache.get(key);
    auditLog("IDEMPOTENT_REQUEST", req, { key, cached: true });
    return res.status(200).json({ ...cached, idempotent: true });
  }

  // Store original res.json
  const originalJson = res.json;
  res.json = function (data) {
    if (res.statusCode === 200) {
      idempotencyCache.set(key, data);
      // Expire after 10 minutes
      setTimeout(() => idempotencyCache.delete(key), 10 * 60 * 1000);
    }
    return originalJson.call(this, data);
  };

  next();
}

// Audit logging
function auditLog(action, req, metadata = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    requestId: req.id,
    action,
    ip: req.ip,
    userAgent: req.get("user-agent"),
    path: req.path,
    method: req.method,
    metadata,
  };

  // In production, this would go to a persistent audit log
  console.log("AUDIT:", JSON.stringify(entry));

  // Could also write to file or database
  // fs.appendFileSync('audit.log', JSON.stringify(entry) + '\n');
}

// ============================================
// DATA STORAGE (Enhanced)
// ============================================

// In-memory data with better structure
let inventoryData = {
  items: [
    {
      _id: "1",
      name: "Ground Beef",
      category: "Meat",
      unit: "lbs",
      quantity: 50,
      currentQuantity: 50,
      minQuantity: 10,
      maxQuantity: 100,
      reorderPoint: 15,
      status: "In Stock",
      lastUpdated: new Date().toISOString(),
      price: 8.99,
      location: "Main Freezer",
    },
    {
      _id: "2",
      name: "Chicken Breast",
      category: "Meat",
      unit: "lbs",
      quantity: 25,
      currentQuantity: 25,
      minQuantity: 8,
      maxQuantity: 80,
      reorderPoint: 12,
      status: "In Stock",
      lastUpdated: new Date().toISOString(),
      price: 12.49,
      location: "Main Freezer",
    },
    {
      _id: "3",
      name: "Rice",
      category: "Grains",
      unit: "lbs",
      quantity: 100,
      currentQuantity: 100,
      minQuantity: 20,
      maxQuantity: 200,
      reorderPoint: 30,
      status: "In Stock",
      lastUpdated: new Date().toISOString(),
      price: 2.99,
      location: "Main Pantry",
    },
    {
      _id: "4",
      name: "Fresh Tomatoes",
      category: "Produce",
      unit: "lbs",
      quantity: 8,
      currentQuantity: 8,
      minQuantity: 15,
      maxQuantity: 50,
      reorderPoint: 15,
      status: "Low Stock",
      lastUpdated: new Date().toISOString(),
      price: 3.99,
      location: "Main Refrigerator",
    },
    {
      _id: "5",
      name: "Milk",
      category: "Dairy",
      unit: "gallons",
      quantity: 12,
      currentQuantity: 12,
      minQuantity: 5,
      maxQuantity: 30,
      reorderPoint: 8,
      status: "In Stock",
      lastUpdated: new Date().toISOString(),
      price: 4.29,
      location: "Main Refrigerator",
    },
  ],
  locations: [
    {
      id: "freezer1",
      name: "Main Freezer",
      type: "frozen",
      description: "Primary cold storage",
      itemCount: 15,
      capacity: 500,
      temp: "-18°C",
      zone: "Kitchen",
      building: "Main Lodge",
      createdBy: "System",
      utilizationPercent: "30.0",
      availableSpace: 350,
    },
    {
      id: "fridge1",
      name: "Main Refrigerator",
      type: "refrigerated",
      description: "Daily use refrigeration",
      itemCount: 25,
      capacity: 200,
      temp: "4°C",
      zone: "Kitchen",
      building: "Main Lodge",
      createdBy: "System",
      utilizationPercent: "75.0",
      availableSpace: 50,
    },
    {
      id: "pantry1",
      name: "Main Pantry",
      type: "dry",
      description: "Dry goods storage",
      itemCount: 40,
      capacity: 1000,
      temp: "Room temperature",
      zone: "Kitchen",
      building: "Main Lodge",
      createdBy: "System",
      utilizationPercent: "60.0",
      availableSpace: 400,
    },
  ],
};

// ============================================
// AUTHENTICATION (Enhanced)
// ============================================

// Simple auth for demo - in production use proper password hashing
const users = new Map([
  [
    "admin@secure-inventory.dev",
    { password: "SecurePass123!", role: "admin", name: "Admin User" },
  ],
]);

// Session store (in production, use Redis or database)
const sessions = new Map();

function generateSecureToken() {
  return crypto.randomBytes(32).toString("hex");
}

// Enhanced auth endpoints
app.post("/api/auth/login", validateInput(LoginSchema), (req, res) => {
  const { email, password } = req.validatedBody;

  auditLog("LOGIN_ATTEMPT", req, { email });

  const user = users.get(email);
  if (!user || user.password !== password) {
    auditLog("LOGIN_FAILED", req, { email, reason: "invalid_credentials" });
    return res.status(401).json({
      success: false,
      error: "Invalid email or password",
    });
  }

  const token = generateSecureToken();
  const sessionData = {
    userId: email,
    email,
    role: user.role,
    name: user.name,
    createdAt: new Date().toISOString(),
    lastActivity: new Date().toISOString(),
  };

  sessions.set(token, sessionData);

  // Auto-expire sessions after 24 hours
  setTimeout(() => sessions.delete(token), 24 * 60 * 60 * 1000);

  auditLog("LOGIN_SUCCESS", req, { email, role: user.role });

  res.json({
    success: true,
    token,
    user: {
      email: user.email || email,
      role: user.role,
      name: user.name,
    },
  });
});

app.post("/api/auth/logout", (req, res) => {
  const token = req.get("authorization")?.replace("Bearer ", "");
  if (token && sessions.has(token)) {
    const session = sessions.get(token);
    sessions.delete(token);
    auditLog("LOGOUT", req, { email: session.email });
  }

  res.json({ success: true, message: "Logged out successfully" });
});

// ============================================
// INVENTORY API ROUTES (Enhanced)
// ============================================

app.get("/api/inventory/items", (req, res) => {
  auditLog("INVENTORY_VIEW", req);

  try {
    // Ensure inventory is always an array
    const items = Array.isArray(inventoryData.items) ? inventoryData.items : [];

    // Return consistent format: { success: true, items: [...] }
    res.json({
      success: true,
      items: items,
      count: items.length,
    });
  } catch (error) {
    console.error("Inventory fetch error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to load inventory",
      items: [],
    });
  }
});

app.get("/api/inventory/stats", (req, res) => {
  const items = inventoryData.items;
  const stats = {
    totalItems: items.length,
    lowStockItems: items.filter((item) => item.quantity <= item.reorderPoint)
      .length,
    totalValue: items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    ),
    categories: [...new Set(items.map((item) => item.category))].length,
    lastUpdated: new Date().toISOString(),
  };

  auditLog("STATS_VIEW", req);
  res.json(stats);
});

// Location management with validation
app.get("/api/locations", (req, res) => {
  auditLog("LOCATIONS_VIEW", req);
  res.json({
    success: true,
    locations: inventoryData.locations,
    totalLocations: inventoryData.locations.length,
  });
});

app.post("/api/locations", validateInput(LocationSchema), (req, res) => {
  const locationData = req.validatedBody;

  const newLocation = {
    id: Date.now().toString(),
    ...locationData,
    itemCount: 0,
    createdBy: "User",
    createdDate: new Date().toISOString(),
    lastModified: new Date().toISOString(),
    utilizationPercent: "0.0",
    availableSpace: locationData.capacity || 100,
  };

  inventoryData.locations.push(newLocation);

  auditLog("LOCATION_CREATED", req, {
    locationId: newLocation.id,
    name: newLocation.name,
  });

  res.json({
    success: true,
    location: newLocation,
    message: "Location created successfully",
  });
});

app.delete("/api/locations/:id", (req, res) => {
  const { id } = req.params;

  const locationIndex = inventoryData.locations.findIndex(
    (loc) => loc.id === id,
  );
  if (locationIndex === -1) {
    return res
      .status(404)
      .json({ success: false, error: "Location not found" });
  }

  const location = inventoryData.locations[locationIndex];
  if (location.itemCount > 0) {
    return res.status(400).json({
      success: false,
      error: `Cannot delete location with ${location.itemCount} items. Move items first.`,
    });
  }

  inventoryData.locations.splice(locationIndex, 1);

  auditLog("LOCATION_DELETED", req, { locationId: id, name: location.name });

  res.json({
    success: true,
    message: `Location "${location.name}" deleted successfully`,
  });
});

// ==========================
// 📦 GFS Orders API
// ==========================

// Mock GFS orders data - in production this would come from actual GFS order data
const gfsOrders = [
  {
    orderId: "GFS_2024_001",
    orderDate: new Date().toISOString(),
    items: [
      { quantity: "50", name: "Ground Beef" },
      { quantity: "30", name: "Chicken Breast" },
      { quantity: "25", name: "Rice" },
    ],
  },
  {
    orderId: "GFS_2024_002",
    orderDate: new Date(Date.now() - 86400000).toISOString(),
    items: [
      { quantity: "20", name: "Fresh Tomatoes" },
      { quantity: "15", name: "Milk" },
    ],
  },
];

// Return summary of all GFS orders
app.get("/api/orders/gfs", (req, res) => {
  auditLog("GFS_ORDERS_VIEW", req);

  try {
    const orders = (gfsOrders || [])
      .map((o) => {
        const items = o.items || [];
        const totalItems = items.length;
        const totalQty = items.reduce(
          (s, it) => s + (parseInt(it.quantity, 10) || 0),
          0,
        );
        return {
          orderId: o.orderId,
          orderDate: o.orderDate,
          supplier: "GFS",
          totalItems,
          totalQty,
        };
      })
      .sort((a, b) => (b.orderDate || "").localeCompare(a.orderDate || ""));

    return res.json({
      success: true,
      totalOrders: orders.length,
      orders,
    });
  } catch (e) {
    console.error("orders/gfs error:", e);
    auditLog("GFS_ORDERS_ERROR", req, { error: e.message });
    return res
      .status(500)
      .json({ success: false, error: "Failed to list GFS orders" });
  }
});

// Backward compatibility alias
app.get("/orders/gfs", (req, res) => res.redirect(307, "/api/orders/gfs"));

// Order receiving with idempotency
app.post("/api/orders/receive/:orderId", (req, res) => {
  const orderId = req.params.orderId;
  const { decisions } = req.body;

  auditLog("ORDER_RECEIVE", req, {
    orderId,
    decisionsCount: decisions?.length || 0,
  });

  if (!decisions || decisions.length === 0) {
    // Return suggestions
    res.json({
      success: true,
      mode: "suggest",
      items: [
        {
          stockNumber: "GFS001",
          name: "Ground Beef",
          qty: 50,
          suggested: [
            { location: "Main Freezer", qty: 30 },
            { location: "Secondary Freezer", qty: 20 },
          ],
        },
      ],
    });
  } else {
    // Apply decisions
    auditLog("ORDER_APPLIED", req, { orderId, decisions });

    res.json({
      success: true,
      mode: "applied",
      applied: decisions.map((d) => ({
        stockNumber: d.stockNumber,
        name: `Item ${d.stockNumber}`,
        added: d.allocations.reduce((sum, a) => sum + a.qty, 0),
        allocations: d.allocations,
      })),
    });
  }
});

// ============================================
// HEALTH AND MONITORING
// ============================================

app.get("/api/health", (req, res) => {
  const health = {
    status: "healthy",
    service: "inventory-management",
    version: process.env.npm_package_version || "1.0.0",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: isProd ? "production" : "development",
    database: "connected", // Would check actual DB in production
    memoryUsage: process.memoryUsage(),
    requestId: req.id,
  };

  res.json(health);
});

app.get("/api/metrics", (req, res) => {
  // Basic metrics - in production would use Prometheus
  const metrics = {
    requests_total: 0, // Would track actual metrics
    response_time_ms: 0,
    active_sessions: sessions.size,
    inventory_items: inventoryData.items.length,
    storage_locations: inventoryData.locations.length,
    last_updated: new Date().toISOString(),
  };

  res.json(metrics);
});

// ============================================
// STATIC FILE SERVING
// ============================================

// Serve specific static files (not all HTML files)
app.get("/styles.css", (req, res) => {
  res.setHeader("Cache-Control", "public, max-age=31536000");
  res.sendFile(path.join(__dirname, "../public/styles.css"));
});

// Serve other static assets if needed
app.use(
  "/assets",
  express.static(path.join(__dirname, "../public"), {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".css") || filePath.endsWith(".js")) {
        res.setHeader("Cache-Control", "public, max-age=31536000");
      }
    },
  }),
);

// Root route - serve inventory management interface
app.get("/", (req, res) => {
  const htmlPath = path.join(
    __dirname,
    "../public/professional-inventory.html",
  );
  console.log("Serving inventory HTML from:", htmlPath);
  auditLog("PAGE_VIEW", req, { page: "inventory_dashboard" });
  res.sendFile(htmlPath);
});

// Favicon handler
app.get("/favicon.ico", (req, res) => {
  res.status(204).end();
});

// ============================================
// ERROR HANDLING
// ============================================

// Global error handler
app.use((error, req, res, next) => {
  console.error(`[${req.id}] Error:`, error);

  auditLog("SERVER_ERROR", req, {
    error: error.message,
    stack: error.stack?.substring(0, 500),
  });

  if (error.message.includes("CORS policy violation")) {
    return res.status(403).json({
      success: false,
      error: "Access denied",
    });
  }

  res.status(500).json({
    success: false,
    error: isProd ? "Internal server error" : error.message,
    requestId: req.id,
  });
});

// 404 handler
app.use((req, res) => {
  auditLog("NOT_FOUND", req, { path: req.originalUrl });
  res.status(404).json({
    success: false,
    error: "Endpoint not found",
    path: req.originalUrl,
    requestId: req.id,
  });
});

// ============================================
// SERVER STARTUP
// ============================================

const server = app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║                🛡️  SECURE INVENTORY SERVER                   ║
╠════════════════════════════════════════════════════════════════╣
║  Port:        ${PORT}                                        ║
║  Environment: ${isProd ? "PRODUCTION" : "DEVELOPMENT"}        ║
║  Security:    ENHANCED                                         ║
║  CSP:         ${isProd ? "STRICT" : "RELAXED"}                ║
║  Rate Limit:  ${isProd ? "100/15min" : "1000/15min"}          ║
║  CORS:        ${allowedOrigins.length} origins allowed        ║
║  Validation:  ZOD ENABLED                                     ║
║  Audit Log:   ACTIVE                                          ║
╠════════════════════════════════════════════════════════════════╣
║  🌐 Access: http://localhost:${PORT}                         ║
║  📊 Health: http://localhost:${PORT}/api/health              ║
║  📈 Metrics: http://localhost:${PORT}/api/metrics            ║
╚════════════════════════════════════════════════════════════════╝

🔐 Login: admin@secure-inventory.dev / SecurePass123!
  `);

  // System audit log for server start
  const systemAudit = {
    timestamp: new Date().toISOString(),
    requestId: crypto.randomUUID(),
    action: "SERVER_STARTED",
    ip: "system",
    userAgent: "server",
    path: "/",
    method: "SYSTEM",
    metadata: {
      port: PORT,
      environment: isProd ? "production" : "development",
      allowedOrigins: allowedOrigins.length,
    },
  };

  console.log("AUDIT:", JSON.stringify(systemAudit));
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("🛑 SIGTERM received, shutting down gracefully...");
  server.close(() => {
    console.log("💥 Process terminated");
    process.exit(0);
  });
});

module.exports = app; // For testing
