const fs = require('fs');
const path = require('path');

const ordersDir = './data/gfs_orders';
const pdfsDir = './data/pdfs';

// Get all order files
const orderFiles = fs.readdirSync(ordersDir).filter(f => f.endsWith('.json'));
console.log(`📋 Found ${orderFiles.length} order files to update`);

let updated = 0;
orderFiles.forEach(orderFile => {
  const filePath = path.join(ordersDir, orderFile);
  const orderData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  // Extract invoice number from filename
  const invoiceNum = orderFile.replace('gfs_order_', '').replace('.json', '');

  // Check if PDF exists
  const pdfPath = path.join(pdfsDir, `${invoiceNum}.pdf`);
  const pdfExists = fs.existsSync(pdfPath);

  if (pdfExists) {
    // Update order with PDF path
    orderData.pdfPath = `/data/pdfs/${invoiceNum}.pdf`;
    orderData.pdfUrl = `/api/pdfs/${invoiceNum}.pdf`;
    orderData.hasPdf = true;

    // Save updated order
    fs.writeFileSync(filePath, JSON.stringify(orderData, null, 2));
    updated++;
    console.log(`✅ Updated ${invoiceNum} with PDF link`);
  } else {
    console.log(`⚠️ No PDF found for ${invoiceNum}`);
  }
});

console.log(`
📊 PDF Linking Complete:
- Total Orders: ${orderFiles.length}
- Orders with PDFs: ${updated}
- Missing PDFs: ${orderFiles.length - updated}
`);