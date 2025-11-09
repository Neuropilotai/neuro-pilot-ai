#!/bin/bash
# Canva Render Service - cURL Test Suite
# Test all endpoints with realistic data

set -e

BASE_URL="${CANVA_ENDPOINT:-http://localhost:3001}"
DESIGN_ID="${CANVA_TEMPLATE_ID:-DAGabcdefgh}"

echo "🧪 Testing Canva Render Service"
echo "================================"
echo "Base URL: $BASE_URL"
echo ""

# Test 1: Health Check
echo "Test 1: Health Check"
echo "--------------------"
curl -X GET "$BASE_URL/health" \
  -H "Content-Type: application/json" \
  -w "\nHTTP Status: %{http_code}\n" \
  -s | jq '.'
echo ""

# Test 2: Autofill Only (No Export)
echo "Test 2: Autofill Template"
echo "-------------------------"
curl -X POST "$BASE_URL/autofill" \
  -H "Content-Type: application/json" \
  -w "\nHTTP Status: %{http_code}\n" \
  -d '{
    "design_id": "'"$DESIGN_ID"'",
    "data": {
      "hook_text": "AI is eating the world",
      "insight_text": "90% of Fortune 500 will use autonomous agents by 2026. Your move determines survival or extinction.",
      "cta_text": "Build your AI today",
      "agent_name": "Lyra",
      "brand_primary": "#0B1220",
      "brand_accent": "#0EA5E9",
      "brand_light": "#F8FAFC"
    }
  }' \
  -s | jq '.'
echo ""

# Test 3: Autofill + Export (Async)
echo "Test 3: Autofill + Export (Async)"
echo "----------------------------------"
EXPORT_RESPONSE=$(curl -X POST "$BASE_URL/autofill" \
  -H "Content-Type: application/json" \
  -d '{
    "design_id": "'"$DESIGN_ID"'",
    "data": {
      "hook_text": "Your competitors are already AI-powered",
      "insight_text": "Companies using AI automation grow 3.5x faster. Every day you wait is market share lost forever.",
      "cta_text": "Start your AI transformation",
      "agent_name": "Atlas",
      "voice_url": "https://drive.google.com/file/d/abc123/view",
      "brand_primary": "#0B1220",
      "brand_accent": "#0EA5E9",
      "brand_light": "#F8FAFC"
    },
    "export": {
      "format": "mp4",
      "quality": "1080p",
      "fps": 30
    }
  }' \
  -s)

echo "$EXPORT_RESPONSE" | jq '.'
JOB_ID=$(echo "$EXPORT_RESPONSE" | jq -r '.job.id')
echo ""

# Test 4: Check Export Status
if [ "$JOB_ID" != "null" ] && [ -n "$JOB_ID" ]; then
  echo "Test 4: Check Export Status"
  echo "----------------------------"
  echo "Job ID: $JOB_ID"

  sleep 5  # Wait a bit for processing

  curl -X GET "$BASE_URL/export/$JOB_ID" \
    -H "Content-Type: application/json" \
    -w "\nHTTP Status: %{http_code}\n" \
    -s | jq '.'
  echo ""
fi

# Test 5: Full Render (Synchronous - Autofill + Export + Wait)
echo "Test 5: Full Render Pipeline (Synchronous)"
echo "-------------------------------------------"
echo "⚠️  This may take 30-60 seconds..."
curl -X POST "$BASE_URL/render" \
  -H "Content-Type: application/json" \
  -m 120 \
  -w "\nHTTP Status: %{http_code}\n" \
  -d '{
    "design_id": "'"$DESIGN_ID"'",
    "data": {
      "hook_text": "Stop building features. Start building systems.",
      "insight_text": "The best teams automate 80% of operations. Manual work is technical debt disguised as productivity.",
      "cta_text": "Automate everything now",
      "agent_name": "Nova",
      "voice_url": "https://drive.google.com/file/d/xyz789/view",
      "brand_primary": "#0B1220",
      "brand_accent": "#0EA5E9",
      "brand_light": "#F8FAFC"
    },
    "export": {
      "format": "mp4",
      "quality": "1080p",
      "fps": 30
    }
  }' \
  -s | jq '.'
echo ""

echo "✅ All tests completed"
echo ""
echo "Next Steps:"
echo "1. Check that all endpoints returned 200 status"
echo "2. Verify job IDs are valid"
echo "3. Download sample video from returned URL"
echo "4. Integrate with Make.com workflow"
