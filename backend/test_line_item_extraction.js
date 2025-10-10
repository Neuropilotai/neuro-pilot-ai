const fs = require('fs');
const pdf = require('pdf-parse');

async function testLineItemExtraction() {
  const pdfPath = '/Users/davidmikulis/neuro-pilot-ai/backend/data/invoices/9020806183.pdf';
  const dataBuffer = fs.readFileSync(pdfPath);
  const pdfData = await pdf(dataBuffer);
  const text = pdfData.text;

  console.log('Testing line item extraction patterns...\n');

  // Show first 20 lines that look like items
  const lines = text.split('\n');
  let itemCount = 0;

  console.log('Lines that start with 6-8 digit item codes:');
  console.log('='.repeat(80));

  for (let i = 0; i < lines.length && itemCount < 20; i++) {
    const line = lines[i].trim();
    if (/^\d{6,8}\s+/.test(line)) {
      console.log(`Line ${i}: ${line}`);
      itemCount++;
    }
  }

  console.log('\n\nNow testing extraction pattern...');
  console.log('='.repeat(80));

  const items = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // GFS item lines start with 6-8 digit item code
    const itemMatch = line.match(/^(\d{6,8})\s+(.+)/);
    if (!itemMatch) continue;

    const itemCode = itemMatch[1];
    const restOfLine = itemMatch[2];

    console.log(`\nItem Code: ${itemCode}`);
    console.log(`Rest of line: ${restOfLine}`);

    // Look for unit markers
    const unitPattern = /(CS|CT|BX|PK|EA|LB|KG|DZ|PR|PC|PACK|CASE)\s+(\d+)/;
    const unitMatch = restOfLine.match(unitPattern);

    if (unitMatch) {
      console.log(`  Unit found: ${unitMatch[1]}`);
      console.log(`  Number after unit: ${unitMatch[2]}`);
    } else {
      console.log(`  No unit pattern matched`);
    }

    // Extract all dollar amounts
    const pricePattern = /(\d+\.\d{2})/g;
    const prices = [];
    let priceMatch;
    while ((priceMatch = pricePattern.exec(restOfLine)) !== null) {
      prices.push(parseFloat(priceMatch[1]));
    }

    console.log(`  Prices found: ${prices.join(', ')}`);

    if (prices.length >= 2) {
      const unitPrice = prices[prices.length - 2];
      const lineTotal = prices[prices.length - 1];
      const quantity = lineTotal / unitPrice;

      console.log(`  → Unit Price: $${unitPrice}, Line Total: $${lineTotal}, Calculated Qty: ${quantity}`);

      items.push({
        itemCode,
        unitPrice,
        lineTotal,
        quantity
      });
    }

    if (items.length >= 10) break; // Just show first 10
  }

  console.log('\n\nExtracted Items Summary:');
  console.log('='.repeat(80));
  console.log(`Total items extracted: ${items.length}`);
  items.forEach((item, i) => {
    console.log(`${i + 1}. ${item.itemCode}: Qty ${item.quantity} @ $${item.unitPrice} = $${item.lineTotal}`);
  });
}

testLineItemExtraction().catch(console.error);
