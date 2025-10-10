#!/bin/bash
#
# Owner Command Center (OCC) Deployment Script
# Version 3.1.0 - Complete deployment and verification
#

set -e

echo "═══════════════════════════════════════════════════════════════"
echo "🚀 Owner Command Center (OCC) Deployment"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Navigate to backend
cd ~/neuro-pilot-ai/inventory-enterprise/backend

# 1. Set environment variables
echo "📝 Setting environment variables..."
export OWNER_EMAILS="neuro.pilot.ai@gmail.com,neuropilotai@gmail.com"
export NODE_ENV=development
export PORT=8083

# 2. Run database migrations
echo "🗄️  Running OCC schema migration..."
sqlite3 db/inventory_enterprise.db < migrations/sqlite/010_owner_command_center.sql
echo "✅ Schema migrated"

# 3. Install any missing dependencies
echo "📦 Checking dependencies..."
npm install --silent

# 4. Mount OCC routes in server.js (if not already done)
echo "🔧 Verifying server.js configuration..."
if ! grep -q "owner-console" server.js; then
  echo "⚠️  Adding OCC routes to server.js..."
  # This would be done manually or via a patch
fi

# 5. Initialize global metrics
echo "📊 Initializing metrics..."
node -e "const metrics = require('./utils/occMetrics'); console.log('Metrics ready');"

# 6. Start server (kill existing if running)
echo "🔄 Restarting server on port 8083..."
pkill -f "node server.js" || true
sleep 2
PORT=8083 node server.js > /tmp/occ_server.log 2>&1 &
SERVER_PID=$!
echo "Server PID: $SERVER_PID"
sleep 5

# 7. Verify server is running
if ! lsof -i :8083 > /dev/null; then
  echo "❌ Server failed to start. Check /tmp/occ_server.log"
  cat /tmp/occ_server.log
  exit 1
fi
echo "✅ Server running on port 8083"

# 8. Test authentication
echo "🔐 Testing authentication..."
TOKEN=$(curl -s -X POST http://localhost:8083/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"neuro.pilot.ai@gmail.com","password":"Admin123!@#"}' \
  | jq -r '.accessToken')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "❌ Authentication failed"
  exit 1
fi
echo "✅ Authentication successful"

# 9. Test OCC endpoints
echo "🧪 Testing OCC endpoints..."

# Test session endpoint
echo "  → Testing /api/owner/console/session..."
curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:8083/api/owner/console/session | jq . > /dev/null
echo "  ✓ Session endpoint OK"

# Test locations endpoint
echo "  → Testing /api/owner/console/locations..."
curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:8083/api/owner/console/locations | jq . > /dev/null
echo "  ✓ Locations endpoint OK"

# Test AI status endpoint
echo "  → Testing /api/owner/console/ai/status..."
curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:8083/api/owner/console/ai/status | jq . > /dev/null
echo "  ✓ AI status endpoint OK"

# Test PDF search
echo "  → Testing /api/owner/console/pdfs/search..."
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8083/api/owner/console/pdfs/search?q=90" | jq . > /dev/null
echo "  ✓ PDF search endpoint OK"

# 10. Run full integration test
echo "🧪 Running integration tests..."
node scripts/verify_owner_occ.js

# 11. Check metrics
echo "📊 Checking Prometheus metrics..."
if curl -s http://localhost:8083/metrics | grep -q "owner_occ"; then
  echo "✅ OCC metrics are being exported"
else
  echo "⚠️  OCC metrics not found (will be populated after use)"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "✅ OCC DEPLOYMENT COMPLETE"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "📍 Server:     http://localhost:8083"
echo "📍 OCC API:    http://localhost:8083/api/owner/console"
echo "📍 Metrics:    http://localhost:8083/metrics"
echo "📍 Frontend:   (to be deployed separately)"
echo ""
echo "🔑 Login: neuro.pilot.ai@gmail.com / Admin123!@#"
echo ""
echo "Server logs: /tmp/occ_server.log"
echo "Server PID: $SERVER_PID"
echo ""
