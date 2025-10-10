const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// Enterprise validation and audit
const PhysicalCountValidator = require('../lib/PhysicalCountValidator');
const AuditLogger = require('../lib/AuditLogger');

const validator = new PhysicalCountValidator();
const auditLogger = new AuditLogger();

const DEMO_CONFIG_PATH = path.join(__dirname, '../data/demo_config.json');
const COUNT_HISTORY_PATH = path.join(__dirname, '../data/count_history.json');
const INVENTORY_PATH = path.join(__dirname, '../data/clean_recalculated_inventory.json');

// Helper: Load JSON file
function loadJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error(`Error loading ${filePath}:`, error.message);
    return null;
  }
}

// Helper: Save JSON file
function saveJSON(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error(`Error saving ${filePath}:`, error.message);
    return false;
  }
}

// GET /api/physical-count/config - Get demo config
router.get('/config', (req, res) => {
  const config = loadJSON(DEMO_CONFIG_PATH);
  if (!config) {
    return res.status(500).json({ error: 'Failed to load demo configuration' });
  }
  res.json(config);
});

// GET /api/physical-count/history - Get count history
router.get('/history', (req, res) => {
  const history = loadJSON(COUNT_HISTORY_PATH);
  if (!history) {
    return res.status(500).json({ error: 'Failed to load count history' });
  }
  res.json(history);
});

// GET /api/physical-count/locations - Get all locations
router.get('/locations', (req, res) => {
  const config = loadJSON(DEMO_CONFIG_PATH);
  if (!config) {
    return res.status(500).json({ error: 'Failed to load demo configuration' });
  }
  res.json(config.locations || []);
});

// GET /api/physical-count/current - Get current count in progress
router.get('/current', (req, res) => {
  const config = loadJSON(DEMO_CONFIG_PATH);
  if (!config) {
    return res.status(500).json({ error: 'Failed to load demo configuration' });
  }

  const currentCount = config.counts.secondCount;
  res.json(currentCount);
});

