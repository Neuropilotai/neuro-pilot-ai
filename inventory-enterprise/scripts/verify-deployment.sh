#!/bin/bash
# Verify Railway Deployment - Check if new version is deployed

set -e

BASE_URL="${RAILWAY_URL:-https://inventory-backend-production-3a2c.up.railway.app}"

echo "🔍 Verifying Railway Deployment"
echo "================================"
echo "Base URL: $BASE_URL"
echo ""

# Check HTML file for version numbers
echo "1️⃣  Checking HTML file for version numbers..."
HTML_RESPONSE=$(curl -s "$BASE_URL/owner-super-console-v15.html")

if echo "$HTML_RESPONSE" | grep -q "v=23.6.8"; then
  echo "✅ HTML file contains v=23.6.8 (NEW VERSION DEPLOYED)"
  VERSION_COUNT=$(echo "$HTML_RESPONSE" | grep -o "v=23.6.8" | wc -l | tr -d ' ')
  echo "   Found $VERSION_COUNT references to v=23.6.8"
elif echo "$HTML_RESPONSE" | grep -q "v=23.5.1"; then
  echo "❌ HTML file contains v=23.5.1 (OLD VERSION - Railway hasn't deployed yet)"
  echo "   Wait for Railway deployment to complete"
elif echo "$HTML_RESPONSE" | grep -q "v=23.6"; then
  VERSION=$(echo "$HTML_RESPONSE" | grep -o "v=23.6\.[0-9]" | head -1 | sort -u)
  echo "⚠️  HTML file contains $VERSION (different version)"
else
  echo "⚠️  Could not determine version from HTML"
fi
echo ""

# Check for cache meta tags
echo "2️⃣  Checking for cache-prevention meta tags..."
if echo "$HTML_RESPONSE" | grep -q "Cache-Control.*no-cache"; then
  echo "✅ Cache-Control meta tag found"
else
  echo "❌ Cache-Control meta tag NOT found"
fi
echo ""

# Check authentication fixes in JS
echo "3️⃣  Checking if authentication fixes are deployed..."
# Note: We can't easily check JS file content via curl due to minification
# But we can check if the file exists and has the right version in HTML
if echo "$HTML_RESPONSE" | grep -q "owner-console-core.js?v=23.6.8"; then
  echo "✅ owner-console-core.js?v=23.6.8 referenced in HTML"
else
  echo "❌ owner-console-core.js?v=23.6.8 NOT found in HTML"
  echo "   Browser may be serving cached HTML"
fi
echo ""

# Check health endpoint
echo "4️⃣  Checking server health..."
HEALTH=$(curl -s -w "\nHTTP_CODE:%{http_code}" "$BASE_URL/health")
HTTP_CODE=$(echo "$HEALTH" | grep "HTTP_CODE:" | cut -d: -f2)

if [ "$HTTP_CODE" = "200" ]; then
  echo "✅ Server is healthy (HTTP $HTTP_CODE)"
else
  echo "❌ Server health check failed (HTTP $HTTP_CODE)"
fi
echo ""

# Summary
echo "📊 Summary"
echo "=========="
if echo "$HTML_RESPONSE" | grep -q "v=23.6.8"; then
  echo "✅ Railway has deployed the new version (v23.6.8)"
  echo ""
  echo "💡 Next Steps:"
  echo "   1. Clear browser cache completely"
  echo "   2. Hard refresh: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)"
  echo "   3. Verify Network tab shows v=23.6.8"
else
  echo "⚠️  Railway may not have deployed the new version yet"
  echo ""
  echo "💡 Next Steps:"
  echo "   1. Check Railway dashboard → Deploy Logs"
  echo "   2. Wait for deployment to complete"
  echo "   3. Run this script again to verify"
fi

