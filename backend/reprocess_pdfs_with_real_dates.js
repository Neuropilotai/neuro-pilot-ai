const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

const ONEDRIVE_PDF_PATH = '/Users/davidmikulis/Library/CloudStorage/OneDrive-Personal/GFS Order PDF';
const OUTPUT_DIR = path.join(__dirname, 'data/gfs_orders_with_real_dates');

async function reprocessAllPDFsWithRealDates() {
  console.log('🔄 Reprocessing all GFS PDFs with real date extraction...');

  // Ensure output directory exists
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const pdfFiles = ["2002362584.pdf","2002373141.pdf","9018357843.pdf","9018357846.pdf","9018587875.pdf","9018587876.pdf","9018587877.pdf","9018587878.pdf","9018587879.pdf","9018827286.pdf","9018827314.pdf","9018827316.pdf","9018827317.pdf","9018827318.pdf","9019074588.pdf","9019074590.pdf","9019074591.pdf","9019074592.pdf","9019325643.pdf","9019325646.pdf","9019325647.pdf","9019558528.pdf","9019558752.pdf","9019558774.pdf","9019558775.pdf","9019558776.pdf","9019558777.pdf","9019805895.pdf","9019805903.pdf","9019805904.pdf","9019805906.pdf","9019805907.pdf","9019805909.pdf","9019805910.pdf","9019805911.pdf","9020060120.pdf","9020060122.pdf","9020060123.pdf","9020060124.pdf","9020316838.pdf","9020316841.pdf","9020316842.pdf","9020316843.pdf","9020316844.pdf","9020563793.pdf","9020563800.pdf","9020563801.pdf","9020563802.pdf","9020806183.pdf","9020806184.pdf","9020806185.pdf","9020806186.pdf","9020806187.pdf","9021033003.pdf","9021033005.pdf","9021033009.pdf","9021053493.pdf","9021053494.pdf","9021053495.pdf","9021312147.pdf","9021570039.pdf","9021570043.pdf","9021750789.pdf","9021819129.pdf","9021819131.pdf","9022080516.pdf","9022080518.pdf","9022353883.pdf","9022353897.pdf","9022613266.pdf","9022613268.pdf","9022613272.pdf","9022864312.pdf","9023102242.pdf","9023102243.pdf","9023349211.pdf","9023843552.pdf","9023843557.pdf","9023843558.pdf","9023843559.pdf","9023843561.pdf","9024082412.pdf","9024309029.pdf","9026031906.pdf"];
  const results = [];

  for (const pdfFile of pdfFiles) {
    try {
      const pdfPath = path.join(ONEDRIVE_PDF_PATH, pdfFile);
      const invoiceNumber = pdfFile.replace('.pdf', '');

      // Extract creation date from PDF metadata
      let realOrderDate = null;
      try {
        const pdfInfo = execSync(`pdfinfo "${pdfPath}"`, { encoding: 'utf8' });
        const creationMatch = pdfInfo.match(/CreationDate:\s*(.+)/);

        if (creationMatch) {
          const dateStr = creationMatch[1].trim();
          const pdfDateMatch = dateStr.match(/D:(\d{8})/);
          if (pdfDateMatch) {
            const dateNum = pdfDateMatch[1];
            const year = dateNum.substring(0, 4);
            const month = dateNum.substring(4, 6);
            const day = dateNum.substring(6, 8);
            realOrderDate = `${year}-${month}-${day}`;
          }
        }
      } catch (pdfError) {
        console.log(`⚠️  Could not extract date from ${pdfFile}`);
      }

      // Load existing JSON data if available
      const existingJsonPath = path.join(__dirname, 'data/gfs_orders', `gfs_order_${invoiceNumber}.json`);
      let orderData = {
        invoiceNumber: invoiceNumber,
        orderDate: realOrderDate,
        pdfPath: pdfPath,
        extractedFromPdf: true,
        realDateExtracted: !!realOrderDate,
        reprocessedWithRealDate: true,
        reprocessingDate: new Date().toISOString()
      };

      // Try to load existing data
      try {
        const existingContent = await fs.readFile(existingJsonPath, 'utf8');
        const existingData = JSON.parse(existingContent);

        // Merge with real date
        orderData = {
          ...existingData,
          orderDate: realOrderDate || existingData.orderDate,
          realDateExtracted: !!realOrderDate,
          reprocessedWithRealDate: true,
          reprocessingDate: new Date().toISOString()
        };

      } catch (existingError) {
        console.log(`📄 Creating new data for ${invoiceNumber}`);
      }

      // Save updated data
      const outputPath = path.join(OUTPUT_DIR, `gfs_order_${invoiceNumber}.json`);
      await fs.writeFile(outputPath, JSON.stringify(orderData, null, 2));

      results.push({
        invoiceNumber: invoiceNumber,
        realDateFound: !!realOrderDate,
        orderDate: realOrderDate,
        status: 'processed'
      });

      console.log(`✅ ${invoiceNumber}: ${realOrderDate || 'No date found'}`);

    } catch (error) {
      console.error(`❌ Error processing ${pdfFile}:`, error.message);
      results.push({
        invoiceNumber: pdfFile.replace('.pdf', ''),
        realDateFound: false,
        error: error.message,
        status: 'error'
      });
    }
  }

  // Generate summary report
  const summary = {
    totalProcessed: results.length,
    datesExtracted: results.filter(r => r.realDateFound).length,
    errors: results.filter(r => r.status === 'error').length,
    results: results
  };

  await fs.writeFile(
    path.join(OUTPUT_DIR, 'reprocessing_summary.json'),
    JSON.stringify(summary, null, 2)
  );

  console.log(`\n📊 REPROCESSING SUMMARY:`);
  console.log(`   Total PDFs processed: ${summary.totalProcessed}`);
  console.log(`   Real dates extracted: ${summary.datesExtracted}`);
  console.log(`   Errors: ${summary.errors}`);
  console.log(`   Success rate: ${((summary.datesExtracted / summary.totalProcessed) * 100).toFixed(1)}%`);

  return summary;
}

reprocessAllPDFsWithRealDates().catch(console.error);
