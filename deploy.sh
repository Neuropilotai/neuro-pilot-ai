#!/usr/bin/env bash
# NeuroPilot Inventory – Multi-Env Deploy (dev|staging|prod)
# Safe password prompt • optional secret rotation • app-scoped Fly • health polling • hooks

set -Eeuo pipefail
IFS=$'\n\t'

################################
# Defaults (override via flags)
################################
ENV="prod"                       # dev|staging|prod
APP_PREFIX="neuro-pilot-inventory"
REGION_DEFAULT="yyz"
REGION="$REGION_DEFAULT"
VOLUME_NAME="data"
VOLUME_SIZE_GB=10
ROTATE_SECRETS="false"
RUN_VERIFY="true"
TIMEOUT_SECS=180
HOOKS_DIR="./hooks"
VERIFY_SCRIPT_PRIMARY="./deploy-verify.sh"
VERIFY_SCRIPT_ALT="./deploy-verify-enhanced.sh"
PASS_MODE="prompt"           # prompt|stdin|file|env
PASS_FILE=""

# Per-env defaults (override with flags)
ALLOWED_ORIGINS_DEV="http://localhost:5173,http://localhost:3000"
ALLOWED_ORIGINS_STAGING="https://staging.inventory.neuropilot.ai"
ALLOWED_ORIGINS_PROD="https://inventory.neuropilot.ai,https://neuro-pilot-inventory.fly.dev"

ADMIN_EMAIL_DEV="admin@secure-inventory.dev"
ADMIN_EMAIL_STAGING="admin@secure-inventory.stg"
ADMIN_EMAIL_PROD="admin@neuro-pilot.ai"

ALLOWED_ORIGINS=""   # resolved after env selection
ADMIN_EMAIL=""       # resolved after env selection

################################
# UI helpers
################################
RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[1;33m'
BLUE=$'\033[0;34m'
NC=$'\033[0m'
trap 'echo -e "${RED}❌ Error at line $LINENO. Aborting.${NC}"' ERR
die(){ echo -e "${RED}$*${NC}"; exit 1; }
log(){ echo -e "${BLUE}$*${NC}"; }
ok(){ echo -e "${GREEN}$*${NC}"; }
warn(){ echo -e "${YELLOW}$*${NC}"; }
req(){ command -v "$1" >/dev/null 2>&1 || die "Missing dependency: $1"; }

# --- Origin helpers ---
uniq_csv() {
  # dedupe + keep order
  awk -v RS=',' '!seen[$0]++{out = out (NR>1?",":"") $0} END{print out}'
}

append_origin() {
  local csv="$1"; shift
  local add="$1"
  # empty csv → just return add
  if [[ -z "$csv" ]]; then echo -n "$add"; return 0; fi
  # append + dedupe
  printf "%s,%s" "$csv" "$add" | uniq_csv
}

compute_fly_origin() {
  # Uses APP_NAME computed later; returns https://<app>.fly.dev
  echo "https://${APP_NAME}.fly.dev"
}

usage(){
cat <<USAGE
Usage: $(basename "$0") [options]

Options:
  -e, --env <dev|staging|prod>     Environment (default: prod)
  -a, --app-prefix <string>        Fly app prefix (default: ${APP_PREFIX})
  -r, --region <code>              Fly region (default: ${REGION_DEFAULT})
  -o, --origins <csv>              Allowed origins override (comma-separated)
  -m, --admin-email <email>        Admin email override
  -s, --rotate-secrets             Rotate JWT/REFRESH/ENCRYPTION secrets
  -n, --no-verify                  Skip post-deploy verification
  -v, --volume-size <GB>           Volume size (default: ${VOLUME_SIZE_GB})
  -t, --timeout <seconds>          Health timeout (default: ${TIMEOUT_SECS})
  --password-stdin                 Read password from stdin
  --password-file <file>           Read password from file
  --password-env                   Use ADMIN_PASSWORD env var
  -h, --help                       Show help

Hooks (optional, auto-run if executable):
  ${HOOKS_DIR}/pre-\$ENV.sh        Run before deploy (e.g., backups)
  ${HOOKS_DIR}/post-\$ENV.sh       Run after deploy (e.g., verify backup)

Examples:
  $(basename "$0") --env dev --origins "http://localhost:5173"
  $(basename "$0") --env staging --rotate-secrets
  $(basename "$0") --env prod
USAGE
}

################################
# Parse flags
################################
while [[ $# -gt 0 ]]; do
  case "$1" in
    -e|--env) ENV="$2"; shift 2 ;;
    -a|--app-prefix) APP_PREFIX="$2"; shift 2 ;;
    -r|--region) REGION="$2"; shift 2 ;;
    -o|--origins) ALLOWED_ORIGINS="$2"; shift 2 ;;
    -m|--admin-email) ADMIN_EMAIL="$2"; shift 2 ;;
    -s|--rotate-secrets) ROTATE_SECRETS="true"; shift ;;
    -n|--no-verify) RUN_VERIFY="false"; shift ;;
    -v|--volume-size) VOLUME_SIZE_GB="$2"; shift 2 ;;
    -t|--timeout) TIMEOUT_SECS="$2"; shift 2 ;;
    --password-stdin) PASS_MODE="stdin"; shift ;;
    --password-file) PASS_MODE="file"; PASS_FILE="$2"; shift 2 ;;
    --password-env) PASS_MODE="env"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "Unknown option: $1 (see --help)";;
  esac
