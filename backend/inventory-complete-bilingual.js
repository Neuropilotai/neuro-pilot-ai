#!/usr/bin/env node

/**
 * ████████████████████████████████████████████████████████████████████████████████
 * ██                                                                            ██
 * ██    🏕️ COMPLETE BILINGUAL INVENTORY SYSTEM WITH ALL DATA                   ██
 * ██    The FULL system from yesterday - Sysco catalog, GFS orders, locations  ██
 * ██                                                                            ██
 * ██    COPYRIGHT © 2025 DAVID MIKULIS - ALL RIGHTS RESERVED                   ██
 * ██    PROPRIETARY SOFTWARE - UNAUTHORIZED USE PROHIBITED                     ██
 * ██                                                                            ██
 * ████████████████████████████████████████████████████████████████████████████████
 */

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs").promises;
const fsSync = require("fs");
const multer = require("multer");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const app = express();
const PORT = 8083;
const IS_PRODUCTION =
  process.env.NODE_ENV === "production" || process.env.FLY_APP_NAME;

// Get the correct data directory based on environment
function getDataPath(...paths) {
  if (IS_PRODUCTION) {
    return path.join("/data", ...paths);
  }
  return path.join(__dirname, "data", ...paths);
}

// Security Configuration
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (IS_PRODUCTION) {
    throw new Error("JWT_SECRET must be set in production");
  } else {
    console.warn(
      "⚠️ WARNING: JWT_SECRET is not set (development only). Set a strong secret via environment.",
    );
  }
}

// Security Middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://fonts.googleapis.com",
          "https://fonts.gstatic.com",
        ],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        scriptSrcAttr: ["'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: [
          "'self'",
          "http://localhost:3000",
          "http://localhost:8083",
          "http://localhost:*",
        ],
      },
    },
  }),
);

// Rate Limiting
const MAX_LOGIN_ATTEMPTS = parseInt(process.env.LOGIN_MAX || "3", 10);
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: MAX_LOGIN_ATTEMPTS,
  standardHeaders: true,
  legacyHeaders: false,
});

// Input validation and sanitization
const validator = require("validator");

// Enhanced rate limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api/auth/login", loginLimiter);
app.use("/api", generalLimiter);

// CORS configuration
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS?.split(",") || [
      "http://localhost:8083",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(
  express.json({
    limit: "10mb",
  }),
);

// Serve static files from public directory
app.use(express.static(path.join(__dirname, "public")));

// GitHub Orders Sync Integration
const {
  GitHubOrdersSync,
  setupGitHubSyncRoutes,
} = require("./github-orders-sync");
setupGitHubSyncRoutes(app);

// Initialize GitHub sync on startup
const githubSync = new GitHubOrdersSync({
  owner: "Neuropilotai",
  repo: "gfs-orders-data",
  ordersPath: "orders/processed",
});

// Sync orders from GitHub on startup
githubSync
  .syncToLocal()
  .then((count) => {
    console.log(`✅ Synced ${count} orders from GitHub repository`);
  })
  .catch((err) => {
    console.log(`⚠️ GitHub sync not configured: ${err.message}`);
  })
  .finally(async () => {
    await loadStoredData().catch(() => {});
    inventory = generateFullInventory();
    console.log(`✅ Inventory initialized: ${inventory.length} items`);
  });

// File upload configuration
const upload = multer({
  dest: getDataPath("uploads"),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// Input validation functions
function sanitizeString(str, maxLength = 255) {
  if (!str || typeof str !== "string") return "";
  return validator.escape(str.trim()).substring(0, maxLength);
}

function validateOrderId(orderId) {
  if (!orderId || typeof orderId !== "string") return false;
  return /^GFS_\d{8}_\d{6}_[A-Z0-9]{6}$/.test(orderId);
}

function validateProductCode(code) {
  if (!code || typeof code !== "string") return false;
  return /^[A-Z0-9]{1,20}$/.test(code.toUpperCase());
}

function validateLocation(location) {
  const validLocations = [
    "Freezer A1",
    "Freezer A2",
    "Freezer A3",
    "Cooler B1",
    "Cooler B2",
    "Cooler B3",
    "Dry Storage C1",
    "Dry Storage C2",
    "Dry Storage C3",
    "Dry Storage C4",
    "Walk-in D1",
  ];
  return validLocations.includes(location);
}

// Load stored data
let syscoCatalog = [];
let gfsOrders = [];
let historicalInventory = [];

// Location preferences system
let locationPrefs = {}; // { supplierCode: [{location, weight}] }
function prefsPath() {
  return getDataPath("prefs", "location_prefs.json");
}

function loadLocationPrefs() {
  try {
    const p = prefsPath();
    if (fsSync.existsSync(p)) {
      locationPrefs = JSON.parse(fsSync.readFileSync(p, "utf8"));
      console.log(
        "✅ Loaded location preferences:",
        Object.keys(locationPrefs).length,
      );
    }
  } catch (e) {
    console.warn("⚠️ Location prefs load failed", e.message);
  }
}
function saveLocationPrefs() {
  try {
    const p = prefsPath();
    fsSync.mkdirSync(path.dirname(p), { recursive: true });
    fsSync.writeFileSync(p, JSON.stringify(locationPrefs, null, 2));
  } catch (e) {
    console.warn("⚠️ Location prefs save failed", e.message);
  }
}

function recordAllocationPref(supplierCode, allocations) {
  if (!supplierCode) return;
  if (!locationPrefs[supplierCode]) locationPrefs[supplierCode] = [];
  allocations.forEach(({ location, qty }) => {
    if (!location) return;
    const arr = locationPrefs[supplierCode];
    const idx = arr.findIndex((x) => x.location === location);
    if (idx === -1) arr.push({ location, weight: Math.max(1, +qty || 1) });
    else arr[idx].weight += Math.max(1, +qty || 1);
  });
  // normalize top few
  const arr = locationPrefs[supplierCode];
  const total = arr.reduce((s, x) => s + x.weight, 0) || 1;
  arr.forEach((x) => (x.ratio = +(x.weight / total).toFixed(3)));
  arr.sort((a, b) => b.weight - a.weight);
  saveLocationPrefs();
}

function suggestAllocations(supplierCode, qty, fallbackCategory) {
  qty = +qty || 0;
  const prefs = locationPrefs[supplierCode];
  if (prefs && prefs.length) {
    // propose by historical ratios
    const base = prefs.slice(0, 3); // cap to 3 locations
    let remaining = qty;
    const out = base
      .map((p, i) => {
        const proposed =
          i < base.length - 1 ? Math.floor(qty * p.ratio) : remaining;
        remaining -= proposed;
        return { location: p.location, qty: proposed };
      })
      .filter((x) => x.qty > 0);
    if (out.length) return out;
  }
  // fallback to single best location from category
  const loc = assignStorageLocation(fallbackCategory || "General");
  return [{ location: loc, qty: qty }];
}

async function loadStoredData() {
  try {
    // Load Sysco catalog
    const catalogPath = getDataPath(
      "catalog",
      "sysco_catalog_1753182965099.json",
    );
    const catalogData = await fs.readFile(catalogPath, "utf8");
    const catalogJson = JSON.parse(catalogData);
    syscoCatalog = catalogJson.items || [];
    console.log(`✅ Loaded Sysco catalog: ${syscoCatalog.length} items`);

    // Load GFS orders
    const gfsOrdersPath = getDataPath("gfs_orders");
    const gfsFiles = await fs.readdir(gfsOrdersPath);
    for (const file of gfsFiles) {
      if (
        file.startsWith("gfs_order_") &&
        !file.includes("deleted") &&
        file.endsWith(".json")
      ) {
        try {
          const orderData = await fs.readFile(
            path.join(gfsOrdersPath, file),
            "utf8",
          );
          const order = JSON.parse(orderData);
          gfsOrders.push(order);
        } catch (error) {
          console.log(`⚠️ Skipped corrupted file: ${file}`);
        }
      }
    }
    console.log(`✅ Loaded GFS orders: ${gfsOrders.length} orders`);

    // Load historical inventory
    const inventoryPath = path.join(
      __dirname,
      "storage",
      "inventory",
      "full_inventory",
      "2025",
      "full_inventory_2025-07-22.csv",
    );
    const inventoryData = await fs.readFile(inventoryPath, "utf8");
    // Parse CSV data here if needed
    console.log(`✅ Loaded historical inventory data`);
  } catch (error) {
    console.log("⚠️  Some data files not found, using defaults");
  }
}

// Location preferences loaded in initializeServer()
// Data loading moved to initializeServer() for proper async handling

// Bilingual translations
const translations = {
  english: {
    title: "AI Inventory Management System",
    dashboard: "Dashboard",
    inventory: "Inventory",
    orders: "Orders",
    suppliers: "Suppliers",
    catalog: "Product Catalog",
    totalItems: "Total Items",
    criticalItems: "Critical Items",
    totalValue: "Total Value",
    newOrder: "New Order",
    viewCatalog: "View Catalog",
    storage: "Storage Location",
    quantity: "Quantity",
    supplier: "Supplier",
    lastOrder: "Last Order",
    reorderNow: "Reorder Now",
    monitor: "Monitor",
    search: "Search products...",
    syscoCatalog: "Sysco Catalog",
    gfsOrders: "GFS Orders",
    historicalData: "Historical Data",
    lowStock: "Low Stock",
    outOfStock: "Out of Stock",
    normal: "Normal",
    high: "High Stock",
  },
  french: {
    title: "Système de Gestion d'Inventaire IA",
    dashboard: "Tableau de Bord",
    inventory: "Inventaire",
    orders: "Commandes",
    suppliers: "Fournisseurs",
    catalog: "Catalogue de Produits",
    totalItems: "Articles Totaux",
    criticalItems: "Articles Critiques",
    totalValue: "Valeur Totale",
    newOrder: "Nouvelle Commande",
    viewCatalog: "Voir le Catalogue",
    storage: "Emplacement de Stockage",
    quantity: "Quantité",
    supplier: "Fournisseur",
    lastOrder: "Dernière Commande",
    reorderNow: "Commander Maintenant",
    monitor: "Surveiller",
    search: "Rechercher des produits...",
    syscoCatalog: "Catalogue Sysco",
    gfsOrders: "Commandes GFS",
    historicalData: "Données Historiques",
    lowStock: "Stock Faible",
    outOfStock: "Rupture de Stock",
    normal: "Normal",
    high: "Stock Élevé",
  },
};

// Auto-assign storage location based on category
function assignStorageLocation(category) {
  const cat = category?.toLowerCase() || "";

  if (
    cat.includes("frozen") ||
    cat.includes("ice cream") ||
    cat.includes("frozen food")
  ) {
    return "Freezer A1";
  }
  if (
    cat.includes("meat") ||
    cat.includes("poultry") ||
    cat.includes("beef") ||
    cat.includes("chicken") ||
    cat.includes("pork")
  ) {
    return "Freezer A2";
  }
  if (
    cat.includes("dairy") ||
    cat.includes("milk") ||
    cat.includes("cheese") ||
    cat.includes("eggs")
  ) {
    return "Cooler B1";
  }
  if (
    cat.includes("produce") ||
    cat.includes("vegetable") ||
    cat.includes("fruit") ||
    cat.includes("fresh")
  ) {
    return "Cooler B2";
  }
  if (
    cat.includes("beverage") ||
    cat.includes("drink") ||
    cat.includes("juice")
  ) {
    return "Cooler B3";
  }
  if (
    cat.includes("bakery") ||
    cat.includes("bread") ||
    cat.includes("pastry")
  ) {
    return "Dry Storage C1";
  }
  if (
    cat.includes("dry goods") ||
    cat.includes("rice") ||
    cat.includes("flour") ||
    cat.includes("grain")
  ) {
    return "Dry Storage C2";
  }
  if (
    cat.includes("canned") ||
    cat.includes("sauce") ||
    cat.includes("condiment")
  ) {
    return "Dry Storage C3";
  }
  if (
    cat.includes("cleaning") ||
    cat.includes("paper") ||
    cat.includes("supplies")
  ) {
    return "Dry Storage C4";
  }

  // Default location for unclassified items
  return "Walk-in D1";
}

// Helper function to safely parse numbers
function num(x) {
  if (x == null) return 0;
  if (typeof x === 'number') return Number.isFinite(x) ? x : 0;
  // strip currency symbols/commas
  const v = Number(String(x).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(v) ? v : 0;
}

// Normalize inventory item data
function normalizeInventoryItem(item) {
  // Ensure name is structured properly
  if (typeof item.name === 'string') {
    item.name = { en: item.name, fr: item.name };
  } else if (!item.name || typeof item.name !== 'object') {
    const fallbackName = item.productName || item.itemDescription || item.description || 'Unknown Item';
    item.name = { en: fallbackName, fr: fallbackName };
  }
  
  // Normalize numeric fields
  item.unitPrice = num(item.unitPrice ?? item.price ?? item.unit_price ?? 0);
  item.quantity = num(item.quantity ?? item.qty ?? 0);
  
  // Calculate total value if not provided or invalid
  if (!item.totalValue || num(item.totalValue) <= 0) {
    item.totalValue = item.quantity * item.unitPrice;
  } else {
    item.totalValue = num(item.totalValue);
  }
  
  return item;
}

// Generate comprehensive inventory from GFS orders and base inventory
function generateFullInventory() {
  // Start with empty inventory - no demo data, only real orders
  let tempInventory = [];

  // First, collect all items from all orders
  gfsOrders.forEach((order) => {
    if (order.items && order.items.length > 0) {
      order.items.forEach((item) => {
        tempInventory.push({
          productName: item.productName || `Product ${item.productCode}`,
          productCode: item.productCode || "",
          quantity: item.quantity || 1,
          category: item.category || "General",
          unit: item.unit || "Each",
          supplier: item.supplier || "GFS",
          unitPrice: item.unitPrice || 0,
          packSize: item.packSize || "",
          brand: item.brand || "",
          totalPrice: item.totalPrice || 0,
          orderDate: order.orderDate,
          orderId: order.orderId,
        });
      });
    }
  });

  // Now consolidate duplicate items by product name and code
  const consolidatedItems = {};

  tempInventory.forEach((item) => {
    // Create a unique key based on product name and code
    const key = `${item.productName}_${item.productCode}`.toLowerCase();

    if (consolidatedItems[key]) {
      // Item already exists, add quantities and values
      consolidatedItems[key].quantity += item.quantity;
      consolidatedItems[key].totalValue += item.totalPrice;
      consolidatedItems[key].orderIds.push(item.orderId);
      // Keep the most recent order date
      if (item.orderDate > consolidatedItems[key].lastOrderDate) {
        consolidatedItems[key].lastOrderDate = item.orderDate;
      }
    } else {
      // New item
      consolidatedItems[key] = {
        productName: item.productName,
        productCode: item.productCode,
        quantity: item.quantity,
        category: item.category,
        unit: item.unit,
        supplier: item.supplier,
        unitPrice: item.unitPrice,
        packSize: item.packSize,
        brand: item.brand,
        totalValue: item.totalPrice,
        lastOrderDate: item.orderDate,
        orderIds: [item.orderId],
      };
    }
  });

  // Convert consolidated items to final inventory format
  let fullInventory = [];
  let nextId = 1;

  Object.values(consolidatedItems).forEach((item) => {
    const loc = assignStorageLocation(item.category);
    const inventoryItem = {
      id: nextId++,
      name: {
        en: item.productName,
        fr: item.productName,
      },
      quantity: item.quantity,
      minQuantity: Math.max(1, Math.floor(item.quantity * 0.3)),
      maxQuantity: item.quantity * 3,
      category: item.category,
      unit: item.unit,
      supplier: item.supplier,
      unitPrice: item.unitPrice,
      location: loc,
      locations: [loc], // 👈 add
      byLocation: { [loc]: item.quantity }, // 👈 add
      supplierCode: item.productCode,
      lastOrderDate: item.lastOrderDate,
      packSize: item.packSize,
      brand: item.brand,
      totalValue: item.totalValue,
      gfsOrderIds: item.orderIds, // Array of all order IDs containing this item
      orderCount: item.orderIds.length, // How many orders this item appears in
      isFromGFS: true,
      isConsolidated: true,
    };
    fullInventory.push(inventoryItem);
  });

  // Normalize all inventory items for consistent data
  fullInventory = fullInventory.map(normalizeInventoryItem);

  console.log(
    `✅ Consolidated ${tempInventory.length} individual items into ${fullInventory.length} unique products`,
  );
  return fullInventory;
}

// Complete inventory data with all suppliers and storage locations
let inventory = [];

// Suppliers with complete information
const suppliers = {
  Sysco: {
    name: "Sysco Corporation",
    contact: "1-800-SYSCO01",
    email: "orders@sysco.com",
    website: "www.sysco.com",
    minimumOrder: 150,
    deliveryDays: ["Monday", "Wednesday", "Friday"],
    paymentTerms: "Net 30",
    catalogItems: 2932,
    accountNumber: "CAMP-2025-SYS",
  },
  GFS: {
    name: "Gordon Food Service",
    contact: "1-800-968-4164",
    email: "customerservice@gfs.com",
    website: "www.gfs.com",
    minimumOrder: 100,
    deliveryDays: ["Tuesday", "Thursday", "Saturday"],
    paymentTerms: "Net 30",
    catalogItems: 1847,
    accountNumber: "CAMP-2025-GFS",
  },
  "US Foods": {
    name: "US Foods",
    contact: "1-800-388-8638",
    email: "orders@usfoods.com",
    website: "www.usfoods.com",
    minimumOrder: 125,
    deliveryDays: ["Monday", "Tuesday", "Thursday"],
    paymentTerms: "Net 30",
    catalogItems: 1205,
    accountNumber: "CAMP-2025-USF",
  },
};

// Storage locations - will be loaded from file or use defaults
let storageLocations = {
  "Freezer A1": {
    type: "Freezer",
    temp: "-10°F",
    capacity: 1000,
    currentUsage: 450,
  },
  "Freezer A2": {
    type: "Freezer",
    temp: "-10°F",
    capacity: 1000,
    currentUsage: 380,
  },
  "Freezer A3": {
    type: "Freezer",
    temp: "-10°F",
    capacity: 800,
    currentUsage: 290,
  },
  "Freezer B1": {
    type: "Freezer",
    temp: "0°F",
    capacity: 600,
    currentUsage: 185,
  },
  "Cooler B1": {
    type: "Cooler",
    temp: "38°F",
    capacity: 800,
    currentUsage: 420,
  },
  "Cooler B2": {
    type: "Cooler",
    temp: "38°F",
    capacity: 800,
    currentUsage: 510,
  },
  "Cooler B3": {
    type: "Cooler",
    temp: "40°F",
    capacity: 600,
    currentUsage: 280,
  },
  "Dry Storage C1": {
    type: "Dry Storage",
    temp: "Room",
    capacity: 1200,
    currentUsage: 650,
  },
  "Dry Storage C2": {
    type: "Dry Storage",
    temp: "Room",
    capacity: 1200,
    currentUsage: 780,
  },
  "Dry Storage C3": {
    type: "Dry Storage",
    temp: "Room",
    capacity: 1000,
    currentUsage: 420,
  },
  "Dry Storage C4": {
    type: "Dry Storage",
    temp: "Room",
    capacity: 800,
    currentUsage: 340,
  },
  "Walk-in D1": {
    type: "Walk-in",
    temp: "Room",
    capacity: 2000,
    currentUsage: 850,
  },
};

// Load storage locations from file
function loadStorageLocationsFromFile() {
  const locationsFilePath = getDataPath("storage_locations", "locations.json");

  try {
    if (fsSync.existsSync(locationsFilePath)) {
      const locationsData = JSON.parse(
        fsSync.readFileSync(locationsFilePath, "utf8"),
      );

      // Convert from array format to object format
      const loadedLocations = {};
      locationsData.forEach((loc) => {
        loadedLocations[loc.name] = {
          type: loc.type || "General",
          temp: loc.temperature || "Room",
          capacity: parseInt(loc.capacity) || 1000,
          currentUsage: loc.currentUsage || 0,
          description: loc.description,
          zone: loc.zone,
          building: loc.building,
          id: loc.id,
          createdBy: loc.createdBy,
          createdDate: loc.createdDate,
          lastModified: loc.lastModified,
          lastModifiedBy: loc.lastModifiedBy,
        };
      });

      storageLocations = loadedLocations;
      console.log(
        "✅ Loaded storage locations from file:",
        Object.keys(storageLocations).length,
        "locations",
      );
    } else {
      console.log("⚠️ No storage locations file found, using defaults");
      saveStorageLocationsToFile(); // Save defaults
    }
  } catch (error) {
    console.error("❌ Error loading storage locations:", error);
    console.log("⚠️ Using default storage locations");
  }
}

// Save storage locations to file
function saveStorageLocationsToFile() {
  const locationsFilePath = getDataPath("storage_locations", "locations.json");
  const locationsDir = getDataPath("storage_locations");

  try {
    // Ensure directory exists
    if (!fsSync.existsSync(locationsDir)) {
      fsSync.mkdirSync(locationsDir, { recursive: true });
    }

    // Convert object format to array format for file storage
    const locationsArray = Object.entries(storageLocations).map(
      ([name, data]) => ({
        id: data.id || name.toUpperCase().replace(/\s+/g, "_"),
        name: name,
        type: data.type,
        category:
          data.type === "Freezer"
            ? "frozen_storage"
            : data.type === "Cooler"
              ? "cold_storage"
              : data.type === "Dry Storage"
                ? "dry_storage"
                : "general_storage",
        description: data.description || `${data.type} storage location`,
        capacity: String(data.capacity),
        currentUsage: data.currentUsage,
        temperature: data.temp,
        zone: data.zone || "Main",
        building: data.building || "Main Lodge",
        isActive: true,
        createdBy: data.createdBy || "System",
        createdDate: data.createdDate || new Date().toISOString(),
        lastModified: new Date().toISOString(),
        lastModifiedBy: "System",
      }),
    );

    fsSync.writeFileSync(
      locationsFilePath,
      JSON.stringify(locationsArray, null, 2),
    );
    console.log("✅ Saved storage locations to file");
  } catch (error) {
    console.error("❌ Error saving storage locations:", error);
  }
}

// Orders history
let orders = [];
let orderCounter = 1;

// Authentication
const users = [
  // Default admin user - configure via environment variables in production
  // Email: Set via ADMIN_EMAIL, Password: Set via ADMIN_PASSWORD
];

// --- Bootstrap admin on first run ---
(async () => {
  try {
    if (
      Array.isArray(users) &&
      users.length === 0 &&
      process.env.ADMIN_BOOTSTRAP_EMAIL &&
      process.env.ADMIN_BOOTSTRAP_PASSWORD
    ) {
      const hash = await bcrypt.hash(process.env.ADMIN_BOOTSTRAP_PASSWORD, 12);
      users.push({
        id: 1,
        email: process.env.ADMIN_BOOTSTRAP_EMAIL,
        name: "Admin",
        role: "admin",
        passwordHash: hash,
      });
      console.log(
        `✅ Bootstrapped admin: ${process.env.ADMIN_BOOTSTRAP_EMAIL}`,
      );
    } else if (users.length === 0) {
      console.warn(
        "⚠️ No users defined. Set ADMIN_BOOTSTRAP_EMAIL & ADMIN_BOOTSTRAP_PASSWORD to create one.",
      );
    }
  } catch (e) {
    console.error("Admin bootstrap failed:", e);
  }
})();

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Access token required" });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: "Invalid or expired token" });
    }
    req.user = user;
    next();
  });
};

