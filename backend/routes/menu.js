const express = require("express");
const router = express.Router();
const { MenuItem, WeeklyMenu } = require("../models/menu");
const fs = require("fs").promises;
const path = require("path");

// Get all menu items
router.get("/items", async (req, res) => {
  try {
    const items = await MenuItem.find().sort({ category: 1, name: 1 });
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get menu item by ID
router.get("/items/:id", async (req, res) => {
  try {
    const item = await MenuItem.findById(req.params.id).populate(
      "ingredients.itemId",
    );
    if (!item) {
      return res.status(404).json({ error: "Menu item not found" });
    }
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new menu item
router.post("/items", async (req, res) => {
  try {
    const item = new MenuItem(req.body);
    await item.save();
    res.status(201).json(item);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update menu item
router.put("/items/:id", async (req, res) => {
  try {
    const item = await MenuItem.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!item) {
      return res.status(404).json({ error: "Menu item not found" });
    }
    res.json(item);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Delete menu item
router.delete("/items/:id", async (req, res) => {
  try {
    const item = await MenuItem.findByIdAndDelete(req.params.id);
    if (!item) {
      return res.status(404).json({ error: "Menu item not found" });
    }
    res.json({ message: "Menu item deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all weekly menus
router.get("/weekly", async (req, res) => {
  try {
    const menus = await WeeklyMenu.find().sort({ weekNumber: -1 }).limit(10);
    res.json(menus);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get weekly menu by week number
router.get("/weekly/:weekNumber", async (req, res) => {
  try {
    const menu = await WeeklyMenu.findOne({
      weekNumber: req.params.weekNumber,
    }).populate("dailyMenus.items.menuItem");
    if (!menu) {
      return res.status(404).json({ error: "Weekly menu not found" });
    }
    res.json(menu);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new weekly menu
router.post("/weekly", async (req, res) => {
  try {
    const menu = new WeeklyMenu(req.body);
    await menu.save();
    res.status(201).json(menu);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update weekly menu
router.put("/weekly/:id", async (req, res) => {
  try {
    const menu = await WeeklyMenu.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!menu) {
      return res.status(404).json({ error: "Weekly menu not found" });
    }
    res.json(menu);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Load menu from JSON file (for initial data import)
router.post("/import-json", async (req, res) => {
  try {
    const { filename } = req.body;
    const filePath = path.join(__dirname, "../data/menus", filename);

    const data = await fs.readFile(filePath, "utf8");
    const menuData = JSON.parse(data);

    // Transform the JSON data into menu items and weekly menu structure
    const menuItems = [];
    const dailyMenus = [];

    for (const [day, dayData] of Object.entries(menuData.days)) {
      const dayMenu = {
        day: day,
        mealType: menuData.mealType,
        items: [],
      };

      // Process main dishes
      if (dayData.mainDishes) {
        for (const dish of dayData.mainDishes) {
          const existingItem = menuItems.find((item) => item.name === dish);
          if (!existingItem) {
            menuItems.push({
              name: dish,
              category: "Main",
              nameEn: dish,
              nameFr: dish, // Would need translation
            });
          }
          dayMenu.items.push({
            menuItem: dish,
            category: "Main",
            plannedServings: 200, // Default for camp size
          });
        }
      }

      // Process sides
      if (dayData.sides) {
        for (const side of dayData.sides) {
          const existingItem = menuItems.find((item) => item.name === side);
          if (!existingItem) {
            menuItems.push({
              name: side,
              category: "Side",
              nameEn: side,
              nameFr: side,
            });
          }
          dayMenu.items.push({
            menuItem: side,
            category: "Side",
            plannedServings: 200,
          });
        }
      }

      // Process other categories similarly...
      dailyMenus.push(dayMenu);
    }

    res.json({
      message: "Menu data parsed successfully",
      menuItems: menuItems.length,
      dailyMenus: dailyMenus.length,
      data: { menuItems, dailyMenus },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get current week's menu
router.get("/current", async (req, res) => {
  try {
    const today = new Date();
    const menu = await WeeklyMenu.findOne({
      startDate: { $lte: today },
      endDate: { $gte: today },
      status: "Active",
    }).populate("dailyMenus.items.menuItem");

    if (!menu) {
      return res.status(404).json({ error: "No active menu for current week" });
    }

    res.json(menu);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get menu for specific date
router.get("/date/:date", async (req, res) => {
  try {
    const date = new Date(req.params.date);
    const dayName = date.toLocaleDateString("en-US", { weekday: "long" });

    const menu = await WeeklyMenu.findOne({
      startDate: { $lte: date },
      endDate: { $gte: date },
      status: "Active",
    }).populate("dailyMenus.items.menuItem");

    if (!menu) {
      return res.status(404).json({ error: "No menu found for this date" });
    }

    const dayMenu = menu.dailyMenus.find((dm) => dm.day === dayName);
    if (!dayMenu) {
      return res.status(404).json({ error: "No menu for this day" });
    }

    res.json({
      date: date,
      day: dayName,
      weekNumber: menu.weekNumber,
      menu: dayMenu,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
