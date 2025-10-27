#!/bin/bash
# ========================================
# PHASE I: FRONTEND DEPLOYMENT TO VERCEL
# ========================================
# NeuroPilot v17.7 - Galactic Deployment Commander
# Mission: Deploy frontend and establish CORS link

set -e

echo "🚀 PHASE I: FRONTEND DEPLOYMENT INITIATED"
echo "========================================"
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BACKEND_URL="https://resourceful-achievement-production.up.railway.app"
FRONTEND_DIR="/Users/davidmikulis/neuro-pilot-ai/inventory-enterprise/frontend"
REPO="Neuropilotai/neuro-pilot-ai"

echo -e "${BLUE}📋 Deployment Configuration:${NC}"
echo "  Backend URL:    $BACKEND_URL"
echo "  Frontend Path:  inventory-enterprise/frontend"
echo "  Repository:     $REPO"
echo "  Branch:         fix/broken-links-guard-v15"
echo ""

# ========================================
# STEP 1: Verify Prerequisites
# ========================================
echo -e "${YELLOW}STEP 1: Verifying Prerequisites...${NC}"
echo ""

# Check if we're in the right directory
cd "$FRONTEND_DIR"
echo "✅ Frontend directory located"

# Check vercel.json exists
if [ -f "vercel.json" ]; then
    echo "✅ vercel.json configuration found"
else
    echo -e "${RED}❌ vercel.json not found!${NC}"
    exit 1
fi

# Check if Vercel CLI is installed
if command -v vercel &> /dev/null; then
    echo "✅ Vercel CLI installed ($(vercel --version))"
else
    echo -e "${RED}❌ Vercel CLI not installed${NC}"
    echo "Installing Vercel CLI..."
    npm install -g vercel
fi

echo ""

# ========================================
# STEP 2: Vercel Authentication
# ========================================
echo -e "${YELLOW}STEP 2: Vercel Authentication${NC}"
echo ""
echo "Checking Vercel authentication status..."

if vercel whoami &> /dev/null; then
    VERCEL_USER=$(vercel whoami)
    echo -e "${GREEN}✅ Already authenticated as: $VERCEL_USER${NC}"
else
    echo -e "${YELLOW}⚠️  Not authenticated. Please login...${NC}"
    echo ""
    echo "A browser window will open for authentication."
    echo "Follow the prompts to authorize Vercel CLI."
    echo ""
    read -p "Press ENTER to continue..."

    vercel login

    if vercel whoami &> /dev/null; then
        VERCEL_USER=$(vercel whoami)
        echo -e "${GREEN}✅ Successfully authenticated as: $VERCEL_USER${NC}"
    else
        echo -e "${RED}❌ Authentication failed${NC}"
        exit 1
    fi
fi

echo ""

# ========================================
# STEP 3: Deploy to Vercel
# ========================================
echo -e "${YELLOW}STEP 3: Deploying to Vercel Production${NC}"
echo ""
echo "Deployment will proceed with:"
echo "  - Project name: neuropilot-inventory"
echo "  - Framework: Other (static)"
echo "  - Root directory: inventory-enterprise/frontend"
echo "  - Environment: Production"
echo ""
read -p "Press ENTER to deploy..."

# Deploy to production
echo ""
echo "🚀 Initiating deployment..."
echo ""

vercel --prod \
  --name neuropilot-inventory \
  --yes \
  2>&1 | tee /tmp/vercel_deploy.log

# Extract deployment URL from output
DEPLOYMENT_URL=$(grep -o 'https://[^[:space:]]*\.vercel\.app' /tmp/vercel_deploy.log | head -1)

if [ -z "$DEPLOYMENT_URL" ]; then
    echo -e "${YELLOW}⚠️  Could not auto-detect deployment URL${NC}"
    echo ""
    read -p "Please enter your Vercel deployment URL: " DEPLOYMENT_URL
fi

echo ""
echo -e "${GREEN}✅ DEPLOYMENT COMPLETE!${NC}"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}Frontend URL: $DEPLOYMENT_URL${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Save URL for later use
echo "$DEPLOYMENT_URL" > /tmp/neuropilot_frontend_url.txt

# ========================================
# STEP 4: Configure Environment Variables
# ========================================
echo -e "${YELLOW}STEP 4: Configuring Environment Variables${NC}"
echo ""
echo "Setting API_URL environment variable..."
echo ""

# Set API_URL in Vercel
echo "$BACKEND_URL" | vercel env add API_URL production

echo -e "${GREEN}✅ API_URL configured: $BACKEND_URL${NC}"
echo ""

# Redeploy to apply environment variable
echo "Redeploying to apply environment variables..."
vercel --prod --force --yes

echo -e "${GREEN}✅ Environment variables applied${NC}"
echo ""

# ========================================
# STEP 5: Configure Backend CORS
# ========================================
echo -e "${YELLOW}STEP 5: Configuring Backend CORS${NC}"
echo ""
echo "Updating Railway backend with frontend URL..."
echo ""

cd /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise/backend

# Set CORS in Railway
railway variables set FRONTEND_ORIGIN="$DEPLOYMENT_URL"

echo -e "${GREEN}✅ CORS configured: $DEPLOYMENT_URL${NC}"
echo ""

# Redeploy backend
echo "Redeploying backend to apply CORS changes..."
railway up

echo -e "${GREEN}✅ Backend redeployed with CORS configuration${NC}"
echo ""

# ========================================
# STEP 6: Initial Verification
# ========================================
echo -e "${YELLOW}STEP 6: Running Initial Verification${NC}"
echo ""

echo "Testing backend health endpoint..."
HEALTH_STATUS=$(curl -s "$BACKEND_URL/api/health" | jq -r '.status' 2>/dev/null || echo "error")

if [ "$HEALTH_STATUS" = "healthy" ]; then
    echo -e "${GREEN}✅ Backend health check: PASSED${NC}"
else
    echo -e "${RED}❌ Backend health check: FAILED${NC}"
    echo "Response: $HEALTH_STATUS"
fi

echo ""
echo "Testing frontend accessibility..."
FRONTEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$DEPLOYMENT_URL")

if [ "$FRONTEND_STATUS" = "200" ]; then
    echo -e "${GREEN}✅ Frontend accessibility: PASSED${NC}"
else
    echo -e "${YELLOW}⚠️  Frontend returned status: $FRONTEND_STATUS${NC}"
fi

echo ""

# ========================================
# PHASE I COMPLETION SUMMARY
# ========================================
echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║          PHASE I: DEPLOYMENT COMPLETE ✅                   ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo -e "${GREEN}🎉 Frontend successfully deployed to Vercel!${NC}"
echo ""
echo "📋 Deployment Summary:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Frontend URL:  $DEPLOYMENT_URL"
echo "  Backend URL:   $BACKEND_URL"
echo "  CORS:          ✅ Configured"
echo "  Env Vars:      ✅ API_URL set"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🔗 Quick Access:"
echo "  Frontend:  open $DEPLOYMENT_URL"
echo "  Backend:   open $BACKEND_URL/api/health"
echo ""
echo "📝 Next Steps:"
echo "  1. Run Phase II validation: ./PHASE_II_VALIDATION.sh"
echo "  2. Generate owner token: cd backend && node generate_owner_token.js"
echo "  3. Test login flow in browser"
echo ""
echo "💾 Deployment URL saved to: /tmp/neuropilot_frontend_url.txt"
echo ""
echo -e "${BLUE}🚀 Proceeding to PHASE II: POST-DEPLOY VALIDATION${NC}"
echo ""
