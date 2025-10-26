#!/bin/bash
# Load Item Bank from GFS Master CSV
# Usage: ./load_item_bank_from_gfs_csv.sh <csv_file>
# CSV Format: item_no,description,uom,pack_size,category,tax_profile

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
DB_PATH="${DB_PATH:-$BACKEND_DIR/data/enterprise_inventory.db}"

CSV_FILE="${1:-}"

if [ -z "$CSV_FILE" ]; then
    echo "❌ Usage: $0 <csv_file>"
    echo "   CSV Format: item_no,description,uom,pack_size,category,tax_profile"
    exit 1
fi

if [ ! -f "$CSV_FILE" ]; then
    echo "❌ File not found: $CSV_FILE"
    exit 1
fi

echo "================================================================================"
echo "GFS ITEM BANK LOADER"
echo "================================================================================"
echo "Database: $DB_PATH"
echo "CSV File: $CSV_FILE"
echo ""

# Count existing items
EXISTING_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM item_bank WHERE vendor='GFS'")
echo "📦 Existing items in bank: $EXISTING_COUNT"
echo ""

# Create temp SQL file
TEMP_SQL=$(mktemp)
trap "rm -f $TEMP_SQL" EXIT

# Start transaction
cat > "$TEMP_SQL" <<EOF
BEGIN TRANSACTION;
EOF

# Parse CSV and generate INSERT statements
LOADED=0
UPDATED=0
SKIPPED=0
LINE_NUM=0

while IFS=, read -r item_no description uom pack_size category tax_profile_name; do
    LINE_NUM=$((LINE_NUM + 1))

    # Skip header
    if [ $LINE_NUM -eq 1 ]; then
        continue
    fi

    # Skip empty lines
    if [ -z "$item_no" ]; then
        continue
    fi

    # Clean fields
    item_no=$(echo "$item_no" | xargs)
    description=$(echo "$description" | xargs | sed "s/'/''/g")
    uom=$(echo "$uom" | xargs | tr '[:lower:]' '[:upper:]')
    pack_size=$(echo "$pack_size" | xargs)
    category=$(echo "$category" | xargs)
    tax_profile_name=$(echo "$tax_profile_name" | xargs)

    # Default values
    if [ -z "$tax_profile_name" ]; then
        tax_profile_name="ZERO_RATED"
    fi

    # Map category name to code
    case "$category" in
        Bakery|BAKE) category_code="BAKE" ;;
        Beverage|BEV) category_code="BEV_ECO" ;;
        Dairy|Milk|MILK) category_code="MILK" ;;
        Grocery|GROC) category_code="GROC_MISC" ;;
        Meat|MEAT) category_code="MEAT" ;;
        Produce|PROD) category_code="PROD" ;;
        Clean|Cleaning|CLEAN) category_code="CLEAN" ;;
        Paper|PAPER) category_code="PAPER" ;;
        Equipment|EQUIP) category_code="SMALL_EQUIP" ;;
        Freight|FREIGHT) category_code="FREIGHT" ;;
        Linen|LINEN) category_code="LINEN" ;;
        Propane|PROPANE) category_code="PROPANE" ;;
        *) category_code="OTHER" ;;
    esac

    # Parse pack_size multiplier
    pack_multiplier="NULL"
    if [ -n "$pack_size" ]; then
        # Try to extract numeric multiplier from patterns like "6x2kg", "12/1lb", "24ct"
        if [[ "$pack_size" =~ ([0-9]+)[xX]([0-9]+) ]]; then
            pack_multiplier=$(( ${BASH_REMATCH[1]} * ${BASH_REMATCH[2]} ))
        elif [[ "$pack_size" =~ ([0-9]+)[/\-] ]]; then
            pack_multiplier="${BASH_REMATCH[1]}"
        elif [[ "$pack_size" =~ ([0-9]+)[cC][tT] ]]; then
            pack_multiplier="${BASH_REMATCH[1]}"
        fi
    fi

    # Generate INSERT OR REPLACE statement
    cat >> "$TEMP_SQL" <<EOSQL
INSERT INTO item_bank (vendor, item_no, description, uom, pack_size, pack_multiplier, category_code, tax_profile_id, status, confidence_score, last_seen_date, updated_at)
VALUES (
    'GFS',
    '$item_no',
    '$description',
    '$uom',
    $([ -n "$pack_size" ] && echo "'$pack_size'" || echo "NULL"),
    $pack_multiplier,
    '$category_code',
    (SELECT tax_profile_id FROM tax_profiles WHERE profile_name = '$tax_profile_name' LIMIT 1),
    'ACTIVE',
    1.0,
    DATE('now'),
    CURRENT_TIMESTAMP
)
ON CONFLICT(vendor, item_no) DO UPDATE SET
    description = excluded.description,
    uom = excluded.uom,
    pack_size = excluded.pack_size,
    pack_multiplier = excluded.pack_multiplier,
    category_code = excluded.category_code,
    tax_profile_id = excluded.tax_profile_id,
    status = 'ACTIVE',
    last_seen_date = DATE('now'),
    updated_at = CURRENT_TIMESTAMP;

EOSQL

    LOADED=$((LOADED + 1))

    if [ $((LOADED % 100)) -eq 0 ]; then
        echo "  Processed $LOADED items..."
    fi

done < "$CSV_FILE"

# Commit transaction
cat >> "$TEMP_SQL" <<EOF
COMMIT;

-- Report statistics
SELECT '✓ Item Bank loaded successfully' as status;
SELECT COUNT(*) as total_items FROM item_bank WHERE vendor='GFS';
SELECT category_code, COUNT(*) as count FROM item_bank WHERE vendor='GFS' GROUP BY category_code;
EOF

echo "📝 Executing SQL import..."
sqlite3 "$DB_PATH" < "$TEMP_SQL"

echo ""
echo "================================================================================"
echo "IMPORT COMPLETE"
echo "================================================================================"
echo "✅ Processed $LOADED items from CSV"
echo "📦 Database: $DB_PATH"
echo ""
echo "To verify:"
echo "  sqlite3 $DB_PATH \"SELECT COUNT(*) FROM item_bank WHERE vendor='GFS'\""
echo ""
