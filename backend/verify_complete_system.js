const fs = require('fs');
const path = require('path');

console.log('🔍 COMPREHENSIVE SYSTEM VERIFICATION');
console.log('='.repeat(80));

class SystemVerifier {
  constructor() {
    this.issues = [];
    this.dataDir = './data';
    this.results = {
      totalItems: 0,
      itemsWithBarcodes: 0,
      itemsWithoutBarcodes: 0,
      itemsWithCleanNames: 0,
      itemsWithIssues: 0,
      priceDiscrepancies: 0,
      fifoIntegrity: true,
      caseTrackingActive: false
    };
  }

  // Verify all inventory items
  async verifyAllItems() {
    console.log('\n📋 VERIFYING ALL INVENTORY ITEMS...');

    try {
      // Load FIFO inventory data
      const fifoFile = path.join(this.dataDir, 'fifo_inventory.json');
      if (!fs.existsSync(fifoFile)) {
        this.addIssue('CRITICAL', 'FIFO inventory file not found');
        return false;
      }

      const fifoData = JSON.parse(fs.readFileSync(fifoFile, 'utf8'));
      const inventory = new Map(fifoData.inventory || []);

      console.log(`✓ Loaded ${inventory.size} items from FIFO inventory`);
      this.results.totalItems = inventory.size;

      // Load barcode mapping
      const barcodeFile = path.join(this.dataDir, 'barcode_mapping.json');
      let barcodeMapping = {};
      if (fs.existsSync(barcodeFile)) {
        const barcodeData = JSON.parse(fs.readFileSync(barcodeFile, 'utf8'));
        Object.values(barcodeData).forEach(item => {
          if (item.barcode) {
            barcodeMapping[item.itemCode] = item.barcode;
          }
        });
        console.log(`✓ Loaded ${Object.keys(barcodeMapping).length} barcodes from mapping`);
      }

      // Manual barcode overrides (from enterprise system)
      const manualBarcodes = {
        '1030954': '10057483521109', // PASTRY BRIOCHE CINN RTB
        '8780438': '90065137513642', // TURKEY BRST RST CKD SMKD B/S 19PCT FRSH
        '1206417': '10061853000972', // BACON RAW 18-22CT SLCD L/O FRSH
      };

      // Verify each item
      let itemsChecked = 0;
      for (const [itemCode, itemData] of inventory.entries()) {
        itemsChecked++;
        this.verifyIndividualItem(itemCode, itemData, barcodeMapping, manualBarcodes);

        if (itemsChecked % 100 === 0) {
          console.log(`  Checked ${itemsChecked}/${inventory.size} items...`);
        }
      }

      console.log(`✓ Verification complete: ${itemsChecked} items checked`);
      return true;

    } catch (error) {
      this.addIssue('CRITICAL', `Error verifying items: ${error.message}`);
      return false;
    }
  }

  // Verify individual item
  verifyIndividualItem(itemCode, itemData, barcodeMapping, manualBarcodes) {
    // Check for barcode
    const hasBarcode = manualBarcodes[itemCode] || barcodeMapping[itemCode];
    if (hasBarcode) {
      this.results.itemsWithBarcodes++;
    } else {
      this.results.itemsWithoutBarcodes++;
    }

    // Check item name quality
    if (this.isCleanItemName(itemData.description)) {
      this.results.itemsWithCleanNames++;
    } else {
      this.addIssue('MEDIUM', `Item ${itemCode} has unclean name: ${itemData.description}`);
      this.results.itemsWithIssues++;
    }

    // Check FIFO integrity
    if (itemData.batches && itemData.batches.length > 0) {
      for (let i = 0; i < itemData.batches.length - 1; i++) {
        const currentBatch = itemData.batches[i];
        const nextBatch = itemData.batches[i + 1];

        if (new Date(currentBatch.date) > new Date(nextBatch.date)) {
          this.addIssue('HIGH', `FIFO order violation in item ${itemCode}: batch ${i} is newer than batch ${i+1}`);
          this.results.fifoIntegrity = false;
        }
      }
    }

    // Check for zero prices
    if (itemData.batches) {
      for (const batch of itemData.batches) {
        if (batch.price === 0 || batch.price === null || batch.price === undefined) {
          this.addIssue('HIGH', `Item ${itemCode} has zero price in batch from ${batch.date}`);
          this.results.priceDiscrepancies++;
        }
      }
    }
  }

  // Check if item name is clean
  isCleanItemName(description) {
    if (!description) return false;

    // Check for common junk patterns
    const junkPatterns = [
      /^CS \d+X\d+(\.\d+)?\s+KG\s+/i,  // CS 6X1.13 KG prefix
      /^LB \d+\s+/i,                    // LB prefix
      /^\d+\s+CS\s+/i,                  // Number CS prefix
      /\s+CS$|^CS\s+/i                  // CS suffix/prefix
    ];

    for (const pattern of junkPatterns) {
      if (pattern.test(description)) {
        return false;
      }
    }

    return true;
  }

