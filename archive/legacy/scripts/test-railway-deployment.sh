#!/bin/bash

# Comprehensive test script for Neuro.Pilot.AI Railway deployment

echo "🧪 TESTING NEURO.PILOT.AI RAILWAY DEPLOYMENT"
echo "==========================================="
echo ""

BASE_URL="https://resourceful-achievement-production.up.railway.app"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to test endpoint
test_endpoint() {
    local name=$1
    local url=$2
    local method=${3:-GET}
    local data=$4
    
    echo -n "Testing $name... "
    
    if [ "$method" == "POST" ]; then
        if [ -n "$data" ]; then
            response=$(curl -s -X POST "$url" -H "Content-Type: application/json" -d "$data" -w "\n%{http_code}")
        else
            response=$(curl -s -X POST "$url" -H "Content-Type: application/json" -w "\n%{http_code}")
        fi
    else
        response=$(curl -s "$url" -w "\n%{http_code}")
    fi
    
    http_code=$(echo "$response" | tail -n 1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" == "200" ]; then
        echo -e "${GREEN}✅ PASS${NC} (HTTP $http_code)"
        echo "Response: $body" | head -3
    else
        echo -e "${RED}❌ FAIL${NC} (HTTP $http_code)"
        echo "Response: $body" | head -3
    fi
    echo ""
}

# Function to test JSON endpoint
test_json_endpoint() {
    local name=$1
    local url=$2
    local expected_field=$3
    
    echo -n "Testing $name... "
    
    response=$(curl -s "$url")
    
    if echo "$response" | jq -e ".$expected_field" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ PASS${NC}"
        echo "$response" | jq '.' | head -10
    else
        echo -e "${RED}❌ FAIL${NC}"
        echo "Response: $response" | head -3
    fi
    echo ""
}

echo "🌐 BASE URL: $BASE_URL"
echo ""

echo "=== 1. SYSTEM HEALTH CHECKS ==="
test_json_endpoint "Health Check" "$BASE_URL/api/health" "status"

echo "=== 2. HOMEPAGE TEST ==="
test_endpoint "Homepage" "$BASE_URL"

echo "=== 3. EMAIL SYSTEM TEST ==="
test_endpoint "Email System Test" "$BASE_URL/api/test-email" "POST"

echo "=== 4. ORDER PROCESSING TEST ==="
ORDER_DATA='{
  "firstName": "Test",
  "lastName": "Deployment",
  "email": "test@railway.app",
  "packageType": "professional",
  "finalPrice": 0,
  "promoCode": "RAILWAY2024",
  "phone": "+1-555-0123",
  "targetIndustry": "Technology",
  "skills": "Cloud Computing, Railway Deployment, AI Integration"
}'

echo "Creating test order..."
ORDER_RESPONSE=$(curl -s -X POST "$BASE_URL/api/resume/generate" \
  -H "Content-Type: application/json" \
  -d "$ORDER_DATA")

echo "$ORDER_RESPONSE" | jq '.' 2>/dev/null || echo "$ORDER_RESPONSE"

# Extract order ID
ORDER_ID=$(echo "$ORDER_RESPONSE" | jq -r '.orderId' 2>/dev/null)

if [ -n "$ORDER_ID" ] && [ "$ORDER_ID" != "null" ]; then
    echo -e "${GREEN}✅ Order created: $ORDER_ID${NC}"
    echo ""
    
    # Check order status
    echo "Checking order status..."
    test_json_endpoint "Order Status" "$BASE_URL/api/order/$ORDER_ID" "orderId"
else
    echo -e "${RED}❌ Failed to create order${NC}"
fi

echo "=== 5. AGENT SYSTEM TEST ==="
test_endpoint "Agent Status" "$BASE_URL/api/agents/status"

echo "=== 6. CONFIRMATION PAGE TEST ==="
if [ -n "$ORDER_ID" ]; then
    test_endpoint "Order Confirmation Page" "$BASE_URL/order-confirmation?order_id=$ORDER_ID&package=professional&price=0&promo=true"
fi

echo "=== 7. OPENAI API TEST ==="
# This will test if OpenAI is configured by checking the order processing
if [ -n "$ORDER_ID" ]; then
    echo "Waiting 35 seconds for AI processing..."
    sleep 35
    echo "Checking if order was processed by AI agents..."
    PROCESSED_ORDER=$(curl -s "$BASE_URL/api/order/$ORDER_ID")
    STATUS=$(echo "$PROCESSED_ORDER" | jq -r '.status' 2>/dev/null)
    
    if [ "$STATUS" == "completed" ] || [ "$STATUS" == "processing" ]; then
        echo -e "${GREEN}✅ AI agents are processing orders${NC}"
    else
        echo -e "${YELLOW}⚠️  Order still in status: $STATUS${NC}"
    fi
fi

echo ""
echo "=== DEPLOYMENT SUMMARY ==="
echo "========================="

# Check all critical systems
HEALTH_OK=$(curl -s "$BASE_URL/api/health" | jq -r '.status' 2>/dev/null)
EMAIL_OK=$(curl -s "$BASE_URL/api/health" | jq -r '.features.emailSystem' 2>/dev/null)
STRIPE_OK=$(curl -s "$BASE_URL/api/health" | jq -r '.features.stripe' 2>/dev/null)
AI_OK=$(curl -s "$BASE_URL/api/health" | jq -r '.features.aiAgents' 2>/dev/null)

echo -e "System Health: $([ "$HEALTH_OK" == "ok" ] && echo "${GREEN}✅ OPERATIONAL${NC}" || echo "${RED}❌ ISSUES${NC}")"
echo -e "Email System: $([ "$EMAIL_OK" == "true" ] && echo "${GREEN}✅ CONFIGURED${NC}" || echo "${YELLOW}⚠️  NOT CONFIGURED${NC}")"
echo -e "Stripe Payments: $([ "$STRIPE_OK" == "true" ] && echo "${GREEN}✅ CONFIGURED${NC}" || echo "${YELLOW}⚠️  NOT CONFIGURED${NC}")"
echo -e "AI Agents: $([ "$AI_OK" == "true" ] && echo "${GREEN}✅ ACTIVE${NC}" || echo "${RED}❌ INACTIVE${NC}")"

echo ""
echo "🔗 Live URL: $BASE_URL"
echo "📊 Dashboard: $BASE_URL/api/health"
echo ""

# Check email specifically
EMAIL_TEST=$(curl -s -X POST "$BASE_URL/api/test-email" -H "Content-Type: application/json" -d '{}')
if echo "$EMAIL_TEST" | grep -q "smtp_verified"; then
    echo -e "${GREEN}✅ Email system is fully configured and working!${NC}"
else
    echo -e "${YELLOW}⚠️  Email system needs configuration:${NC}"
    echo "   - Check SMTP_USER and SMTP_PASS in Railway variables"
    echo "   - Make sure Gmail app password is correct"
fi

echo ""
echo "✨ Test complete!"