const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');

console.log('🔄 REPROCESSING ALL REAL PDF ORDERS FROM ONEDRIVE');
console.log('='.repeat(80));

// Helper function to extract order data from PDF
async function extractOrderDataFromPDF(pdfFilePath, invoiceNumber) {
  try {
    if (!fs.existsSync(pdfFilePath)) {
      return { success: false, reason: 'PDF not found' };
    }

    const dataBuffer = fs.readFileSync(pdfFilePath);
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
      isCreditMemo,
      pdfText: pdfText.substring(0, 1000) // First 1000 chars for debugging
    };

  } catch (error) {
    console.error(`❌ Error processing ${invoiceNumber}: ${error.message}`);
    return { success: false, reason: error.message };
  }
}

// Main function to reprocess all PDFs from OneDrive
async function reprocessAllOneDrivePDFs() {
  const oneDriveDir = '/Users/davidmikulis/Library/CloudStorage/OneDrive-Personal/GFS Order PDF';
  const gfsOrdersDir = './data/gfs_orders';

  // Ensure directories exist
  if (!fs.existsSync(gfsOrdersDir)) {
    fs.mkdirSync(gfsOrdersDir, { recursive: true });
  }

  // Get all PDF files from OneDrive folder
  let availablePdfs = [];
  try {
    console.log(`📂 Checking OneDrive folder: ${oneDriveDir}`);
    const invoiceFiles = fs.readdirSync(oneDriveDir);
    availablePdfs = invoiceFiles
      .filter(file => file.endsWith('.pdf'))
      .map(file => file.replace('.pdf', ''));
    console.log(`📋 Found ${availablePdfs.length} PDF files in OneDrive folder`);

    // Show first few files for verification
    console.log('📋 Sample files found:');
    availablePdfs.slice(0, 5).forEach(pdf => console.log(`   - ${pdf}.pdf`));
    if (availablePdfs.length > 5) {
      console.log(`   ... and ${availablePdfs.length - 5} more`);
    }

  } catch (error) {
    console.error('❌ Could not load OneDrive directory:', error.message);
    console.error('❌ Make sure the OneDrive path is correct and accessible');
    return;
  }

  if (availablePdfs.length === 0) {
    console.log('❌ No PDF files found in OneDrive folder');
    return;
  }

  // Remove existing order files to reprocess everything fresh
  console.log('\n🗑️ Clearing existing order files for fresh reprocessing...');
  try {
    const existingFiles = fs.readdirSync(gfsOrdersDir).filter(file => file.endsWith('.json'));
    for (const file of existingFiles) {
      const filePath = path.join(gfsOrdersDir, file);
      try {
        fs.unlinkSync(filePath);
      } catch (error) {
        console.error(`Error deleting ${file}: ${error.message}`);
      }
    }
    console.log(`🗑️ Cleared ${existingFiles.length} existing files`);
  } catch (error) {
    console.log('📂 No existing files to clear (or directory doesn\'t exist yet)');
  }

  console.log('\n' + '='.repeat(80));
  console.log('📦 REPROCESSING ALL PDF FILES FROM ONEDRIVE:');
  console.log('='.repeat(80));

  let created = 0;
  let errors = 0;

  for (const invoiceNumber of availablePdfs) {
    try {
      console.log(`\n🔄 Processing ${invoiceNumber}...`);

      const pdfPath = path.join(oneDriveDir, `${invoiceNumber}.pdf`);
      const extractionResult = await extractOrderDataFromPDF(pdfPath, invoiceNumber);

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
          source: 'ONEDRIVE_PDF_REPROCESSING',
          status: 'active',
          pdfPath: pdfPath,
          reprocessed: true
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

  console.log('\n' + '='.repeat(80));
  console.log('📊 REPROCESSING SUMMARY:');
  console.log('='.repeat(80));
  console.log(`📁 Total PDFs found: ${availablePdfs.length}`);
  console.log(`✅ Order files created: ${created}`);
  console.log(`❌ Errors: ${errors}`);

  if (created > 0) {
    console.log('\n🎉 All OneDrive PDFs reprocessed successfully!');
    console.log('💡 Next steps:');
    console.log('   - Run line items extraction to populate items arrays');
    console.log('   - Run inventory calculation to update stock levels');
    console.log('   - Check the inventory system at http://localhost:8083');
  }

  return { created, errors, totalPdfs: availablePdfs.length };
}

// Run the reprocessing
reprocessAllOneDrivePDFs().catch(console.error);