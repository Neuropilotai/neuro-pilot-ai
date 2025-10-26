#!/usr/bin/env bash
set -euo pipefail

# verify-staging-readiness.sh
# "Green Light to Staging" Checklist
# Run before deploying to Railway/Vercel

echo "🚦 Green Light to Staging Verification"
echo "========================================"
echo ""

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$BACKEND_DIR"

PASS=0
FAIL=0

check() {
  local name="$1"
  shift

  if "$@"; then
    echo "✅ $name"
    PASS=$((PASS + 1))
    return 0
  else
    echo "❌ $name"
    FAIL=$((FAIL + 1))
    return 1
  fi
}

check_file_perms() {
  local file="$1"
  local perms=$(ls -l "$file" 2>/dev/null | awk '{print $1}')
  [ "$perms" = "-rw-------" ] || [ "$perms" = "-rw-------@" ]
}

check_secret_size() {
  local file="$1"
  local size=$(wc -c < "$file" | tr -d ' ')
  [ "$size" -ge 64 ]
}

echo "1️⃣  Secret Management"
echo "--------------------"
check "JWT secret file exists" test -f .jwt_secret
check "Refresh secret file exists" test -f .refresh_secret
check "JWT secret is 600 permissions" check_file_perms .jwt_secret
check "Refresh secret is 600 permissions" check_file_perms .refresh_secret
check "JWT secret ≥64 chars" check_secret_size .jwt_secret
check "Refresh secret ≥64 chars" check_secret_size .refresh_secret
echo ""

echo "2️⃣  Git Security"
echo "----------------"
check ".gitignore exists" test -f .gitignore
check ".gitignore blocks .jwt_secret" grep -q '\.jwt_secret' .gitignore
check ".gitignore blocks .refresh_secret" grep -q '\.refresh_secret' .gitignore
check ".gitignore blocks .env" grep -q '\.env' .gitignore
echo ""

echo "3️⃣  Database Migrations"
echo "-----------------------"
check "001_schema.sql exists" test -f migrations/001_schema.sql
check "002_roles_and_grants.sql exists" test -f migrations/002_roles_and_grants.sql
check "003_rls_policies.sql exists" test -f migrations/003_rls_policies.sql
check "004_auth.sql exists" test -f migrations/004_auth.sql
echo ""

echo "4️⃣  Frontend Integration"
echo "------------------------"
check "auth.js has refreshIfNeeded()" grep -q 'export async function refreshIfNeeded' ../frontend/src/lib/auth.js
check "api.js uses getAuthHeaderWithRefresh()" grep -q 'getAuthHeaderWithRefresh' ../frontend/src/lib/api.js
check "api.js imports refreshIfNeeded" grep -q 'refreshIfNeeded' ../frontend/src/lib/api.js
echo ""

echo "5️⃣  Deployment Scripts"
echo "----------------------"
check "generate_production_secrets.sh is executable" test -x scripts/generate_production_secrets.sh
check "stage-deploy.sh is executable" test -x scripts/stage-deploy.sh
check "smoke-test.sh is executable" test -x scripts/smoke-test.sh
check "dr-drill.sh is executable" test -x scripts/dr-drill.sh
echo ""

echo "6️⃣  Security Documentation"
echo "---------------------------"
check "SECURITY_HARDENING_v16.6.md exists" test -f SECURITY_HARDENING_v16.6.md
check "DEPLOYMENT_READINESS_REPORT_v16.6.md exists" test -f DEPLOYMENT_READINESS_REPORT_v16.6.md
echo ""

echo "========================================"
echo "Results: $PASS passed, $FAIL failed"
echo ""

if [ $FAIL -eq 0 ]; then
  echo "🎉 GREEN LIGHT - Ready for Staging Deployment!"
  echo ""
  echo "📋 Pre-Deployment Checklist:"
  echo "   1. Set FRONTEND_ORIGIN environment variable"
  echo "      export FRONTEND_ORIGIN=\"https://your-frontend.vercel.app\""
  echo ""
  echo "   2. Set DATABASE_URL environment variable"
  echo "      export DATABASE_URL=\"postgresql://user:pass@host/db\""
  echo ""
  echo "   3. Deploy to staging:"
  echo "      ./scripts/stage-deploy.sh"
  echo ""
  echo "   4. Run smoke tests:"
  echo "      RAILWAY_URL=\"https://your-app.up.railway.app\" ./scripts/smoke-test.sh"
  echo ""
  exit 0
else
  echo "⚠️  RED LIGHT - Fix issues above before deploying"
  exit 1
fi
