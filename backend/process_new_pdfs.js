const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');

console.log('🔍 PROCESSING NEW PDF ORDERS\n');
console.log('='.repeat(80));

// Helper function to extract basic order data from PDF
async function extractOrderDataFromPDF(invoiceNumber) {
  try {
    const invoicesPath = '/Users/davidmikulis/Library/CloudStorage/OneDrive-Personal/GFS Order PDF';
    const pdfPath = path.join(invoicesPath, `${invoiceNumber}.pdf`);
    
    if (!fs.existsSync(pdfPath)) {
      return { success: false, reason: 'PDF not found' };
    }
    
    const dataBuffer = fs.readFileSync(pdfPath);
    const data = await pdf(dataBuffer);
    const pdfText = data.text;
    
    console.log(`📄 Extracting data from ${invoiceNumber}...`);
    
    // Check if this is a credit memo
    const isCreditMemo = /credit\s*memo/i.test(pdfText) || /^2002\d{6}$/.test(invoiceNumber);
    
    // Extract order date
    let orderDate = null;
    const datePatterns = [
      /ORDER\s+DATE[:\s]+(\d{2}\/\d{2}\/\d{4})/i,
      /INVOICE\s+DATE[:\s]+(\d{2}\/\d{2}\/\d{4})/i,
      /DATE[:\s]+(\d{2}\/\d{2}\/\d{4})/i
    ];
    
    for (const pattern of datePatterns) {
      const match = pdfText.match(pattern);
      if (match) {
        const dateStr = match[1];
        const [month, day, year] = dateStr.split('/');
        orderDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        break;
      }
    }
    
    // Extract invoice total
    const totalPatterns = [
      /INVOICE\s+TOTAL\s*[:.]?\s*\$?([\\d,]+\.?\d*)/i,
      /TOTAL\s+AMOUNT\s*[:.]?\s*\$?([\\d,]+\.?\d*)/i,
      /AMOUNT\s+DUE\s*[:.]?\s*\$?([\\d,]+\.?\d*)/i,
      /GRAND\s+TOTAL\s*[:.]?\s*\$?([\\d,]+\.?\d*)/i,
      /CREDIT\s+MEMO\s*[:.]?\s*\$?-?([\\d,]+\.?\d*)/i,
      /CREDIT\s+AMOUNT\s*[:.]?\s*\$?-?([\\d,]+\.?\d*)/i
    ];
    
    let invoiceTotal = null;
    for (const pattern of totalPatterns) {
      const match = pdfText.match(pattern);
      if (match) {
        let value = match[1].replace(/,/g, '');
        let numValue = parseFloat(value);
        if (isCreditMemo && numValue > 0) {
          numValue = -numValue;
        }
        invoiceTotal = numValue;
        break;
      }
    }
    
    // Extract customer/business info
    let businessName = 'Unknown Business';
    const businessPatterns = [
      /BILL\s+TO[:\s\n]+([A-Z\s]+)/i,
      /SHIP\s+TO[:\s\n]+([A-Z\s]+)/i
    ];
    
    for (const pattern of businessPatterns) {
      const match = pdfText.match(pattern);
      if (match) {
        businessName = match[1].trim().split('\n')[0];
        break;
      }
    }
    
    console.log(`  📅 Date: ${orderDate || 'Not found'}`);
    console.log(`  💰 Total: $${invoiceTotal ? Math.abs(invoiceTotal).toFixed(2) : 'Not found'}`);
    console.log(`  🏢 Business: ${businessName}`);
    console.log(`  📋 Type: ${isCreditMemo ? 'Credit Memo' : 'Invoice'}`);
    
    return {
      success: true,
      invoiceNumber,
      orderDate,
      totalValue: invoiceTotal,
      businessName,
      type: isCreditMemo ? 'credit' : 'invoice',
      isCreditMemo
    };
    
  } catch (error) {
    console.error(`❌ Error processing ${invoiceNumber}: ${error.message}`);
    return { success: false, reason: error.message };
  }
}

