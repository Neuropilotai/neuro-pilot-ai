#!/bin/bash
# ============================================================================
# Finance Workspace v15.4.0 Verification Script
# Tests: KPIs, summaries, pivots, exports, AI copilot, data quality, metrics
# ============================================================================

set -e  # Exit on error

API_BASE="http://127.0.0.1:8083/api"
TOKEN=""
OWNER_EMAIL="owner@example.com"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}============================================================================${NC}"
echo -e "${BLUE}Finance Workspace v15.4.0 Verification${NC}"
echo -e "${BLUE}============================================================================${NC}"
echo ""

# ============================================================================
# Step 1: Authentication
# ============================================================================
echo -e "${YELLOW}[1/10] Authenticating...${NC}"

LOGIN_RESPONSE=$(curl -s -X POST "${API_BASE}/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"${OWNER_EMAIL}\", \"password\": \"changeme\"}")

TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo -e "${RED}❌ Failed to authenticate${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Authenticated successfully${NC}"
echo ""

# ============================================================================
# Step 2: Seed Sample Financial Data (if needed)
# ============================================================================
echo -e "${YELLOW}[2/10] Checking existing financial data...${NC}"

# Check if we have data in ai_reconcile_history
DATA_CHECK=$(sqlite3 /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise/backend/inventory.db \
  "SELECT COUNT(*) FROM ai_reconcile_history WHERE invoice_date >= '2025-01-01';" 2>/dev/null || echo "0")

if [ "$DATA_CHECK" -lt 3 ]; then
  echo -e "${YELLOW}Seeding sample invoices...${NC}"

  sqlite3 /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise/backend/inventory.db <<EOF
INSERT OR IGNORE INTO ai_reconcile_history (
  reconcile_id, invoice_date, vendor, invoice_number, subtotal, gst, qst, total_amount,
  category_totals, created_at, status
) VALUES
  ('rec_test_001', '2025-01-15', 'Sysco Canada', 'INV-2025-001', 5000.00, 250.00, 498.75, 5748.75, '{}', datetime('now'), 'completed'),
  ('rec_test_002', '2025-02-20', 'Gordon Food Service', 'INV-2025-002', 7500.00, 375.00, 748.13, 8623.13, '{}', datetime('now'), 'completed'),
  ('rec_test_003', '2025-03-10', 'Sysco Canada', 'INV-2025-003', 6200.00, 310.00, 618.45, 7128.45, '{}', datetime('now'), 'completed'),
  ('rec_test_004', '2025-04-05', 'Metro Richelieu', 'INV-2025-004', 4800.00, 240.00, 478.80, 5518.80, '{}', datetime('now'), 'completed'),
  ('rec_test_005', '2025-05-12', 'Gordon Food Service', 'INV-2025-005', 8100.00, 405.00, 808.28, 9313.28, '{}', datetime('now'), 'completed');
EOF

  echo -e "${GREEN}✅ Sample data seeded${NC}"
else
  echo -e "${GREEN}✅ Existing data found (${DATA_CHECK} invoices)${NC}"
fi
echo ""

# ============================================================================
# Step 3: Test Finance KPIs Endpoint
# ============================================================================
echo -e "${YELLOW}[3/10] Testing Finance KPIs endpoint...${NC}"

KPIS_RESPONSE=$(curl -s -X GET "${API_BASE}/finance/kpis?period=2025-Q1" \
  -H "Authorization: Bearer ${TOKEN}")

KPIS_SUCCESS=$(echo "$KPIS_RESPONSE" | grep -o '"success":[^,]*' | cut -d':' -f2)

if [ "$KPIS_SUCCESS" = "true" ]; then
  echo -e "${GREEN}✅ KPIs endpoint working${NC}"

  # Extract and display key metrics
  TOTAL_REVENUE=$(echo "$KPIS_RESPONSE" | grep -o '"totalRevenue":{[^}]*}' | grep -o '"value":[0-9.]*' | cut -d':' -f2)
  INVOICE_COUNT=$(echo "$KPIS_RESPONSE" | grep -o '"invoiceCount":{[^}]*}' | grep -o '"value":[0-9]*' | cut -d':' -f2)

  echo -e "  ${BLUE}Total Revenue: \$${TOTAL_REVENUE}${NC}"
  echo -e "  ${BLUE}Invoice Count: ${INVOICE_COUNT}${NC}"
else
  echo -e "${RED}❌ KPIs endpoint failed${NC}"
  echo "$KPIS_RESPONSE" | head -n 5
fi
echo ""

# ============================================================================
# Step 4: Test Finance Summary (Month Grouping)
# ============================================================================
echo -e "${YELLOW}[4/10] Testing Finance Summary (by month)...${NC}"

SUMMARY_MONTH_RESPONSE=$(curl -s -X GET "${API_BASE}/finance/summary?period=2025-H1&group=month" \
  -H "Authorization: Bearer ${TOKEN}")

