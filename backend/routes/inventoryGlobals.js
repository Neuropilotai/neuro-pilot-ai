/**
 * Shared inventory globals for AI optimization features
 * Centralizes access to inventory data and functions
 */

// Import the main inventory system functions and data
// Note: This will be populated by the main server when it starts
let inventory = [];
let storageLocations = {};

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

// Function to update inventory reference (called by main server)
function setInventoryReference(inventoryRef) {
  inventory = inventoryRef;
}

// Function to update storage locations reference (called by main server)
function setStorageLocationsReference(storageRef) {
  storageLocations = storageRef;
}

// Default storage locations structure
const defaultStorageLocations = {
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

// Initialize storage locations if not set
if (Object.keys(storageLocations).length === 0) {
  storageLocations = defaultStorageLocations;
}

console.log("📦 Inventory globals module loaded successfully");

module.exports = {
  get inventory() {
    return inventory;
  },
  get storageLocations() {
    return storageLocations;
  },
  assignStorageLocation,
  setInventoryReference,
  setStorageLocationsReference,
  defaultStorageLocations,
};