  // Verify case tracking system
  verifyCaseTracking() {
    console.log('\n🥩 VERIFYING CASE TRACKING SYSTEM...');

    const caseFile = path.join(this.dataDir, 'case_tracking.json');
    if (fs.existsSync(caseFile)) {
      try {
        const caseData = JSON.parse(fs.readFileSync(caseFile, 'utf8'));
        const itemCount = Object.keys(caseData.caseTrackingData || {}).length;

        console.log(`✓ Case tracking active with ${itemCount} tracked items`);
        this.results.caseTrackingActive = true;

        // Verify specific items we know should be there
        const expectedItems = ['8780438', '1206417', '2000001'];
        for (const itemCode of expectedItems) {
          if (caseData.caseTrackingData[itemCode]) {
            const item = caseData.caseTrackingData[itemCode];
            console.log(`  ✓ ${itemCode}: ${item.totalCases} cases, ${item.totalWeight} lbs`);
          } else {
            this.addIssue('MEDIUM', `Expected case tracking item ${itemCode} not found`);
          }
        }

      } catch (error) {
        this.addIssue('MEDIUM', `Error reading case tracking data: ${error.message}`);
      }
    } else {
      this.addIssue('LOW', 'Case tracking file not found');
    }
  }

  // Verify dashboard compatibility
  verifyDashboardCompatibility() {
    console.log('\n📱 VERIFYING DASHBOARD COMPATIBILITY...');

    const dashboardFile = path.join('./public', 'dashboard.html');
    if (fs.existsSync(dashboardFile)) {
      const dashboardContent = fs.readFileSync(dashboardFile, 'utf8');

      // Check for required columns
      const requiredElements = [
        'Item Code',
        'Item Name',
        'Barcode',
        'Category'
      ];

      let allElementsFound = true;
      for (const element of requiredElements) {
        if (!dashboardContent.includes(element)) {
          this.addIssue('HIGH', `Dashboard missing required element: ${element}`);
          allElementsFound = false;
        }
      }

      if (allElementsFound) {
        console.log('✓ Dashboard has all required columns');
      }

    } else {
      this.addIssue('HIGH', 'Dashboard file not found');
    }
  }

  // Verify price validation system
  async verifyPriceValidation() {
    console.log('\n💰 VERIFYING PRICE VALIDATION SYSTEM...');

    try {
      const FIFOInventoryManager = require('./fifo_inventory_system');
      const fifo = new FIFOInventoryManager();

      // Run a quick price validation check
      const validationResults = fifo.validatePricesWithOrders();

      console.log(`✓ Price validation system operational`);
      console.log(`  Items checked: ${validationResults.validationResults.totalItemsChecked}`);
      console.log(`  Price matches: ${validationResults.validationResults.priceMatches}`);
      console.log(`  Discrepancies: ${validationResults.validationResults.priceDiscrepancies}`);

      this.results.priceDiscrepancies = validationResults.validationResults.priceDiscrepancies;

    } catch (error) {
      this.addIssue('HIGH', `Price validation system error: ${error.message}`);
    }
  }

  // Add issue to list
  addIssue(severity, message) {
    this.issues.push({ severity, message, timestamp: new Date().toISOString() });
  }

