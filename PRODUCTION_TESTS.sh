#!/bin/bash

echo "🧪 PRODUCTION SMOKE TESTS"
echo "========================"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo
echo -e "${GREEN}A. CORS + cookies (expect 200 + Set-Cookie)${NC}"
echo "--------------------------------------------"
echo "Replace <your admin pw> with your actual password:"
echo
echo -e "${YELLOW}curl -i -X POST https://inventory.neuropilot.ai/auth/login \\"
echo "  -H 'Origin: https://inventory.neuropilot.ai' \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  --data '{\"email\":\"admin@secure-inventory.com\",\"password\":\"<your admin pw>\"}'${NC}"
echo

echo -e "${GREEN}B. Origin blocked (expect 403 Forbidden)${NC}"
echo "-------------------------------------------"
echo -e "${YELLOW}curl -i -X POST https://inventory.neuropilot.ai/auth/login \\"
echo "  -H 'Origin: https://evil.example' \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  --data '{\"email\":\"x\",\"password\":\"y\"}'${NC}"
echo

echo -e "${GREEN}C. CSP/HSTS headers (expect security headers)${NC}"
echo "---------------------------------------------"
echo -e "${YELLOW}curl -I https://inventory.neuropilot.ai | egrep 'strict-transport|content-security'${NC}"
echo

echo -e "${GREEN}D. Refresh token rotation & reuse detection${NC}"
echo "--------------------------------------------"
echo "1. Login → get Set-Cookie: rt=R1"
echo "2. Refresh with R1 → receive new rt=R2 + access token"
echo "3. Refresh again with R1 → expect 401 and session revoked"
echo

echo "Step 1 - Login:"
echo -e "${YELLOW}curl -i -X POST https://inventory.neuropilot.ai/auth/login \\"
echo "  -H 'Origin: https://inventory.neuropilot.ai' \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  --data '{\"email\":\"admin@secure-inventory.com\",\"password\":\"<your admin pw>\"}'${NC}"
echo

echo "Step 2 - First refresh (copy rt= value from login):"
echo -e "${YELLOW}curl -i -X POST https://inventory.neuropilot.ai/auth/refresh \\"
echo "  -H 'Origin: https://inventory.neuropilot.ai' \\"
echo "  --cookie \"rt=<paste_R1_here>\"${NC}"
echo

echo "Step 3 - Reuse old token (should get 401):"
echo -e "${YELLOW}curl -i -X POST https://inventory.neuropilot.ai/auth/refresh \\"
echo "  -H 'Origin: https://inventory.neuropilot.ai' \\"
echo "  --cookie \"rt=<paste_R1_again>\"${NC}"
echo

echo -e "${GREEN}E. Rate limiting test${NC}"
echo "-------------------"
echo -e "${YELLOW}for i in {1..5}; do curl -X POST https://inventory.neuropilot.ai/auth/login \\"
echo "  -H 'Origin: https://inventory.neuropilot.ai' \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  --data '{\"email\":\"admin@secure-inventory.com\",\"password\":\"wrong\"}'; echo; done${NC}"
echo

echo -e "${GREEN}Expected Results:${NC}"
echo "----------------"
echo "✅ Login: 200 OK with Set-Cookie: rt=...; HttpOnly; Secure; SameSite=Strict"
echo "❌ Origin blocked: 403 Forbidden"
echo "✅ Security headers: HSTS and CSP present"
echo "✅ Fresh refresh: 200 OK with new token"
echo "❌ Reused refresh: 401 Unauthorized"
echo "❌ Rate limiting: 429 after 3 attempts"