# Finance Item Bank & Enforcement System

**Version:** 16.2.0
**Author:** NeuroPilot AI Development Team
**Date:** 2025-10-18

---

## Table of Contents

1. [Overview](#overview)
2. [Key Features](#key-features)
3. [Architecture](#architecture)
4. [Finance Code Categories](#finance-code-categories)
5. [Item Bank Management](#item-bank-management)
6. [Mapping Rules & Precedence](#mapping-rules--precedence)
7. [Invoice Import & Validation](#invoice-import--validation)
8. [Period Operations](#period-operations)
9. [API Reference](#api-reference)
10. [Frontend Usage](#frontend-usage)
11. [CSV Import/Export](#csv-importexport)
12. [Prometheus Metrics](#prometheus-metrics)
13. [Verification & Testing](#verification--testing)
14. [Troubleshooting](#troubleshooting)
15. [Examples](#examples)

---

## Overview

The Finance Item Bank & Enforcement System (v16.2.0) provides **authoritative finance category mapping** with **integer-cent precision** for all invoice line items. It ensures that every item is correctly categorized using a **four-tier mapping precedence** system:

1. **Item Bank** (1.00 confidence) - Authoritative SKU catalog
2. **Mapping Rules** (0.80-1.00 confidence) - Pattern-based rules
3. **AI Classifier** (0.50+ confidence) - Machine learning fallback
4. **Fallback to OTHER** (0.30 confidence) - Last resort

The system guarantees:
- ✅ **100% finance code coverage** - No unmapped items
- ✅ **Integer-cent arithmetic** - No floating-point errors
- ✅ **Complete audit trail** - Every mapping decision recorded
- ✅ **Invoice balance validation** - ±2¢ tolerance checking
- ✅ **Period-locked totals** - Immutable financial snapshots

---

## Key Features

### 1. Authoritative Item Bank
- **Centralized SKU Catalog**: Single source of truth for all items
- **12 Finance Categories**: Industry-standard categorization
- **Tax Configuration**: Per-item GST/QST flags
- **CSV Import/Export**: Bulk operations support
- **Soft Deletes**: Items are retired, never deleted

### 2. Hard Category Enforcement
- **No Gaps**: Every line gets a finance code (fallback to OTHER if needed)
- **Confidence Tracking**: Know which mappings need review
- **Needs Mapping Queue**: UI for reviewing low-confidence items
- **Manual Override**: Finance users can manually assign codes

### 3. Integer-Cent Line Integrity
- **No Floats**: All money values stored as integer cents
- **Basis Point Tax Rates**: GST 500bp (5.00%), QST 9975bp (9.975%)
- **Per-Line Tax Calculation**: Precise rounding on every line
- **Balance Validation**: ±2¢ tolerance for subtotal, GST, QST, total

### 4. Mapping Rules Engine
- **4 Match Types**: SKU, VENDOR_SKU, REGEX, KEYWORD
- **Priority & Confidence**: Control matching order
- **Active/Inactive**: Enable/disable rules without deletion
- **Audit Trail**: Track when and why rules were created

### 5. Period Verification & Locking
- **Period Summaries**: Generate totals by finance code
- **OWNER-Only Locking**: Verify and lock period totals
- **Immutable Snapshots**: Locked periods cannot be changed
- **Historical Reporting**: Query verified totals by period

---

## Architecture

### Database Schema

```sql
-- Core tables
item_bank                        -- Authoritative SKU catalog
finance_mapping_rules            -- Pattern-based mapping rules
mapping_audit                    -- Full audit trail
invoice_validation_results       -- Invoice balance validation
finance_period_verified_totals   -- Locked period snapshots

-- Views
v_needs_mapping                  -- Low-confidence mappings (<0.80)
v_item_bank_active               -- Active items only
v_finance_code_summary           -- Aggregates by finance code
```

### Services Layer

```
ItemBankService          -- CRUD for item bank
FinanceMappingService    -- Mapping logic & rules
InvoiceImportAdapter     -- PDF parsing & validation
FinanceEnforcementService -- High-level orchestration
```

### Routes

```
/api/finance/item-bank/*          -- Item bank management
/api/finance/enforcement/*         -- Enforcement operations
```

---

## Finance Code Categories

The system uses **12 standardized finance categories**:

| Code        | Description                      | Examples                                  |
|-------------|----------------------------------|-------------------------------------------|
| `BAKE`      | Bakery items                     | Bread, pastries, flour, yeast             |
| `BEV+ECO`   | Beverages & eco-products         | Coffee, juice, compostables               |
| `MILK`      | Dairy products                   | Milk, cheese, butter, yogurt              |
| `GROC+MISC` | Groceries & miscellaneous        | Dry goods, spices, condiments             |
| `MEAT`      | Meat & seafood                   | Beef, chicken, fish, deli                 |
| `PROD`      | Produce                          | Fruits, vegetables, herbs                 |
| `CLEAN`     | Cleaning supplies                | Detergent, sanitizer, chemicals           |
| `PAPER`     | Paper goods                      | Napkins, bags, cups, straws               |
| `FREIGHT`   | Freight & delivery charges       | Shipping fees, fuel surcharges            |
| `LINEN`     | Linens & uniforms                | Towels, aprons, uniforms                  |
| `PROPANE`   | Propane & gas                    | Propane refills, gas charges              |
| `OTHER`     | Uncategorized items              | Fallback for unknown items                |

### Finance Code Validation

All finance codes are **validated at the database level** using CHECK constraints. Invalid codes are rejected with a clear error message.

---

## Item Bank Management

### Adding Items

#### Via API

```bash
curl -X POST http://localhost:8083/api/finance/item-bank \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "gfs_item_no": "12345",
    "description": "Organic Whole Milk 1L",
    "pack_size": "12/1L",
    "uom": "CS",
    "finance_code": "MILK",
    "taxable_gst": 1,
    "taxable_qst": 1,
    "vendor_sku": "ABC-12345",
    "upc": "012345678901"
  }'
```

#### Via CSV Upload

1. Navigate to **🏦 Item Bank** tab in Owner Super Console
2. Click **📤 Upload CSV**
3. Drag & drop or select CSV file
4. Review import results

### CSV Format

```csv
gfs_item_no,description,pack_size,uom,finance_code,taxable_gst,taxable_qst,vendor_sku,upc
12345,Organic Whole Milk 1L,12/1L,CS,MILK,1,1,ABC-12345,012345678901
67890,All-Purpose Flour 10kg,4/10KG,CS,BAKE,1,1,ABC-67890,012345678902
```

**Required Fields:**
- `gfs_item_no` - Unique GFS item number (primary key)
- `description` - Item description
- `uom` - Unit of measure (CS, EA, LB, etc.)
- `finance_code` - Must be one of the 12 valid codes

**Optional Fields:**
- `pack_size` - Pack configuration (e.g., "12/1L")
- `taxable_gst` - GST taxable flag (0 or 1, default 1)
- `taxable_qst` - QST taxable flag (0 or 1, default 1)
- `vendor_sku` - Vendor's SKU
- `upc` - Universal Product Code

### Updating Items

```bash
curl -X PUT http://localhost:8083/api/finance/item-bank/12345 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "finance_code": "GROC+MISC",
    "description": "Updated Description"
  }'
```

### Retiring Items (Soft Delete)

```bash
curl -X DELETE http://localhost:8083/api/finance/item-bank/12345 \
  -H "Authorization: Bearer $TOKEN"
```

Items are **soft deleted** (status set to 'RETIRED'). They remain in the database for historical reporting.

### Reactivating Retired Items

```bash
curl -X POST http://localhost:8083/api/finance/item-bank/12345/activate \
  -H "Authorization: Bearer $TOKEN"
```

---

## Mapping Rules & Precedence

### Mapping Precedence Logic

When an invoice line is processed, the system applies mappings in this order:

```
1. Item Bank Lookup (confidence: 1.00)
   └─> If gfs_item_no exists in item_bank → use item_bank.finance_code

2. Mapping Rules (confidence: varies)
   └─> Check rules in priority order (highest first)
       └─> Match types: SKU → VENDOR_SKU → REGEX → KEYWORD

3. AI Classifier (confidence: 0.50+)
   └─> If AI confidence >= 0.50 → use AI prediction

4. Fallback to OTHER (confidence: 0.30)
   └─> Last resort: assign "OTHER" category
```

### Creating Mapping Rules

#### SKU Match

```bash
curl -X POST http://localhost:8083/api/finance/enforcement/rules \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "match_type": "SKU",
    "match_pattern": "12345",
    "finance_code": "MILK",
    "confidence": 0.95,
    "source": "MANUAL",
    "priority": 100
  }'
```

#### KEYWORD Match

```bash
curl -X POST http://localhost:8083/api/finance/enforcement/rules \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "match_type": "KEYWORD",
    "match_pattern": "organic milk",
    "finance_code": "MILK",
    "confidence": 0.85,
    "source": "MANUAL",
    "priority": 80
  }'
```

#### REGEX Match

```bash
curl -X POST http://localhost:8083/api/finance/enforcement/rules \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "match_type": "REGEX",
    "match_pattern": "^FLOUR.*10KG$",
    "finance_code": "BAKE",
    "confidence": 0.90,
    "source": "MANUAL",
    "priority": 90
  }'
```

### Match Type Details

| Match Type    | Description                                    | Use Case                                |
|---------------|------------------------------------------------|-----------------------------------------|
| `SKU`         | Exact match on `gfs_item_no`                   | Specific GFS items                      |
| `VENDOR_SKU`  | Exact match on `vendor_sku`                    | Vendor-specific items                   |
| `REGEX`       | Regular expression match on `description`      | Pattern-based matching                  |
| `KEYWORD`     | Case-insensitive substring match on description | Simple text matching                    |

### Rule Priority

- **Higher priority = checked first**
- Typical values: 1-1000
- Recommended: Item Bank (priority implicit 1000+), custom rules 50-200

---

## Invoice Import & Validation

### Import Invoice with Enforcement

```bash
curl -X POST http://localhost:8083/api/finance/enforcement/import \
  -H "Authorization: Bearer $TOKEN" \
  -F "invoice_pdf=@/path/to/invoice.pdf"
```

### Import Process

1. **PDF Parsing**: Extract line items, totals, metadata
2. **Finance Code Mapping**: Apply precedence logic to each line
3. **Tax Calculation**: Calculate GST/QST per line using basis points
4. **Balance Validation**: Check ±2¢ tolerance on totals
5. **Audit Trail**: Record all mapping decisions
6. **Needs Mapping Queue**: Flag low-confidence lines (<0.80)

### Validation Results

```json
{
  "success": true,
  "invoice_id": 12345,
  "validation": {
    "balance_status": "BALANCED",
    "subtotal_delta_cents": 0,
    "gst_delta_cents": 1,
    "qst_delta_cents": -1,
    "total_delta_cents": 0,
    "tolerance_cents": 2,
    "issues": []
  },
  "low_confidence_lines": 3,
  "mapping_summary": {
    "BANK": 45,
    "RULE": 12,
    "AI": 8,
    "FALLBACK": 2
  }
}
```

### Balance Status

- **BALANCED**: All deltas within ±2¢ tolerance ✅
- **SUBTOTAL_MISMATCH**: Subtotal off by >2¢ ⚠️
- **GST_MISMATCH**: GST off by >2¢ ⚠️
- **QST_MISMATCH**: QST off by >2¢ ⚠️
- **TOTAL_MISMATCH**: Total off by >2¢ ⚠️

### Integer-Cent Tax Calculation

```javascript
// GST: 5.00% (500 basis points)
gst_cents = Math.floor((amount_cents * 500 + 5000) / 10000)

// QST: 9.975% (9975 basis points)
qst_cents = Math.floor((amount_cents * 9975 + 5000) / 10000)
```

The `+5000` provides rounding to the nearest cent.

---

## Period Operations

### Generate Period Summary

```bash
curl -X POST http://localhost:8083/api/finance/enforcement/period/summary \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "period": "2025-10",
    "start_date": "2025-10-01",
    "end_date": "2025-10-31"
  }'
```

**Response:**

```json
{
  "success": true,
  "period": "2025-10",
  "summary": {
    "total_cents": 20015426,
    "total_lines": 1234,
    "gst_cents": 95000,
    "qst_cents": 189000,
    "low_confidence_lines": 23,
    "by_finance_code": {
      "BAKE": { "total_cents": 5000000, "line_count": 350 },
      "MILK": { "total_cents": 4500000, "line_count": 280 },
      "MEAT": { "total_cents": 3200000, "line_count": 195 },
      ...
    }
  }
}
```

### Verify and Lock Period (OWNER-only)

```bash
curl -X POST http://localhost:8083/api/finance/enforcement/period/verify \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "period": "2025-10",
    "start_date": "2025-10-01",
    "end_date": "2025-10-31"
  }'
```

**Response:**

```json
{
  "success": true,
  "period": "2025-10",
  "locked": true,
  "verified_by": "admin",
  "verified_at": "2025-10-31T23:59:59Z",
  "total_cents": 20015426
}
```

**⚠️ Warning:** Once a period is locked, the totals are **immutable**. This is for financial compliance and audit purposes.

### Get Verified Period Totals

```bash
curl -X GET http://localhost:8083/api/finance/enforcement/period/verified/2025-10 \
  -H "Authorization: Bearer $TOKEN"
```

### List All Verified Periods

```bash
curl -X GET http://localhost:8083/api/finance/enforcement/period/list \
  -H "Authorization: Bearer $TOKEN"
```

---

## API Reference

### Item Bank Routes

| Method | Endpoint                                    | Description                   | RBAC              |
|--------|---------------------------------------------|-------------------------------|-------------------|
| GET    | `/api/finance/item-bank`                    | Search items                  | OWNER, FINANCE, OPS |
| GET    | `/api/finance/item-bank/:id`                | Get single item               | OWNER, FINANCE, OPS |
| POST   | `/api/finance/item-bank`                    | Create item                   | OWNER, FINANCE    |
| PUT    | `/api/finance/item-bank/:id`                | Update item                   | OWNER, FINANCE    |
| DELETE | `/api/finance/item-bank/:id`                | Retire item                   | OWNER, FINANCE    |
| POST   | `/api/finance/item-bank/:id/activate`       | Activate retired item         | OWNER, FINANCE    |
| POST   | `/api/finance/item-bank/import-csv`         | Import CSV                    | OWNER, FINANCE    |
| GET    | `/api/finance/item-bank/export-csv`         | Export CSV                    | OWNER, FINANCE, OPS |
| GET    | `/api/finance/item-bank/statistics`         | Get statistics                | OWNER, FINANCE, OPS |
| POST   | `/api/finance/item-bank/bulk-update`        | Bulk update finance codes     | OWNER, FINANCE    |

### Enforcement Routes

| Method | Endpoint                                           | Description                     | RBAC              |
|--------|----------------------------------------------------|---------------------------------|-------------------|
| GET    | `/api/finance/enforcement/rules`                   | Search mapping rules            | OWNER, FINANCE, OPS |
| POST   | `/api/finance/enforcement/rules`                   | Create mapping rule             | OWNER, FINANCE    |
| PUT    | `/api/finance/enforcement/rules/:id`               | Update mapping rule             | OWNER, FINANCE    |
| DELETE | `/api/finance/enforcement/rules/:id`               | Deactivate mapping rule         | OWNER, FINANCE    |
| POST   | `/api/finance/enforcement/import`                  | Import invoice with enforcement | OWNER, FINANCE    |
| GET    | `/api/finance/enforcement/validation/:id`          | Get validation result           | OWNER, FINANCE, OPS |
| GET    | `/api/finance/enforcement/needs-attention`         | Get invoices needing attention  | OWNER, FINANCE, OPS |
| GET    | `/api/finance/enforcement/needs-mapping`           | Get needs mapping queue         | OWNER, FINANCE, OPS |
| POST   | `/api/finance/enforcement/manual-assign`           | Manually assign finance code    | OWNER, FINANCE    |
| POST   | `/api/finance/enforcement/period/summary`          | Generate period summary         | OWNER, FINANCE    |
| POST   | `/api/finance/enforcement/period/verify`           | Verify and lock period          | **OWNER only**    |
| GET    | `/api/finance/enforcement/period/verified/:period` | Get verified period totals      | OWNER, FINANCE, OPS |
| GET    | `/api/finance/enforcement/period/list`             | List all verified periods       | OWNER, FINANCE, OPS |
| POST   | `/api/finance/enforcement/bulk/remap`              | Bulk remap invoices             | **OWNER only**    |
| GET    | `/api/finance/enforcement/dashboard`               | Get dashboard statistics        | OWNER, FINANCE, OPS |
| GET    | `/api/finance/enforcement/top-categories`          | Get top finance categories      | OWNER, FINANCE, OPS |
| GET    | `/api/finance/enforcement/report`                  | Generate finance report         | OWNER, FINANCE    |

---

## Frontend Usage

### Accessing the Item Bank Tab

1. Navigate to **Owner Super Console** (`/owner-super-console.html`)
2. Click the **🏦 Item Bank** tab in the navigation bar
3. The tab loads automatically with:
   - **Top Finance Strip**: Sticky header showing totals per category
   - **Invoice Integrity Badge**: Current balance status
   - **Item Bank Catalog**: Searchable table of all items
   - **Needs Mapping Queue**: Low-confidence items requiring review

### CSV Upload

1. Click **📤 Upload CSV** button
2. Drag & drop CSV file or click to browse
3. System validates and imports items
4. Success message shows imported count
5. Table refreshes automatically

### Editing Items

1. Find item in table using search/filter
2. Click **✏️ Edit** button
3. Enter new finance code in prompt
4. Item updates immediately

### Retiring Items

1. Find active item in table
2. Click **🗑️ Retire** button
3. Confirm action
4. Item status changes to RETIRED

### Reviewing Needs Mapping Queue

1. Scroll to **⚠️ Needs Mapping Queue** section
2. Review items with confidence <0.80
3. Click **✅ Confirm** to accept AI suggestion
4. Click **✏️ Edit** to manually assign different code

### Revalidating Period

1. View **💰 Invoice Integrity Status** card
2. If status is not BALANCED, click **♻️ Revalidate**
3. System recalculates all invoices
4. Badge updates with new status

---

## CSV Import/Export

### Export CSV

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8083/api/finance/item-bank/export-csv?finance_code=BAKE&status=ACTIVE" \
  -o item_bank_export.csv
```

### Import CSV with Error Handling

```bash
curl -X POST http://localhost:8083/api/finance/item-bank/import-csv \
  -H "Authorization: Bearer $TOKEN" \
  -F "csv_file=@items.csv" \
  -F "upsert_mode=true"
```

**Response:**

```json
{
  "success": true,
  "imported": 145,
  "errors": [
    {
      "row": 23,
      "error": "Invalid finance code: INVALID_CODE"
    }
  ]
}
```

### Upsert Mode

- `upsert_mode=true`: Update existing items, insert new ones
- `upsert_mode=false` (default): Only insert new items, skip existing

---

## Prometheus Metrics

### Available Metrics

```
# Item Bank
item_bank_active_total          # Total active items in item bank

# Mapping Quality
finance_needs_mapping_total     # Lines needing mapping review (<0.80 confidence)
finance_ai_mapping_auto_pct     # Percentage of lines auto-mapped by AI (≥0.80)

# Invoice Integrity
invoice_imbalance_total         # Total invoices with balance issues (counter)
finance_tax_mismatch_total{tax_type}  # Tax calculation mismatches (counter)

# Period Operations
finance_period_verified_total{period}  # Verified period totals (gauge)
```

### Querying Metrics

```bash
# Get item bank size
curl http://localhost:8083/metrics | grep item_bank_active_total

# Get needs mapping count
curl http://localhost:8083/metrics | grep finance_needs_mapping_total

# Get AI auto-mapping percentage
curl http://localhost:8083/metrics | grep finance_ai_mapping_auto_pct
```

### Prometheus Alerts

```yaml
groups:
  - name: finance_enforcement
    rules:
      - alert: HighNeedsMappingCount
        expr: finance_needs_mapping_total > 100
        for: 1h
        annotations:
          summary: "High number of items need mapping review"

      - alert: LowAIAutoMapping
        expr: finance_ai_mapping_auto_pct < 0.5
        for: 24h
        annotations:
          summary: "AI auto-mapping rate below 50%"
```

---

## Verification & Testing

### Run All Verification Scripts

```bash
# Test Item Bank CRUD and CSV operations
./scripts/verify_item_bank.sh

# Test Enforcement: rules, mapping, validation
./scripts/verify_finance_enforcement.sh

# Test Period Operations: summary, verify, lock
./scripts/verify_period_summary.sh
```

### Expected Results

**Item Bank:** 15 tests covering CRUD, CSV import/export, bulk updates
**Enforcement:** 16 tests covering rules, mapping, validation
**Period Summary:** 12 tests covering period operations, totals verification

All scripts should output:
```
🎉 All tests passed!
```

---

## Troubleshooting

### Issue: CSV Import Fails with "Invalid finance code"

**Cause:** CSV contains finance code not in the 12-category enum.

**Solution:** Ensure all `finance_code` values are one of:
```
BAKE, BEV+ECO, MILK, GROC+MISC, MEAT, PROD, CLEAN, PAPER, FREIGHT, LINEN, PROPANE, OTHER
```

---

### Issue: Invoice Balance Status is "SUBTOTAL_MISMATCH"

**Cause:** PDF parsing extracted incorrect subtotal, or line amounts don't sum correctly.

**Solution:**
1. Check `invoice_validation_results` table for exact delta
2. If delta is small (e.g., 5-10¢), likely rounding issue - revalidate
3. If delta is large, investigate PDF parsing accuracy

```bash
sqlite3 inventory.db "
  SELECT subtotal_delta_cents, gst_delta_cents, qst_delta_cents, total_delta_cents
  FROM invoice_validation_results
  WHERE invoice_id = 12345
"
```

---

### Issue: Too Many Items in "Needs Mapping Queue"

**Cause:** Many items lack Item Bank entries or matching rules.

**Solution:**
1. Export items with low confidence:
   ```bash
   curl -H "Authorization: Bearer $TOKEN" \
     "http://localhost:8083/api/finance/enforcement/needs-mapping?limit=1000" > needs_mapping.json
   ```
2. Analyze common patterns (vendor SKUs, keywords)
3. Create mapping rules or import items to Item Bank
4. Bulk remap invoices:
   ```bash
   curl -X POST http://localhost:8083/api/finance/enforcement/bulk/remap \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"start_date": "2025-10-01", "end_date": "2025-10-31"}'
   ```

---

### Issue: Period Verify Fails with "Low confidence lines detected"

**Cause:** Period contains items with confidence <0.80.

**Solution:**
1. Review needs mapping queue
2. Manually assign or create rules for low-confidence items
3. Retry period verification

---

### Issue: "Permission Denied" on Period Verify

**Cause:** Only OWNER role can lock periods.

**Solution:** Ensure you're using an OWNER token:
```bash
cat .owner_token
```

---

## Examples

### Example 1: Onboarding New Vendor Items

**Scenario:** You've added a new vendor "Acme Foods" and need to map their items.

1. **Export their invoice lines with low confidence:**
   ```bash
   curl -H "Authorization: Bearer $TOKEN" \
     "http://localhost:8083/api/finance/enforcement/needs-mapping?limit=100" | \
     jq '.items[] | select(.vendor_sku | startswith("ACME-"))' > acme_items.json
   ```

2. **Create mapping rules for common patterns:**
   ```bash
   # Rule 1: All ACME milk products
   curl -X POST http://localhost:8083/api/finance/enforcement/rules \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "match_type": "KEYWORD",
       "match_pattern": "ACME MILK",
       "finance_code": "MILK",
       "confidence": 0.90,
       "source": "VENDOR_ACME",
       "priority": 100
     }'
   ```

3. **Add items to Item Bank:**
   ```bash
   # Create CSV from acme_items.json
   jq -r '.[] | [.gfs_item_no, .description, .pack_size, .uom, "MILK", 1, 1, .vendor_sku, .upc] | @csv' \
     acme_items.json > acme_item_bank.csv

   # Upload CSV
   curl -X POST http://localhost:8083/api/finance/item-bank/import-csv \
     -H "Authorization: Bearer $TOKEN" \
     -F "csv_file=@acme_item_bank.csv" \
     -F "upsert_mode=true"
   ```

4. **Bulk remap affected invoices:**
   ```bash
   curl -X POST http://localhost:8083/api/finance/enforcement/bulk/remap \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"start_date": "2025-10-01", "end_date": "2025-10-31"}'
   ```

---

### Example 2: Month-End Close Process

**Scenario:** Close October 2025 financials.

1. **Generate October summary:**
   ```bash
   curl -X POST http://localhost:8083/api/finance/enforcement/period/summary \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "period": "2025-10",
       "start_date": "2025-10-01",
       "end_date": "2025-10-31"
     }' | jq .
   ```

2. **Review summary for issues:**
   - Check `low_confidence_lines` count
   - Verify `balance_status` for all invoices
   - Review `by_finance_code` totals

3. **Address any needs mapping items:**
   ```bash
   curl -H "Authorization: Bearer $TOKEN" \
     "http://localhost:8083/api/finance/enforcement/needs-attention?limit=50"
   ```

4. **Verify and lock the period (OWNER-only):**
   ```bash
   curl -X POST http://localhost:8083/api/finance/enforcement/period/verify \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "period": "2025-10",
       "start_date": "2025-10-01",
       "end_date": "2025-10-31"
     }' | jq .
   ```

5. **Export locked totals for accounting:**
   ```bash
   curl -H "Authorization: Bearer $TOKEN" \
     "http://localhost:8083/api/finance/enforcement/period/verified/2025-10" | jq . > october_2025_totals.json
   ```

---

### Example 3: Bulk Update Finance Codes

**Scenario:** Vendor changed their product line; need to reclassify 50 items from GROC+MISC to BEV+ECO.

1. **Get list of affected GFS item numbers:**
   ```bash
   sqlite3 inventory.db "
     SELECT gfs_item_no
     FROM item_bank
     WHERE description LIKE '%ACME ECO%'
       AND finance_code = 'GROC+MISC'
   " | jq -R . | jq -s . > affected_items.json
   ```

2. **Bulk update:**
   ```bash
   curl -X POST http://localhost:8083/api/finance/item-bank/bulk-update \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d @- <<EOF
   {
     "gfs_item_nos": $(cat affected_items.json),
     "finance_code": "BEV+ECO"
   }
   EOF
   ```

3. **Remap historical invoices (if needed):**
   ```bash
   curl -X POST http://localhost:8083/api/finance/enforcement/bulk/remap \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "start_date": "2025-10-01",
       "end_date": "2025-10-31"
     }'
   ```

---

## Production Best Practices

### 1. Regular Item Bank Maintenance

- **Weekly:** Review needs mapping queue and create rules/add items
- **Monthly:** Export Item Bank for backup
- **Quarterly:** Audit retired items and reactivate if needed

### 2. Period Locking Discipline

- **Lock periods within 5 business days of month-end**
- **Never unlock periods** (requires database access, defeats audit purpose)
- **Archive locked period JSON** for external accounting systems

### 3. Monitoring & Alerts

- **Set up Prometheus alerts** for high needs mapping count
- **Monitor AI auto-mapping percentage** (should be >70%)
- **Track invoice imbalance rate** (should be <5%)

### 4. CSV Import Hygiene

- **Validate CSVs before import** using a test environment
- **Use upsert_mode cautiously** (may overwrite manual corrections)
- **Keep import history** (log files, backup CSVs)

### 5. RBAC Compliance

- **Limit OWNER role** to CFO or designated finance lead
- **Grant FINANCE role** to accounting staff for day-to-day operations
- **Use OPS role** for read-only dashboard access

---

## Support & Contact

For issues, questions, or feature requests related to the Finance Item Bank & Enforcement System:

- **Documentation:** This README
- **Verification Scripts:** `./scripts/verify_*.sh`
- **Code:** `backend/src/finance/` and `backend/routes/finance-*.js`

---

## Changelog

See [CHANGELOG.md](../CHANGELOG.md) for version history and breaking changes.

---

**End of Finance Item Bank & Enforcement System Documentation v16.2.0**
