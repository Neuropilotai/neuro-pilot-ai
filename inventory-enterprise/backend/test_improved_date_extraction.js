#!/usr/bin/env node

const fs = require('fs');
const pdf = require('pdf-parse');

/**
 * Extract invoice number from PDF text
 */
function extractInvoiceNumber(text) {
  if (text.includes('CREDIT MEMO')) {
    const creditMatch = text.match(/Credit\s+Original\s+Invoice\s+(\d{10})\s+(\d{10})/i);
    if (creditMatch) return creditMatch[2];
  }

  const concatMatch = text.match(/Invoice(\d{10})/i);
  if (concatMatch) return concatMatch[1];

  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().match(/^Invoice$/i)) {
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        const match = lines[j].trim().match(/^(\d{10})$/);
        if (match) return match[1];
      }
    }
  }
  return null;
}

/**
 * Extract invoice date - IMPROVED VERSION
 */
function extractInvoiceDate(text, invoiceNumber) {
  console.log('\n🔍 Testing improved date extraction...');
  console.log(`Invoice #: ${invoiceNumber}`);

  // Check if this is a credit memo
  if (text.includes('CREDIT MEMO')) {
    const creditDateMatch = text.match(/Credit\s+Date.*?(\d{2}\/\d{2}\/\d{4})/is);
    if (creditDateMatch) {
      const [month, day, year] = creditDateMatch[1].split('/');
      console.log('✅ Pattern: Credit Memo');
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
  }

  // If we have the invoice number, look for date immediately after it
  if (invoiceNumber) {
    const afterInvoiceMatch = text.match(new RegExp(`${invoiceNumber}[\\s\\n]+?(\\d{2}\\/\\d{2}\\/\\d{4})`));
    if (afterInvoiceMatch) {
      const context = text.substring(
        text.indexOf(afterInvoiceMatch[0]) - 50,
        text.indexOf(afterInvoiceMatch[0]) + 50
      );
      console.log('Context around match:', context.replace(/\n/g, '↵'));

      if (!context.match(/due\s+date|pay\s+this\s+amount/i)) {
        const [month, day, year] = afterInvoiceMatch[1].split('/');
        console.log('✅ Pattern 1: Invoice number followed by date');
        console.log(`   Extracted: ${afterInvoiceMatch[1]} → ${year}-${month}-${day}`);
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      } else {
        console.log('⚠️  Pattern 1 matched but was a due date (skipped)');
      }
    }
  }

  // Pattern 2: Regular invoice format
  const match = text.match(/(\d{10})\s*(\d{2}\/\d{2}\/\d{4})/);
  if (match) {
    const idx = text.indexOf(match[0]);
    const context = text.substring(Math.max(0, idx - 50), idx + 50);
    if (!context.match(/due\s+date|pay\s+this\s+amount/i)) {
      const [month, day, year] = match[2].split('/');
      console.log('✅ Pattern 2: 10-digit number followed by date');
      console.log(`   Extracted: ${match[2]} → ${year}-${month}-${day}`);
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
  }

  // Pattern 3: Invoice Date label
  const labelMatch = text.match(/Invoice\s+Date[^\n]*\n[^\n]*?(\d{2}\/\d{2}\/\d{4})/i);
  if (labelMatch) {
    const [month, day, year] = labelMatch[1].split('/');
    console.log('✅ Pattern 3: Invoice Date label');
    console.log(`   Extracted: ${labelMatch[1]} → ${year}-${month}-${day}`);
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Fallback: First non-due-date
  const allDates = text.match(/(\d{2}\/\d{2}\/\d{4})/g);
  if (allDates && allDates.length > 0) {
    console.log(`Found ${allDates.length} dates: ${allDates.join(', ')}`);
    for (const dateStr of allDates) {
      const idx = text.indexOf(dateStr);
      const context = text.substring(Math.max(0, idx - 50), Math.min(text.length, idx + 50));
      if (!context.match(/due\s+date|pay\s+this\s+amount/i)) {
        const [month, day, year] = dateStr.split('/');
        console.log('✅ Pattern 4: First non-due-date');
        console.log(`   Extracted: ${dateStr} → ${year}-${month}-${day}`);
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      } else {
        console.log(`   ⏭️  Skipped ${dateStr} (due date)`);
      }
    }
  }

  console.log('❌ No valid date found');
  return null;
}

async function testInvoice(invoiceNum) {
  console.log('='.repeat(80));
  console.log(`Testing Invoice: ${invoiceNum}`);
  console.log('='.repeat(80));

  const pdfPath = `/Users/davidmikulis/OneDrive/GFS Order PDF/${invoiceNum}.pdf`;
  const dataBuffer = fs.readFileSync(pdfPath);
  const pdfData = await pdf(dataBuffer);
  const text = pdfData.text;

  const extractedNumber = extractInvoiceNumber(text);
  const extractedDate = extractInvoiceDate(text, extractedNumber);

  console.log('\n📋 RESULTS:');
  console.log(`   Invoice #: ${extractedNumber}`);
  console.log(`   Date: ${extractedDate}`);
  console.log('');
}

(async () => {
  await testInvoice('9027091043');
  await testInvoice('9025025285');
  await testInvoice('9021570042');
})();
