#!/bin/bash
# PR Creation Helper Script
# Opens GitHub PR creation page with pre-filled information

BRANCH="feature/enterprise-hardening-20251213"
BASE="main"
REPO="Neuropilotai/neuro-pilot-ai"

echo "🚀 Enterprise Hardening PR Creation Helper"
echo "=========================================="
echo ""

# Check if branch exists
if ! git rev-parse --verify "$BRANCH" >/dev/null 2>&1; then
    echo "❌ Error: Branch '$BRANCH' not found"
    exit 1
fi

# Check if branch is pushed
if ! git ls-remote --heads origin "$BRANCH" | grep -q "$BRANCH"; then
    echo "❌ Error: Branch '$BRANCH' not pushed to remote"
    echo "   Run: git push -u origin $BRANCH"
    exit 1
fi

echo "✅ Branch verified: $BRANCH"
echo "✅ Base branch: $BASE"
echo ""

# PR URL
PR_URL="https://github.com/$REPO/compare/$BASE...$BRANCH"

echo "📋 PR Details:"
echo "   Title: Enterprise Hardening: Multi-Tenant Isolation, Balance Table, Backup System"
echo "   Type: feat(enterprise)"
echo "   Description: See PR_ENTERPRISE_HARDENING.md"
echo ""

# Open PR page
if command -v open >/dev/null 2>&1; then
    echo "🌐 Opening PR creation page..."
    open "$PR_URL"
elif command -v xdg-open >/dev/null 2>&1; then
    echo "🌐 Opening PR creation page..."
    xdg-open "$PR_URL"
else
    echo "📋 PR URL (copy and open in browser):"
    echo "   $PR_URL"
fi

echo ""
echo "📝 Next Steps:"
echo "   1. Copy PR description from: PR_ENTERPRISE_HARDENING.md"
echo "   2. Paste into PR description field"
echo "   3. Add reviewers (if needed)"
echo "   4. Add labels: enhancement, enterprise, database, security"
echo "   5. Click 'Create Pull Request'"
echo ""
echo "🔍 After PR Creation:"
echo "   - Check Railway preview deployment (if enabled)"
echo "   - Test endpoints on preview URL"
echo "   - Review code changes"
echo ""

