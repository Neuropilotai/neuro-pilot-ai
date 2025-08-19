const mongoose = require("mongoose");

const inventoryItemSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    category: {
      type: String,
      required: true,
      enum: [
        "Meat",
        "Dairy",
        "Produce",
        "Grains",
        "Canned",
        "Frozen",
        "Beverages",
        "Condiments",
        "Supplies",
        "Other",
      ],
    },
    unit: {
      type: String,
      required: true,
      enum: [
        "lbs",
        "kg",
        "oz",
        "g",
        "gallons",
        "liters",
        "each",
        "cases",
        "boxes",
      ],
    },
    currentQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },
    minQuantity: {
      type: Number,
      required: true,
      min: 0,
    },
    maxQuantity: {
      type: Number,
      required: true,
      min: 0,
    },
    reorderPoint: {
      type: Number,
      required: true,
      min: 0,
    },
    unitCost: {
      type: Number,
      min: 0,
    },
    supplier: {
      type: String,
      enum: ["Sysco", "GFS", "US Foods", "Other"],
    },
    locations: [
      {
        locationId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "StorageLocation",
          required: true,
        },
        quantity: {
          type: Number,
          required: true,
          min: 0,
        },
      },
    ],
    lastUpdated: {
      type: Date,
      default: Date.now,
    },
    createdBy: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

// Update lastUpdated on save
inventoryItemSchema.pre("save", function (next) {
  this.lastUpdated = new Date();
  next();
});

// Calculate total quantity from locations
inventoryItemSchema.methods.calculateTotalQuantity = function () {
  this.currentQuantity = this.locations.reduce((total, location) => {
    return total + location.quantity;
  }, 0);
  return this.currentQuantity;
};

// Check if item needs reordering
inventoryItemSchema.methods.needsReorder = function () {
  return this.currentQuantity <= this.reorderPoint;
};

// Get status based on quantity levels
inventoryItemSchema.virtual("status").get(function () {
  if (this.currentQuantity <= 0) {
    return "Out of Stock";
  } else if (this.currentQuantity <= this.reorderPoint) {
    return "Reorder Needed";
  } else if (this.currentQuantity <= this.minQuantity) {
    return "Low Stock";
  } else {
    return "In Stock";
  }
});

module.exports = mongoose.model("InventoryItem", inventoryItemSchema);
