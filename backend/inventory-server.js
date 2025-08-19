#!/usr/bin/env node
// Inventory-Only Server - No Trading Agents
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 8083;

// Load allowed origins from secrets (comma-separated)
const allowedOrigins = (
  process.env.ALLOWED_ORIGINS || "http://localhost:5500,http://localhost:3000"
)
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

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));
app.use(express.static(path.join(__dirname, "../frontend")));

// Data directory
const DATA_DIR = path.join(__dirname, "../data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Inventory data file
const INVENTORY_FILE = path.join(DATA_DIR, "inventory.json");

// Load inventory data
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

// Save inventory data
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
  res.json({ status: "healthy", mode: "inventory-only" });
});

// Inventory API
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
  inventory.items.push(newItem);

  if (saveInventory(inventory)) {
    res.json({ success: true, item: newItem });
  } else {
    res.status(500).json({ success: false, error: "Failed to save inventory" });
  }
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

// Storage Locations API
app.get("/api/inventory/locations", (req, res) => {
  const inventory = loadInventory();
  res.json(inventory.locations || []);
});

app.post("/api/inventory/locations", (req, res) => {
  const inventory = loadInventory();
  if (!inventory.locations) {
    inventory.locations = [];
  }

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

// Start server
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════╗
║   🏭 INVENTORY MANAGEMENT SYSTEM ONLINE    ║
╠════════════════════════════════════════════╣
║   Mode: Inventory-Only (No Trading)        ║
║   Port: ${PORT}                            ║
║   URL:  http://localhost:${PORT}           ║
╠════════════════════════════════════════════╣
║   Features:                                ║
║   • Item Management                        ║
║   • Storage Locations                      ║
║   • Real-time Updates                      ║
║   • Bilingual Interface                    ║
╚════════════════════════════════════════════╝
  `);
});
