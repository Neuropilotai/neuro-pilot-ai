#!/usr/bin/env bash
set -euo pipefail

# cloudflare-setup.sh
# Option 1 — DNS + SSL + Security Baseline
# Configures Cloudflare for NeuroPilot v16.6

# What this does:
#   • Adds inventory.neuropilot.ai → Vercel CNAME
#   • Adds api.neuropilot.ai → Railway CNAME
#   • Sets Full (Strict) SSL, Always HTTPS, HSTS (1y, preload)
#   • Enables Brotli compression + Auto Minify
#   • Creates basic WAF rules (SQLi/XSS)
#   • Sets login rate limit (5 req/15m per IP)

echo "☁️  Cloudflare Setup - NeuroPilot v16.6"
echo "======================================="
echo ""

# Verify required environment variables
: "${CF_API_TOKEN:?❌ Set CF_API_TOKEN environment variable}"
: "${CF_ZONE_ID:?❌ Set CF_ZONE_ID environment variable}"
: "${VERCEL_HOST:?❌ Set VERCEL_HOST environment variable}"
: "${RAILWAY_HOST:?❌ Set RAILWAY_HOST environment variable}"

echo "✅ Environment variables verified"
echo "   Zone ID: ${CF_ZONE_ID:0:20}..."
echo "   Vercel: $VERCEL_HOST"
echo "   Railway: $RAILWAY_HOST"
echo ""

# Helper function for Cloudflare API calls
api() {
  local method="$1"
  local endpoint="$2"
  local data="${3:-}"

  curl -sS -X "$method" "https://api.cloudflare.com/client/v4$endpoint" \
    -H "Authorization: Bearer $CF_API_TOKEN" \
    -H "Content-Type: application/json" \
    ${data:+--data "$data"}
}

# 1. Create DNS records
echo "1️⃣  Creating DNS records..."
echo "   → inventory.neuropilot.ai → $VERCEL_HOST"

api POST "/zones/$CF_ZONE_ID/dns_records" "$(jq -nc \
  --arg name "inventory" \
  --arg target "$VERCEL_HOST" \
  '{type:"CNAME",name:$name,content:$target,ttl:1,proxied:true}')" | jq -r '.success'

echo "   → api.neuropilot.ai → $RAILWAY_HOST"

api POST "/zones/$CF_ZONE_ID/dns_records" "$(jq -nc \
  --arg name "api" \
  --arg target "$RAILWAY_HOST" \
  '{type:"CNAME",name:$name,content:$target,ttl:1,proxied:true}')" | jq -r '.success'

echo "   ✅ DNS records created"
echo ""

# 2. SSL/TLS Configuration
echo "2️⃣  Configuring SSL/TLS..."
echo "   → Full (Strict) mode"

api PATCH "/zones/$CF_ZONE_ID/settings/ssl" '{"value":"strict"}' | jq -r '.success'

echo "   → Always Use HTTPS"

api PATCH "/zones/$CF_ZONE_ID/settings/always_use_https" '{"value":"on"}' | jq -r '.success'

echo "   ✅ SSL configured"
echo ""

# 3. HSTS Configuration
echo "3️⃣  Enabling HSTS..."
echo "   → Max-Age: 31536000 (1 year)"
echo "   → Include Subdomains: true"
echo "   → Preload: true"

api PATCH "/zones/$CF_ZONE_ID/settings/security_header" \
'{
  "value": {
    "strict_transport_security": {
      "enabled": true,
      "max_age": 31536000,
      "include_subdomains": true,
      "preload": true,
      "nosniff": true
    }
  }
}' | jq -r '.success'

echo "   ✅ HSTS enabled"
echo ""

# 4. Performance Optimizations
echo "4️⃣  Enabling Performance Optimizations..."
echo "   → Brotli compression"

api PATCH "/zones/$CF_ZONE_ID/settings/brotli" '{"value":"on"}' | jq -r '.success'

echo "   → Auto Minify (JS, CSS, HTML)"

api PATCH "/zones/$CF_ZONE_ID/settings/minify" \
'{"value":{"js":"on","css":"on","html":"on"}}' | jq -r '.success'

echo "   ✅ Performance optimized"
echo ""

# 5. WAF Rules
echo "5️⃣  Creating WAF Rules..."

create_firewall_rule() {
  local desc="$1"
  local expr="$2"
  local action="$3"

  echo "   → $desc"

  # Create filter first
  local filter_id=$(api POST "/zones/$CF_ZONE_ID/filters" "$(jq -nc \
    --arg e "$expr" \
    --arg d "$desc" \
    '{expression:$e,description:$d}')" | jq -r '.result[0].id')

  # Create firewall rule using filter
  api POST "/zones/$CF_ZONE_ID/firewall/rules" "$(jq -nc \
    --arg f "$filter_id" \
    --arg a "$action" \
    --arg d "$desc" \
    '[{filter_id:$f,action:$a,description:$d}]')" | jq -r '.success'
}

create_firewall_rule \
  "Block SQL Injection" \
  "(http.request.uri.query contains \"UNION SELECT\" or http.request.uri.query contains \"'; DROP TABLE\")" \
  "block"

create_firewall_rule \
  "Block XSS Attempts" \
  "(http.request.uri.query contains \"<script\" or http.request.uri.query contains \"javascript:\")" \
  "block"

create_firewall_rule \
  "Challenge High Threat Score" \
  "(cf.threat_score > 20)" \
  "managed_challenge"

echo "   ✅ WAF rules created"
echo ""

# 6. Rate Limiting
echo "6️⃣  Configuring Rate Limiting..."
echo "   → Login endpoint: 5 req/15min per IP"

api POST "/zones/$CF_ZONE_ID/rate_limits" \
'{
  "threshold": 5,
  "period": 900,
  "action": {
    "mode": "block",
    "timeout": 600,
    "response": {
      "content_type": "text/plain",
      "body": "Too many requests. Please try again later."
    }
  },
  "match": {
    "request": {
      "methods": ["POST"],
      "schemes": ["HTTP", "HTTPS"],
      "url": "https://api.neuropilot.ai/api/auth/login"
    },
    "response": {
      "origin_traffic": true
    }
  },
  "disabled": false,
  "description": "Login brute-force protection"
}' | jq -r '.success'

echo "   ✅ Rate limiting configured"
echo ""

# Summary
echo "======================================"
echo "✅ Cloudflare Configuration Complete!"
echo "======================================"
echo ""
echo "DNS Records:"
echo "  • inventory.neuropilot.ai → $VERCEL_HOST"
echo "  • api.neuropilot.ai → $RAILWAY_HOST"
echo ""
echo "Security:"
echo "  • SSL: Full (Strict)"
echo "  • HSTS: Enabled (1 year, preload)"
echo "  • WAF: SQL Injection, XSS, Bot Challenge"
echo "  • Rate Limit: 5 req/15min on login"
echo ""
echo "Performance:"
echo "  • Brotli: Enabled"
echo "  • Auto Minify: JS, CSS, HTML"
echo ""
echo "Next Steps:"
echo "  1. Wait for DNS propagation (~5-30 minutes)"
echo "  2. Verify SSL: curl -I https://inventory.neuropilot.ai"
echo "  3. Test WAF: Try SQL injection (should get 403)"
echo "  4. Test rate limit: Make 6 rapid login attempts"
echo ""
echo "Monitor at: https://dash.cloudflare.com"
echo ""
