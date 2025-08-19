const express = require("express");
const jwt = require("jsonwebtoken");
const router = express.Router();

// Import from shared globals
const {
  inventory,
  assignStorageLocation,
  storageLocations,
} = require("./inventoryGlobals");

// Test route to verify AI routes are working
router.get("/test", (req, res) => {
  console.log("🧪 AI test route accessed!");
  res.json({
    success: true,
    message: "AI routes are working!",
    timestamp: new Date().toISOString(),
  });
});

console.log("🤖 AI routes module loaded successfully");

// JWT Secret - will be set by main server
let JWT_SECRET = process.env.JWT_SECRET || "default-secret";

// Function to set JWT secret from main server
function setJWTSecret(secret) {
  JWT_SECRET = secret;
  console.log("🔐 AI routes JWT secret updated");
}

// Authentication middleware (same as main server)
function authenticateToken(req, res, next) {
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
}

// 🔁 Optimize item locations using category-based logic
router.post("/optimize-locations", authenticateToken, (req, res) => {
  try {
    const changes = [];

    for (let item of inventory) {
      const suggested = assignStorageLocation(item.category || "");

      // Only suggest changes if the item isn't already in the optimal location
      if (item.location !== suggested) {
        changes.push({
          id: item.id,
          name: item.name?.en || item.name || "Unknown Item",
          oldLocation: item.location,
          newLocation: suggested,
          category: item.category,
        });

        // Apply the optimization
        item.location = suggested;

        // Update locations array for multiple location support
        if (!item.locations) {
          item.locations = [suggested];
        } else if (!item.locations.includes(suggested)) {
          // Remove old location and add new one
          item.locations = [suggested];
        }
      }
    }

    res.json({
      success: true,
      message: "Inventory locations optimized successfully.",
      totalChanged: changes.length,
      changes: changes,
      summary: {
        optimizedItems: changes.length,
        totalItems: inventory.length,
        optimizationRate:
          ((changes.length / inventory.length) * 100).toFixed(1) + "%",
      },
    });
  } catch (error) {
    console.error("Error optimizing locations:", error);
    res.status(500).json({
      success: false,
      error: "Failed to optimize locations",
      details: error.message,
    });
  }
});

// 📦 Suggest restocking orders for low inventory
router.post("/suggest-orders", authenticateToken, (req, res) => {
  try {
    const suggestions = inventory
      .filter((item) => item.quantity <= item.minQuantity)
      .map((item) => ({
        id: item.id,
        name: item.name?.en || item.name || "Unknown Item",
        supplier: item.supplier || "Unknown",
        currentQty: item.quantity || 0,
        minQty: item.minQuantity || 0,
        maxQty: item.maxQuantity || 0,
        suggestedQty: Math.ceil((item.maxQuantity || 1) * 0.75),
        location: item.location || "Unknown",
        locations: item.locations || [],
        category: item.category || "Uncategorized",
        unitPrice: item.unitPrice || 0,
        estimatedCost:
          Math.ceil((item.maxQuantity || 1) * 0.75) * (item.unitPrice || 0),
        urgency:
          item.quantity === 0
            ? "Critical"
            : item.quantity <= item.minQuantity * 0.5
              ? "High"
              : "Medium",
        supplierCode: item.supplierCode || "N/A",
        lastOrderDate: item.lastOrderDate || "Unknown",
      }))
      .sort((a, b) => {
        // Sort by urgency: Critical > High > Medium
        const urgencyOrder = { Critical: 3, High: 2, Medium: 1 };
        return urgencyOrder[b.urgency] - urgencyOrder[a.urgency];
      });

    // Calculate summary statistics
    const totalCost = suggestions.reduce(
      (sum, item) => sum + item.estimatedCost,
      0,
    );
    const supplierBreakdown = suggestions.reduce((acc, item) => {
      acc[item.supplier] = (acc[item.supplier] || 0) + 1;
      return acc;
    }, {});

    const urgencyBreakdown = suggestions.reduce((acc, item) => {
      acc[item.urgency] = (acc[item.urgency] || 0) + 1;
      return acc;
    }, {});

    res.json({
      success: true,
      message: "Restock suggestions generated successfully.",
      total: suggestions.length,
      suggestions: suggestions,
      summary: {
        totalItems: suggestions.length,
        estimatedTotalCost: totalCost.toFixed(2),
        supplierBreakdown: supplierBreakdown,
        urgencyBreakdown: urgencyBreakdown,
        averageItemCost:
          suggestions.length > 0
            ? (totalCost / suggestions.length).toFixed(2)
            : "0.00",
      },
    });
  } catch (error) {
    console.error("Error generating restock suggestions:", error);
    res.status(500).json({
      success: false,
      error: "Failed to generate restock suggestions",
      details: error.message,
    });
  }
});

