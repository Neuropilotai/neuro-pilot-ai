const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');

console.log('🔍 TESTING PDF VALUE EXTRACTION\n');

// Function to extract invoice total from PDF text
function extractInvoiceTotal(pdfText) {
    // Check if this is a credit memo first
    const isCreditMemo = /credit/i.test(pdfText) || /2002\d{6}/.test(pdfText);
    
    // Common patterns for invoice totals in GFS invoices
    const patterns = [
        /TOTAL\s+\$?([\d,]+\.?\d*)/i,
        /INVOICE\s+TOTAL\s*[:.]?\s*\$?([\d,]+\.?\d*)/i,
        /AMOUNT\s+DUE\s*[:.]?\s*\$?([\d,]+\.?\d*)/i,
        /TOTAL\s+DUE\s*[:.]?\s*\$?([\d,]+\.?\d*)/i,
        /BALANCE\s+DUE\s*[:.]?\s*\$?([\d,]+\.?\d*)/i,
        /GST\/HST\s+TOTAL\s*[:.]?\s*\$?([\d,]+\.?\d*)/i,
        /CREDIT\s+MEMO\s*[:.]?\s*\$?-?([\d,]+\.?\d*)/i,
        // More aggressive patterns for credit memos
        /\$?([\d,]+\.?\d*)\s*CR/i,
        /\$-?([\d,]+\.?\d*)/g, // Last resort - any dollar amount
    ];
    
    for (const pattern of patterns) {
        const match = pdfText.match(pattern);
        if (match) {
            let value = match[1].replace(/,/g, ''); // Remove commas
            let numValue = parseFloat(value);
            
            // For credit memos, make the value negative
            if (isCreditMemo && numValue > 0) {
                numValue = -numValue;
            }
            
            return {
                value: numValue,
                pattern: pattern.toString(),
                matchedText: match[0],
                isCreditMemo: isCreditMemo
            };
        }
    }
    
    return null;
}

async function testPdfExtraction() {
    const invoicesDir = './data/invoices';
    const files = fs.readdirSync(invoicesDir)
        .filter(file => file.endsWith('.pdf'))
        .slice(0, 5); // Test first 5 PDFs
    
    console.log(`📄 Testing ${files.length} PDF files...\n`);
    
    for (const file of files) {
        const filePath = path.join(invoicesDir, file);
        const invoiceNumber = file.replace('.pdf', '');
        
        try {
            console.log(`\n📋 Processing: ${file}`);
            const dataBuffer = fs.readFileSync(filePath);
            const data = await pdf(dataBuffer);
            
            console.log(`   Text length: ${data.text.length} characters`);
            
            // Extract total value
            const result = extractInvoiceTotal(data.text);
            
            if (result) {
                console.log(`   ✅ Found total: $${result.value}`);
                console.log(`   📝 Pattern used: ${result.pattern}`);
                console.log(`   🔍 Matched text: "${result.matchedText}"`);
            } else {
                console.log(`   ❌ No total found`);
                // Show some sample text to help debug
                const sampleText = data.text.substring(0, 500).replace(/\s+/g, ' ');
                console.log(`   📝 Sample text: "${sampleText}..."`);
            }
            
        } catch (error) {
            console.log(`   ❌ Error processing ${file}: ${error.message}`);
        }
    }
}

testPdfExtraction().then(() => {
    console.log('\n🎉 PDF extraction test completed!');
}).catch(error => {
    console.error('❌ Test failed:', error);
});