#!/usr/bin/env bash
set -euo pipefail

# DEPLOY_NOW.sh
# Complete deployment script for NeuroPilot v16.6
# Backend (Railway) + Frontend (Vercel)

echo "═══════════════════════════════════════════════════════════════"
echo "  🚀 NEUROPILOT v16.6 - FULL STACK DEPLOYMENT"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Change to script directory
cd "$(dirname "$0")"

# ==========================================
# STEP 1: Pre-flight Verification
# ==========================================
echo "1️⃣  Pre-flight Verification"
echo "----------------------------"

cd backend
if ! ./scripts/verify-staging-readiness.sh; then
  echo "❌ Pre-flight checks failed. Fix issues above and re-run."
  exit 1
fi

echo ""
echo "✅ All 23 checks passed - GREEN LIGHT!"
echo ""

# ==========================================
# STEP 2: Environment Configuration
# ==========================================
echo "2️⃣  Environment Configuration"
echo "-----------------------------"

# Check for required environment variables
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "❌ DATABASE_URL not set"
  echo ""
  echo "Please set your Neon Postgres connection string:"
  echo "  export DATABASE_URL=\"postgresql://user:pass@ep-xyz.neon.tech/neuropilot?sslmode=require\""
  echo ""
  exit 1
fi

if [[ -z "${FRONTEND_ORIGIN:-}" ]]; then
  echo "⚠️  FRONTEND_ORIGIN not set, using placeholder"
  export FRONTEND_ORIGIN="https://neuropilot-inventory.vercel.app"
  echo "   Using: $FRONTEND_ORIGIN"
  echo "   (will update after Vercel deployment)"
fi

echo "✅ DATABASE_URL: ${DATABASE_URL:0:30}..."
echo "✅ FRONTEND_ORIGIN: $FRONTEND_ORIGIN"
echo ""

# ==========================================
# STEP 3: Backend Deployment (Railway)
# ==========================================
echo "3️⃣  Backend Deployment (Railway)"
echo "---------------------------------"

read -p "Deploy backend to Railway? (y/N): " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "⏭️  Skipping backend deployment"
else
  echo "🚀 Deploying backend..."
  ./scripts/stage-deploy.sh

  # Get Railway URL
  echo ""
  echo "📝 Fetching Railway URL..."
  RAILWAY_URL=$(railway domain | head -n1 | tr -d '[:space:]')
  echo "   Backend URL: $RAILWAY_URL"

  # Save for later steps
  echo "$RAILWAY_URL" > /tmp/railway_url.txt

  echo ""
  echo "✅ Backend deployed successfully!"
fi

echo ""

# ==========================================
# STEP 4: Frontend Deployment (Vercel)
# ==========================================
echo "4️⃣  Frontend Deployment (Vercel)"
echo "---------------------------------"

cd ../frontend

read -p "Deploy frontend to Vercel? (y/N): " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "⏭️  Skipping frontend deployment"
else
  # Check if Railway URL is available
  if [[ -f /tmp/railway_url.txt ]]; then
    RAILWAY_URL=$(cat /tmp/railway_url.txt)
    echo "ℹ️  Railway URL: $RAILWAY_URL"
    echo "   This will be set as VITE_API_URL in Vercel"
    echo ""
  else
    echo "⚠️  Railway URL not found. You'll need to set VITE_API_URL manually."
    echo ""
  fi

  echo "🚀 Deploying frontend to Vercel..."
  echo "   (This will open a browser for authentication if needed)"
  echo ""

  vercel --prod

  echo ""
  echo "✅ Frontend deployed successfully!"
  echo ""
  echo "📝 Next steps:"
  echo "   1. Note your Vercel URL from output above"
  echo "   2. Set environment variable:"
  echo "      vercel env add VITE_API_URL production"
  echo "      (Paste: $RAILWAY_URL)"
  echo "   3. Redeploy with env var:"
  echo "      vercel --prod --force"
fi

echo ""

# ==========================================
# STEP 5: CORS Configuration
# ==========================================
echo "5️⃣  CORS Configuration"
echo "----------------------"

if [[ -f /tmp/railway_url.txt ]]; then
  echo "⚠️  Important: Update Railway ALLOW_ORIGIN with your Vercel URL"
  echo ""
  echo "After you get your Vercel URL, run:"
  echo "  cd backend"
  echo "  railway variables set ALLOW_ORIGIN=\"https://your-vercel-url.vercel.app\""
  echo ""
else
  echo "ℹ️  Skipped (Railway not deployed)"
fi

# ==========================================
# STEP 6: Verification
# ==========================================
echo "6️⃣  Post-Deployment Verification"
echo "---------------------------------"

if [[ -f /tmp/railway_url.txt ]]; then
  RAILWAY_URL=$(cat /tmp/railway_url.txt)

  read -p "Run smoke tests on backend? (y/N): " -n 1 -r
  echo ""
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    cd ../backend

    echo "🧪 Running smoke tests..."
    RAILWAY_URL="$RAILWAY_URL" \
    TEST_EMAIL="${TEST_EMAIL:-neuropilotai@gmail.com}" \
    TEST_PASS="${TEST_PASS:-TestPassword123!}" \
    ./scripts/smoke-test.sh

    echo ""
    echo "✅ Smoke tests passed!"
  fi
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  🎉 DEPLOYMENT COMPLETE!"
echo "═══════════════════════════════════════════════════════════════"
echo ""

if [[ -f /tmp/railway_url.txt ]]; then
  echo "Backend:  $(cat /tmp/railway_url.txt)"
fi
echo "Frontend: Check Vercel output above"
echo ""
echo "Next Steps:"
echo "  1. Set VITE_API_URL in Vercel (if not done)"
echo "  2. Update Railway ALLOW_ORIGIN with Vercel URL"
echo "  3. Test login at frontend URL"
echo "  4. Monitor logs: railway logs -f"
echo ""
echo "Documentation:"
echo "  • Full Guide: FULL_STACK_DEPLOYMENT.md"
echo "  • Backend: backend/STAGING_DEPLOYMENT_GUIDE.md"
echo "  • Frontend: frontend/VERCEL_DEPLOYMENT_GUIDE.md"
echo ""
