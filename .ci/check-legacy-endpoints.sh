#!/bin/bash
# ============================================================================
# CI Check: Block Legacy Endpoint Usage
# ============================================================================
# Prevents new code from using deprecated /api/stability/* endpoints
# Enforces migration to /api/ai/adaptive/*
# ============================================================================

set -e

echo "🔍 Checking for deprecated /api/stability/ endpoint usage..."
echo ""

# Search in source files (exclude node_modules, docs, and this script)
MATCHES=$(grep -R \
  --exclude-dir=node_modules \
  --exclude-dir=.git \
  --exclude-dir=reports \
  --exclude='*.md' \
  --exclude='check-legacy-endpoints.sh' \
  --exclude='verify_v16_3_stability.sh' \
  --exclude='server.js' \
  -n '/api/stability/' \
  inventory-enterprise/ 2>/dev/null || true)

if [ -n "$MATCHES" ]; then
  echo "❌ ERROR: Legacy /api/stability/ endpoint references detected!"
  echo ""
  echo "Found in:"
  echo "$MATCHES"
  echo ""
  echo "📝 Action Required:"
  echo "   Replace with /api/ai/adaptive/*"
  echo ""
  echo "Migration Guide:"
  echo "   /api/stability/status        → /api/ai/adaptive/status"
  echo "   /api/stability/tune          → /api/ai/adaptive/retrain"
  echo "   /api/stability/recommendations → /api/ai/adaptive/history"
  echo ""
  exit 1
fi

echo "✅ No legacy endpoint references found"
echo ""
exit 0