// API Routes

// API info route - moved to /api
app.get("/api", (req, res) => {
  res.json({
    success: true,
    message: "Camp Inventory System API",
    version: "2.0",
    endpoints: {
      login: "POST /api/auth/login",
      inventory: "GET /api/inventory/items (requires auth)",
    },
  });
});

// Login
app.post("/api/auth/login", loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = users.find((u) => u.email === email);
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Remove plaintext password check - only use hashed passwords
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);

    if (!isValidPassword) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
      },
      JWT_SECRET,
      { expiresIn: "15m" },
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Refresh stub to stop 404 spam
app.post("/api/auth/refresh", (_req, res) => {
  return res
    .status(501)
    .json({
      success: false,
      error: "Refresh not implemented; please re-login when needed.",
    });
});

// Function to get orders containing a specific item
function getOrdersForItem(item) {
  const orders = [];
  const itemName = item.name?.en || item.name || item.productName || '';
  const itemCode = item.supplierCode || item.stockNumber || '';
  
  // Search through all GFS orders to find this item
  gfsOrders.forEach(order => {
    if (order.items && Array.isArray(order.items)) {
      const foundInOrder = order.items.some(orderItem => {
        const orderItemName = orderItem.productName || orderItem.name || '';
        const orderItemCode = orderItem.productCode || orderItem.stockNumber || '';
        
        // Match by name or code (case insensitive)
        return (itemName && orderItemName.toLowerCase().includes(itemName.toLowerCase())) ||
               (itemCode && orderItemCode.toLowerCase() === itemCode.toLowerCase()) ||
               (orderItemName && itemName.toLowerCase().includes(orderItemName.toLowerCase()));
      });
      
      if (foundInOrder) {
        orders.push({
          orderId: order.orderId,
          supplier: order.supplier || 'GFS',
          orderDate: order.orderDate,
          totalItems: order.items.length
        });
      }
    }
  });
  
  return orders.slice(0, 5); // Limit to 5 most recent orders
}

