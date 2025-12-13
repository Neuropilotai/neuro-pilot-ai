#!/bin/bash
# Monitor PR Status and Railway Deployment

echo "🔍 Monitoring PR and Railway Status..."
echo ""

# Check PR
PR_URL="https://api.github.com/repos/Neuropilotai/neuro-pilot-ai/pulls?head=Neuropilotai:feature/enterprise-hardening-20251213&state=all"
RESPONSE=$(curl -s "$PR_URL" 2>/dev/null)

if echo "$RESPONSE" | grep -q '"number"'; then
    PR_NUMBER=$(echo "$RESPONSE" | grep -o '"number":[0-9]*' | head -1 | cut -d: -f2)
    PR_STATE=$(echo "$RESPONSE" | grep -o '"state":"[^"]*"' | head -1 | cut -d'"' -f4)
    
    echo "✅ PR #$PR_NUMBER is $PR_STATE"
    echo "   URL: https://github.com/Neuropilotai/neuro-pilot-ai/pull/$PR_NUMBER"
    echo ""
    
    if [ "$PR_STATE" = "open" ]; then
        echo "📋 Next Steps:"
        echo "   1. Check Railway preview deployment"
        echo "   2. Test endpoints on preview URL"
        echo "   3. Get code review"
        echo "   4. Merge when approved"
        echo ""
        echo "🔍 Check Railway Preview:"
        echo "   - Railway Dashboard → Deployments"
        echo "   - Look for deployment with PR #$PR_NUMBER"
        echo "   - Or check PR comments for preview URL"
    fi
else
    echo "⏳ PR not found yet"
    echo ""
    echo "📋 Create PR:"
    echo "   https://github.com/Neuropilotai/neuro-pilot-ai/compare/main...feature/enterprise-hardening-20251213"
fi

echo ""
echo "📊 Current Status:"
echo "   Branch: $(git branch --show-current)"
echo "   Commits ahead: $(git rev-list --count main..feature/enterprise-hardening-20251213 2>/dev/null)"
echo "   Files changed: $(git diff --name-only main...feature/enterprise-hardening-20251213 2>/dev/null | wc -l | xargs)"
