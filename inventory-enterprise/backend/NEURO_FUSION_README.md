# NeuroPilot Fusion Ingest Tool

## Overview

`neuro_fusion_ingest.py` is a production-ready Python CLI tool that ingests Contractor Request workbooks and Accounting reports, matches them to PDF invoices on localhost:8083, emits owner-approved learning SQL, and appends Owner Console links to accounting files.

## Features

- ✅ **Contractor Data Ingestion**: Parse multi-sheet Excel workbooks with contractor requests
- ✅ **SKU Mapping**: Fuzzy matching with confidence scores (exact + fuzzy candidates)
- ✅ **Invoice Matching**: Date proximity and text overlap scoring
- ✅ **PDF URL Linking**: Automatic hyperlink generation for localhost invoice viewer
- ✅ **Learning Extraction**: AI feedback comments and pattern insights
- ✅ **Idempotent SQL**: Safe INSERT OR IGNORE/REPLACE statements
- ✅ **Owner Q&A**: Automated generation of 10-question approval form
- ✅ **Audit Reports**: Comprehensive markdown summaries
- ✅ **Dry-Run by Default**: No database writes unless --apply flag used

## Requirements

```bash
# Python 3.10+
python3 --version

# Install dependencies
pip3 install --user pandas openpyxl

# SQLite (standard library - no install needed)
```

## Usage

### Basic Dry-Run (Default)

```bash
python3 neuro_fusion_ingest.py \
  --contractor "/Users/davidmikulis/Documents/Copy of APRIL request.xlsx" \
  --accounting "/Users/davidmikulis/Desktop/GFS_Accounting_Report_2025-09-26.xlsx" \
  --db "db/inventory_enterprise.db" \
  --console-url "http://localhost:8083" \
  --out-dir "/tmp/fusion_output" \
  --month "2025-04"
```

### Apply to Database (After Owner Approval)

```bash
python3 neuro_fusion_ingest.py \
  --contractor "/path/to/contractor.xlsx" \
  --accounting "/path/to/accounting.xlsx" \
  --db "db/inventory_enterprise.db" \
  --month "2025-04" \
  --apply
```

### Custom Parameters

```bash
python3 neuro_fusion_ingest.py \
  --contractor "..." \
  --accounting "..." \
  --db "db/inventory_enterprise.db" \
  --month "2025-04" \
  --fuzzy-threshold 0.70 \
  --max-date-drift-days 5 \
  --out-dir "/custom/output/path"
```

## Command Line Arguments

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `--contractor` | Yes | - | Path to contractor Excel workbook |
| `--accounting` | Yes | - | Path to accounting Excel report |
| `--db` | No | `db/inventory_enterprise.db` | Path to SQLite database |
| `--console-url` | No | `http://localhost:8083` | Owner Console base URL |
| `--out-dir` | No | `/tmp/fusion_output` | Output directory for artifacts |
| `--month` | Yes | - | Month identifier (YYYY-MM) |
| `--fuzzy-threshold` | No | `0.60` | Fuzzy match threshold (0.0-1.0) |
| `--max-date-drift-days` | No | `3` | Max days for invoice date matching |
| `--dry-run` | No | `True` | Dry-run mode (default) |
| `--apply` | No | `False` | Apply SQL to database (requires approval) |

## Input Files

### Contractor Workbook Structure

Expected Excel format:
- **Multiple sheets**: One per contractor (HME, PG, TSMC ADMIN, etc.)
- **Row 4**: "PRODUCT" label and date headers (2025-04-01, 2025-04-02, ...)
- **Row 5+**: Products with daily quantities

Example:
```
| PRODUCT         | 2025-04-01 | 2025-04-02 | 2025-04-03 | ...
|-----------------|------------|------------|------------|-----|
| Coffee (Box)    |            |            | 1.0        | ...
| Coffee Cups     | 6.0        |            | 4.0        | ...
| Hand Towels     |            | 1.0        |            | ...
```

### Accounting Report Structure

Standard GFS accounting format with 24 cost-code columns. The tool will:
- Preserve all existing columns
- Append **📎 Document Link** column with PDF hyperlinks
- Append **🔗 Console Paste TSV** column (hidden helper)

## Output Artifacts

### 1. SQL Files (Owner Approval Required)

#### `item_alias_map.sql`
- Idempotent `INSERT OR IGNORE` statements
- Fuzzy matched aliases (≥60% confidence)
- Placeholder rows for unmatched items

#### `ai_feedback_comments.sql`
- Learning proposals with parsed intent
- Contractor coffee baseline
- Paper disposables correlation
- Chemical usage patterns

#### `ai_learning_insights.sql`
- Pattern type, category, title, description
- Confidence scores and evidence counts
- Date ranges and observation periods

### 2. Updated Accounting Report

**`GFS_Accounting_Report_YYYY-MM-DD_UPDATED.xlsx`**

