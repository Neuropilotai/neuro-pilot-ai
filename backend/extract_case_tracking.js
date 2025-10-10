const fs = require('fs');
const path = require('path');

console.log('🥩 CASE-LEVEL TRACKING EXTRACTION FOR MEAT PRODUCTS');
console.log('='.repeat(80));

class CaseTrackingExtractor {
  constructor() {
    this.caseTrackingData = {};
    this.dataDir = './data';
    this.outputFile = path.join(this.dataDir, 'case_tracking.json');
  }

  // Add case tracking for meat products with individual case details
  addCaseTracking(invoiceNumber, itemCode, description, barcode, cases) {
    if (!this.caseTrackingData[itemCode]) {
      this.caseTrackingData[itemCode] = {
        itemCode,
        description,
        barcode,
        invoices: {},
        totalCases: 0,
        totalWeight: 0
      };
    }

    this.caseTrackingData[itemCode].invoices[invoiceNumber] = {
      invoiceNumber,
      cases: cases,
      totalCases: cases.length,
      totalWeight: cases.reduce((sum, c) => sum + c.weight, 0),
      date: new Date().toISOString().split('T')[0]
    };

    // Update totals
    this.caseTrackingData[itemCode].totalCases += cases.length;
    this.caseTrackingData[itemCode].totalWeight += cases.reduce((sum, c) => sum + c.weight, 0);

    console.log(`✓ Added ${cases.length} cases for ${itemCode} from invoice ${invoiceNumber}`);
  }

  // Get FIFO case usage for inventory management
  getFIFOCases(itemCode, quantityNeeded) {
    if (!this.caseTrackingData[itemCode]) {
      return { casesToUse: [], remainingQuantity: quantityNeeded };
    }

    const allCases = [];
    const item = this.caseTrackingData[itemCode];

    // Collect all cases from all invoices, sorted by date (FIFO)
    Object.values(item.invoices).forEach(invoice => {
      invoice.cases.forEach(caseData => {
        allCases.push({
          ...caseData,
          invoiceNumber: invoice.invoiceNumber,
          date: invoice.date
        });
      });
    });

    // Sort by date for FIFO
    allCases.sort((a, b) => new Date(a.date) - new Date(b.date));

    const casesToUse = [];
    let remainingQuantity = quantityNeeded;

    for (const caseData of allCases) {
      if (remainingQuantity <= 0) break;

      if (caseData.weight <= remainingQuantity) {
        // Use entire case
        casesToUse.push({
          ...caseData,
          usedWeight: caseData.weight,
          fullyUsed: true
        });
        remainingQuantity -= caseData.weight;
      } else {
        // Partially use case
        casesToUse.push({
          ...caseData,
          usedWeight: remainingQuantity,
          fullyUsed: false
        });
        remainingQuantity = 0;
      }
    }

    return { casesToUse, remainingQuantity };
  }

  // Generate inventory count report by cases
  generateCaseInventoryReport(itemCode) {
    if (!this.caseTrackingData[itemCode]) {
      return null;
    }

    const item = this.caseTrackingData[itemCode];
    console.log(`\n📦 CASE INVENTORY REPORT for ${itemCode}:`);
    console.log(`Description: ${item.description}`);
    console.log(`Barcode: ${item.barcode}`);
    console.log(`Total Cases Received: ${item.totalCases}`);
    console.log(`Total Weight: ${item.totalWeight.toFixed(2)} lbs`);

    console.log('\n📋 CASES BY INVOICE:');
    Object.values(item.invoices).forEach(invoice => {
      console.log(`\n  Invoice ${invoice.invoiceNumber} (${invoice.date}):`);
      invoice.cases.forEach((caseData, index) => {
        console.log(`    Case ${index + 1}: ${caseData.caseNumber} - ${caseData.weight} lbs`);
      });
      console.log(`    Subtotal: ${invoice.totalCases} cases, ${invoice.totalWeight.toFixed(2)} lbs`);
    });

    return item;
  }