// Main function to process new PDFs
async function processNewPDFs() {
  const invoicesDir = '/Users/davidmikulis/Library/CloudStorage/OneDrive-Personal/GFS Order PDF';
  const gfsOrdersDir = './data/gfs_orders';
  
  // Get all PDF files
  let availablePdfs = [];
  try {
    const invoiceFiles = fs.readdirSync(invoicesDir);
    availablePdfs = invoiceFiles
      .filter(file => file.endsWith('.pdf'))
      .map(file => file.replace('.pdf', ''));
    console.log(`📋 Found ${availablePdfs.length} PDF files in OneDrive`);
  } catch (error) {
    console.error('❌ Could not load invoice directory:', error.message);
    return;
  }
  
  // Get existing order files
  const existingFiles = fs.readdirSync(gfsOrdersDir)
    .filter(file => file.endsWith('.json') && file.includes('gfs_order_'))
    .filter(file => !file.includes('corrupted') && !file.includes('deleted_'));
  
  const existingInvoiceNumbers = new Set();
  existingFiles.forEach(file => {
    try {
      const filePath = path.join(gfsOrdersDir, file);
      const order = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (order.invoiceNumber) {
        existingInvoiceNumbers.add(order.invoiceNumber);
      }
    } catch (error) {
      console.error(`Error reading ${file}: ${error.message}`);
    }
  });
  
  console.log(`📂 Found ${existingFiles.length} existing order files`);
  console.log(`🔍 Existing invoice numbers: ${existingInvoiceNumbers.size}`);
  
  // Find PDFs without corresponding order files
  const newPdfs = availablePdfs.filter(pdf => !existingInvoiceNumbers.has(pdf));
  
  console.log(`\\n🆕 Found ${newPdfs.length} new PDFs to process:`);
  if (newPdfs.length === 0) {
    console.log('   No new PDFs found - all PDFs have corresponding order files');
    return;
  }
  
  newPdfs.slice(0, 10).forEach(pdf => console.log(`   - ${pdf}`));
  if (newPdfs.length > 10) {
    console.log(`   ... and ${newPdfs.length - 10} more`);
  }
  
  console.log('\\n' + '='.repeat(80));
  console.log('📦 CREATING ORDER FILES FOR NEW PDFs:');
  console.log('='.repeat(80));
  
  let created = 0;
  let errors = 0;
  
  for (const invoiceNumber of newPdfs) {
    try {
      console.log(`\\n🔄 Processing ${invoiceNumber}...`);
      
      const extractionResult = await extractOrderDataFromPDF(invoiceNumber);
      
      if (extractionResult.success) {
        // Create order file
        const orderData = {
          invoiceNumber: extractionResult.invoiceNumber,
          orderDate: extractionResult.orderDate,
          totalValue: extractionResult.totalValue,
          subtotal: extractionResult.totalValue,
          totalWithTax: extractionResult.totalValue,
          invoiceTotalWithTax: extractionResult.totalValue,
          businessName: extractionResult.businessName,
          type: extractionResult.type,
          isCreditMemo: extractionResult.isCreditMemo,
          items: [], // Will be populated by line items extraction
          processedDate: new Date().toISOString(),
          extractedFromPdf: true,
          pdfProcessingDate: new Date().toISOString(),
          source: 'PDF_EXTRACTION',
          status: 'active'
        };
        
        // Generate filename with date if available
        let filename;
        if (extractionResult.orderDate) {
          const dateForFile = extractionResult.orderDate.replace(/-/g, '');
          filename = `gfs_order_GFS_${dateForFile}_${invoiceNumber}.json`;
        } else {
          filename = `gfs_order_${invoiceNumber}.json`;
        }
        
        const filePath = path.join(gfsOrdersDir, filename);
        fs.writeFileSync(filePath, JSON.stringify(orderData, null, 2));
        
        console.log(`  ✅ Created: ${filename}`);
        created++;
      } else {
        console.log(`  ❌ Failed to extract data: ${extractionResult.reason}`);
        errors++;
      }
      
    } catch (error) {
      console.error(`❌ Error processing ${invoiceNumber}:`, error.message);
      errors++;
    }
  }
  
  console.log('\\n' + '='.repeat(80));
  console.log('📊 PROCESSING SUMMARY:');
  console.log('='.repeat(80));
  console.log(`📁 New PDFs found: ${newPdfs.length}`);
  console.log(`✅ Order files created: ${created}`);
  console.log(`❌ Errors: ${errors}`);
  
  if (created > 0) {
    console.log('\\n🎉 New order files created successfully!');
    console.log('💡 Run line items extraction to populate the items arrays');
    console.log('💡 Run missing weeks analysis to see updated coverage');
  }
  
  return { created, errors, newPdfs: newPdfs.length };
}

// Run the processing
processNewPDFs().catch(console.error);