done

case "$ENV" in
  dev|development) ENV="dev" ;;
  staging|stage)   ENV="staging" ;;
  prod|production) ENV="prod" ;;
  *) die "ENV must be dev|staging|prod";;
esac

# App naming: prod uses base name, others get suffix
if [[ "$ENV" == "prod" ]]; then
  APP_NAME="${APP_PREFIX}"
else
  APP_NAME="${APP_PREFIX}-${ENV}"
fi

# Resolve per-env defaults if not overridden
if [[ -z "${ALLOWED_ORIGINS}" ]]; then
  case "$ENV" in
    dev)     ALLOWED_ORIGINS="$ALLOWED_ORIGINS_DEV" ;;
    staging) ALLOWED_ORIGINS="$ALLOWED_ORIGINS_STAGING" ;;
    prod)    ALLOWED_ORIGINS="$ALLOWED_ORIGINS_PROD" ;;
  esac
fi

# --- Auto-injections by environment ---
if [[ "$ENV" == "dev" ]]; then
  # Always include local static server origin for file-based UIs
  ALLOWED_ORIGINS="$(append_origin "${ALLOWED_ORIGINS}" "http://localhost:5500")"
fi

if [[ "$ENV" == "staging" ]]; then
  # Ensure the app's fly.dev URL is always allowed
  STAGING_FLY_ORIGIN="$(compute_fly_origin)"
  ALLOWED_ORIGINS="$(append_origin "${ALLOWED_ORIGINS}" "${STAGING_FLY_ORIGIN}")"
fi

# (prod: no automatic injections—prod remains strict)

if [[ -z "${ADMIN_EMAIL}" ]]; then
  case "$ENV" in
    dev)     ADMIN_EMAIL="$ADMIN_EMAIL_DEV" ;;
    staging) ADMIN_EMAIL="$ADMIN_EMAIL_STAGING" ;;
    prod)    ADMIN_EMAIL="$ADMIN_EMAIL_PROD" ;;
  esac
fi

################################
# Pre-flight checks
################################
ENV_UPPER=$(echo "$ENV" | tr '[:lower:]' '[:upper:]')
log "🚀 NEUROPILOT – Deploy ${ENV_UPPER} (${APP_NAME})"
echo "==============================================="
echo ""
log "Configuration:"
echo "  Environment: ${ENV}"
echo "  App Name: ${APP_NAME}"
echo "  Region: ${REGION}"
echo "  Allowed Origins: ${ALLOWED_ORIGINS}"
if [[ "$ENV" == "staging" && -n "${STAGING_FLY_ORIGIN:-}" ]]; then
  echo "  Staging Fly Origin: ${STAGING_FLY_ORIGIN}"
fi
echo "  Admin Email: ${ADMIN_EMAIL}"
echo "  Rotate Secrets: ${ROTATE_SECRETS}"
echo ""

req fly
req node
req openssl

# Check for bcrypt, install locally if missing
node -e "require.resolve('bcrypt')" >/dev/null 2>&1 || {
  warn "Node module 'bcrypt' not found. Installing locally..."
  npm install bcrypt --no-save >/dev/null 2>&1 || die "Failed to install bcrypt"
}