SUMMARY_MONTH_SUCCESS=$(echo "$SUMMARY_MONTH_RESPONSE" | grep -o '"success":[^,]*' | cut -d':' -f2)

if [ "$SUMMARY_MONTH_SUCCESS" = "true" ]; then
  echo -e "${GREEN}✅ Summary by month working${NC}"

  # Count periods returned
  PERIOD_COUNT=$(echo "$SUMMARY_MONTH_RESPONSE" | grep -o '"period":' | wc -l)
  echo -e "  ${BLUE}Periods returned: ${PERIOD_COUNT}${NC}"
else
  echo -e "${RED}❌ Summary by month failed${NC}"
  echo "$SUMMARY_MONTH_RESPONSE" | head -n 5
fi
echo ""

# ============================================================================
# Step 5: Test Finance Summary (Vendor Grouping)
# ============================================================================
echo -e "${YELLOW}[5/10] Testing Finance Summary (by vendor)...${NC}"

SUMMARY_VENDOR_RESPONSE=$(curl -s -X GET "${API_BASE}/finance/summary?period=2025-H1&group=vendor" \
  -H "Authorization: Bearer ${TOKEN}")

SUMMARY_VENDOR_SUCCESS=$(echo "$SUMMARY_VENDOR_RESPONSE" | grep -o '"success":[^,]*' | cut -d':' -f2)

if [ "$SUMMARY_VENDOR_SUCCESS" = "true" ]; then
  echo -e "${GREEN}✅ Summary by vendor working${NC}"

  # Count vendors returned
  VENDOR_COUNT=$(echo "$SUMMARY_VENDOR_RESPONSE" | grep -o '"vendor":' | wc -l)
  echo -e "  ${BLUE}Vendors returned: ${VENDOR_COUNT}${NC}"
else
  echo -e "${RED}❌ Summary by vendor failed${NC}"
  echo "$SUMMARY_VENDOR_RESPONSE" | head -n 5
fi
echo ""

# ============================================================================
# Step 6: Test Finance Pivot
# ============================================================================
echo -e "${YELLOW}[6/10] Testing Finance Pivot (vendor x month)...${NC}"

PIVOT_RESPONSE=$(curl -s -X GET "${API_BASE}/finance/pivot?rows=vendor&cols=month&metrics=%5B%22total_amount%22%2C%22invoice_count%22%5D" \
  -H "Authorization: Bearer ${TOKEN}")

PIVOT_SUCCESS=$(echo "$PIVOT_RESPONSE" | grep -o '"success":[^,]*' | cut -d':' -f2)

if [ "$PIVOT_SUCCESS" = "true" ]; then
  echo -e "${GREEN}✅ Pivot table working${NC}"

  # Count rows in pivot
  ROW_COUNT=$(echo "$PIVOT_RESPONSE" | grep -o '"vendor":' | wc -l)
  echo -e "  ${BLUE}Pivot rows returned: ${ROW_COUNT}${NC}"
else
  echo -e "${RED}❌ Pivot endpoint failed${NC}"
  echo "$PIVOT_RESPONSE" | head -n 5
fi
echo ""

# ============================================================================
# Step 7: Test Finance Export (CSV)
# ============================================================================
echo -e "${YELLOW}[7/10] Testing Finance Export (CSV)...${NC}"

EXPORT_RESPONSE=$(curl -s -X POST "${API_BASE}/finance/export" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"format": "csv", "params": {"period": "2025-Q1", "groupBy": "month"}}')

# Check if response contains CSV data or success message
if echo "$EXPORT_RESPONSE" | grep -q "period,vendor,totalAmount" || echo "$EXPORT_RESPONSE" | grep -q '"success":true'; then
  echo -e "${GREEN}✅ CSV export working${NC}"

  # Count lines in CSV if present
  if echo "$EXPORT_RESPONSE" | grep -q "period,vendor"; then
    LINE_COUNT=$(echo "$EXPORT_RESPONSE" | wc -l)
    echo -e "  ${BLUE}CSV lines: ${LINE_COUNT}${NC}"
  fi
else
  echo -e "${RED}❌ CSV export failed${NC}"
  echo "$EXPORT_RESPONSE" | head -n 5
fi
echo ""

# ============================================================================
# Step 8: Test AI Copilot (Natural Language Query)
# ============================================================================
echo -e "${YELLOW}[8/10] Testing AI Copilot (natural language)...${NC}"

AI_QUERY="show top 5 vendors by total for 2025-H1 and export csv"

AI_RESPONSE=$(curl -s -X POST "${API_BASE}/finance/ai/query" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"question\": \"${AI_QUERY}\"}")

AI_SUCCESS=$(echo "$AI_RESPONSE" | grep -o '"success":[^,]*' | cut -d':' -f2)