// POST /api/physical-count/start - Start a new count
router.post('/start', async (req, res) => {
  const { startDate, endDate, lastOrderDate, peopleOnSite } = req.body;
  const userId = req.user?.email || 'anonymous';
  const metadata = {
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    sessionId: req.sessionID || 'NO_SESSION'
  };

  try {
    // Basic validation
    if (!startDate || !endDate || !lastOrderDate || !peopleOnSite) {
      await auditLogger.logValidationFailure('COUNT_START', [
        { field: 'required', message: 'Missing required fields', code: 'MISSING_FIELDS' }
      ], req.body, metadata);

      return res.status(400).json({
        error: 'Missing required fields',
        required: ['startDate', 'endDate', 'lastOrderDate', 'peopleOnSite']
      });
    }

    const config = loadJSON(DEMO_CONFIG_PATH);
    if (!config) {
      return res.status(500).json({ error: 'Failed to load demo configuration' });
    }

    // Enterprise validation
    const validationResult = validator.validateCountStart(
      { startDate, endDate, lastOrderDate, peopleOnSite },
      config
    );

    // Log validation warnings
    if (validationResult.warnings.length > 0) {
      await auditLogger.logValidationWarning('COUNT_START', validationResult.warnings, req.body, metadata);
    }

    // If validation fails, log and return errors
    if (!validationResult.valid) {
      await auditLogger.logValidationFailure('COUNT_START', validationResult.errors, req.body, metadata);

      return res.status(400).json({
        error: 'Validation failed',
        errors: validationResult.errors,
        warnings: validationResult.warnings
      });
    }

    // Update second count with start information
    config.counts.secondCount = {
      countId: 'COUNT-002',
      status: 'IN_PROGRESS',
      startDate: startDate,
      endDate: endDate,
      lastOrderDate: lastOrderDate,
      peopleOnSite: parseInt(peopleOnSite),
      itemsCounted: 0,
      totalValue: 0,
      locationsCounted: [],
      items: [],
      startedBy: userId,
      startedAt: new Date().toISOString()
    };

    config.meta.updatedAt = new Date().toISOString();

    if (!saveJSON(DEMO_CONFIG_PATH, config)) {
      return res.status(500).json({ error: 'Failed to save configuration' });
    }

    // Audit log success
    await auditLogger.logCountStart(userId, config.counts.secondCount, metadata);

    res.json({
      success: true,
      message: 'Count started successfully',
      count: config.counts.secondCount,
      validation: {
        warnings: validationResult.warnings
      }
    });
  } catch (error) {
    console.error('Error starting count:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/physical-count/add-item - Add item to current count
router.post('/add-item', async (req, res) => {
  const { location, itemCode, itemName, quantity, unit, unitPrice, notes } = req.body;
  const userId = req.user?.email || 'anonymous';
  const metadata = {
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    sessionId: req.sessionID || 'NO_SESSION'
  };

  try {
    // Validate required fields
    if (!location || !itemCode || !itemName || quantity === undefined || !unit) {
      await auditLogger.logValidationFailure('ITEM_ADD', [
        { field: 'required', message: 'Missing required fields', code: 'MISSING_FIELDS' }
      ], req.body, metadata);

      return res.status(400).json({
        error: 'Missing required fields',
        required: ['location', 'itemCode', 'itemName', 'quantity', 'unit']
      });
    }

    const config = loadJSON(DEMO_CONFIG_PATH);
    if (!config) {
      return res.status(500).json({ error: 'Failed to load demo configuration' });
    }

    const currentCount = config.counts.secondCount;

    if (currentCount.status !== 'IN_PROGRESS') {
      return res.status(400).json({ error: 'No count in progress. Please start a count first.' });
    }

    // Initialize items array if it doesn't exist
    if (!currentCount.items) {
      currentCount.items = [];
    }

    // Calculate item value
    const itemQuantity = parseFloat(quantity);
    const price = unitPrice ? parseFloat(unitPrice) : 0;
    const totalValue = itemQuantity * price;

    const newItem = {
      location,
      itemCode,
      itemName,
      quantity: itemQuantity,
      unit,
      unitPrice: price,
      totalValue,
      notes: notes || '',
      addedAt: new Date().toISOString(),
      addedBy: userId
    };

    // Enterprise validation
    const validationResult = validator.validateItemAdd(newItem, currentCount, config);

    // Log validation warnings
    if (validationResult.warnings.length > 0) {
      await auditLogger.logValidationWarning('ITEM_ADD', validationResult.warnings, newItem, metadata);
    }

    // If validation fails, log and return errors
    if (!validationResult.valid) {
      await auditLogger.logValidationFailure('ITEM_ADD', validationResult.errors, newItem, metadata);

      return res.status(400).json({
        error: 'Validation failed',
        errors: validationResult.errors,
        warnings: validationResult.warnings
      });
    }

    // Add item
    currentCount.items.push(newItem);

    // Update location counted status
    if (!currentCount.locationsCounted.includes(location)) {
      currentCount.locationsCounted.push(location);

      // Mark location as counted
      const locationIndex = config.locations.findIndex(loc => loc.id === location);
      if (locationIndex !== -1) {
        config.locations[locationIndex].counted = true;
      }
    }

    // Update count totals
    currentCount.itemsCounted = currentCount.items.length;
    currentCount.totalValue = currentCount.items.reduce((sum, item) => sum + (item.totalValue || 0), 0);

    config.meta.updatedAt = new Date().toISOString();

    if (!saveJSON(DEMO_CONFIG_PATH, config)) {
      return res.status(500).json({ error: 'Failed to save item' });
    }

    // Audit log success
    await auditLogger.logItemAdd(userId, newItem, currentCount.countId, metadata);

    res.json({
      success: true,
      message: 'Item added successfully',
      item: newItem,
      count: {
        itemsCounted: currentCount.itemsCounted,
        totalValue: currentCount.totalValue,
        locationsCounted: currentCount.locationsCounted
      },
      validation: {
        warnings: validationResult.warnings
      }
    });
  } catch (error) {
    console.error('Error adding item:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/physical-count/items - Get all items in current count
router.get('/items', (req, res) => {
  const config = loadJSON(DEMO_CONFIG_PATH);
  if (!config) {
    return res.status(500).json({ error: 'Failed to load demo configuration' });
  }

  const currentCount = config.counts.secondCount;
  res.json({
    items: currentCount.items || [],
    itemsCounted: currentCount.itemsCounted || 0,
    totalValue: currentCount.totalValue || 0,
    locationsCounted: currentCount.locationsCounted || []
  });
});

// GET /api/physical-count/items/location/:locationId - Get items by location
router.get('/items/location/:locationId', (req, res) => {
  const { locationId } = req.params;

  const config = loadJSON(DEMO_CONFIG_PATH);
  if (!config) {
    return res.status(500).json({ error: 'Failed to load demo configuration' });
  }

  const currentCount = config.counts.secondCount;
  const items = (currentCount.items || []).filter(item => item.location === locationId);

  res.json({
    location: locationId,
    items: items,
    itemCount: items.length,
    totalValue: items.reduce((sum, item) => sum + (item.totalValue || 0), 0)
  });
});

// DELETE /api/physical-count/items/:index - Delete item from count
router.delete('/items/:index', (req, res) => {
  const itemIndex = parseInt(req.params.index);

  const config = loadJSON(DEMO_CONFIG_PATH);
  if (!config) {
    return res.status(500).json({ error: 'Failed to load demo configuration' });
  }

  const currentCount = config.counts.secondCount;

  if (!currentCount.items || itemIndex < 0 || itemIndex >= currentCount.items.length) {
    return res.status(404).json({ error: 'Item not found' });
  }

  // Remove item
  const deletedItem = currentCount.items.splice(itemIndex, 1)[0];

  // Update totals
  currentCount.itemsCounted = currentCount.items.length;
  currentCount.totalValue = currentCount.items.reduce((sum, item) => sum + (item.totalValue || 0), 0);

  // Check if location still has items
  const locationStillHasItems = currentCount.items.some(item => item.location === deletedItem.location);
  if (!locationStillHasItems) {
    currentCount.locationsCounted = currentCount.locationsCounted.filter(loc => loc !== deletedItem.location);

    // Mark location as not counted
    const locationIndex = config.locations.findIndex(loc => loc.id === deletedItem.location);
    if (locationIndex !== -1) {
      config.locations[locationIndex].counted = false;
    }
  }

  config.meta.updatedAt = new Date().toISOString();

  if (!saveJSON(DEMO_CONFIG_PATH, config)) {
    return res.status(500).json({ error: 'Failed to delete item' });
  }

  res.json({
    success: true,
    message: 'Item deleted successfully',
    deletedItem: deletedItem,
    count: {
      itemsCounted: currentCount.itemsCounted,
      totalValue: currentCount.totalValue,
      locationsCounted: currentCount.locationsCounted
    }
  });
});

// POST /api/physical-count/complete - Complete the current count
router.post('/complete', (req, res) => {
  const { notes, performedBy } = req.body;

  const config = loadJSON(DEMO_CONFIG_PATH);
  const history = loadJSON(COUNT_HISTORY_PATH);

  if (!config || !history) {
    return res.status(500).json({ error: 'Failed to load configuration files' });
  }

  const currentCount = config.counts.secondCount;

  if (currentCount.status !== 'IN_PROGRESS') {
    return res.status(400).json({ error: 'No count in progress' });
  }

  // Mark count as completed
  currentCount.status = 'COMPLETED';
  currentCount.completedAt = new Date().toISOString();
  if (notes) currentCount.notes = notes;
  if (performedBy) currentCount.performedBy = performedBy;

  // Add to history
  history.counts.push({
    countId: currentCount.countId,
    countDate: currentCount.endDate,
    startDate: currentCount.startDate,
    endDate: currentCount.endDate,
    lastOrderDateIncluded: currentCount.lastOrderDate,
    peopleOnSite: currentCount.peopleOnSite,
    status: 'COMPLETED',
    itemsCounted: currentCount.itemsCounted,
    totalValue: currentCount.totalValue,
    locationsCounted: currentCount.locationsCounted,
    notes: currentCount.notes || '',
    performedBy: currentCount.performedBy || [],
    completedAt: currentCount.completedAt,
    items: currentCount.items
  });

  // Update meta
  history.meta.totalCountsPerformed++;
  history.meta.lastCountDate = currentCount.endDate;

  // Prepare for next count
  history.nextCount = {
    countId: `COUNT-${String(history.meta.totalCountsPerformed + 1).padStart(3, '0')}`,
    status: 'READY',
    requiredFields: ['startDate', 'endDate', 'lastOrderDateIncluded', 'peopleOnSite', 'locationsCounted']
  };

  // Save both files
  if (!saveJSON(DEMO_CONFIG_PATH, config) || !saveJSON(COUNT_HISTORY_PATH, history)) {
    return res.status(500).json({ error: 'Failed to save count completion' });
  }

  res.json({
    success: true,
    message: 'Count completed successfully',
    count: currentCount,
    history: history
  });
});

// GET /api/physical-count/comparison - Compare first and second counts
router.get('/comparison', (req, res) => {
  const history = loadJSON(COUNT_HISTORY_PATH);
  if (!history) {
    return res.status(500).json({ error: 'Failed to load count history' });
  }

  if (history.counts.length < 2) {
    return res.status(400).json({ error: 'Need at least 2 counts to compare' });
  }

  const firstCount = history.counts[0];
  const secondCount = history.counts[1];

  const comparison = {
    firstCount: {
      countId: firstCount.countId,
      countDate: firstCount.countDate,
      itemsCounted: firstCount.itemsCounted,
      totalValue: firstCount.totalValue,
      locationsCounted: firstCount.locationsCounted
    },
    secondCount: {
      countId: secondCount.countId,
      countDate: secondCount.countDate,
      itemsCounted: secondCount.itemsCounted,
      totalValue: secondCount.totalValue,
      locationsCounted: secondCount.locationsCounted
    },
    differences: {
      itemCountDiff: secondCount.itemsCounted - firstCount.itemsCounted,
      valueDiff: secondCount.totalValue - firstCount.totalValue,
      valueDiffPercent: firstCount.totalValue > 0
        ? ((secondCount.totalValue - firstCount.totalValue) / firstCount.totalValue * 100).toFixed(2)
        : 'N/A'
    }
  };

  res.json(comparison);
});

module.exports = router;
