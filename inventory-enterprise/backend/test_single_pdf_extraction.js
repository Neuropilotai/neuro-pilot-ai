#!/usr/bin/env node

const fs = require('fs');
const pdfParse = require('pdf-parse');
const path = require('path');

// Test extraction on first PDF
const pdfPath = path.join(__dirname, 'data/pdfs/2025/10/0035e655ed1da33370dab85184684d9daf9e6be9bf1286d3c756563acdc5a1e6.pdf');

console.log('Testing PDF extraction...');
console.log(`PDF path: ${pdfPath}`);
console.log(`File exists: ${fs.existsSync(pdfPath)}`);

if (!fs.existsSync(pdfPath)) {
  console.error('PDF file not found!');
  process.exit(1);
}

async function test() {
  try {
    const dataBuffer = fs.readFileSync(pdfPath);
    console.log(`Buffer size: ${dataBuffer.length} bytes`);

    const pdfData = await pdfParse(dataBuffer);
    console.log(`\n✅ Extraction successful!`);
    console.log(`Pages: ${pdfData.numpages}`);
    console.log(`Text length: ${pdfData.text.length} characters`);
    console.log(`\nFirst 500 characters:`);
    console.log(pdfData.text.substring(0, 500));
  } catch (error) {
    console.error(`\n❌ Extraction failed:`);
    console.error(error);
  }
}

test();
