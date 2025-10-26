#!/bin/bash

# Get auth token
LOGIN_RESPONSE=$(curl -s -X POST 'http://127.0.0.1:8083/api/auth/login' \
  -H 'Content-Type: application/json' \
  -d '{"email":"neuropilotai@gmail.com","password":"Admin123!@#"}')

# Extract token using grep
TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)

echo "Token: ${TOKEN:0:20}..."
echo ""

# Test financial summary endpoint
echo "Testing financial-summary endpoint..."
curl -s "http://127.0.0.1:8083/api/inventory/reconcile/financial-summary?startDate=2025-01-01&endDate=2025-01-31" \
  -H "Authorization: Bearer ${TOKEN}" | head -c 500
echo ""
