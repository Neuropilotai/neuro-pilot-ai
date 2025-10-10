const fs = require('fs');
const path = require('path');

console.log('🔧 FIXING SPECIFIC INVOICE 9022353883\n');

const invoiceNumber = '9022353883';
const correctTotal = 71786.74;
const currentIncorrectTotal = 70374.77;

// Find and update the specific order file
const gfsOrdersDir = './data/gfs_orders';
const files = fs.readdirSync(gfsOrdersDir)
  .filter(file => file.endsWith('.json') && file.includes('gfs_order_'))
  .filter(file => !file.includes('corrupted') && !file.includes('deleted_'));

let found = false;

for (const file of files) {
  try {
    const filePath = path.join(gfsOrdersDir, file);
    const order = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    if (order.invoiceNumber === invoiceNumber) {
      console.log(`✅ Found invoice ${invoiceNumber} in file: ${file}`);
      console.log(`📊 Current values:`);
      console.log(`   totalValue: $${order.totalValue}`);
      console.log(`   originalPdfTotal: ${order.originalPdfTotal}`);
      
      // Update with the correct total
      order.totalValue = correctTotal;
      order.originalPdfTotal = `$${correctTotal.toFixed(2)}`;
      order.subtotal = correctTotal;
      order.totalWithTax = correctTotal;
      order.invoiceTotalWithTax = correctTotal;
      order.pdfCorrected = true;
      order.pdfCorrectionDate = new Date().toISOString();
      order.pdfCorrectionReason = 'Manual correction to match actual invoice total with tax breakdown';
      
      // Save the updated order
      fs.writeFileSync(filePath, JSON.stringify(order, null, 2));
      
      console.log(`\n🔄 Updated values:`);
      console.log(`   totalValue: $${order.totalValue}`);
      console.log(`   originalPdfTotal: ${order.originalPdfTotal}`);
      console.log(`   Correction applied: ${order.pdfCorrected}`);
      console.log(`\n💾 Saved updated invoice data`);
      found = true;
      break;
    }
  } catch (error) {
    console.log(`⚠️ Error processing ${file}: ${error.message}`);
  }
}

if (!found) {
  console.log(`❌ Invoice ${invoiceNumber} not found in order files`);
} else {
  console.log(`\n🎉 Invoice ${invoiceNumber} successfully updated!`);
  console.log(`📈 Correction: $${currentIncorrectTotal} → $${correctTotal} (+$${(correctTotal - currentIncorrectTotal).toFixed(2)})`);
}