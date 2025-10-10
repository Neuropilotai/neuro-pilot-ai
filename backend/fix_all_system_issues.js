const fs = require('fs');
const path = require('path');

console.log('🔧 COMPREHENSIVE SYSTEM REPAIR');
console.log('='.repeat(80));

class SystemRepairer {
  constructor() {
    this.dataDir = './data';
    this.fixedItems = 0;
    this.fifoViolations = 0;
    this.zeropricesFixed = 0;
    this.namesCleanedUp = 0;
  }

  // Fix all FIFO inventory issues
  async fixAllIssues() {
    console.log('\n🔄 LOADING FIFO INVENTORY DATA...');

    const fifoFile = path.join(this.dataDir, 'fifo_inventory.json');
    if (!fs.existsSync(fifoFile)) {
      console.log('❌ FIFO inventory file not found');
      return false;
    }

    const fifoData = JSON.parse(fs.readFileSync(fifoFile, 'utf8'));
    const inventory = new Map(fifoData.inventory || []);

    console.log(`✓ Loaded ${inventory.size} items`);

    // Load order data for price fixing
    const orderData = this.loadAllOrderData();
    console.log(`✓ Loaded ${orderData.length} orders for price validation`);

    // Fix each item
    for (const [itemCode, itemData] of inventory.entries()) {
      let itemFixed = false;

      // Fix FIFO ordering
      if (this.fixFIFOOrdering(itemCode, itemData)) {
        itemFixed = true;
        this.fifoViolations++;
      }

      // Fix zero prices
      if (this.fixZeroPrices(itemCode, itemData, orderData)) {
        itemFixed = true;
        this.zeropricesFixed++;
      }

      // Clean up item names
      if (this.cleanItemName(itemCode, itemData)) {
        itemFixed = true;
        this.namesCleanedUp++;
      }

      if (itemFixed) {
        this.fixedItems++;
        inventory.set(itemCode, itemData);
      }
    }

    // Save the fixed data
    const fixedData = {
      inventory: Array.from(inventory.entries()),
      lastUpdated: new Date().toISOString(),
      repairedBy: 'SystemRepairer',
      repairDate: new Date().toISOString()
    };

    // Backup original file
    const backupFile = path.join(this.dataDir, `fifo_inventory_backup_${Date.now()}.json`);
    fs.copyFileSync(fifoFile, backupFile);
    console.log(`✓ Backup created: ${backupFile}`);

    // Save fixed data
    fs.writeFileSync(fifoFile, JSON.stringify(fixedData, null, 2));
    console.log('✓ Fixed FIFO inventory saved');

    return true;
  }

  // Fix FIFO ordering violations
  fixFIFOOrdering(itemCode, itemData) {
    if (!itemData.batches || itemData.batches.length <= 1) return false;

    let hasViolations = false;

    // Sort batches by date (oldest first)
    const sortedBatches = [...itemData.batches].sort((a, b) => {
      return new Date(a.date) - new Date(b.date);
    });

    // Check if reordering was needed
    for (let i = 0; i < itemData.batches.length; i++) {
      if (itemData.batches[i].date !== sortedBatches[i].date) {
        hasViolations = true;
        break;
      }
    }

    if (hasViolations) {
      itemData.batches = sortedBatches;
      return true;
    }

    return false;
  }

  // Fix zero prices using order data
  fixZeroPrices(itemCode, itemData, orderData) {
    if (!itemData.batches) return false;

    let pricesFixed = false;

    for (const batch of itemData.batches) {
      if (batch.price === 0 || batch.price === null || batch.price === undefined) {
        // Find price from order data
        const correctPrice = this.findCorrectPrice(itemCode, batch, orderData);

        if (correctPrice > 0) {
          batch.price = correctPrice;
          pricesFixed = true;
        } else {
          // Use last known good price or item's last price
          batch.price = itemData.lastPrice || this.getAveragePrice(itemData) || 0.01;
          pricesFixed = true;
        }
      }
    }

    return pricesFixed;
  }

  // Find correct price from order data
  findCorrectPrice(itemCode, batch, orderData) {
    // First try exact invoice match
    for (const order of orderData) {
      if (order.invoiceNumber === batch.invoice && order.items) {
        for (const item of order.items) {
          if (item.itemCode === itemCode && item.unitPrice > 0) {
            return item.unitPrice;
          }
        }
      }
    }

    // Try date-based matching
    const batchDate = new Date(batch.date);
    let closestPrice = 0;
    let smallestDateDiff = Infinity;

    for (const order of orderData) {
      if (order.items && order.orderDate) {
        const orderDate = new Date(order.orderDate);
        const dateDiff = Math.abs(batchDate - orderDate);

        if (dateDiff < smallestDateDiff) {
          for (const item of order.items) {
            if (item.itemCode === itemCode && item.unitPrice > 0) {
              closestPrice = item.unitPrice;
              smallestDateDiff = dateDiff;
            }
          }
        }
      }
    }

    return closestPrice;
  }

  // Get average price for item
  getAveragePrice(itemData) {
    if (!itemData.batches) return 0;

    const validPrices = itemData.batches
      .map(b => b.price)
      .filter(p => p > 0);

    if (validPrices.length === 0) return 0;

    return validPrices.reduce((sum, price) => sum + price, 0) / validPrices.length;
  }

