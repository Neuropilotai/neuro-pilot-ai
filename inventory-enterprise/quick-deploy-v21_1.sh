#!/bin/bash
# Neuro.Pilot.AI V21.1 - Quick Deployment Script (Hardened)
# Safe to run from repo root OR from inside backend; auto-detects paths.

set -Eeuo pipefail

# ───────────────────────────────── Colors ──────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
say_step () { echo -e "${BLUE}[$1]${NC} $2"; }
say_ok   () { echo -e "${GREEN}✓${NC} $1"; }
say_warn () { echo -e "${YELLOW}!${NC} $1"; }
say_err  () { echo -e "${RED}✗ ERROR:${NC} $1"; }

trap 'say_err "Script failed on line $LINENO. Check the output above."; exit 1' ERR

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🚀 Neuro.Pilot.AI — V21.1 Quick Deploy"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ───────────────────────────── Path Resolution ────────────────────────────────
# Find repo root from this script's location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${SCRIPT_DIR}"
BACKEND_DIR="${REPO_ROOT}/backend"
DEPLOY_SCRIPT="${REPO_ROOT}/DEPLOY_V21_1_NOW.sh"
SMOKE_SCRIPT="${BACKEND_DIR}/scripts/smoke-test-v21_1.sh"

# If user ran from inside backend and this script lives there, adjust
if [[ ! -d "$BACKEND_DIR" ]] && [[ -d "${SCRIPT_DIR}/../backend" ]]; then
  REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
  BACKEND_DIR="${REPO_ROOT}/backend"
  DEPLOY_SCRIPT="${REPO_ROOT}/DEPLOY_V21_1_NOW.sh"
  SMOKE_SCRIPT="${BACKEND_DIR}/scripts/smoke-test-v21_1.sh"
fi

# ───────────────────────────── Preflight Checks ───────────────────────────────
say_step "1/6" "Checking required CLIs (railway, psql, curl, jq)..."
for bin in railway psql curl jq; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    say_err "Missing dependency: $bin"
    if [[ "$bin" == "railway" ]]; then
      echo "Install Railway CLI:"
      echo "  curl -fsSL https://railway.app/install.sh | sh"
    fi
    exit 1
  fi
done
say_ok "All required CLIs available."

say_step "2/6" "Validating Railway session and project link..."
if ! railway whoami >/dev/null 2>&1; then
  say_err "Not logged into Railway."
  echo "Run: railway login"
  exit 1
fi
# Ensure we're linked to the correct project/service
if ! railway status >/dev/null 2>&1; then
  say_warn "This directory is not linked to a Railway service."
  echo "Run inside repo root:"
  echo "  railway link"
  exit 1
fi
say_ok "Railway session and link confirmed."

say_step "3/6" "Fetching and sanitizing DATABASE_URL from Railway..."
RAW_DB_URL="$(railway variables get DATABASE_URL 2>/dev/null || true)"
DATABASE_URL="$(echo -n "$RAW_DB_URL" | tr -d '\r\n' | sed 's/[[:space:]]*$//')"
if [[ -z "${DATABASE_URL}" || ( "${DATABASE_URL}" != postgresql* && "${DATABASE_URL}" != postgres* ) ]]; then
  say_err "Invalid or empty DATABASE_URL from Railway."
  echo "Tip: Check your service variables in Railway → Variables (DATABASE_URL)."
  exit 1
fi
export DATABASE_URL
say_ok "DATABASE_URL ok."

say_step "4/6" "Determining BASE (public backend URL)..."
# Prefer env override, else Railway var BASE or NEXT_PUBLIC_BASE_URL, else known staging
# You can customize this detection per your env setup.
BASE="${BASE:-}"
if [[ -z "${BASE}" ]]; then
  RAW_BASE="$(railway variables get BASE 2>/dev/null || true)"
  BASE="$(echo -n "$RAW_BASE" | tr -d '\r\n' | sed 's/[[:space:]]*$//')"
fi
if [[ -z "${BASE}" ]]; then
  RAW_NEXT="$(railway variables get NEXT_PUBLIC_BASE_URL 2>/dev/null || true)"
  BASE="$(echo -n "$RAW_NEXT" | tr -d '\r\n' | sed 's/[[:space:]]*$//')"
fi
if [[ -z "${BASE}" ]]; then
  # Fallback to known staging domain
  BASE="https://inventory-backend-7-agent-build.up.railway.app"
fi
export BASE
say_ok "BASE set to: ${BASE}"

# ───────────────────────────── Run Full Deployment ────────────────────────────
say_step "5/6" "Running full deployment script..."
if [[ ! -f "$DEPLOY_SCRIPT" ]]; then
  say_err "Deploy script not found at: $DEPLOY_SCRIPT"
  echo "Expected file missing. Ensure you're on the V21.1 branch/commit."
  exit 1
fi
chmod +x "$DEPLOY_SCRIPT"
echo "  (This may take 5–8 minutes)"
"$DEPLOY_SCRIPT"

# ───────────────────────────── Smoke Tests (Optional) ─────────────────────────
say_step "6/6" "Running smoke tests (if available)..."
export EMAIL="${EMAIL:-owner@neuropilot.ai}"

if [[ -z "${NEUROPILOT_PASSWORD:-}" ]]; then
  read -r -s -p "$(echo -e "${YELLOW}Enter password for ${EMAIL}:${NC} ")" PASS
  echo ""
else
  PASS="${NEUROPILOT_PASSWORD}"
fi
export PASS

if [[ -f "$SMOKE_SCRIPT" ]]; then
  chmod +x "$SMOKE_SCRIPT"
  "$SMOKE_SCRIPT" || { say_warn "Smoke tests reported issues. Inspect logs and metrics."; }
  say_ok "Smoke tests completed."
else
  say_warn "Smoke test script not found at: $SMOKE_SCRIPT — skipping."
fi

# ───────────────────────────── Post Summary ───────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
say_ok "V21.1 Deployment flow completed."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Next:"
echo "  • Health:        curl -fsS ${BASE}/health | jq ."
echo "  • Metrics:       curl -fsS ${BASE}/metrics | grep _total | head"
echo "  • Security:      curl -fsS ${BASE}/api/security/status"
echo "  • Enable cron:   railway variables set SCHEDULER_ENABLED=true"
echo ""
