const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');

console.log('🔍 ANALYZING PDF STRUCTURE FOR LINE ITEM PATTERNS\n');

async function analyzePdfStructure(invoiceNumber) {
  try {
    const invoicesPath = '/Users/davidmikulis/Library/CloudStorage/OneDrive-Personal/GFS Order PDF';
    const pdfPath = path.join(invoicesPath, `${invoiceNumber}.pdf`);
    
    if (!fs.existsSync(pdfPath)) {
      console.log(`📄 PDF not found: ${invoiceNumber}.pdf`);
      return;
    }
    
    const dataBuffer = fs.readFileSync(pdfPath);
    const data = await pdf(dataBuffer);
    const pdfText = data.text;
    
    console.log(`📋 ANALYZING ${invoiceNumber}.pdf`);
    console.log('='.repeat(80));
    console.log('FULL PDF TEXT:');
    console.log('='.repeat(80));
    console.log(pdfText);
    console.log('='.repeat(80));
    
    // Split into lines for analysis
    const lines = pdfText.split('\n');
    console.log('\n📝 LINE BY LINE ANALYSIS:');
    console.log('='.repeat(80));
    
    lines.forEach((line, index) => {
      if (line.trim()) {
        console.log(`${String(index + 1).padStart(3, ' ')}: "${line.trim()}"`);
      }
    });
    
    console.log('='.repeat(80));
    
    // Look for numeric patterns that might be quantities/prices
    console.log('\n🔢 NUMERIC PATTERNS FOUND:');
    console.log('='.repeat(40));
    
    const numericPatterns = [
      /\d+\.\d{2}/g,  // Decimal prices
      /\$\d+\.?\d*/g, // Dollar amounts
      /\d+\s*EA/g,    // Quantities with EA
      /\d+\s*CS/g,    // Case quantities
      /\d+\s*LB/g,    // Pound quantities
      /\d{4,}/g       // Item codes (4+ digits)
    ];
    
    numericPatterns.forEach((pattern, index) => {
      const matches = pdfText.match(pattern);
      if (matches) {
        console.log(`Pattern ${index + 1} (${pattern.toString()}): ${matches.slice(0, 10).join(', ')}${matches.length > 10 ? '...' : ''}`);
      }
    });
    
    // Look for table-like structures
    console.log('\n📊 POTENTIAL TABLE STRUCTURES:');
    console.log('='.repeat(40));
    
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      // Look for lines with multiple numbers separated by spaces
      if (/\d+.*?\d+.*?\d+/.test(trimmed) && trimmed.length > 20) {
        console.log(`Line ${index + 1}: "${trimmed}"`);
      }
    });
    
    // Look for common invoice keywords
    console.log('\n🔍 INVOICE KEYWORDS CONTEXT:');
    console.log('='.repeat(40));
    
    const keywords = ['description', 'qty', 'quantity', 'price', 'amount', 'total', 'item', 'product', 'code'];
    
    keywords.forEach(keyword => {
      const regex = new RegExp(keyword, 'gi');
      const matches = [];
      let match;
      while ((match = regex.exec(pdfText)) !== null) {
        const start = Math.max(0, match.index - 50);
        const end = Math.min(pdfText.length, match.index + keyword.length + 50);
        const context = pdfText.substring(start, end).replace(/\n/g, ' ').trim();
        matches.push(context);
      }
      if (matches.length > 0) {
        console.log(`"${keyword.toUpperCase()}": ${matches[0]}`);
      }
    });
    
  } catch (error) {
    console.error(`❌ Error analyzing ${invoiceNumber}: ${error.message}`);
  }
}

async function analyzeMultiplePdfs() {
  // Analyze a few different invoices to understand patterns
  const invoicesToAnalyze = ['9022353883', '9021570039', '9022080516'];
  
  for (const invoice of invoicesToAnalyze) {
    await analyzePdfStructure(invoice);
    console.log('\n' + '='.repeat(100) + '\n');
  }
}

analyzeMultiplePdfs().catch(console.error);