#!/bin/bash
# CORS Security Lint Guard
# Fails if insecure CORS patterns are detected in codebase

set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKEND_DIR="$REPO_ROOT/backend"

echo "🔍 Scanning for insecure CORS patterns..."

# Check 1: No bare app.use(cors()) without options
if grep -R --line-number --include="*.js" "app\.use(cors())" "$BACKEND_DIR" 2>/dev/null | grep -v "node_modules" | grep -v ".test.js"; then
  echo "❌ FAIL: Insecure bare cors() usage detected!"
  echo "   Use app.use(cors({ origin: function(origin, callback) {...} })) instead"
  exit 1
fi

# Check 2: No origin: true (allows all origins)
if grep -R --line-number --include="*.js" "origin:\s*true" "$BACKEND_DIR" 2>/dev/null | grep -v "node_modules" | grep -v ".test.js"; then
  echo "❌ FAIL: Insecure 'origin: true' detected!"
  echo "   Use explicit origin validation function instead"
  exit 1
fi

# Check 3: No origin: '*' string literal
if grep -R --line-number --include="*.js" "origin:\s*['\"]\\*['\"]" "$BACKEND_DIR" 2>/dev/null | grep -v "node_modules" | grep -v ".test.js"; then
  echo "❌ FAIL: Wildcard origin '*' string detected!"
  echo "   Remove wildcard and use allowlist"
  exit 1
fi

# Check 4: Verify CORS configuration includes origin validation function
if ! grep -q "function matchOrigin" "$BACKEND_DIR/server.js"; then
  echo "⚠️  WARNING: matchOrigin function not found in server.js"
  echo "   Ensure CORS uses proper origin validation"
fi

# Check 5: Verify startup banner logs allowlist_count (not actual origins)
if grep -q "logger.info.*CORS allowed origins.*allowedOrigins" "$BACKEND_DIR/server.js"; then
  echo "❌ FAIL: Logging actual CORS origins (security leak)"
  echo "   Log only allowlist_count, never the actual origins"
  exit 1
fi

echo "✅ PASS: No insecure CORS patterns detected"
exit 0
