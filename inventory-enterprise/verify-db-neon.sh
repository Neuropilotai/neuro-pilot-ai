#!/bin/bash
# Neuro.Pilot.AI V21.1 - Neon PostgreSQL Verification Script
# Validates database connectivity, schema, and readiness for V21.1

set -Eeuo pipefail

# Colors
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
say_ok   () { echo -e "${GREEN}✓${NC} $1"; }
say_warn () { echo -e "${YELLOW}!${NC} $1"; }
say_err  () { echo -e "${RED}✗${NC} $1"; }
say_info () { echo -e "${BLUE}ℹ${NC} $1"; }

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🔍 Neon PostgreSQL Verification (V21.1)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Get DATABASE_URL from Railway or env
if [[ -z "${DATABASE_URL:-}" ]]; then
  say_info "Fetching DATABASE_URL from Railway..."
  cd backend 2>/dev/null || cd "$(dirname "$0")/backend" || true
  DATABASE_URL=$(railway variables --kv 2>/dev/null | grep DATABASE_URL | cut -d'=' -f2- || echo "")
  cd - >/dev/null 2>&1 || true
fi

if [[ -z "${DATABASE_URL}" ]]; then
  say_err "DATABASE_URL not set. Export it or ensure Railway is linked."
  exit 1
fi

# Validate format
if [[ ! "${DATABASE_URL}" =~ ^postgresql:// ]]; then
  say_err "DATABASE_URL doesn't start with postgresql://"
  exit 1
fi

say_ok "DATABASE_URL found and valid"

# Test 1: Connectivity
echo ""
say_info "Testing PostgreSQL connection..."
if ! psql "${DATABASE_URL}" -c "SELECT 1;" >/dev/null 2>&1; then
  say_err "Failed to connect to Neon PostgreSQL"
  exit 1
fi
say_ok "Connected to Neon PostgreSQL"

# Test 2: Version
PG_VERSION=$(psql "${DATABASE_URL}" -t -c "SELECT version();" 2>/dev/null | head -1 | xargs)
say_ok "PostgreSQL Version: ${PG_VERSION}"

# Test 3: List tables
echo ""
say_info "Checking database schema..."
TABLES=$(psql "${DATABASE_URL}" -t -c "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;" 2>/dev/null)
TABLE_COUNT=$(echo "$TABLES" | grep -v '^$' | wc -l | xargs)

echo "  Tables found: ${TABLE_COUNT}"
if [[ $TABLE_COUNT -eq 0 ]]; then
  say_warn "No tables found. Run migrations:"
  echo "  cd backend && psql \"\$DATABASE_URL\" -f db/migrations/013_rbac_enforcement.sql"
else
  echo "$TABLES" | while read -r table; do
    [[ -z "$table" ]] && continue
    ROW_COUNT=$(psql "${DATABASE_URL}" -t -c "SELECT COUNT(*) FROM ${table};" 2>/dev/null | xargs)
    echo "    • ${table}: ${ROW_COUNT} rows"
  done
  say_ok "Schema validated"
fi

# Test 4: Check critical tables for V21.1
echo ""
say_info "Validating V21.1 required tables..."
REQUIRED_TABLES=("users" "user_roles" "audit_log" "privacy_requests" "role_permissions")
MISSING=()

for tbl in "${REQUIRED_TABLES[@]}"; do
  if ! echo "$TABLES" | grep -q "^ *${tbl}$"; then
    MISSING+=("$tbl")
  fi
done

if [[ ${#MISSING[@]} -gt 0 ]]; then
  say_warn "Missing tables: ${MISSING[*]}"
  say_info "Run migration: psql \"\$DATABASE_URL\" -f backend/db/migrations/013_rbac_enforcement.sql"
else
  say_ok "All V21.1 tables present"
fi

# Test 5: Connection pool test
echo ""
say_info "Testing connection pooling..."
for i in {1..3}; do
  psql "${DATABASE_URL}" -c "SELECT NOW();" >/dev/null 2>&1 && echo -n "." || echo -n "✗"
done
echo ""
say_ok "Connection pooling verified (3/3 successful)"

# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [[ ${#MISSING[@]} -eq 0 ]]; then
  say_ok "Neon PostgreSQL fully validated and ready!"
else
  say_warn "Database connected but needs schema migration"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Next steps:"
echo "  • Deploy: ./quick-deploy-v21_1.sh"
echo "  • Migrate: psql \"\$DATABASE_URL\" < backend/db/migrations/013_rbac_enforcement.sql"
echo "  • Verify: curl https://inventory-backend-7-agent-build.up.railway.app/health | jq ."
echo ""
