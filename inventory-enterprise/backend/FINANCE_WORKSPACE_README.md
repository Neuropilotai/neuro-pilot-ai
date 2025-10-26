# Finance Workspace v15.5.1 - User Guide

## Overview

The Finance Workspace provides comprehensive financial analytics, self-serve reporting, and AI-powered insights for invoice reconciliation and spend analysis. This feature integrates seamlessly with the AI Ops Health system and provides role-gated access to financial data.

### Key Features

- **Financial Data Import**: Import and process invoice PDFs with automatic categorization
- **Multi-Format Exports**: Generate CSV, GL CSV, and bilingual PDF reports
- **AI Finance Copilot**: Natural language SQL queries for financial insights
- **Data Quality Monitoring**: Real-time validation and accuracy tracking
- **Ops Health Integration**: Financial accuracy scores in AI Ops dashboard
- **Prometheus Metrics**: Track imports, exports, and accuracy over time
- **Role-Based Access Control (RBAC)**: Four-tier permission model with granular access controls

---

## Roles & Capabilities

The Finance Workspace implements a four-tier role-based access control (RBAC) model to ensure proper separation of duties and financial data security.

### Role Hierarchy

| Role | Access Level | Primary Use Case |
|------|--------------|------------------|
| **OWNER** | Full administrative access | System administration, break-glass operations, backup/restore |
| **FINANCE** | Financial operations | Invoice management, exports, approvals, financial reporting |
| **OPS** | Operations management | Inventory counts, feedback, proposals, read-only financial summaries |
| **READONLY** | View-only access | Dashboard viewing, high-level metrics, no data modification |

---

### OWNER Role

**Description**: Full system administrator with unrestricted access to all features and operations.

**Capabilities**:
- ✅ All financial data imports (POST `/api/owner/financials/import`)
- ✅ All export operations (CSV, GL CSV, PDF)
- ✅ Forecast approvals and rejections
- ✅ Backup and restore operations
- ✅ System orchestration (start/stop services)
- ✅ User management and role assignments
- ✅ Break-glass access to override dual-control rules
- ✅ Access to raw invoice PDFs and sensitive documents
- ✅ Prometheus metrics and system health monitoring

**UI Access**:
- All tabs visible: Dashboard, Inventory, Locations, PDFs, Count, Playground, AI, Forecast, Menu, Financials, Reports, Settings
- All buttons enabled: Import, Export (CSV/PDF/GL), Approve, Reject, Backup, Restore

**Notes**:
- OWNER role should be assigned sparingly to trusted administrators only
- Break-glass approvals log audit trail for compliance
- Two-factor authentication recommended for OWNER accounts

---

### FINANCE Role

**Description**: Financial operations specialist with access to invoice management, exports, and approvals.

**Capabilities**:
- ✅ Financial data imports (POST `/api/owner/financials/import`)
- ✅ Export CSV reports (GET `/api/owner/financials/export/csv`)
- ✅ Export GL CSV for accounting systems (GET `/api/owner/financials/export/gl`)
- ✅ Export bilingual PDF reports (GET `/api/owner/financials/export/pdf`)
- ✅ Category mapping and tolerance review
- ✅ Forecast approvals (POST `/api/owner/forecast/approve`) with **dual-control enforcement**
- ✅ Forecast rejections (POST `/api/owner/forecast/reject`) with **dual-control enforcement**
- ✅ View financial summary dashboards
- ✅ Access Data Quality Monitor
- ✅ Use AI Finance Copilot for queries
- ❌ Cannot approve forecasts they created (dual-control rule)
- ❌ Cannot perform backup/restore operations
- ❌ Cannot access system orchestration

**UI Access**:
- Visible tabs: Dashboard, Inventory, Locations, PDFs, Count, AI, **Forecast**, Menu, **Financials**, Reports
- Export buttons enabled: CSV, GL CSV, PDF
- Approval buttons enabled: Approve Forecast, Reject Forecast (with dual-control validation)

**Rate Limiting**:
- Export operations limited to **5 requests per minute per user** (configurable via `EXPORT_RATE_LIMIT_PER_MIN`)
- Prevents system overload and ensures fair resource allocation

**Dual-Control Enforcement**:
- FINANCE users cannot approve forecasts they created
- System validates `created_by ≠ req.user.email` before allowing approval
- Error message: "Dual-control violation: You cannot approve a forecast you created"

**Notes**:
- FINANCE role is ideal for accounting team members who need to export data for GL integration
- Dual-control ensures no single user can both create and approve high-value forecasts
- Rate limiting protects backend from excessive export requests

---

### OPS Role

**Description**: Operations manager with access to inventory counts, proposals, feedback, but no financial approvals.

**Capabilities**:
- ✅ Submit inventory counts (POST `/api/owner/count`)
- ✅ Provide AI feedback (POST `/api/owner/ai/feedback`)
- ✅ Create count proposals
- ✅ View forecast summaries (GET `/api/owner/forecast/daily`)
- ✅ View financial summaries (read-only, no exports)
- ✅ Access Dashboard, AI Console, Forecast tab
- ❌ Cannot import financial data
- ❌ Cannot export CSV/PDF/GL reports
- ❌ Cannot approve or reject forecasts
- ❌ Cannot access raw invoice PDFs
- ❌ Cannot perform backup/restore operations

