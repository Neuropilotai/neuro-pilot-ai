const mongoose = require("mongoose");

const menuItemSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  nameEn: String,
  nameFr: String,
  category: {
    type: String,
    enum: [
      "Main",
      "Side",
      "Healthy Option",
      "South Asian Cuisine",
      "Vegetarian",
      "Salad",
      "Dessert",
    ],
    required: true,
  },
  ingredients: [
    {
      itemId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "InventoryItem",
      },
      quantity: Number,
      unit: String,
    },
  ],
  servingSize: {
    quantity: Number,
    unit: String,
  },
  nutritionalInfo: {
    calories: Number,
    protein: Number,
    carbs: Number,
    fat: Number,
    fiber: Number,
  },
  allergens: [String],
  dietaryRestrictions: [
    {
      type: String,
      enum: [
        "Vegetarian",
        "Vegan",
        "Gluten-Free",
        "Halal",
        "Kosher",
        "Dairy-Free",
        "Nut-Free",
      ],
    },
  ],
  preparationTime: Number, // in minutes
  cookingInstructions: String,
});

const dailyMenuSchema = new mongoose.Schema({
  day: {
    type: String,
    enum: [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ],
    required: true,
  },
  mealType: {
    type: String,
    enum: ["Breakfast", "Lunch", "Supper"],
    required: true,
  },
  items: [
    {
      menuItem: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "MenuItem",
      },
      category: String,
      plannedServings: Number,
    },
  ],
});

const weeklyMenuSchema = new mongoose.Schema(
  {
    weekNumber: {
      type: Number,
      required: true,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    location: {
      type: String,
      default: "TSMC CAMP",
    },
    dailyMenus: [dailyMenuSchema],
    notes: String,
    createdBy: String,
    approvedBy: String,
    status: {
      type: String,
      enum: ["Draft", "Approved", "Active", "Archived"],
      default: "Draft",
    },
  },
  {
    timestamps: true,
  },
);

// Indexes
menuItemSchema.index({ name: 1 });
menuItemSchema.index({ category: 1 });
weeklyMenuSchema.index({ weekNumber: 1, startDate: 1 });
weeklyMenuSchema.index({ status: 1 });

const MenuItem = mongoose.model("MenuItem", menuItemSchema);
const WeeklyMenu = mongoose.model("WeeklyMenu", weeklyMenuSchema);

module.exports = {
  MenuItem,
  WeeklyMenu,
};
