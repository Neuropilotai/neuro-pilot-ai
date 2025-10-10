#!/usr/bin/env node

/**
 * ENTERPRISE BARCODE EXTRACTION SYSTEM
 *
 * Extracts barcodes from ALL GFS PDFs for complete inventory coverage
 * Target: 100% barcode coverage for world-class inventory tracking
 */

const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');

console.log('🏢 ENTERPRISE BARCODE EXTRACTION SYSTEM');
console.log('='.repeat(80));
console.log('Target: 100% Barcode Coverage for All Inventory Items');
console.log('='.repeat(80));

class EnterpriseBarcodeExtractor {
  constructor() {
    this.barcodeMapping = {};
    this.pdfDir = './data/pdfs';
    this.ordersDir = './data/gfs_orders';
    this.stats = {
      pdfsProcessed: 0,
      barcodesExtracted: 0,
      itemsFound: 0,
      errors: 0
    };
  }

  /**
   * Extract all barcodes from a single PDF
   */
  async extractBarcodesFromPDF(pdfPath, invoiceNumber) {
    try {
      const dataBuffer = fs.readFileSync(pdfPath);
      const pdfData = await pdf(dataBuffer);
      const text = pdfData.text;
      const lines = text.split('\n');

      const barcodesFound = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Pattern 1: Item code followed by description and barcode
        // Example: 10065781 WINE TABLE WH W/SALT 11P ... 90065781123456
        const itemCodeMatch = line.match(/^(\d{7,8})/);

        if (itemCodeMatch) {
          const itemCode = itemCodeMatch[1];

          // Look for description and details in current line
          let description = '';
          let barcode = '';
          let unit = '';
          let price = '';

          // Extract from current line
          const fullLineMatch = line.match(/^(\d{7,8})\s*(\d*)\s*(.+?)(?:(MT|FR|LB|KG|CS|CT|DZ|EA|PC|UN|BX|PK|PR|DY|IT).*?([\d.]+)\s+([\d,]+\.?\d*))?$/i);

          if (fullLineMatch) {
            description = fullLineMatch[3] ? fullLineMatch[3].trim() : '';
            unit = fullLineMatch[4] || '';
            price = fullLineMatch[5] || '';
          }

          // Check next few lines for barcode (14 digits) and additional info
          for (let j = i; j < Math.min(i + 5, lines.length); j++) {
            const nextLine = lines[j].trim();

            // Look for 14-digit barcode (GFS format: 90XXXXXXXXXXX)
            const barcodeMatch = nextLine.match(/\b(90\d{12})\b/);
            if (barcodeMatch) {
              barcode = barcodeMatch[1];
            }

            // If we haven't found description yet, try to extract it
            if (!description && j === i) {
              const descMatch = nextLine.match(/^\d{7,8}\s+\d*\s+(.+?)(?:MT|FR|LB|KG|CS|CT|DZ|EA|PC|UN|BX|PK|PR)/i);
              if (descMatch) {
                description = descMatch[1].trim();
              }
            }

            // Look for unit and price if not found
            if (!unit) {
              const unitMatch = nextLine.match(/(MT|FR|LB|KG|CS|CT|DZ|EA|PC|UN|BX|PK|PR|DY|IT)([\d.]+)/i);
              if (unitMatch) {
                unit = unitMatch[1];
                price = unitMatch[2];
              }
            }
          }

          // If we found a barcode and item code, record it
          if (barcode && itemCode) {
            // Clean up description
            description = description
              .replace(/\b(MT|FR|LB|KG|CS|CT|DZ|EA|PC|UN|BX|PK|PR|DY|IT)\b.*$/i, '')
              .replace(/[\d.]+\s+[\d,]+\.?\d*\s*$/, '')
              .trim();

            if (!this.barcodeMapping[itemCode]) {
              this.barcodeMapping[itemCode] = {
                barcode,
                description,
                unit,
                unitPrice: parseFloat(price) || null,
                sources: [invoiceNumber]
              };
              this.stats.itemsFound++;
            } else {
              // Update if we have more info
              if (description && !this.barcodeMapping[itemCode].description) {
                this.barcodeMapping[itemCode].description = description;
              }
              if (!this.barcodeMapping[itemCode].sources.includes(invoiceNumber)) {
                this.barcodeMapping[itemCode].sources.push(invoiceNumber);
              }
            }

            barcodesFound.push({ itemCode, barcode, description });
            this.stats.barcodesExtracted++;
          }
        }
      }

      return barcodesFound;
    } catch (error) {
      this.stats.errors++;
      console.error(`  ✗ Error processing ${invoiceNumber}: ${error.message}`);
      return [];
    }
  }

  /**
   * Process all PDFs in both directories
   */
  async processAllPDFs() {
    console.log('\n📂 Scanning for PDFs...\n');

    const dirs = [
      { path: this.pdfDir, name: 'data/pdfs' },
      { path: this.ordersDir, name: 'data/gfs_orders' }
    ];

    let totalFiles = 0;
    for (const dir of dirs) {
      if (fs.existsSync(dir.path)) {
        const files = fs.readdirSync(dir.path).filter(f => f.endsWith('.pdf'));
        totalFiles += files.length;
      }
    }

    console.log(`Found ${totalFiles} PDFs to process\n`);
    console.log('Processing...');

    let processed = 0;
    for (const dir of dirs) {
      if (!fs.existsSync(dir.path)) continue;

      const files = fs.readdirSync(dir.path)
        .filter(f => f.endsWith('.pdf'))
        .sort();

      for (const file of files) {
        const invoiceNumber = path.basename(file, '.pdf');
        const pdfPath = path.join(dir.path, file);

        const barcodes = await this.extractBarcodesFromPDF(pdfPath, invoiceNumber);

        processed++;
        if (processed % 50 === 0 || processed === totalFiles) {
          const percentage = ((processed / totalFiles) * 100).toFixed(1);
          console.log(`  Progress: ${processed}/${totalFiles} (${percentage}%) - Found ${this.stats.itemsFound} unique items`);
        }

        this.stats.pdfsProcessed++;
      }
    }
  }

  /**
   * Save barcode mapping
   */
  save() {
    const outputFile = './data/barcode_mapping_complete.json';
    const backupFile = './data/barcode_mapping_backup.json';

    // Backup existing if it exists
    if (fs.existsSync('./data/barcode_mapping.json')) {
      fs.copyFileSync('./data/barcode_mapping.json', backupFile);
      console.log(`\n✓ Backed up existing barcode mapping to ${backupFile}`);
    }

    // Save new complete mapping
    fs.writeFileSync(outputFile, JSON.stringify(this.barcodeMapping, null, 2));
    console.log(`✓ Saved complete barcode mapping to ${outputFile}`);

    // Also update the main barcode_mapping.json
    fs.writeFileSync('./data/barcode_mapping.json', JSON.stringify(this.barcodeMapping, null, 2));
    console.log(`✓ Updated main barcode mapping`);
  }

  /**
   * Print summary report
   */
  printReport() {
    console.log('\n' + '='.repeat(80));
    console.log('📊 ENTERPRISE BARCODE EXTRACTION REPORT');
    console.log('='.repeat(80));
    console.log(`PDFs Processed: ${this.stats.pdfsProcessed}`);
    console.log(`Barcodes Extracted: ${this.stats.barcodesExtracted}`);
    console.log(`Unique Items Found: ${this.stats.itemsFound}`);
    console.log(`Errors: ${this.stats.errors}`);
    console.log('');

    // Group by category
    const categories = {};
    Object.values(this.barcodeMapping).forEach(item => {
      const firstWord = item.description.split(' ')[0];
      categories[firstWord] = (categories[firstWord] || 0) + 1;
    });

    console.log('📦 TOP ITEM CATEGORIES:');
    const sorted = Object.entries(categories)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    sorted.forEach(([cat, count], i) => {
      console.log(`  ${i + 1}. ${cat}: ${count} items`);
    });

    // Show some samples
    console.log('\n🏷️ SAMPLE BARCODES:');
    const samples = Object.entries(this.barcodeMapping).slice(0, 10);
    samples.forEach(([code, item]) => {
      console.log(`  ${code}: ${item.description}`);
      console.log(`    Barcode: ${item.barcode}`);
      console.log(`    Found in ${item.sources.length} invoice(s)`);
    });
  }
}

// Run the extraction
async function main() {
  const extractor = new EnterpriseBarcodeExtractor();

  await extractor.processAllPDFs();
  extractor.save();
  extractor.printReport();

  console.log('\n' + '='.repeat(80));
  console.log('✅ ENTERPRISE BARCODE EXTRACTION COMPLETE');
  console.log('='.repeat(80));
  console.log('\nNext step: Run merge script to update all inventory files');
  console.log('Command: node merge_barcodes_to_all_inventories.js');
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = EnterpriseBarcodeExtractor;
