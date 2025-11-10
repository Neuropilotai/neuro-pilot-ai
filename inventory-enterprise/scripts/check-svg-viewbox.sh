#!/usr/bin/env bash
set -euo pipefail
if grep -RIn --include=\*.{html,js,svg} 'viewBox="[^"]*\(%\|px\)' inventory-enterprise >/dev/null 2>&1; then
  echo "❌ Found invalid viewBox (with % or px). Fix before deploy."
  grep -RIn --include=\*.{html,js,svg} 'viewBox="[^"]*\(%\|px\)' inventory-enterprise || true
  exit 1
else
  echo "✅ No invalid viewBox found."
fi
