#!/bin/bash
# deploy-now.sh
# Local staging deployment for NeuroPilot v16.6
# Tests locally before Railway deployment

set -e

echo "==========================================="
echo "🧪 NeuroPilot Local Staging v16.6"
echo "==========================================="
echo ""

# Check if server is already running
if lsof -Pi :8083 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "⚠️  Server already running on port 8083"
    read -p "Kill existing server? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Stopping existing server..."
        pkill -f "node server.js" || true
        sleep 2
    else
        echo "Cancelled"
        exit 0
    fi
fi

echo ""
echo "==========================================="
echo "📋 Step 1: Environment Check"
echo "==========================================="
echo ""

# Check .env file
if [ ! -f ".env" ]; then
    echo "⚠️  .env file not found, creating from .env.example..."
    cp .env.example .env
    echo "✅ .env created - please configure JWT secrets"
fi

# Check secrets
if [ ! -f ".jwt_secret" ] || [ ! -f ".refresh_secret" ]; then
    echo "⚠️  Production secrets not found"
    read -p "Generate secrets now? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        ./scripts/generate_production_secrets.sh
    fi
fi

# Verify database
if [ ! -f "data/enterprise_inventory.db" ]; then
    echo "⚠️  Database not found, creating..."
    mkdir -p data

    echo "Running SQLite migrations..."
    sqlite3 data/enterprise_inventory.db < migrations/004_auth_sqlite.sql
    echo "✅ Database created"
fi

# Create test user if needed
USER_COUNT=$(sqlite3 data/enterprise_inventory.db "SELECT COUNT(*) FROM app_user" 2>&1)
if [ "$USER_COUNT" = "0" ]; then
    echo ""
    echo "⚠️  No users found"
    read -p "Create test user? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        node create_test_user.js
    fi
fi

echo ""
echo "==========================================="
echo "🚀 Step 2: Start Server"
echo "==========================================="
echo ""

# Export environment variables
export AIOPS_ENABLED=true
export GOVERNANCE_ENABLED=true
export INSIGHT_ENABLED=true
export COMPLIANCE_ENABLED=true
export NODE_ENV=development

echo "Starting server on port 8083..."
echo ""

# Start server in background
node server.js > server.log 2>&1 &
SERVER_PID=$!

echo "Server PID: $SERVER_PID"
echo "Logs: tail -f server.log"
echo ""

# Wait for server to start
echo "Waiting for server to start (10 seconds)..."
sleep 10

# Check if server is running
if ! ps -p $SERVER_PID > /dev/null; then
    echo "❌ Server failed to start"
    echo ""
    echo "Last 20 lines of log:"
    tail -20 server.log
    exit 1
fi

echo "✅ Server started successfully"

echo ""
echo "==========================================="
echo "🧪 Step 3: Verification Tests"
echo "==========================================="
echo ""

# Test 1: Health check
echo "Test 1: Health Check"
echo "--------------------"

HEALTH_RESPONSE=$(curl -s http://localhost:8083/health 2>&1)

if echo "$HEALTH_RESPONSE" | grep -q '"status":"ok"'; then
    echo "✅ Health check passed"

    if command -v jq &> /dev/null; then
        echo "$HEALTH_RESPONSE" | jq -r '"Version: \(.version), Database: \(.infrastructure.database)"'
    fi
else
    echo "❌ Health check failed"
    echo "$HEALTH_RESPONSE"
    kill $SERVER_PID
    exit 1
fi

echo ""

# Test 2: Auth endpoints
echo "Test 2: Auth Endpoints"
echo "----------------------"

if [ -f "scripts/verify_auth_endpoints.sh" ]; then
    ./scripts/verify_auth_endpoints.sh 2>&1 | tail -15
else
    echo "⚠️  Verification script not found"
fi

echo ""
echo "==========================================="
echo "✅ Local Staging Ready!"
echo "==========================================="
echo ""
echo "Server: http://localhost:8083"
echo "Health: http://localhost:8083/health"
echo "PID: $SERVER_PID"
echo ""
echo "Useful commands:"
echo "  - View logs:   tail -f server.log"
echo "  - Stop server: kill $SERVER_PID"
echo "  - Full test:   ./scripts/verify_auth_endpoints.sh"
echo ""
echo "Frontend integration:"
echo "  1. cd ../frontend"
echo "  2. npm run dev"
echo "  3. Open http://localhost:5173"
echo ""
echo "When ready for Railway deployment:"
echo "  ./scripts/stage-deploy.sh"
echo ""
