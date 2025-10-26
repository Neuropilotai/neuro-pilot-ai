#!/bin/bash
# Batch import October 2025 GFS invoices from OneDrive folder
# This will upload all PDFs from October to populate FY26-P02

SOURCE_DIR="/Users/davidmikulis/Library/CloudStorage/OneDrive-Personal/GFS Order PDF"
DB_PATH="data/enterprise_inventory.db"
API_URL="http://localhost:8083/api/owner/docs/upload"

# Get owner token for authentication
if [ -f ".owner_token" ]; then
    OWNER_TOKEN=$(cat .owner_token)
else
    echo "❌ No owner token found. Please run generate_owner_token.js first"
    exit 1
fi

echo "======================================================================"
echo "BATCH IMPORT OCTOBER 2025 GFS INVOICES"
echo "======================================================================"
echo ""
echo "Source: $SOURCE_DIR"
echo "Target: FY26-P02 (October 2025)"
echo ""

# Count October PDFs
OCTOBER_PDFS=$(find "$SOURCE_DIR" -name "*.pdf" -type f -newermt "2025-10-01" ! -newermt "2025-11-01" | wc -l | tr -d ' ')
echo "📁 Found $OCTOBER_PDFS invoice PDFs from October 2025"
echo ""

# Check if server is running
if ! curl -s -o /dev/null -w "%{http_code}" "$API_URL" > /dev/null 2>&1; then
    echo "⚠️  WARNING: Server at $API_URL is not responding"
    echo "   Please start the server first: npm start"
    echo ""
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo "======================================================================"
echo "STARTING IMPORT..."
echo "======================================================================"
echo ""

SUCCESS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0

# Import each October PDF
find "$SOURCE_DIR" -name "*.pdf" -type f -newermt "2025-10-01" ! -newermt "2025-11-01" | while read pdf_file; do
    filename=$(basename "$pdf_file")
    invoice_num="${filename%.pdf}"

    # Check if already imported
    exists=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM documents WHERE invoice_number = '$invoice_num' AND deleted_at IS NULL;" 2>/dev/null)

    if [ "$exists" -gt 0 ]; then
        echo "⏭️  SKIP: $invoice_num (already in database)"
        ((SKIP_COUNT++))
        continue
    fi

    # Upload via API
    echo -n "📤 Uploading: $invoice_num ... "

    response=$(curl -s -w "\n%{http_code}" -X POST \
        -H "Authorization: Bearer $OWNER_TOKEN" \
        -F "file=@$pdf_file" \
        "$API_URL" 2>&1)

    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n-1)

    if [ "$http_code" = "200" ] || [ "$http_code" = "201" ]; then
        echo "✅ SUCCESS"
        ((SUCCESS_COUNT++))
    else
        echo "❌ FAILED (HTTP $http_code)"
        ((FAIL_COUNT++))
        if [ ! -z "$body" ]; then
            echo "   Error: $body"
        fi
    fi

    # Small delay to avoid overwhelming the server
    sleep 0.5
done

echo ""
echo "======================================================================"
echo "IMPORT COMPLETE"
echo "======================================================================"
echo ""
echo "✅ Successful:  $SUCCESS_COUNT"
echo "❌ Failed:      $FAIL_COUNT"
echo "⏭️  Skipped:     $SKIP_COUNT"
echo ""

# Check FY26-P02 status
echo "======================================================================"
echo "FY26-P02 STATUS"
echo "======================================================================"
echo ""

sqlite3 "$DB_PATH" <<EOF
SELECT
    COUNT(*) as invoice_count,
    ROUND(SUM(invoice_amount), 2) as total_amount
FROM documents
WHERE fiscal_period_id = 'FY26-P02'
  AND mime_type = 'application/pdf'
  AND deleted_at IS NULL;
EOF

echo ""
echo "======================================================================"
echo "NEXT STEPS:"
echo "======================================================================"
echo ""
echo "1. Verify invoices imported correctly:"
echo "   sqlite3 $DB_PATH \"SELECT invoice_number, invoice_date, invoice_amount FROM documents WHERE fiscal_period_id = 'FY26-P02' LIMIT 10;\""
echo ""
echo "2. Generate FY26-P02 report:"
echo "   python3 generate_gfs_reports_from_category_recap.py FY26-P02"
echo ""
echo "======================================================================"
