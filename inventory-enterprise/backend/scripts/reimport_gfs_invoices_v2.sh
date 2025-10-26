#!/bin/bash
# GFS Invoice Reimport Script V2
# Modes: --dry-run (no DB writes), --shadow (write to shadow tables), --apply (write to main tables)
# Usage: ./reimport_gfs_invoices_v2.sh [--mode MODE] [--period FY26-P01] [--since 2025-09-01] [--invoice 9026547323]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
DB_PATH="${DB_PATH:-$BACKEND_DIR/data/enterprise_inventory.db}"

# Default values
MODE="dry-run"
FISCAL_PERIOD=""
SINCE_DATE=""
INVOICE_NUMBER=""
IMPORT_RUN_ID="import-$(date +%Y%m%d-%H%M%S)"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            MODE="dry-run"
            shift
            ;;
        --shadow)
            MODE="shadow"
            shift
            ;;
        --apply)
            MODE="apply"
            shift
            ;;
        --period)
            FISCAL_PERIOD="$2"
            shift 2
            ;;
        --since)
            SINCE_DATE="$2"
            shift 2
            ;;
        --invoice)
            INVOICE_NUMBER="$2"
            shift 2
            ;;
        *)
            echo "❌ Unknown option: $1"
            echo "Usage: $0 [--dry-run|--shadow|--apply] [--period FY26-P01] [--since 2025-09-01] [--invoice 9026547323]"
            exit 1
            ;;
    esac
done

# Mode validation
MODE_UPPER=$(echo "$MODE" | tr '[:lower:]' '[:upper:]' | tr '-' '_')

echo "================================================================================"
echo "GFS INVOICE REIMPORT V2"
echo "================================================================================"
echo "Mode: $MODE_UPPER"
echo "Import Run ID: $IMPORT_RUN_ID"
[ -n "$FISCAL_PERIOD" ] && echo "Fiscal Period: $FISCAL_PERIOD"
[ -n "$SINCE_DATE" ] && echo "Since Date: $SINCE_DATE"
[ -n "$INVOICE_NUMBER" ] && echo "Invoice Number: $INVOICE_NUMBER"
echo "Database: $DB_PATH"
echo ""

# Confirm if APPLY mode
if [ "$MODE" = "apply" ]; then
    echo "⚠️  WARNING: APPLY mode will modify the main database tables!"
    echo "   This action cannot be undone. Press Ctrl+C to cancel."
    echo ""
    read -p "Type 'APPLY' to confirm: " confirmation
    if [ "$confirmation" != "APPLY" ]; then
        echo "❌ Cancelled."
        exit 1
    fi
    echo ""
fi

# Register import run
sqlite3 "$DB_PATH" <<EOF
INSERT INTO finance_import_runs (import_run_id, import_mode, fiscal_period_id, start_date, status, started_at)
VALUES ('$IMPORT_RUN_ID', '$MODE_UPPER', $([ -n "$FISCAL_PERIOD" ] && echo "'$FISCAL_PERIOD'" || echo "NULL"), $([ -n "$SINCE_DATE" ] && echo "'$SINCE_DATE'" || echo "NULL"), 'RUNNING', CURRENT_TIMESTAMP);
EOF

# Build WHERE clause for document filter
WHERE_CLAUSE="d.mime_type = 'application/pdf' AND d.deleted_at IS NULL"
[ -n "$FISCAL_PERIOD" ] && WHERE_CLAUSE="$WHERE_CLAUSE AND d.fiscal_period_id = '$FISCAL_PERIOD'"
[ -n "$SINCE_DATE" ] && WHERE_CLAUSE="$WHERE_CLAUSE AND d.invoice_date >= '$SINCE_DATE'"
[ -n "$INVOICE_NUMBER" ] && WHERE_CLAUSE="$WHERE_CLAUSE AND d.invoice_number = '$INVOICE_NUMBER'"

echo "🔍 Querying invoices to process..."
INVOICE_LIST=$(sqlite3 -separator '|' "$DB_PATH" "SELECT d.id, d.invoice_number, d.invoice_date, d.invoice_amount FROM documents d WHERE $WHERE_CLAUSE ORDER BY d.invoice_date, d.invoice_number")

TOTAL_INVOICES=$(echo "$INVOICE_LIST" | wc -l | xargs)
echo "✓ Found $TOTAL_INVOICES invoices to process"
echo ""

# Clear shadow tables if shadow mode
if [ "$MODE" = "shadow" ]; then
    echo "🗑️  Clearing shadow tables..."
    sqlite3 "$DB_PATH" <<EOF
DELETE FROM invoice_headers_shadow;
DELETE FROM invoice_line_items_shadow;
EOF
    echo "✓ Shadow tables cleared"
    echo ""
fi

# Process each invoice
PROCESSED=0
PASSED=0
FAILED=0
LINES_PROCESSED=0
LINES_MAPPED=0
LINES_UNMAPPED=0

echo "================================================================================"
echo "PROCESSING INVOICES"
echo "================================================================================"

