#!/usr/bin/env bash
# DEPLOYMENT_COMMANDS.sh
# Production deployment commands for NeuroPilot v16.6
# Copy-paste ready for manual execution

set -euo pipefail

echo "═══════════════════════════════════════════════════════════════"
echo "  NeuroPilot v16.6 - Production Deployment Commands"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "⚠️  This script shows the commands - execute manually or run sections"
echo ""

# Navigate to project root
cd /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise

# --- 1️⃣ Generate secrets ---
echo "1️⃣  Generate Secrets"
echo "--------------------"
echo "cd backend"
echo "./scripts/generate_production_secrets.sh"
echo ""

# --- 2️⃣ Deploy backend (Railway + Neon) ---
echo "2️⃣  Deploy Backend (Railway + Neon)"
echo "-----------------------------------"
echo "export DATABASE_URL=\"postgresql://<user>:<pass>@<your-neon-host>/<db>?sslmode=require\""
echo "export FRONTEND_ORIGIN=\"https://neuropilot-inventory.vercel.app\""
echo "./scripts/stage-deploy.sh"
echo ""

# --- 3️⃣ Deploy frontend (Vercel) ---
echo "3️⃣  Deploy Frontend (Vercel)"
echo "----------------------------"
echo "cd ../frontend"
echo "vercel login"
echo "vercel --prod"
echo ""
echo "# After deployment, set environment variable:"
echo "vercel env add VITE_API_URL production"
echo "# When prompted, paste your Railway URL from step 2"
echo ""
echo "# Redeploy with environment variable:"
echo "vercel --prod --force"
echo ""

# --- 4️⃣ Update CORS origin on Railway ---
echo "4️⃣  Update CORS Origin on Railway"
echo "----------------------------------"
echo "cd ../backend"
echo "railway variables set ALLOW_ORIGIN=\"https://neuropilot-inventory.vercel.app\""
echo ""
echo "# Or if Vercel gave you a different URL:"
echo "# railway variables set ALLOW_ORIGIN=\"https://neuropilot-inventory-xyz.vercel.app\""
echo ""

# --- 5️⃣ Verify deployment ---
echo "5️⃣  Verify Deployment"
echo "---------------------"
echo "# Run smoke tests:"
echo "RAILWAY_URL=\"https://your-app.up.railway.app\" \\"
echo "TEST_EMAIL=\"neuropilotai@gmail.com\" \\"
echo "TEST_PASS=\"TestPassword123!\" \\"
echo "./scripts/smoke-test.sh"
echo ""
echo "# Test frontend:"
echo "open https://neuropilot-inventory.vercel.app/owner-super-console.html"
echo ""

echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "📋 Quick Reference:"
echo ""
echo "  Health: curl \$RAILWAY_URL/health"
echo "  Logs:   railway logs -f"
echo "  Status: railway status"
echo ""
echo "═══════════════════════════════════════════════════════════════"