// Get inventory items
app.get("/api/inventory/items", (req, res) => {
  const lang = req.query.lang || "english";

  const itemsWithInsights = inventory.map((item) => {
    const stockLevel = (item.quantity / item.maxQuantity) * 100;
    const daysUntilEmpty = Math.floor(item.quantity / 5);

    let status = "normal";
    if (item.quantity === 0) status = "outOfStock";
    else if (item.quantity <= item.minQuantity) status = "lowStock";
    else if (item.quantity >= item.maxQuantity * 0.9) status = "high";

    // Ensure locations array exists for backward compatibility
    if (!item.locations && item.location) {
      item.locations = [item.location];
    } else if (!item.locations) {
      item.locations = [];
    }

    // Get orders containing this item
    const itemOrders = getOrdersForItem(item);
    
    return {
      ...item,
      displayName: item.name?.en || item.name || "Unknown Item",
      status,
      stockLevel: stockLevel.toFixed(1),
      storageInfo: storageLocations[item.location],
      locations: item.locations, // Multiple locations support
      orders: itemOrders, // Orders containing this item
      aiInsights: {
        trend:
          stockLevel > 60
            ? "Stable"
            : stockLevel > 30
              ? "Declining"
              : "Critical",
        daysUntilEmpty,
        recommendedAction:
          item.quantity <= item.minQuantity
            ? lang === "french"
              ? "Commander Maintenant"
              : "Reorder Now"
            : lang === "french"
              ? "Surveiller"
              : "Monitor",
        confidence: 0.92,
        orderActivity: itemOrders.length > 0 ? `Found in ${itemOrders.length} recent order(s)` : 'No recent orders',
      },
    };
  });

  const totalValue = inventory.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0,
  );
  const criticalItems = inventory.filter(
    (item) => item.quantity <= item.minQuantity,
  ).length;
  const outOfStock = inventory.filter((item) => item.quantity === 0).length;

  res.json({
    success: true,
    items: itemsWithInsights,
    summary: {
      totalItems: inventory.length,
      totalValue: totalValue.toFixed(2),
      criticalItems,
      outOfStock,
      language: lang,
      lastUpdate: new Date().toISOString(),
    },
  });
});

// Get Sysco catalog
app.get("/api/catalog/sysco", (req, res) => {
  const search = req.query.search?.toLowerCase() || "";
  const category = req.query.category || "";
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;

  let filteredItems = syscoCatalog;

  if (search) {
    filteredItems = filteredItems.filter(
      (item) =>
        item.productName.toLowerCase().includes(search) ||
        item.productCode.toLowerCase().includes(search),
    );
  }

  if (category) {
    filteredItems = filteredItems.filter((item) => item.category === category);
  }

  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  const paginatedItems = filteredItems.slice(startIndex, endIndex);

  res.json({
    success: true,
    items: paginatedItems,
    totalItems: filteredItems.length,
    totalPages: Math.ceil(filteredItems.length / limit),
    currentPage: page,
    itemsPerPage: limit,
  });
});

// Get GFS orders history
app.get("/api/orders/gfs", (req, res) => {
  // Filter out deleted orders and remove duplicates by orderId
  const uniqueOrders = [];
  const seenIds = new Set();

  for (const order of gfsOrders) {
    // Skip deleted orders
    if (order.deletedBy || order.deletedDate) {
      continue;
    }

    if (!seenIds.has(order.orderId)) {
      uniqueOrders.push(order);
      seenIds.add(order.orderId);
    }
  }

  res.json({
    success: true,
    orders: uniqueOrders,
    totalOrders: uniqueOrders.length,
    totalValue: uniqueOrders.reduce(
      (sum, order) => sum + (order.totalValue || 0),
      0,
    ),
  });
});

