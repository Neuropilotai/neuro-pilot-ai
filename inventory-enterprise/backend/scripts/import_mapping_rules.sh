#!/bin/bash
#
# import_mapping_rules.sh
# Imports all 20 mapping rules from the starter pack
#
# Usage:
#   TOKEN=your_token ./import_mapping_rules.sh
#   OR:
#   ./import_mapping_rules.sh (uses .owner_token)

set -e

BASE_URL="http://localhost:8083"
TOKEN="${TOKEN:-$(cat .owner_token 2>/dev/null || echo '')}"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

if [ -z "$TOKEN" ]; then
  echo -e "${RED}ERROR: TOKEN not set and .owner_token not found${NC}"
  exit 1
fi

echo "📦 Importing 20 Mapping Rules to NeuroPilot Finance Enforcement"
echo "=============================================================="

IMPORTED=0
FAILED=0

# Define all 20 rules
RULES='[
  {"match_type": "SKU", "match_pattern": "10001", "finance_code": "BAKE", "priority": 900, "confidence": 0.95, "source": "BULK_IMPORT", "active": 1},
  {"match_type": "SKU", "match_pattern": "10002", "finance_code": "MILK", "priority": 900, "confidence": 0.95, "source": "BULK_IMPORT", "active": 1},
  {"match_type": "SKU", "match_pattern": "10003", "finance_code": "MEAT", "priority": 900, "confidence": 0.95, "source": "BULK_IMPORT", "active": 1},
  {"match_type": "SKU", "match_pattern": "10007", "finance_code": "CLEAN", "priority": 900, "confidence": 0.95, "source": "BULK_IMPORT", "active": 1},
  {"match_type": "SKU", "match_pattern": "10008", "finance_code": "PAPER", "priority": 900, "confidence": 0.95, "source": "BULK_IMPORT", "active": 1},
  {"match_type": "SKU", "match_pattern": "10019", "finance_code": "MEAT", "priority": 900, "confidence": 0.95, "source": "BULK_IMPORT", "active": 1},
  {"match_type": "KEYWORD", "match_pattern": "gloves", "finance_code": "GROC+MISC", "priority": 750, "confidence": 0.85, "source": "BULK_IMPORT", "active": 1},
  {"match_type": "KEYWORD", "match_pattern": "bleach", "finance_code": "CLEAN", "priority": 750, "confidence": 0.90, "source": "BULK_IMPORT", "active": 1},
  {"match_type": "KEYWORD", "match_pattern": "romaine", "finance_code": "PROD", "priority": 750, "confidence": 0.90, "source": "BULK_IMPORT", "active": 1},
  {"match_type": "KEYWORD", "match_pattern": "striploin", "finance_code": "MEAT", "priority": 750, "confidence": 0.90, "source": "BULK_IMPORT", "active": 1},
  {"match_type": "KEYWORD", "match_pattern": "sanitizer", "finance_code": "CLEAN", "priority": 750, "confidence": 0.88, "source": "BULK_IMPORT", "active": 1},
  {"match_type": "KEYWORD", "match_pattern": "coffee", "finance_code": "BEV+ECO", "priority": 750, "confidence": 0.85, "source": "BULK_IMPORT", "active": 1},
  {"match_type": "REGEX", "match_pattern": "milk.*[0-9]+%", "finance_code": "MILK", "priority": 700, "confidence": 0.88, "source": "BULK_IMPORT", "active": 1},
  {"match_type": "REGEX", "match_pattern": "oil\\\\s+(canola|vegetable|olive)", "finance_code": "GROC+MISC", "priority": 700, "confidence": 0.87, "source": "BULK_IMPORT", "active": 1},
  {"match_type": "REGEX", "match_pattern": "(steak|ribeye|striploin|tenderloin)", "finance_code": "MEAT", "priority": 700, "confidence": 0.90, "source": "BULK_IMPORT", "active": 1},
  {"match_type": "REGEX", "match_pattern": "cream\\\\s+[0-9]+%", "finance_code": "MILK", "priority": 700, "confidence": 0.88, "source": "BULK_IMPORT", "active": 1},
  {"match_type": "VENDOR_SKU", "match_pattern": "MEAT-", "finance_code": "MEAT", "priority": 650, "confidence": 0.85, "source": "BULK_IMPORT", "active": 1},
  {"match_type": "VENDOR_SKU", "match_pattern": "DAIR-", "finance_code": "MILK", "priority": 650, "confidence": 0.85, "source": "BULK_IMPORT", "active": 1},
  {"match_type": "VENDOR_SKU", "match_pattern": "CHEM-", "finance_code": "CLEAN", "priority": 650, "confidence": 0.85, "source": "BULK_IMPORT", "active": 1},
  {"match_type": "VENDOR_SKU", "match_pattern": "PROD-", "finance_code": "PROD", "priority": 650, "confidence": 0.85, "source": "BULK_IMPORT", "active": 1}
]'

# Import each rule
echo "$RULES" | jq -c '.[]' | while read -r rule; do
  MATCH_TYPE=$(echo "$rule" | jq -r '.match_type')
  PATTERN=$(echo "$rule" | jq -r '.match_pattern')
  CODE=$(echo "$rule" | jq -r '.finance_code')

  echo ""
  echo "Importing: $MATCH_TYPE '$PATTERN' → $CODE"

  RESPONSE=$(curl -s -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$rule" \
    "${BASE_URL}/api/finance/enforcement/rules")

  if echo "$RESPONSE" | jq -e '.success == true' >/dev/null 2>&1; then
    RULE_ID=$(echo "$RESPONSE" | jq -r '.rule.id')
    echo -e "  ${GREEN}✅ Created rule ID: $RULE_ID${NC}"
    IMPORTED=$((IMPORTED + 1))
  else
    ERROR=$(echo "$RESPONSE" | jq -r '.error // "Unknown error"')
    echo -e "  ${RED}❌ Failed: $ERROR${NC}"
    FAILED=$((FAILED + 1))
  fi
done

echo ""
echo "=============================================================="
echo "📊 Import Summary"
echo "=============================================================="
echo -e "Imported: ${GREEN}$IMPORTED${NC}"
echo -e "Failed: ${RED}$FAILED${NC}"

if [ $FAILED -eq 0 ]; then
  echo -e "\n${GREEN}✅ All rules imported successfully!${NC}"
  echo ""
  echo "Next steps:"
  echo "1. Run bulk remap: curl -X POST -H \"Authorization: Bearer \$TOKEN\" \\"
  echo "   -H \"Content-Type: application/json\" \\"
  echo "   -d '{\"start_date\": \"$(date -v-60d +%Y-%m-%d)\", \"end_date\": \"$(date +%Y-%m-%d)\"}' \\"
  echo "   ${BASE_URL}/api/finance/enforcement/bulk/remap"
  echo ""
  echo "2. Check dashboard: curl -H \"Authorization: Bearer \$TOKEN\" \\"
  echo "   ${BASE_URL}/api/finance/enforcement/dashboard"
  exit 0
else
  echo -e "\n${YELLOW}⚠️  Some rules failed to import${NC}"
  exit 1
fi
