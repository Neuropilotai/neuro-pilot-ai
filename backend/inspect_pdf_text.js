const fs = require('fs');
const pdf = require('pdf-parse');

async function inspectPDF(pdfPath) {
  const dataBuffer = fs.readFileSync(pdfPath);
  const data = await pdf(dataBuffer);

  console.log('PDF TEXT CONTENT:');
  console.log('='.repeat(80));
  console.log(data.text);
  console.log('='.repeat(80));
  console.log(`Total characters: ${data.text.length}`);
  console.log(`Total pages: ${data.numpages}`);
}

// Inspect the first failing PDF
const pdfPath = process.argv[2] || '/Users/davidmikulis/neuro-pilot-ai/backend/data/invoices/9020806183.pdf';
inspectPDF(pdfPath).catch(console.error);