  // Save case tracking data
  saveData() {
    const data = {
      caseTrackingData: this.caseTrackingData,
      lastUpdated: new Date().toISOString(),
      totalItems: Object.keys(this.caseTrackingData).length
    };

    fs.writeFileSync(this.outputFile, JSON.stringify(data, null, 2));
    console.log(`✓ Case tracking data saved to ${this.outputFile}`);
  }

  // Load existing case tracking data
  loadData() {
    try {
      if (fs.existsSync(this.outputFile)) {
        const data = JSON.parse(fs.readFileSync(this.outputFile, 'utf8'));
        this.caseTrackingData = data.caseTrackingData || {};
        console.log(`✓ Loaded existing case tracking data for ${Object.keys(this.caseTrackingData).length} items`);
      }
    } catch (error) {
      console.log('⚠️ Starting with fresh case tracking data');
    }
  }
}

// Initialize the extractor
const extractor = new CaseTrackingExtractor();
extractor.loadData();

// Add the specific turkey case tracking data from invoice 9018827286
console.log('\n🦃 Adding Turkey Breast Case Tracking Data...');
extractor.addCaseTracking(
  '9018827286',
  '8780438',
  'TURKEY BRST RST CKD SMKD B/S 19PCT FRSH',
  '90065137513642',
  [
    { caseNumber: '410141284722', weight: 5.88 },
    { caseNumber: '410141284723', weight: 5.80 },
    { caseNumber: '410141284724', weight: 5.90 }
  ]
);

// Demonstrate FIFO case usage
console.log('\n🔄 FIFO Case Usage Demonstration:');
console.log('Scenario: Using 10.0 lbs of turkey for production...');

const fifoResult = extractor.getFIFOCases('8780438', 10.0);
console.log('\nCases to use (FIFO order):');
fifoResult.casesToUse.forEach((caseData, index) => {
  console.log(`  ${index + 1}. Case ${caseData.caseNumber}: ${caseData.usedWeight} lbs ${caseData.fullyUsed ? '(fully used)' : '(partially used)'}`);
});
console.log(`Remaining quantity needed: ${fifoResult.remainingQuantity.toFixed(2)} lbs`);

// Generate case inventory report
extractor.generateCaseInventoryReport('8780438');

// Example of adding more meat products with case tracking
console.log('\n🥓 Adding Additional Meat Products...');

// Example bacon case tracking
extractor.addCaseTracking(
  '9018357843',
  '1206417',
  'BACON RAW 18-22CT SLCD L/O FRSH',
  '12345678901234', // Example barcode
  [
    { caseNumber: '410141200001', weight: 30.0 },
    { caseNumber: '410141200002', weight: 30.0 }
  ]
);

// Example ground beef case tracking
extractor.addCaseTracking(
  '9020000001',
  '2000001',
  'GROUND BEEF 80/20 FRESH',
  '98765432109876', // Example barcode
  [
    { caseNumber: '410141300001', weight: 10.0 },
    { caseNumber: '410141300002', weight: 10.0 },
    { caseNumber: '410141300003', weight: 10.0 }
  ]
);

// Save the data
extractor.saveData();

console.log('\n📊 CASE TRACKING SUMMARY:');
console.log(`Total Items with Case Tracking: ${Object.keys(extractor.caseTrackingData).length}`);
console.log('Items:');
Object.values(extractor.caseTrackingData).forEach(item => {
  console.log(`  ${item.itemCode}: ${item.totalCases} cases, ${item.totalWeight.toFixed(2)} lbs total`);
});

console.log('\n🎯 INTEGRATION POINTS:');
console.log('1. This case tracking integrates with FIFO inventory system');
console.log('2. Each case has unique identifier for precise tracking');
console.log('3. Weight-based calculations support variable meat weights');
console.log('4. FIFO ensures oldest cases are used first');
console.log('5. Barcode integration supports future scanning implementation');

// Export for use in other modules
module.exports = CaseTrackingExtractor;