const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

// OneDrive PDF directory path
const ONEDRIVE_PDF_PATH = '/Users/davidmikulis/Library/CloudStorage/OneDrive-Personal/GFS Order PDF';

async function extractRealDatesFromPDFs() {
  console.log('🔍 Extracting real dates from GFS PDFs in OneDrive...\n');

  try {
    // Check if OneDrive directory exists
    try {
      await fs.access(ONEDRIVE_PDF_PATH);
      console.log('✅ Found OneDrive GFS PDF directory');
    } catch (error) {
      console.log('❌ Cannot access OneDrive directory:', ONEDRIVE_PDF_PATH);
      console.log('Please ensure OneDrive is synced and the path is correct');
      return;
    }

    // Get all PDF files
    const files = await fs.readdir(ONEDRIVE_PDF_PATH);
    const pdfFiles = files.filter(file => file.toLowerCase().endsWith('.pdf'));

    console.log(`📄 Found ${pdfFiles.length} PDF files to analyze\n`);

    if (pdfFiles.length === 0) {
      console.log('No PDF files found in the OneDrive directory');
      return;
    }

    // Sort PDF files by filename to see chronological pattern
    const sortedPdfs = pdfFiles.sort();

    console.log('📋 PDF Files (sorted by filename):');
    sortedPdfs.forEach((file, index) => {
      console.log(`   ${index + 1}. ${file}`);
    });

    // Try to extract dates from a sample of PDFs using pdfinfo or similar
    console.log('\n🔍 Attempting to extract creation dates from PDFs...\n');

    const dateExtractionResults = [];

    // Process first 10 PDFs as sample
    const samplePdfs = sortedPdfs.slice(0, 10);

    for (const pdfFile of samplePdfs) {
      try {
        const pdfPath = path.join(ONEDRIVE_PDF_PATH, pdfFile);

        // Try using pdfinfo to get metadata
        try {
          const pdfInfo = execSync(`pdfinfo "${pdfPath}"`, { encoding: 'utf8' });

          // Extract creation date and modification date
          const creationMatch = pdfInfo.match(/CreationDate:\s*(.+)/);
          const modDateMatch = pdfInfo.match(/ModDate:\s*(.+)/);

          let extractedDate = null;

          if (creationMatch) {
            const dateStr = creationMatch[1].trim();
            // Parse PDF date format: D:20250115123045+00'00'
            const pdfDateMatch = dateStr.match(/D:(\d{8})/);
            if (pdfDateMatch) {
              const dateNum = pdfDateMatch[1]; // 20250115
              const year = dateNum.substring(0, 4);
              const month = dateNum.substring(4, 6);
              const day = dateNum.substring(6, 8);
              extractedDate = `${year}-${month}-${day}`;
            }
          }

          dateExtractionResults.push({
            filename: pdfFile,
            invoiceNumber: pdfFile.replace('.pdf', ''),
            extractedDate: extractedDate,
            creationDate: creationMatch ? creationMatch[1].trim() : null,
            modDate: modDateMatch ? modDateMatch[1].trim() : null
          });

          console.log(`✅ ${pdfFile}: ${extractedDate || 'Date not found'}`);

        } catch (pdfError) {
          console.log(`⚠️  ${pdfFile}: Could not read PDF metadata`);
          dateExtractionResults.push({
            filename: pdfFile,
            invoiceNumber: pdfFile.replace('.pdf', ''),
            extractedDate: null,
            error: 'Could not read PDF metadata'
          });
        }

      } catch (error) {
        console.log(`❌ Error processing ${pdfFile}:`, error.message);
      }
    }

    // Analyze date patterns
    console.log('\n📊 DATE EXTRACTION ANALYSIS:');

    const datesFound = dateExtractionResults.filter(r => r.extractedDate);
    const datesNotFound = dateExtractionResults.filter(r => !r.extractedDate);

    console.log(`   Dates successfully extracted: ${datesFound.length}`);
    console.log(`   Dates not found: ${datesNotFound.length}`);

    if (datesFound.length > 0) {
      console.log('\n📅 EXTRACTED DATES:');
      datesFound.forEach(result => {
        console.log(`   ${result.invoiceNumber}: ${result.extractedDate}`);
      });

      // Check for weekly patterns
      const dates = datesFound.map(r => new Date(r.extractedDate)).sort((a, b) => a - b);

      if (dates.length > 1) {
        console.log('\n📈 DATE PATTERN ANALYSIS:');
        console.log(`   First order date: ${dates[0].toISOString().split('T')[0]}`);
        console.log(`   Last order date: ${dates[dates.length - 1].toISOString().split('T')[0]}`);

        // Calculate gaps between dates
        const gaps = [];
        for (let i = 1; i < dates.length; i++) {
          const daysDiff = Math.round((dates[i] - dates[i-1]) / (1000 * 60 * 60 * 24));
          gaps.push(daysDiff);
        }

        const avgGap = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
        console.log(`   Average days between orders: ${avgGap.toFixed(1)}`);

        if (avgGap >= 6 && avgGap <= 8) {
          console.log('   ✅ Pattern suggests weekly ordering');
        } else {
          console.log('   ⚠️  Pattern does not suggest consistent weekly ordering');
        }
      }
    }

    // Create a comprehensive reprocessing script
    console.log('\n🔧 Creating comprehensive PDF reprocessing script...');

    await createComprehensivePDFProcessor(sortedPdfs);

    console.log('\n✅ Analysis complete. Run the reprocessing script to extract all data with real dates.');

  } catch (error) {
    console.error('❌ Error during PDF date extraction:', error);
  }
}

