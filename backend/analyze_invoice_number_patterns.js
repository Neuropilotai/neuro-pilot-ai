const fs = require('fs').promises;
const path = require('path');

// OneDrive PDF directory path
const ONEDRIVE_PDF_PATH = '/Users/davidmikulis/Library/CloudStorage/OneDrive-Personal/GFS Order PDF';

async function analyzeInvoiceNumberPatterns() {
  console.log('🔍 Analyzing GFS invoice number patterns to estimate order dates...\n');

  try {
    // Get all PDF files
    const files = await fs.readdir(ONEDRIVE_PDF_PATH);
    const pdfFiles = files.filter(file => file.toLowerCase().endsWith('.pdf'));

    console.log(`📄 Found ${pdfFiles.length} PDF files to analyze\n`);

    // Extract invoice numbers and analyze patterns
    const invoiceNumbers = pdfFiles.map(file => {
      const invoiceNum = file.replace('.pdf', '');
      return {
        filename: file,
        invoiceNumber: invoiceNum,
        numericPart: parseInt(invoiceNum) || 0,
        startsWithCredit: invoiceNum.startsWith('200'),
        startsWithOrder: invoiceNum.startsWith('90')
      };
    });

    // Separate credits from orders
    const creditMemos = invoiceNumbers.filter(inv => inv.startsWithCredit).sort((a, b) => a.numericPart - b.numericPart);
    const orderInvoices = invoiceNumbers.filter(inv => inv.startsWithOrder).sort((a, b) => a.numericPart - b.numericPart);

    console.log('📊 INVOICE NUMBER ANALYSIS:');
    console.log(`   Credit Memos (200*): ${creditMemos.length}`);
    console.log(`   Order Invoices (90*): ${orderInvoices.length}`);

    if (creditMemos.length > 0) {
      console.log('\n💳 CREDIT MEMOS:');
      creditMemos.forEach(credit => {
        console.log(`   ${credit.invoiceNumber}`);
      });
    }

    console.log('\n📦 ORDER INVOICES (sorted numerically):');

    // Analyze order invoice patterns
    if (orderInvoices.length > 0) {
      const firstOrder = orderInvoices[0].numericPart;
      const lastOrder = orderInvoices[orderInvoices.length - 1].numericPart;

      console.log(`   Range: ${firstOrder} to ${lastOrder}`);
      console.log(`   Total span: ${lastOrder - firstOrder} invoice numbers`);

      // Try to detect weekly patterns based on invoice number increments
      const gaps = [];
      for (let i = 1; i < orderInvoices.length; i++) {
        const gap = orderInvoices[i].numericPart - orderInvoices[i-1].numericPart;
        gaps.push(gap);
      }

      const avgGap = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
      console.log(`   Average invoice number gap: ${avgGap.toFixed(0)}`);

      // Group by potential weeks based on invoice number patterns
      // Assumption: if invoice numbers increment by ~200-500 per week
      const weeklyGroups = [];
      let currentWeek = [orderInvoices[0]];
      let weekStartInvoice = orderInvoices[0].numericPart;

      for (let i = 1; i < orderInvoices.length; i++) {
        const currentInvoice = orderInvoices[i];
        const gapFromWeekStart = currentInvoice.numericPart - weekStartInvoice;

        // If gap is large (>1000), likely a new week
        if (gapFromWeekStart > 1000) {
          weeklyGroups.push(currentWeek);
          currentWeek = [currentInvoice];
          weekStartInvoice = currentInvoice.numericPart;
        } else {
          currentWeek.push(currentInvoice);
        }
      }
      weeklyGroups.push(currentWeek); // Add last week

      console.log(`\n📅 ESTIMATED WEEKLY GROUPS (${weeklyGroups.length} weeks):`);

      // Estimate dates based on invoice number progression
      // Assuming weekly ordering starting from January 2025
      const estimatedStartDate = new Date('2025-01-06'); // First Monday of 2025

      weeklyGroups.forEach((week, index) => {
        const weekDate = new Date(estimatedStartDate.getTime() + (index * 7 * 24 * 60 * 60 * 1000));
        const weekStr = weekDate.toISOString().split('T')[0];

        console.log(`   Week ${index + 1} (Est. ${weekStr}): ${week.length} orders`);
        console.log(`     Invoice range: ${week[0].invoiceNumber} to ${week[week.length-1].invoiceNumber}`);

        // List first few invoices in each week
        const sampleInvoices = week.slice(0, Math.min(5, week.length));
        sampleInvoices.forEach(inv => {
          console.log(`       - ${inv.invoiceNumber}`);
        });
        if (week.length > 5) {
          console.log(`       ... and ${week.length - 5} more`);
        }
      });

      // Generate missing weeks analysis
      console.log('\n❌ POTENTIAL MISSING WEEKS ANALYSIS:');

      if (weeklyGroups.length < 36) { // Expected weeks from Jan 2025 to Sept 2025
        const missingWeeks = 36 - weeklyGroups.length;
        console.log(`   Expected weeks (Jan-Sept 2025): 36`);
        console.log(`   Detected week groups: ${weeklyGroups.length}`);
        console.log(`   Potentially missing: ${missingWeeks} weeks`);

        // Identify gaps in invoice number sequence
        const largeGaps = [];
        for (let i = 1; i < orderInvoices.length; i++) {
          const gap = orderInvoices[i].numericPart - orderInvoices[i-1].numericPart;
          if (gap > 2000) { // Large gap suggests missing weeks
            largeGaps.push({
              beforeInvoice: orderInvoices[i-1].invoiceNumber,
              afterInvoice: orderInvoices[i].invoiceNumber,
              gap: gap,
              estimatedMissingWeeks: Math.round(gap / 500) // Rough estimate
            });
          }
        }

        if (largeGaps.length > 0) {
          console.log('\n🕳️  DETECTED GAPS (potential missing weeks):');
          largeGaps.forEach(gap => {
            console.log(`   Between ${gap.beforeInvoice} and ${gap.afterInvoice}:`);
            console.log(`     Gap size: ${gap.gap} invoice numbers`);
            console.log(`     Estimated missing weeks: ${gap.estimatedMissingWeeks}`);
          });
        }

      } else {
        console.log('   ✅ Number of week groups matches expected range');
      }

    }

    console.log('\n📋 SUMMARY:');
    console.log(`   All PDFs created on: September 13, 2025 (same day)`);
    console.log(`   This suggests PDFs were batch-generated, not original order dates`);
    console.log(`   Invoice numbers span: ${orderInvoices.length > 0 ?
      `${orderInvoices[0].numericPart} to ${orderInvoices[orderInvoices.length-1].numericPart}` : 'N/A'}`);
    console.log(`   Estimated weekly groups: ${weeklyGroups ? weeklyGroups.length : 0}`);

  } catch (error) {
    console.error('❌ Error analyzing invoice patterns:', error);
  }
}

// Run the analysis
analyzeInvoiceNumberPatterns().catch(console.error);