**UI Access**:
- Visible tabs: Dashboard, Inventory, Locations, PDFs, Count, AI, **Forecast**
- Hidden tabs: **Financials** (entire tab hidden)
- Export buttons disabled: CSV, GL CSV, PDF (grayed out with tooltip "Requires FINANCE or OWNER role")
- Approval buttons disabled: Approve, Reject (grayed out with tooltip "Requires FINANCE or OWNER role")

**Notes**:
- OPS role is ideal for floor managers, kitchen supervisors, and operations staff
- Can view forecast recommendations but cannot approve them (separation of duties)
- Can provide feedback to improve AI accuracy but cannot modify financial data

---

### READONLY Role

**Description**: View-only observer with access to dashboards and high-level summaries only.

**Capabilities**:
- ✅ View Dashboard (GET `/api/owner/dashboard`)
- ✅ View high-level financial summaries (read-only)
- ✅ View AI Ops Health metrics
- ✅ View system status and uptime
- ❌ Cannot submit counts or feedback
- ❌ Cannot import or export data
- ❌ Cannot approve or reject forecasts
- ❌ Cannot access Financials tab
- ❌ Cannot access Forecast tab
- ❌ Cannot perform any write operations

**UI Access**:
- Visible tabs: Dashboard only
- Hidden tabs: **Financials**, **Forecast** (entire tabs hidden)
- All action buttons disabled or hidden

**Notes**:
- READONLY role is ideal for executives, auditors, or stakeholders who need visibility without modification rights
- Suitable for compliance officers reviewing system health without operational access
- Can be used for demo accounts or trial users

---

### Shadow Mode Feature Flag

**Description**: When `FORECAST_SHADOW_MODE=true`, all forecast recommendations require explicit approval before being applied to the system.

**Impact on Roles**:
- **FINANCE/OWNER**: See "Shadow Mode (no auto-apply)" badge in header
- Forecasts are generated but not automatically applied to inventory orders
- Approval workflow becomes mandatory (no auto-accept)
- Provides safety net during AI training and validation phases

**Configuration**:
```bash
# In .env file
FORECAST_SHADOW_MODE=true  # Recommendations require approval (production default)
FORECAST_SHADOW_MODE=false # Auto-apply forecasts (only after full validation)
```

**Recommended Setting**:
- **Production**: `FORECAST_SHADOW_MODE=true` (safety first)
- **Development**: `FORECAST_SHADOW_MODE=false` (for testing auto-apply)

---

### Multi-Tenant Isolation

**Description**: All database queries are automatically scoped by `tenant_id` to ensure data isolation between organizations.

**Enforcement**:
- Middleware automatically injects `tenant_id` filter on all SELECT, UPDATE, DELETE queries
- Users can only access data from their assigned tenant
- Cross-tenant queries are blocked at the database level

**Benefits**:
- Supports multi-organization deployments (e.g., multiple restaurant chains)
- Prevents accidental data leakage between tenants
- Simplifies SaaS deployment model

---

### SSO Hardening

**Description**: Single Sign-On (SSO) login requires that users have at least one role assigned in the `user_roles` table.

**Enforcement**:
- Google SSO: Checks `userRoles.length === 0` → LOGIN DENIED
- Microsoft SSO: Checks `userRoles.length === 0` → LOGIN DENIED
- Error message: "Access denied: No role assigned. Please contact your administrator to request access."

**Audit Trail**:
- Denied logins logged to `ai_audit_log` table
- Includes timestamp, email, provider, and denial reason
- Enables compliance reporting and security monitoring

**Configuration**:
```javascript
// backend/security/sso_google.js
// backend/security/sso_microsoft.js
// No configuration needed - hardened at code level
```

---

### Metrics Sanitization (PII Compliance)

**Description**: Prometheus metrics labels are sanitized to remove Personally Identifiable Information (PII).

**Allowed Labels**:
- `tenant` (tenant_id)
- `role` (user role: READONLY, OPS, FINANCE, OWNER)
- `env` (environment: production, staging, development)

**Blocked Labels** (PII):
- ❌ `email` (user email addresses)
- ❌ `item_code` (specific inventory item codes)
- ❌ `entity_id` (invoice IDs, user IDs)
- ❌ `invoice_number` (invoice identifiers)

**Compliance**:
- GDPR-compliant: No personal data in metrics
- SOC 2 Type II: Metrics do not expose sensitive business data
- OWASP best practice: Observability without leaking secrets

**Example Metric**:
```prometheus
# GOOD: Sanitized labels
financial_export_total{tenant="neuropilot",role="FINANCE",env="production"} 42

# BAD: PII in labels (system prevents this)
# financial_export_total{email="user@example.com",invoice="INV-12345"} 42
```

---

## Getting Started

### Prerequisites

- NeuroPilot Inventory Enterprise v15.4.0 or later
- Owner role credentials
- Invoice PDFs imported via `/api/inventory/reconcile/import-pdfs`

### Accessing Finance Workspace

1. Navigate to: `http://localhost:8083/owner-super-console.html`
2. Click the **"💰 Financials"** tab in the navigation bar
3. The Finance Workspace dashboard will load with:
   - Financial Accuracy Overview (top card)
   - Import Financial Data section
   - Financial Summary & Reports section
   - AI Finance Copilot
   - Data Quality Monitor

---

## Importing Financial Data

### Via Frontend UI