// Search items by stock number (Sysco or GFS)
app.get("/api/catalog/search/:stockNumber", (req, res) => {
  try {
    const { stockNumber } = req.params;
    const searchTerm = stockNumber.toLowerCase().trim();

    if (!searchTerm) {
      return res.status(400).json({
        success: false,
        error: "Stock number is required",
      });
    }

    let foundItems = [];

    // Search in Sysco catalog
    const syscoMatches = syscoCatalog.filter((item) => {
      const productCode = (item.productCode || "").toLowerCase();
      const supplierCode = (item.supplierCode || "").toLowerCase();
      const upc = (item.upc || "").toLowerCase();

      return (
        productCode.includes(searchTerm) ||
        supplierCode.includes(searchTerm) ||
        upc.includes(searchTerm) ||
        productCode === searchTerm ||
        supplierCode === searchTerm ||
        upc === searchTerm
      );
    });

    // Add Sysco items to results
    foundItems = foundItems.concat(
      syscoMatches.map((item) => ({
        ...item,
        source: "sysco",
        displayName:
          item.productDescription || item.productName || "Unknown Item",
        stockNumber: item.productCode || item.supplierCode,
        category: item.category || "Uncategorized",
      })),
    );

    // Search in GFS orders for items with matching codes
    const gfsMatches = [];
    gfsOrders.forEach((order) => {
      if (order.items && Array.isArray(order.items)) {
        order.items.forEach((item) => {
          const itemCode = (item.itemCode || "").toLowerCase();
          const productCode = (item.productCode || "").toLowerCase();
          const upc = (item.upc || "").toLowerCase();

          if (
            (itemCode.includes(searchTerm) ||
              productCode.includes(searchTerm) ||
              upc.includes(searchTerm) ||
              itemCode === searchTerm ||
              productCode === searchTerm ||
              upc === searchTerm) &&
            !gfsMatches.find((existing) => existing.itemCode === item.itemCode)
          ) {
            gfsMatches.push({
              ...item,
              source: "gfs",
              displayName:
                item.itemDescription || item.productName || "Unknown Item",
              stockNumber: item.itemCode || item.productCode,
              category: item.category || "Uncategorized",
              orderId: order.orderId,
            });
          }
        });
      }
    });

    foundItems = foundItems.concat(gfsMatches);

    // Remove duplicates based on stock number and name
    const uniqueItems = [];
    const seen = new Set();

    foundItems.forEach((item) => {
      const key = `${item.source}-${item.stockNumber}-${item.displayName}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueItems.push(item);
      }
    });

    res.json({
      success: true,
      items: uniqueItems,
      totalFound: uniqueItems.length,
      searchTerm: stockNumber,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to search catalog",
      details: error.message,
    });
  }
});

// Add item to inventory by stock number
app.post("/api/inventory/add-by-stock", authenticateToken, (req, res) => {
  try {
    const { stockNumber, quantity = 1, location } = req.body;

    if (!stockNumber) {
      return res.status(400).json({
        success: false,
        error: "Stock number is required",
      });
    }

    // Search for the item first
    const searchTerm = stockNumber.toLowerCase().trim();
    let foundItem = null;

    // Search Sysco catalog
    foundItem = syscoCatalog.find((item) => {
      const productCode = (item.productCode || "").toLowerCase();
      const supplierCode = (item.supplierCode || "").toLowerCase();
      const upc = (item.upc || "").toLowerCase();

      return (
        productCode === searchTerm ||
        supplierCode === searchTerm ||
        upc === searchTerm
      );
    });

    if (foundItem) {
      foundItem.source = "sysco";
    } else {
      // Search GFS orders
      gfsOrders.forEach((order) => {
        if (order.items && Array.isArray(order.items) && !foundItem) {
          foundItem = order.items.find((item) => {
            const itemCode = (item.itemCode || "").toLowerCase();
            const productCode = (item.productCode || "").toLowerCase();
            const upc = (item.upc || "").toLowerCase();

            return (
              itemCode === searchTerm ||
              productCode === searchTerm ||
              upc === searchTerm
            );
          });

          if (foundItem) {
            foundItem.source = "gfs";
            foundItem.orderId = order.orderId;
          }
        }
      });
    }

    if (!foundItem) {
      return res.status(404).json({
        success: false,
        error: "Item not found in catalog",
      });
    }

    // Create new inventory item
    const initialLoc = location || assignStorageLocation(foundItem.category);
    const initialQty = parseInt(quantity);
    const newItem = {
      id: Date.now() + Math.random(),
      name: {
        en:
          foundItem.productDescription ||
          foundItem.itemDescription ||
          foundItem.productName ||
          "Unknown Item",
        fr:
          foundItem.productDescription ||
          foundItem.itemDescription ||
          foundItem.productName ||
          "Article Inconnu",
      },
      category: foundItem.category || "Uncategorized",
      quantity: initialQty,
      unit: foundItem.unit || foundItem.uom || "each",
      location: initialLoc,
      locations: [initialLoc],
      byLocation: { [initialLoc]: initialQty },
      supplier: foundItem.source === "sysco" ? "Sysco" : "GFS",
      supplierCode: foundItem.productCode || foundItem.itemCode || stockNumber,
      unitPrice: parseFloat(foundItem.unitPrice || foundItem.price || 0),
      totalValue:
        initialQty * parseFloat(foundItem.unitPrice || foundItem.price || 0),
      minQuantity: Math.max(1, Math.floor(initialQty * 0.2)),
      maxQuantity: initialQty * 3,
      lastOrderDate: new Date().toISOString().split("T")[0],
      addedBy: "stock-search",
      addedDate: new Date().toISOString(),
      isFromGFS: foundItem.source === "gfs",
      gfsOrderId: foundItem.orderId,
    };

    // Add to inventory
    inventory.push(newItem);

    res.json({
      success: true,
      message: "Item added to inventory successfully",
      item: newItem,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to add item to inventory",
      details: error.message,
    });
  }
});

// Delete GFS order
app.delete("/api/orders/gfs/:orderId", authenticateToken, async (req, res) => {
  try {
    const { orderId } = req.params;

    // Validate order ID format to prevent path traversal
    if (!validateOrderId(orderId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid order ID format",
      });
    }

    // Find the order in memory
    const orderIndex = gfsOrders.findIndex(
      (order) => order.orderId === orderId,
    );
    if (orderIndex === -1) {
      return res.status(404).json({
        success: false,
        error: "Order not found",
      });
    }

    const order = gfsOrders[orderIndex];

    // Find the file path with safe filename construction
    const gfsOrdersPath = getDataPath("gfs_orders");
    let filePath = null;

    // Check both active and deleted file patterns - sanitized filenames
    const possibleFiles = [
      `gfs_order_${orderId}.json`,
      `deleted_gfs_order_${orderId}.json`,
    ];

    for (const fileName of possibleFiles) {
      // Double-check filename safety
      if (!fileName.includes("..") && fileName.match(/^[a-zA-Z0-9_.-]+$/)) {
        const testPath = path.join(gfsOrdersPath, fileName);
        try {
          await fs.access(testPath);
          filePath = testPath;
          break;
        } catch (e) {
          // File doesn't exist, continue
        }
      }
    }

    if (!filePath) {
      return res.status(404).json({
        success: false,
        error: "Order file not found",
      });
    }

    // Delete the file
    await fs.unlink(filePath);

    // Remove from memory
    gfsOrders.splice(orderIndex, 1);

    // Regenerate inventory without this order
    inventory = generateFullInventory();

    console.log(
      `🗑️ Deleted order: ${orderId} (${order.totalItems} items, $${order.totalValue})`,
    );

    res.json({
      success: true,
      message: `Order ${orderId} deleted successfully`,
      deletedOrder: {
        orderId: order.orderId,
        totalItems: order.totalItems,
        totalValue: order.totalValue,
        orderDate: order.orderDate,
      },
      newTotals: {
        totalOrders: gfsOrders.length,
        totalInventoryItems: inventory.length,
      },
    });
  } catch (error) {
    console.error("Error deleting order:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete order",
    });
  }
});

// Auto-clean invalid orders
app.post("/api/orders/clean-invalid", authenticateToken, async (req, res) => {
  try {
    let deletedCount = 0;
    let itemsRemoved = 0;
    const gfsOrdersPath = getDataPath("gfs_orders");

    // Create backup directory
    const backupPath = getDataPath("gfs_orders_auto_cleaned_backup");
    await fs.mkdir(backupPath, { recursive: true });

    const ordersToDelete = [];

    // Identify invalid orders
    for (const order of gfsOrders) {
      let isInvalid = false;

      // Check for unrealistic total values
      if (order.totalValue > 100000 || order.totalValue < 0) {
        isInvalid = true;
      }

      // Check for orders with no items or corrupted items
      if (!order.items || order.items.length === 0 || order.totalItems === 0) {
        isInvalid = true;
      }

      // Check for orders with mostly invalid product codes
      if (order.items && order.items.length > 0) {
        const validItems = order.items.filter(
          (item) =>
            item.productCode &&
            item.productCode.length >= 6 &&
            item.productName &&
            item.productName.length > 3 &&
            !item.productName.toLowerCase().includes("tvq") &&
            !item.productName.toLowerCase().includes("tps") &&
            !item.productName.toLowerCase().includes("fax"),
        );

        if (validItems.length < order.items.length * 0.5) {
          isInvalid = true;
        }
      }

      if (isInvalid) {
        ordersToDelete.push(order);
        itemsRemoved += order.totalItems || 0;
      }
    }

    // Delete invalid orders
    for (const order of ordersToDelete) {
      const possibleFiles = [
        `gfs_order_${order.orderId}.json`,
        `deleted_gfs_order_${order.orderId}.json`,
      ];

      for (const fileName of possibleFiles) {
        if (fileName.match(/^[a-zA-Z0-9_.-]+$/)) {
          const filePath = path.join(gfsOrdersPath, fileName);
          const backupFilePath = path.join(backupPath, fileName);

          try {
            await fs.access(filePath);
            // Move to backup instead of deleting
            await fs.copyFile(filePath, backupFilePath);
            await fs.unlink(filePath);
            deletedCount++;
            break;
          } catch (e) {
            // File doesn't exist, continue
          }
        }
      }

      // Remove from memory
      const index = gfsOrders.findIndex((o) => o.orderId === order.orderId);
      if (index !== -1) {
        gfsOrders.splice(index, 1);
      }
    }

    // Regenerate inventory without invalid orders
    inventory = generateFullInventory();

    console.log(
      `🧹 Auto-cleaned ${deletedCount} invalid orders, removed ${itemsRemoved} items`,
    );

    res.json({
      success: true,
      deletedCount: deletedCount,
      remainingCount: gfsOrders.length,
      itemsRemoved: itemsRemoved,
      newInventoryCount: inventory.length,
    });
  } catch (error) {
    console.error("Error cleaning invalid orders:", error);
    res.status(500).json({
      success: false,
      error: "Failed to clean invalid orders",
    });
  }
});

// API: list consolidated items from orders
// Flatten & group items across orders
app.get("/api/orders/items", (req, res) => {
  const since = req.query.sinceDate; // optional ISO date
  const only = (o) => !since || (o.orderDate && o.orderDate >= since);
  const map = new Map(); // key = productCode|itemCode

  gfsOrders.filter(only).forEach((o) => {
    (o.items || []).forEach((it) => {
      const code = (it.productCode || it.itemCode || "").trim();
      if (!code) return;
      const key = code.toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          stockNumber: code,
          name: it.productName || it.itemDescription || `Item ${code}`,
          category: it.category || "Uncategorized",
          unit: it.unit || it.uom || "ea",
          supplier: "GFS",
          totalQty: 0,
          orders: [],
        });
      }
      const row = map.get(key);
      const q = +it.quantity || 0;
      row.totalQty += q;
      row.orders.push({ orderId: o.orderId, qty: q, date: o.orderDate });
    });
  });

  const items = [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  res.json({ success: true, count: items.length, items });
});

// Get storage locations
app.get("/api/storage/locations", (req, res) => {
  const locations = Object.entries(storageLocations).map(([name, info]) => ({
    name,
    ...info,
    utilizationPercent: ((info.currentUsage / info.capacity) * 100).toFixed(1),
    availableSpace: info.capacity - info.currentUsage,
  }));

  res.json({
    success: true,
    locations,
    totalLocations: locations.length,
  });
});

// Create new storage location
app.post("/api/storage/locations", authenticateToken, (req, res) => {
  const { name, type, temp, capacity } = req.body;

  if (!name || !type || !temp || !capacity) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  if (storageLocations[name]) {
    return res.status(400).json({ error: "Storage location already exists" });
  }

  storageLocations[name] = {
    type,
    temp,
    capacity: parseInt(capacity),
    currentUsage: 0,
    createdDate: new Date().toISOString(),
    createdBy: "System",
  };

  // Save to file
  saveStorageLocationsToFile();

  res.json({
    success: true,
    message: "Storage location created successfully",
    location: { name, ...storageLocations[name] },
  });
});

// Update storage location
app.put("/api/storage/locations/:name", authenticateToken, (req, res) => {
  const { name } = req.params;
  const { type, temp, capacity } = req.body;

  if (!storageLocations[name]) {
    return res.status(404).json({ error: "Storage location not found" });
  }

  if (type) storageLocations[name].type = type;
  if (temp) storageLocations[name].temp = temp;
  if (capacity) storageLocations[name].capacity = parseInt(capacity);

  // Update modification info
  storageLocations[name].lastModified = new Date().toISOString();
  storageLocations[name].lastModifiedBy = "System";

  // Save to file
  saveStorageLocationsToFile();

  res.json({
    success: true,
    message: "Storage location updated successfully",
    location: { name, ...storageLocations[name] },
  });
});

// Rename storage location
app.put(
  "/api/storage/locations/:name/rename",
  authenticateToken,
  (req, res) => {
    const { name: oldName } = req.params;
    const { newName } = req.body;

    if (!storageLocations[oldName]) {
      return res.status(404).json({ error: "Storage location not found" });
    }

    if (!newName || newName.trim() === "") {
      return res.status(400).json({ error: "New name is required" });
    }

    if (storageLocations[newName]) {
      return res
        .status(400)
        .json({ error: "A location with that name already exists" });
    }

    // Move the location data to the new name
    storageLocations[newName] = { ...storageLocations[oldName] };
    delete storageLocations[oldName];

    // Save to file
    saveStorageLocationsToFile();

    // Update all inventory items that use this location
    let updatedCount = 0;
    inventory.forEach((item) => {
      if (item.location === oldName) {
        item.location = newName;
        updatedCount++;
      }
    });

    res.json({
      success: true,
      message: "Storage location renamed successfully",
      oldName,
      newName,
      updatedItems: updatedCount,
    });
  },
);

// Delete storage location
app.delete("/api/storage/locations/:name", authenticateToken, (req, res) => {
  const { name } = req.params;

  if (!storageLocations[name]) {
    return res.status(404).json({ error: "Storage location not found" });
  }

  // Check if any inventory items are using this location
  const itemsUsingLocation = inventory.filter((item) => item.location === name);
  if (itemsUsingLocation.length > 0) {
    return res.status(400).json({
      error: "Cannot delete location - items are currently stored here",
      itemsCount: itemsUsingLocation.length,
    });
  }

  delete storageLocations[name];

  // Save to file
  saveStorageLocationsToFile();

  res.json({
    success: true,
    message: "Storage location deleted successfully",
  });
});

// Back-compat aliases for frontend that uses /api/locations
app.get("/api/locations", (req, res) =>
  res.redirect(307, "/api/storage/locations"),
);
app.post("/api/locations", (req, res) =>
  res.redirect(307, "/api/storage/locations"),
);
app.put("/api/locations/:name", (req, res) =>
  res.redirect(
    307,
    `/api/storage/locations/${encodeURIComponent(req.params.name)}`,
  ),
);
app.delete("/api/locations/:name", (req, res) =>
  res.redirect(
    307,
    `/api/storage/locations/${encodeURIComponent(req.params.name)}`,
  ),
);

// Create order
app.post("/api/inventory/orders", authenticateToken, (req, res) => {
  const { supplierId, items: orderItems, notes } = req.body;

  if (!suppliers[supplierId]) {
    return res.status(400).json({ error: "Invalid supplier" });
  }

  let totalAmount = 0;
  const validatedItems = orderItems.map((orderItem) => {
    const inventoryItem = inventory.find((i) => i.id === orderItem.itemId);
    if (!inventoryItem) {
      throw new Error(`Item ${orderItem.itemId} not found`);
    }

    const itemTotal = orderItem.quantity * inventoryItem.unitPrice;
    totalAmount += itemTotal;

    return {
      itemId: orderItem.itemId,
      name: inventoryItem.name,
      quantity: orderItem.quantity,
      unitPrice: inventoryItem.unitPrice,
      total: itemTotal,
      unit: inventoryItem.unit,
    };
  });

  const newOrder = {
    id: orderCounter++,
    orderNumber: `ORD-${Date.now()}`,
    supplier: supplierId,
    supplierInfo: suppliers[supplierId],
    items: validatedItems,
    totalAmount: totalAmount.toFixed(2),
    status: "pending",
    orderDate: new Date().toISOString(),
    notes: notes || "",
    createdBy: "David Mikulis",
  };

  orders.push(newOrder);

  res.json({
    success: true,
    order: newOrder,
    message: "Order created successfully",
  });
});

// Update item quantity
app.put("/api/inventory/items/:id", authenticateToken, (req, res) => {
  const itemId = parseInt(req.params.id);
  const { quantity } = req.body;

  const item = inventory.find((i) => i.id === itemId);
  if (!item) {
    return res.status(404).json({ error: "Item not found" });
  }

  item.quantity = parseInt(quantity);
  item.lastUpdate = new Date().toISOString();

  res.json({
    success: true,
    message: "Quantity updated successfully",
    item,
  });
});

// Upload files
app.post(
  "/api/inventory/upload",
  authenticateToken,
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      res.json({
        success: true,
        message: "File uploaded successfully",
        filename: req.file.originalname,
        size: req.file.size,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to process file" });
    }
  },
);

// Update inventory item location
app.put("/api/inventory/items/:id/location", authenticateToken, (req, res) => {
  try {
    const { id } = req.params;
    const { location, action = "set" } = req.body; // action can be 'set', 'add', 'remove'

    const itemIndex = inventory.findIndex((item) => item.id == id);
    if (itemIndex === -1) {
      return res.status(404).json({
        success: false,
        error: "Item not found",
      });
    }

    // Validate location exists
    if (!storageLocations[location]) {
      return res.status(400).json({
        success: false,
        error: "Invalid storage location",
      });
    }

    // Ensure locations is an array
    if (!Array.isArray(inventory[itemIndex].locations)) {
      inventory[itemIndex].locations = inventory[itemIndex].location
        ? [inventory[itemIndex].location]
        : [];
    }

    // Handle different actions
    switch (action) {
      case "add":
        if (!inventory[itemIndex].locations.includes(location)) {
          inventory[itemIndex].locations.push(location);
        }
        break;
      case "remove":
        inventory[itemIndex].locations = inventory[itemIndex].locations.filter(
          (loc) => loc !== location,
        );
        break;
      case "set":
      default:
        inventory[itemIndex].locations = [location];
        break;
    }

    // Update legacy location field for backward compatibility
    inventory[itemIndex].location = inventory[itemIndex].locations[0] || "";

    res.json({
      success: true,
      message: "Item location updated successfully",
      item: inventory[itemIndex],
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to update item location",
      details: error.message,
    });
  }
});

// Batch location operations
app.post(
  "/api/inventory/items/batch/location",
  authenticateToken,
  (req, res) => {
    try {
      const { items, location, action = "add" } = req.body; // items is array of item IDs

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          success: false,
          error: "Items array is required",
        });
      }

      // Validate location exists
      if (!storageLocations[location]) {
        return res.status(400).json({
          success: false,
          error: "Invalid storage location",
        });
      }

      const results = [];
      let successCount = 0;
      let failCount = 0;

      items.forEach((itemId) => {
        const itemIndex = inventory.findIndex((item) => item.id == itemId);
        if (itemIndex === -1) {
          results.push({ itemId, success: false, error: "Item not found" });
          failCount++;
          return;
        }

        // Ensure locations is an array
        if (!Array.isArray(inventory[itemIndex].locations)) {
          inventory[itemIndex].locations = inventory[itemIndex].location
            ? [inventory[itemIndex].location]
            : [];
        }

        // Handle different actions
        switch (action) {
          case "add":
            if (!inventory[itemIndex].locations.includes(location)) {
              inventory[itemIndex].locations.push(location);
            }
            break;
          case "remove":
            inventory[itemIndex].locations = inventory[
              itemIndex
            ].locations.filter((loc) => loc !== location);
            break;
          case "move": // Remove from all other locations and add to this one
            inventory[itemIndex].locations = [location];
            break;
        }

        // Update legacy location field
        inventory[itemIndex].location = inventory[itemIndex].locations[0] || "";

        results.push({ itemId, success: true });
        successCount++;
      });

      res.json({
        success: true,
        message: `Batch location update completed: ${successCount} success, ${failCount} failed`,
        results,
        successCount,
        failCount,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "Failed to batch update locations",
        details: error.message,
      });
    }
  },
);

// Download complete inventory file
app.get("/api/inventory/download/:format", authenticateToken, (req, res) => {
  try {
    const { format } = req.params;
    const timestamp = new Date().toISOString().split("T")[0];

    if (format === "csv") {
      const csvHeaders = [
        "ID",
        "Name",
        "Category",
        "Quantity",
        "Unit",
        "Location",
        "Supplier",
        "Unit Price",
        "Total Value",
        "Min Quantity",
        "Max Quantity",
        "Supplier Code",
        "Last Order Date",
        "Pack Size",
        "Brand",
        "GFS Order ID",
      ].join(",");

      const csvRows = inventory.map((item) =>
        [
          item.id,
          `"${item.name?.en || item.name || ""}"`,
          `"${item.category || ""}"`,
          item.quantity || 0,
          `"${item.unit || ""}"`,
          `"${item.location || ""}"`,
          `"${item.supplier || ""}"`,
          item.unitPrice || 0,
          item.totalValue || 0,
          item.minQuantity || 0,
          item.maxQuantity || 0,
          `"${item.supplierCode || ""}"`,
          `"${item.lastOrderDate || ""}"`,
          `"${item.packSize || ""}"`,
          `"${item.brand || ""}"`,
          `"${item.gfsOrderId || ""}"`,
        ].join(","),
      );

      const csvContent = [csvHeaders, ...csvRows].join("\\n");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="complete_inventory_${timestamp}.csv"`,
      );
      res.send(csvContent);
    } else if (format === "json") {
      const jsonData = {
        exportDate: new Date().toISOString(),
        totalItems: inventory.length,
        locations: Object.keys(storageLocations),
        inventory: inventory.map((item) => ({
          ...item,
          displayName: item.name?.en || item.name || "Unknown Item",
        })),
        summary: {
          totalValue: inventory.reduce(
            (sum, item) => sum + (item.totalValue || 0),
            0,
          ),
          itemsByLocation: Object.keys(storageLocations).reduce(
            (acc, location) => {
              acc[location] = inventory.filter(
                (item) => item.location === location,
              ).length;
              return acc;
            },
            {},
          ),
          itemsByCategory: inventory.reduce((acc, item) => {
            const cat = item.category || "Unknown";
            acc[cat] = (acc[cat] || 0) + 1;
            return acc;
          }, {}),
          itemsBySupplier: inventory.reduce((acc, item) => {
            const sup = item.supplier || "Unknown";
            acc[sup] = (acc[sup] || 0) + 1;
            return acc;
          }, {}),
        },
      };

      res.setHeader("Content-Type", "application/json");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="complete_inventory_${timestamp}.json"`,
      );
      res.json(jsonData);
    } else {
      res.status(400).json({
        success: false,
        error: "Invalid format. Use csv or json",
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to generate download",
      details: error.message,
    });
  }
});

// Quick Add Item by Stock Number
app.post("/api/inventory/quick-add", authenticateToken, (req, res) => {
  try {
    const { productCode, location, quantity } = req.body;

    // Validate input parameters
    if (!productCode || !location || quantity === undefined) {
      return res.status(400).json({
        success: false,
        error: "Product code, location, and quantity are required",
      });
    }

    // Sanitize and validate inputs
    const sanitizedCode = sanitizeString(productCode, 50);
    const sanitizedLocation = sanitizeString(location, 100);
    const numQuantity = parseInt(quantity);

    if (!validateLocation(sanitizedLocation)) {
      return res.status(400).json({
        success: false,
        error: "Invalid storage location",
      });
    }

    if (isNaN(numQuantity) || numQuantity < 0 || numQuantity > 10000) {
      return res.status(400).json({
        success: false,
        error: "Invalid quantity (must be 0-10000)",
      });
    }

    // Check if item already exists in inventory
    const existingItem = inventory.find(
      (item) =>
        item.supplierCode === sanitizedCode ||
        item.name.en.toLowerCase().includes(sanitizedCode.toLowerCase()),
    );

    if (existingItem) {
      // Update existing item
      existingItem.quantity += numQuantity;
      existingItem.location = sanitizedLocation;

      res.json({
        success: true,
        message: `Updated existing item: ${existingItem.name.en}`,
        item: existingItem,
      });
    } else {
      // Create new item
      const newItem = {
        id: Math.max(...inventory.map((i) => i.id)) + 1,
        name: {
          en: `Product ${sanitizedCode}`,
          fr: `Produit ${sanitizedCode}`,
        },
        quantity: numQuantity,
        minQuantity: 1,
        maxQuantity: numQuantity * 3,
        category: "Manual Entry",
        unit: "Each",
        supplier: "Manual",
        unitPrice: 0,
        location: sanitizedLocation,
        supplierCode: sanitizedCode,
        lastOrderDate: new Date().toISOString().split("T")[0],
        packSize: "",
        brand: "",
        totalValue: 0,
        isManualEntry: true,
      };

      inventory.push(newItem);

      res.json({
        success: true,
        message: `Added new item: ${newItem.name.en}`,
        item: newItem,
      });
    }
  } catch (error) {
    console.error("Error in quick add:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
});

// Get inventory items by location
app.get("/api/inventory/location/:location", authenticateToken, (req, res) => {
  try {
    const { location } = req.params;
    const itemsInLocation = inventory.filter(
      (item) =>
        item.location === location ||
        (item.locations && item.locations.includes(location)),
    );

    const locationInfo = storageLocations[location] || {
      type: "Unknown",
      temp: "N/A",
      capacity: 0,
      currentUsage: 0,
    };

    // Calculate statistics
    const totalValue = itemsInLocation.reduce(
      (sum, item) => sum + (item.totalValue || 0),
      0,
    );
    const totalUnits = itemsInLocation.reduce(
      (sum, item) => sum + (parseInt(item.quantity) || 0),
      0,
    );
    const categories = [
      ...new Set(itemsInLocation.map((item) => item.category)),
    ];

    const countingSummary = {
      pending: itemsInLocation.filter(
        (item) => (item.countingStatus || "pending") === "pending",
      ).length,
      counted: itemsInLocation.filter(
        (item) => (item.countingStatus || "pending") === "counted",
      ).length,
      discrepancies: itemsInLocation.filter(
        (item) =>
          item.physicalCount !== undefined &&
          item.physicalCount !== item.quantity,
      ).length,
    };

    res.json({
      success: true,
      location: {
        name: location,
        ...locationInfo,
        utilizationPercent: locationInfo.capacity
          ? ((locationInfo.currentUsage / locationInfo.capacity) * 100).toFixed(
              1,
            )
          : "0",
      },
      statistics: {
        totalItems: itemsInLocation.length,
        totalValue: totalValue.toFixed(2),
        totalUnits,
        categories: categories.length,
        categoryList: categories,
      },
      countingSummary,
      items: itemsInLocation
        .map((item, index) => ({
          id: item.id,
          name: item.displayName || item.name?.en || item.name,
          stockNumber: item.stockNumber,
          quantity: item.quantity,
          unit: item.unit,
          category: item.category,
          supplier: item.supplier,
          supplierCode: item.supplierCode,
          unitPrice: item.unitPrice,
          totalValue: item.totalValue,
          minQuantity: item.minQuantity || 0,
          maxQuantity: item.maxQuantity || 0,
          needsReorder: item.quantity <= (item.minQuantity || 0),
          // Enhanced location management fields
          locationSequence: item.locationSequence || index + 1,
          physicalCount:
            item.physicalCount !== undefined
              ? item.physicalCount
              : item.quantity,
          countingStatus: item.countingStatus || "pending", // pending, counted, discrepancy
          countDiscrepancy:
            item.physicalCount !== undefined &&
            item.physicalCount !== item.quantity
              ? item.physicalCount - item.quantity
              : 0,
          lastCounted: item.lastCounted || null,
          countedBy: item.countedBy || null,
          countingNotes: item.countingNotes || "",
        }))
        .sort((a, b) => a.locationSequence - b.locationSequence),
    });
  } catch (error) {
    console.error("Error fetching location inventory:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch location inventory",
    });
  }
});

// Update item sequence in location
app.put("/api/inventory/items/:id/sequence", authenticateToken, (req, res) => {
  try {
    const { id } = req.params;
    const { sequence, location } = req.body;

    const itemIndex = inventory.findIndex((item) => item.id == id);
    if (itemIndex === -1) {
      return res.status(404).json({
        success: false,
        error: "Item not found",
      });
    }

    // Validate sequence number
    if (!sequence || sequence < 1) {
      return res.status(400).json({
        success: false,
        error: "Sequence must be a positive number",
      });
    }

    // Update item sequence
    inventory[itemIndex].locationSequence = parseInt(sequence);
    inventory[itemIndex].lastModified = new Date().toISOString();

    res.json({
      success: true,
      message: "Item sequence updated successfully",
      item: {
        id: inventory[itemIndex].id,
        name:
          inventory[itemIndex].displayName ||
          inventory[itemIndex].name?.en ||
          inventory[itemIndex].name,
        locationSequence: inventory[itemIndex].locationSequence,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to update item sequence",
      details: error.message,
    });
  }
});

// Update physical count for item
app.put(
  "/api/inventory/items/:id/physical-count",
  authenticateToken,
  (req, res) => {
    try {
      const { id } = req.params;
      const { physicalCount, notes, countedBy } = req.body;

      const itemIndex = inventory.findIndex((item) => item.id == id);
      if (itemIndex === -1) {
        return res.status(404).json({
          success: false,
          error: "Item not found",
        });
      }

      // Validate physical count
      if (physicalCount === undefined || physicalCount < 0) {
        return res.status(400).json({
          success: false,
          error: "Physical count must be a non-negative number",
        });
      }

      const item = inventory[itemIndex];
      const originalQuantity = item.quantity;
      const newPhysicalCount = parseInt(physicalCount);

      // Update physical count fields
      item.physicalCount = newPhysicalCount;
      item.countingNotes = notes || "";
      item.countedBy = countedBy || "System";
      item.lastCounted = new Date().toISOString();

      // Determine counting status
      if (newPhysicalCount === originalQuantity) {
        item.countingStatus = "counted";
      } else {
        item.countingStatus = "discrepancy";
      }

      res.json({
        success: true,
        message: "Physical count updated successfully",
        item: {
          id: item.id,
          name: item.displayName || item.name?.en || item.name,
          originalQuantity,
          physicalCount: newPhysicalCount,
          discrepancy: newPhysicalCount - originalQuantity,
          countingStatus: item.countingStatus,
          lastCounted: item.lastCounted,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "Failed to update physical count",
        details: error.message,
      });
    }
  },
);

// Batch update physical counts for multiple items
app.post(
  "/api/inventory/location/:location/batch-count",
  authenticateToken,
  (req, res) => {
    try {
      const { location } = req.params;
      const { counts, countedBy } = req.body; // counts is array of {itemId, physicalCount, notes}

      if (!Array.isArray(counts) || counts.length === 0) {
        return res.status(400).json({
          success: false,
          error: "Counts array is required",
        });
      }

      const results = [];
      let successCount = 0;
      let failCount = 0;

      counts.forEach((countData) => {
        const { itemId, physicalCount, notes } = countData;
        const itemIndex = inventory.findIndex((item) => item.id == itemId);

        if (itemIndex === -1) {
          results.push({ itemId, success: false, error: "Item not found" });
          failCount++;
          return;
        }

        const item = inventory[itemIndex];
        const originalQuantity = item.quantity;
        const newPhysicalCount = parseInt(physicalCount);

        // Update physical count fields
        item.physicalCount = newPhysicalCount;
        item.countingNotes = notes || "";
        item.countedBy = countedBy || "System";
        item.lastCounted = new Date().toISOString();

        // Determine counting status
        if (newPhysicalCount === originalQuantity) {
          item.countingStatus = "counted";
        } else {
          item.countingStatus = "discrepancy";
        }

        results.push({
          itemId,
          success: true,
          discrepancy: newPhysicalCount - originalQuantity,
          status: item.countingStatus,
        });
        successCount++;
      });

      res.json({
        success: true,
        message: `Batch count update completed: ${successCount} successful, ${failCount} failed`,
        results,
        summary: {
          totalProcessed: counts.length,
          successful: successCount,
          failed: failCount,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "Failed to batch update counts",
        details: error.message,
      });
    }
  },
);

// Reorder items within a location
app.post(
  "/api/inventory/location/:location/reorder",
  authenticateToken,
  (req, res) => {
    try {
      const { location } = req.params;
      const { itemOrder } = req.body; // Array of {itemId, sequence}

      if (!Array.isArray(itemOrder) || itemOrder.length === 0) {
        return res.status(400).json({
          success: false,
          error: "Item order array is required",
        });
      }

      const results = [];
      let successCount = 0;
      let failCount = 0;

      itemOrder.forEach((orderData) => {
        const { itemId, sequence } = orderData;
        const itemIndex = inventory.findIndex((item) => item.id == itemId);

        if (itemIndex === -1) {
          results.push({ itemId, success: false, error: "Item not found" });
          failCount++;
          return;
        }

        // Update item sequence
        inventory[itemIndex].locationSequence = parseInt(sequence);
        inventory[itemIndex].lastModified = new Date().toISOString();

        results.push({
          itemId,
          success: true,
          newSequence: inventory[itemIndex].locationSequence,
        });
        successCount++;
      });

      res.json({
        success: true,
        message: `Item reordering completed: ${successCount} successful, ${failCount} failed`,
        results,
        summary: {
          totalProcessed: itemOrder.length,
          successful: successCount,
          failed: failCount,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "Failed to reorder items",
        details: error.message,
      });
    }
  },
);

// Find item by stock number for location assignment
app.get(
  "/api/inventory/find-by-stock/:stockNumber",
  authenticateToken,
  (req, res) => {
    try {
      const { stockNumber } = req.params;
      const item = inventory.find(
        (item) =>
          item.stockNumber === stockNumber ||
          item.supplierCode === stockNumber ||
          item.productCode === stockNumber,
      );

      if (!item) {
        return res.status(404).json({
          success: false,
          error: "Item not found with stock number: " + stockNumber,
        });
      }

      res.json({
        success: true,
        item: {
          id: item.id,
          name: item.displayName || item.name?.en || item.name,
          stockNumber: item.stockNumber,
          supplierCode: item.supplierCode,
          quantity: item.quantity,
          unit: item.unit,
          location: item.location,
          locations: item.locations || [],
          category: item.category,
          supplier: item.supplier,
        },
      });
    } catch (error) {
      console.error("Error finding item by stock number:", error);
      res.status(500).json({
        success: false,
        error: "Failed to find item",
      });
    }
  },
);

// Counting Mode Interface
app.get(
  "/api/inventory/counting-mode/:location",
  authenticateToken,
  (req, res) => {
    try {
      const { location } = req.params;
      const itemsInLocation = inventory.filter(
        (item) => item.location === location,
      );

      // Sort items for easier counting (by category, then name)
      itemsInLocation.sort((a, b) => {
        if (a.category !== b.category) {
          return a.category.localeCompare(b.category);
        }
        return a.name.en.localeCompare(b.name.en);
      });

      res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Counting Mode: ${location}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .counting-header { background: #2196F3; color: white; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
        .counting-item { background: white; margin: 10px 0; padding: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .item-name { font-weight: bold; font-size: 18px; }
        .item-details { color: #666; margin: 5px 0; }
        .count-input { width: 100px; padding: 8px; font-size: 16px; text-align: center; }
        .save-btn { background: #4CAF50; color: white; padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; }
        .save-btn:hover { background: #45a049; }
        .navigation { position: fixed; bottom: 20px; right: 20px; }
        .nav-btn { background: #FF9800; color: white; padding: 10px 20px; margin: 5px; border: none; border-radius: 4px; cursor: pointer; }
    </style>
</head>
<body>
    <div class="counting-header">
        <h1>📝 Counting Mode: ${location}</h1>
        <p>Count items in sequential order. Enter actual quantities found.</p>
        <p><strong>${itemsInLocation.length} items</strong> to count in this location</p>
    </div>
    
    ${itemsInLocation
      .map(
        (item, index) => `
        <div class="counting-item">
            <div class="item-name">${item.name.en}</div>
            <div class="item-details">
                Current: ${item.quantity} ${item.unit} | Code: ${item.supplierCode} | Category: ${item.category}
            </div>
            <div style="margin-top: 10px;">
                <label>Actual Count: </label>
                <input type="number" class="count-input" id="count_${item.id}" value="${item.quantity}" />
                <button class="save-btn" onclick="saveCount(${item.id})">✓ Update</button>
            </div>
        </div>
    `,
      )
      .join("")}
    
    <div class="navigation">
        <button class="nav-btn" onclick="saveAllCounts()">💾 Save All Counts</button>
        <button class="nav-btn" onclick="window.close()">✖ Close</button>
    </div>
    
    <script>
        const authToken = (new URLSearchParams(location.search)).get('token') || '';
        if (!authToken) console.warn('Counting mode: no auth token supplied via ?token=');
        
        async function saveCount(itemId) {
            const newCount = document.getElementById('count_' + itemId).value;
            const response = await fetch('/api/inventory/update-count', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + authToken,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    itemId: itemId,
                    newCount: parseInt(newCount)
                })
            });
            
            if (response.ok) {
                alert('Count updated!');
            } else {
                alert('Error updating count');
            }
        }
        
        async function saveAllCounts() {
            const updates = [];
            ${itemsInLocation
              .map(
                (item) => `
                updates.push({
                    itemId: ${item.id},
                    newCount: parseInt(document.getElementById('count_${item.id}').value)
                });
            `,
              )
              .join("")}
            
            // Implementation for batch update
            alert('All counts saved! (Feature in development)');
        }
    </script>
</body>
</html>
    `);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "Failed to generate counting interface",
      });
    }
  },
);

