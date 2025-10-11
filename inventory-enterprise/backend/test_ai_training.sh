#!/bin/bash

# Test AI Training Functionality
# This script tests the complete training workflow

API_BASE="http://127.0.0.1:8083/api"
TOKEN="${1:-}"

if [ -z "$TOKEN" ]; then
  echo "Usage: $0 <auth-token>"
  echo "Get token from localStorage after logging into owner console"
  exit 1
fi

echo "=== Testing AI Training Functionality ==="
echo ""

echo "1. Submitting test feedback comment..."
COMMENT_RESPONSE=$(curl -s -X POST "$API_BASE/owner/forecast/comment" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"comment": "coffee 1.5 cups per person", "source": "test_script"}')

echo "$COMMENT_RESPONSE" | jq '.'
echo ""

echo "2. Checking pending comments..."
PENDING=$(curl -s "$API_BASE/owner/forecast/comments?applied=false&limit=10" \
  -H "Authorization: Bearer $TOKEN")

echo "$PENDING" | jq '.comments[] | {comment_id, comment_text, parsed_intent, applied}'
echo ""

echo "3. Applying training (this updates beverage profile)..."
TRAIN_RESPONSE=$(curl -s -X POST "$API_BASE/owner/forecast/train" \
  -H "Authorization: Bearer $TOKEN")

echo "$TRAIN_RESPONSE" | jq '.'
echo ""

echo "4. Checking applied comments..."
APPLIED=$(curl -s "$API_BASE/owner/forecast/comments?applied=true&limit=5" \
  -H "Authorization: Bearer $TOKEN")

echo "$APPLIED" | jq '.comments[] | {comment_id, comment_text, applied_at}'
echo ""

echo "5. Verifying beverage profile was updated..."
BEVERAGE=$(curl -s "$API_BASE/owner/forecast/beverage" \
  -H "Authorization: Bearer $TOKEN")

echo "$BEVERAGE" | jq '{success, population, coffee_cups_per_person, creamer_cups_per_person}'
echo ""

echo "=== AI Training Test Complete ==="