1. In the **"Import Financial Data"** section:
   - Select **Start Date** (e.g., `2025-01-01`)
   - Select **End Date** (e.g., `2025-06-30`)
   - Click **"Import Financial PDFs"**
2. Wait for import to complete (progress indicator shows status)
3. Review import results:
   - Number of invoices imported
   - Total value imported
   - Success/failure status

### Via API

```bash
curl -X POST "http://localhost:8083/api/inventory/reconcile/import-pdfs" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"startDate": "2025-01-01", "endDate": "2025-06-30"}'
```

**Response:**
```json
{
  "success": true,
  "importedCount": 245,
  "totalValue": 125678.43,
  "message": "Financial data imported successfully"
}
```

---

## Exporting Financial Reports

### 1. CSV Export (Vendor/Category Breakdown)

**Format**: RFC4180 CSV with full category breakdown

**Categories Included**:
- BAKE (Bakery)
- BEV+ECO (Beverages & Eco)
- MILK (Dairy)
- GROC+MISC (Grocery & Miscellaneous)
- MEAT (Meat & Protein)
- PROD (Produce)
- CLEAN (Cleaning Supplies)
- PAPER (Paper Products)
- FREIGHT (Freight Charges)
- LINEN (Linen Services)
- PROPANE (Propane)

**Additional Fields**:
- Subtotal (before taxes)
- GST (5%)
- QST (9.975%)
- Total Amount
- Food & Freight Reimbursable
- Other Reimbursable

#### Via Frontend UI

1. Navigate to **"Financial Summary & Reports"** section
2. Select date range and granularity (weekly/monthly)
3. Click **"Export CSV"** button
4. Browser downloads: `financial_export_YYYY-MM-DD_YYYY-MM-DD.csv`

#### Via API

```bash
curl -X GET "http://localhost:8083/api/inventory/reconcile/export.csv?startDate=2025-01-01&endDate=2025-06-30" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -o financial_export.csv
```

**CSV Format:**
```csv
Vendor,Date,Invoice #,BAKE,BEV+ECO,MILK,GROC+MISC,MEAT,PROD,CLEAN,PAPER,FREIGHT,LINEN,PROPANE,Subtotal,GST (5%),QST (9.975%),Total,Food & Freight Reimb,Other Reimb
ABC Foods,2025-01-15,INV-12345,123.45,67.89,234.56,456.78,345.67,123.45,0.00,0.00,25.00,0.00,0.00,1376.80,68.84,137.39,1583.03,1351.80,25.00
```

**Notes**:
- UTF-8 BOM included for Excel compatibility
- Negative amounts displayed in parentheses `(123.45)`
- All currency values formatted to 2 decimal places

---

### 2. GL CSV Export (Account Code Mapping)

**Format**: General Ledger CSV with account codes for accounting system integration

**Account Code Mapping**:
| Category | Account Code | Description |
|----------|-------------|-------------|
| BAKE | 60110010 | Bakery Purchases |
| BEV | 60110020 | Beverage Purchases |
| MILK | 60110030 | Dairy Purchases |
| GROC | 60110040 | Grocery Purchases |
| MEAT | 60110060 | Meat Purchases |
| PROD | 60110070 | Produce Purchases |
| CLEAN | 60220001 | Cleaning Supplies |
| PAPER | 60260010 | Paper Products |
| FREIGHT | 62421100 | Freight Charges |
| LINEN | 60240010 | Linen Services |
| PROPANE | 62869010 | Propane/Fuel |
| GST | 23010000 | GST Payable |
| QST | 23020000 | QST Payable |

#### Via Frontend UI

1. Navigate to **"Financial Summary & Reports"** section
2. Click **"Export GL CSV"** button
3. Browser downloads: `financial_gl_export_YYYY-MM-DD_YYYY-MM-DD.csv`

#### Via API

```bash
curl -X GET "http://localhost:8083/api/inventory/reconcile/export.gl.csv?startDate=2025-01-01&endDate=2025-06-30" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -o financial_gl_export.csv
```

**GL CSV Format:**
```csv
Date,Vendor,Invoice #,Account Code,Description,Amount,Tax Code,Reimbursable
2025-01-15,ABC Foods,INV-12345,60110010,BAKE,123.45,,1
2025-01-15,ABC Foods,INV-12345,60110020,BEV,67.89,,1
2025-01-15,ABC Foods,INV-12345,23010000,GST (5%),68.84,GST,
2025-01-15,ABC Foods,INV-12345,23020000,QST (9.975%),137.39,QST,
```

**Notes**:
- One row per category per invoice
- Separate rows for GST and QST
- Reimbursable flag: `1` = Yes, `0` = No, empty for tax rows
- Tax Code field: `GST`, `QST`, or empty for non-tax rows

---

### 3. PDF Export (Bilingual Reports)

**Format**: Professional PDF report with KPIs, tables, and bilingual support (EN/FR)

**Report Sections**:
1. **Header**: Title, period, generation date
2. **KPI Summary**: Total invoices, amounts, reimbursable splits, taxes
3. **Invoice Details Table**: Vendor, date, invoice #, subtotal, total
4. **Footer**: Page numbers, branding

#### Via Frontend UI

1. Navigate to **"Financial Summary & Reports"** section
2. Select language: **English** or **Français**
3. Click **"Export PDF"** button
4. Browser downloads: `financial_report_YYYY-MM-DD_YYYY-MM-DD.pdf`

#### Via API