// AI Assistant Chat Endpoint
app.post("/api/ai/chat", authenticateToken, (req, res) => {
  try {
    const { message } = req.body;

    if (!message || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: "Message is required",
      });
    }

    const lowerMessage = message.toLowerCase();
    let response = "";

    if (
      lowerMessage.includes("move") ||
      lowerMessage.includes("reorganize") ||
      lowerMessage.includes("organize")
    ) {
      const misplacedCount = inventory.filter((item) => {
        const category = item.category?.toLowerCase() || "";
        const shouldBeInFreezer =
          category.includes("meat") || category.includes("frozen");
        const shouldBeInCooler =
          category.includes("dairy") || category.includes("produce");
        const isInWrongPlace =
          (shouldBeInFreezer && !item.location.includes("Freezer")) ||
          (shouldBeInCooler && !item.location.includes("Cooler"));
        return isInWrongPlace;
      }).length;

      if (misplacedCount > 0) {
        response = `🤖 I found ${misplacedCount} items that should be moved:\n\n`;
        inventory
          .filter((item) => {
            const category = item.category?.toLowerCase() || "";
            const shouldBeInFreezer =
              category.includes("meat") || category.includes("frozen");
            const shouldBeInCooler =
              category.includes("dairy") || category.includes("produce");
            const isInWrongPlace =
              (shouldBeInFreezer && !item.location.includes("Freezer")) ||
              (shouldBeInCooler && !item.location.includes("Cooler"));
            return isInWrongPlace;
          })
          .slice(0, 3)
          .forEach((item) => {
            const name = item.name?.en || item.name || "Unknown Item";
            const suggested = item.category?.toLowerCase().includes("meat")
              ? "Freezer A1"
              : item.category?.toLowerCase().includes("dairy")
                ? "Cooler B2"
                : "Cooler B3";
            response += `• Move "${name}" from ${item.location} to ${suggested}\n`;
          });
        response += "\nThis will improve food safety and organization!";
      } else {
        response = `🤖 Great news! All items are already in their optimal storage locations.`;
      }
    } else if (
      lowerMessage.includes("count") ||
      lowerMessage.includes("sheet") ||
      lowerMessage.includes("audit")
    ) {
      const locationCount = Object.keys(storageLocations).length;
      response = `🤖 I can generate count sheets for all ${locationCount} storage locations.\n\nEach sheet will include:\n• Items organized by category\n• Current quantities\n• Space for counted quantities\n• Discrepancy calculations\n\nUse the count sheets feature to generate printable sheets for each location.`;
    } else if (
      lowerMessage.includes("location") ||
      lowerMessage.includes("where")
    ) {
      response = `🤖 Here are your storage locations:\n\n`;
      Object.entries(storageLocations).forEach(([name, info]) => {
        const itemCount = inventory.filter(
          (item) => item.location === name,
        ).length;
        response += `• ${name} (${info.type}, ${info.temp}) - ${itemCount} items\n`;
      });
    } else if (
      lowerMessage.includes("capacity") ||
      lowerMessage.includes("space") ||
      lowerMessage.includes("full")
    ) {
      response = `🤖 Storage capacity overview:\n\n`;
      Object.entries(storageLocations).forEach(([name, info]) => {
        const utilization = ((info.currentUsage / info.capacity) * 100).toFixed(
          1,
        );
        const status = utilization > 90 ? "🔴" : utilization > 70 ? "🟡" : "🟢";
        response += `${status} ${name}: ${utilization}% full (${info.currentUsage}/${info.capacity})\n`;
      });
    } else {
      response = `🤖 I'm your inventory AI assistant! I can help you with:\n\n• 📦 Moving products to optimal locations\n• 📋 Generating count sheets for inventory audits\n• 📍 Finding where items are stored\n• 📊 Checking storage capacity and utilization\n\nTry asking: "Move products to proper locations" or "Generate count sheets"`;
    }

    res.json({
      success: true,
      response,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to process AI chat request",
      details: error.message,
    });
  }
});