// 📊 Get inventory analytics and insights
router.get("/analytics", authenticateToken, (req, res) => {
  try {
    // Calculate storage utilization
    const storageUtilization = Object.entries(storageLocations).map(
      ([name, info]) => {
        const itemsInLocation = inventory.filter(
          (item) =>
            item.location === name ||
            (item.locations && item.locations.includes(name)),
        ).length;

        return {
          location: name,
          type: info.type,
          capacity: info.capacity,
          currentUsage: info.currentUsage,
          itemCount: itemsInLocation,
          utilizationPercent: (
            (info.currentUsage / info.capacity) *
            100
          ).toFixed(1),
        };
      },
    );

    // Category distribution
    const categoryDistribution = inventory.reduce((acc, item) => {
      const category = item.category || "Uncategorized";
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    }, {});

    // Low stock alerts
    const lowStockItems = inventory.filter(
      (item) => item.quantity <= item.minQuantity,
    ).length;
    const outOfStockItems = inventory.filter(
      (item) => item.quantity === 0,
    ).length;

    // Value analysis
    const totalInventoryValue = inventory.reduce(
      (sum, item) => sum + (item.quantity || 0) * (item.unitPrice || 0),
      0,
    );

    // Supplier analysis
    const supplierAnalysis = inventory.reduce((acc, item) => {
      const supplier = item.supplier || "Unknown";
      if (!acc[supplier]) {
        acc[supplier] = { itemCount: 0, totalValue: 0 };
      }
      acc[supplier].itemCount += 1;
      acc[supplier].totalValue += (item.quantity || 0) * (item.unitPrice || 0);
      return acc;
    }, {});

    res.json({
      success: true,
      analytics: {
        overview: {
          totalItems: inventory.length,
          totalValue: totalInventoryValue.toFixed(2),
          lowStockItems: lowStockItems,
          outOfStockItems: outOfStockItems,
          storageLocations: Object.keys(storageLocations).length,
        },
        storageUtilization: storageUtilization,
        categoryDistribution: categoryDistribution,
        supplierAnalysis: supplierAnalysis,
        alerts: {
          lowStock: lowStockItems,
          outOfStock: outOfStockItems,
          overCapacity: storageUtilization.filter(
            (loc) => parseFloat(loc.utilizationPercent) > 90,
          ).length,
        },
      },
    });
  } catch (error) {
    console.error("Error generating analytics:", error);
    res.status(500).json({
      success: false,
      error: "Failed to generate analytics",
      details: error.message,
    });
  }
});

// 🎯 Smart location recommendations for new items
router.post("/recommend-location", authenticateToken, (req, res) => {
  try {
    const { category, itemName, quantity = 1 } = req.body;

    if (!category) {
      return res.status(400).json({
        success: false,
        error: "Category is required for location recommendation",
      });
    }

    const primaryLocation = assignStorageLocation(category);

    // Get utilization of primary location
    const locationInfo = storageLocations[primaryLocation];
    const utilizationPercent = locationInfo
      ? (locationInfo.currentUsage / locationInfo.capacity) * 100
      : 0;

    // Suggest alternative locations if primary is over 85% capacity
    const alternatives = [];
    if (utilizationPercent > 85) {
      // Find similar storage types with lower utilization
      const primaryType = locationInfo?.type;
      Object.entries(storageLocations).forEach(([name, info]) => {
        if (name !== primaryLocation && info.type === primaryType) {
          const altUtilization = (info.currentUsage / info.capacity) * 100;
          if (altUtilization < 80) {
            alternatives.push({
              location: name,
              type: info.type,
              utilization: altUtilization.toFixed(1) + "%",
              availableCapacity: info.capacity - info.currentUsage,
            });
          }
        }
      });
    }

    res.json({
      success: true,
      recommendation: {
        primaryLocation: primaryLocation,
        category: category,
        itemName: itemName || "Unknown Item",
        locationInfo: {
          type: locationInfo?.type || "Unknown",
          temp: locationInfo?.temp || "Unknown",
          utilization: utilizationPercent.toFixed(1) + "%",
          availableCapacity: locationInfo
            ? locationInfo.capacity - locationInfo.currentUsage
            : 0,
        },
        alternatives: alternatives,
        recommendation:
          alternatives.length > 0
            ? `Primary location (${primaryLocation}) is ${utilizationPercent.toFixed(1)}% utilized. Consider alternatives.`
            : `${primaryLocation} is optimal for this item.`,
      },
    });
  } catch (error) {
    console.error("Error generating location recommendation:", error);
    res.status(500).json({
      success: false,
      error: "Failed to generate location recommendation",
      details: error.message,
    });
  }
});

module.exports = router;
module.exports.setJWTSecret = setJWTSecret;
