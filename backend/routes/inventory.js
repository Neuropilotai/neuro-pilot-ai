const express = require("express");
const router = express.Router();

// Mock data for inventory items
let inventoryItems = [
  {
    _id: "1",
    name: "Ground Beef",
    category: "Meat",
    unit: "lbs",
    currentQuantity: 50,
    minQuantity: 10,
    maxQuantity: 100,
    reorderPoint: 15,
    locations: [
      { locationId: { _id: "freezer1", name: "Main Freezer" }, quantity: 30 },
      {
        locationId: { _id: "freezer2", name: "Secondary Freezer" },
        quantity: 20,
      },
    ],
  },
  {
    _id: "2",
    name: "Chicken Breast",
    category: "Meat",
    unit: "lbs",
    currentQuantity: 25,
    minQuantity: 8,
    maxQuantity: 80,
    reorderPoint: 12,
    locations: [
      { locationId: { _id: "freezer1", name: "Main Freezer" }, quantity: 25 },
    ],
  },
  {
    _id: "3",
    name: "Rice",
    category: "Grains",
    unit: "lbs",
    currentQuantity: 100,
    minQuantity: 20,
    maxQuantity: 200,
    reorderPoint: 30,
    locations: [
      { locationId: { _id: "pantry1", name: "Main Pantry" }, quantity: 100 },
    ],
  },
];

let locations = [
  { _id: "freezer1", name: "Main Freezer", type: "Freezer" },
  { _id: "freezer2", name: "Secondary Freezer", type: "Freezer" },
  { _id: "fridge1", name: "Main Refrigerator", type: "Refrigerator" },
  { _id: "pantry1", name: "Main Pantry", type: "Pantry" },
  { _id: "storage1", name: "Dry Storage", type: "Storage" },
];

let usageHistory = [];
let countSheets = [];

// Get all inventory items
router.get("/items", (req, res) => {
  res.json(inventoryItems);
});

// Get all locations
router.get("/locations", (req, res) => {
  res.json(locations);
});

// Update item quantity
router.put("/items/:id", (req, res) => {
  const { id } = req.params;
  const { quantity, locationId } = req.body;

  const item = inventoryItems.find((i) => i._id === id);
  if (!item) {
    return res.status(404).json({ error: "Item not found" });
  }

  if (locationId) {
    const location = item.locations.find(
      (l) => l.locationId._id === locationId,
    );
    if (location) {
      location.quantity = quantity;
    }
  }

  // Recalculate total quantity
  item.currentQuantity = item.locations.reduce(
    (sum, loc) => sum + loc.quantity,
    0,
  );

  res.json(item);
});

// Record usage
router.post("/usage", (req, res) => {
  const { inventoryItem, location, quantity, type, takenBy, reason } = req.body;

  const item = inventoryItems.find((i) => i._id === inventoryItem);
  if (!item) {
    return res.status(404).json({ error: "Item not found" });
  }

  // Find location and update quantity
  const itemLocation = item.locations.find(
    (l) => l.locationId._id === location,
  );
  if (itemLocation && itemLocation.quantity >= quantity) {
    itemLocation.quantity -= quantity;
    item.currentQuantity -= quantity;

    // Record usage in history
    const usageRecord = {
      inventoryItem: item._id,
      itemName: item.name,
      location: locations.find((l) => l._id === location),
      quantity,
      type: type || "Usage",
      takenBy,
      reason,
      date: new Date(),
    };

    usageHistory.push(usageRecord);

    res.json({ success: true, message: "Usage recorded successfully" });
  } else {
    res.status(400).json({ error: "Insufficient quantity at location" });
  }
});

// Get usage history for an item
router.get("/usage/:itemId", (req, res) => {
  const { itemId } = req.params;
  const history = usageHistory.filter((u) => u.inventoryItem === itemId);
  res.json(history);
});

// Submit count sheet
router.post("/count-sheets", (req, res) => {
  const { location, countedBy, status, items } = req.body;

  const countSheet = {
    _id: Date.now().toString(),
    location: locations.find((l) => l._id === location),
    countedBy,
    status,
    items,
    date: new Date(),
  };

  // Update inventory based on count
  items.forEach((countItem) => {
    const item = inventoryItems.find((i) => i._id === countItem.inventoryItem);
    if (item) {
      const locationData = item.locations.find(
        (l) => l.locationId._id === location,
      );
      if (locationData) {
        locationData.quantity = countItem.countedQuantity;
        // Recalculate total
        item.currentQuantity = item.locations.reduce(
          (sum, loc) => sum + loc.quantity,
          0,
        );
      }
    }
  });

  countSheets.push(countSheet);
  res.json({ success: true, countSheet });
});

// Get count sheets
router.get("/count-sheets", (req, res) => {
  res.json(countSheets);
});

// Get analytics/reports
router.get("/analytics", (req, res) => {
  const lowStockItems = inventoryItems.filter(
    (item) => item.currentQuantity <= item.reorderPoint,
  );
  const totalItems = inventoryItems.length;
  const totalValue = inventoryItems.reduce(
    (sum, item) => sum + item.currentQuantity * 10,
    0,
  ); // Mock price

  res.json({
    lowStockItems,
    totalItems,
    totalValue,
    lowStockCount: lowStockItems.length,
    recentUsage: usageHistory.slice(-10),
  });
});

// Generate min/max report
router.get("/reports/min-max", (req, res) => {
  const report = inventoryItems.map((item) => ({
    name: item.name,
    category: item.category,
    currentQuantity: item.currentQuantity,
    minQuantity: item.minQuantity,
    maxQuantity: item.maxQuantity,
    reorderPoint: item.reorderPoint,
    status:
      item.currentQuantity <= item.reorderPoint
        ? "Reorder Needed"
        : item.currentQuantity <= item.minQuantity
          ? "Low Stock"
          : "Normal",
    suggestedOrder:
      item.currentQuantity <= item.reorderPoint
        ? item.maxQuantity - item.currentQuantity
        : 0,
  }));

  res.json(report);
});

// Add new item
router.post("/items", (req, res) => {
  const newItem = {
    _id: Date.now().toString(),
    ...req.body,
    currentQuantity: 0,
    locations: [],
  };

  inventoryItems.push(newItem);
  res.json(newItem);
});

// Delete item
router.delete("/items/:id", (req, res) => {
  const { id } = req.params;
  const index = inventoryItems.findIndex((i) => i._id === id);

  if (index === -1) {
    return res.status(404).json({ error: "Item not found" });
  }

  inventoryItems.splice(index, 1);
  res.json({ success: true });
});

module.exports = router;
