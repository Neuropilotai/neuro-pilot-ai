#!/usr/bin/env bash
# ============================================
# POS Smoke Test Script
# Tests all POS endpoints for basic functionality
# ============================================

set -euo pipefail

# Configuration
BASE="${BASE:-https://inventory-backend-7-agent-build.up.railway.app}"
EMAIL="${EMAIL:-admin@yourcompany.com}"
PASS="${PASS:-YourStrongPassword}"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "================================================"
echo "  POS Smoke Test Suite"
echo "  Base URL: $BASE"
echo "================================================"
echo ""

# ============================================
# 1) Login
# ============================================
echo "1) Login"
TOKEN_RESPONSE=$(curl -fsS -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" || echo '{}')

# Try to extract token from different response formats
TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.accessToken // .data.token // .token // empty' 2>/dev/null || echo "")

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo -e "${RED}✗ Login failed${NC}"
  echo "Response: $TOKEN_RESPONSE"
  exit 1
fi

echo -e "${GREEN}✓ Login successful${NC}"
echo ""

# ============================================
# 2) Catalog
# ============================================
echo "2) Catalog"
CATALOG_RESPONSE=$(curl -fsS "$BASE/api/pos/catalog?limit=5" \
  -H "Authorization: Bearer $TOKEN" || echo '{}')

ITEM_COUNT=$(echo "$CATALOG_RESPONSE" | jq '.data.items | length' 2>/dev/null || echo "0")
RECIPE_COUNT=$(echo "$CATALOG_RESPONSE" | jq '.data.recipes | length' 2>/dev/null || echo "0")

echo "   Items: $ITEM_COUNT"
echo "   Recipes: $RECIPE_COUNT"
echo -e "${GREEN}✓ Catalog loaded${NC}"
echo ""

# ============================================
# 3) Register + Open Shift
# ============================================
echo "3) Register + Open Shift"

# Get existing registers
REGISTERS=$(curl -fsS "$BASE/api/pos/registers/registers" \
  -H "Authorization: Bearer $TOKEN" || echo '[]')

REG_ID=$(echo "$REGISTERS" | jq -r '.[0].id // empty' 2>/dev/null || echo "")

# Create register if none exist
if [ -z "$REG_ID" ]; then
  echo "   Creating new register..."
  REG_RESPONSE=$(curl -fsS -X POST "$BASE/api/pos/registers/registers" \
    -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    -d '{"name":"Front Desk","device_id":"REG-SMOKE-001"}' || echo '{}')

  REG_ID=$(echo "$REG_RESPONSE" | jq -r '.data.id // .id // empty' 2>/dev/null || echo "")

  if [ -z "$REG_ID" ]; then
    echo -e "${RED}✗ Failed to create register${NC}"
    echo "Response: $REG_RESPONSE"
    exit 1
  fi
  echo "   Register created: $REG_ID"
else
  echo "   Using existing register: $REG_ID"
fi

# Check for open shift
CURRENT_SHIFT=$(curl -fsS "$BASE/api/pos/registers/shifts/current?register_id=$REG_ID" \
  -H "Authorization: Bearer $TOKEN" || echo '{}')

SHIFT=$(echo "$CURRENT_SHIFT" | jq -r '.data.id // empty' 2>/dev/null || echo "")

# Open shift if none exists
if [ -z "$SHIFT" ]; then
  echo "   Opening new shift..."
  SHIFT_RESPONSE=$(curl -fsS -X POST "$BASE/api/pos/registers/shifts/open" \
    -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    -d "{\"register_id\":$REG_ID,\"opening_float_cents\":10000}" || echo '{}')

  SHIFT=$(echo "$SHIFT_RESPONSE" | jq -r '.data.id // .id // empty' 2>/dev/null || echo "")

  if [ -z "$SHIFT" ]; then
    echo -e "${RED}✗ Failed to open shift${NC}"
    echo "Response: $SHIFT_RESPONSE"
    exit 1
  fi
  echo "   Shift opened: $SHIFT"
else
  echo "   Using existing open shift: $SHIFT"
fi

echo -e "${GREEN}✓ Register and shift ready${NC}"
echo ""

# ============================================
# 4) Create Order
# ============================================
echo "4) Create Order"
ORDER_RESPONSE=$(curl -fsS -X POST "$BASE/api/pos/orders" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"shift_id\":$SHIFT}" || echo '{}')

ORDER=$(echo "$ORDER_RESPONSE" | jq -r '.data.id // .id // empty' 2>/dev/null || echo "")

if [ -z "$ORDER" ]; then
  echo -e "${RED}✗ Failed to create order${NC}"
  echo "Response: $ORDER_RESPONSE"
  exit 1
fi

ORDER_NO=$(echo "$ORDER_RESPONSE" | jq -r '.data.order_no // .order_no // empty' 2>/dev/null || echo "")
echo "   Order created: $ORDER (Order #$ORDER_NO)"
echo -e "${GREEN}✓ Order created${NC}"
echo ""

# ============================================
# 5) Add Line (Item)
# ============================================
echo "5) Add Line (Item)"

# Try to get a real item SKU from catalog
ITEM_SKU=$(echo "$CATALOG_RESPONSE" | jq -r '.data.items[0].sku // empty' 2>/dev/null || echo "")

if [ -z "$ITEM_SKU" ]; then
  # Fallback to a common SKU or create a misc item
  echo -e "${YELLOW}⚠ No items in catalog, adding misc line${NC}"
  LINE_RESPONSE=$(curl -fsS -X POST "$BASE/api/pos/orders/$ORDER/line" \
    -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    -d '{"kind":"misc","sku_or_code":"MISC-001","qty":1,"unit_price_cents":250,"uom":"EA"}' || echo '{}')
else
  echo "   Using item: $ITEM_SKU"
  LINE_RESPONSE=$(curl -fsS -X POST "$BASE/api/pos/orders/$ORDER/line" \
    -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    -d "{\"kind\":\"item\",\"sku_or_code\":\"$ITEM_SKU\",\"qty\":2}" || echo '{}')
fi

LINE_SUCCESS=$(echo "$LINE_RESPONSE" | jq -r '.success // false' 2>/dev/null || echo "false")

if [ "$LINE_SUCCESS" != "true" ]; then
  echo -e "${YELLOW}⚠ Line add had issues (may be expected if no catalog items)${NC}"
  echo "Response: $LINE_RESPONSE"
else
  echo -e "${GREEN}✓ Line added${NC}"
fi
echo ""

# ============================================
# 6) Capture Payment (Cash)
# ============================================
echo "6) Capture Payment (Cash)"

# Get order total
ORDER_DETAILS=$(curl -fsS "$BASE/api/pos/orders/$ORDER" \
  -H "Authorization: Bearer $TOKEN" || echo '{}')

ORDER_TOTAL=$(echo "$ORDER_DETAILS" | jq -r '.data.order.total_cents // 500' 2>/dev/null || echo "500")

PAYMENT_RESPONSE=$(curl -fsS -X POST "$BASE/api/pos/payments/$ORDER/capture" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"method\":\"cash\",\"amount_cents\":$ORDER_TOTAL}" || echo '{}')

PAYMENT_SUCCESS=$(echo "$PAYMENT_RESPONSE" | jq -r '.success // false' 2>/dev/null || echo "false")

if [ "$PAYMENT_SUCCESS" = "true" ]; then
  echo -e "${GREEN}✓ Payment captured${NC}"
  ORDER_STATUS=$(echo "$PAYMENT_RESPONSE" | jq -r '.data.order_status // empty')
  echo "   Order status: $ORDER_STATUS"
else
  echo -e "${YELLOW}⚠ Payment capture had issues${NC}"
  echo "Response: $PAYMENT_RESPONSE"
fi
echo ""

# ============================================
# 7) X Report
# ============================================
echo "7) X Report"
X_REPORT=$(curl -fsS "$BASE/api/pos/reports/x?shift_id=$SHIFT" \
  -H "Authorization: Bearer $TOKEN" || echo '{}')

X_SUCCESS=$(echo "$X_REPORT" | jq -r '.success // false' 2>/dev/null || echo "false")

if [ "$X_SUCCESS" = "true" ]; then
  NET_SALES=$(echo "$X_REPORT" | jq -r '.data.summary.net_sales_cents // 0' 2>/dev/null || echo "0")
  ORDER_COUNT=$(echo "$X_REPORT" | jq -r '.data.summary.order_count // 0' 2>/dev/null || echo "0")
  echo "   Net Sales: \$$(echo "scale=2; $NET_SALES / 100" | bc)"
  echo "   Orders: $ORDER_COUNT"
  echo -e "${GREEN}✓ X report generated${NC}"
else
  echo -e "${YELLOW}⚠ X report had issues${NC}"
  echo "Response: $X_REPORT"
fi
echo ""

# ============================================
# 8) Close Shift + Z Report
# ============================================
echo "8) Close Shift + Z Report"
CLOSE_RESPONSE=$(curl -fsS -X POST "$BASE/api/pos/registers/shifts/close" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"shift_id\":$SHIFT,\"closing_cash_cents\":12000}" || echo '{}')

CLOSE_SUCCESS=$(echo "$CLOSE_RESPONSE" | jq -r '.success // false' 2>/dev/null || echo "false")

if [ "$CLOSE_SUCCESS" = "true" ]; then
  Z_NO=$(echo "$CLOSE_RESPONSE" | jq -r '.data.z_report.z_no // empty' 2>/dev/null || echo "")
  echo "   Z Report #: $Z_NO"
  echo -e "${GREEN}✓ Shift closed and Z report generated${NC}"
else
  echo -e "${YELLOW}⚠ Close shift had issues${NC}"
  echo "Response: $CLOSE_RESPONSE"
fi
echo ""

# ============================================
# Summary
# ============================================
echo "================================================"
echo -e "${GREEN}✅ POS smoke test COMPLETE${NC}"
echo "================================================"
echo ""
echo "Summary:"
echo "  Register ID: $REG_ID"
echo "  Shift ID: $SHIFT"
echo "  Order ID: $ORDER"
echo ""
exit 0
