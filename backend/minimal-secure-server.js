#!/usr/bin/env node
// Minimal Secure Inventory Server with Authentication
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

// Environment variables with defaults
const JWT_SECRET =
  process.env.JWT_SECRET || crypto.randomBytes(64).toString("hex");
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@neuro-pilot.ai";
// Default password is "admin123" - bcrypt hash with salt rounds 12
const ADMIN_HASH =
  process.env.ADMIN_HASH ||
  "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LeKDBrQCXsJvpN7qW";

// Load allowed origins
const allowedOrigins = (
  process.env.ALLOWED_ORIGINS || "http://localhost:5500,http://localhost:3000"
)
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

console.log("✅ Allowed origins:", allowedOrigins);
console.log("🔐 Admin email:", ADMIN_EMAIL);

// Configure CORS
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.warn("🚫 CORS blocked origin:", origin);
        callback(new Error("CORS not allowed for origin: " + origin));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token"],
  }),
);

app.options("*", cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

// Data directory
const DATA_DIR = path.join(__dirname, "../data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const INVENTORY_FILE = path.join(DATA_DIR, "inventory.json");

// Helper functions
function loadInventory() {
  try {
    if (fs.existsSync(INVENTORY_FILE)) {
      const data = fs.readFileSync(INVENTORY_FILE, "utf8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Error loading inventory:", error);
  }
  return {
    items: [
      {
        id: "1",
        name: "Professional Laptops",
        category: "Electronics",
        quantity: 25,
        lastUpdated: new Date().toISOString(),
      },
      {
        id: "2",
        name: "Office Chairs",
        category: "Furniture",
        quantity: 8,
        lastUpdated: new Date().toISOString(),
      },
      {
        id: "3",
        name: "Network Cables",
        category: "IT Equipment",
        quantity: 150,
        lastUpdated: new Date().toISOString(),
      },
    ],
    locations: [
      {
        id: "1",
        name: "Main Warehouse",
        address: "123 Storage St",
        capacity: 1000,
      },
      {
        id: "2",
        name: "Office Storage",
        address: "456 Office Blvd",
        capacity: 200,
      },
    ],
  };
}

function saveInventory(data) {
  try {
    fs.writeFileSync(INVENTORY_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error("Error saving inventory:", error);
    return false;
  }
}

// Authentication middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Access token required" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// Routes
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/professional-inventory.html"));
});

app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    mode: "minimal-secure-inventory",
    timestamp: new Date().toISOString(),
    security: "256-bit encryption ready",
  });
});

// Authentication Routes
app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  // Check admin credentials
  if (email !== ADMIN_EMAIL) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  try {
    const validPassword = await bcrypt.compare(password, ADMIN_HASH);
    if (!validPassword) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Generate access token
    const accessToken = jwt.sign(
      {
        userId: "1",
        email: email,
        role: "admin",
        iat: Math.floor(Date.now() / 1000),
      },
      JWT_SECRET,
      { expiresIn: "15m" },
    );

    res.json({
      success: true,
      accessToken,
      user: {
        id: "1",
        email: email,
        role: "admin",
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Authentication failed" });
  }
});

app.post("/auth/refresh", (req, res) => {
  // Simple refresh implementation
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Token required" });
  }

  try {
    // Verify old token (even if expired for refresh)
    const decoded = jwt.verify(token, JWT_SECRET, { ignoreExpiration: true });

    // Issue new token
    const newToken = jwt.sign(
      {
        userId: decoded.userId,
        email: decoded.email,
        role: decoded.role,
        iat: Math.floor(Date.now() / 1000),
      },
      JWT_SECRET,
      { expiresIn: "15m" },
    );

    res.json({ accessToken: newToken });
  } catch (error) {
    res.status(401).json({ error: "Invalid refresh token" });
  }
});

app.post("/auth/logout", (req, res) => {
  // In a real implementation, you'd invalidate the token
  res.json({ success: true });
});

