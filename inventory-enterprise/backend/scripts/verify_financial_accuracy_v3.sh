#!/bin/bash
# Financial Accuracy Verification V3
# Compares shadow tables vs main tables and validates data quality

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
DB_PATH="${DB_PATH:-$BACKEND_DIR/data/enterprise_inventory.db}"

PERIOD="${1:-}"

if [ -z "$PERIOD" ]; then
    echo "❌ Usage: $0 <fiscal_period>"
    echo "   Example: $0 FY26-P01"
    exit 1
fi

echo "================================================================================"
echo "FINANCIAL ACCURACY VERIFICATION V3"
echo "================================================================================"
echo "Period: $PERIOD"
echo "Database: $DB_PATH"
echo ""

PASSED=0
FAILED=0
WARNINGS=0

# Check 1: Invoice totals match
echo "Check 1: Invoice Totals Comparison"
echo "-----------------------------------"

RESULT=$(sqlite3 -separator '|' "$DB_PATH" <<EOF
SELECT
    COUNT(*) as invoices,
    ROUND(SUM(total_cents)/100.0, 2) as shadow_total,
    ROUND((SELECT SUM(invoice_amount) FROM documents WHERE fiscal_period_id='$PERIOD' AND mime_type='application/pdf' AND deleted_at IS NULL), 2) as main_total,
    ROUND(ABS(SUM(total_cents)/100.0 - (SELECT SUM(invoice_amount) FROM documents WHERE fiscal_period_id='$PERIOD' AND mime_type='application/pdf' AND deleted_at IS NULL)), 2) as variance
FROM invoice_headers_shadow WHERE fiscal_period_id='$PERIOD';
EOF
)

IFS='|' read -r inv_count shadow_total main_total variance <<< "$RESULT"

echo "  Invoices:      $inv_count"
echo "  Shadow Total:  \$$shadow_total"
echo "  Main Total:    \$$main_total"
echo "  Variance:      \$$variance"

if (( $(echo "$variance <= 0.50" | bc -l) )); then
    echo "  ✓ PASS: Variance within tolerance"
    PASSED=$((PASSED + 1))
else
    echo "  ✗ FAIL: Variance exceeds \$0.50"
    FAILED=$((FAILED + 1))
fi

echo ""

# Check 2: Line item reconciliation
echo "Check 2: Line Item Reconciliation"
echo "----------------------------------"

MISMATCHES=$(sqlite3 "$DB_PATH" <<EOF
SELECT COUNT(*) FROM (
    SELECT
        h.invoice_number,
        h.total_cents,
        SUM(li.line_total_cents) as line_sum,
        ABS(h.total_cents - SUM(li.line_total_cents)) as variance
    FROM invoice_headers_shadow h
    JOIN invoice_line_items_shadow li ON h.invoice_number = li.invoice_number
    WHERE h.fiscal_period_id = '$PERIOD'
    GROUP BY h.invoice_number
    HAVING ABS(h.total_cents - SUM(li.line_total_cents)) > 50
);
EOF
)

echo "  Invoices with line item variance >\\$0.50: $MISMATCHES"

if [ "$MISMATCHES" -eq 0 ]; then
    echo "  ✓ PASS: All invoices reconciled"
    PASSED=$((PASSED + 1))
else
    echo "  ⚠️  WARNING: $MISMATCHES invoices need review"
    WARNINGS=$((WARNINGS + 1))

    echo ""
    echo "  Invoices with discrepancies:"
    sqlite3 -header -column "$DB_PATH" <<EOF
SELECT
    h.invoice_number,
    ROUND(h.total_cents/100.0, 2) as header_total,
    ROUND(SUM(li.line_total_cents)/100.0, 2) as line_items_total,
    ROUND(ABS(h.total_cents - SUM(li.line_total_cents))/100.0, 2) as variance
FROM invoice_headers_shadow h
JOIN invoice_line_items_shadow li ON h.invoice_number = li.invoice_number
WHERE h.fiscal_period_id = '$PERIOD'
GROUP BY h.invoice_number
HAVING ABS(h.total_cents - SUM(li.line_total_cents)) > 50
ORDER BY variance DESC
LIMIT 10;
EOF
fi

