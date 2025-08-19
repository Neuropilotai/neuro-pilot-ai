require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");

const app = express();

// Security Middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "ws:", "wss:"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
);

// Rate limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
});

app.use(generalLimiter);

// CORS middleware
app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);

app.use(express.json());
// Remove static middleware to control which files are served

// Skip database initialization for inventory-only mode
console.log("Database initialization skipped - using in-memory data");
console.log("MongoDB connection skipped - using in-memory data");

// Simple inventory-only routes (no external auth requirements)
app.get("/api/inventory/items", (req, res) => {
  try {
    // Define inventory items
    const items = [
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
      },
    ];

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

// Mock auth routes (minimal for inventory access)
app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body;

  // Simple auth for inventory access
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

// Mock auth refresh endpoint (returns 501 Not Implemented)
app.post("/api/auth/refresh", (req, res) => {
  res
    .status(501)
    .json({ error: "Auth refresh not implemented in inventory-only mode" });
});

// Storage/locations routes
let locations = [
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
    id: "freezer2",
    name: "Secondary Freezer",
    type: "frozen",
    description: "Backup cold storage",
    itemCount: 8,
    capacity: 300,
    temp: "-18°C",
    zone: "Kitchen",
    building: "Main Lodge",
    createdBy: "System",
    utilizationPercent: "26.7",
    availableSpace: 220,
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
  {
    id: "storage1",
    name: "Dry Storage",
    type: "general",
    description: "Non-perishable items",
    itemCount: 35,
    capacity: 800,
    temp: "Room temperature",
    zone: "Storage",
    building: "Main Lodge",
    createdBy: "System",
    utilizationPercent: "43.8",
    availableSpace: 450,
  },
];

// GET all locations
app.get("/api/locations", (req, res) => {
  res.json({
    success: true,
    locations: locations,
    totalLocations: locations.length,
  });
});

// POST new location
app.post("/api/locations", (req, res) => {
  const { name, type, description, capacity, temp, zone, building } = req.body;

  if (!name || !type) {
    return res.status(400).json({ error: "Name and type are required" });
  }

  const newLocation = {
    id: Date.now().toString(),
    name: name.trim(),
    type: type || "general",
    description: description || "",
    capacity: parseInt(capacity) || 100,
    temp: temp || "Room temperature",
    zone: zone || "General",
    building: building || "Main Lodge",
    itemCount: 0,
    createdBy: "User",
    createdDate: new Date().toISOString(),
    lastModified: new Date().toISOString(),
    utilizationPercent: "0.0",
    availableSpace: parseInt(capacity) || 100,
  };

  locations.push(newLocation);

  res.json({
    success: true,
    location: newLocation,
    message: "Location added successfully",
  });
});

// PUT update location
app.put("/api/locations/:id", (req, res) => {
  const { id } = req.params;
  const { name, type, description, capacity, temp, zone, building } = req.body;

  const locationIndex = locations.findIndex((loc) => loc.id === id);
  if (locationIndex === -1) {
    return res.status(404).json({ error: "Location not found" });
  }

  // Update the location
  locations[locationIndex] = {
    ...locations[locationIndex],
    name: name || locations[locationIndex].name,
    type: type || locations[locationIndex].type,
    description: description || locations[locationIndex].description,
    capacity: capacity ? parseInt(capacity) : locations[locationIndex].capacity,
    temp: temp || locations[locationIndex].temp,
    zone: zone || locations[locationIndex].zone,
    building: building || locations[locationIndex].building,
    lastModified: new Date().toISOString(),
    availableSpace: capacity
      ? parseInt(capacity) -
        (locations[locationIndex].capacity -
          locations[locationIndex].availableSpace)
      : locations[locationIndex].availableSpace,
  };

  res.json({
    success: true,
    location: locations[locationIndex],
    message: "Location updated successfully",
  });
});

// DELETE location
app.delete("/api/locations/:id", (req, res) => {
  const { id } = req.params;

  const locationIndex = locations.findIndex((loc) => loc.id === id);
  if (locationIndex === -1) {
    return res.status(404).json({ error: "Location not found" });
  }

  // Check if location has items (in a real system)
  if (locations[locationIndex].itemCount > 0) {
    return res.status(400).json({
      error: `Cannot delete location with ${locations[locationIndex].itemCount} items. Move items first.`,
    });
  }

  const deletedLocation = locations.splice(locationIndex, 1)[0];

  res.json({
    success: true,
    message: `Location "${deletedLocation.name}" deleted successfully`,
  });
});

// Keep the original /api/storage/locations working and remove auth requirements
app.get("/api/storage/locations", (req, res) => {
  res.json({
    success: true,
    locations: locations,
    totalLocations: locations.length,
  });
});

app.post("/api/storage/locations", (req, res) => {
  const { name, type, description, capacity, temp, zone, building } = req.body;

  if (!name || !type) {
    return res.status(400).json({ error: "Name and type are required" });
  }

  const newLocation = {
    id: Date.now().toString(),
    name: name.trim(),
    type: type || "general",
    description: description || "",
    capacity: parseInt(capacity) || 100,
    temp: temp || "Room temperature",
    zone: zone || "General",
    building: building || "Main Lodge",
    itemCount: 0,
    createdBy: "User",
    createdDate: new Date().toISOString(),
    lastModified: new Date().toISOString(),
    utilizationPercent: "0.0",
    availableSpace: parseInt(capacity) || 100,
  };

  locations.push(newLocation);

  res.json({
    success: true,
    location: newLocation,
    message: "Location added successfully",
  });
});

// Orders routes (mock data for inventory)
app.get("/api/orders/gfs", (req, res) => {
  res.json({
    orders: [
      {
        orderId: "GFS_2024_001",
        orderDate: new Date().toISOString(),
        supplier: "GFS",
        itemCount: 25,
        totalValue: "1250.00",
        items: [],
      },
      {
        orderId: "GFS_2024_002",
        orderDate: new Date(Date.now() - 86400000).toISOString(),
        supplier: "GFS",
        itemCount: 18,
        totalValue: "980.50",
        items: [],
      },
    ],
    totalOrders: 2,
  });
});

// Transfers routes (mock)
app.get("/api/transfers", (req, res) => {
  res.json({
    transfers: [
      {
        id: 1,
        date: new Date().toISOString(),
        fromLocation: "Main Freezer",
        toLocation: "Main Refrigerator",
        itemName: "Chicken Breast",
        quantity: 10,
        status: "completed",
      },
    ],
  });
});

// Receiving endpoint
app.post("/api/orders/receive/:orderId", (req, res) => {
  const { orderId } = req.params;
  const { decisions } = req.body;

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
        {
          stockNumber: "GFS002",
          name: "Chicken Breast",
          qty: 40,
          suggested: [{ location: "Main Freezer", qty: 40 }],
        },
      ],
    });
  } else {
    // Apply decisions
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

// AI Chat endpoint (simple mock)
app.post("/api/ai/chat", (req, res) => {
  const { message } = req.body;

  // Simple responses for inventory queries
  let response = "I can help with inventory management. ";

  if (message.toLowerCase().includes("low stock")) {
    response =
      "Current low stock items: Ground Beef (15 lbs), Chicken Breast (8 lbs). Consider reordering soon.";
  } else if (message.toLowerCase().includes("location")) {
    response =
      "We have 5 storage locations: Main Freezer, Secondary Freezer, Main Refrigerator, Main Pantry, and Dry Storage.";
  } else if (message.toLowerCase().includes("capacity")) {
    response =
      "Storage capacity overview:\n- Main Freezer: 60% full\n- Main Pantry: 40% full\n- Dry Storage: 45% full";
  } else {
    response +=
      "Try asking about 'low stock items', 'storage locations', or 'capacity overview'.";
  }

  res.json({ success: true, response });
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    service: "inventory-management",
    timestamp: new Date().toISOString(),
  });
});

// Root route - serve the professional inventory HTML interface
app.get("/", (req, res) => {
  // Make sure we're serving the right file
  const htmlPath = path.join(
    __dirname,
    "../public/professional-inventory.html",
  );
  console.log("Serving HTML from:", htmlPath);
  res.sendFile(htmlPath);
});

// Serve the professional inventory HTML
app.get("/inventory", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/professional-inventory.html"));
});

// Serve favicon (prevent 404 errors)
app.get("/favicon.ico", (req, res) => {
  res.status(204).end(); // No content - prevents 404
});

const PORT = process.env.PORT || 8083;
app.listen(PORT, () => {
  console.log(`\n🎯 INVENTORY-ONLY SERVER RUNNING`);
  console.log(`📦 Port: ${PORT}`);
  console.log(`🌐 Access at: http://localhost:${PORT}`);
  console.log(`📊 Professional UI: http://localhost:${PORT}/inventory`);
  console.log(`\n✅ Trading components DISABLED`);
  console.log(`✅ Inventory system ACTIVE`);
  console.log(`\nLogin credentials:`);
  console.log(`Email: admin@secure-inventory.dev`);
  console.log(`Password: SecurePass123!\n`);
});
