#!/usr/bin/env node

/**
 * AGGRESSIVE BARCODE EXTRACTION
 *
 * Extracts barcodes in ALL formats:
 * - 14-digit (90XXXXXXXXXXX)
 * - 13-digit (EAN-13)
 * - 12-digit (UPC-A)
 * - 8-digit (EAN-8)
 * - Any long number sequences near item descriptions
 */

const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');

console.log('🔥 AGGRESSIVE BARCODE EXTRACTION');
console.log('='.repeat(80));

class AggressiveBarcodeExtractor {
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
   * Extract ALL possible barcodes from PDF
   */
  async extractBarcodesFromPDF(pdfPath, invoiceNumber) {
    try {
      const dataBuffer = fs.readFileSync(pdfPath);
      const pdfData = await pdf(dataBuffer);
      const text = pdfData.text;
      const lines = text.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Look for item codes (7-8 digits at start of line)
        const itemCodeMatch = line.match(/^(\d{7,8})/);

        if (itemCodeMatch) {
          const itemCode = itemCodeMatch[1];
          let description = '';
          let barcode = null;
          let unit = '';

          // Extract description from current line
          const descMatch = line.match(/^\d{7,8}\s*\d*\s*(.+?)(?:(MT|FR|LB|KG|CS|CT|DZ|EA|PC|UN|BX|PK|PR|DY|IT|OZ|ML|GAL|PT|QT)\b|$)/i);
          if (descMatch) {
            description = descMatch[1].trim();
          }

          // Look in next 5 lines for ANY barcode-like number
          for (let j = i; j < Math.min(i + 6, lines.length); j++) {
            const checkLine = lines[j].trim();

            // Priority 1: 14-digit GFS barcode (90XXXXXXXXXXX)
            const barcode14 = checkLine.match(/\b(90\d{12})\b/);
            if (barcode14 && !barcode) {
              barcode = barcode14[1];
            }

            // Priority 2: 13-digit EAN-13
            const barcode13 = checkLine.match(/\b([0-9]{13})\b/);
            if (barcode13 && !barcode) {
              barcode = barcode13[1];
            }

            // Priority 3: 12-digit UPC-A
            const barcode12 = checkLine.match(/\b([0-9]{12})\b/);
            if (barcode12 && !barcode && barcode12[1] !== itemCode) {
              barcode = barcode12[1];
            }

            // Priority 4: 8-digit EAN-8
            const barcode8 = checkLine.match(/\b([0-9]{8})\b/);
            if (barcode8 && !barcode && barcode8[1] !== itemCode) {
              barcode = barcode8[1];
            }

            // Get unit if not found
            if (!unit) {
              const unitMatch = checkLine.match(/\b(MT|FR|LB|KG|CS|CT|DZ|EA|PC|UN|BX|PK|PR|DY|IT|OZ|ML|GAL|PT|QT)\b/i);
              if (unitMatch) {
                unit = unitMatch[1].toUpperCase();
              }
            }
          }

          // If we found a barcode, record it
          if (barcode) {
            if (!this.barcodeMapping[itemCode]) {
              this.barcodeMapping[itemCode] = {
                barcode,
                description,
                unit,
                sources: [invoiceNumber]
              };
              this.stats.itemsFound++;
            } else {
              // Keep the longest/most specific barcode
              if (barcode.length > this.barcodeMapping[itemCode].barcode.length) {
                this.barcodeMapping[itemCode].barcode = barcode;
              }

              if (!this.barcodeMapping[itemCode].sources.includes(invoiceNumber)) {
                this.barcodeMapping[itemCode].sources.push(invoiceNumber);
              }
            }

            this.stats.barcodesExtracted++;
          }
        }
      }

      return true;
    } catch (error) {
      this.stats.errors++;
      return false;
    }
  }

  /**
   * Process all PDFs
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
    console.log('Extracting ALL barcode formats...');

    let processed = 0;
    for (const dir of dirs) {
      if (!fs.existsSync(dir.path)) continue;

      const files = fs.readdirSync(dir.path)
        .filter(f => f.endsWith('.pdf'))
        .sort();

      for (const file of files) {
        const invoiceNumber = path.basename(file, '.pdf');
        const pdfPath = path.join(dir.path, file);

        await this.extractBarcodesFromPDF(pdfPath, invoiceNumber);

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
   * Save results
   */
  save() {
    const outputFile = './data/barcode_mapping_aggressive.json';

    fs.writeFileSync(outputFile, JSON.stringify(this.barcodeMapping, null, 2));
    console.log(`\n✓ Saved aggressive barcode mapping to ${outputFile}`);

    // Merge with existing barcode mapping
    const existingPath = './data/barcode_mapping.json';
    let existing = {};

    if (fs.existsSync(existingPath)) {
      existing = JSON.parse(fs.readFileSync(existingPath, 'utf8'));
    }

    // Merge: prefer existing barcodes, add new ones
    let newBarcodes = 0;
    Object.entries(this.barcodeMapping).forEach(([itemCode, data]) => {
      if (!existing[itemCode] || !existing[itemCode].barcode) {
        existing[itemCode] = data;
        newBarcodes++;
      }
    });

    fs.writeFileSync(existingPath, JSON.stringify(existing, null, 2));
    console.log(`✓ Merged into main barcode mapping (+${newBarcodes} new barcodes)`);
  }

  /**
   * Print report
   */
  printReport() {
    console.log('\n' + '='.repeat(80));
    console.log('📊 AGGRESSIVE BARCODE EXTRACTION REPORT');
    console.log('='.repeat(80));
    console.log(`PDFs Processed: ${this.stats.pdfsProcessed}`);
    console.log(`Barcodes Extracted: ${this.stats.barcodesExtracted}`);
    console.log(`Unique Items Found: ${this.stats.itemsFound}`);
    console.log(`Errors: ${this.stats.errors}`);

    // Analyze barcode formats
    const formats = { 14: 0, 13: 0, 12: 0, 8: 0, other: 0 };
    Object.values(this.barcodeMapping).forEach(item => {
      const len = item.barcode.length;
      if (formats[len] !== undefined) {
        formats[len]++;
      } else {
        formats.other++;
      }
    });

    console.log('\n📊 BARCODE FORMATS:');
    console.log(`  14-digit (GFS): ${formats[14]}`);
    console.log(`  13-digit (EAN-13): ${formats[13]}`);
    console.log(`  12-digit (UPC-A): ${formats[12]}`);
    console.log(`  8-digit (EAN-8): ${formats[8]}`);
    console.log(`  Other: ${formats.other}`);

    console.log('\n🏷️ SAMPLE BARCODES:');
    Object.entries(this.barcodeMapping).slice(0, 10).forEach(([code, item]) => {
      console.log(`  ${code}: ${item.description}`);
      console.log(`    Barcode: ${item.barcode} (${item.barcode.length}-digit)`);
    });
  }
}

// Run extraction
async function main() {
  const extractor = new AggressiveBarcodeExtractor();

  await extractor.processAllPDFs();
  extractor.save();
  extractor.printReport();

  console.log('\n' + '='.repeat(80));
  console.log('✅ AGGRESSIVE BARCODE EXTRACTION COMPLETE');
  console.log('='.repeat(80));
  console.log('\nRun merge script again to update inventories:');
  console.log('node merge_barcodes_to_all_inventories.js');
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = AggressiveBarcodeExtractor;
