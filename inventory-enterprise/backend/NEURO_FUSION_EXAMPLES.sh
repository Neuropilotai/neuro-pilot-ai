#!/bin/bash
# NeuroPilot Fusion Ingest - Example Commands
# Generated: 2025-10-10

# ============================================================================
# BASIC USAGE
# ============================================================================

# Dry-run (default - no DB writes)
python3 neuro_fusion_ingest.py \
  --contractor "/Users/davidmikulis/Documents/Copy of APRIL request.xlsx" \
  --accounting "/Users/davidmikulis/Desktop/GFS_Accounting_Report_2025-09-26.xlsx" \
  --db "db/inventory_enterprise.db" \
  --console-url "http://localhost:8083" \
  --out-dir "/tmp/fusion_output" \
  --month "2025-04"


# ============================================================================
# APPLY TO DATABASE (After Owner Approval)
# ============================================================================

# Apply SQL files directly
python3 neuro_fusion_ingest.py \
  --contractor "/Users/davidmikulis/Documents/Copy of APRIL request.xlsx" \
  --accounting "/Users/davidmikulis/Desktop/GFS_Accounting_Report_2025-09-26.xlsx" \
  --db "db/inventory_enterprise.db" \
  --month "2025-04" \
  --apply


# ============================================================================
# CUSTOM PARAMETERS
# ============================================================================

# Lower fuzzy threshold (more permissive matching)
python3 neuro_fusion_ingest.py \
  --contractor "/path/to/contractor.xlsx" \
  --accounting "/path/to/accounting.xlsx" \
  --month "2025-04" \
  --fuzzy-threshold 0.50

# Increase date window for invoice matching
python3 neuro_fusion_ingest.py \
  --contractor "/path/to/contractor.xlsx" \
  --accounting "/path/to/accounting.xlsx" \
  --month "2025-04" \
  --max-date-drift-days 7

# Custom output directory
python3 neuro_fusion_ingest.py \
  --contractor "/path/to/contractor.xlsx" \
  --accounting "/path/to/accounting.xlsx" \
  --month "2025-04" \
  --out-dir "/Users/davidmikulis/Desktop/Fusion_April_2025"


# ============================================================================
# REVIEW ARTIFACTS
# ============================================================================

# View audit summary
cat /tmp/fusion_output/AUDIT_SUMMARY_CONTRACTOR_2025-04.md | less

# View owner Q&A
cat /tmp/fusion_output/OWNER_QA_2025-04.md | less

# Review proposed aliases
cat /tmp/fusion_output/item_alias_map.sql | grep "INSERT OR IGNORE"

# Count fuzzy matches
grep "fuzzy matches" /tmp/fusion_output/AUDIT_SUMMARY_CONTRACTOR_2025-04.md

# Check contractor usage CSV
head -20 /tmp/fusion_output/contractor_usage_profile_2025-04.csv

# List all generated files
ls -lh /tmp/fusion_output/


# ============================================================================
# MANUAL SQL APPLICATION (Alternative to --apply)
# ============================================================================

# Apply aliases
sqlite3 db/inventory_enterprise.db < /tmp/fusion_output/item_alias_map.sql

# Apply feedback comments
sqlite3 db/inventory_enterprise.db < /tmp/fusion_output/ai_feedback_comments.sql

# Apply learning insights
sqlite3 db/inventory_enterprise.db < /tmp/fusion_output/ai_learning_insights.sql

# Verify insertions
sqlite3 db/inventory_enterprise.db "
SELECT COUNT(*) as new_aliases
FROM item_alias_map
WHERE created_at >= datetime('now', '-5 minutes');

SELECT COUNT(*) as new_feedback
FROM ai_feedback_comments
WHERE comment_source LIKE 'contractor_fusion%';

SELECT COUNT(*) as new_insights
FROM ai_learning_insights
WHERE status = 'proposed'
  AND first_observed >= '2025-04-01';
"


# ============================================================================
# VALIDATION QUERIES (Read-only)
# ============================================================================

# Check current alias count (before applying)
sqlite3 db/inventory_enterprise.db "SELECT COUNT(*) FROM item_alias_map;"

# Preview how many aliases would be added
cat /tmp/fusion_output/item_alias_map.sql | grep "INSERT OR IGNORE" | wc -l

