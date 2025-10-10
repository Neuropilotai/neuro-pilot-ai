const fs = require('fs');
const path = require('path');

console.log('🔍 COMPREHENSIVE SYSTEM ANALYSIS');
console.log('='.repeat(80));

class ComprehensiveAnalyzer {
  constructor() {
    this.dataDir = './data';
    this.issues = [];
    this.stats = {
      totalItems: 0,
      itemsWithBarcodes: 0,
      itemsWithoutBarcodes: 0,
      meatProducts: 0,
      meatWithoutBarcodes: 0,
      priceDiscrepancies: 0
    };
  }

  async analyzeAll() {
    console.log('\n📊 LOADING DATA...');

    // Load all required data
    const barcodeMapping = this.loadBarcodeMapping();
    const fifoInventory = this.loadFIFOInventory();
    const orderData = this.loadAllOrderData();

    console.log(`✓ Loaded ${Object.keys(barcodeMapping).length} barcode mappings`);
    console.log(`✓ Loaded ${fifoInventory.size} FIFO inventory items`);
    console.log(`✓ Loaded ${orderData.length} order files`);

    // Analyze barcode coverage
    await this.analyzeBarcodeGaps(barcodeMapping, fifoInventory);

    // Analyze meat product pricing
    await this.analyzeMeatPricing(fifoInventory, orderData);

    // Generate comprehensive report
    this.generateReport();

    return this.stats;
  }

  loadBarcodeMapping() {
    try {
      const barcodeFile = path.join(this.dataDir, 'barcode_mapping.json');
      return JSON.parse(fs.readFileSync(barcodeFile, 'utf8'));
    } catch (error) {
      console.error('❌ Error loading barcode mapping:', error.message);
      return {};
    }
  }

  loadFIFOInventory() {
    try {
      const fifoFile = path.join(this.dataDir, 'fifo_inventory.json');
      const fifoData = JSON.parse(fs.readFileSync(fifoFile, 'utf8'));
      return new Map(fifoData.inventory || []);
    } catch (error) {
      console.error('❌ Error loading FIFO inventory:', error.message);
      return new Map();
    }
  }

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

  async analyzeBarcodeGaps(barcodeMapping, fifoInventory) {
    console.log('\n🏷️ ANALYZING BARCODE COVERAGE...');

    const missingBarcodes = [];
    const meatProductsWithoutBarcodes = [];

    this.stats.totalItems = fifoInventory.size;

    for (const [itemCode, itemData] of fifoInventory) {
      const barcodeInfo = barcodeMapping[itemCode];
      const hasBarcode = barcodeInfo && barcodeInfo.barcode && barcodeInfo.barcode.length > 0;

      if (hasBarcode) {
        this.stats.itemsWithBarcodes++;
      } else {
        this.stats.itemsWithoutBarcodes++;
        missingBarcodes.push({
          itemCode,
          description: itemData.description || 'No description',
          category: this.categorizeProduct(itemData.description)
        });
      }

      // Check if it's a meat product
      if (this.isMeatProduct(itemData.description)) {
        this.stats.meatProducts++;
        if (!hasBarcode) {
          this.stats.meatWithoutBarcodes++;
          meatProductsWithoutBarcodes.push({
            itemCode,
            description: itemData.description
          });
        }
      }
    }

    console.log(`✓ Items with barcodes: ${this.stats.itemsWithBarcodes} (${(this.stats.itemsWithBarcodes/this.stats.totalItems*100).toFixed(1)}%)`);
    console.log(`✓ Items without barcodes: ${this.stats.itemsWithoutBarcodes} (${(this.stats.itemsWithoutBarcodes/this.stats.totalItems*100).toFixed(1)}%)`);
    console.log(`✓ Meat products: ${this.stats.meatProducts}`);
    console.log(`✓ Meat products without barcodes: ${this.stats.meatWithoutBarcodes}`);

    // Save missing barcode analysis
    const missingBarcodeReport = {
      timestamp: new Date().toISOString(),
      totalMissing: missingBarcodes.length,
      meatProductsMissing: meatProductsWithoutBarcodes.length,
      missingBarcodes: missingBarcodes,
      meatProductsWithoutBarcodes: meatProductsWithoutBarcodes
    };

    fs.writeFileSync(
      path.join(this.dataDir, 'missing_barcodes_analysis.json'),
      JSON.stringify(missingBarcodeReport, null, 2)
    );

    console.log(`💾 Missing barcode analysis saved (${missingBarcodes.length} items)`);
  }

