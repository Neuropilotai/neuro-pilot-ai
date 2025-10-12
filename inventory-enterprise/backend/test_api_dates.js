#!/usr/bin/env node

/**
 * Test API /owner/pdfs endpoint directly to see what dates are returned
 */

const http = require('http');

console.log('🧪 Testing /api/owner/pdfs endpoint...\n');

// Test without auth first to see the response
const options = {
  hostname: 'localhost',
  port: 8083,
  path: '/api/owner/pdfs?limit=10',
  method: 'GET',
  headers: {
    'Content-Type': 'application/json'
  }
};

const req = http.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Headers:', JSON.stringify(res.headers, null, 2));
    console.log('\nResponse Body:');

    try {
      const json = JSON.parse(data);

      if (json.data && Array.isArray(json.data)) {
        console.log(`Found ${json.data.length} PDFs\n`);

        // Look for our test invoices
        const testInvoices = ['9027091043', '9027091044'];

        json.data.forEach(pdf => {
          if (testInvoices.includes(pdf.invoiceNumber)) {
            console.log('━'.repeat(60));
            console.log(`Invoice: ${pdf.invoiceNumber}`);
            console.log(`  invoiceDate: ${pdf.invoiceDate}`);
            console.log(`  vendor: ${pdf.vendor}`);
            console.log(`  amount: ${pdf.amount}`);
            console.log(`  filename: ${pdf.filename}`);

            // Test the date parsing
            if (pdf.invoiceDate) {
              const dateStr = pdf.invoiceDate;

              // OLD METHOD (broken)
              const oldDate = new Date(dateStr);
              const oldDisplay = oldDate.toLocaleDateString();

              // NEW METHOD (fixed)
              if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
                const [year, month, day] = dateStr.split('-');
                const newDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
                const newDisplay = newDate.toLocaleDateString();

                console.log(`  OLD display: ${oldDisplay} ${oldDisplay.includes('19') ? '❌ WRONG' : '✅'}`);
                console.log(`  NEW display: ${newDisplay} ${newDisplay.includes('20') ? '✅ CORRECT' : '❌'}`);
              }
            }
          }
        });

        if (!json.data.some(pdf => testInvoices.includes(pdf.invoiceNumber))) {
          console.log('⚠️  Test invoices not found in first 10 results');
          console.log('Available invoices:', json.data.map(pdf => pdf.invoiceNumber).join(', '));
        }
      } else {
        console.log('Response:', JSON.stringify(json, null, 2));
      }
    } catch (error) {
      console.error('Failed to parse JSON:', error.message);
      console.log('Raw response:', data.substring(0, 500));
    }
  });
});

req.on('error', (error) => {
  console.error('Request failed:', error.message);
});

req.end();
