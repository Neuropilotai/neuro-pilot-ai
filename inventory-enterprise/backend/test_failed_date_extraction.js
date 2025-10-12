#!/usr/bin/env node

const fs = require('fs');
const pdf = require('pdf-parse');

async function testExtraction(invoiceNum) {
  const pdfPath = '/Users/davidmikulis/OneDrive/GFS Order PDF/' + invoiceNum + '.pdf';
  const dataBuffer = fs.readFileSync(pdfPath);
  const pdfData = await pdf(dataBuffer);
  const text = pdfData.text;

  console.log('Testing:', invoiceNum);
  console.log('='.repeat(60));

  // Test pattern 1: Current pattern (10 digits followed by date)
  const pattern1 = /(\d{10})\s*(\d{2}\/\d{2}\/\d{4})/;
  const match1 = text.match(pattern1);
  console.log('Pattern 1 (\\d{10}\\s*date):', match1 ? match1[2] : 'NO MATCH');

  // Test pattern 2: Invoice followed by number and date
  const pattern2 = /Invoice(\d{10})\s*(\d{2}\/\d{2}\/\d{4})/;
  const match2 = text.match(pattern2);
  console.log('Pattern 2 (Invoice\\d{10}\\s*date):', match2 ? match2[2] : 'NO MATCH');

  // Test pattern 3: Invoice Date followed by Invoice and number
  const pattern3 = /Invoice\s+Date[^\n]*\n[^\n]*Invoice(\d{10})[^\n]*\n(\d{2}\/\d{2}\/\d{4})/;
  const match3 = text.match(pattern3);
  console.log('Pattern 3 (Invoice Date label):', match3 ? match3[2] : 'NO MATCH');

  // Show context around invoice number
  const idx = text.indexOf(invoiceNum);
  if (idx !== -1) {
    const context = text.substring(idx - 20, idx + 60);
    console.log('Context around invoice #:');
    console.log(context.replace(/\n/g, '↵'));
  }
  console.log('\n');
}

(async () => {
  await testExtraction('9021570042');
  await testExtraction('9025264361');
  await testExtraction('9027091040');
})();
