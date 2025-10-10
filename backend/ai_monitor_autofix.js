const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

console.log('🤖 AI MONITORING & AUTO-FIX SYSTEM');
console.log('='.repeat(80));

class AIMonitor {
  constructor() {
    this.dataDir = './data';
    this.monitoringActive = true;
    this.checkInterval = 30000; // 30 seconds
    this.fixAttempts = 0;
    this.maxFixAttempts = 100; // Prevent infinite loops
    this.lastAnalysis = null;
    this.fixHistory = [];
  }

  async startMonitoring() {
    console.log('🚀 Starting AI Monitoring System...');
    console.log(`   Check Interval: ${this.checkInterval/1000} seconds`);
    console.log(`   Max Fix Attempts: ${this.maxFixAttempts}`);
    console.log('='.repeat(80));

    while (this.monitoringActive && this.fixAttempts < this.maxFixAttempts) {
      try {
        await this.performAnalysisAndFix();
        await this.sleep(this.checkInterval);
      } catch (error) {
        console.error('❌ Monitor error:', error.message);
        await this.sleep(5000); // Wait 5 seconds before retry
      }
    }

    console.log('\n🏁 AI Monitoring completed or max attempts reached');
    this.generateMonitoringReport();
  }

  async performAnalysisAndFix() {
    const timestamp = new Date().toISOString();
    console.log(`\n🔍 [${timestamp}] Running system analysis...`);

    // Run comprehensive analysis
    const analysis = await this.runComprehensiveAnalysis();

    if (!analysis) {
      console.log('⚠️ Analysis failed, skipping this cycle');
      return;
    }

    this.lastAnalysis = analysis;

    // Determine if fixes are needed
    const fixesNeeded = this.determineFixes(analysis);

    if (fixesNeeded.length === 0) {
      console.log('✅ No fixes needed - system optimal');
      return;
    }

    console.log(`🔧 Found ${fixesNeeded.length} issues to fix:`);
    fixesNeeded.forEach((fix, i) => {
      console.log(`   ${i+1}. ${fix.type}: ${fix.description}`);
    });

    // Apply fixes
    for (const fix of fixesNeeded) {
      await this.applyFix(fix);
    }

    this.fixAttempts++;
    console.log(`📊 Total fix attempts: ${this.fixAttempts}/${this.maxFixAttempts}`);
  }

  async runComprehensiveAnalysis() {
    try {
      const ComprehensiveAnalyzer = require('./comprehensive_system_analysis');
      const analyzer = new ComprehensiveAnalyzer();
      return await analyzer.analyzeAll();
    } catch (error) {
      console.error('❌ Analysis error:', error.message);
      return null;
    }
  }

  determineFixes(analysis) {
    const fixes = [];

    // Fix 1: Missing barcodes (priority: HIGH)
    if (analysis.itemsWithoutBarcodes > 400) {
      fixes.push({
        type: 'MISSING_BARCODES',
        priority: 'HIGH',
        description: `${analysis.itemsWithoutBarcodes} items missing barcodes`,
        action: 'extractAdditionalBarcodes'
      });
    }

    // Fix 2: Meat products without barcodes (priority: CRITICAL)
    if (analysis.meatWithoutBarcodes > 0) {
      fixes.push({
        type: 'MEAT_MISSING_BARCODES',
        priority: 'CRITICAL',
        description: `${analysis.meatWithoutBarcodes} meat products missing barcodes`,
        action: 'extractMeatBarcodes'
      });
    }

    // Fix 3: Price discrepancies (priority: HIGH)
    if (analysis.priceDiscrepancies > 0) {
      fixes.push({
        type: 'PRICE_DISCREPANCIES',
        priority: 'HIGH',
        description: `${analysis.priceDiscrepancies} meat price discrepancies`,
        action: 'fixPriceDiscrepancies'
      });
    }

    // Fix 4: Low barcode coverage (priority: MEDIUM)
    const coverage = (analysis.itemsWithBarcodes / analysis.totalItems) * 100;
    if (coverage < 50) {
      fixes.push({
        type: 'LOW_BARCODE_COVERAGE',
        priority: 'MEDIUM',
        description: `Barcode coverage only ${coverage.toFixed(1)}%`,
        action: 'improveBarcodeExtraction'
      });
    }

    return fixes.sort((a, b) => this.getPriorityWeight(a.priority) - this.getPriorityWeight(b.priority));
  }

  getPriorityWeight(priority) {
    const weights = { 'CRITICAL': 1, 'HIGH': 2, 'MEDIUM': 3, 'LOW': 4 };
    return weights[priority] || 5;
  }

