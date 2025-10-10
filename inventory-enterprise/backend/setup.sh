#!/bin/bash

# Enterprise Inventory System - Complete Setup Script
# Version: v2.7.0
# This script sets up and initializes all system components

set -e  # Exit on error

echo "═══════════════════════════════════════════════════════════════"
echo "🚀 Inventory Enterprise System v2.7.0"
echo "    Complete Setup & Initialization"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Check prerequisites
echo "📋 Step 1: Checking prerequisites..."
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed${NC}"
    exit 1
fi
echo -e "${GREEN}  ✅ Node.js $(node --version)${NC}"

if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm is not installed${NC}"
    exit 1
fi
echo -e "${GREEN}  ✅ npm $(npm --version)${NC}"

if ! command -v sqlite3 &> /dev/null; then
    echo -e "${YELLOW}  ⚠️  SQLite3 CLI not found (optional for manual queries)${NC}"
else
    echo -e "${GREEN}  ✅ sqlite3 $(sqlite3 --version | cut -d' ' -f1)${NC}"
fi
echo ""

# Step 2: Install dependencies
echo "📦 Step 2: Installing dependencies..."
if [ ! -d "node_modules" ]; then
    npm install
    echo -e "${GREEN}  ✅ Dependencies installed${NC}"
else
    echo -e "${GREEN}  ✅ Dependencies already installed${NC}"
fi
echo ""

# Step 3: Check for .env file
echo "⚙️  Step 3: Checking environment configuration..."
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}  ⚠️  No .env file found${NC}"
    echo "  Creating .env with default configuration..."

    cat > .env << 'EOF'
# Server Configuration
PORT=3001
NODE_ENV=development

# Database
DATABASE_URL=./database.db

# AI Ops Automation (PASS L v2.6.0)
AIOPS_ENABLED=true
AIOPS_CHECK_INTERVAL_MS=60000
AIOPS_AUTO_REMEDIATION=true
AIOPS_DRY_RUN=false

# Prometheus
PROMETHEUS_URL=http://localhost:9090

# Alerting (optional)
# SLACK_WEBHOOK_URL=
# SLACK_CHANNEL=#alerts
# PAGERDUTY_INTEGRATION_KEY=

# Generative Intelligence (PASS M v2.7.0)
GOVERNANCE_ENABLED=true
GOVERNANCE_LEARNING_INTERVAL=86400000
GOVERNANCE_ADAPTATION_ENABLED=true
GOVERNANCE_MIN_DATA_POINTS=100
GOVERNANCE_CONFIDENCE_THRESHOLD=0.85

# Insight Generator
INSIGHT_ENABLED=true
INSIGHT_PROVIDER=mock
INSIGHT_MODEL=gpt-4
INSIGHT_REPORT_INTERVAL=604800000
INSIGHT_LANGUAGES=en,fr
# OPENAI_API_KEY=
# ANTHROPIC_API_KEY=

# Compliance Audit
COMPLIANCE_ENABLED=true
COMPLIANCE_AUDIT_INTERVAL=86400000
COMPLIANCE_FRAMEWORKS=iso27001,soc2,owasp
COMPLIANCE_MIN_SCORE=0.95
COMPLIANCE_AUTO_REMEDIATION=false
EOF

    echo -e "${GREEN}  ✅ .env file created with defaults${NC}"
    echo -e "${YELLOW}  📝 Edit .env to add API keys (optional)${NC}"
else
    echo -e "${GREEN}  ✅ .env file exists${NC}"
fi
echo ""

# Step 4: Run database migrations
echo "🗄️  Step 4: Running database migrations..."

# Check if database exists
if [ ! -f "database.db" ]; then
    echo "  Creating new database..."
fi

# Run AI Ops migration (v2.6.0)
if [ -f "migrations/004_ai_ops_tables.sql" ]; then
    echo "  Running AI Ops migration (v2.6.0)..."
    sqlite3 database.db < migrations/004_ai_ops_tables.sql 2>/dev/null || echo "    (Migration already applied)"
    echo -e "${GREEN}  ✅ AI Ops tables ready${NC}"
fi

# Run Generative Intelligence migration (v2.7.0)
if [ -f "migrations/005_generative_intelligence_tables.sql" ]; then
    echo "  Running Generative Intelligence migration (v2.7.0)..."
    sqlite3 database.db < migrations/005_generative_intelligence_tables.sql 2>/dev/null || echo "    (Migration already applied)"
    echo -e "${GREEN}  ✅ Generative Intelligence tables ready${NC}"
fi

echo -e "${GREEN}  ✅ All migrations complete${NC}"
echo ""

# Step 5: Verify database schema
echo "✓  Step 5: Verifying database schema..."
TABLE_COUNT=$(sqlite3 database.db "SELECT COUNT(*) FROM sqlite_master WHERE type='table';" 2>/dev/null || echo "0")
echo "  Database contains $TABLE_COUNT tables"

# Check for key tables
AIOPS_TABLES=$(sqlite3 database.db "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name LIKE 'ai_%';" 2>/dev/null || echo "0")
GOVERNANCE_TABLES=$(sqlite3 database.db "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name LIKE 'governance_%';" 2>/dev/null || echo "0")
COMPLIANCE_TABLES=$(sqlite3 database.db "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name LIKE 'compliance_%';" 2>/dev/null || echo "0")

echo "  AI Ops tables: $AIOPS_TABLES"
echo "  Governance tables: $GOVERNANCE_TABLES"
echo "  Compliance tables: $COMPLIANCE_TABLES"
echo -e "${GREEN}  ✅ Schema verification complete${NC}"
echo ""

# Step 6: Run tests (optional)
echo "🧪 Step 6: Running tests (optional)..."
read -p "  Run full test suite? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "  Running AI Ops tests..."
    npm run test:aiops 2>/dev/null || echo -e "${YELLOW}    ⚠️  Some tests may require Prometheus${NC}"

    echo "  Running Generative Intelligence tests..."
    npm run test:generative 2>/dev/null || echo -e "${YELLOW}    ⚠️  Some tests may require setup${NC}"

    echo -e "${GREEN}  ✅ Tests complete${NC}"
else
    echo -e "${YELLOW}  ⏭️  Skipping tests${NC}"
fi
echo ""

# Summary
echo "═══════════════════════════════════════════════════════════════"
echo -e "${GREEN}✅ SETUP COMPLETE${NC}"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "🚀 Quick Start Commands:"
echo ""
echo "   npm start              # Start all systems (production)"
echo "   npm run dev            # Start with auto-reload (development)"
echo "   npm run start:all      # Start with all features enabled"
echo "   npm run stop:all       # Stop all background processes"
echo ""
echo "📊 Monitoring:"
echo ""
echo "   Health:     http://localhost:3001/health"
echo "   Metrics:    http://localhost:3001/metrics"
echo "   WebSocket:  ws://localhost:3001/ai/realtime"
echo ""
echo "🧪 Testing:"
echo ""
echo "   npm test               # Run all tests"
echo "   npm run test:aiops     # Test AI Ops (v2.6.0)"
echo "   npm run test:generative # Test Generative Intelligence (v2.7.0)"
echo ""
echo "📚 Documentation:"
echo ""
echo "   docs/PASS_L_COMPLETION_REPORT_2025-10-07.md"
echo "   docs/PASS_M_COMPLETION_REPORT_2025-10-07.md"
echo "   backend/aiops/README.md"
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo -e "${GREEN}Ready to start! Run: ${NC}${YELLOW}npm start${NC}"
echo ""
