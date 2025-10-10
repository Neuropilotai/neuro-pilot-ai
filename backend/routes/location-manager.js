/**
 * Enhanced Location Management System
 * Features:
 * - Add items by stock number (supplier code)
 * - Set sequencing for items in locations
 * - Assign same item to multiple locations
 * - Bilingual support (EN/FR)
 */

const express = require('express');
const router = express.Router();
const { authRequired } = require('../middleware/auth');
const fs = require('fs').promises;
const path = require('path');

// Get data path based on environment
function getDataPath(...paths) {
  const IS_PRODUCTION = process.env.NODE_ENV === 'production';
  if (IS_PRODUCTION) {
    return path.join('/data', ...paths);
  }
  return path.join(__dirname, '..', 'data', ...paths);
}

// Load inventory data
async function loadInventory() {
  try {
    const inventoryPath = getDataPath('inventory', 'master_inventory.json');
    const data = await fs.readFile(inventoryPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading inventory:', error);
    return [];
  }
}

// Load location assignments
async function loadLocationAssignments() {
  try {
    const locPath = getDataPath('inventory', 'location_assignments.json');
    const data = await fs.readFile(locPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    // File doesn't exist yet, return empty object
    return {};
  }
}

// Save location assignments
async function saveLocationAssignments(assignments) {
  const locPath = getDataPath('inventory', 'location_assignments.json');
  await fs.writeFile(locPath, JSON.stringify(assignments, null, 2));
}

// Add item to location by stock number
router.post('/add-by-stock-number', authRequired, async (req, res) => {
  try {
    const { stockNumber, locationId, sequence = 999, quantity = 1 } = req.body;
    
    if (!stockNumber || !locationId) {
      return res.status(400).json({
        success: false,
        error: 'Stock number and location ID are required',
        error_fr: 'Le numéro de stock et l\'ID de l\'emplacement sont requis'
      });
    }

    // Load inventory to find item by stock number
    const inventory = await loadInventory();
    const item = inventory.find(i => 
      i.supplierCode === stockNumber || 
      i.sku === stockNumber ||
      i.id === stockNumber
    );

    if (!item) {
      return res.status(404).json({
        success: false,
        error: `Item with stock number ${stockNumber} not found`,
        error_fr: `Article avec numéro de stock ${stockNumber} introuvable`
      });
    }

    // Load current location assignments
    const assignments = await loadLocationAssignments();
    
    // Initialize location if it doesn't exist
    if (!assignments[locationId]) {
      assignments[locationId] = {
        locationName: locationId,
        items: []
      };
    }

    // Check if item already exists in this location
    const existingIndex = assignments[locationId].items.findIndex(
      i => i.itemId === item.id
    );

    if (existingIndex >= 0) {
      // Update existing item
      assignments[locationId].items[existingIndex] = {
        ...assignments[locationId].items[existingIndex],
        quantity: assignments[locationId].items[existingIndex].quantity + quantity,
        sequence,
        lastUpdated: new Date().toISOString()
      };
    } else {
      // Add new item to location
      assignments[locationId].items.push({
        itemId: item.id,
        stockNumber: stockNumber,
        name: item.name,
        category: item.category,
        quantity,
        sequence,
        addedAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
      });
    }

    // Sort items by sequence
    assignments[locationId].items.sort((a, b) => a.sequence - b.sequence);

    // Save updated assignments
    await saveLocationAssignments(assignments);

    res.json({
      success: true,
      message: `Item ${item.name} added to location ${locationId}`,
      message_fr: `Article ${item.name} ajouté à l'emplacement ${locationId}`,
      item: {
        id: item.id,
        name: item.name,
        stockNumber,
        quantity,
        sequence,
        location: locationId
      }
    });

  } catch (error) {
    console.error('Error adding item by stock number:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add item',
      error_fr: 'Échec de l\'ajout de l\'article'
    });
  }
});

// Update item sequence in location
router.put('/update-sequence', authRequired, async (req, res) => {
  try {
    const { locationId, itemId, sequence } = req.body;
    
    if (!locationId || !itemId || sequence === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Location ID, item ID, and sequence are required',
        error_fr: 'L\'ID de l\'emplacement, l\'ID de l\'article et la séquence sont requis'
      });
    }

    const assignments = await loadLocationAssignments();
    
    if (!assignments[locationId]) {
      return res.status(404).json({
        success: false,
        error: 'Location not found',
        error_fr: 'Emplacement introuvable'
      });
    }

    const itemIndex = assignments[locationId].items.findIndex(
      i => i.itemId === itemId
    );

    if (itemIndex < 0) {
      return res.status(404).json({
        success: false,
        error: 'Item not found in location',
        error_fr: 'Article introuvable dans cet emplacement'
      });
    }

    // Update sequence
    assignments[locationId].items[itemIndex].sequence = sequence;
    assignments[locationId].items[itemIndex].lastUpdated = new Date().toISOString();

    // Re-sort items by sequence
    assignments[locationId].items.sort((a, b) => a.sequence - b.sequence);

    await saveLocationAssignments(assignments);

    res.json({
      success: true,
      message: 'Sequence updated successfully',
      message_fr: 'Séquence mise à jour avec succès'
    });

  } catch (error) {
    console.error('Error updating sequence:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update sequence',
      error_fr: 'Échec de la mise à jour de la séquence'
    });
  }
});