// Generate count sheets for specific location
app.get("/api/ai/count-sheets/:location", authenticateToken, (req, res) => {
  try {
    const { location } = req.params;
    const locationItems = inventory.filter(
      (item) => item.location === location,
    );

    if (locationItems.length === 0) {
      return res.status(404).json({
        success: false,
        error: "No items found in this location",
      });
    }

    const locationInfo = storageLocations[location] || {
      type: "Unknown",
      temp: "N/A",
    };

    // Generate simple HTML for printing
    const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Count Sheet - ${location}</title>
    <style>
        body { font-family: Arial, sans-serif; font-size: 12px; }
        .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #000; padding-bottom: 10px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #000; padding: 8px; text-align: left; }
        th { background-color: #f0f0f0; }
        .count-box { width: 80px; height: 25px; border: 1px solid #000; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🏕️ INVENTORY COUNT SHEET</h1>
        <h2>${location}</h2>
        <p>Type: ${locationInfo.type} | Temperature: ${locationInfo.temp} | Date: ${new Date().toLocaleDateString()}</p>
    </div>
    <table>
        <thead>
            <tr><th>Item Name</th><th>Category</th><th>Current Qty</th><th>Counted Qty</th><th>Difference</th></tr>
        </thead>
        <tbody>
            ${locationItems
              .map(
                (item) => `
                <tr>
                    <td>${item.name?.en || item.name || "Unknown Item"}</td>
                    <td>${item.category || "N/A"}</td>
                    <td>${item.quantity} ${item.unit || "units"}</td>
                    <td><div class="count-box"></div></td>
                    <td><div class="count-box"></div></td>
                </tr>
            `,
              )
              .join("")}
        </tbody>
    </table>
    <div style="margin-top: 30px;">
        <p><strong>Counter:</strong> _________________________ <strong>Date:</strong> _________________________</p>
    </div>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html");
    res.send(html);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to generate count sheet",
      details: error.message,
    });
  }
});

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    service: "Complete Bilingual Inventory System",
    version: "3.0",
    features: {
      bilingual: true,
      syscoCatalog: syscoCatalog.length,
      gfsOrders: gfsOrders.length,
      storageLocations: Object.keys(storageLocations).length,
      inventoryItems: inventory.length,
    },
  });
});

// Main bilingual interface
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "professional-inventory.html"));
});

// Legacy embedded interface removed due to syntax conflicts

app.post(
  "/api/inventory/items/:id/allocate-locations",
  authenticateToken,
  (req, res) => {
    const id = req.params.id;
    const { allocations } = req.body; // [{location, qty}]
    const item = inventory.find((i) => String(i.id) === String(id));
    if (!item)
      return res.status(404).json({ success: false, error: "Item not found" });

    // validate locations
    for (const a of allocations) {
      if (!storageLocations[a.location]) {
        return res
          .status(400)
          .json({ success: false, error: `Invalid location ${a.location}` });
      }
    }
    // apply
    item.byLocation = item.byLocation || {};
    allocations.forEach(({ location, qty }) => {
      item.byLocation[location] = Math.max(0, parseInt(qty) || 0);
    });
    // remove zeros
    Object.keys(item.byLocation).forEach((loc) => {
      if (!item.byLocation[loc]) delete item.byLocation[loc];
    });
    // recompute
    item.locations = Object.keys(item.byLocation);
    item.location = item.locations[0] || item.location || "";
    item.quantity = Object.values(item.byLocation).reduce(
      (s, v) => s + (+v || 0),
      0,
    );
    item.lastModified = new Date().toISOString();

    // learn prefs
    recordAllocationPref(item.supplierCode || item.stockNumber, allocations);

    res.json({ success: true, item });
  },
);

// API: receive an order in one go (auto-suggest + ask when multi)
app.post("/api/orders/receive/:orderId", authenticateToken, (req, res) => {
  const { orderId } = req.params;
  const { decisions = [] } = req.body; // optional: [{stockNumber, allocations:[{location,qty}]}]

  const order = gfsOrders.find((o) => o.orderId === orderId);
  if (!order)
    return res.status(404).json({ success: false, error: "Order not found" });

  // build work list
  const items = (order.items || []).map((it) => {
    const code = it.productCode || it.itemCode;
    const qty = +it.quantity || 0;
    const name = it.productName || it.itemDescription || `Item ${code}`;
    const category = it.category || "Uncategorized";
    const pref = suggestAllocations(code, qty, category);
    return { stockNumber: code, name, qty, category, suggested: pref };
  });

  // apply decisions if provided
  const applied = [];
  for (const dec of decisions) {
    let inv = inventory.find((i) => i.supplierCode === dec.stockNumber);
    if (!inv) {
      // create an item if missing
      const sug = items.find((x) => x.stockNumber === dec.stockNumber) || {};
      const baseQty = dec.allocations.reduce((s, a) => s + (+a.qty || 0), 0);
      const firstLoc =
        dec.allocations[0]?.location || assignStorageLocation(sug.category);
      const newItem = {
        id: Date.now() + Math.random(),
        name: {
          en: sug.name || `Item ${dec.stockNumber}`,
          fr: sug.name || `Article ${dec.stockNumber}`,
        },
        supplierCode: dec.stockNumber,
        category: sug.category || "Uncategorized",
        unit: "each",
        supplier: "GFS",
        byLocation: {},
        locations: [],
        location: firstLoc,
        quantity: 0,
        minQuantity: Math.max(1, Math.floor(baseQty * 0.2)),
        maxQuantity: baseQty * 3,
        lastOrderDate: new Date().toISOString().slice(0, 10),
      };
      inventory.push(newItem);
      inv = newItem;
    }
    inv.byLocation = inv.byLocation || {};
    dec.allocations.forEach(({ location, qty }) => {
      inv.byLocation[location] =
        (inv.byLocation[location] || 0) + Math.max(0, parseInt(qty) || 0);
    });
    inv.locations = Object.keys(inv.byLocation);
    inv.location = inv.locations[0] || inv.location || "";
    inv.quantity = Object.values(inv.byLocation).reduce(
      (s, v) => s + (+v || 0),
      0,
    );
    inv.lastOrderDate = new Date().toISOString().slice(0, 10);

    recordAllocationPref(inv.supplierCode, dec.allocations);
    applied.push({
      stockNumber: inv.supplierCode,
      total: inv.quantity,
      byLocation: inv.byLocation,
    });
  }

  res.json({
    success: true,
    orderId,
    items, // has .suggested allocations per item
    applied, // what we actually applied (if decisions were sent)
  });
});

// API: get location preferences for a specific stock number
app.get("/api/location-preferences/:stock", authenticateToken, (req, res) => {
  res.json({
    success: true,
    stock: req.params.stock,
    prefs: locationPrefs[req.params.stock] || [],
  });
});