New columns added:
- **📎 Document Link**: `=HYPERLINK("http://localhost:8083/api/owner/docs/view/INVOICE","Open PDF")`
- **🔗 Console Paste TSV**: Hidden column with full row data + URLs

### 3. Contractor Usage CSV

**`contractor_usage_profile_YYYY-MM.csv`**

Columns:
- `contractor`, `date`, `product`, `quantity`, `unit`, `notes`
- `matched_sku`, `matched_invoice`, `pdf_url`, `status`

### 4. Markdown Reports

#### `AUDIT_SUMMARY_CONTRACTOR_YYYY-MM.md`
Comprehensive audit with:
- Data ingestion statistics
- SKU mapping results (exact, fuzzy, unmatched)
- Invoice matching results
- Learning proposals summary
- Top findings
- Open questions for owner

#### `Validation_YYYY-MM.md`
Validation queries and rollback plan:
- File checksums
- Pre-application validation queries
- Expected impacts
- Rollback SQL

#### `OWNER_QA_YYYY-MM.md`
10 precise questions requiring owner approval:
1. Approve fuzzy alias mappings?
2. Assign SKUs to unmatched items?
3. Confirm coffee baseline?
4. Link paper to coffee demand?
5. Implement dorm-level tracking?
6. Set auto-approve threshold?
7. Confirm lead-time policy?
8. Confirm coverage window?
9. Handle credits/replacements?
10. Apply learnings to production?

## Workflow

### Step 1: Dry-Run (Default)

```bash
python3 neuro_fusion_ingest.py \
  --contractor "/path/to/april.xlsx" \
  --accounting "/path/to/accounting.xlsx" \
  --month "2025-04"
```

Output:
```
================================================================================
🧠 NeuroPilot Fusion Ingest v1.0.0
   Contractor ↔ Accounting ↔ PDF Integration
================================================================================

Mode: DRY-RUN (No DB writes)
Month: 2025-04

...

📊 Summary:
   • Contractor lines: 160
   • Unique products: 38
   • SKU matches: 2 exact, 8 fuzzy, 28 unmatched
   • Coverage: 26.3%
   • Invoice matches: 49
   • Learning proposals: 2 feedback, 3 insights

⚠️  DRY-RUN MODE - No database writes performed
```

### Step 2: Review Artifacts

```bash
# Review audit summary
cat /tmp/fusion_output/AUDIT_SUMMARY_CONTRACTOR_2025-04.md

# Review proposed aliases
cat /tmp/fusion_output/item_alias_map.sql

# Review owner Q&A
cat /tmp/fusion_output/OWNER_QA_2025-04.md
```

### Step 3: Answer Owner Q&A

Edit `/tmp/fusion_output/OWNER_QA_2025-04.md` and fill in answers:
- YES/NO for approval questions
- SKU codes for manual mappings
- Numeric values for thresholds

### Step 4: Apply to Database

After owner approval:

```bash
python3 neuro_fusion_ingest.py \
  --contractor "/path/to/april.xlsx" \
  --accounting "/path/to/accounting.xlsx" \
  --month "2025-04" \
  --apply
```

Or manually apply SQL files:

```bash
sqlite3 db/inventory_enterprise.db < /tmp/fusion_output/item_alias_map.sql
sqlite3 db/inventory_enterprise.db < /tmp/fusion_output/ai_feedback_comments.sql
sqlite3 db/inventory_enterprise.db < /tmp/fusion_output/ai_learning_insights.sql
```

### Step 5: Verify

```bash
sqlite3 db/inventory_enterprise.db "
SELECT COUNT(*) as new_aliases
FROM item_alias_map
WHERE created_at >= datetime('now', '-5 minutes');
"
```

## Matching Logic

### SKU Matching

1. **Exact Match**: Normalize product name → lookup in `item_alias_map`
2. **Fuzzy Match**: Use `difflib.SequenceMatcher` with threshold (default: 0.60)
   - Compare against `item_master.item_name`
   - Return top 3 candidates with confidence scores
3. **Unmatched**: Flag for manual SKU assignment

### Invoice Matching

1. **Date Proximity**: ±3 days window (configurable)
2. **Vendor Filter**: Default "GFS"
3. **Text Overlap**: Fuzzy ratio between product name and invoice filename/metadata
4. **Combined Score**: `(date_score * 0.4) + (text_score * 0.6)`
5. **Top K**: Return top 3 candidates

### PDF URL Generation

Format: `http://localhost:8083/api/owner/docs/view/<INVOICE_NUMBER>`

Embedded in Excel as: `=HYPERLINK("url","Open PDF")`

## Safety & Idempotency

### Idempotent Operations