**English Report:**
```bash
curl -X GET "http://localhost:8083/api/inventory/reconcile/export.pdf?startDate=2025-01-01&endDate=2025-06-30&lang=en" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -o financial_report_en.pdf
```

**French Report:**
```bash
curl -X GET "http://localhost:8083/api/inventory/reconcile/export.pdf?startDate=2025-01-01&endDate=2025-06-30&lang=fr" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -o financial_report_fr.pdf
```

**PDF Features**:
- Letter size (8.5" x 11")
- Professional formatting with color-coded sections
- Alternating row colors for readability
- Currency formatting with thousand separators
- Page numbers and branding footer
- Automatic pagination (max 50 invoices per page)
- PDF metadata (title, author, subject, creator)

---

## Financial Summary API

### Get Financial Summary

**Endpoint**: `GET /api/inventory/reconcile/financial-summary`

**Parameters**:
- `startDate` (required): Start date (YYYY-MM-DD)
- `endDate` (required): End date (YYYY-MM-DD)
- `period` (optional): Grouping period (`monthly` or `weekly`, default: `monthly`)

**Example Request:**
```bash
curl -X GET "http://localhost:8083/api/inventory/reconcile/financial-summary?startDate=2025-01-01&endDate=2025-06-30&period=monthly" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Example Response:**
```json
{
  "success": true,
  "summary": {
    "totalInvoices": 245,
    "totalAmount": 125678.43,
    "foodFreightReimb": 110543.21,
    "otherReimb": 15135.22,
    "totalGst": 6283.92,
    "totalQst": 12539.47,
    "dateRange": {
      "start": "2025-01-01",
      "end": "2025-06-30"
    }
  },
  "periods": [
    {
      "period": "2025-01",
      "invoiceCount": 42,
      "totalAmount": 21456.78,
      "categoryBreakdown": {
        "BAKE": 2345.67,
        "BEV": 1234.56,
        "MILK": 3456.78,
        "GROC": 4567.89,
        "MEAT": 5678.90,
        "PROD": 2345.67,
        "CLEAN": 567.89,
        "PAPER": 678.90,
        "FREIGHT": 456.78,
        "LINEN": 123.45,
        "PROPANE": 0.00
      }
    }
  ]
}
```

---

## AI Finance Copilot

The AI Finance Copilot allows natural language SQL queries for financial insights.

### Using the Copilot

1. Navigate to **"AI Finance Copilot"** section
2. Enter natural language query, e.g.:
   - "Show me top 5 vendors by total spend in Q1 2025"
   - "What's my average monthly freight cost?"
   - "Compare bakery spend January vs February"
   - "Show all invoices over $1000 from XYZ Supplier"
3. Click **"Ask Finance AI"**
4. Review generated SQL preview (expandable)
5. View results in formatted table

### Example Queries

**Top Vendors by Spend:**
```
Show me top 10 vendors by total spend in 2025
```

**Category Analysis:**
```
Break down my produce spend by month for Q1 2025
```

**Variance Analysis:**
```
Compare my dairy spend in January 2025 vs January 2024
```

**Vendor Deep Dive:**
```
Show all invoices from ABC Foods with subtotal breakdown
```

### SQL Preview

The AI Copilot shows the generated SQL query before execution. This allows you to:
- Verify the query logic
- Learn SQL patterns for future manual queries
- Understand how the AI interpreted your request
- Debug unexpected results

---

## Data Quality Monitor

The Data Quality Monitor provides real-time validation of financial data integrity.

### Metrics Tracked

1. **Missing Categories**: Invoices with null or empty category totals
2. **Negative Amounts**: Invoices with negative totals (potential credits/returns)
3. **Tax Mismatches**: GST/QST calculations that don't match expected percentages
4. **Duplicate Invoices**: Same vendor/invoice # with different amounts
5. **Orphaned Records**: Invoice records without corresponding PDF entries

### Accessing Data Quality

1. Navigate to **"Data Quality Monitor"** panel in Finance Workspace
2. View issue counts by category
3. Click **"Refresh"** to update metrics
4. Click issue count to see detailed breakdown

### Data Quality Thresholds

| Score | Color | Range | Status |
|-------|-------|-------|--------|
| Green | 🟢 | 95-100% | Excellent |
| Yellow | 🟡 | 70-94% | Needs Attention |
| Red | 🔴 | 0-69% | Critical |

---

## Financial Accuracy in AI Ops Health

Financial accuracy is integrated into the AI Ops Health dashboard.

### How It's Calculated

Financial accuracy measures the variance between invoice amounts and actual inventory usage:

```
Financial Accuracy = 100 - (|Invoice Total - Usage Value| / Invoice Total × 100)
```

**Factors Affecting Accuracy**:
- Invoice processing completeness
- Category mapping accuracy
- PDF parsing quality
- Manual entry errors
- Price fluctuations

### Viewing Financial Accuracy

1. Navigate to **"AI Console"** tab
2. Click **"AI Ops Health"** card
3. View **"Financial Accuracy"** metric (0-100%)
4. Color-coded indicator shows health status

### Weight in Overall Health Score

Financial Accuracy contributes **15%** to the overall AI Ops Health score.

---

## Prometheus Metrics

Finance Workspace operations are tracked via Prometheus metrics.

### Available Metrics

#### 1. financial_import_total (counter)
- **Description**: Total number of financial PDF imports completed
- **Use Case**: Track import frequency and volume
- **Query Example**: `rate(financial_import_total[5m])`

#### 2. financial_export_pdf_total (counter)
- **Description**: Total number of PDF exports generated
- **Use Case**: Monitor PDF generation usage
- **Query Example**: `sum(financial_export_pdf_total)`

#### 3. financial_export_csv_total (counter)
- **Description**: Total number of CSV exports generated (includes both CSV and GL CSV)
- **Use Case**: Track CSV export frequency
- **Query Example**: `rate(financial_export_csv_total[1h])`

#### 4. financial_usage_accuracy_pct (gauge)
- **Description**: Current financial accuracy percentage (0-100)
- **Use Case**: Monitor data quality over time
- **Query Example**: `financial_usage_accuracy_pct`

### Accessing Metrics

**Prometheus Endpoint**: `http://localhost:8083/metrics`

