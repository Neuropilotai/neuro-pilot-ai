const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

// OneDrive PDF directory path
const ONEDRIVE_PDF_PATH = '/Users/davidmikulis/Library/CloudStorage/OneDrive-Personal/GFS Order PDF';

async function extractRealOrderDates() {
  console.log('📅 Extracting REAL order dates from PDF content...\n');

  try {
    // Get all PDF files
    const files = await fs.readdir(ONEDRIVE_PDF_PATH);
    const pdfFiles = files.filter(file => file.toLowerCase().endsWith('.pdf'));

    console.log(`📄 Found ${pdfFiles.length} PDF files to process\n`);

    const results = [];
    const dateExtractionResults = [];

    // Process each PDF
    for (const pdfFile of pdfFiles) {
      try {
        const pdfPath = path.join(ONEDRIVE_PDF_PATH, pdfFile);
        const invoiceNumber = pdfFile.replace('.pdf', '');

        console.log(`🔍 Processing: ${invoiceNumber}`);

        // Extract text from PDF
        const pdfText = execSync(`pdftotext "${pdfPath}" -`, { encoding: 'utf8' });

        // Look for date patterns in the text
        const datePatterns = [
          /(\d{1,2}\/\d{1,2}\/\d{4})/g,  // MM/DD/YYYY or M/D/YYYY
          /(\d{4}-\d{2}-\d{2})/g,        // YYYY-MM-DD
          /(\d{1,2}-\d{1,2}-\d{4})/g,    // MM-DD-YYYY or M-D-YYYY
        ];

        let extractedDate = null;
        let foundDates = [];

        // Try each pattern
        for (const pattern of datePatterns) {
          const matches = pdfText.match(pattern);
          if (matches) {
            foundDates = foundDates.concat(matches);
          }
        }

        // Filter for reasonable dates (2025 only for this analysis)
        const validDates = foundDates.filter(dateStr => {
          try {
            // Handle different date formats
            let date;
            if (dateStr.includes('/')) {
              // MM/DD/YYYY format
              const [month, day, year] = dateStr.split('/');
              date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
            } else if (dateStr.includes('-')) {
              date = new Date(dateStr);
            }

            // Check if date is in 2025 and is valid
            return date &&
                   date.getFullYear() === 2025 &&
                   date.getMonth() >= 0 &&
                   date.getMonth() <= 11 &&
                   !isNaN(date.getTime());
          } catch (error) {
            return false;
          }
        });

        // Pick the most likely order date (usually the first valid date found)
        if (validDates.length > 0) {
          extractedDate = validDates[0];

          // Convert to standard format
          let standardDate;
          if (extractedDate.includes('/')) {
            const [month, day, year] = extractedDate.split('/');
            standardDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
          } else {
            standardDate = extractedDate;
          }

          console.log(`   ✅ Found date: ${extractedDate} → ${standardDate}`);

          results.push({
            invoiceNumber: invoiceNumber,
            filename: pdfFile,
            orderDate: standardDate,
            originalDateText: extractedDate,
            allFoundDates: validDates,
            success: true
          });

        } else {
          console.log(`   ❌ No valid date found`);

          // Debug: show what dates we found (if any)
          if (foundDates.length > 0) {
            console.log(`      Found dates but invalid: ${foundDates.join(', ')}`);
          }

          results.push({
            invoiceNumber: invoiceNumber,
            filename: pdfFile,
            orderDate: null,
            originalDateText: null,
            allFoundDates: foundDates,
            success: false
          });
        }

      } catch (error) {
        console.log(`   ❌ Error processing ${pdfFile}: ${error.message}`);
        results.push({
          invoiceNumber: pdfFile.replace('.pdf', ''),
          filename: pdfFile,
          orderDate: null,
          error: error.message,
          success: false
        });
      }
    }

    // Analyze results
    const successfulExtractions = results.filter(r => r.success);
    const failedExtractions = results.filter(r => !r.success);

    console.log(`\n📊 EXTRACTION SUMMARY:`);
    console.log(`   Total PDFs processed: ${results.length}`);
    console.log(`   Successful date extractions: ${successfulExtractions.length}`);
    console.log(`   Failed extractions: ${failedExtractions.length}`);
    console.log(`   Success rate: ${((successfulExtractions.length / results.length) * 100).toFixed(1)}%`);

    if (successfulExtractions.length > 0) {
      // Sort by date
      successfulExtractions.sort((a, b) => new Date(a.orderDate) - new Date(b.orderDate));

      console.log(`\n📅 EXTRACTED ORDER DATES (chronological):`);
      successfulExtractions.forEach(result => {
        const date = new Date(result.orderDate);
        const weekDay = date.toLocaleDateString('en-US', { weekday: 'short' });
        console.log(`   ${result.orderDate} (${weekDay}) - Invoice ${result.invoiceNumber}`);
      });

      // Analyze weekly patterns
      console.log(`\n📈 WEEKLY PATTERN ANALYSIS:`);

      const weeklyGroups = new Map();
      successfulExtractions.forEach(result => {
        const date = new Date(result.orderDate);

        // Get the start of the week (Monday)
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1);
        const weekStart = new Date(date.setDate(diff));
        const weekKey = weekStart.toISOString().split('T')[0];

        if (!weeklyGroups.has(weekKey)) {
          weeklyGroups.set(weekKey, []);
        }
        weeklyGroups.get(weekKey).push(result);
      });

      console.log(`   Detected ${weeklyGroups.size} weeks with orders:`);

      const sortedWeeks = Array.from(weeklyGroups.entries()).sort((a, b) => a[0].localeCompare(b[0]));

      sortedWeeks.forEach(([weekStart, orders]) => {
        const weekEnd = new Date(new Date(weekStart).getTime() + 6 * 24 * 60 * 60 * 1000);
        console.log(`   ${weekStart} to ${weekEnd.toISOString().split('T')[0]}: ${orders.length} orders`);
        orders.forEach(order => {
          console.log(`     - ${order.orderDate}: ${order.invoiceNumber}`);
        });
      });

      // Find missing weeks
      const allWeeks = sortedWeeks.map(([weekStart]) => weekStart);
      const firstWeek = new Date(allWeeks[0]);
      const lastWeek = new Date(allWeeks[allWeeks.length - 1]);

      console.log(`\n❌ MISSING WEEKS ANALYSIS:`);
      console.log(`   First order week: ${firstWeek.toISOString().split('T')[0]}`);
      console.log(`   Last order week: ${lastWeek.toISOString().split('T')[0]}`);

      // Generate expected weeks
      const expectedWeeks = [];
      let currentWeek = new Date(firstWeek);
      while (currentWeek <= lastWeek) {
        expectedWeeks.push(currentWeek.toISOString().split('T')[0]);
        currentWeek = new Date(currentWeek.getTime() + 7 * 24 * 60 * 60 * 1000);
      }

      const missingWeeks = expectedWeeks.filter(week => !allWeeks.includes(week));

      console.log(`   Expected weeks: ${expectedWeeks.length}`);
      console.log(`   Weeks with orders: ${allWeeks.length}`);
      console.log(`   Missing weeks: ${missingWeeks.length}`);

      if (missingWeeks.length > 0) {
        console.log(`\n🕳️  MISSING WEEKS:`);
        missingWeeks.forEach(week => {
          const weekEnd = new Date(new Date(week).getTime() + 6 * 24 * 60 * 60 * 1000);
          console.log(`   ${week} to ${weekEnd.toISOString().split('T')[0]} - NO ORDERS`);
        });
      } else {
        console.log(`   ✅ No missing weeks detected!`);
      }
    }

    if (failedExtractions.length > 0) {
      console.log(`\n❌ FAILED EXTRACTIONS:`);
      failedExtractions.forEach(result => {
        console.log(`   ${result.invoiceNumber}: ${result.error || 'No date found'}`);
      });
    }

    // Save results
    await fs.writeFile(
      path.join(__dirname, 'real_order_dates_extraction.json'),
      JSON.stringify({
        summary: {
          totalProcessed: results.length,
          successful: successfulExtractions.length,
          failed: failedExtractions.length,
          successRate: ((successfulExtractions.length / results.length) * 100).toFixed(1) + '%'
        },
        results: results,
        extractionDate: new Date().toISOString()
      }, null, 2)
    );

    console.log(`\n💾 Results saved to: real_order_dates_extraction.json`);

  } catch (error) {
    console.error('❌ Error during date extraction:', error);
  }
}

// Run the extraction
extractRealOrderDates().catch(console.error);