#!/usr/bin/env node

/**
 * COMPREHENSIVE CASE-LEVEL TRACKING SYSTEM
 *
 * Extracts and tracks individual cases with weights from GFS PDFs
 * Enables FIFO rotation monitoring and spot-checking
 */

const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');

console.log('📦 COMPREHENSIVE CASE TRACKING SYSTEM');
console.log('='.repeat(80));

class CaseTrackingSystem {
  constructor() {
    this.caseInventory = {};  // itemCode -> cases[]
    this.dataDir = './data';
    this.pdfDir = './data/pdfs';
    this.ordersDir = './data/gfs_orders';
    this.outputFile = path.join(this.dataDir, 'case_inventory.json');
    this.stats = {
      pdfsProcessed: 0,
      casesExtracted: 0,
      itemsWithCases: 0
    };
  }

  /**
   * Extract case tracking data from a single PDF
   */
  async extractCasesFromPDF(pdfPath, invoiceNumber) {
    try {
      const dataBuffer = fs.readFileSync(pdfPath);
      const pdfData = await pdf(dataBuffer);
      const text = pdfData.text;

      // Extract invoice date
      const dateMatch = text.match(/Invoice\s*Date\s*[:\n]*(\d{2}\/\d{2}\/\d{4})/i);
      const invoiceDate = dateMatch ? this.parseDate(dateMatch[1]) : new Date().toISOString().split('T')[0];

      // Pattern to match item lines followed by case tracking
      // Example:
      // 1169211 5 BEEF STRIPLN 0X1 1/4IN 6KG/UP CAB FRSH MT 33.43 5,194.69 CS 5 5x6 KGA CAB 90061741878276
      // CASE: 410149599095 WEIGHT: 31.09
      // CASE: 410149599096 WEIGHT: 30.69
      // TOTAL WEIGHT: 155.39

      const lines = text.split('\n');
      const casesExtracted = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Check if this line starts with "CASE:"
        if (line.match(/^CASE:\s*(\d+)\s+WEIGHT:\s*([\d.]+)/)) {
          // Find the item line (go backwards to find item code and description)
          let itemCode = null;
          let description = null;
          let barcode = null;
          let unit = null;
          let unitPrice = null;

          // Search backwards for item line (usually 2 lines before: item line, barcode line, then CASE line)
          for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
            const prevLine = lines[j];

            // Check if previous line is barcode (14 digits)
            const barcodeMatch = prevLine.match(/^(\d{14})$/);
            if (barcodeMatch && j > 0) {
              barcode = barcodeMatch[1];

              // Item line should be the line before barcode
              const itemLine = lines[j - 1];

              // Pattern: 11841572BEEF CHUCK SHORT RIB B/IN WHL AA FRSHMT19.00882.74CS
              // Item code (8 digits) + Description + Unit (MT/FR/LB/etc) + Price + Total + CS/CT/etc
              const itemMatch = itemLine.match(/^(\d{7,8})([A-Z\s\/\-\.\(\)]+?)(MT|FR|LB|KG|CS|CT|DZ|EA|PC|UN|BX|PK|PR)([\d.]+)([\d,]+\.?\d*)(CS|CT|DZ|EA|BX)?/i);

              if (itemMatch) {
                itemCode = itemMatch[1];
                description = itemMatch[2].trim();
                unit = itemMatch[3];
                unitPrice = parseFloat(itemMatch[4]);
                break;
              }
            }

            // Also try direct match for item line without requiring barcode
            const directItemMatch = prevLine.match(/^(\d{7,8})([A-Z\s\/\-\.\(\)]+?)(MT|FR|LB|KG|CS|CT|DZ|EA|PC|UN|BX|PK|PR)([\d.]+)([\d,]+\.?\d*)/i);
            if (directItemMatch) {
              itemCode = directItemMatch[1];
              description = directItemMatch[2].trim();
              unit = directItemMatch[3];
              unitPrice = parseFloat(directItemMatch[4]);

              // Try to find barcode in next line
              if (j + 1 < lines.length) {
                const nextBarcode = lines[j + 1].match(/^(\d{14})$/);
                if (nextBarcode) barcode = nextBarcode[1];
              }

              break;
            }
          }

          if (itemCode) {
            // Collect all cases for this item
            const itemCases = [];
            let totalWeight = 0;

            for (let k = i; k < lines.length; k++) {
              const caseLine = lines[k];
              const caseMatch = caseLine.match(/^CASE:\s*(\d+)\s+WEIGHT:\s*([\d.]+)/);

              if (caseMatch) {
                const caseNumber = caseMatch[1];
                const weight = parseFloat(caseMatch[2]);
                itemCases.push({ caseNumber, weight });
                totalWeight += weight;
              } else if (caseLine.match(/^TOTAL WEIGHT:/)) {
                // End of cases for this item
                break;
              } else if (caseLine.trim() && !caseLine.match(/^CASE:/)) {
                // Different content, end of cases
                break;
              }
            }

            if (itemCases.length > 0) {
              casesExtracted.push({
                itemCode,
                description,
                barcode,
                unit,
                unitPrice,
                invoiceNumber,
                invoiceDate,
                cases: itemCases,
                totalWeight,
                totalCases: itemCases.length
              });

              console.log(`  ✓ ${itemCode}: ${itemCases.length} cases, ${totalWeight.toFixed(2)} ${unit}`);
              this.stats.casesExtracted += itemCases.length;
            }
          }
        }
      }

