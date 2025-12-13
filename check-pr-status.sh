#!/bin/bash
# Check PR Status

echo "🔍 Checking PR Status..."
echo ""

PR_URL="https://api.github.com/repos/Neuropilotai/neuro-pilot-ai/pulls?head=Neuropilotai:feature/enterprise-hardening-20251213&state=all"

RESPONSE=$(curl -s "$PR_URL" 2>/dev/null)

if echo "$RESPONSE" | grep -q '"number"'; then
    PR_NUMBER=$(echo "$RESPONSE" | grep -o '"number":[0-9]*' | head -1 | cut -d: -f2)
    PR_STATE=$(echo "$RESPONSE" | grep -o '"state":"[^"]*"' | head -1 | cut -d'"' -f4)
    PR_TITLE=$(echo "$RESPONSE" | grep -o '"title":"[^"]*"' | head -1 | cut -d'"' -f4)
    
    echo "✅ PR Found!"
    echo "   Number: #$PR_NUMBER"
    echo "   State: $PR_STATE"
    echo "   Title: $PR_TITLE"
    echo ""
    echo "📋 PR URL:"
    echo "   https://github.com/Neuropilotai/neuro-pilot-ai/pull/$PR_NUMBER"
    echo ""
    
    if [ "$PR_STATE" = "open" ]; then
        echo "🎯 Next Steps:"
        echo "   1. Check Railway preview deployment"
        echo "   2. Test on preview URL"
        echo "   3. Get code review"
        echo "   4. Merge when approved"
    else
        echo "⚠️  PR is $PR_STATE"
    fi
else
    echo "⏳ PR Not Found"
    echo ""
    echo "📋 Create PR:"
    echo "   https://github.com/Neuropilotai/neuro-pilot-ai/compare/main...feature/enterprise-hardening-20251213"
    echo ""
    echo "Or run: ./open-pr.sh"
fi
