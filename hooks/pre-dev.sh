#!/usr/bin/env bash
set -Eeuo pipefail

ENV="$1"
APP="$2"

echo "🔧 Pre-${ENV} setup for ${APP}"
echo "==========================================="

# For dev, just ensure directories exist
mkdir -p ./data
mkdir -p ./backups/dev

echo "✅ Dev environment prepared"