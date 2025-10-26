#!/usr/bin/env bash
set -euo pipefail

# DEPLOY_PROD.sh - Single-command production deployment
# NeuroPilot v16.6 - Railway + Vercel

echo "🚀 NeuroPilot v16.6 - Production Deployment"
echo "==========================================="
echo ""

# Verify we're in the right directory
if [[ ! -d "backend" ]] || [[ ! -d "frontend" ]]; then
  echo "❌ Error: Must run from inventory-enterprise root directory"
  exit 1
fi

# Check DATABASE_URL
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "❌ DATABASE_URL not set"
  echo ""
  echo "Usage:"
  echo "  DATABASE_URL=\"postgresql://user:pass@host/db?sslmode=require\" \\"
  echo "  FRONTEND_ORIGIN=\"https://neuropilot-inventory.vercel.app\" \\"
  echo "  ./DEPLOY_PROD.sh"
  echo ""
  exit 1
fi

# Default frontend origin if not set
FRONTEND_ORIGIN="${FRONTEND_ORIGIN:-https://neuropilot-inventory.vercel.app}"

echo "✅ DATABASE_URL: ${DATABASE_URL:0:40}..."
echo "✅ FRONTEND_ORIGIN: $FRONTEND_ORIGIN"
echo ""

# ==========================================
# Single-line Production Rollout
# ==========================================
cd backend && \
./scripts/generate_production_secrets.sh && \
DATABASE_URL="$DATABASE_URL" \
FRONTEND_ORIGIN="$FRONTEND_ORIGIN" \
./scripts/stage-deploy.sh

echo ""
echo "🎉 Backend deployed successfully!"
echo ""

# Save Railway URL for frontend deployment
RAILWAY_URL=$(railway domain | head -n1 | tr -d '[:space:]')
echo "📝 Backend URL: $RAILWAY_URL"
echo ""

# ==========================================
# Frontend Deployment (Optional)
# ==========================================
read -p "Deploy frontend to Vercel now? (Y/n): " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Nn]$ ]]; then
  echo ""
  echo "🚀 Deploying frontend to Vercel..."
  echo ""

  cd ../frontend
  vercel --prod

  echo ""
  echo "📋 Next Steps:"
  echo "   1. Set environment variable in Vercel:"
  echo "      vercel env add VITE_API_URL production"
  echo "      (Paste: $RAILWAY_URL)"
  echo ""
  echo "   2. Redeploy frontend:"
  echo "      vercel --prod --force"
  echo ""
  echo "   3. Update backend CORS:"
  echo "      cd backend"
  echo "      railway variables set ALLOW_ORIGIN=\"<your-vercel-url>\""
  echo ""
else
  echo ""
  echo "⏭️  Frontend deployment skipped"
  echo ""
  echo "To deploy frontend later:"
  echo "  cd frontend"
  echo "  vercel --prod"
  echo ""
fi

echo "✅ Deployment complete!"