All SQL uses safe operations:
- `INSERT OR IGNORE` for aliases (won't overwrite existing)
- `INSERT OR REPLACE` for learning insights (update if exists)
- No `DELETE` or `UPDATE` statements

### Dry-Run by Default

- Default mode: `--dry-run` (implicit)
- Only emits SQL files, no database writes
- Must explicitly use `--apply` to write to DB

### Rollback Plan

Provided in `Validation_YYYY-MM.md`:

```sql
-- Remove recent learnings
DELETE FROM item_alias_map
WHERE created_at >= datetime('now', '-10 minutes');

DELETE FROM ai_feedback_comments
WHERE comment_source LIKE 'contractor_fusion%';

DELETE FROM ai_learning_insights
WHERE status = 'proposed'
  AND first_observed >= '2025-04-01';
```

## Configuration Constants

Located at top of script for easy tuning:

```python
FUZZY_THRESHOLD_DEFAULT = 0.60
MAX_DATE_DRIFT_DAYS = 3
TOP_INVOICE_CANDIDATES = 3
CONFIDENCE_AUTO_APPROVE = 0.90
SOURCE_TAG = "contractor_fusion"
```

## Troubleshooting

### Issue: "No contractor request lines loaded"

**Cause**: Excel structure doesn't match expected format

**Solution**:
1. Check that dates are in row 4 (index 4)
2. Check that products start in row 5 (index 5)
3. Verify column 0 contains product names

### Issue: "No such table: item_alias_map"

**Cause**: Database schema not initialized

**Solution**:
```bash
# Check if migration ran
sqlite3 db/inventory_enterprise.db ".tables"

# Should see: item_alias_map, ai_feedback_comments, ai_learning_insights
```

### Issue: "Fuzzy matches confidence too low"

**Cause**: Product names don't closely match item master

**Solution**:
1. Lower threshold: `--fuzzy-threshold 0.50`
2. Add exact aliases manually to `item_alias_map` table
3. Review unmatched items in `item_alias_map.sql` and assign SKUs

### Issue: "No invoices matched"

**Cause**: Date range doesn't overlap or invoice table empty

**Solution**:
1. Check `documents` table has PDFs: `SELECT COUNT(*) FROM documents WHERE mime_type='application/pdf';`
2. Increase date window: `--max-date-drift-days 7`
3. Verify invoice dates in database match contractor request dates

## Database Schema Dependencies

### Required Tables

- `item_alias_map`: Stores product → SKU mappings
- `ai_feedback_comments`: Stores learning proposals
- `ai_learning_insights`: Stores pattern detections
- `item_master`: Item catalog for fuzzy matching
- `documents`: PDF invoices for URL linking

### Expected Columns

**item_alias_map**:
- `alias_name` (TEXT)
- `item_code` (TEXT)
- `category` (TEXT, nullable)
- `conversion_factor` (REAL, default 1.0)
- `conversion_unit` (TEXT, default 'ea')
- `created_at` (TIMESTAMP, auto)

**ai_feedback_comments**:
- `comment_text` (TEXT)
- `parsed_intent` (TEXT)
- `parsed_item_code` (TEXT, nullable)
- `parsed_value` (REAL)
- `parsed_unit` (TEXT)
- `applied` (INTEGER, 0 or 1)
- `comment_source` (TEXT)
- `created_at` (TIMESTAMP)

**ai_learning_insights**:
- `pattern_type` (TEXT)
- `category` (TEXT)
- `title` (TEXT)
- `description` (TEXT)
- `confidence` (REAL, 0.0-1.0)
- `evidence_count` (INTEGER)
- `first_observed` (DATE)
- `last_confirmed` (DATE)
- `status` (TEXT: proposed, confirmed, rejected)
- `created_at` (TIMESTAMP)

## Performance

- **Processing Speed**: ~1-5k rows without lag
- **Memory Usage**: Minimal (pandas DataFrame caching)
- **Database**: SQLite, localhost only
- **Network**: No internet calls, localhost:8083 only

## Version History

- **v1.0.0** (2025-10-10): Initial release
  - Contractor workbook parsing
  - Accounting report augmentation
  - SKU fuzzy matching
  - Invoice PDF linking
  - Learning extraction
  - Owner Q&A generation
  - Audit and validation reports

## Future Enhancements

- [ ] Support for multiple vendor formats (beyond GFS)
- [ ] Direct integration with Owner Console API
- [ ] Real-time invoice OCR parsing
- [ ] Auto-approval for high-confidence matches (≥90%)
- [ ] Historical trend analysis across months
- [ ] Dorm-level chemical attribution from separate sheets
- [ ] Credit/replacement detection from negative quantities
- [ ] Multi-language support (FR/EN)

## Support

For issues, questions, or feature requests:
1. Review this README
2. Check troubleshooting section
3. Inspect audit reports in `/tmp/fusion_output/`
4. Contact NeuroPilot Data Steward

## License

Enterprise Internal Use Only - NeuroPilot AI System

---

**End of README**

Generated: 2025-10-10
Version: 1.0.0