async function createComprehensivePDFProcessor(pdfFiles) {
  const processorScript = `const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

const ONEDRIVE_PDF_PATH = '${ONEDRIVE_PDF_PATH}';
const OUTPUT_DIR = path.join(__dirname, 'data/gfs_orders_with_real_dates');

async function reprocessAllPDFsWithRealDates() {
  console.log('🔄 Reprocessing all GFS PDFs with real date extraction...');

  // Ensure output directory exists
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const pdfFiles = ${JSON.stringify(pdfFiles)};
  const results = [];

  for (const pdfFile of pdfFiles) {
    try {
      const pdfPath = path.join(ONEDRIVE_PDF_PATH, pdfFile);
      const invoiceNumber = pdfFile.replace('.pdf', '');

      // Extract creation date from PDF metadata
      let realOrderDate = null;
      try {
        const pdfInfo = execSync(\`pdfinfo "\${pdfPath}"\`, { encoding: 'utf8' });
        const creationMatch = pdfInfo.match(/CreationDate:\\s*(.+)/);

        if (creationMatch) {
          const dateStr = creationMatch[1].trim();
          const pdfDateMatch = dateStr.match(/D:(\\d{8})/);
          if (pdfDateMatch) {
            const dateNum = pdfDateMatch[1];
            const year = dateNum.substring(0, 4);
            const month = dateNum.substring(4, 6);
            const day = dateNum.substring(6, 8);
            realOrderDate = \`\${year}-\${month}-\${day}\`;
          }
        }
      } catch (pdfError) {
        console.log(\`⚠️  Could not extract date from \${pdfFile}\`);
      }

      // Load existing JSON data if available
      const existingJsonPath = path.join(__dirname, 'data/gfs_orders', \`gfs_order_\${invoiceNumber}.json\`);
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
        console.log(\`📄 Creating new data for \${invoiceNumber}\`);
      }

      // Save updated data
      const outputPath = path.join(OUTPUT_DIR, \`gfs_order_\${invoiceNumber}.json\`);
      await fs.writeFile(outputPath, JSON.stringify(orderData, null, 2));

      results.push({
        invoiceNumber: invoiceNumber,
        realDateFound: !!realOrderDate,
        orderDate: realOrderDate,
        status: 'processed'
      });

      console.log(\`✅ \${invoiceNumber}: \${realOrderDate || 'No date found'}\`);

    } catch (error) {
      console.error(\`❌ Error processing \${pdfFile}:\`, error.message);
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

  console.log(\`\\n📊 REPROCESSING SUMMARY:\`);
  console.log(\`   Total PDFs processed: \${summary.totalProcessed}\`);
  console.log(\`   Real dates extracted: \${summary.datesExtracted}\`);
  console.log(\`   Errors: \${summary.errors}\`);
  console.log(\`   Success rate: \${((summary.datesExtracted / summary.totalProcessed) * 100).toFixed(1)}%\`);

  return summary;
}

reprocessAllPDFsWithRealDates().catch(console.error);
`;

  await fs.writeFile(
    path.join(__dirname, 'reprocess_pdfs_with_real_dates.js'),
    processorScript
  );

  console.log('✅ Created reprocess_pdfs_with_real_dates.js');
}

// Run the analysis
extractRealDatesFromPDFs().catch(console.error);