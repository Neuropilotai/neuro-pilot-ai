#!/bin/bash

echo "🔒 SECURITY TEST SCRIPT"
echo "======================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo
echo "Step 1: Generate admin password hash"
echo "-------------------------------------"
echo "Run this command and copy the hash:"
echo -e "${YELLOW}node -e \"require('bcrypt').hash(process.argv[1], 12).then(h=>console.log(h))\" 'YOUR-ADMIN-PASSWORD'${NC}"
echo

echo "Step 2: Set environment variables"
echo "--------------------------------"
echo "Copy and paste these commands (replace YOUR-ADMIN-PASSWORD and paste your hash):"
echo
echo -e "${GREEN}export ALLOWED_ORIGINS=\"http://localhost:3000\"${NC}"
echo -e "${GREEN}export ADMIN_EMAIL=\"admin@secure-inventory.com\"${NC}"
echo -e "${GREEN}export ADMIN_HASH=\"<paste_bcrypt_hash_from_above>\"${NC}"
echo -e "${GREEN}export JWT_SECRET=\$(openssl rand -hex 64)${NC}"
echo -e "${GREEN}export REFRESH_SECRET=\$(openssl rand -hex 64)${NC}"
echo -e "${GREEN}export ENCRYPTION_KEY=\$(openssl rand -hex 32)${NC}"
echo

echo "Step 3: Start the server"
echo "----------------------"
echo -e "${GREEN}node backend/enterprise-secure-server.js${NC}"
echo

echo "Step 4: Test authentication flows"
echo "--------------------------------"
echo "1. Login (expect accessToken + refresh cookie):"
echo -e "${YELLOW}curl -i -X POST http://localhost:3000/auth/login \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -H 'Origin: http://localhost:3000' \\"
echo "  --data '{\"email\":\"admin@secure-inventory.com\",\"password\":\"YOUR-ADMIN-PASSWORD\"}'${NC}"
echo

echo "2. Copy the Set-Cookie: rt=... value, then test refresh:"
echo -e "${YELLOW}curl -i -X POST http://localhost:3000/auth/refresh \\"
echo "  -H 'Origin: http://localhost:3000' \\"
echo "  --cookie \"rt=<paste_refresh_cookie_value>\"${NC}"
echo

echo "3. Reuse OLD refresh token (should return 401):"
echo -e "${YELLOW}curl -i -X POST http://localhost:3000/auth/refresh \\"
echo "  -H 'Origin: http://localhost:3000' \\"
echo "  --cookie \"rt=<old_refresh_value>\"${NC}"
echo

echo "Expected Results:"
echo "----------------"
echo -e "${GREEN}✓ Login: 200 OK with accessToken and Set-Cookie header${NC}"
echo -e "${GREEN}✓ Fresh Refresh: 200 OK with new accessToken and rotated cookie${NC}"
echo -e "${RED}✓ Reused Refresh: 401 Unauthorized (family revoked)${NC}"
echo

echo "Rate Limiting Test:"
echo "------------------"
echo "Try logging in 4+ times with wrong password to test rate limiting:"
echo -e "${YELLOW}for i in {1..4}; do curl -X POST http://localhost:3000/auth/login -H 'Content-Type: application/json' -H 'Origin: http://localhost:3000' --data '{\"email\":\"admin@secure-inventory.com\",\"password\":\"wrong\"}'; echo; done${NC}"
echo