// Get items in a location
router.get('/location/:locationId', authRequired, async (req, res) => {
  try {
    const { locationId } = req.params;
    const assignments = await loadLocationAssignments();
    
    const locationData = assignments[locationId] || { items: [] };
    
    res.json({
      success: true,
      location: locationId,
      items: locationData.items,
      totalItems: locationData.items.length
    });

  } catch (error) {
    console.error('Error getting location items:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get location items',
      error_fr: 'Échec de la récupération des articles de l\'emplacement'
    });
  }
});

// Bulk assign items to multiple locations
router.post('/bulk-assign', authRequired, async (req, res) => {
  try {
    const { stockNumbers, locationIds, defaultSequence = 999 } = req.body;
    
    if (!Array.isArray(stockNumbers) || !Array.isArray(locationIds)) {
      return res.status(400).json({
        success: false,
        error: 'Stock numbers and location IDs must be arrays',
        error_fr: 'Les numéros de stock et les IDs d\'emplacement doivent être des tableaux'
      });
    }

    const inventory = await loadInventory();
    const assignments = await loadLocationAssignments();
    const results = [];

    for (const stockNumber of stockNumbers) {
      const item = inventory.find(i => 
        i.supplierCode === stockNumber || 
        i.sku === stockNumber ||
        i.id === stockNumber
      );

      if (!item) {
        results.push({
          stockNumber,
          success: false,
          error: 'Item not found'
        });
        continue;
      }

      for (const locationId of locationIds) {
        // Initialize location if needed
        if (!assignments[locationId]) {
          assignments[locationId] = {
            locationName: locationId,
            items: []
          };
        }

        // Check if item exists in location
        const existingIndex = assignments[locationId].items.findIndex(
          i => i.itemId === item.id
        );

        if (existingIndex >= 0) {
          // Update quantity
          assignments[locationId].items[existingIndex].quantity += 1;
          assignments[locationId].items[existingIndex].lastUpdated = new Date().toISOString();
        } else {
          // Add new item
          assignments[locationId].items.push({
            itemId: item.id,
            stockNumber: stockNumber,
            name: item.name,
            category: item.category,
            quantity: 1,
            sequence: defaultSequence,
            addedAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString()
          });
        }

        // Sort by sequence
        assignments[locationId].items.sort((a, b) => a.sequence - b.sequence);
      }

      results.push({
        stockNumber,
        itemName: item.name,
        success: true,
        locations: locationIds
      });
    }

    await saveLocationAssignments(assignments);

    res.json({
      success: true,
      message: 'Bulk assignment completed',
      message_fr: 'Attribution en masse terminée',
      results
    });

  } catch (error) {
    console.error('Error in bulk assignment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to complete bulk assignment',
      error_fr: 'Échec de l\'attribution en masse'
    });
  }
});

// Search items by stock number (autocomplete support)
router.get('/search/:query', authRequired, async (req, res) => {
  try {
    const { query } = req.params;
    const inventory = await loadInventory();
    
    const matches = inventory.filter(item => {
      const searchStr = query.toLowerCase();
      return (
        (item.supplierCode && item.supplierCode.toLowerCase().includes(searchStr)) ||
        (item.sku && item.sku.toLowerCase().includes(searchStr)) ||
        (item.name && item.name.toLowerCase().includes(searchStr)) ||
        (item.id && item.id.toString().includes(searchStr))
      );
    }).slice(0, 20); // Limit to 20 results

    res.json({
      success: true,
      results: matches.map(item => ({
        id: item.id,
        stockNumber: item.supplierCode || item.sku || item.id,
        name: item.name,
        category: item.category,
        currentQuantity: item.quantity,
        unit: item.unit
      }))
    });

  } catch (error) {
    console.error('Error searching items:', error);
    res.status(500).json({
      success: false,
      error: 'Search failed',
      error_fr: 'Échec de la recherche'
    });
  }
});

// Get all locations with item counts
router.get('/locations/summary', authRequired, async (req, res) => {
  try {
    const assignments = await loadLocationAssignments();
    
    const summary = Object.entries(assignments).map(([locationId, data]) => ({
      locationId,
      locationName: data.locationName || locationId,
      itemCount: data.items.length,
      totalQuantity: data.items.reduce((sum, item) => sum + (item.quantity || 0), 0),
      lastUpdated: Math.max(...data.items.map(i => new Date(i.lastUpdated || 0).getTime()))
    }));

    res.json({
      success: true,
      locations: summary,
      totalLocations: summary.length
    });

  } catch (error) {
    console.error('Error getting location summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get location summary',
      error_fr: 'Échec de la récupération du résumé des emplacements'
    });
  }
});

module.exports = router;