  async analyzeMeatPricing(fifoInventory, orderData) {
    console.log('\n🥩 ANALYZING MEAT PRODUCT PRICING...');

    const meatPricingIssues = [];

    for (const [itemCode, itemData] of fifoInventory) {
      if (this.isMeatProduct(itemData.description)) {
        const priceValidation = this.validateMeatPrices(itemCode, itemData, orderData);

        if (priceValidation.hasIssues) {
          this.stats.priceDiscrepancies++;
          meatPricingIssues.push({
            itemCode,
            description: itemData.description,
            issues: priceValidation.issues,
            inventoryPrices: priceValidation.inventoryPrices,
            orderPrices: priceValidation.orderPrices
          });
        }
      }
    }

    console.log(`✓ Meat price discrepancies found: ${this.stats.priceDiscrepancies}`);

    // Save meat pricing analysis
    const meatPricingReport = {
      timestamp: new Date().toISOString(),
      totalDiscrepancies: meatPricingIssues.length,
      meatPricingIssues: meatPricingIssues
    };

    fs.writeFileSync(
      path.join(this.dataDir, 'meat_pricing_analysis.json'),
      JSON.stringify(meatPricingReport, null, 2)
    );

    console.log(`💾 Meat pricing analysis saved (${meatPricingIssues.length} issues)`);
  }

  validateMeatPrices(itemCode, itemData, orderData) {
    const result = {
      hasIssues: false,
      issues: [],
      inventoryPrices: [],
      orderPrices: []
    };

    // Get inventory prices
    if (itemData.batches) {
      for (const batch of itemData.batches) {
        if (batch.price !== undefined && batch.price !== null) {
          result.inventoryPrices.push({
            price: batch.price,
            date: batch.date,
            invoice: batch.invoice
          });
        }
      }
    }

    // Get order prices for this item
    for (const order of orderData) {
      if (order.items) {
        for (const item of order.items) {
          if (item.itemCode === itemCode && item.unitPrice) {
            result.orderPrices.push({
              price: item.unitPrice,
              invoice: order.invoiceNumber,
              date: order.orderDate,
              quantity: item.quantity
            });
          }
        }
      }
    }

    // Compare prices and find discrepancies
    for (const invPrice of result.inventoryPrices) {
      const matchingOrderPrice = result.orderPrices.find(op =>
        op.invoice === invPrice.invoice
      );

      if (matchingOrderPrice) {
        const priceDiff = Math.abs(invPrice.price - matchingOrderPrice.price);
        const percentDiff = (priceDiff / matchingOrderPrice.price) * 100;

        if (percentDiff > 5) { // More than 5% difference
          result.hasIssues = true;
          result.issues.push({
            type: 'price_mismatch',
            invoice: invPrice.invoice,
            inventoryPrice: invPrice.price,
            orderPrice: matchingOrderPrice.price,
            difference: priceDiff,
            percentDifference: percentDiff.toFixed(2)
          });
        }
      } else {
        result.hasIssues = true;
        result.issues.push({
          type: 'missing_order_price',
          invoice: invPrice.invoice,
          inventoryPrice: invPrice.price
        });
      }
    }

    return result;
  }

  isMeatProduct(description) {
    if (!description) return false;

    const meatKeywords = [
      'BACON', 'BEEF', 'PORK', 'CHICKEN', 'TURKEY', 'HAM', 'SAUSAGE',
      'GROUND', 'STEAK', 'ROAST', 'CHOP', 'BREAST', 'THIGH', 'WING',
      'MEAT', 'POULTRY', 'LAMB', 'VEAL', 'DUCK', 'FISH', 'SALMON',
      'TUNA', 'SHRIMP', 'CRAB', 'LOBSTER'
    ];

    const upperDesc = description.toUpperCase();
    return meatKeywords.some(keyword => upperDesc.includes(keyword));
  }

  categorizeProduct(description) {
    if (!description) return 'UNCATEGORIZED';

    const upperDesc = description.toUpperCase();

    if (this.isMeatProduct(description)) return 'MEAT';
    if (upperDesc.includes('BREAD') || upperDesc.includes('PASTRY') || upperDesc.includes('CAKE')) return 'BAKERY';
    if (upperDesc.includes('MILK') || upperDesc.includes('CHEESE') || upperDesc.includes('CREAM')) return 'DAIRY';
    if (upperDesc.includes('VEGETABLE') || upperDesc.includes('FRUIT') || upperDesc.includes('LETTUCE')) return 'PRODUCE';
    if (upperDesc.includes('DETERGENT') || upperDesc.includes('CLEANER') || upperDesc.includes('SOAP')) return 'CLEANING';

    return 'OTHER';
  }

