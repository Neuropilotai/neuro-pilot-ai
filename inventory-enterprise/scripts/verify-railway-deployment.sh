#!/bin/bash

# Railway Deployment Verification Script
# Checks if Railway is serving the correct version of owner-super-console-v15.html

RAILWAY_URL="https://inventory-backend-production-3a2c.up.railway.app"
EXPECTED_VERSION="23.6.11"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 Railway Deployment Verification"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Checking: $RAILWAY_URL"
echo "Expected version: $EXPECTED_VERSION"
echo ""

# Fetch HTML and check versions
HTML=$(curl -s "${RAILWAY_URL}/owner-super-console-v15.html")

if [ -z "$HTML" ]; then
  echo "❌ ERROR: Could not fetch HTML from Railway"
  echo "   Check if Railway service is running"
  exit 1
fi

# Check for expected version
VERSIONS=$(echo "$HTML" | grep -oE "v=23\.[0-9]+\.[0-9]+" | sort -u)

echo "📊 Versions found in HTML:"
echo "$VERSIONS" | while read -r version; do
  if [ "$version" = "v=$EXPECTED_VERSION" ]; then
    echo "   ✅ $version (CORRECT)"
  else
    echo "   ❌ $version (WRONG - expected v=$EXPECTED_VERSION)"
  fi
done

echo ""

# Check specific script tags
echo "📄 Script tags:"
echo "$HTML" | grep -E "owner-console-core\.js|owner-super-console\.js" | head -2 | while read -r line; do
  if echo "$line" | grep -q "v=$EXPECTED_VERSION"; then
    echo "   ✅ $line"
  else
    echo "   ❌ $line"
  fi
done

echo ""

# Determine overall status
if echo "$VERSIONS" | grep -q "v=$EXPECTED_VERSION"; then
  echo "✅ SUCCESS: Railway is serving correct version ($EXPECTED_VERSION)"
  echo ""
  echo "Next steps:"
  echo "   1. Hard refresh browser: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)"
  echo "   2. Check browser console for: '✅ Correct version loaded: $EXPECTED_VERSION'"
  echo "   3. Verify /api/owner/ops/status returns 200 (no 401 errors)"
  exit 0
else
  echo "❌ FAILURE: Railway is NOT serving correct version"
  echo ""
  echo "Current versions found:"
  echo "$VERSIONS"
  echo ""
  echo "Action required:"
  echo "   1. Check Railway dashboard → Deployments"
  echo "   2. Verify latest commit is deployed (should be 0f50701ba9 or later)"
  echo "   3. Trigger manual redeploy if needed"
  echo "   4. Wait 2-3 minutes and run this script again"
  exit 1
fi

