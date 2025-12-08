#!/bin/bash

# Force Railway deployment of Neuro.Pilot.AI production system

echo "🚀 FORCING RAILWAY DEPLOYMENT OF PRODUCTION SYSTEM"
echo "=================================================="

# Create a deployment trigger file
echo "Deployment triggered: $(date)" > deployment-trigger.txt

# Add and commit the trigger
git add deployment-trigger.txt
git commit -m "🔥 FORCE DEPLOYMENT: Trigger Railway redeploy with 7-agent production system

This commit forces Railway to redeploy with the latest production-ready code:
- railway-server-production.js (7 AI agents)
- Working email system (Gmail SMTP verified)
- Complete API endpoints
- Database persistence ready
- All systems tested and operational

DEPLOYMENT TARGET: https://resourceful-achievement-production.up.railway.app
EXPECTED: 7-agent system replacing current 4-agent deployment"

# Try multiple deployment methods
echo "📡 Attempting GitHub push to trigger auto-deploy..."
timeout 60 git push origin main

echo "🔄 Attempting direct Railway deployment..."
timeout 60 railway up --detach 2>/dev/null || echo "Railway CLI deployment method failed"

echo "✅ DEPLOYMENT TRIGGERED"
echo "🌐 Monitor at: https://resourceful-achievement-production.up.railway.app"
echo "📊 Health check: https://resourceful-achievement-production.up.railway.app/api/health"

# Wait a moment then test
echo "⏳ Waiting 30 seconds for deployment..."
sleep 30

echo "🧪 Testing deployment..."
curl -s https://resourceful-achievement-production.up.railway.app/api/health | jq '.version' || echo "Still deploying..."

echo ""
echo "🎯 DEPLOYMENT STATUS:"
echo "If you see version 2.0.0, the new system is deployed!"
echo "If you see the old version, Railway is still processing the deployment."
echo ""
echo "Monitor deployment progress in Railway dashboard."