  generateReport() {
    console.log('\n📊 COMPREHENSIVE ANALYSIS REPORT');
    console.log('='.repeat(80));

    console.log('\n📈 BARCODE COVERAGE:');
    console.log(`  Total Items: ${this.stats.totalItems}`);
    console.log(`  Items with Barcodes: ${this.stats.itemsWithBarcodes} (${(this.stats.itemsWithBarcodes/this.stats.totalItems*100).toFixed(1)}%)`);
    console.log(`  Items without Barcodes: ${this.stats.itemsWithoutBarcodes} (${(this.stats.itemsWithoutBarcodes/this.stats.totalItems*100).toFixed(1)}%)`);

    console.log('\n🥩 MEAT PRODUCTS:');
    console.log(`  Total Meat Products: ${this.stats.meatProducts}`);
    console.log(`  Meat Products without Barcodes: ${this.stats.meatWithoutBarcodes}`);
    console.log(`  Meat Price Discrepancies: ${this.stats.priceDiscrepancies}`);

    const barcodeGrade = this.calculateBarcodeGrade();
    const pricingGrade = this.calculatePricingGrade();

    console.log('\n🎯 SYSTEM GRADES:');
    console.log(`  Barcode Coverage: ${barcodeGrade.letter} (${barcodeGrade.percentage}%)`);
    console.log(`  Price Accuracy: ${pricingGrade.letter} (${pricingGrade.percentage}%)`);

    console.log('\n🔧 PRIORITY FIXES NEEDED:');
    if (this.stats.itemsWithoutBarcodes > 200) {
      console.log('  • HIGH: Extract barcodes for remaining items');
    }
    if (this.stats.meatWithoutBarcodes > 0) {
      console.log('  • HIGH: Add barcodes for all meat products');
    }
    if (this.stats.priceDiscrepancies > 0) {
      console.log('  • HIGH: Fix meat price discrepancies');
    }

    // Save comprehensive report
    const report = {
      timestamp: new Date().toISOString(),
      stats: this.stats,
      grades: {
        barcode: barcodeGrade,
        pricing: pricingGrade
      }
    };

    fs.writeFileSync(
      path.join(this.dataDir, 'comprehensive_analysis_report.json'),
      JSON.stringify(report, null, 2)
    );

    console.log(`\n💾 Comprehensive report saved`);
  }

  calculateBarcodeGrade() {
    const coverage = (this.stats.itemsWithBarcodes / this.stats.totalItems) * 100;

    let letter, status;
    if (coverage >= 95) {
      letter = 'A+';
      status = 'EXCELLENT';
    } else if (coverage >= 85) {
      letter = 'A';
      status = 'VERY GOOD';
    } else if (coverage >= 75) {
      letter = 'B+';
      status = 'GOOD';
    } else if (coverage >= 65) {
      letter = 'B';
      status = 'SATISFACTORY';
    } else if (coverage >= 50) {
      letter = 'C';
      status = 'NEEDS IMPROVEMENT';
    } else {
      letter = 'F';
      status = 'CRITICAL';
    }

    return { percentage: Math.round(coverage), letter, status };
  }

  calculatePricingGrade() {
    if (this.stats.meatProducts === 0) {
      return { percentage: 100, letter: 'A+', status: 'NO MEAT PRODUCTS' };
    }

    const accuracy = ((this.stats.meatProducts - this.stats.priceDiscrepancies) / this.stats.meatProducts) * 100;

    let letter, status;
    if (accuracy >= 95) {
      letter = 'A+';
      status = 'EXCELLENT';
    } else if (accuracy >= 90) {
      letter = 'A';
      status = 'VERY GOOD';
    } else if (accuracy >= 85) {
      letter = 'B+';
      status = 'GOOD';
    } else if (accuracy >= 80) {
      letter = 'B';
      status = 'SATISFACTORY';
    } else if (accuracy >= 70) {
      letter = 'C';
      status = 'NEEDS IMPROVEMENT';
    } else {
      letter = 'F';
      status = 'CRITICAL';
    }

    return { percentage: Math.round(accuracy), letter, status };
  }
}

// Run comprehensive analysis
async function runComprehensiveAnalysis() {
  const analyzer = new ComprehensiveAnalyzer();

  console.log('🚀 Starting comprehensive system analysis...\n');

  const results = await analyzer.analyzeAll();

  console.log('\n✅ Analysis complete!');
  return results;
}

// Run if called directly
if (require.main === module) {
  runComprehensiveAnalysis().catch(console.error);
}

module.exports = ComprehensiveAnalyzer;