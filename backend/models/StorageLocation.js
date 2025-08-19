const mongoose = require("mongoose");

const storageLocationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    type: {
      type: String,
      required: true,
      enum: [
        "Freezer",
        "Refrigerator",
        "Pantry",
        "Storage",
        "Dry Storage",
        "Walk-in Cooler",
        "Other",
      ],
    },
    description: {
      type: String,
      trim: true,
    },
    capacity: {
      type: Number,
      min: 0,
    },
    temperature: {
      min: Number,
      max: Number,
      unit: {
        type: String,
        enum: ["F", "C"],
        default: "F",
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    building: {
      type: String,
      trim: true,
    },
    floor: {
      type: String,
      trim: true,
    },
    zone: {
      type: String,
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
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

// Index for efficient queries
storageLocationSchema.index({ name: 1, isActive: 1 });

module.exports = mongoose.model("StorageLocation", storageLocationSchema);