# Function to get password based on mode
get_password() {
  case "$PASS_MODE" in
    stdin)
      if [ -t 0 ]; then
        die "STDIN is a TTY; use a pipe: printf '%s' 'your-pass' | $0 --password-stdin ..."
      fi
      ADMIN_PASSWORD="$(cat -)"
      ;;
    file)
      [[ -n "$PASS_FILE" && -r "$PASS_FILE" ]] || die "Password file not readable: $PASS_FILE"
      ADMIN_PASSWORD="$(cat "$PASS_FILE")"
      ;;
    env)
      [[ -n "${ADMIN_PASSWORD:-}" ]] || die "ADMIN_PASSWORD env var is empty"
      ;;
    prompt)
      read -s -p "Enter ADMIN password: " ADMIN_PASSWORD; echo
      ;;
    *)
      die "Unknown PASS_MODE: $PASS_MODE"
      ;;
  esac
  [[ -n "$ADMIN_PASSWORD" ]] || die "Empty password not allowed."
}

# Get password using selected method
get_password

# Validate password strength for production
if [[ "$ENV" == "prod" ]] && [[ ${#ADMIN_PASSWORD} -lt 12 ]]; then
  warn "⚠️  Production password should be at least 12 characters"
  if [[ "$PASS_MODE" == "prompt" ]]; then
    read -p "Continue anyway? (y/N): " -n 1 -r; echo
    [[ $REPLY =~ ^[Yy]$ ]] || exit 1
  fi
fi

log "Step 1: Generate admin password hash"
export ADMIN_PASSWORD
ADMIN_HASH="$(node -e "require('bcrypt').hash(process.env.ADMIN_PASSWORD, 12).then(h=>console.log(h)).catch(e=>{console.error(e);process.exit(1)})")"
unset ADMIN_PASSWORD
[[ -n "${ADMIN_HASH}" ]] || die "Failed to generate bcrypt hash."
ok "✓ Admin hash generated"

################################
# Pre-deploy hook (optional)
################################
if [[ -x "${HOOKS_DIR}/pre-${ENV}.sh" ]]; then
  log "Running pre-deploy hook: ${HOOKS_DIR}/pre-${ENV}.sh"
  "${HOOKS_DIR}/pre-${ENV}.sh" "${ENV}" "${APP_NAME}" || die "Pre-deploy hook failed"
else
  if [[ "$ENV" == "prod" ]]; then
    warn "No pre-deploy backup hook found for production (${HOOKS_DIR}/pre-${ENV}.sh)"
  fi
fi

################################
# Ensure volume exists (app-scoped)
################################
log "Step 2: Ensure volume '${VOLUME_NAME}' exists (${VOLUME_SIZE_GB}GB @ ${REGION})"
if fly volumes list --app "${APP_NAME}" 2>/dev/null | awk '{print $2}' | grep -qx "${VOLUME_NAME}"; then
  ok "✓ Volume '${VOLUME_NAME}' already exists"
else
  fly volumes create "${VOLUME_NAME}" --size "${VOLUME_SIZE_GB}" --region "${REGION}" --app "${APP_NAME}" || {
    warn "Volume creation failed - app might not exist yet, will be created during deploy"
  }
fi

################################
# Secrets (staged + commit)
################################
log "Step 3: Set secrets"

# Base secrets (always set)
STAGED_SECRETS=$(cat <<EOF
NODE_ENV=production
ALLOWED_ORIGINS=${ALLOWED_ORIGINS}
ADMIN_EMAIL=${ADMIN_EMAIL}
ADMIN_HASH=${ADMIN_HASH}
EOF
)

# Check existing secrets
EXISTING_SECRETS=$(fly secrets list --app "${APP_NAME}" 2>/dev/null || echo "")

# Handle secret rotation
if [[ "${ROTATE_SECRETS}" == "true" ]]; then
  warn "⚠️  Rotating JWT/REFRESH/ENCRYPTION secrets (will invalidate sessions)"
  read -p "Confirm rotation? (y/N): " -n 1 -r; echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    STAGED_SECRETS+=$'\n'"JWT_SECRET=$(openssl rand -hex 64)"
    STAGED_SECRETS+=$'\n'"REFRESH_SECRET=$(openssl rand -hex 64)"
    STAGED_SECRETS+=$'\n'"ENCRYPTION_KEY=$(openssl rand -hex 32)"
  fi
elif ! echo "$EXISTING_SECRETS" | grep -q "JWT_SECRET"; then
  log "Generating initial JWT/encryption secrets..."
  STAGED_SECRETS+=$'\n'"JWT_SECRET=$(openssl rand -hex 64)"
  STAGED_SECRETS+=$'\n'"REFRESH_SECRET=$(openssl rand -hex 64)"
  STAGED_SECRETS+=$'\n'"ENCRYPTION_KEY=$(openssl rand -hex 32)"
fi

# Set secrets using temporary file for reliability
SECRETS_FILE=$(mktemp)
echo "${STAGED_SECRETS}" > "${SECRETS_FILE}"
fly secrets import --app "${APP_NAME}" < "${SECRETS_FILE}" >/dev/null 2>&1 || {
  # Fallback: set individually if import fails
  while IFS='=' read -r key value; do
    fly secrets set "${key}=${value}" --app "${APP_NAME}" >/dev/null 2>&1 || true
  done < "${SECRETS_FILE}"
}
rm -f "${SECRETS_FILE}"
ok "✓ Secrets applied"

# Clear sensitive variables
unset ADMIN_HASH

################################
# Deploy (app-scoped)
################################
log "Step 4: Fly deploy (${APP_NAME})"
fly deploy --app "${APP_NAME}" || die "Deployment failed"
ok "✓ Deployment initiated"

################################
# Health polling (no blind sleep)
################################
log "Step 5: Wait for health checks (timeout: ${TIMEOUT_SECS}s)"
SECS=0
SLEEP=5
HEALTH_PASSED=false

while (( SECS < TIMEOUT_SECS )); do
  if fly checks list --app "${APP_NAME}" 2>/dev/null | grep -q "passing"; then
    HEALTH_PASSED=true
    ok "✓ Health checks passing"
    break
  fi
  echo -n "."
  sleep "${SLEEP}"
  SECS=$((SECS+SLEEP))
done

echo ""

if [[ "$HEALTH_PASSED" != "true" ]]; then
  fly checks list --app "${APP_NAME}" 2>/dev/null || true
  warn "Health checks did not fully pass within ${TIMEOUT_SECS}s"
  warn "Check manually with: fly logs --app ${APP_NAME}"
fi

fly status --app "${APP_NAME}" || true

################################
# Verify
################################
if [[ "${RUN_VERIFY}" == "true" ]]; then
  log "Step 6: Post-deploy verification"
  if [[ -x "${VERIFY_SCRIPT_PRIMARY}" ]]; then
    read -s -p "Re-enter ADMIN password for verification: " VERIFY_PASS; echo
    export ADMIN_PASSWORD="${VERIFY_PASS}"
    "${VERIFY_SCRIPT_PRIMARY}"
    unset ADMIN_PASSWORD
    ok "✓ Verification completed"
  elif [[ -x "${VERIFY_SCRIPT_ALT}" ]]; then
    read -s -p "Re-enter ADMIN password for verification: " VERIFY_PASS; echo
    export ADMIN_PASSWORD="${VERIFY_PASS}"
    "${VERIFY_SCRIPT_ALT}"
    unset ADMIN_PASSWORD
    ok "✓ Verification completed"
  else
    warn "No verification script found. Manual test commands:"
    MAIN_ORIGIN="${ALLOWED_ORIGINS%%,*}"
    echo ""
    echo "  # Test login (replace PASSWORD):"
    echo "  curl -X POST https://${APP_NAME}.fly.dev/auth/login \\"
    echo "    -H 'Origin: ${MAIN_ORIGIN}' \\"
    echo "    -H 'Content-Type: application/json' \\"
    echo "    --data '{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"<PASSWORD>\"}'"
    echo ""
    echo "  # Test health:"
    echo "  curl -I https://${APP_NAME}.fly.dev/health"
  fi
else
  warn "Verification skipped (--no-verify)."
fi

################################
# Post-deploy hook (optional)
################################
if [[ -x "${HOOKS_DIR}/post-${ENV}.sh" ]]; then
  log "Running post-deploy hook: ${HOOKS_DIR}/post-${ENV}.sh"
  "${HOOKS_DIR}/post-${ENV}.sh" "${ENV}" "${APP_NAME}" || warn "Post-deploy hook had issues"
fi

################################
# Summary
################################
echo ""
ok "🎯 Deploy complete for ${ENV} (${APP_NAME})"
echo ""
echo "App URL: https://${APP_NAME}.fly.dev"
echo "Origins: ${ALLOWED_ORIGINS}"
echo ""
log "Next steps:"
echo "  • Configure Cloudflare for custom domain"
echo "  • Set up monitoring/alerts"
echo "  • Configure automated backups"
echo "  • Test from multiple networks"
echo ""
log "Useful commands:"
echo "  fly logs --app ${APP_NAME}          # View logs"
echo "  fly ssh console --app ${APP_NAME}   # SSH into container"
echo "  fly status --app ${APP_NAME}        # Check status"
echo "  fly secrets list --app ${APP_NAME}  # List secrets"