  async applyFix(fix) {
    const startTime = Date.now();
    console.log(`\n🔧 Applying fix: ${fix.type} (${fix.priority})`);
    console.log(`   Action: ${fix.action}`);

    const fixRecord = {
      timestamp: new Date().toISOString(),
      type: fix.type,
      priority: fix.priority,
      action: fix.action,
      success: false,
      duration: 0,
      itemsFixed: 0,
      error: null
    };

    try {
      let result;

      switch (fix.action) {
        case 'extractAdditionalBarcodes':
          result = await this.extractAdditionalBarcodes();
          break;

        case 'extractMeatBarcodes':
          result = await this.extractMeatBarcodes();
          break;

        case 'fixPriceDiscrepancies':
          result = await this.fixPriceDiscrepancies();
          break;

        case 'improveBarcodeExtraction':
          result = await this.improveBarcodeExtraction();
          break;

        default:
          throw new Error(`Unknown fix action: ${fix.action}`);
      }

      fixRecord.success = true;
      fixRecord.itemsFixed = result.itemsFixed || 0;
      console.log(`✅ Fix completed: ${result.itemsFixed || 0} items fixed`);

    } catch (error) {
      fixRecord.error = error.message;
      console.error(`❌ Fix failed: ${error.message}`);
    }

    fixRecord.duration = Date.now() - startTime;
    this.fixHistory.push(fixRecord);

    // Save fix record
    await this.saveFix(fixRecord);
  }

  async extractAdditionalBarcodes() {
    console.log('   🔍 Extracting additional barcodes from PDFs...');

    // Load missing barcode analysis
    const missingFile = path.join(this.dataDir, 'missing_barcodes_analysis.json');
    if (!fs.existsSync(missingFile)) {
      throw new Error('Missing barcodes analysis not found');
    }

    const missingAnalysis = JSON.parse(fs.readFileSync(missingFile, 'utf8'));
    const itemsToProcess = missingAnalysis.missingBarcodes.slice(0, 50); // Process 50 at a time

    let itemsFixed = 0;

    // Advanced barcode extraction patterns
    const orderData = this.loadAllOrderData();
    const barcodeMapping = this.loadBarcodeMapping();

    for (const missingItem of itemsToProcess) {
      const extractedBarcode = this.extractBarcodeWithAdvancedPatterns(
        missingItem.itemCode,
        missingItem.description,
        orderData
      );

      if (extractedBarcode) {
        // Update barcode mapping
        if (barcodeMapping[missingItem.itemCode]) {
          barcodeMapping[missingItem.itemCode].barcode = extractedBarcode;
          if (!barcodeMapping[missingItem.itemCode].allBarcodes.includes(extractedBarcode)) {
            barcodeMapping[missingItem.itemCode].allBarcodes.push(extractedBarcode);
          }
          itemsFixed++;
        }
      }
    }

    // Save updated barcode mapping
    if (itemsFixed > 0) {
      const barcodeFile = path.join(this.dataDir, 'barcode_mapping.json');
      fs.writeFileSync(barcodeFile, JSON.stringify(barcodeMapping, null, 2));
    }

    return { itemsFixed };
  }

