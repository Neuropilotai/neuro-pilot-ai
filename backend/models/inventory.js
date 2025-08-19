const mongoose = require("mongoose");

const inventoryItemSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      required: true,
      enum: ["Food", "Beverage", "Supplies", "Cleaning", "Equipment", "Other"],
    },
    unit: {
      type: String,
      required: true,
      enum: ["Each", "Box", "Case", "Pound", "Kilogram", "Liter", "Gallon"],
    },
    minQuantity: {
      type: Number,
      required: true,
      default: 0,
    },
    maxQuantity: {
      type: Number,
      required: true,
      default: 100,
    },
    currentQuantity: {
      type: Number,
      required: true,
      default: 0,
    },
    reorderPoint: {
      type: Number,
      required: true,
      default: 10,
    },
    supplier: {
      type: String,
      trim: true,
    },
    lastUpdated: {
      type: Date,
      default: Date.now,
    },
    locations: [
      {
        locationId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Location",
        },
        quantity: {
          type: Number,
          default: 0,
        },
      },
    ],
  },
  {
    timestamps: true,
  },
);

inventoryItemSchema.methods.needsReorder = function () {
  return this.currentQuantity <= this.reorderPoint;
};

inventoryItemSchema.methods.getOrderQuantity = function () {
  return this.maxQuantity - this.currentQuantity;
};

module.exports = mongoose.model("InventoryItem", inventoryItemSchema);
