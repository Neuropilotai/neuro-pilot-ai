#!/bin/bash

echo "🚀 MONITORING RAILWAY DEPLOYMENT - REDEPLOY NOW"
echo "=============================================="
echo "Timestamp: $(date)"
echo "URL: https://resourceful-achievement-production.up.railway.app"
echo ""

for i in {1..30}; do
    echo "[$i/30] Checking deployment status..."
    
    response=$(curl -s https://resourceful-achievement-production.up.railway.app/api/health 2>/dev/null)
    
    if echo "$response" | grep -q '"status":"operational"'; then
        echo ""
        echo "🎉 DEPLOYMENT SUCCESSFUL!"
        echo "========================="
        echo "$response" | jq '.' 2>/dev/null || echo "$response"
        
        echo ""
        echo "🤖 Testing 7-agent system..."
        agents=$(curl -s https://resourceful-achievement-production.up.railway.app/api/agents/status 2>/dev/null)
        
        if echo "$agents" | grep -q '"total_agents":7'; then
            echo "✅ SUCCESS! 7 AI agents are deployed and operational!"
            echo "$agents" | jq '.system' 2>/dev/null
        else
            echo "❌ Still old system or error in agent endpoint"
            echo "$agents" | head -3
        fi
        
        echo ""
        echo "🌐 LIVE SYSTEM READY:"
        echo "Homepage: https://resourceful-achievement-production.up.railway.app"
        echo "Health: https://resourceful-achievement-production.up.railway.app/api/health"
        echo "Agents: https://resourceful-achievement-production.up.railway.app/api/agents/status"
        echo "Stats: https://resourceful-achievement-production.up.railway.app/api/system/stats"
        
        exit 0
        
    elif echo "$response" | grep -q "404"; then
        echo "   Railway rebuilding... (404 - Application not found)"
    elif echo "$response" | grep -q "502\|503"; then
        echo "   Service starting up... (502/503 error)"
    else
        echo "   Response: $response"
    fi
    
    sleep 10
done

echo ""
echo "⚠️ Deployment still in progress after 5 minutes"
echo "Check Railway dashboard for detailed status"