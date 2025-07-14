const express = require('express');
const router = express.Router();

// In-memory storage for demo mode
let locations = [
  { _id: '1', name: 'Main Freezer', code: 'FRZ01', type: 'Freezer', isActive: true },
  { _id: '2', name: 'Walk-in Cooler', code: 'COL01', type: 'Cooler', isActive: true },
  { _id: '3', name: 'Dry Storage', code: 'DRY01', type: 'Dry Storage', isActive: true }
];

let items = [
  {
    _id: '1',
    name: 'Ground Beef',
    category: 'Food',
    unit: 'Pound',
    minQuantity: 50,
    maxQuantity: 200,
    currentQuantity: 75,
    reorderPoint: 60,
    locations: [{ locationId: '1', quantity: 75 }]
  },
  {
    _id: '2', 
    name: 'Milk',
    category: 'Beverage',
    unit: 'Gallon',
    minQuantity: 20,
    maxQuantity: 100,
    currentQuantity: 35,
    reorderPoint: 25,
    locations: [{ locationId: '2', quantity: 35 }]
  },
  {
    _id: '3',
    name: 'Bread',
    category: 'Food', 
    unit: 'Loaf',
    minQuantity: 30,
    maxQuantity: 120,
    currentQuantity: 15,
    reorderPoint: 25,
    locations: [{ locationId: '3', quantity: 15 }]
  }
];

let countSheets = [];
let orders = [];
let usageLogs = [];
let nextId = 4;

// Camp settings
let campSettings = {
  currentOccupancy: 250,
  maxCapacity: 400,
  rotationSchedule: '2 on 2 off',
  orderingCycle: '1 week',
  lastUpdated: new Date(),
  updatedBy: 'Camp Manager'
};

