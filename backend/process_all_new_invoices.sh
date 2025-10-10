#!/bin/bash

# Process All New Invoices - Complete Workflow
echo ""
echo "🚀 PROCESSING ALL NEW INVOICES"
echo "========================================"
echo ""

# Step 1: Verify PDFs
echo "📋 Step 1: Verifying PDF files..."
PDF_COUNT=$(ls -1 data/pdfs/*.pdf 2>/dev/null | wc -l | tr -d ' ')
echo "   Found $PDF_COUNT PDFs in data/pdfs/"

if [ "$PDF_COUNT" -lt "142" ]; then
    echo ""
    echo "⚠️  Expected 142 PDFs but found $PDF_COUNT"
    echo "   Please download all PDFs from OneDrive first"
    echo ""
    exit 1
fi

echo "   ✅ All PDFs present"
echo ""

# Step 2: Check for new PDFs to extract
echo "📋 Step 2: Checking for new PDFs..."
node verify_new_invoices.js
echo ""

# Step 3: Extract new PDFs
echo "📋 Step 3: Extracting all PDFs..."
node flawless_pdf_extractor.js
echo ""

# Step 4: Clean import
echo "📋 Step 4: Importing all invoices..."
node clean_import_real_data.js
echo ""

# Step 5: Weekly coverage analysis
echo "📋 Step 5: Analyzing weekly coverage..."
node analyze_invoice_coverage.js
echo ""

# Step 6: Final verification
echo "📋 Step 6: Final accuracy check..."
node verify_system_accuracy.js
echo ""

echo "🎉 PROCESSING COMPLETE!"
echo "========================================"
echo ""