echo ""

# Check 3: Category coverage
echo "Check 3: Category Coverage"
echo "--------------------------"

UNMAPPED=$(sqlite3 "$DB_PATH" <<EOF
SELECT COUNT(*) FROM invoice_line_items_shadow
WHERE invoice_number IN (SELECT invoice_number FROM invoice_headers_shadow WHERE fiscal_period_id='$PERIOD')
  AND (category_code IS NULL OR category_code = '');
EOF
)

TOTAL_LINES=$(sqlite3 "$DB_PATH" <<EOF
SELECT COUNT(*) FROM invoice_line_items_shadow
WHERE invoice_number IN (SELECT invoice_number FROM invoice_headers_shadow WHERE fiscal_period_id='$PERIOD');
EOF
)

MAPPED=$((TOTAL_LINES - UNMAPPED))
COVERAGE=$(awk "BEGIN {printf \"%.1f\", ($MAPPED / $TOTAL_LINES) * 100}")

echo "  Total Line Items:   $TOTAL_LINES"
echo "  Mapped:             $MAPPED"
echo "  Unmapped:           $UNMAPPED"
echo "  Coverage:           $COVERAGE%"

if [ "$UNMAPPED" -eq 0 ]; then
    echo "  ✓ PASS: 100% category coverage"
    PASSED=$((PASSED + 1))
else
    echo "  ⚠️  WARNING: $UNMAPPED items unmapped"
    WARNINGS=$((WARNINGS + 1))
fi

echo ""

# Check 4: Category breakdown
echo "Check 4: Category Breakdown"
echo "---------------------------"

sqlite3 -header -column "$DB_PATH" <<EOF
SELECT
    COALESCE(ic.label, 'UNMAPPED') as category,
    COUNT(*) as line_count,
    ROUND(SUM(li.line_total_cents)/100.0, 2) as total_dollars
FROM invoice_line_items_shadow li
LEFT JOIN item_categories ic ON li.category_code = ic.category_code
WHERE li.invoice_number IN (SELECT invoice_number FROM invoice_headers_shadow WHERE fiscal_period_id='$PERIOD')
GROUP BY ic.label
ORDER BY total_dollars DESC;
EOF

PASSED=$((PASSED + 1))

echo ""

# Check 5: Validation status
echo "Check 5: Validation Status"
echo "--------------------------"

VALIDATION_STATS=$(sqlite3 -separator '|' "$DB_PATH" <<EOF
SELECT
    validation_status,
    COUNT(*) as count
FROM invoice_line_items_shadow
WHERE invoice_number IN (SELECT invoice_number FROM invoice_headers_shadow WHERE fiscal_period_id='$PERIOD')
GROUP BY validation_status;
EOF
)

echo "$VALIDATION_STATS" | while IFS='|' read -r status count; do
    echo "  $status: $count"
done

echo ""

# Calculate overall score
TOTAL_CHECKS=$((PASSED + FAILED + WARNINGS))
SCORE=$(awk "BEGIN {printf \"%.1f\", (($PASSED + $WARNINGS * 0.5) / $TOTAL_CHECKS) * 100}")

echo "================================================================================"
echo "VERIFICATION SUMMARY"
echo "================================================================================"
echo "Checks Passed:   $PASSED"
echo "Checks Warning:  $WARNINGS"
echo "Checks Failed:   $FAILED"
echo "Overall Score:   $SCORE%"
echo ""

if [ "$FAILED" -eq 0 ]; then
    if (( $(echo "$SCORE >= 95" | bc -l) )); then
        echo "✅ VERIFICATION PASSED - Safe to apply import"
        echo ""
        echo "Next steps:"
        echo "  1. Review any warnings above"
        echo "  2. Run: ./scripts/reimport_gfs_invoices_v2.sh --apply --period $PERIOD"
        exit 0
    else
        echo "⚠️  VERIFICATION PASSED WITH WARNINGS"
        echo "   Review warnings before applying"
        exit 1
    fi
else
    echo "❌ VERIFICATION FAILED"
    echo "   Fix errors before applying"
    exit 2
fi
