#!/usr/bin/env bash
# NEURO PILOT AI - PRODUCTION DEPLOYMENT (hardened)
set -Eeuo pipefail
IFS=$'\n\t'

# ── Colors & traps ───────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
trap 'echo -e "'"${RED}"'❌ Error at line $LINENO. Aborting.'"${NC}"'"' ERR
die(){ echo -e "${RED}$*${NC}"; exit 1; }
ok(){ echo -e "${GREEN}$*${NC}"; }
log(){ echo -e "${BLUE}$*${NC}"; }
warn(){ echo -e "${YELLOW}$*${NC}"; }

# ── Config (prod app uses base name) ────────────────────────────────────────────
APP_NAME="${APP_NAME:-neuro-pilot-inventory}"
REGION="${REGION:-yul}"
VOLUME_NAME="data"
VOLUME_SIZE_GB="${VOLUME_SIZE_GB:-10}"
TIMEOUT_SECS="${TIMEOUT_SECS:-180}"
ROTATE_SECRETS="${ROTATE_SECRETS:-false}"   # set true only when you intend to rotate

echo "🚀 NEURO PILOT AI - PRODUCTION DEPLOYMENT"
echo "========================================="

# ── Password intake (secure) ───────────────────────────────────────────────────
PASS_MODE="prompt"  # prompt|stdin|file|env
PASS_FILE=""
for ((i=1;i<=$#;i++)); do
  case "${!i}" in
    --password-stdin) PASS_MODE="stdin" ;;
    --password-file)  PASS_MODE="file"; j=$((i+1)); PASS_FILE="${!j:-}";;
    --password-env)   PASS_MODE="env" ;;
  esac
done

get_password(){
  case "$PASS_MODE" in
    stdin)
      if [ -t 0 ]; then die "Use: printf '%s' 'PASSWORD' | $0 --password-stdin"; fi
      ADMIN_PASSWORD="$(cat -)";;
    file)
      [[ -r "$PASS_FILE" ]] || die "Password file not readable: $PASS_FILE"
      ADMIN_PASSWORD="$(cat "$PASS_FILE")";;
    env)
      [[ -n "${ADMIN_PASSWORD:-}" ]] || die "ADMIN_PASSWORD env var empty";;
    prompt)
      read -s -p "Enter admin password: " ADMIN_PASSWORD; echo;;
    *) die "Unknown PASS_MODE: $PASS_MODE";;
  esac
  [[ -n "$ADMIN_PASSWORD" ]] || die "Empty password not allowed."
}
get_password

# ── Bcrypt hash (no echoing sensitive data) ─────────────────────────────────────
command -v node >/dev/null 2>&1 || die "Node.js required"
if ! node -e "require.resolve('bcrypt')" >/dev/null 2>&1; then
  warn "bcrypt not found; installing locally…"
  mkdir -p .deploy_tmp_bcrypt && pushd .deploy_tmp_bcrypt >/dev/null
  npm init -y >/dev/null 2>&1 || true
  npm i bcrypt --no-save --silent
  export NODE_PATH="$(pwd)/node_modules${NODE_PATH:+:$NODE_PATH}"
  popd >/dev/null
fi
export ADMIN_PASSWORD
ADMIN_HASH="$(NODE_PATH="${NODE_PATH:-}" node -e "require('bcrypt').hash(process.env.ADMIN_PASSWORD,12).then(h=>console.log(h))")"
unset ADMIN_PASSWORD
[[ -n "$ADMIN_HASH" ]] || die "Failed to generate bcrypt hash"
ok "✅ Admin hash generated"

# ── Volume ensure (app-scoped) ──────────────────────────────────────────────────
log "Step 1: Ensure Fly volume '${VOLUME_NAME}' (${VOLUME_SIZE_GB}GB @ ${REGION})"
if fly volumes list --app "${APP_NAME}" | awk '{print $2}' | grep -qx "${VOLUME_NAME}"; then
  ok "✓ Volume '${VOLUME_NAME}' already exists"
else
  fly volumes create "${VOLUME_NAME}" --size "${VOLUME_SIZE_GB}" --region "${REGION}" --app "${APP_NAME}"
  ok "✓ Volume created"
fi

# ── Secrets (staged + commit; no forced rotation) ───────────────────────────────
log "Step 2: Set production secrets"
STAGED_SECRETS=$(
  cat <<EOF
NODE_ENV=production
ALLOWED_ORIGINS=https://inventory.neuropilot.ai
ADMIN_EMAIL=admin@secure-inventory.com
ADMIN_HASH=${ADMIN_HASH}
EOF
)
if [[ "${ROTATE_SECRETS}" == "true" ]]; then
  warn "Rotating JWT/REFRESH/ENCRYPTION secrets (sessions may be invalidated)"
  STAGED_SECRETS+=$'\n'"JWT_SECRET=$(openssl rand -hex 64)"
  STAGED_SECRETS+=$'\n'"REFRESH_SECRET=$(openssl rand -hex 64)"
  STAGED_SECRETS+=$'\n'"ENCRYPTION_KEY=$(openssl rand -hex 32)"
else
  warn "Not rotating long-lived secrets (set ROTATE_SECRETS=true to rotate)"
fi
printf "%s\n" "${STAGED_SECRETS}" | fly secrets set --app "${APP_NAME}" --stage - >/dev/null
fly secrets set --app "${APP_NAME}" >/dev/null
ok "✓ Secrets applied"

# ── Deploy (app-scoped) ─────────────────────────────────────────────────────────
log "Step 3: Deploy to Fly.io (${APP_NAME})"
fly deploy --app "${APP_NAME}"
ok "✓ Deployment initiated"

# ── Health polling (no blind sleeps) ────────────────────────────────────────────
log "Step 4: Wait for health checks (timeout: ${TIMEOUT_SECS}s)"
SECS=0; SLEEP=5
while (( SECS < TIMEOUT_SECS )); do
  if fly checks list --app "${APP_NAME}" | grep -q "passing"; then
    ok "✓ Health checks passing"
    break
  fi
  sleep "${SLEEP}"
  SECS=$((SECS+SLEEP))
done
if (( SECS >= TIMEOUT_SECS )); then
  fly checks list --app "${APP_NAME}" || true
  die "Health checks did not pass within ${TIMEOUT_SECS}s."
fi
fly status --app "${APP_NAME}" || true

# ── Verification (no hard-coded passwords) ──────────────────────────────────────
log "Step 5: Verification"
if [[ -x "./deploy-verify.sh" ]]; then
  read -s -p "Re-enter admin password for verification: " VERIFY_PASS; echo
  ./deploy-verify.sh "${VERIFY_PASS}"
elif [[ -x "./deploy-verify-enhanced.sh" ]]; then
  read -s -p "Re-enter admin password for verification: " VERIFY_PASS; echo
  ./deploy-verify-enhanced.sh "${VERIFY_PASS}"
else
  warn "No verification script found. Manual checks:"
  echo "  curl -I https://inventory.neuropilot.ai/health"
  echo "  curl -i -X POST https://inventory.neuropilot.ai/auth/login \\"
  echo "     -H 'Origin: https://inventory.neuropilot.ai' -H 'Content-Type: application/json' \\"
  echo "     --data '{\"email\":\"admin@secure-inventory.com\",\"password\":\"<PASSWORD>\"}'"
fi

ok "🎯 Deployment complete!"
echo "Next: Cloudflare rules • monitoring/alerts • scheduled backups • multi-network tests"