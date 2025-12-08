#!/bin/bash

# 🚀 Neuro.Pilot.AI Railway Deployment Script
# Automated deployment with complete AI agent system

echo "🚀 DEPLOYING NEURO.PILOT.AI TO RAILWAY"
echo "======================================"

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not found. Installing..."
    curl -fsSL https://railway.app/install.sh | sh
    echo "✅ Railway CLI installed"
fi

# Login to Railway (if not already logged in)
echo "🔐 Checking Railway authentication..."
railway whoami || railway login

# Link to project (create new if needed)
echo "🔗 Linking to Railway project..."
railway link || railway create

# Set environment variables from .env.railway
echo "⚙️ Setting environment variables..."

# Core system variables
railway variables set NODE_ENV=production
railway variables set PORT=8080
railway variables set AI_AGENTS_ENABLED=true
railway variables set RAILWAY_DEPLOYMENT=true

# Email system (update with your credentials)
railway variables set SMTP_HOST=smtp.gmail.com
railway variables set SMTP_PORT=587
railway variables set SMTP_USER=Neuro.Pilot.AI@gmail.com
railway variables set EMAIL_FROM=noreply@neuropilot.ai
railway variables set NOTIFICATION_EMAIL=david@neuropilot.ai
railway variables set EMAIL_NOTIFICATIONS=true

# OpenAI integration
railway variables set OPENAI_ORG_ID=org-2xaWbVn0ommRnPQMDgUHf6NM
railway variables set OPENAI_PROJECT_ID=proj_mUvJrP9STnrsY064v39yoq9p

# System configuration
railway variables set AUTO_APPROVE_LOW_RISK=false
railway variables set MAX_PENDING_GIGS=50
railway variables set DEPLOYMENT_TIMEOUT=300000
railway variables set HEALTH_CHECK_INTERVAL=30000
railway variables set PERFORMANCE_LOGGING=true
railway variables set DEBUG_MODE=false

echo "✅ Environment variables configured"

# Add PostgreSQL database
echo "🗄️ Adding PostgreSQL database..."
railway add postgresql

# Deploy the application
echo "🚀 Deploying to Railway..."
railway deploy

# Get the deployment URL
echo "🌐 Getting deployment URL..."
RAILWAY_URL=$(railway status --json | grep -o '"url":"[^"]*' | cut -d'"' -f4)

echo ""
echo "✅ DEPLOYMENT COMPLETE!"
echo "======================"
echo "🌐 Application URL: $RAILWAY_URL"
echo "📊 Health Check: $RAILWAY_URL/api/health"
echo "🤖 Agent Status: $RAILWAY_URL/api/agents/status"
echo "📊 System Stats: $RAILWAY_URL/api/system/stats"
echo ""
echo "🔧 NEXT STEPS:"
echo "1. Test health endpoint: curl $RAILWAY_URL/api/health"
echo "2. Verify agent status: curl $RAILWAY_URL/api/agents/status"
echo "3. Set sensitive environment variables manually in Railway dashboard:"
echo "   - SMTP_PASS (Gmail app password)"
echo "   - OPENAI_API_KEY (Your OpenAI key)"
echo "   - STRIPE_SECRET_KEY (Your Stripe key)"
echo ""
echo "📖 Complete guide: ./RAILWAY_DEPLOYMENT_COMPLETE.md"
echo ""
echo "🎉 Neuro.Pilot.AI is now live with 7 AI agents!"