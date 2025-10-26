#!/usr/bin/env bash
set -euo pipefail

# --------- Config (edit as needed) ----------
BACKEND_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MIG_DIR="$BACKEND_DIR/migrations"

# Server expects ALLOW_ORIGIN (singular)
FRONTEND_ORIGIN="${FRONTEND_ORIGIN:-https://your-frontend.vercel.app}"

# DATABASE_URL must be set in the environment to your Neon DB (pooled is OK)
: "${DATABASE_URL:?Set DATABASE_URL to your Neon Postgres URL}"

# Optional: email/pass to seed or test
SEED_EMAIL="${SEED_EMAIL:-neuropilotai@gmail.com}"
SEED_PASS="${SEED_PASS:-TestPassword123!}"
# -------------------------------------------

cd "$BACKEND_DIR"

need() { command -v "$1" >/dev/null 2>&1 || { echo "❌ Missing $1"; exit 1; }; }
need psql
need railway
need jq
need curl

# 1) Ensure secrets exist locally
if [[ ! -f ".jwt_secret" || ! -f ".refresh_secret" ]]; then
  echo "ℹ️  Generating secrets..."
  "$BACKEND_DIR/scripts/generate_production_secrets.sh"
fi

# 2) Run migrations (idempotent)
echo "🗃  Running migrations on Neon..."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$MIG_DIR/001_schema.sql"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$MIG_DIR/002_roles_and_grants.sql"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$MIG_DIR/003_rls_policies.sql"
if [[ -f "$MIG_DIR/004_auth.sql" ]]; then
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$MIG_DIR/004_auth.sql"
fi

# 3) Seed an admin (safe UPSERT)
echo "👤 Seeding admin user (if missing)…"
psql "$DATABASE_URL" <<SQL
INSERT INTO app_user (email, display_name, role, password_hash)
VALUES (
  '$SEED_EMAIL',
  'NeuroPilot Admin',
  'admin',
  crypt('$SEED_PASS', gen_salt('bf', 12))
)
ON CONFLICT (email) DO UPDATE
SET role = EXCLUDED.role
RETURNING id, email, role;
SQL

# 4) Push Railway variables
echo "🔧 Setting Railway environment variables…"
railway variables set DATABASE_URL="$DATABASE_URL"
railway variables set NODE_ENV="production"
railway variables set PORT="8080"
railway variables set ALLOW_ORIGIN="$FRONTEND_ORIGIN"
railway variables set JWT_SECRET="$(cat .jwt_secret)"
railway variables set REFRESH_TOKEN_SECRET="$(cat .refresh_secret)"
railway variables set ACCESS_TTL_MIN="30"
railway variables set REFRESH_TTL_DAYS="90"

# 5) Deploy (assumes project/service already linked)
echo "🚀 Deploying on Railway…"
railway up --detached || railway deploy --detached

# 6) Discover public URL
echo "🔎 Fetching Railway domain…"
RAILWAY_URL="$(railway domain | head -n1 | tr -d '[:space:]')"
if [[ -z "$RAILWAY_URL" ]]; then
  echo "⚠️ Could not auto-detect domain. Open Railway dashboard to copy the URL."
  exit 1
fi
echo "🌐 Service URL: $RAILWAY_URL"

# 7) Health check
echo "🩺 Health check…"
curl -fsSL "$RAILWAY_URL/health" && echo -e "\n✅ Health OK" || { echo "❌ Health check failed"; exit 1; }

# 8) Login smoke test
echo "🔑 Login smoke test…"
LOGIN_JSON="$(curl -s -X POST "$RAILWAY_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$SEED_EMAIL\",\"password\":\"$SEED_PASS\"}")" || true

if [[ "$(echo "$LOGIN_JSON" | jq -r '.token // empty')" == "" ]]; then
  echo "⚠️ Login did not return a token. Check logs: railway logs -f"
  exit 1
fi

TOKEN="$(echo "$LOGIN_JSON" | jq -r '.token')"
echo "🔓 /auth/me…"
curl -fsSL "$RAILWAY_URL/api/auth/me" -H "Authorization: Bearer $TOKEN" | jq . && echo "✅ Auth OK"

echo "🎉 Staging deployment complete."
echo "   Frontend CORS origin: $FRONTEND_ORIGIN"
echo "   API base: $RAILWAY_URL"
