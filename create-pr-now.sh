#!/bin/bash
# Quick PR Creation - Opens GitHub PR page

BRANCH="feature/enterprise-hardening-20251213"
PR_URL="https://github.com/Neuropilotai/neuro-pilot-ai/compare/main...$BRANCH"

echo "🚀 Opening PR Creation Page..."
echo ""
echo "PR URL: $PR_URL"
echo ""
echo "📋 Quick Copy-Paste:"
echo "Title: Enterprise Hardening: Multi-Tenant Isolation, Balance Table, Backup System"
echo ""
echo "Description: See PR_ENTERPRISE_HARDENING.md (copy entire file contents)"
echo ""

# Open in browser
if command -v open >/dev/null 2>&1; then
    open "$PR_URL"
elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$PR_URL"
fi

echo "✅ PR page should be open in your browser"
echo ""
echo "Next: Copy PR_ENTERPRISE_HARDENING.md contents into description field"
