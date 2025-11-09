#!/bin/bash
# Test Canva API Integration

set -e

echo "🎨 Testing Canva Integration"
echo "============================"
echo ""

# Load .env
if [ -f ".env" ]; then
    export $(grep -v '^#' .env | xargs 2>/dev/null)
fi

# Check required vars
if [ -z "$CANVA_ACCESS_TOKEN" ]; then
    echo "❌ CANVA_ACCESS_TOKEN not set in .env"
    echo "Run: node canva-oauth.js to get token"
    exit 1
fi

if [ -z "$CANVA_TEMPLATE_ID" ]; then
    echo "❌ CANVA_TEMPLATE_ID not set in .env"
    echo "Create template in Canva and add ID to .env"
    exit 1
fi

echo "✓ Access token found"
echo "✓ Template ID: $CANVA_TEMPLATE_ID"
echo ""

echo "Testing Canva API access..."
echo ""

# Test API access
RESPONSE=$(curl -s -X GET "https://api.canva.com/rest/v1/designs/${CANVA_TEMPLATE_ID}" \
  -H "Authorization: Bearer ${CANVA_ACCESS_TOKEN}" \
  2>/dev/null || echo '{"error":"failed"}')

if echo "$RESPONSE" | jq -e '.id' >/dev/null 2>&1; then
    echo "✅ SUCCESS! Canva API is working"
    echo ""
    echo "Design Details:"
    echo "$RESPONSE" | jq '{id, title, created_at, updated_at}' 2>/dev/null || echo "$RESPONSE"
    echo ""
    echo "🎬 Ready to render videos!"
else
    echo "❌ API test failed"
    echo ""
    echo "Response:"
    echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
    echo ""
    echo "Possible issues:"
    echo "  - Access token expired (regenerate)"
    echo "  - Template ID incorrect"
    echo "  - Design not shared with app"
fi

echo ""
echo "Next steps:"
echo "  1. Start render service: npm run dev"
echo "  2. Test render endpoint: ./canva-render-service-test.sh"
