#!/bin/bash
# Open PR Creation Page

PR_URL="https://github.com/Neuropilotai/neuro-pilot-ai/compare/main...feature/enterprise-hardening-20251213"

echo "🚀 Opening PR Creation Page..."
echo ""
echo "PR URL: $PR_URL"
echo ""
echo "📋 Quick Steps:"
echo "  1. Title: Enterprise Hardening: Multi-Tenant Isolation, Balance Table, Backup System"
echo "  2. Description: Copy from PR_ENTERPRISE_HARDENING.md"
echo "  3. Labels: enhancement, enterprise, database, security"
echo "  4. Click 'Create Pull Request'"
echo ""

if command -v open >/dev/null 2>&1; then
    open "$PR_URL"
elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$PR_URL"
else
    echo "Please open: $PR_URL"
fi

echo ""
echo "✅ PR page should be open in your browser"