# Check for conflicts (aliases that already exist)
sqlite3 db/inventory_enterprise.db "
SELECT alias_name, item_code
FROM item_alias_map
WHERE alias_name IN ('sugar', 'coffee box', 'coffee filters', 'hand soap');
"

# Preview feedback comments
cat /tmp/fusion_output/ai_feedback_comments.sql | grep -A 10 "Learning Proposal"


# ============================================================================
# ROLLBACK (If Issues Detected)
# ============================================================================

# Remove recent aliases (within last 10 minutes)
sqlite3 db/inventory_enterprise.db "
DELETE FROM item_alias_map
WHERE created_at >= datetime('now', '-10 minutes');
"

# Remove contractor fusion feedback
sqlite3 db/inventory_enterprise.db "
DELETE FROM ai_feedback_comments
WHERE comment_source LIKE 'contractor_fusion%';
"

# Remove proposed insights
sqlite3 db/inventory_enterprise.db "
DELETE FROM ai_learning_insights
WHERE status = 'proposed'
  AND first_observed >= '2025-04-01';
"

# Verify rollback
sqlite3 db/inventory_enterprise.db "
SELECT
    (SELECT COUNT(*) FROM item_alias_map WHERE created_at >= datetime('now', '-10 minutes')) as aliases_remaining,
    (SELECT COUNT(*) FROM ai_feedback_comments WHERE comment_source LIKE 'contractor_fusion%') as feedback_remaining,
    (SELECT COUNT(*) FROM ai_learning_insights WHERE status = 'proposed' AND first_observed >= '2025-04-01') as insights_remaining;
"


# ============================================================================
# DEBUGGING
# ============================================================================

# Check Excel structure
python3 << 'EOF'
import pandas as pd
xl = pd.ExcelFile("/Users/davidmikulis/Documents/Copy of APRIL request.xlsx")
print(f"Sheets: {xl.sheet_names}")
df = pd.read_excel(xl, sheet_name='HME', header=None)
print(df.head(10))
EOF

# Test database connection
sqlite3 db/inventory_enterprise.db "SELECT COUNT(*) FROM item_master;"

# Check for PDF invoices
sqlite3 db/inventory_enterprise.db "
SELECT COUNT(*) as pdf_count,
       MIN(created_at) as earliest,
       MAX(created_at) as latest
FROM documents
WHERE mime_type = 'application/pdf'
  AND deleted_at IS NULL;
"

# Show sample SKU matches
sqlite3 db/inventory_enterprise.db "
SELECT item_code, item_name
FROM item_master
WHERE item_name LIKE '%coffee%'
LIMIT 10;
"


# ============================================================================
# MULTIPLE MONTHS
# ============================================================================

# Process March 2025
python3 neuro_fusion_ingest.py \
  --contractor "/path/to/MARCH request.xlsx" \
  --accounting "/path/to/GFS_Accounting_Report_2025-03.xlsx" \
  --month "2025-03" \
  --out-dir "/tmp/fusion_march"

# Process April 2025
python3 neuro_fusion_ingest.py \
  --contractor "/path/to/APRIL request.xlsx" \
  --accounting "/path/to/GFS_Accounting_Report_2025-04.xlsx" \
  --month "2025-04" \
  --out-dir "/tmp/fusion_april"

# Process May 2025
python3 neuro_fusion_ingest.py \
  --contractor "/path/to/MAY request.xlsx" \
  --accounting "/path/to/GFS_Accounting_Report_2025-05.xlsx" \
  --month "2025-05" \
  --out-dir "/tmp/fusion_may"


# ============================================================================
# OPEN OWNER CONSOLE
# ============================================================================

# Launch Owner Console in browser
open "http://localhost:8083/owner-console.html"

# Or with specific auth (if needed)
open "http://localhost:8083/owner-super-console.html"


# ============================================================================
# CHECKSUMS & VERIFICATION
# ============================================================================

# Calculate checksums of generated files
shasum -a 256 /tmp/fusion_output/*.sql

# Compare before/after database stats
echo "Before:"
sqlite3 db/inventory_enterprise.db "SELECT COUNT(*) FROM item_alias_map;"

# Apply SQL...
sqlite3 db/inventory_enterprise.db < /tmp/fusion_output/item_alias_map.sql

echo "After:"
sqlite3 db/inventory_enterprise.db "SELECT COUNT(*) FROM item_alias_map;"


# ============================================================================
# END OF EXAMPLES
# ============================================================================