// Inventory API Routes
app.get("/inventory", authenticateToken, (req, res) => {
  const inventory = loadInventory();
  res.json(inventory);
});

app.get("/api/inventory", (req, res) => {
  const inventory = loadInventory();
  res.json(inventory);
});

app.get("/inventory/items", authenticateToken, (req, res) => {
  const inventory = loadInventory();
  res.json(inventory.items || []);
});

app.post("/inventory/items", authenticateToken, (req, res) => {
  const inventory = loadInventory();
  const newItem = {
    id: Date.now().toString(),
    ...req.body,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  inventory.items = inventory.items || [];
  inventory.items.push(newItem);

  if (saveInventory(inventory)) {
    res.json({ success: true, item: newItem });
  } else {
    res.status(500).json({ success: false, error: "Failed to save inventory" });
  }
});

app.put("/inventory/items/:id", authenticateToken, (req, res) => {
  const inventory = loadInventory();
  const index = inventory.items.findIndex((item) => item.id === req.params.id);

  if (index !== -1) {
    inventory.items[index] = {
      ...inventory.items[index],
      ...req.body,
      updatedAt: new Date().toISOString(),
    };

    if (saveInventory(inventory)) {
      res.json({ success: true, item: inventory.items[index] });
    } else {
      res
        .status(500)
        .json({ success: false, error: "Failed to save inventory" });
    }
  } else {
    res.status(404).json({ success: false, error: "Item not found" });
  }
});

app.delete("/inventory/items/:id", authenticateToken, (req, res) => {
  const inventory = loadInventory();
  const index = inventory.items.findIndex((item) => item.id === req.params.id);

  if (index !== -1) {
    inventory.items.splice(index, 1);

    if (saveInventory(inventory)) {
      res.json({ success: true });
    } else {
      res
        .status(500)
        .json({ success: false, error: "Failed to save inventory" });
    }
  } else {
    res.status(404).json({ success: false, error: "Item not found" });
  }
});

// Storage Locations API
app.get("/inventory/locations", authenticateToken, (req, res) => {
  const inventory = loadInventory();
  res.json(inventory.locations || []);
});

app.post("/inventory/locations", authenticateToken, (req, res) => {
  const inventory = loadInventory();
  inventory.locations = inventory.locations || [];

  const newLocation = {
    id: Date.now().toString(),
    ...req.body,
    createdAt: new Date().toISOString(),
  };
  inventory.locations.push(newLocation);

  if (saveInventory(inventory)) {
    res.json({ success: true, location: newLocation });
  } else {
    res.status(500).json({ success: false, error: "Failed to save location" });
  }
});

// Catch-all for API routes
app.use("/api/*", (req, res) => {
  res.status(404).json({ error: "API endpoint not found", path: req.path });
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════╗
║      🔒 SECURE INVENTORY API SERVER        ║
╠════════════════════════════════════════════╣
║   Port: ${PORT}                            ║
║   URL:  http://localhost:${PORT}           ║
║   CORS: ${allowedOrigins.length} origins allowed        ║
║   Auth: JWT + bcrypt (256-bit ready)       ║
╠════════════════════════════════════════════╣
║   Default Admin Credentials:               ║
║   Email: ${ADMIN_EMAIL}        ║
║   Pass:  admin123                          ║
╠════════════════════════════════════════════╣
║   API Endpoints:                           ║
║   • POST   /auth/login                     ║
║   • POST   /auth/refresh                   ║
║   • POST   /auth/logout                    ║
║   • GET    /inventory                      ║
║   • GET    /inventory/items                ║
║   • POST   /inventory/items                ║
║   • PUT    /inventory/items/:id            ║
║   • DELETE /inventory/items/:id            ║
║   • GET    /inventory/locations            ║
║   • POST   /inventory/locations            ║
╚════════════════════════════════════════════╝
  `);
});