// Dev debug endpoint to confirm user bootstrap worked
if (!IS_PRODUCTION) {
  app.get("/api/debug/users-count", (_req, res) => {
    res.json({ count: users.length, emails: users.map((u) => u.email) });
  });
  
  // DEV ONLY: recreate admin (remove or protect in prod)
  app.post('/api/dev/reset-admin', async (_req, res) => {
    try {
      const email = process.env.ADMIN_BOOTSTRAP_EMAIL;
      const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
      if (!email || !password) return res.status(400).json({ success:false, error:'Missing ADMIN_BOOTSTRAP_* envs' });
      
      // Hash the password
      const passwordHash = await bcrypt.hash(password, 12);
      
      // Find existing user or create new
      const existingUserIndex = users.findIndex(u => u.email === email);
      const userData = {
        id: existingUserIndex >= 0 ? users[existingUserIndex].id : users.length + 1,
        email,
        name: "Admin",
        role: "admin",
        passwordHash,
        createdAt: new Date().toISOString(),
      };
      
      if (existingUserIndex >= 0) {
        users[existingUserIndex] = userData;
      } else {
        users.push(userData);
      }
      
      res.json({ success:true, email, message: 'Admin reset successfully' });
    } catch (e) {
      res.status(500).json({ success:false, error:'Failed to reset admin: ' + e.message });
    }
  });
}

// ========== TEST ENDPOINT ==========
app.get('/api/test-endpoint', (req, res) => {
  res.json({ success: true, message: 'Test endpoint works!' });
});

// ========== Stock Transfer (move qty between locations) ==========
// Note: Using simple validation instead of zod to avoid new dependencies
app.post('/api/inventory/transfer', authenticateToken, async (req, res) => {
  try {
    const { stockNumber, itemId, fromLocation, toLocation, quantity, reason, ordersContext, learningData } = req.body || {};
    const qtyNum = Number(quantity);
    
    // Validation
    if (!qtyNum || qtyNum <= 0 || !Number.isInteger(qtyNum)) {
      return res.status(400).json({ success: false, error: 'quantity must be a positive integer' });
    }
    if (!fromLocation || !toLocation) {
      return res.status(400).json({ success: false, error: 'fromLocation and toLocation are required' });
    }
    if (fromLocation === toLocation) {
      return res.status(400).json({ success: false, error: 'fromLocation and toLocation are identical' });
    }
    if (!storageLocations[fromLocation] || !storageLocations[toLocation]) {
      return res.status(404).json({ success: false, error: 'Unknown from/to location' });
    }

    // find item by itemId or supplierCode
    let item = null;
    if (itemId != null) {
      item = inventory.find(i => String(i.id) === String(itemId));
    } else if (stockNumber) {
      item = inventory.find(i => (i.supplierCode || '').toLowerCase() === stockNumber.toLowerCase());
    }
    if (!item) return res.status(404).json({ success: false, error: 'Item not found' });

    item.byLocation = item.byLocation || {};
    const available = Number(item.byLocation[fromLocation] || 0);
    if (available < qtyNum) {
      return res.status(400).json({ success: false, error: `Insufficient stock in ${fromLocation} (have ${available}, need ${qtyNum})` });
    }

    // apply move
    item.byLocation[fromLocation] = available - qtyNum;
    item.byLocation[toLocation] = Number(item.byLocation[toLocation] || 0) + qtyNum;

    // maintain locations array
    item.locations = Array.isArray(item.locations) ? item.locations : [];
    if (!item.locations.includes(toLocation)) item.locations.push(toLocation);
    if (item.byLocation[fromLocation] === 0) {
      // optionally remove empty location from list (keeps UI tidy)
      item.locations = item.locations.filter(l => l !== fromLocation);
    }

    // quantity (total) unchanged; nudge location usage if you track it
    if (storageLocations[fromLocation]) {
      storageLocations[fromLocation].currentUsage = Math.max(0, Number(storageLocations[fromLocation].currentUsage || 0) - qtyNum);
    }
    if (storageLocations[toLocation]) {
      storageLocations[toLocation].currentUsage = Math.max(0, Number(storageLocations[toLocation].currentUsage || 0) + qtyNum);
    }

    // AI Learning: Log the transfer for machine learning
    if (learningData) {
      const aiLearningEntry = {
        timestamp: new Date().toISOString(),
        action: 'stock_transfer',
        itemId: item.id,
        itemName: item.name?.en || item.name || 'Unknown',
        fromLocation,
        toLocation,
        quantity: qtyNum,
        reason: reason || 'Manual transfer',
        hasOrders: learningData.hasOrders || false,
        orderCount: learningData.orderCount || 0,
        suppliers: learningData.suppliers || [],
        peopleCount: learningData.peopleCount || null,
        userInitiated: true,
        ordersContext: ordersContext || []
      };
      
      // Log to console for now (could be saved to file or database later)
      console.log('🤖 AI Learning Data:', JSON.stringify(aiLearningEntry, null, 2));
      
      // TODO: In the future, save this to a learning database for AI training
      // await saveLearningData(aiLearningEntry);
    }

    return res.json({ 
      success: true, 
      itemId: item.id, 
      stockNumber: item.supplierCode, 
      fromLocation, 
      toLocation, 
      qty: qtyNum,
      learningLogged: !!learningData
    });
  } catch (e) {
    console.error('transfer error:', e);
    return res.status(500).json({ success: false, error: 'Failed to transfer stock' });
  }
});

// Smart Quantity Update with AI Learning
app.post('/api/inventory/update-quantity', authenticateToken, async (req, res) => {
  try {
    const { 
      itemId, 
      newQuantity, 
      reason, 
      newMin, 
      newMax, 
      includeInReordering, 
      previousQuantity, 
      aiLearningData 
    } = req.body || {};
    
    // Validation
    const qtyNum = Number(newQuantity);
    if (isNaN(qtyNum) || qtyNum < 0) {
      return res.status(400).json({ success: false, error: 'newQuantity must be a non-negative number' });
    }
    
    if (!itemId || !reason) {
      return res.status(400).json({ success: false, error: 'itemId and reason are required' });
    }
    
    // Find the item
    let item = inventory.find(i => String(i.id) === String(itemId));
    if (!item) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }
    
    // Store previous state for learning
    const previousState = {
      quantity: item.quantity,
      minQuantity: item.minQuantity,
      maxQuantity: item.maxQuantity,
      includeInReordering: item.includeInReordering
    };
    
    // Update item properties
    item.quantity = qtyNum;
    item.lastUpdated = new Date().toISOString();
    item.lastUpdateReason = reason;
    
    // Update min/max if provided
    if (newMin !== undefined && newMin >= 0) {
      item.minQuantity = Number(newMin);
    }
    if (newMax !== undefined && newMax >= 0) {
      item.maxQuantity = Number(newMax);
    }
    
    // Update auto-reordering preference
    item.includeInReordering = includeInReordering === 'yes';
    item.askBeforeReordering = includeInReordering === 'ask';
    
    // Update location quantities if item has locations
    if (item.byLocation && Object.keys(item.byLocation).length > 0) {
      // Distribute new quantity proportionally across existing locations
      const totalCurrentQty = Object.values(item.byLocation).reduce((sum, qty) => sum + (qty || 0), 0);
      
      if (totalCurrentQty > 0) {
        // Proportional distribution
        const ratio = qtyNum / totalCurrentQty;
        for (const location in item.byLocation) {
          item.byLocation[location] = Math.floor(item.byLocation[location] * ratio);
        }
        
        // Handle any rounding remainder
        const distributedTotal = Object.values(item.byLocation).reduce((sum, qty) => sum + qty, 0);
        const remainder = qtyNum - distributedTotal;
        if (remainder > 0) {
          const firstLocation = Object.keys(item.byLocation)[0];
          item.byLocation[firstLocation] += remainder;
        }
      } else if (qtyNum > 0) {
        // If all locations were at 0, put everything in the primary location
        const primaryLocation = item.location || item.locations?.[0] || 'Storage Room Dry Back';
        item.byLocation = { [primaryLocation]: qtyNum };
        if (!item.locations || !item.locations.includes(primaryLocation)) {
          item.locations = item.locations || [];
          item.locations.push(primaryLocation);
        }
      }
    }
    
    // AI Learning: Log the quantity adjustment for machine learning
    const learningEntry = {
      timestamp: new Date().toISOString(),
      action: aiLearningData?.action || 'quantity_adjustment',
      itemId: item.id,
      itemName: item.name?.en || item.name || 'Unknown',
      category: item.category || 'General',
      supplier: item.supplier || 'Unknown',
      previousQuantity: previousQuantity || previousState.quantity,
      newQuantity: qtyNum,
      quantityChange: qtyNum - (previousQuantity || previousState.quantity),
      reason: reason,
      minMaxChanges: {
        previousMin: previousState.minQuantity,
        newMin: item.minQuantity,
        acceptedMinSuggestion: aiLearningData?.userDecision?.acceptedMinSuggestion || false,
        previousMax: previousState.maxQuantity,
        newMax: item.maxQuantity,
        acceptedMaxSuggestion: aiLearningData?.userDecision?.acceptedMaxSuggestion || false
      },
      reorderingPreference: {
        previous: previousState.includeInReordering,
        new: item.includeInReordering,
        acceptedSuggestion: aiLearningData?.userDecision?.acceptedAutoReorder || false
      },
      ordersContext: aiLearningData?.ordersContext || [],
      userInitiated: true,
      isZeroOut: qtyNum === 0,
      isRestock: qtyNum > (previousQuantity || previousState.quantity),
      stockoutPattern: {
        wasOutOfStock: (previousQuantity || previousState.quantity) === 0,
        nowOutOfStock: qtyNum === 0,
        stockoutFrequency: await calculateStockoutFrequency(item.id)
      }
    };
    
    // Log to console for now (could be saved to file or database later)
    console.log('🤖 Quantity Adjustment AI Learning Data:', JSON.stringify(learningEntry, null, 2));
    
    // TODO: Save this learning data to a database for AI training
    // await saveLearningData(learningEntry);
    
    // Generate AI insights for the response
    const insights = generateStockAdjustmentInsights(learningEntry, item);
    
    res.json({ 
      success: true, 
      item: {
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        minQuantity: item.minQuantity,
        maxQuantity: item.maxQuantity,
        includeInReordering: item.includeInReordering
      },
      aiInsights: insights,
      learningLogged: true
    });
    
  } catch (e) {
    console.error('quantity update error:', e);
    return res.status(500).json({ success: false, error: 'Failed to update quantity' });
  }
});

// Helper function to calculate stockout frequency for AI learning
async function calculateStockoutFrequency(itemId) {
  // In a real implementation, this would query historical data
  // For now, return a placeholder that could be enhanced
  return {
    totalStockouts: 0, // Would count from historical data
    averageDaysBetweenStockouts: 0,
    lastStockoutDate: null,
    isFrequentStockout: false // Items that stock out more than once per month
  };
}

// Generate insights from stock adjustment for user feedback
function generateStockAdjustmentInsights(learningEntry, item) {
  const insights = [];
  
  if (learningEntry.isZeroOut) {
    insights.push("🤖 AI Learning: This stockout will help me better predict reorder timing");
    if (learningEntry.ordersContext.length > 0) {
      insights.push(`📊 Pattern detected: This item appears in ${learningEntry.ordersContext.length} recent orders`);
    }
  }
  
  if (learningEntry.isRestock && learningEntry.quantityChange > item.maxQuantity) {
    insights.push("📈 Notice: New stock exceeds max quantity - consider adjusting max");
  }
  
  if (!item.includeInReordering && learningEntry.ordersContext.length >= 2) {
    insights.push("💡 Suggestion: This item appears frequently in orders - consider enabling auto-reordering");
  }
  
  if (learningEntry.minMaxChanges.acceptedMinSuggestion && learningEntry.minMaxChanges.acceptedMaxSuggestion) {
    insights.push("✅ Thanks! Your acceptance of AI suggestions helps improve future recommendations");
  }
  
  return insights;
}

// ========== Smart Order Processing ==========

// Function to suggest optimal location for an item based on AI learning
function suggestOptimalLocation(item, existingLocations = [], options = {}) {
  const { peopleCount, orderQuantity } = options;
  const suggestions = [];
  
  // Get item's order history
  const itemOrders = getOrdersForItem(item);
  const orderCount = itemOrders.length;
  
  // Rule 1: High-frequency items (3+ orders) go to accessible locations
  if (orderCount >= 3) {
    let reason = `High-frequency item (${orderCount} orders) - needs accessible location`;
    if (peopleCount && orderQuantity) {
      const portionRatio = orderQuantity / peopleCount;
      reason += ` (${portionRatio.toFixed(1)} units per person)`;
    }
    suggestions.push({
      location: "Refrigerator Milk Yogourt ",
      reason: reason,
      confidence: 0.9
    });
  }
  
  // Rule 2: Temperature-sensitive items
  const itemName = (item.name?.en || item.name || '').toLowerCase();
  if (itemName.includes('milk') || itemName.includes('dairy') || itemName.includes('yogurt')) {
    let reason = "Dairy product - requires refrigeration";
    if (peopleCount && orderQuantity) {
      const portionRatio = orderQuantity / peopleCount;
      if (portionRatio > 2) reason += " (bulk order - consider secondary storage)";
    }
    suggestions.push({
      location: "Refrigerator Milk Yogourt ",
      reason: reason,
      confidence: 0.95
    });
  }
  
  if (itemName.includes('frozen') || itemName.includes('ice')) {
    suggestions.push({
      location: "40FT Freezer",
      reason: "Frozen product - requires freezer storage",
      confidence: 0.95
    });
  }
  
  // Rule 3: Dry goods to pantry
  if (itemName.includes('flour') || itemName.includes('rice') || itemName.includes('pasta') || itemName.includes('cereal')) {
    suggestions.push({
      location: "Main Pantry - Dry Storage",
      reason: "Dry goods - suitable for pantry storage",
      confidence: 0.8
    });
  }
  
  // Rule 4: If item already exists in locations, prefer consolidation
  if (existingLocations && existingLocations.length === 1) {
    suggestions.unshift({
      location: existingLocations[0],
      reason: "Consolidate with existing stock",
      confidence: 0.7
    });
  }
  
  // Default suggestion
  if (suggestions.length === 0) {
    suggestions.push({
      location: "Storage Room Dry Back",
      reason: "General storage location",
      confidence: 0.5
    });
  }
  
  return suggestions;
}

