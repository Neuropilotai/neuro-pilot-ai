#!/bin/bash
#
# NeuroInnovate Enterprise v19.0 - One-Command Deployment Script
#
# This script deploys NeuroInnovate Enterprise to Railway with validation.
#
# Usage:
#   bash DEPLOY_V19.sh
#
# Prerequisites:
#   - Git repository clean (no uncommitted changes)
#   - Railway project connected to GitHub
#   - Auto-deploy enabled on Railway
#   - Environment variables configured in Railway Dashboard
#

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  NeuroInnovate Enterprise v19.0${NC}"
echo -e "${BLUE}  Railway Deployment Script${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

# Check if we're on main branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ]; then
    echo -e "${YELLOW}⚠️  Warning: Not on main branch (current: $CURRENT_BRANCH)${NC}"
    echo -e "${YELLOW}   Deployment will only trigger from 'main' branch${NC}"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${RED}❌ Deployment cancelled${NC}"
        exit 1
    fi
fi

# Check for uncommitted changes
if ! git diff-index --quiet HEAD --; then
    echo -e "${RED}❌ Error: Uncommitted changes detected${NC}"
    echo -e "${YELLOW}   Please commit or stash changes before deploying${NC}"
    git status --short
    exit 1
fi

# Pull latest changes
echo -e "${BLUE}📥 Pulling latest changes...${NC}"
git pull origin main

# Verify critical files exist
echo -e "${BLUE}🔍 Verifying deployment files...${NC}"

CRITICAL_FILES=(
    "railway.json"
    ".github/workflows/autonomous_railway_deploy.yml"
    "inventory-enterprise/backend/server.js"
    "inventory-enterprise/backend/Procfile"
    "inventory-enterprise/ml-service/main.py"
    "inventory-enterprise/ml-service/Procfile"
    "inventory-enterprise/ml-service/requirements.txt"
)

for file in "${CRITICAL_FILES[@]}"; do
    if [ ! -f "$file" ]; then
        echo -e "${RED}❌ Missing required file: $file${NC}"
        exit 1
    fi
done

echo -e "${GREEN}✅ All critical files present${NC}"

# Verify railway.json syntax
echo -e "${BLUE}🔍 Validating railway.json...${NC}"
if ! cat railway.json | jq empty 2>/dev/null; then
    echo -e "${RED}❌ Invalid JSON in railway.json${NC}"
    exit 1
fi
echo -e "${GREEN}✅ railway.json is valid${NC}"

# Verify no secrets in git
echo -e "${BLUE}🔒 Checking for secrets...${NC}"
if git grep -I -E "(JWT_SECRET|SMTP_PASS|password|secret)" -- '*.js' '*.json' '*.yml' ':!.env*' ':!*template*' | grep -v "placeholder" | grep -v "your-" | grep -v "example"; then
    echo -e "${RED}❌ Potential secrets found in tracked files!${NC}"
    echo -e "${YELLOW}   Review output above and remove any secrets${NC}"
    exit 1
fi
echo -e "${GREEN}✅ No secrets detected in tracked files${NC}"

# Show deployment summary
echo ""
echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}  Deployment Summary${NC}"
echo -e "${BLUE}============================================${NC}"
echo -e "Branch:         ${GREEN}$CURRENT_BRANCH${NC}"
echo -e "Railway Project: ${GREEN}NeuroInnovate Enterprise${NC}"
echo -e "Project ID:     ${GREEN}6eb48b9a-8fe0-4836-8247-f6cef566f299${NC}"
echo -e "Services:       ${GREEN}backend, ml-service${NC}"
echo ""

# Confirm deployment
read -p "🚀 Deploy to Railway? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}❌ Deployment cancelled${NC}"
    exit 0
fi

# Create deployment commit
echo ""
echo -e "${BLUE}📝 Creating deployment commit...${NC}"
TIMESTAMP=$(date -u +"%Y-%m-%d %H:%M:%S UTC")
COMMIT_MSG="deploy: v19.0 NeuroInnovate Enterprise

Deployed at: $TIMESTAMP
Railway Project: 6eb48b9a-8fe0-4836-8247-f6cef566f299
Services: backend, ml-service
Auto-deploy: enabled

This commit triggers:
- GitHub Actions CI/CD pipeline
- Railway build & deployment
- Health check verification
- Autonomous scheduler initialization"

git commit --allow-empty -m "$COMMIT_MSG"

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Failed to create commit${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Deployment commit created${NC}"

# Push to main
echo ""
echo -e "${BLUE}🚀 Pushing to main branch...${NC}"
git push origin main

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Failed to push to main${NC}"
    echo -e "${YELLOW}   You may need to pull changes first${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Pushed to main successfully${NC}"

# Show next steps
echo ""
echo -e "${BLUE}============================================${NC}"
echo -e "${GREEN}✅ Deployment Triggered!${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""
echo -e "📊 ${YELLOW}Monitor deployment:${NC}"
echo -e "   GitHub Actions: https://github.com/[your-org]/neuro-pilot-ai/actions"
echo -e "   Railway Dashboard: https://railway.app/project/6eb48b9a-8fe0-4836-8247-f6cef566f299"
echo ""
echo -e "⏱️  ${YELLOW}Expected timeline:${NC}"
echo -e "   • GitHub Actions: ~5 minutes"
echo -e "   • Railway build: ~8 minutes"
echo -e "   • Health checks: ~2 minutes"
echo -e "   • Total: ~15 minutes"
echo ""
echo -e "🔍 ${YELLOW}Verify deployment:${NC}"
echo -e "   # Get Railway URLs from dashboard, then run:"
echo -e "   export BACKEND_URL=\"https://[your-backend].railway.app\""
echo -e "   export ML_URL=\"https://[your-ml-service].railway.app\""
echo -e "   curl -f \"\$BACKEND_URL/api/health\""
echo -e "   curl -f \"\$ML_URL/status\""
echo ""
echo -e "📧 ${YELLOW}First report scheduled:${NC}"
echo -e "   • Time: 02:15 UTC (next day)"
echo -e "   • Subject: NeuroInnovate Daily Intelligence Report - YYYY-MM-DD"
echo -e "   • Recipient: neuropilotai@gmail.com"
echo ""
echo -e "📚 ${YELLOW}Documentation:${NC}"
echo -e "   • Full guide: PR_NEUROINNOVATE_V19_DEPLOYMENT.md"
echo -e "   • Quick ref: RAILWAY_DEPLOYMENT_SUMMARY.md"
echo -e "   • Rollback: docs/ROLLBACK_PLAN.md"
echo ""
echo -e "${GREEN}🎉 Deployment initiated successfully!${NC}"
echo ""
