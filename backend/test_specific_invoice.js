const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');

console.log('🔍 TESTING SPECIFIC INVOICE EXTRACTION\n');

// PDF extraction function with improved patterns
async function extractInvoiceTotalFromPDF(invoiceNumber) {
  try {
    const invoicesPath = '/Users/davidmikulis/Library/CloudStorage/OneDrive-Personal/GFS Order PDF';
    const pdfPath = path.join(invoicesPath, `${invoiceNumber}.pdf`);
    
    // Check if PDF exists
    if (!fs.existsSync(pdfPath)) {
      console.log(`📄 PDF not found: ${invoiceNumber}.pdf`);
      return null;
    }
    
    // Read and parse PDF
    const dataBuffer = fs.readFileSync(pdfPath);
    const data = await pdf(dataBuffer);
    const pdfText = data.text;
    
    console.log(`📋 PDF Text Preview for ${invoiceNumber}:`);
    console.log('='.repeat(80));
    // Show relevant parts of the PDF text
    const lines = pdfText.split('\n');
    const totalLines = lines.filter(line => 
      /total|invoice|amount|due|gst|hst|pst|qst|misc|sub/i.test(line)
    );
    totalLines.slice(0, 20).forEach(line => {
      if (line.trim()) console.log(`   ${line.trim()}`);
    });
    console.log('='.repeat(80));
    
    // Check if this is a credit memo
    const isCreditMemo = /credit/i.test(pdfText) || /2002\d{6}/.test(pdfText);
    
    // Common patterns for invoice totals (ordered by priority - most specific first)
    const patterns = [
      // Final totals after all taxes
      /INVOICE\s+TOTAL\s*[:.]?\s*\$?([\d,]+\.?\d*)/i,
      /TOTAL\s+AMOUNT\s*[:.]?\s*\$?([\d,]+\.?\d*)/i,
      /AMOUNT\s+DUE\s*[:.]?\s*\$?([\d,]+\.?\d*)/i,
      /TOTAL\s+DUE\s*[:.]?\s*\$?([\d,]+\.?\d*)/i,
      /BALANCE\s+DUE\s*[:.]?\s*\$?([\d,]+\.?\d*)/i,
      // Tax inclusive totals
      /TOTAL\s+INCLUDING\s+TAXES?\s*[:.]?\s*\$?([\d,]+\.?\d*)/i,
      /TOTAL\s+WITH\s+TAX(?:ES)?\s*[:.]?\s*\$?([\d,]+\.?\d*)/i,
      /GRAND\s+TOTAL\s*[:.]?\s*\$?([\d,]+\.?\d*)/i,
      // Final total after GST/PST
      /GST\/HST\s*\$[\d,]+\.?\d*\s*.*?TOTAL\s*[:.]?\s*\$?([\d,]+\.?\d*)/is,
      /PST\/QST\s*\$[\d,]+\.?\d*\s*.*?GST\/HST\s*\$[\d,]+\.?\d*\s*.*?\$?([\d,]+\.?\d*)/is,
      // Subtotals and taxes pattern matching
      /Sub\s+total\s*\$[\d,]+\.?\d*\s*.*?(?:PST|QST|GST|HST).*?\$?([\d,]+\.?\d*)/is,
      // Generic total patterns (lower priority)
      /TOTAL\s*[:.]?\s*\$?([\d,]+\.?\d*)/i,
      /CREDIT\s+MEMO\s*[:.]?\s*\$?-?([\d,]+\.?\d*)/i,
      // Credit memo patterns
      /\$?([\d,]+\.?\d*)\s*CR/i,
    ];
    
    console.log(`\n🔍 Testing patterns for ${invoiceNumber}:`);
    
    for (let i = 0; i < patterns.length; i++) {
      const pattern = patterns[i];
      const match = pdfText.match(pattern);
      if (match) {
        let value = match[1].replace(/,/g, ''); // Remove commas
        let numValue = parseFloat(value);
        
        // For credit memos, make the value negative
        if (isCreditMemo && numValue > 0) {
          numValue = -numValue;
        }
        
        console.log(`✅ Pattern ${i + 1} matched: ${pattern.toString()}`);
        console.log(`   Extracted value: $${numValue} (${isCreditMemo ? 'Credit' : 'Invoice'})`);
        console.log(`   Raw match: "${match[0]}"`);
        return numValue;
      } else {
        console.log(`❌ Pattern ${i + 1} failed: ${pattern.toString()}`);
      }
    }
    
    console.log(`⚠️ No total found in PDF: ${invoiceNumber}`);
    return null;
  } catch (error) {
    console.log(`❌ Error extracting from ${invoiceNumber}: ${error.message}`);
    return null;
  }
}

async function testSpecificInvoice() {
  const invoiceNumber = '9022353883';
  console.log(`🎯 Testing invoice ${invoiceNumber}`);
  console.log(`Expected total: $71,786.74`);
  console.log(`Current system shows: $70,374.77\n`);
  
  const extractedTotal = await extractInvoiceTotalFromPDF(invoiceNumber);
  
  console.log(`\n📊 Results:`);
  if (extractedTotal !== null) {
    console.log(`✅ Extracted: $${Math.abs(extractedTotal).toFixed(2)}`);
    console.log(`🎯 Expected:  $71,786.74`);
    
    const difference = Math.abs(Math.abs(extractedTotal) - 71786.74);
    if (difference < 0.01) {
      console.log(`🎉 PERFECT MATCH!`);
    } else {
      console.log(`📏 Difference: $${difference.toFixed(2)}`);
    }
  } else {
    console.log(`❌ Failed to extract total`);
  }
}

testSpecificInvoice().catch(console.error);