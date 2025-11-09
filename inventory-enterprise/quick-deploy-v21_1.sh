#!/bin/bash
# Neuro.Pilot.AI V21.1 - Quick Deployment Script
# Simplified single-command deployment for Terminal.app

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🚀 V21.1 Quick Deploy"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Step 1: Navigate to backend directory
echo -e "${BLUE}[1/4]${NC} Fetching DATABASE_URL from Railway..."
cd backend

# Step 2: Fetch DATABASE_URL
if ! command -v railway &> /dev/null; then
    echo -e "${RED}✗ ERROR:${NC} Railway CLI not found"
    echo "  Install: curl -fsSL https://railway.app/install.sh | sh"
    exit 1
fi

export DATABASE_URL=$(railway variables get DATABASE_URL 2>&1)

if [ -z "$DATABASE_URL" ] || [[ "$DATABASE_URL" == *"error"* ]] || [[ "$DATABASE_URL" == *"Error"* ]]; then
    echo -e "${RED}✗ ERROR:${NC} Failed to fetch DATABASE_URL"
    echo ""
    echo "Please run these commands manually:"
    echo -e "${YELLOW}  cd backend${NC}"
    echo -e "${YELLOW}  railway login${NC}"
    echo -e "${YELLOW}  railway link${NC}"
    echo -e "${YELLOW}  export DATABASE_URL=\$(railway variables get DATABASE_URL)${NC}"
    echo -e "${YELLOW}  cd ..${NC}"
    echo -e "${YELLOW}  ./DEPLOY_V21_1_NOW.sh${NC}"
    exit 1
fi

echo -e "${GREEN}✓${NC} DATABASE_URL fetched successfully"

# Step 3: Return to root and run full deployment
cd ..
echo ""
echo -e "${BLUE}[2/4]${NC} Running full deployment script..."
echo "  (This will take 5-8 minutes)"
echo ""

./DEPLOY_V21_1_NOW.sh

# Step 4: Run smoke tests
echo ""
echo -e "${BLUE}[3/4]${NC} Deployment complete. Running smoke tests..."
echo ""

export BASE="https://inventory-backend-7-agent-build.up.railway.app"
export EMAIL="owner@neuropilot.ai"

if [ -z "$NEUROPILOT_PASSWORD" ]; then
    echo -e "${YELLOW}Enter password for owner@neuropilot.ai:${NC}"
    read -s PASS
    export PASS
else
    export PASS="$NEUROPILOT_PASSWORD"
fi

./backend/scripts/smoke-test-v21_1.sh

echo ""
echo -e "${BLUE}[4/4]${NC} Verification complete!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "  ${GREEN}✅ V21.1 Deployment Successful!${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Next steps:"
echo "  • Review smoke test results above"
echo "  • Check metrics: curl $BASE/metrics | grep _total"
echo "  • Enable cron jobs: railway variables set SCHEDULER_ENABLED=true"
echo ""