**Example:**
```bash
curl -s http://localhost:8083/metrics | grep financial_
```

**Output:**
```
# HELP financial_import_total Total number of financial PDF imports completed
# TYPE financial_import_total counter
financial_import_total 42

# HELP financial_export_pdf_total Total number of PDF exports generated
# TYPE financial_export_pdf_total counter
financial_export_pdf_total 15

# HELP financial_export_csv_total Total number of CSV exports generated
# TYPE financial_export_csv_total counter
financial_export_csv_total 23

# HELP financial_usage_accuracy_pct Current financial accuracy percentage (0-100)
# TYPE financial_usage_accuracy_pct gauge
financial_usage_accuracy_pct 87.5
```

---

## Troubleshooting

### Import Issues

**Problem**: Import fails with "No invoices found"

**Solutions**:
1. Verify date range covers period with invoice PDFs
2. Check if PDFs were successfully uploaded to `/api/owner/upload-pdfs`
3. Verify PDF parsing completed without errors
4. Check `invoice_pdfs` table for records in date range

---

**Problem**: Import succeeds but category totals are missing

**Solutions**:
1. Re-run PDF parsing with improved OCR settings
2. Verify PDF format matches expected vendor templates
3. Check `pdf_parsing_log` for parsing errors
4. Manually review PDFs for text extraction quality

---

### Export Issues

**Problem**: CSV export downloads but file is empty

**Solutions**:
1. Verify financial data was imported for selected date range
2. Check browser console for JavaScript errors
3. Try API endpoint directly with curl to isolate frontend/backend
4. Verify JWT token is valid and not expired

---

**Problem**: PDF export fails with 500 error

**Solutions**:
1. Check server logs: `tail -f logs/inventory-server.log | grep FinancialReport`
2. Verify PDFKit is installed: `npm list pdfkit`
3. Check available memory (PDF generation is memory-intensive)
4. Try reducing date range to decrease PDF size

---

**Problem**: GL CSV export has missing account codes

**Solutions**:
1. Verify category names match expected values (BAKE, BEV, MILK, etc.)
2. Check `accountCodes` mapping in `routes/inventory-reconcile.js`
3. Update mapping if new categories were added
4. Re-export after fixing category names in database

---

### AI Copilot Issues

**Problem**: AI Copilot returns "Query generation failed"

**Solutions**:
1. Simplify natural language query
2. Use specific table/column names from schema
3. Check OpenAI API key is configured in `.env`
4. Review `ai-query-log` for error details

---

**Problem**: AI Copilot generates invalid SQL

**Solutions**:
1. Use SQL preview to identify syntax errors
2. Report issue to development team with example query
3. Fall back to manual SQL in database console
4. Try rephrasing query with different keywords

---

### Data Quality Issues

**Problem**: Financial accuracy score is unexpectedly low (<70%)

**Solutions**:
1. Review Data Quality Monitor for specific issues
2. Check for missing category totals in recent imports
3. Verify invoice amounts match actual inventory usage
4. Re-import affected PDFs with improved parsing
5. Run `SELECT * FROM invoice_pdfs WHERE category_totals IS NULL` to find gaps

---

**Problem**: Duplicate invoice warnings appearing

**Solutions**:
1. Identify duplicates: `SELECT vendor, invoice_number, COUNT(*) FROM invoice_pdfs GROUP BY vendor, invoice_number HAVING COUNT(*) > 1`
2. Review business process to prevent duplicate uploads
3. Manually merge or delete duplicates
4. Add validation to prevent future duplicates

---

## API Reference

### Authentication

All API endpoints require JWT authentication:

```bash
# Login
curl -X POST "http://localhost:8083/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email": "owner@example.com", "password": "your_password"}'

# Response
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": { "id": 1, "email": "owner@example.com", "role": "owner" }
}

# Use token in subsequent requests
curl -X GET "http://localhost:8083/api/inventory/reconcile/financial-summary" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Endpoints Summary

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/inventory/reconcile/import-pdfs` | Import financial PDFs | Yes (Owner) |
| GET | `/api/inventory/reconcile/financial-summary` | Get financial summary | Yes (Owner) |
| GET | `/api/inventory/reconcile/export.csv` | Export vendor/category CSV | Yes (Owner) |
| GET | `/api/inventory/reconcile/export.gl.csv` | Export GL CSV with account codes | Yes (Owner) |
| GET | `/api/inventory/reconcile/export.pdf` | Export bilingual PDF report | Yes (Owner) |
| GET | `/api/owner/ops/status` | Get AI Ops Health (includes financial_accuracy) | Yes (Owner) |
| GET | `/metrics` | Prometheus metrics endpoint | No |