// Get all inventory items
router.get('/items', (req, res) => {
  try {
    const populatedItems = items.map(item => ({
      ...item,
      locations: item.locations.map(loc => ({
        ...loc,
        locationId: locations.find(l => l._id === loc.locationId) || { _id: loc.locationId, name: 'Unknown' }
      }))
    }));
    res.json(populatedItems);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new inventory item
router.post('/items', (req, res) => {
  try {
    const item = {
      _id: String(nextId++),
      ...req.body,
      locations: req.body.locations || []
    };
    items.push(item);
    res.status(201).json(item);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get all locations
router.get('/locations', (req, res) => {
  try {
    const activeLocations = locations.filter(loc => loc.isActive);
    res.json(activeLocations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new location
router.post('/locations', (req, res) => {
  try {
    const location = {
      _id: String(nextId++),
      ...req.body,
      isActive: true
    };
    locations.push(location);
    res.status(201).json(location);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Submit count sheet
router.post('/count-sheets', (req, res) => {
  try {
    const countSheet = {
      _id: String(nextId++),
      ...req.body,
      date: new Date()
    };
    
    countSheets.push(countSheet);
    
    // Update inventory quantities if completed
    if (req.body.status === 'Completed' && req.body.items) {
      req.body.items.forEach(countItem => {
        const itemIndex = items.findIndex(item => item._id === countItem.inventoryItem);
        if (itemIndex >= 0) {
          items[itemIndex].currentQuantity = countItem.countedQuantity;
          items[itemIndex].lastUpdated = Date.now();
        }
      });
    }
    
    res.status(201).json(countSheet);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Record usage
router.post('/usage', (req, res) => {
  try {
    const usage = {
      _id: String(nextId++),
      ...req.body,
      date: new Date()
    };
    
    usageLogs.push(usage);
    
    // Update inventory quantity
    const itemIndex = items.findIndex(item => item._id === usage.inventoryItem);
    if (itemIndex >= 0) {
      if (usage.type === 'Usage') {
        items[itemIndex].currentQuantity -= usage.quantity;
      } else if (usage.type === 'Return') {
        items[itemIndex].currentQuantity += usage.quantity;
      }
      
      // Update location-specific quantity
      const locationIndex = items[itemIndex].locations.findIndex(
        loc => loc.locationId === usage.location
      );
      
      if (locationIndex >= 0) {
        if (usage.type === 'Usage') {
          items[itemIndex].locations[locationIndex].quantity -= usage.quantity;
        } else if (usage.type === 'Return') {
          items[itemIndex].locations[locationIndex].quantity += usage.quantity;
        }
      }
    }
    
    res.status(201).json(usage);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get min/max report
router.get('/reports/min-max', (req, res) => {
  try {
    const report = items.map(item => ({
      name: item.name,
      category: item.category,
      currentQuantity: item.currentQuantity,
      minQuantity: item.minQuantity,
      maxQuantity: item.maxQuantity,
      status: item.currentQuantity < item.minQuantity ? 'Below Min' :
              item.currentQuantity > item.maxQuantity ? 'Above Max' : 'OK',
      orderQuantity: Math.max(0, item.maxQuantity - item.currentQuantity)
    }));
    
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Generate order
router.post('/orders/generate', (req, res) => {
  try {
    const itemsToReorder = items.filter(item => item.currentQuantity <= item.reorderPoint);
    
    if (itemsToReorder.length === 0) {
      return res.json({ message: 'No items need reordering' });
    }
    
    const orderItems = itemsToReorder.map(item => ({
      inventoryItem: item,
      currentQuantity: item.currentQuantity,
      orderQuantity: Math.max(0, item.maxQuantity - item.currentQuantity),
      unitPrice: 0,
      totalPrice: 0
    }));
    
    const order = {
      _id: String(nextId++),
      orderNumber: `ORD-${Date.now()}`,
      orderDate: new Date(),
      supplier: req.body.supplier || 'Multiple Suppliers',
      status: 'Draft',
      items: orderItems,
      totalAmount: 0,
      createdBy: req.body.createdBy || 'System'
    };
    
    orders.push(order);
    res.status(201).json(order);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get all orders
router.get('/orders', (req, res) => {
  try {
    res.json(orders.sort((a, b) => new Date(b.orderDate) - new Date(a.orderDate)));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create manual order from import
router.post('/orders/manual', (req, res) => {
  try {
    const orderItems = req.body.items.filter(item => item.inventoryItem);
    
    if (orderItems.length === 0) {
      return res.json({ message: 'No matching items found in inventory' });
    }
    
    const order = {
      _id: String(nextId++),
      orderNumber: `IMP-${Date.now()}`,
      orderDate: new Date(),
      supplier: req.body.supplier || 'Imported Order',
      status: 'Draft',
      items: orderItems,
      totalAmount: orderItems.reduce((sum, item) => sum + item.totalPrice, 0),
      createdBy: req.body.createdBy || 'Order Import'
    };
    
    orders.push(order);
    res.status(201).json(order);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get camp settings
router.get('/settings', (req, res) => {
  try {
    res.json(campSettings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update camp settings
router.put('/settings', (req, res) => {
  try {
    campSettings = {
      ...campSettings,
      ...req.body,
      lastUpdated: new Date()
    };
    res.json(campSettings);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get consumption recommendations based on occupancy
router.get('/consumption-calc/:itemId', (req, res) => {
  try {
    const item = items.find(i => i._id === req.params.itemId);
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    const { days = 7 } = req.query;
    const people = campSettings.currentOccupancy;
    
    // Basic consumption estimates (can be customized per item type)
    let dailyPerPerson = 0;
    
    switch (item.category) {
      case 'Food':
        if (item.name.toLowerCase().includes('beef')) dailyPerPerson = 0.25; // 1/4 lb per person
        else if (item.name.toLowerCase().includes('bread')) dailyPerPerson = 0.5; // 1/2 loaf per person
        else dailyPerPerson = 0.1; // default
        break;
      case 'Beverage':
        if (item.name.toLowerCase().includes('milk')) dailyPerPerson = 0.02; // ~1/50 gallon per person
        else dailyPerPerson = 0.05; // default
        break;
      default:
        dailyPerPerson = 0.05;
    }
    
    const totalNeeded = people * dailyPerPerson * days;
    const currentStock = item.currentQuantity;
    const recommendation = {
      itemName: item.name,
      currentOccupancy: people,
      daysPlanned: days,
      estimatedDailyUsage: Math.round(people * dailyPerPerson * 100) / 100,
      totalNeededForPeriod: Math.round(totalNeeded * 100) / 100,
      currentStock: currentStock,
      shortfall: Math.max(0, Math.round((totalNeeded - currentStock) * 100) / 100),
      daysRemaining: currentStock > 0 ? Math.round((currentStock / (people * dailyPerPerson)) * 10) / 10 : 0,
      status: totalNeeded > currentStock ? 'NEEDS_ORDER' : 'SUFFICIENT'
    };
    
    res.json(recommendation);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;