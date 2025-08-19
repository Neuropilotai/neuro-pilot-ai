#!/usr/bin/env node
// Simple Inventory Server with proper API routes and CORS
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

// Load allowed origins from environment
const allowedOrigins = (
  process.env.ALLOWED_ORIGINS || "http://localhost:5500,http://localhost:3000"
)
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

console.log("✅ Allowed origins:", allowedOrigins);

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
  return { items: [], locations: [] };
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

// Routes
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/professional-inventory.html"));
});

app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    mode: "simple-inventory",
    timestamp: new Date().toISOString(),
  });
});

// Auth endpoints for compatibility
app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body;
  if (email === "admin@secure-inventory.dev" && password === "SecurePass123!") {
    res.json({
      success: true,
      token: "inventory-token-" + Date.now(),
      user: { email, role: "admin" },
    });
  } else {
    res.status(401).json({ error: "Invalid credentials" });
  }
});

app.post("/api/auth/refresh", (req, res) => {
  res
    .status(501)
    .json({ error: "Auth refresh not implemented in inventory-only mode" });
});

// Inventory API Routes
app.get("/api/inventory", (req, res) => {
  const inventory = loadInventory();
  res.json(inventory);
});

app.post("/api/inventory/items", (req, res) => {
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

app.get("/api/inventory/items", (req, res) => {
  const inventory = loadInventory();
  res.json(inventory.items || []);
});

app.put("/api/inventory/items/:id", (req, res) => {
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

app.delete("/api/inventory/items/:id", (req, res) => {
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

// Storage Locations API (both paths for compatibility)
app.get("/api/storage/locations", (req, res) => {
  const inventory = loadInventory();
  res.json({
    success: true,
    locations: inventory.locations || [],
    totalLocations: (inventory.locations || []).length,
  });
});

app.get("/api/inventory/locations", (req, res) => {
  const inventory = loadInventory();
  res.json(inventory.locations || []);
});

app.post("/api/storage/locations", (req, res) => {
  const inventory = loadInventory();
  inventory.locations = inventory.locations || [];

  const newLocation = {
    id: Date.now().toString(),
    ...req.body,
    createdAt: new Date().toISOString(),
  };
  inventory.locations.push(newLocation);

  if (saveInventory(inventory)) {
    res.json({
      success: true,
      location: newLocation,
      message: "Location added successfully",
    });
  } else {
    res.status(500).json({ success: false, error: "Failed to save location" });
  }
});

app.post("/api/inventory/locations", (req, res) => {
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

app.delete("/api/inventory/locations/:id", (req, res) => {
  const inventory = loadInventory();
  if (inventory.locations) {
    const index = inventory.locations.findIndex(
      (loc) => loc.id === req.params.id,
    );
    if (index !== -1) {
      inventory.locations.splice(index, 1);
      if (saveInventory(inventory)) {
        res.json({ success: true });
      } else {
        res
          .status(500)
          .json({ success: false, error: "Failed to save inventory" });
      }
    } else {
      res.status(404).json({ success: false, error: "Location not found" });
    }
  } else {
    res.status(404).json({ success: false, error: "No locations found" });
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
║      📦 SIMPLE INVENTORY API SERVER        ║
╠════════════════════════════════════════════╣
║   Port: ${PORT}                            ║
║   URL:  http://localhost:${PORT}           ║
║   CORS: ${allowedOrigins.length} origins allowed        ║
╠════════════════════════════════════════════╣
║   API Endpoints:                           ║
║   • GET    /api/inventory                  ║
║   • GET    /api/inventory/items            ║
║   • POST   /api/inventory/items            ║
║   • PUT    /api/inventory/items/:id        ║
║   • DELETE /api/inventory/items/:id        ║
║   • GET    /api/inventory/locations        ║
║   • POST   /api/inventory/locations        ║
║   • DELETE /api/inventory/locations/:id    ║
╚════════════════════════════════════════════╝
  `);
});
