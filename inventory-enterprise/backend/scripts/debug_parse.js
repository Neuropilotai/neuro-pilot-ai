const fs = require('fs');
const pdf = require('pdf-parse');

const PDF_PATH = '/Users/davidmikulis/Desktop/inventory july 4 2025 $243,339.79 .pdf';

async function debug() {
  const dataBuffer = fs.readFileSync(PDF_PATH);
  const pdfData = await pdf(dataBuffer);

  const text = pdfData.text;
  const lines = text.split('\n');

  console.log('Total lines:', lines.length);
  console.log('\n=== First 100 lines ===\n');

  lines.slice(0, 100).forEach((line, idx) => {
    console.log(`${idx}: ${line}`);
  });

  // Look for lines with product codes
  console.log('\n=== Lines with # character ===\n');
  lines.filter(l => l.includes('#')).slice(0, 20).forEach((line, idx) => {
    console.log(`${idx}: ${line}`);
  });

  // Look for lines with dollar amounts
  console.log('\n=== Lines with $ character ===\n');
  lines.filter(l => l.includes('$')).slice(0, 20).forEach((line, idx) => {
    console.log(`${idx}: ${line}`);
  });
}

debug().catch(console.error);
