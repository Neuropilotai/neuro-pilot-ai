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
    locations: [
      { locationId: '1', quantity: 75 }
    ]
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
    locations: [
      { locationId: '2', quantity: 35 }
    ]
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
    locations: [
      { locationId: '3', quantity: 15 }
    ]
  }
];

let countSheets = [];
let orders = [];
let usageLogs = [];
let nextId = 4;

// Get all inventory items
router.get('/items', async (req, res) => {
  try {
    // Populate location data for demo
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

// Get items needing reorder
router.get('/items/reorder', async (req, res) => {
  try {
    const reorderItems = items.filter(item => item.currentQuantity <= item.reorderPoint);
    res.json(reorderItems);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new inventory item
router.post('/items', async (req, res) => {
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

// Update inventory item
router.put('/items/:id', async (req, res) => {
  try {
    const itemIndex = items.findIndex(item => item._id === req.params.id);
    if (itemIndex === -1) {
      return res.status(404).json({ error: 'Item not found' });
    }
    items[itemIndex] = { ...items[itemIndex], ...req.body, lastUpdated: Date.now() };
    res.json(items[itemIndex]);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get all locations
router.get('/locations', async (req, res) => {
  try {
    const activeLocations = locations.filter(loc => loc.isActive);
    res.json(activeLocations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new location
router.post('/locations', async (req, res) => {
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

// Get count sheet by location
router.get('/count-sheets/location/:locationId', async (req, res) => {
  try {
    const { date } = req.query;
    const query = { location: req.params.locationId };
    
    if (date) {
      const startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);
      query.date = { $gte: startDate, $lte: endDate };
    }
    
    const sheets = await CountSheet.find(query)
      .populate('location')
      .populate('items.inventoryItem')
      .sort('-date');
    
    res.json(sheets);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new count sheet
router.post('/count-sheets', async (req, res) => {
  try {
    const sheet = new CountSheet(req.body);
    await sheet.save();
    
    // Update inventory quantities based on count
    if (sheet.status === 'Completed') {
      for (const item of sheet.items) {
        await InventoryItem.findByIdAndUpdate(
          item.inventoryItem,
          { 
            currentQuantity: item.countedQuantity,
            lastUpdated: Date.now()
          }
        );
      }
    }
    
    res.status(201).json(sheet);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update count sheet
router.put('/count-sheets/:id', async (req, res) => {
  try {
    const sheet = await CountSheet.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    
    // Update inventory if sheet is completed
    if (req.body.status === 'Completed' && sheet) {
      sheet.completedAt = Date.now();
      await sheet.save();
      
      for (const item of sheet.items) {
        await InventoryItem.findByIdAndUpdate(
          item.inventoryItem,
          { 
            currentQuantity: item.countedQuantity,
            lastUpdated: Date.now()
          }
        );
      }
    }
    
    res.json(sheet);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get min/max report
router.get('/reports/min-max', async (req, res) => {
  try {
    const items = await InventoryItem.find();
    const report = items.map(item => ({
      name: item.name,
      category: item.category,
      currentQuantity: item.currentQuantity,
      minQuantity: item.minQuantity,
      maxQuantity: item.maxQuantity,
      status: item.currentQuantity < item.minQuantity ? 'Below Min' :
              item.currentQuantity > item.maxQuantity ? 'Above Max' : 'OK',
      orderQuantity: item.getOrderQuantity()
    }));
    
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create order from reorder items
router.post('/orders/generate', async (req, res) => {
  try {
    const { supplier } = req.body;
    const itemsToReorder = await InventoryItem.find({
      $expr: { $lte: ['$currentQuantity', '$reorderPoint'] },
      supplier: supplier || { $exists: true }
    });
    
    if (itemsToReorder.length === 0) {
      return res.json({ message: 'No items need reordering' });
    }
    
    const orderItems = itemsToReorder.map(item => ({
      inventoryItem: item._id,
      currentQuantity: item.currentQuantity,
      orderQuantity: item.getOrderQuantity(),
      unitPrice: 0
    }));
    
    const order = new Order({
      supplier: supplier || 'Multiple Suppliers',
      items: orderItems,
      createdBy: req.body.createdBy || 'System'
    });
    
    await order.save();
    res.status(201).json(order);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get all orders
router.get('/orders', async (req, res) => {
  try {
    const orders = await Order.find()
      .populate('items.inventoryItem')
      .sort('-orderDate');
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Log usage
router.post('/usage', async (req, res) => {
  try {
    const usage = new UsageLog(req.body);
    await usage.save();
    
    // Update inventory quantity
    const item = await InventoryItem.findById(usage.inventoryItem);
    if (usage.type === 'Usage') {
      item.currentQuantity -= usage.quantity;
    } else if (usage.type === 'Return') {
      item.currentQuantity += usage.quantity;
    }
    
    // Update location-specific quantity
    const locationIndex = item.locations.findIndex(
      loc => loc.locationId.toString() === usage.location.toString()
    );
    
    if (locationIndex >= 0) {
      if (usage.type === 'Usage') {
        item.locations[locationIndex].quantity -= usage.quantity;
      } else if (usage.type === 'Return') {
        item.locations[locationIndex].quantity += usage.quantity;
      }
    }
    
    await item.save();
    res.status(201).json(usage);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get usage history
router.get('/usage/:itemId', async (req, res) => {
  try {
    const usage = await UsageLog.find({ inventoryItem: req.params.itemId })
      .populate('location')
      .sort('-date');
    res.json(usage);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;