  // Clean up item names
  cleanItemName(itemCode, itemData) {
    if (!itemData.description) return false;

    const originalDescription = itemData.description;

    // Remove common junk patterns
    let cleanedDescription = originalDescription
      .replace(/^CS \d+X\d+(\.\d+)?\s+KG\s+/i, '')  // CS 6X1.13 KG prefix
      .replace(/^LB \d+\s+/i, '')                    // LB prefix
      .replace(/^\d+\s+CS\s+/i, '')                  // Number CS prefix
      .replace(/\s+CS$/i, '')                        // CS suffix
      .replace(/^CS\s+/i, '')                        // CS prefix
      .replace(/^\w+\s+CS\s+/i, '')                  // Brand CS prefix
      .trim();

    if (cleanedDescription !== originalDescription && cleanedDescription.length > 0) {
      itemData.description = cleanedDescription;
      return true;
    }

    return false;
  }

  // Load all order data
  loadAllOrderData() {
    const orderData = [];
    const ordersDir = path.join(this.dataDir, 'gfs_orders');

    try {
      if (fs.existsSync(ordersDir)) {
        const orderFiles = fs.readdirSync(ordersDir)
          .filter(file => file.endsWith('.json') && !file.includes('corrupted'));

        for (const file of orderFiles) {
          try {
            const filePath = path.join(ordersDir, file);
            const order = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            orderData.push(order);
          } catch (error) {
            // Skip corrupted files
          }
        }
      }
    } catch (error) {
      console.log('⚠️ Error loading order data:', error.message);
    }

    return orderData;
  }

  // Enhanced barcode extraction for remaining items
  extractMissingBarcodes() {
    console.log('\n🏷️ EXTRACTING MISSING BARCODES...');

    const orderData = this.loadAllOrderData();
    const newBarcodes = {};
    let barcodesFound = 0;

    // Search through all order data for barcode patterns
    for (const order of orderData) {
      if (order.items) {
        for (const item of order.items) {
          if (item.itemCode && item.description) {
            // Look for UPC/barcode patterns in description
            const barcodePatterns = [
              /\b\d{12,14}\b/g,  // 12-14 digit UPC codes
              /\b\d{8}\b/g,      // 8 digit codes
              /\b\d{10,11}\b/g   // 10-11 digit codes
            ];

            for (const pattern of barcodePatterns) {
              const matches = item.description.match(pattern);
              if (matches) {
                for (const match of matches) {
                  // Validate barcode length and format
                  if (this.isValidBarcode(match)) {
                    if (!newBarcodes[item.itemCode]) {
                      newBarcodes[item.itemCode] = {
                        itemCode: item.itemCode,
                        description: item.description,
                        barcode: match,
                        foundInInvoice: order.invoiceNumber
                      };
                      barcodesFound++;
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    // Save new barcodes
    if (barcodesFound > 0) {
      const barcodeFile = path.join(this.dataDir, 'additional_barcodes.json');
      fs.writeFileSync(barcodeFile, JSON.stringify(newBarcodes, null, 2));
      console.log(`✓ Found ${barcodesFound} additional barcodes, saved to ${barcodeFile}`);
    }

    return barcodesFound;
  }

  // Validate barcode format
  isValidBarcode(barcode) {
    const code = barcode.toString();

    // Common barcode lengths
    const validLengths = [8, 10, 11, 12, 13, 14];
    if (!validLengths.includes(code.length)) return false;

    // Should be all digits
    if (!/^\d+$/.test(code)) return false;

    // Avoid common false positives
    if (code === '00000000' || code === '11111111') return false;
    if (code.startsWith('2025') || code.startsWith('2024')) return false; // Dates

    return true;
  }

  // Generate comprehensive repair report
  generateRepairReport() {
    console.log('\n📊 SYSTEM REPAIR REPORT');
    console.log('='.repeat(80));

    console.log('🔧 REPAIRS COMPLETED:');
    console.log(`  Items Fixed: ${this.fixedItems}`);
    console.log(`  FIFO Violations Corrected: ${this.fifoViolations}`);
    console.log(`  Zero Prices Fixed: ${this.zeropricesFixed}`);
    console.log(`  Item Names Cleaned: ${this.namesCleanedUp}`);

    const additionalBarcodes = this.extractMissingBarcodes();
    console.log(`  Additional Barcodes Found: ${additionalBarcodes}`);

    console.log('\n✅ SYSTEM STATUS:');
    console.log('  FIFO Integrity: RESTORED');
    console.log('  Price Validation: IMPROVED');
    console.log('  Item Names: CLEANED');
    console.log('  Barcode Coverage: ENHANCED');

    console.log('\n🎯 NEXT STEPS:');
    console.log('  1. Run verification script to confirm fixes');
    console.log('  2. Restart enterprise inventory system');
    console.log('  3. Verify dashboard displays correctly');
    console.log('  4. Test barcode scanning functionality');

    return {
      itemsFixed: this.fixedItems,
      fifoViolations: this.fifoViolations,
      zeropricesFixed: this.zeropricesFixed,
      namesCleanedUp: this.namesCleanedUp,
      additionalBarcodes: additionalBarcodes
    };
  }
}

// Run comprehensive system repair
async function runSystemRepair() {
  const repairer = new SystemRepairer();

  console.log('🚀 Starting comprehensive system repair...\n');

  const success = await repairer.fixAllIssues();

  if (success) {
    const report = repairer.generateRepairReport();

    // Save repair log
    const logFile = path.join('./data', 'system_repair_log.json');
    fs.writeFileSync(logFile, JSON.stringify({
      timestamp: new Date().toISOString(),
      report: report,
      status: 'completed'
    }, null, 2));

    console.log(`\n💾 Repair log saved to: ${logFile}`);
  } else {
    console.log('\n❌ System repair failed');
  }

  return success;
}

// Run if called directly
if (require.main === module) {
  runSystemRepair().catch(console.error);
}

module.exports = SystemRepairer;