      return casesExtracted;
    } catch (error) {
      console.error(`  ✗ Error extracting from ${invoiceNumber}:`, error.message);
      return [];
    }
  }

  /**
   * Parse date from MM/DD/YYYY to YYYY-MM-DD
   */
  parseDate(dateStr) {
    const [month, day, year] = dateStr.split('/');
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  /**
   * Add cases to inventory with FIFO ordering
   */
  addCasesToInventory(itemData) {
    const { itemCode, description, barcode, unit, unitPrice, invoiceNumber, invoiceDate, cases, totalWeight } = itemData;

    if (!this.caseInventory[itemCode]) {
      this.caseInventory[itemCode] = {
        itemCode,
        description,
        barcode,
        unit,
        unitPrice,
        invoices: {},
        allCases: [],
        totalCases: 0,
        totalWeight: 0,
        oldestCase: null,
        newestCase: null
      };
      this.stats.itemsWithCases++;
    }

    const item = this.caseInventory[itemCode];

    // Add invoice entry
    item.invoices[invoiceNumber] = {
      invoiceNumber,
      invoiceDate,
      cases: cases,
      totalCases: cases.length,
      totalWeight
    };

    // Add cases to allCases array with metadata
    cases.forEach(caseData => {
      item.allCases.push({
        caseNumber: caseData.caseNumber,
        caseNumberShort: caseData.caseNumber.slice(-4),  // Last 4 digits for easy spotting
        weight: caseData.weight,
        invoiceNumber,
        invoiceDate,
        status: 'IN_STOCK',  // IN_STOCK, PARTIAL, USED
        remainingWeight: caseData.weight,
        usageHistory: []
      });
    });

    // Sort cases by date (FIFO)
    item.allCases.sort((a, b) => new Date(a.invoiceDate) - new Date(b.invoiceDate));

    // Update totals
    item.totalCases = item.allCases.filter(c => c.status !== 'USED').length;
    item.totalWeight = item.allCases
      .filter(c => c.status !== 'USED')
      .reduce((sum, c) => sum + c.remainingWeight, 0);

    // Update oldest/newest
    const activeCases = item.allCases.filter(c => c.status !== 'USED');
    if (activeCases.length > 0) {
      item.oldestCase = activeCases[0];
      item.newestCase = activeCases[activeCases.length - 1];
    }
  }

  /**
   * Use cases from inventory (FIFO)
   */
  useCases(itemCode, quantityNeeded) {
    if (!this.caseInventory[itemCode]) {
      return { success: false, message: 'Item not found', casesUsed: [] };
    }

    const item = this.caseInventory[itemCode];
    const availableCases = item.allCases.filter(c => c.status !== 'USED');

    if (availableCases.length === 0) {
      return { success: false, message: 'No cases available', casesUsed: [] };
    }

    const casesUsed = [];
    let remaining = quantityNeeded;

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
          remainingAfter: 0
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
          remainingAfter: caseData.remainingWeight - remaining
        });

        caseData.remainingWeight -= remaining;
        caseData.status = 'PARTIAL';
        remaining = 0;
      }
    }

    return {
      success: remaining === 0,
      quantityUsed: quantityNeeded - remaining,
      quantityRemaining: remaining,
      casesUsed
    };
  }

  /**
   * Get rotation report (case age analysis)
   */
  getRotationReport(itemCode) {
    if (!this.caseInventory[itemCode]) {
      return null;
    }

    const item = this.caseInventory[itemCode];
    const today = new Date();
    const activeCases = item.allCases.filter(c => c.status !== 'USED');

    const report = {
      itemCode,
      description: item.description,
      totalActiveCases: activeCases.length,
      totalWeight: item.totalWeight,
      oldestCaseAge: null,
      cases: activeCases.map(c => {
        const caseDate = new Date(c.invoiceDate);
        const ageInDays = Math.floor((today - caseDate) / (1000 * 60 * 60 * 24));

        return {
          caseNumberShort: c.caseNumberShort,
          caseNumberFull: c.caseNumber,
          weight: c.weight,
          remainingWeight: c.remainingWeight,
          invoiceDate: c.invoiceDate,
          ageInDays,
          status: c.status,
          rotationStatus: ageInDays > 30 ? 'AGED' : ageInDays > 14 ? 'AGING' : 'FRESH'
        };
      })
    };

    if (activeCases.length > 0) {
      const oldestDate = new Date(activeCases[0].invoiceDate);
      report.oldestCaseAge = Math.floor((today - oldestDate) / (1000 * 60 * 60 * 24));
    }

    return report;
  }

  /**
   * Process all PDFs
   */
  async processAllPDFs() {
    console.log('\n📂 Processing PDFs...\n');

    // Check both directories
    const dirs = [this.pdfDir, this.ordersDir];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) continue;

      const files = fs.readdirSync(dir)
        .filter(f => f.endsWith('.pdf'))
        .sort();

      console.log(`  Processing ${files.length} PDFs from ${dir}...\n`);

      for (const file of files) {
        const invoiceNumber = path.basename(file, '.pdf');
        const pdfPath = path.join(dir, file);

        console.log(`  📄 ${invoiceNumber}`);

        const casesData = await this.extractCasesFromPDF(pdfPath, invoiceNumber);

        casesData.forEach(itemData => {
          this.addCasesToInventory(itemData);
        });

        this.stats.pdfsProcessed++;
      }
    }
  }

  /**
   * Save case inventory
   */
  save() {
    const data = {
      caseInventory: this.caseInventory,
      stats: this.stats,
      lastUpdated: new Date().toISOString()
    };

    fs.writeFileSync(this.outputFile, JSON.stringify(data, null, 2));
    console.log(`\n✅ Case inventory saved to ${this.outputFile}`);
  }

  /**
   * Generate summary report
   */
  printSummary() {
    console.log('\n' + '='.repeat(80));
    console.log('📊 CASE TRACKING SUMMARY');
    console.log('='.repeat(80));
    console.log(`PDFs Processed: ${this.stats.pdfsProcessed}`);
    console.log(`Total Cases Extracted: ${this.stats.casesExtracted}`);
    console.log(`Items with Case Tracking: ${this.stats.itemsWithCases}`);
    console.log('');

    // Show top 10 items by case count
    const sorted = Object.values(this.caseInventory)
      .sort((a, b) => b.totalCases - a.totalCases)
      .slice(0, 10);

    console.log('🥇 TOP 10 ITEMS BY CASE COUNT:');
    sorted.forEach((item, i) => {
      console.log(`${i + 1}. ${item.itemCode} - ${item.description.substring(0, 40)}`);
      console.log(`   Cases: ${item.totalCases}, Weight: ${item.totalWeight.toFixed(2)} ${item.unit}`);
      if (item.oldestCase) {
        console.log(`   Oldest: ...${item.oldestCase.caseNumberShort} (${item.oldestCase.invoiceDate})`);
      }
      console.log('');
    });
  }
}

// Run the system
async function main() {
  const tracker = new CaseTrackingSystem();

  await tracker.processAllPDFs();
  tracker.save();
  tracker.printSummary();

  // Example: Show rotation report for first item
  const firstItem = Object.keys(tracker.caseInventory)[0];
  if (firstItem) {
    console.log('\n📋 SAMPLE ROTATION REPORT:');
    const report = tracker.getRotationReport(firstItem);
    if (report) {
      console.log(`Item: ${report.itemCode} - ${report.description}`);
      console.log(`Active Cases: ${report.totalActiveCases}`);
      console.log(`Oldest Case Age: ${report.oldestCaseAge} days`);
      console.log('\nCases (FIFO order):');
      report.cases.slice(0, 5).forEach(c => {
        console.log(`  ...${c.caseNumberShort}: ${c.remainingWeight.toFixed(2)} lbs, ${c.ageInDays} days old [${c.rotationStatus}]`);
      });
    }
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = CaseTrackingSystem;
