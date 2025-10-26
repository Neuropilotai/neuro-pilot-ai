#!/bin/bash
# Check for missing invoices and help upload them

DB_PATH="data/enterprise_inventory.db"

echo "======================================================================"
echo "INVOICE UPLOAD STATUS CHECK"
echo "======================================================================"
echo ""

# Check what's in database
echo "📊 Invoices in database by period:"
echo "----------------------------------------------------------------------"
sqlite3 "$DB_PATH" <<EOF
SELECT
    fiscal_period_id,
    COUNT(*) as count,
    ROUND(SUM(invoice_amount), 2) as total_amount
FROM documents
WHERE mime_type = 'application/pdf'
  AND deleted_at IS NULL
  AND fiscal_period_id IS NOT NULL
GROUP BY fiscal_period_id
ORDER BY fiscal_period_id;
EOF

echo ""
echo "======================================================================"
echo "RECENT UPLOADS (Last 30 days):"
echo "----------------------------------------------------------------------"
sqlite3 "$DB_PATH" -header -column <<EOF
SELECT
    invoice_number,
    invoice_date,
    fiscal_period_id,
    ROUND(invoice_amount, 2) as amount,
    datetime(created_at) as uploaded
FROM documents
WHERE mime_type = 'application/pdf'
  AND deleted_at IS NULL
  AND datetime(created_at) > datetime('now', '-30 days')
ORDER BY created_at DESC
LIMIT 20;
EOF

echo ""
echo "======================================================================"
echo "MISSING PERIODS:"
echo "----------------------------------------------------------------------"

# Check which fiscal periods have no invoices
sqlite3 "$DB_PATH" <<EOF
SELECT
    'FY' || (fiscal_year % 100) || '-P' || printf('%02d', period) as period_id,
    notes as month,
    period_start_date || ' to ' || period_end_date as date_range,
    CASE
        WHEN (SELECT COUNT(*) FROM documents d
              WHERE d.fiscal_period_id = 'FY' || (fiscal_year % 100) || '-P' || printf('%02d', period)
              AND d.mime_type = 'application/pdf' AND d.deleted_at IS NULL) = 0
        THEN '❌ NO INVOICES'
        ELSE '✅ Has Invoices'
    END as status
FROM fiscal_periods
WHERE fiscal_year IN (2025, 2026)
ORDER BY fiscal_year, period;
EOF

echo ""
echo "======================================================================"
echo "TO UPLOAD OCTOBER INVOICES:"
echo "----------------------------------------------------------------------"
echo "1. Open http://localhost:8083 in your browser"
echo "2. Navigate to the invoice upload page"
echo "3. Upload your October 2025 PDF invoices"
echo "4. Check that fiscal_period_id = FY26-P02 appears"
echo ""
echo "OR use the API directly:"
echo "  curl -F 'file=@/path/to/invoice.pdf' http://localhost:8083/api/owner/docs/upload"
echo ""
echo "======================================================================"
