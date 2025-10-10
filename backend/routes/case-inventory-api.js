/**
 * CASE INVENTORY API ROUTES
 *
 * Provides endpoints for case-level inventory tracking with FIFO support
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// Load case inventory data
function loadCaseInventory() {
  try {
    const dataPath = path.join(__dirname, '../data/case_inventory.json');
    if (fs.existsSync(dataPath)) {
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      return data.caseInventory || {};
    }
    return {};
  } catch (error) {
    console.error('Error loading case inventory:', error);
    return {};
  }
}

// Save case inventory data
function saveCaseInventory(caseInventory) {
  try {
    const dataPath = path.join(__dirname, '../data/case_inventory.json');
    const existingData = fs.existsSync(dataPath)
      ? JSON.parse(fs.readFileSync(dataPath, 'utf8'))
      : {};

    existingData.caseInventory = caseInventory;
    existingData.lastUpdated = new Date().toISOString();

    fs.writeFileSync(dataPath, JSON.stringify(existingData, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving case inventory:', error);
    return false;
  }
}

/**
 * GET /api/case-inventory
 * Get all items with case tracking
 */
router.get('/', (req, res) => {
  try {
    const caseInventory = loadCaseInventory();
    const items = Object.values(caseInventory).map(item => ({
      itemCode: item.itemCode,
      description: item.description,
      barcode: item.barcode,
      unit: item.unit,
      totalCases: item.totalCases,
      totalWeight: item.totalWeight,
      oldestCaseDate: item.oldestCase ? item.oldestCase.invoiceDate : null,
      newestCaseDate: item.newestCase ? item.newestCase.invoiceDate : null
    }));

    res.json({
      success: true,
      count: items.length,
      items: items.sort((a, b) => b.totalCases - a.totalCases)
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/case-inventory/:itemCode
 * Get detailed case information for a specific item
 */
router.get('/:itemCode', (req, res) => {
  try {
    const { itemCode } = req.params;
    const { limit, status, invoiceNumber } = req.query;

    const caseInventory = loadCaseInventory();
    const item = caseInventory[itemCode];

    if (!item) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }

    // Filter cases based on query parameters
    let cases = item.allCases || [];

    if (status) {
      cases = cases.filter(c => c.status === status);
    }

    if (invoiceNumber) {
      cases = cases.filter(c => c.invoiceNumber === invoiceNumber);
    }

    // Limit number of cases returned (user can specify how many to show)
    if (limit) {
      const limitNum = parseInt(limit);
      // Show most recent cases (end of array since it's sorted FIFO)
      cases = cases.slice(-limitNum);
    }

    // Calculate case age
    const today = new Date();
    const casesWithAge = cases.map(c => {
      const caseDate = new Date(c.invoiceDate);
      const ageInDays = Math.floor((today - caseDate) / (1000 * 60 * 60 * 24));

      return {
        caseNumberShort: c.caseNumberShort,
        caseNumber: c.caseNumber,
        weight: c.weight,
        remainingWeight: c.remainingWeight,
        status: c.status,
        invoiceNumber: c.invoiceNumber,
        invoiceDate: c.invoiceDate,
        ageInDays,
        rotationStatus: ageInDays > 30 ? 'AGED' : ageInDays > 14 ? 'AGING' : 'FRESH',
        usageHistory: c.usageHistory
      };
    });

    res.json({
      success: true,
      item: {
        itemCode: item.itemCode,
        description: item.description,
        barcode: item.barcode,
        unit: item.unit,
        unitPrice: item.unitPrice,
        totalCases: item.totalCases,
        totalWeight: item.totalWeight.toFixed(2)
      },
      cases: casesWithAge,
      totalCasesShown: casesWithAge.length,
      totalCasesAvailable: item.allCases.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/case-inventory/:itemCode/use
 * Use cases from inventory (FIFO)
 */
router.post('/:itemCode/use', (req, res) => {
  try {
    const { itemCode } = req.params;
    const { quantity, reason } = req.body;

    if (!quantity || quantity <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid quantity' });
    }

    const caseInventory = loadCaseInventory();
    const item = caseInventory[itemCode];

    if (!item) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }

    const availableCases = item.allCases.filter(c => c.status !== 'USED');

    if (availableCases.length === 0) {
      return res.status(400).json({ success: false, error: 'No cases available' });
    }

    const casesUsed = [];
    let remaining = parseFloat(quantity);

    for (const caseData of availableCases) {
      if (remaining <= 0) break;

      if (caseData.remainingWeight <= remaining) {
        // Use entire case
        casesUsed.push({
          caseNumber: caseData.caseNumber,
          caseNumberShort: caseData.caseNumberShort,
          weightUsed: caseData.remainingWeight,
          weightRemaining: 0,
          fullyUsed: true
        });

        caseData.usageHistory.push({
          date: new Date().toISOString(),
          amountUsed: caseData.remainingWeight,
          remainingAfter: 0,
          reason: reason || 'Production use'
        });

        remaining -= caseData.remainingWeight;
        caseData.remainingWeight = 0;
        caseData.status = 'USED';
      } else {
        // Partially use case
        casesUsed.push({
          caseNumber: caseData.caseNumber,
          caseNumberShort: caseData.caseNumberShort,
          weightUsed: remaining,
          weightRemaining: caseData.remainingWeight - remaining,
          fullyUsed: false
        });

        caseData.usageHistory.push({
          date: new Date().toISOString(),
          amountUsed: remaining,
          remainingAfter: caseData.remainingWeight - remaining,
          reason: reason || 'Production use'
        });

        caseData.remainingWeight -= remaining;
        caseData.status = 'PARTIAL';
        remaining = 0;
      }
    }

    // Update totals
    item.totalCases = item.allCases.filter(c => c.status !== 'USED').length;
    item.totalWeight = item.allCases
      .filter(c => c.status !== 'USED')
      .reduce((sum, c) => sum + c.remainingWeight, 0);

    // Save updated inventory
    saveCaseInventory(caseInventory);

    res.json({
      success: true,
      quantityRequested: parseFloat(quantity),
      quantityUsed: parseFloat(quantity) - remaining,
      quantityRemaining: remaining,
      casesUsed,
      newTotalCases: item.totalCases,
      newTotalWeight: item.totalWeight.toFixed(2)
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/case-inventory/:itemCode/rotation-report
 * Get rotation/aging report for an item
 */
router.get('/:itemCode/rotation-report', (req, res) => {
  try {
    const { itemCode } = req.params;
    const caseInventory = loadCaseInventory();
    const item = caseInventory[itemCode];

    if (!item) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }

    const today = new Date();
    const activeCases = item.allCases.filter(c => c.status !== 'USED');

    const casesByAge = {
      fresh: [], // 0-14 days
      aging: [], // 15-30 days
      aged: []   // 30+ days
    };

    activeCases.forEach(c => {
      const caseDate = new Date(c.invoiceDate);
      const ageInDays = Math.floor((today - caseDate) / (1000 * 60 * 60 * 24));

      const caseInfo = {
        caseNumberShort: c.caseNumberShort,
        weight: c.remainingWeight.toFixed(2),
        ageInDays,
        invoiceDate: c.invoiceDate
      };

      if (ageInDays > 30) {
        casesByAge.aged.push(caseInfo);
      } else if (ageInDays > 14) {
        casesByAge.aging.push(caseInfo);
      } else {
        casesByAge.fresh.push(caseInfo);
      }
    });

    const oldestCase = activeCases[0];
    const oldestAge = oldestCase
      ? Math.floor((today - new Date(oldestCase.invoiceDate)) / (1000 * 60 * 60 * 24))
      : 0;

    res.json({
      success: true,
      item: {
        itemCode: item.itemCode,
        description: item.description
      },
      totalActiveCases: activeCases.length,
      totalWeight: item.totalWeight.toFixed(2),
      oldestCaseAge: oldestAge,
      casesByAge,
      alerts: {
        hasAgedCases: casesByAge.aged.length > 0,
        hasAgingCases: casesByAge.aging.length > 0,
        needsRotation: oldestAge > 21
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/case-inventory/:itemCode/physical-count
 * Update case inventory from physical count
 * User specifies which case numbers they have on hand, with count date and cutoff date
 */
router.put('/:itemCode/physical-count', (req, res) => {
  try {
    const { itemCode } = req.params;
    const {
      caseNumbers,      // Array of case numbers (short or full)
      countDate,        // Date when count was performed (YYYY-MM-DD)
      cutoffDate,       // Only include orders/cases received on or before this date
      peopleOnSite,     // Number of people on site during count
      notes             // Optional notes about the count
    } = req.body;

    if (!Array.isArray(caseNumbers)) {
      return res.status(400).json({ success: false, error: 'caseNumbers must be an array' });
    }

    if (!countDate) {
      return res.status(400).json({ success: false, error: 'countDate is required (YYYY-MM-DD)' });
    }

    if (!cutoffDate) {
      return res.status(400).json({ success: false, error: 'cutoffDate is required (YYYY-MM-DD)' });
    }

    const caseInventory = loadCaseInventory();
    const item = caseInventory[itemCode];

    if (!item) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }

    // Filter cases to only those received on or before cutoff date
    const eligibleCases = item.allCases.filter(c => c.invoiceDate <= cutoffDate);
    const excludedCases = item.allCases.filter(c => c.invoiceDate > cutoffDate);

    // Convert short case numbers to full if needed
    const normalizedCaseNumbers = caseNumbers.map(cn => {
      const cnStr = cn.toString();
      if (cnStr.length === 4) {
        // Short number - find matching full number
        const matching = eligibleCases.find(c => c.caseNumberShort === cnStr);
        return matching ? matching.caseNumber : cnStr;
      }
      return cnStr;
    });

    // Verify all counted cases are from eligible date range
    const invalidCases = [];
    normalizedCaseNumbers.forEach(cn => {
      const caseData = item.allCases.find(c => c.caseNumber === cn);
      if (caseData && caseData.invoiceDate > cutoffDate) {
        invalidCases.push({
          caseNumber: cn,
          invoiceDate: caseData.invoiceDate,
          reason: `Invoice date (${caseData.invoiceDate}) is after cutoff (${cutoffDate})`
        });
      }
    });

    if (invalidCases.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Some cases are after cutoff date',
        invalidCases
      });
    }

    // Process only eligible cases (received on or before cutoff)
    eligibleCases.forEach(caseData => {
      if (normalizedCaseNumbers.includes(caseData.caseNumber)) {
        // This case is in the physical count
        if (caseData.status === 'USED') {
          // Restore it
          caseData.status = 'IN_STOCK';
          caseData.remainingWeight = caseData.weight;
        }
        // Record the count
        caseData.lastPhysicalCount = {
          countDate,
          cutoffDate,
          peopleOnSite: peopleOnSite || null,
          verified: true,
          notes
        };
      } else {
        // This case is not in physical count - mark as used
        if (caseData.status !== 'USED') {
          caseData.status = 'USED';
          caseData.remainingWeight = 0;
          caseData.usageHistory.push({
            date: countDate,
            amountUsed: caseData.weight,
            remainingAfter: 0,
            reason: `Physical count adjustment (Count date: ${countDate}, Cutoff: ${cutoffDate})`,
            type: 'PHYSICAL_COUNT_ADJUSTMENT'
          });
        }
      }
    });

    // Cases after cutoff date remain unchanged but tagged
    excludedCases.forEach(caseData => {
      if (!caseData.countExclusions) {
        caseData.countExclusions = [];
      }
      caseData.countExclusions.push({
        countDate,
        cutoffDate,
        reason: `Invoice date (${caseData.invoiceDate}) after cutoff`,
        excluded: true
      });
    });

    // Update totals (only count eligible cases)
    item.totalCases = eligibleCases.filter(c => c.status !== 'USED').length;
    item.totalWeight = eligibleCases
      .filter(c => c.status !== 'USED')
      .reduce((sum, c) => sum + c.remainingWeight, 0);

    // Record the count snapshot
    if (!item.countHistory) {
      item.countHistory = [];
    }
    item.countHistory.push({
      countDate,
      cutoffDate,
      peopleOnSite: peopleOnSite || null,
      casesInCount: normalizedCaseNumbers.length,
      totalCases: item.totalCases,
      totalWeight: item.totalWeight,
      eligibleCases: eligibleCases.length,
      excludedCases: excludedCases.length,
      notes,
      performedAt: new Date().toISOString()
    });

    // Save updated inventory
    saveCaseInventory(caseInventory);

    res.json({
      success: true,
      itemCode,
      countDate,
      cutoffDate,
      peopleOnSite: peopleOnSite || null,
      casesInCount: normalizedCaseNumbers.length,
      eligibleCases: eligibleCases.length,
      excludedCases: excludedCases.length,
      newTotalCases: item.totalCases,
      newTotalWeight: item.totalWeight.toFixed(2),
      message: 'Physical count updated successfully',
      summary: {
        countPerformed: countDate,
        ordersCutoff: cutoffDate,
        peopleOnSite: peopleOnSite || 'Not recorded',
        casesVerified: normalizedCaseNumbers.length,
        casesMarkedUsed: eligibleCases.filter(c => !normalizedCaseNumbers.includes(c.caseNumber)).length,
        casesExcluded: excludedCases.length
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
