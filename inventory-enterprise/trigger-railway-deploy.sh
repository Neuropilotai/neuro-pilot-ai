#!/bin/bash
# Railway Deployment Trigger Script
# This script forces Railway to pick up the latest Docker changes

set -e

BACKEND="https://resourceful-achievement-production.up.railway.app"

echo "═══════════════════════════════════════════════════════════"
echo "  NeuroPilot Railway Deployment Trigger"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Check current deployment status
echo "📊 Checking current deployment status..."
echo ""

CURRENT_CORS=$(curl -sI -X OPTIONS -H "Origin: https://neuropilot-inventory.vercel.app" "$BACKEND/api/health" | grep -i "access-control-allow-origin" || echo "No CORS header found")

echo "Current CORS header:"
echo "  $CURRENT_CORS"
echo ""

if echo "$CURRENT_CORS" | grep -q "access-control-allow-origin: \*"; then
    echo "⚠️  WARNING: CORS is still showing wildcard (*)"
    echo "   This means Railway hasn't deployed the security fix yet."
    echo ""
else
    echo "✅ CORS appears to be restricted (good!)"
    echo ""
fi

# Show current health status
echo "🏥 Current health status:"
curl -s "$BACKEND/api/health" | head -1
echo ""
echo ""

# Offer options
echo "═══════════════════════════════════════════════════════════"
echo "  Deployment Options"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Option 1: Trigger via Empty Commit (Recommended)"
echo "   - Creates empty commit to trigger Railway webhook"
echo "   - Safe, auditable, no code changes"
echo ""
echo "Option 2: Check Railway Dashboard"
echo "   - Go to: https://railway.app/dashboard"
echo "   - Navigate to backend service"
echo "   - Check Deployments tab for commit d4db84000e"
echo "   - Click 'Deploy' if not building"
echo ""
echo "Option 3: Railway CLI (if installed)"
echo "   - Run: railway login"
echo "   - Run: railway link"
echo "   - Run: railway up"
echo ""

read -p "Do you want to trigger deployment via empty commit? (y/n): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo "🚀 Triggering Railway deployment..."
    echo ""

    # Create empty commit
    git commit --allow-empty -m "chore: trigger Railway deployment for security fixes

This empty commit triggers Railway to rebuild with:
- Enterprise-grade Docker container (commit d4db84000e)
- Restricted CORS (commit b76c04ce84)
- SBOM generation in CI
- Non-root user execution
- Lockfile enforcement

Verification needed after deploy:
1. Check logs for: 🔒 Using package-lock.json with npm ci --omit=dev
2. Test CORS: should NOT show wildcard (*)
3. Verify health endpoint responds
"

    # Push to remote
    echo "📤 Pushing to remote..."
    git push origin fix/broken-links-guard-v15

    echo ""
    echo "✅ Deployment triggered!"
    echo ""
    echo "═══════════════════════════════════════════════════════════"
    echo "  Next Steps"
    echo "═══════════════════════════════════════════════════════════"
    echo ""
    echo "1. Watch Railway Dashboard for build progress:"
    echo "   https://railway.app/dashboard"
    echo ""
    echo "2. Set ALLOWED_ORIGINS environment variable (if not set):"
    echo "   ALLOWED_ORIGINS=https://neuropilot-inventory.vercel.app,https://neuropilot-inventory-ngrq6b78x-david-mikulis-projects-73b27c6d.vercel.app"
    echo ""
    echo "3. Monitor build logs for success indicators:"
    echo "   - 🔒 Using package-lock.json with npm ci --omit=dev"
    echo "   - added 366 packages, and audited 367 packages"
    echo "   - ✓ Successfully built"
    echo ""
    echo "4. After deployment completes (2-5 minutes), verify CORS:"
    echo "   ./backend/test-cors.sh"
    echo ""
    echo "5. Check GitHub Actions for SBOM artifact:"
    echo "   https://github.com/Neuropilotai/neuro-pilot-ai/actions"
    echo ""

    # Wait a bit then check again
    echo "⏳ Waiting 10 seconds before checking status..."
    sleep 10

    echo ""
    echo "📊 Current deployment still shows (may take 2-5 min to update):"
    HEALTH_CHECK=$(curl -s "$BACKEND/api/health" 2>&1)
    echo "$HEALTH_CHECK" | head -1
    echo ""
    echo "Monitor Railway dashboard for real-time build status."

else
    echo ""
    echo "ℹ️  Deployment not triggered. Use one of the manual options above."
    echo ""
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Documentation"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "- Deployment Status: ./DEPLOYMENT_VERIFICATION_STATUS.md"
echo "- Security Runbook: ./SECURITY_POSTURE_RUNBOOK.md"
echo "- Docker Build Fix: ./DOCKER_BUILD_FIX_COMPLETE.md"
echo "- CORS Testing: ./backend/test-cors.sh"
echo ""
echo "For support, review the runbook or check Railway logs."
echo ""