---

## Best Practices

### Import Scheduling

1. **Frequency**: Import financial data weekly or bi-weekly
2. **Timing**: Import after vendor invoices are processed
3. **Verification**: Always review import results for errors
4. **Backups**: Maintain PDF backups before re-importing

### Export Workflows

1. **CSV Exports**: Use for spreadsheet analysis, pivot tables, charts
2. **GL CSV Exports**: Use for accounting system integration (QuickBooks, Sage, etc.)
3. **PDF Exports**: Use for executive reporting, board meetings, archival

### Data Quality Maintenance

1. **Weekly Review**: Check Data Quality Monitor every week
2. **Threshold Alerts**: Set up monitoring for accuracy <95%
3. **Issue Triage**: Address critical issues (red) immediately
4. **Process Improvement**: Use quality metrics to improve upstream processes

### AI Copilot Usage

1. **Start Simple**: Begin with straightforward queries to learn patterns
2. **Review SQL**: Always check generated SQL before relying on results
3. **Save Queries**: Document useful queries for future reference
4. **Report Issues**: Flag incorrect SQL generation to improve AI model

---

## Count by Invoice (Finance-First Workflow) v15.6.0

The Count by Invoice feature implements a finance-driven inventory count workflow with invoice-based reconciliation. This new workflow shifts the focus from traditional inventory counts to financial reconciliation, using the formula: **Opening Count + Purchases (Invoices) - Closing Count = Usage**.

### Key Features

1. **Finance-First Approach**: Finance codes (BAKE, MEAT, PROD, etc.) are pinned to the top of the count interface
2. **Invoice Attachment**: Attach PDF invoices directly to count sessions with AI-powered line item mapping
3. **AI Mapping Service**: Automatically maps invoice line items to inventory items and finance codes with confidence scoring
4. **State Machine Workflow**: OPEN → SUBMITTED → APPROVED → LOCKED with validation gates at each transition
5. **Dual-Control Enforcement**: Prevents single-user approval (submitter ≠ approver ≠ locker)
6. **Finance Guardrails**: Tax validation, negative count blocking, statistical outlier detection
7. **Month-End Reports**: Generate PDF/CSV reports with finance code summaries and separated GST/QST

### Finance Codes

The system uses a fixed 12-category classification system for GL reporting:

| Finance Code | Description | Reimbursable |
|--------------|-------------|--------------|
| **BAKE** | Bakery & Bread | Yes (Food) |
| **BEV+ECO** | Beverages & Eco | Yes (Food) |
| **MILK** | Dairy Products | Yes (Food) |
| **GROC+MISC** | Grocery & Misc | Yes (Food) |
| **MEAT** | Meat & Protein | Yes (Food) |
| **PROD** | Produce | Yes (Food) |
| **FREIGHT** | Freight Charges | Yes (Transport) |
| **CLEAN** | Cleaning Supplies | No |
| **PAPER** | Paper Products | No |
| **LINEN** | Linen Services | No |
| **PROPANE** | Propane/Fuel | No |
| **OTHER** | Other Costs | No |

### Count Workflow

#### 1. Start Count Session

**Modes**:
- **from_last**: Copy lines from the most recent locked count (baseline)
- **from_invoice**: Start blank and populate from attached invoices
- **blank**: Start completely empty (manual entry only)

**API Endpoint**: `POST /api/owner/counts/start`

**Request Body:**
```json
{
  "mode": "from_last",
  "period_month": 10,
  "period_year": 2025,
  "location_id": "MAIN",
  "gst_rate": 0.05,
  "qst_rate": 0.09975,
  "notes": "October 2025 month-end count"
}
```

**Response:**
```json
{
  "success": true,
  "count_id": "CNT-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "mode": "from_last",
  "baseline_count_id": "CNT-previous",
  "message": "Count session created successfully"
}
```

#### 2. Attach Invoices

Attach invoice PDFs to the count session. The system automatically maps invoice lines to inventory items using AI.

**API Endpoint**: `POST /api/owner/counts/:id/attach-invoices`

**Request Body:**
```json
{
  "document_ids": [
    "DOC-12345",
    "DOC-67890"
  ]
}
```

**AI Mapping Process**:
1. **Rule-Based Pass**: Check `finance_mapping_rules` table for regex matches
2. **Item Code Suggestion**: Exact match → partial keyword match → historical mapping
3. **Finance Code Classification**: Keyword-based classifier with confidence scoring
4. **Auto-Approval**: Lines with confidence ≥0.8 are auto-approved, others require review

#### 3. Add/Update Count Lines

**API Endpoint**: `POST /api/owner/counts/:id/line`

**Request Body:**
```json
{
  "item_code": "BEEF-001",
  "item_desc": "Ground Beef 80/20",
  "finance_code": "MEAT",
  "counted_qty": 50,
  "counted_uom": "LB",
  "unit_cost_cents": 599,
  "notes": "Verified by kitchen manager"
}
```

#### 4. Submit for Approval (OPEN → SUBMITTED)

**Validation Gates**:
- ✅ No negative counts
- ✅ All lines have item codes
- ✅ All lines have finance codes
- ⚠️ Statistical outlier detection (items deviating >2σ from historical average)

**API Endpoint**: `POST /api/owner/counts/:id/submit`