// Process new order and make intelligent placement decisions
app.post('/api/orders/process-new', authenticateToken, async (req, res) => {
  try {
    const { orderId, items = [], peopleCount } = req.body;
    
    if (!orderId || !items.length) {
      return res.status(400).json({ success: false, error: 'orderId and items array required' });
    }
    
    const placementResults = [];
    
    for (const orderItem of items) {
      // Find corresponding inventory item
      const inventoryItem = inventory.find(invItem => {
        const invName = (invItem.name?.en || invItem.name || '').toLowerCase();
        const orderName = (orderItem.productName || orderItem.name || '').toLowerCase();
        return invName.includes(orderName) || orderName.includes(invName);
      });
      
      if (inventoryItem) {
        // Get current locations for this item
        const currentLocations = Object.keys(inventoryItem.byLocation || {}).filter(loc => 
          inventoryItem.byLocation[loc] > 0
        );
        
        // Get AI suggestions
        const suggestions = suggestOptimalLocation(inventoryItem, currentLocations, {
          peopleCount: peopleCount ? Number(peopleCount) : null,
          orderQuantity: orderItem.quantity || 1
        });
        const topSuggestion = suggestions[0];
        
        const result = {
          itemId: inventoryItem.id,
          itemName: inventoryItem.name?.en || inventoryItem.name,
          orderQuantity: orderItem.quantity || 1,
          currentLocations: currentLocations,
          suggestions: suggestions,
          action: null
        };
        
        // Decision logic  
        if (topSuggestion.confidence >= 0.9) {
          // Auto-place with very high confidence
          result.action = 'auto_place';
          result.selectedLocation = topSuggestion.location;
          result.reason = topSuggestion.reason;
          
          // Actually update the inventory
          inventoryItem.byLocation = inventoryItem.byLocation || {};
          inventoryItem.byLocation[topSuggestion.location] = 
            (inventoryItem.byLocation[topSuggestion.location] || 0) + (orderItem.quantity || 1);
          
          // Update total quantity
          inventoryItem.quantity = (inventoryItem.quantity || 0) + (orderItem.quantity || 1);
          
          // Add to locations array if not present
          inventoryItem.locations = inventoryItem.locations || [];
          if (!inventoryItem.locations.includes(topSuggestion.location)) {
            inventoryItem.locations.push(topSuggestion.location);
          }
          
        } else {
          // Ask user for confirmation
          result.action = 'ask_user';
          result.reason = 'Multiple location options available - user input needed';
        }
        
        placementResults.push(result);
      } else {
        // New item not in inventory
        const suggestions = suggestOptimalLocation(
          { name: orderItem.productName || orderItem.name }, 
          [], 
          {
            peopleCount: peopleCount ? Number(peopleCount) : null,
            orderQuantity: orderItem.quantity || 1
          }
        );
        const topSuggestion = suggestions[0];
        
        const result = {
          itemName: orderItem.productName || orderItem.name,
          orderQuantity: orderItem.quantity || 1,
          suggestions: suggestions,
          action: null
        };
        
        if (topSuggestion.confidence >= 0.9) {
          // Auto-place new items with very high confidence (like frozen/dairy)
          result.action = 'auto_place';
          result.selectedLocation = topSuggestion.location;
          result.reason = `New item: ${topSuggestion.reason}`;
          
          // TODO: Create new inventory item and place it
          console.log(`🤖 Would auto-place new item "${result.itemName}" in ${result.selectedLocation}`);
        } else {
          result.action = 'ask_user';
          result.reason = 'New item - user input needed for location';
        }
        
        placementResults.push(result);
      }
    }
    
    // Log AI learning data
    console.log('🤖 Order Processing AI Decision Log:', JSON.stringify({
      timestamp: new Date().toISOString(),
      orderId,
      peopleCount: peopleCount ? Number(peopleCount) : null,
      totalItems: items.length,
      autoPlaced: placementResults.filter(r => r.action === 'auto_place').length,
      needsUserInput: placementResults.filter(r => r.action === 'ask_user').length,
      decisions: placementResults
    }, null, 2));
    
    res.json({
      success: true,
      orderId,
      placementResults,
      summary: {
        totalItems: placementResults.length,
        autoPlaced: placementResults.filter(r => r.action === 'auto_place').length,
        needsUserInput: placementResults.filter(r => r.action === 'ask_user').length
      }
    });
    
  } catch (error) {
    console.error('Order processing error:', error);
    res.status(500).json({ success: false, error: 'Failed to process order' });
  }
});

// ========== Manual/CSV Orders ==========

// Create a manual order (simple JSON form)
app.post('/api/orders/manual', authenticateToken, (req, res) => {
  try {
    const { supplier = 'Manual', orderId, orderDate, items = [], peopleCount } = req.body || {};
    
    // Validation
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'items array is required and must not be empty' });
    }
    
    // Validate each item
    for (const item of items) {
      if (!item.stockNumber || !item.qty || Number(item.qty) <= 0) {
        return res.status(400).json({ success: false, error: 'Each item must have stockNumber and positive qty' });
      }
    }

    const id = orderId || `MAN_${Date.now()}`;
    const date = orderDate || new Date().toISOString();

    const normalized = {
      orderId: id,
      orderDate: date,
      supplier: supplier,
      peopleCount: peopleCount ? Number(peopleCount) : null,
      items: items.map(it => ({
        productCode: it.stockNumber,
        productName: it.name || it.stockNumber,
        quantity: Number(it.qty),
        unit: it.unit || 'ea',
        category: it.category || 'General'
      }))
    };

    // Append to in-memory "gfsOrders" list for reuse of existing flows
    if (!Array.isArray(gfsOrders)) global.gfsOrders = [];
    gfsOrders.push(normalized);

    res.json({ success: true, orderId: id, totalItems: normalized.items.length });
  } catch (e) {
    console.error('manual order error:', e);
    return res.status(500).json({ success: false, error: 'Failed to create manual order' });
  }
});

// Quick CSV import (CSV: stockNumber,name,qty,unit,category)
app.post('/api/orders/import', authenticateToken, (req, res) => {
  try {
    const { supplier = 'Manual', csv = '', orderId, orderDate, peopleCount } = req.body || {};
    if (!csv || typeof csv !== 'string') return res.status(400).json({ success: false, error: 'csv string required' });

    const lines = csv.trim().split(/\r?\n/);
    const items = [];
    for (const line of lines) {
      const [stockNumber, name, qtyStr, unit, category] = line.split(',').map(s => (s ?? '').trim());
      const qty = Number(qtyStr || '0');
      if (!stockNumber || !qty) continue;
      items.push({ productCode: stockNumber, productName: name || stockNumber, quantity: qty, unit: unit || 'ea', category: category || 'General' });
    }
    if (!items.length) return res.status(400).json({ success: false, error: 'no valid items parsed from csv' });

    const id = orderId || `CSV_${Date.now()}`;
    const date = orderDate || new Date().toISOString();
    const normalized = { 
      orderId: id, 
      orderDate: date, 
      supplier, 
      items,
      peopleCount: peopleCount ? Number(peopleCount) : null
    };
    if (!Array.isArray(gfsOrders)) global.gfsOrders = [];
    gfsOrders.push(normalized);

    return res.json({ success: true, orderId: id, totalItems: items.length });
  } catch (e) {
    console.error('orders/import error:', e);
    return res.status(500).json({ success: false, error: 'Failed to import order' });
  }
});

// Global error handler
app.use((error, req, res, next) => {
  console.error("Global error handler:", error);
  res.status(500).json({
    success: false,
    error: "Internal server error",
  });
});

// Initialize server with all data loading
async function initializeServer() {
  try {
    console.log("🔄 Loading data...");

    // Load location preferences
    loadLocationPrefs();

    // Load storage locations from file
    loadStorageLocationsFromFile();

    // Load Sysco catalog
    try {
      const catalogPath = getDataPath(
        "catalog",
        "sysco_catalog_1753182965099.json",
      );
      const catalogData = await fs.readFile(catalogPath, "utf8");
      const catalogJson = JSON.parse(catalogData);
      syscoCatalog = catalogJson.items || [];
      console.log(`✅ Loaded Sysco catalog: ${syscoCatalog.length} items`);
    } catch (error) {
      console.log("⚠️ Sysco catalog not found, starting with empty catalog");
      syscoCatalog = [];
    }

    // Load GFS orders
    try {
      const gfsOrdersPath = getDataPath("gfs_orders");
      const gfsFiles = await fs.readdir(gfsOrdersPath);
      for (const file of gfsFiles) {
        if (
          file.startsWith("gfs_order_") &&
          !file.includes("deleted") &&
          file.endsWith(".json")
        ) {
          try {
            const orderData = await fs.readFile(
              path.join(gfsOrdersPath, file),
              "utf8",
            );
            const order = JSON.parse(orderData);
            gfsOrders.push(order);
          } catch (error) {
            console.log(`⚠️ Skipped corrupted file: ${file}`);
          }
        }
      }
      console.log(`✅ Loaded GFS orders: ${gfsOrders.length} orders`);
    } catch (error) {
      console.log(
        "⚠️ GFS orders directory not found, starting with empty orders",
      );
      gfsOrders = [];
    }

    // Generate full inventory AFTER data is loaded
    inventory = generateFullInventory();
    console.log(`✅ Generated full inventory: ${inventory.length} items`);

    // Initialize AI globals with current inventory data
    try {
      const inventoryGlobals = require("./routes/inventoryGlobals");
      inventoryGlobals.setInventoryReference(inventory);
      inventoryGlobals.setStorageLocationsReference(storageLocations);
      console.log("📦 Inventory globals module loaded successfully");
      console.log(`✅ Initialized AI optimization system`);

      // Register AI optimization routes AFTER data is loaded (BEFORE 404 handler)
      try {
        const aiRoutes = require("./routes/ai");
        console.log("🤖 AI routes module loaded successfully");
        // Set the JWT secret to match the main server
        aiRoutes.setJWTSecret(JWT_SECRET);
        console.log("🔐 AI routes JWT secret updated");
        app.use("/api/ai", aiRoutes);
        console.log(
          `✅ Registered AI optimization routes at /api/ai (with data)`,
        );

        // Add a direct test route to verify routing works
        app.get("/api/ai-test", (req, res) => {
          res.json({
            success: true,
            message: "Direct AI test route works!",
            inventoryCount: inventory.length,
          });
        });
        console.log(`✅ Added direct AI test route at /api/ai-test`);
      } catch (error) {
        console.error("❌ Error loading AI routes:", error);
      }
    } catch (error) {
      console.log("⚠️ AI modules not found, AI features disabled");
    }
  } catch (error) {
    console.log("⚠️ Some data files not found, using defaults");
  }
}

// Start server
async function startServer() {
  await initializeServer();

  // Menu routes
  try {
    const menuRoutes = require("./routes/menu");
    app.use("/api/menu", menuRoutes);
    console.log("✅ Menu routes registered");
  } catch (error) {
    console.log("⚠️ Menu routes not available:", error.message);
  }

  // 404 handler (MUST be last)
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      error: "Endpoint not found",
    });
  });
  console.log(`✅ Registered 404 handler (last)`);

  const server = app.listen(PORT, () => {
    console.log("\\n🏕️  COMPLETE BILINGUAL INVENTORY SYSTEM STARTED");
    console.log("✅ Features Active:");
    console.log(`   • Bilingual (English/French) interface`);
    console.log(`   • Sysco catalog: ${syscoCatalog.length} items loaded`);
    console.log(`   • GFS orders: ${gfsOrders.length} orders loaded`);
    console.log(`   • Full inventory: ${inventory.length} items total`);
    console.log("   • Storage locations: 11 locations tracked");
    console.log("   • All inventory items with locations");
    console.log("\\n📦 Server: http://localhost:" + PORT);
    console.log("🔐 Login: Configure credentials via environment variables");
    console.log("\\n🔒 PROPRIETARY SOFTWARE - © 2025 David Mikulis");
    console.log("⚠️  UNAUTHORIZED USE PROHIBITED\\n");
  });

  return server;
}

// Initialize and start the server
let server;
startServer()
  .then((s) => {
    server = s;
  })
  .catch(console.error);

process.on("SIGINT", () => {
  console.log("\\n🛑 Shutting down...");
  if (server) {
    server.close(() => {
      console.log("✅ System stopped");
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});

module.exports = app;