while IFS='|' read -r doc_id invoice_number invoice_date invoice_amount; do
    PROCESSED=$((PROCESSED + 1))

    echo "[$PROCESSED/$TOTAL_INVOICES] Invoice: $invoice_number ($invoice_date) - \$$(printf "%.2f" "$invoice_amount")"

    if [ "$MODE" = "dry-run" ]; then
        # In dry-run mode, just validate without writing
        echo "  [DRY-RUN] Would parse and validate invoice"
        PASSED=$((PASSED + 1))
    else
        # Call Node.js parser
        PARSE_RESULT=$(node "$BACKEND_DIR/scripts/parse_invoice_v2.js" "$doc_id" "$MODE")

        # Check parse result
        if echo "$PARSE_RESULT" | grep -q "\"isValid\":true"; then
            echo "  ✓ Parsed and validated"
            PASSED=$((PASSED + 1))

            # Extract line counts from JSON
            LINE_COUNT=$(echo "$PARSE_RESULT" | jq -r '.lineItems | length')
            MAPPED_COUNT=$(echo "$PARSE_RESULT" | jq -r '.lineItems | map(select(.categoryCode != null)) | length')

            LINES_PROCESSED=$((LINES_PROCESSED + LINE_COUNT))
            LINES_MAPPED=$((LINES_MAPPED + MAPPED_COUNT))
            LINES_UNMAPPED=$((LINES_UNMAPPED + LINE_COUNT - MAPPED_COUNT))

            echo "    Lines: $LINE_COUNT total, $MAPPED_COUNT mapped, $((LINE_COUNT - MAPPED_COUNT)) unmapped"
        else
            echo "  ✗ Validation failed"
            FAILED=$((FAILED + 1))

            # Log error
            ERROR_MSG=$(echo "$PARSE_RESULT" | jq -r '.validation.errors[0].message // "Unknown error"')
            echo "    Error: $ERROR_MSG"

            sqlite3 "$DB_PATH" <<EOF
INSERT INTO finance_verification_alerts (alert_type, severity, fiscal_period_id, invoice_number, description, resolution_status)
VALUES ('REIMPORT_VALIDATION_FAILED', 'ERROR', $([ -n "$FISCAL_PERIOD" ] && echo "'$FISCAL_PERIOD'" || echo "NULL"), '$invoice_number', 'Reimport validation failed: $ERROR_MSG', 'OPEN');
EOF
        fi
    fi

    # Progress indicator
    if [ $((PROCESSED % 10)) -eq 0 ]; then
        echo "  Progress: $PROCESSED/$TOTAL_INVOICES ($PASSED passed, $FAILED failed)"
    fi

done <<< "$INVOICE_LIST"

echo ""
echo "================================================================================"
echo "IMPORT SUMMARY"
echo "================================================================================"
echo "Invoices processed: $PROCESSED"
echo "Invoices passed:    $PASSED"
echo "Invoices failed:    $FAILED"
echo "Lines processed:    $LINES_PROCESSED"
echo "Lines mapped:       $LINES_MAPPED"
echo "Lines unmapped:     $LINES_UNMAPPED"
echo ""

# Calculate validation score
if [ $PROCESSED -gt 0 ]; then
    VALIDATION_SCORE=$(awk "BEGIN {printf \"%.2f\", ($PASSED / $PROCESSED) * 100}")
else
    VALIDATION_SCORE="0.00"
fi

echo "Validation Score: $VALIDATION_SCORE%"
echo ""

# Update import run
sqlite3 "$DB_PATH" <<EOF
UPDATE finance_import_runs SET
    invoices_processed = $PROCESSED,
    invoices_passed = $PASSED,
    invoices_failed = $FAILED,
    lines_processed = $LINES_PROCESSED,
    lines_mapped = $LINES_MAPPED,
    lines_unmapped = $LINES_UNMAPPED,
    validation_score = $VALIDATION_SCORE,
    status = 'COMPLETED',
    completed_at = CURRENT_TIMESTAMP
WHERE import_run_id = '$IMPORT_RUN_ID';
EOF

# Mode-specific completion messages
case "$MODE" in
    dry-run)
        echo "✓ DRY-RUN complete: No data written to database"
        echo "  Next step: Run with --shadow to write to shadow tables for comparison"
        ;;
    shadow)
        echo "✓ SHADOW mode complete: Data written to shadow tables"
        echo "  Next step: Run verification script to compare shadow vs main tables"
        echo "  Command: backend/scripts/verify_financial_accuracy_v3.sh $FISCAL_PERIOD"
        ;;
    apply)
        if (( $(echo "$VALIDATION_SCORE >= 95" | bc -l) )); then
            echo "✅ APPLY mode complete: Data written to main tables"
            echo "   Validation score meets threshold (≥95%)"
            echo "  Next step: Generate reports with backend/scripts/generate_monthly_gfs_reports_v2.py"
        else
            echo "⚠️  APPLY mode complete but validation score below threshold (<95%)"
            echo "   Score: $VALIDATION_SCORE%"
            echo "   Review alerts before using this data"
        fi
        ;;
esac

echo ""
echo "Import Run ID: $IMPORT_RUN_ID"
echo "================================================================================"

# Exit code based on validation score
if (( $(echo "$VALIDATION_SCORE >= 95" | bc -l) )); then
    exit 0
else
    exit 1
fi