**Response:**
```json
{
  "success": true,
  "message": "Count submitted for approval",
  "warnings": [
    {
      "code": "STATISTICAL_OUTLIERS",
      "message": "Items with counts deviating >2σ from historical average",
      "details": [
        {
          "item_code": "MILK-001",
          "current_qty": 100,
          "historical_mean": "50.00",
          "std_dev": "10.00",
          "z_score": "5.00"
        }
      ]
    }
  ]
}
```

#### 5. Approve Count (SUBMITTED → APPROVED)

**Validation Gates**:
- ✅ All invoice lines resolved (no mappings with confidence <0.8)
- ✅ Tax totals match expected calculations (within $0.50 tolerance)
- ⚠️ Large variances flagged (>$5000 on any finance code)
- 🔒 Dual-control: Approver ≠ Submitter

**API Endpoint**: `POST /api/owner/counts/:id/approve`

**Response:**
```json
{
  "success": true,
  "message": "Count approved",
  "finance_summary": {
    "BAKE": 12500,
    "MEAT": 45000,
    "PROD": 23000,
    "GST": 2875,
    "QST": 5738
  },
  "warnings": []
}
```

#### 6. Lock Count (APPROVED → LOCKED)

Locking makes the count immutable and eligible as a baseline for the next period.

**Validation Gates**:
- ✅ Count status is APPROVED
- ✅ Finance summary is populated
- 🔒 Dual-control: Locker ≠ Approver

**API Endpoint**: `POST /api/owner/counts/:id/lock`

### AI Mapping Review

When AI confidence is below 80%, invoice lines require human review.

**Get Unresolved Mappings**: `GET /api/owner/counts/needs-mapping`

**Confirm Mapping**: `POST /api/owner/counts/confirm-mapping`

**Request Body:**
```json
{
  "link_line_id": "LNL-12345",
  "confirmed_item_code": "BEEF-001",
  "confirmed_finance_code": "MEAT"
}
```

### Reports

#### CSV Export (GL-Friendly)

**API Endpoint**: `GET /api/owner/counts/:id/report/csv`

**Download**: `count_CNT-xxx_2025_10.csv`

**Sections**:
1. Count Session Header
2. Finance Code Summary
3. Grand Totals (Food+Freight vs Other)
4. Tax Summary (GST/QST)
5. Attached Invoices
6. Line Item Detail
7. Exceptions (Unresolved Mappings)

#### Text Report

**API Endpoint**: `GET /api/owner/counts/:id/report/text`

**Format**: Terminal-friendly report with box-drawing characters and formatted tables.

#### JSON Report

**API Endpoint**: `GET /api/owner/counts/:id/report/json`

**Returns**: Structured JSON with all count data for custom report generation.

### Finance Guardrails

#### Tax Validation

Recomputes GST/QST from subtotals and flags discrepancies >$0.50:

```
Expected GST = Subtotal × 0.05
Expected QST = Subtotal × 0.09975
```

#### Statistical Outlier Detection

Compares current counts to the past 3 locked counts:

```
Z-Score = (Current Qty - Historical Mean) / Standard Deviation
Flag if Z-Score > 2.0
```

#### Dual-Control Enforcement

- **Submit**: Any user with OPS/FINANCE/OWNER role
- **Approve**: Must be different user than submitter
- **Lock**: Must be different user than approver

#### Negative Count Blocking

Prevents submission if any line has `counted_qty < 0`.

### Verification Script

Run the end-to-end verification script to test the complete workflow:

```bash
export TOKEN="YOUR_JWT_TOKEN"
export BASE_URL="http://127.0.0.1:8083"
bash scripts/verify_count_finance_first.sh
```

**Test Coverage**:
1. ✅ Start count session (from_last mode)
2. ✅ Get count details
3. ✅ Add/update 5 count lines
4. ✅ Get variances report
5. ✅ Submit count (OPEN → SUBMITTED)
6. ✅ Approve count (SUBMITTED → APPROVED)
7. ✅ Lock count (APPROVED → LOCKED)
8. ✅ Generate CSV/Text/JSON reports
9. ✅ Verify needs-mapping view
10. ✅ Database schema verification

### Prometheus Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `count_session_started_total` | counter | Total count sessions created |
| `count_line_updated_total` | counter | Total count lines added/updated |
| `count_session_submitted_total` | counter | Total counts submitted for approval |
| `count_session_approved_total` | counter | Total counts approved |
| `count_session_locked_total` | counter | Total counts locked (final) |
| `ai_mapping_needs_review_total` | counter | Total invoice lines needing mapping review |

**Query Examples:**
```prometheus
# Count session start rate (per hour)
rate(count_session_started_total[1h])

# Approval success rate
count_session_approved_total / count_session_submitted_total

# Mapping accuracy
1 - (ai_mapping_needs_review_total / count_line_updated_total)
```

### Database Schema

**Tables**:
- `count_sessions`: Count session header with status workflow
- `count_lines`: Individual count lines with finance codes
- `count_invoices`: Invoice attachments linked to counts
- `count_invoice_lines`: Parsed invoice lines with AI mapping results
- `finance_mapping_rules`: AI learning rules for line item classification

**Views**:
- `v_finance_count_summary`: Aggregated finance code totals per count
- `v_needs_mapping`: Invoice lines requiring human review (confidence <0.8)

### Best Practices