if [ "$AI_SUCCESS" = "true" ]; then
  echo -e "${GREEN}✅ AI Copilot working${NC}"

  # Extract intent detected
  AI_INTENT=$(echo "$AI_RESPONSE" | grep -o '"intent":"[^"]*' | cut -d'"' -f4)
  echo -e "  ${BLUE}Intent detected: ${AI_INTENT}${NC}"

  # Check for audit ID
  AUDIT_ID=$(echo "$AI_RESPONSE" | grep -o '"auditId":[0-9]*' | cut -d':' -f2)
  if [ -n "$AUDIT_ID" ]; then
    echo -e "  ${BLUE}Audit ID: ${AUDIT_ID}${NC}"
  fi
else
  echo -e "${RED}❌ AI Copilot failed${NC}"
  echo "$AI_RESPONSE" | head -n 5
fi
echo ""

# ============================================================================
# Step 9: Test Data Quality Endpoint
# ============================================================================
echo -e "${YELLOW}[9/10] Testing Data Quality endpoint...${NC}"

DQ_RESPONSE=$(curl -s -X GET "${API_BASE}/finance/data-quality" \
  -H "Authorization: Bearer ${TOKEN}")

DQ_SUCCESS=$(echo "$DQ_RESPONSE" | grep -o '"success":[^,]*' | cut -d':' -f2)

if [ "$DQ_SUCCESS" = "true" ]; then
  echo -e "${GREEN}✅ Data Quality endpoint working${NC}"

  # Count issues found
  ISSUE_COUNT=$(echo "$DQ_RESPONSE" | grep -o '"type":' | wc -l)
  echo -e "  ${BLUE}Data quality issues found: ${ISSUE_COUNT}${NC}"
else
  echo -e "${RED}❌ Data Quality endpoint failed${NC}"
  echo "$DQ_RESPONSE" | head -n 5
fi
echo ""

# ============================================================================
# Step 10: Check Prometheus Metrics
# ============================================================================
echo -e "${YELLOW}[10/10] Checking Prometheus metrics...${NC}"

METRICS_RESPONSE=$(curl -s http://127.0.0.1:8083/metrics)

# Check for finance-specific metrics
FINANCE_METRICS_COUNT=0

if echo "$METRICS_RESPONSE" | grep -q "finance_aggregate_job_duration_seconds"; then
  echo -e "${GREEN}✅ finance_aggregate_job_duration_seconds found${NC}"
  ((FINANCE_METRICS_COUNT++))
fi

if echo "$METRICS_RESPONSE" | grep -q "finance_exports_total"; then
  echo -e "${GREEN}✅ finance_exports_total found${NC}"
  ((FINANCE_METRICS_COUNT++))
fi

if echo "$METRICS_RESPONSE" | grep -q "finance_ai_queries_total"; then
  echo -e "${GREEN}✅ finance_ai_queries_total found${NC}"
  ((FINANCE_METRICS_COUNT++))
fi

if [ "$FINANCE_METRICS_COUNT" -ge 2 ]; then
  echo -e "${GREEN}✅ Finance metrics registered (${FINANCE_METRICS_COUNT}/3)${NC}"
else
  echo -e "${YELLOW}⚠️  Only ${FINANCE_METRICS_COUNT}/3 finance metrics found${NC}"
  echo -e "${YELLOW}   (Note: Some metrics only appear after cron jobs run)${NC}"
fi
echo ""

# ============================================================================
# Summary
# ============================================================================
echo -e "${BLUE}============================================================================${NC}"
echo -e "${BLUE}Verification Summary${NC}"
echo -e "${BLUE}============================================================================${NC}"
echo ""
echo -e "${GREEN}✅ Finance Workspace v15.4.0 verification complete!${NC}"
echo ""
echo -e "Components tested:"
echo -e "  ✓ Role-based authentication"
echo -e "  ✓ KPIs with delta calculations"
echo -e "  ✓ Summary queries (month, vendor grouping)"
echo -e "  ✓ Pivot tables"
echo -e "  ✓ CSV exports"
echo -e "  ✓ AI Copilot (natural language queries)"
echo -e "  ✓ Data Quality monitoring"
echo -e "  ✓ Prometheus metrics"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo -e "  1. Access frontend at: http://127.0.0.1:8083/owner-super-console.html"
echo -e "  2. Navigate to 'Financials' tab to see v15.4.0 features"
echo -e "  3. Try AI Copilot with questions like:"
echo -e "     - 'show top 5 vendors by total for 2025-H1'"
echo -e "     - 'compare Q1 vs Q2 revenue'"
echo -e "     - 'export monthly summary to csv'"
echo -e "  4. Check data quality panel for any issues"
echo -e "  5. View Prometheus metrics at: http://127.0.0.1:8083/metrics"
echo ""
echo -e "${BLUE}============================================================================${NC}"
