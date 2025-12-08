#!/bin/bash

echo "🔍 MONITORING RAILWAY DEPLOYMENT STATUS"
echo "======================================="
echo "URL: https://resourceful-achievement-production.up.railway.app"
echo ""

for i in {1..20}; do
    echo "[$i/20] Testing deployment..."
    
    response=$(curl -s https://resourceful-achievement-production.up.railway.app/api/health)
    
    if echo "$response" | grep -q '"status":"operational"'; then
        echo "✅ DEPLOYMENT SUCCESSFUL!"
        echo ""
        echo "📊 Health Check Response:"
        echo "$response" | jq '.' 2>/dev/null || echo "$response"
        echo ""
        
        # Test if it's the new 7-agent system
        echo "🤖 Testing for 7-agent system..."
        agents_response=$(curl -s https://resourceful-achievement-production.up.railway.app/api/agents/status)
        
        if echo "$agents_response" | grep -q '"total_agents":7'; then
            echo "🎉 SUCCESS! 7-agent system is deployed!"
            echo "$agents_response" | jq '.system' 2>/dev/null
        elif echo "$agents_response" | grep -q 'Cannot GET'; then
            echo "⚠️  Old 4-agent system still deployed (missing /api/agents/status endpoint)"
        else
            echo "🔍 Agent status response:"
            echo "$agents_response"
        fi
        
        echo ""
        echo "🌐 Homepage: https://resourceful-achievement-production.up.railway.app"
        echo "📊 Health: https://resourceful-achievement-production.up.railway.app/api/health"
        echo "🤖 Agents: https://resourceful-achievement-production.up.railway.app/api/agents/status"
        
        exit 0
    elif echo "$response" | grep -q "Application not found"; then
        echo "   Still deploying... (404 - Application not found)"
    else
        echo "   Response: $response"
    fi
    
    sleep 15
done

echo ""
echo "❌ Deployment monitoring timed out after 5 minutes"
echo "Check Railway dashboard for deployment status"