1. **Monthly Cadence**: Run counts at month-end before financial close
2. **Invoice First**: Attach all invoices before starting count entry
3. **Review Mappings**: Always review AI-suggested mappings with confidence <80%
4. **Statistical Outliers**: Investigate items flagged with high z-scores
5. **Dual-Control**: Use different users for submit/approve/lock to enforce segregation of duties
6. **Baseline Mode**: Use `from_last` mode for consistency and speed
7. **Report Archive**: Export CSV/PDF reports immediately after locking for audit trail

### Troubleshooting

**Problem**: AI mapping confidence is consistently low (<50%)

**Solutions**:
1. Add custom mapping rules to `finance_mapping_rules` table
2. Review vendor category names in invoice PDFs
3. Train the AI with confirmed mappings (system learns from confirmations)
4. Check for OCR parsing errors in `raw_desc` field

---

**Problem**: Dual-control prevents approval by same user

**Solutions**:
1. This is expected behavior for financial controls
2. Use a different user account for approval
3. OWNER role can override dual-control if necessary (but logs audit trail)

---

**Problem**: Tax validation fails with small discrepancies

**Solutions**:
1. Check if invoice PDFs have rounding differences
2. Verify GST/QST rates are correct (5% and 9.975%)
3. Review subtotal calculation in invoice parsing
4. Tolerance is set to $0.50 (configurable in FinanceGuardrails.js)

---

## Version History

### v15.5.1 (Current)
- **RBAC Hardening**: Added four-tier role model (READONLY, OPS, FINANCE, OWNER)
- **Frontend UI Gating**: Role-based tab visibility and button disabling
- **Shadow Mode Badge**: Visual indicator when `FORECAST_SHADOW_MODE=true`
- **Confidence Chips**: Color-coded AI confidence display (≥85% = ok, 70-84% = warn, <70% = bad)
- **Dual-Control Enforcement**: Approver cannot be forecast creator
- **Rate Limiting**: Export endpoints limited to 5 requests/min per user
- **SSO Hardening**: Block login for users with no role assigned
- **Metrics Sanitization**: Remove PII from Prometheus labels
- **RBAC Integration Tests**: Comprehensive test suite for all role scenarios
- **Documentation**: Added "Roles & Capabilities" section to README

### v15.4.0
- Added CSV export endpoint with full category breakdown
- Added GL CSV export endpoint with account code mapping
- Added bilingual PDF export (EN/FR)
- Created FinancialReport.js PDF generator service
- Enhanced financial metrics tracking (export counters)
- Added verification script: `verify_financial_workspace.sh`
- Integrated PDFKit dependency for server-side PDF generation

### v15.3.0
- Added financial accuracy metric to AI Ops Health
- Implemented FinancialAccuracy.js computation module
- Added financial data import via PDF processing
- Created financial summary API with period grouping

### v15.2.0
- Initial Finance Workspace frontend UI
- Basic financial data viewing
- AI Finance Copilot (natural language SQL)

---

## Support and Feedback

### Getting Help

1. **Documentation**: Review this README and CHANGELOG.md
2. **Verification Script**: Run `bash scripts/verify_financial_workspace.sh` to test all endpoints
3. **Logs**: Check `logs/inventory-server.log` for detailed error messages
4. **GitHub Issues**: Report bugs at [repository URL]

### Feature Requests

Submit feature requests with:
- Use case description
- Expected behavior
- Example data/queries
- Priority level (low/medium/high)

---

## Technical Architecture

### Database Schema

**Key Tables**:
- `invoice_pdfs`: Stores parsed invoice data with category totals
- `pdf_parsing_log`: Tracks PDF processing status and errors
- `ai_ops_history`: Stores historical AI Ops Health scores

**Views**:
- `v_current_inventory`: Current inventory snapshot for accuracy calculation
- `v_financial_summary`: Aggregated financial metrics

### Service Modules

- `src/ai/FinancialAccuracy.js`: Accuracy calculation engine
- `src/reports/FinancialReport.js`: PDF generation service
- `utils/financialMetrics.js`: Prometheus metrics tracking

### Routes

- `routes/inventory-reconcile.js`: Financial data endpoints
- `routes/owner-ops.js`: AI Ops Health endpoint (includes financial_accuracy)

---

## Security Considerations

### Role-Based Access

- All Finance Workspace endpoints require **Owner** role
- JWT authentication enforced on all protected routes
- Session timeout: 24 hours (configurable)

### Data Protection

- Financial data stored in PostgreSQL with encrypted connections
- PDF files stored in secure directory with restricted permissions
- Export files generated in-memory and streamed to client (no disk storage)

### Audit Logging

- All import/export operations logged to `logs/inventory-server.log`
- Prometheus metrics track operation counts for audit trails
- AI Ops Health history maintained in `ai_ops_history` table

---

## Performance Optimization

### Import Performance

- Batch PDF processing: 50 PDFs per batch
- Parallel text extraction using worker threads
- Database inserts use prepared statements with transactions

### Export Performance

- CSV exports stream data (no memory buffering)
- PDF generation limits to 50 invoices per page
- GL CSV uses category indexing for fast lookups

### Caching Strategy

- Financial accuracy cached for 1 hour (configurable)
- Summary API results cached for 15 minutes
- Prometheus metrics computed on-demand (no caching)

---

## License

Copyright © 2025 NeuroPilot AI. All rights reserved.

This documentation is proprietary to NeuroPilot Inventory Enterprise System.

---

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for detailed version history and upgrade notes.
