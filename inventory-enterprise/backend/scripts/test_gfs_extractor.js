// Test GFS price line parsing

const testLines = [
  "Boîte83,88 $6503,28 $",           // Unit: $83.88, Qty: 6, Total: $503.28
  "Boîte50,83 $251 270,75 $",        // Unit: $50.83, Qty: 25, Total: $1,270.75
  "Boîte111,19 $232 557,37 $",       // Unit: $111.19, Qty: 23, Total: $2,557.37
  "Boîte69,99 $281 959,72 $",        // Unit: $69.99, Qty: 28, Total: $1,959.72
  "Unité13,98 $227,96 $"             // Unit: $13.98, Qty: 2, Total: $27.96
];

console.log('Testing GFS price line parsing:\n');

testLines.forEach(line => {
  console.log(`Input: "${line}"`);
  
  // Try to match pattern: [Type][Price]$[Qty][Total]$
  // French format uses comma for decimal, space for thousands
  const match = line.match(/(Boîte|Unité)([\d,]+)\s*\$([\d\s]+)([\d\s,]+)\s*\$/);
  
  if (match) {
    const unitType = match[1];
    const unitPriceStr = match[2].replace(',', '.');
    const quantityStr = match[3].trim();
    const totalStr = match[4].replace(/\s/g, '').replace(',', '.');
    
    const unitPrice = parseFloat(unitPriceStr);
    const quantity = parseFloat(quantityStr);
    const total = parseFloat(totalStr);
    
    console.log(`  Type: ${unitType}`);
    console.log(`  Unit Price: $${unitPrice.toFixed(2)}`);
    console.log(`  Quantity: ${quantity}`);
    console.log(`  Total: $${total.toFixed(2)}`);
    console.log(`  Verify: ${unitPrice} x ${quantity} = ${(unitPrice * quantity).toFixed(2)} (expected: ${total.toFixed(2)})`);
  } else {
    console.log('  NO MATCH');
  }
  console.log('');
});