  // Generate comprehensive report
  generateReport() {
    console.log('\n📊 COMPREHENSIVE SYSTEM REPORT');
    console.log('='.repeat(80));

    // Summary statistics
    console.log('📈 INVENTORY STATISTICS:');
    console.log(`  Total Items: ${this.results.totalItems}`);
    console.log(`  Items with Barcodes: ${this.results.itemsWithBarcodes} (${(this.results.itemsWithBarcodes/this.results.totalItems*100).toFixed(1)}%)`);
    console.log(`  Items without Barcodes: ${this.results.itemsWithoutBarcodes} (${(this.results.itemsWithoutBarcodes/this.results.totalItems*100).toFixed(1)}%)`);
    console.log(`  Items with Clean Names: ${this.results.itemsWithCleanNames} (${(this.results.itemsWithCleanNames/this.results.totalItems*100).toFixed(1)}%)`);
    console.log(`  Items with Issues: ${this.results.itemsWithIssues}`);

    // System health
    console.log('\n🔧 SYSTEM HEALTH:');
    console.log(`  FIFO Integrity: ${this.results.fifoIntegrity ? '✓ GOOD' : '❌ COMPROMISED'}`);
    console.log(`  Case Tracking: ${this.results.caseTrackingActive ? '✓ ACTIVE' : '❌ INACTIVE'}`);
    console.log(`  Price Discrepancies: ${this.results.priceDiscrepancies}`);

    // Issues by severity
    console.log('\n🚨 ISSUES FOUND:');
    const criticalIssues = this.issues.filter(i => i.severity === 'CRITICAL');
    const highIssues = this.issues.filter(i => i.severity === 'HIGH');
    const mediumIssues = this.issues.filter(i => i.severity === 'MEDIUM');
    const lowIssues = this.issues.filter(i => i.severity === 'LOW');

    console.log(`  Critical: ${criticalIssues.length}`);
    console.log(`  High: ${highIssues.length}`);
    console.log(`  Medium: ${mediumIssues.length}`);
    console.log(`  Low: ${lowIssues.length}`);

    // Show critical and high issues
    if (criticalIssues.length > 0) {
      console.log('\n🔥 CRITICAL ISSUES:');
      criticalIssues.forEach((issue, i) => {
        console.log(`  ${i+1}. ${issue.message}`);
      });
    }

    if (highIssues.length > 0) {
      console.log('\n⚠️ HIGH PRIORITY ISSUES:');
      highIssues.slice(0, 10).forEach((issue, i) => {
        console.log(`  ${i+1}. ${issue.message}`);
      });
      if (highIssues.length > 10) {
        console.log(`  ... and ${highIssues.length - 10} more high priority issues`);
      }
    }

    // Overall system grade
    console.log('\n🎯 SYSTEM GRADE:');
    const grade = this.calculateSystemGrade();
    console.log(`  Overall Grade: ${grade.letter} (${grade.percentage}%)`);
    console.log(`  Status: ${grade.status}`);

    // Recommendations
    console.log('\n💡 RECOMMENDATIONS:');
    this.generateRecommendations().forEach(rec => {
      console.log(`  • ${rec}`);
    });

    return {
      results: this.results,
      issues: this.issues,
      grade: grade
    };
  }

  // Calculate system grade
  calculateSystemGrade() {
    let score = 100;

    // Filter issues by severity
    const criticalIssues = this.issues.filter(i => i.severity === 'CRITICAL');
    const highIssues = this.issues.filter(i => i.severity === 'HIGH');
    const mediumIssues = this.issues.filter(i => i.severity === 'MEDIUM');
    const lowIssues = this.issues.filter(i => i.severity === 'LOW');

    // Deduct points for issues
    score -= criticalIssues.length * 20;
    score -= highIssues.length * 10;
    score -= mediumIssues.length * 5;
    score -= lowIssues.length * 1;

    // Deduct for missing features
    if (!this.results.fifoIntegrity) score -= 15;
    if (!this.results.caseTrackingActive) score -= 10;
    if (this.results.itemsWithoutBarcodes / this.results.totalItems > 0.5) score -= 10;

    score = Math.max(0, score);

    let letter, status;
    if (score >= 95) {
      letter = 'A+';
      status = 'EXCELLENT';
    } else if (score >= 90) {
      letter = 'A';
      status = 'VERY GOOD';
    } else if (score >= 85) {
      letter = 'B+';
      status = 'GOOD';
    } else if (score >= 80) {
      letter = 'B';
      status = 'SATISFACTORY';
    } else if (score >= 70) {
      letter = 'C';
      status = 'NEEDS IMPROVEMENT';
    } else {
      letter = 'F';
      status = 'CRITICAL ISSUES';
    }

    return { percentage: score, letter, status };
  }

  // Generate recommendations
  generateRecommendations() {
    const recommendations = [];

    if (this.results.itemsWithoutBarcodes > this.results.itemsWithBarcodes) {
      recommendations.push('Implement comprehensive barcode extraction for remaining items');
    }

    if (this.results.itemsWithIssues > 0) {
      recommendations.push('Clean up item names to remove packaging prefixes');
    }

    if (!this.results.fifoIntegrity) {
      recommendations.push('Fix FIFO batch ordering to ensure oldest-first inventory rotation');
    }

    if (this.results.priceDiscrepancies > 50) {
      recommendations.push('Review PDF extraction algorithms for pricing accuracy');
    }

    if (!this.results.caseTrackingActive) {
      recommendations.push('Activate case tracking for meat products');
    }

    const criticalIssues = this.issues.filter(i => i.severity === 'CRITICAL');
    if (criticalIssues.length > 0) {
      recommendations.push('Address critical system issues immediately');
    }

    return recommendations;
  }
}

// Run comprehensive verification
async function runCompleteVerification() {
  const verifier = new SystemVerifier();

  console.log('🚀 Starting comprehensive system verification...\n');

  await verifier.verifyAllItems();
  verifier.verifyCaseTracking();
  verifier.verifyDashboardCompatibility();
  await verifier.verifyPriceValidation();

  const report = verifier.generateReport();

  // Save report to file
  const reportFile = path.join('./data', 'system_verification_report.json');
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  console.log(`\n💾 Full report saved to: ${reportFile}`);

  return report;
}

// Run if called directly
if (require.main === module) {
  runCompleteVerification().catch(console.error);
}

module.exports = SystemVerifier;