  extractBarcodeWithAdvancedPatterns(itemCode, description, orderData) {
    // Try multiple extraction strategies

    // Strategy 1: Look for exact item in orders
    for (const order of orderData) {
      if (order.items) {
        for (const item of order.items) {
          if (item.itemCode === itemCode && item.description) {
            // Look for 12-14 digit patterns
            const patterns = [
              /\b\d{14}\b/g,  // 14 digits
              /\b\d{13}\b/g,  // 13 digits
              /\b\d{12}\b/g,  // 12 digits
              /\b\d{11}\b/g,  // 11 digits
              /\b\d{10}\b/g   // 10 digits
            ];

            for (const pattern of patterns) {
              const matches = item.description.match(pattern);
              if (matches) {
                for (const match of matches) {
                  if (this.isValidBarcode(match)) {
                    return match;
                  }
                }
              }
            }
          }
        }
      }
    }

    // Strategy 2: Look for similar product descriptions
    const cleanDesc = description.toUpperCase().replace(/[^A-Z0-9\s]/g, '');
    const keywords = cleanDesc.split(' ').filter(word => word.length > 3);

    for (const order of orderData) {
      if (order.items) {
        for (const item of order.items) {
          if (item.description) {
            const itemDesc = item.description.toUpperCase();

            // Check if multiple keywords match
            const matchingKeywords = keywords.filter(keyword =>
              itemDesc.includes(keyword)
            );

            if (matchingKeywords.length >= 2) {
              const patterns = [/\b\d{12,14}\b/g];
              for (const pattern of patterns) {
                const matches = item.description.match(pattern);
                if (matches) {
                  for (const match of matches) {
                    if (this.isValidBarcode(match)) {
                      return match;
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    return null;
  }

  async extractMeatBarcodes() {
    console.log('   🥩 Extracting meat product barcodes...');

    const missingFile = path.join(this.dataDir, 'missing_barcodes_analysis.json');
    const missingAnalysis = JSON.parse(fs.readFileSync(missingFile, 'utf8'));

    const meatItems = missingAnalysis.meatProductsWithoutBarcodes.slice(0, 20);
    const orderData = this.loadAllOrderData();
    const barcodeMapping = this.loadBarcodeMapping();

    let itemsFixed = 0;

    // Focus on meat products with targeted extraction
    for (const meatItem of meatItems) {
      const extractedBarcode = this.extractMeatSpecificBarcode(
        meatItem.itemCode,
        meatItem.description,
        orderData
      );

      if (extractedBarcode) {
        if (barcodeMapping[meatItem.itemCode]) {
          barcodeMapping[meatItem.itemCode].barcode = extractedBarcode;
          if (!barcodeMapping[meatItem.itemCode].allBarcodes.includes(extractedBarcode)) {
            barcodeMapping[meatItem.itemCode].allBarcodes.push(extractedBarcode);
          }
          itemsFixed++;
        }
      }
    }

    if (itemsFixed > 0) {
      const barcodeFile = path.join(this.dataDir, 'barcode_mapping.json');
      fs.writeFileSync(barcodeFile, JSON.stringify(barcodeMapping, null, 2));
    }

    return { itemsFixed };
  }

  extractMeatSpecificBarcode(itemCode, description, orderData) {
    // Meat-specific extraction with higher confidence
    const meatKeywords = ['BACON', 'BEEF', 'PORK', 'CHICKEN', 'TURKEY', 'HAM'];
    const descUpper = description.toUpperCase();

    const primaryMeat = meatKeywords.find(meat => descUpper.includes(meat));

    if (primaryMeat) {
      for (const order of orderData) {
        if (order.items) {
          for (const item of order.items) {
            if (item.itemCode === itemCode ||
                (item.description && item.description.toUpperCase().includes(primaryMeat))) {

              // Look for barcodes near meat keywords
              const barcodePattern = /\b\d{10,14}\b/g;
              const matches = item.description?.match(barcodePattern);

              if (matches) {
                for (const match of matches) {
                  if (this.isValidBarcode(match) && match.length >= 12) {
                    return match;
                  }
                }
              }
            }
          }
        }
      }
    }

    return null;
  }

  async fixPriceDiscrepancies() {
    console.log('   💰 Fixing meat price discrepancies...');

    const pricingFile = path.join(this.dataDir, 'meat_pricing_analysis.json');
    if (!fs.existsSync(pricingFile)) {
      return { itemsFixed: 0 };
    }

    const pricingAnalysis = JSON.parse(fs.readFileSync(pricingFile, 'utf8'));
    const fifoInventory = this.loadFIFOInventory();

    let itemsFixed = 0;

    for (const issue of pricingAnalysis.meatPricingIssues.slice(0, 10)) {
      const itemData = fifoInventory.get(issue.itemCode);

      if (itemData && itemData.batches) {
        for (const batch of itemData.batches) {
          // Find matching order price
          const correctPrice = issue.orderPrices.find(op =>
            op.invoice === batch.invoice
          );

          if (correctPrice && Math.abs(batch.price - correctPrice.price) > 0.01) {
            console.log(`     Fixing ${issue.itemCode}: ${batch.price} → ${correctPrice.price}`);
            batch.price = correctPrice.price;
            itemsFixed++;
          }
        }
      }
    }

    if (itemsFixed > 0) {
      // Save updated FIFO inventory
      const fifoData = {
        inventory: Array.from(fifoInventory.entries()),
        lastUpdated: new Date().toISOString(),
        updatedBy: 'AI_Monitor'
      };

      const fifoFile = path.join(this.dataDir, 'fifo_inventory.json');
      fs.writeFileSync(fifoFile, JSON.stringify(fifoData, null, 2));
    }

    return { itemsFixed };
  }

  async improveBarcodeExtraction() {
    console.log('   📈 Improving barcode extraction algorithms...');

    // This would implement machine learning improvements
    // For now, we'll do an enhanced extraction pass
    return await this.extractAdditionalBarcodes();
  }

  isValidBarcode(barcode) {
    const code = barcode.toString();
    const validLengths = [8, 10, 11, 12, 13, 14];

    if (!validLengths.includes(code.length)) return false;
    if (!/^\\d+$/.test(code)) return false;
    if (code === '00000000' || code === '11111111') return false;
    if (code.startsWith('2025') || code.startsWith('2024')) return false;

    return true;
  }

  loadBarcodeMapping() {
    try {
      const barcodeFile = path.join(this.dataDir, 'barcode_mapping.json');
      return JSON.parse(fs.readFileSync(barcodeFile, 'utf8'));
    } catch (error) {
      return {};
    }
  }

  loadFIFOInventory() {
    try {
      const fifoFile = path.join(this.dataDir, 'fifo_inventory.json');
      const fifoData = JSON.parse(fs.readFileSync(fifoFile, 'utf8'));
      return new Map(fifoData.inventory || []);
    } catch (error) {
      return new Map();
    }
  }

  loadAllOrderData() {
    const orderData = [];
    const ordersDir = path.join(this.dataDir, 'gfs_orders');

    try {
      if (fs.existsSync(ordersDir)) {
        const orderFiles = fs.readdirSync(ordersDir)
          .filter(file => file.endsWith('.json') && !file.includes('corrupted'))
          .slice(0, 30); // Limit for performance

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

  async saveFix(fixRecord) {
    const fixLogFile = path.join(this.dataDir, 'ai_fix_log.json');

    let fixLog = [];
    if (fs.existsSync(fixLogFile)) {
      try {
        fixLog = JSON.parse(fs.readFileSync(fixLogFile, 'utf8'));
      } catch (error) {
        fixLog = [];
      }
    }

    fixLog.push(fixRecord);

    // Keep only last 100 fix records
    if (fixLog.length > 100) {
      fixLog = fixLog.slice(-100);
    }

    fs.writeFileSync(fixLogFile, JSON.stringify(fixLog, null, 2));
  }

  generateMonitoringReport() {
    console.log('\n📊 AI MONITORING REPORT');
    console.log('='.repeat(80));

    const successfulFixes = this.fixHistory.filter(fix => fix.success);
    const failedFixes = this.fixHistory.filter(fix => !fix.success);
    const totalItemsFixed = successfulFixes.reduce((sum, fix) => sum + fix.itemsFixed, 0);

    console.log(`📈 MONITORING STATISTICS:`);
    console.log(`  Total Fix Attempts: ${this.fixHistory.length}`);
    console.log(`  Successful Fixes: ${successfulFixes.length}`);
    console.log(`  Failed Fixes: ${failedFixes.length}`);
    console.log(`  Total Items Fixed: ${totalItemsFixed}`);

    if (this.lastAnalysis) {
      const coverage = (this.lastAnalysis.itemsWithBarcodes / this.lastAnalysis.totalItems) * 100;
      console.log(`  Final Barcode Coverage: ${coverage.toFixed(1)}%`);
      console.log(`  Remaining Issues: ${this.lastAnalysis.itemsWithoutBarcodes} items`);
    }

    console.log(`\\n🎯 TOP FIXES APPLIED:`);
    const fixTypes = {};
    successfulFixes.forEach(fix => {
      fixTypes[fix.type] = (fixTypes[fix.type] || 0) + fix.itemsFixed;
    });

    Object.entries(fixTypes)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .forEach(([type, count]) => {
        console.log(`  • ${type}: ${count} items`);
      });

    // Save monitoring report
    const report = {
      timestamp: new Date().toISOString(),
      totalAttempts: this.fixHistory.length,
      successfulFixes: successfulFixes.length,
      totalItemsFixed: totalItemsFixed,
      fixHistory: this.fixHistory,
      finalAnalysis: this.lastAnalysis
    };

    fs.writeFileSync(
      path.join(this.dataDir, 'ai_monitoring_report.json'),
      JSON.stringify(report, null, 2)
    );

    console.log(`\\n💾 Monitoring report saved`);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  stopMonitoring() {
    this.monitoringActive = false;
    console.log('\\n⏹️ Monitoring stop requested');
  }
}

// Run AI Monitor if called directly
if (require.main === module) {
  const monitor = new AIMonitor();

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\\n🛑 Received interrupt signal');
    monitor.stopMonitoring();
  });

  process.on('SIGTERM', () => {
    console.log('\\n🛑 Received terminate signal');
    monitor.stopMonitoring();
  });

  monitor.startMonitoring().catch(console.error);
}

module.exports = AIMonitor;