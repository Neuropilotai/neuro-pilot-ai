#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."  # go to backend/

JWT_FILE=".jwt_secret"
REFRESH_FILE=".refresh_secret"

if ! command -v openssl >/dev/null 2>&1; then
  echo "❌ openssl not found. Install openssl and re-run." >&2
  exit 1
fi

if [[ -f "$JWT_FILE" || -f "$REFRESH_FILE" ]]; then
  echo "ℹ️  Existing secrets detected (.jwt_secret / .refresh_secret)."
  read -r -p "Regenerate? This will overwrite. (y/N): " yn
  case "$yn" in
    [Yy]*) ;;
    *) echo "Aborted."; exit 0;;
  esac
fi

umask 077
openssl rand -hex 64 > "$JWT_FILE"
openssl rand -hex 64 > "$REFRESH_FILE"
chmod 600 "$JWT_FILE" "$REFRESH_FILE"

echo "✅ Secrets generated:"
echo "  - $JWT_FILE (len: $(wc -c < "$JWT_FILE" | tr -d ' ') bytes)"
echo "  - $REFRESH_FILE (len: $(wc -c < "$REFRESH_FILE" | tr -d ' ') bytes)"
echo "🔒 Contents not printed for safety."
