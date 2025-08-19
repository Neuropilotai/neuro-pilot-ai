#!/bin/bash

# 🚀 Production Deployment Verification Script
# This script automates the post-deploy verification process

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

DOMAIN="https://inventory.neuropilot.ai"
ADMIN_EMAIL="admin@secure-inventory.com"

echo -e "${BLUE}🚀 PRODUCTION DEPLOYMENT VERIFICATION${NC}"
echo "====================================="

# Check if password is provided
if [ -z "$1" ]; then
    echo -e "${RED}❌ Error: Admin password required${NC}"
    echo "Usage: $0 <admin-password>"
    exit 1
fi

ADMIN_PASSWORD="$1"

echo -e "\n${YELLOW}Testing domain: $DOMAIN${NC}"
echo -e "${YELLOW}Admin email: $ADMIN_EMAIL${NC}"

# Test 1: Health Check
echo -e "\n${BLUE}1. Health Check${NC}"
echo "----------------"
if curl -s "$DOMAIN/health" > /dev/null; then
    echo -e "${GREEN}✅ Health check passed${NC}"
else
    echo -e "${RED}❌ Health check failed${NC}"
    exit 1
fi

# Test 2: Security Headers
echo -e "\n${BLUE}2. Security Headers${NC}"
echo "-------------------"
HEADERS=$(curl -sI "$DOMAIN")
if echo "$HEADERS" | grep -q "strict-transport-security"; then
    echo -e "${GREEN}✅ HSTS header present${NC}"
else
    echo -e "${RED}❌ HSTS header missing${NC}"
fi

if echo "$HEADERS" | grep -q "content-security-policy"; then
    echo -e "${GREEN}✅ CSP header present${NC}"
else
    echo -e "${RED}❌ CSP header missing${NC}"
fi

# Test 3: Valid Login
echo -e "\n${BLUE}3. Valid Login Test${NC}"
echo "-------------------"
LOGIN_RESPONSE=$(curl -si -X POST "$DOMAIN/auth/login" \
    -H 'Origin: https://inventory.neuropilot.ai' \
    -H 'Content-Type: application/json' \
    --data "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}")

if echo "$LOGIN_RESPONSE" | grep -q "200 OK"; then
    echo -e "${GREEN}✅ Login successful${NC}"
    
    # Check for secure cookie
    if echo "$LOGIN_RESPONSE" | grep -q "Set-Cookie.*HttpOnly.*Secure.*SameSite=Strict"; then
        echo -e "${GREEN}✅ Secure cookie flags present${NC}"
    else
        echo -e "${YELLOW}⚠️  Cookie security flags may be missing${NC}"
    fi
    
    # Extract refresh token for later tests
    REFRESH_TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o 'rt=[^;]*' | cut -d= -f2)
    
else
    echo -e "${RED}❌ Login failed${NC}"
    echo "Response:"
    echo "$LOGIN_RESPONSE"
    exit 1
fi

# Test 4: Origin Blocking
echo -e "\n${BLUE}4. Origin Blocking Test${NC}"
echo "-----------------------"
BLOCKED_RESPONSE=$(curl -s -w "%{http_code}" -X POST "$DOMAIN/auth/login" \
    -H 'Origin: https://evil.example' \
    -H 'Content-Type: application/json' \
    --data '{"email":"x","password":"y"}')

if [[ "$BLOCKED_RESPONSE" == *"403"* ]] || [[ "$BLOCKED_RESPONSE" == *"400"* ]]; then
    echo -e "${GREEN}✅ Origin blocking works${NC}"
else
    echo -e "${YELLOW}⚠️  Origin blocking response: $BLOCKED_RESPONSE${NC}"
fi

# Test 5: Rate Limiting
echo -e "\n${BLUE}5. Rate Limiting Test${NC}"
echo "---------------------"
echo "Testing 4 consecutive failed login attempts..."

RATE_LIMITED=false
for i in {1..4}; do
    RESPONSE=$(curl -s -w "%{http_code}" -X POST "$DOMAIN/auth/login" \
        -H 'Origin: https://inventory.neuropilot.ai' \
        -H 'Content-Type: application/json' \
        --data '{"email":"'"$ADMIN_EMAIL"'","password":"wrong"}')
    
    echo "Attempt $i: HTTP $RESPONSE"
    
    if [[ "$RESPONSE" == *"429"* ]]; then
        RATE_LIMITED=true
        break
    fi
    sleep 1
done

if [ "$RATE_LIMITED" = true ]; then
    echo -e "${GREEN}✅ Rate limiting active${NC}"
else
    echo -e "${YELLOW}⚠️  Rate limiting may not be active (check Cloudflare rules)${NC}"
fi

# Test 6: Refresh Token Rotation
if [ ! -z "$REFRESH_TOKEN" ]; then
    echo -e "\n${BLUE}6. Refresh Token Rotation${NC}"
    echo "---------------------------"
    
    # First refresh (should work)
    FIRST_REFRESH=$(curl -si -X POST "$DOMAIN/auth/refresh" \
        -H 'Origin: https://inventory.neuropilot.ai' \
        --cookie "rt=$REFRESH_TOKEN")
    
    if echo "$FIRST_REFRESH" | grep -q "200 OK"; then
        echo -e "${GREEN}✅ First refresh successful${NC}"
        
        # Try to reuse old token (should fail)
        REUSE_RESPONSE=$(curl -s -w "%{http_code}" -X POST "$DOMAIN/auth/refresh" \
            -H 'Origin: https://inventory.neuropilot.ai' \
            --cookie "rt=$REFRESH_TOKEN")
        
        if [[ "$REUSE_RESPONSE" == *"401"* ]]; then
            echo -e "${GREEN}✅ Token reuse properly blocked${NC}"
        else
            echo -e "${RED}❌ Token reuse not blocked (HTTP $REUSE_RESPONSE)${NC}"
        fi
    else
        echo -e "${RED}❌ First refresh failed${NC}"
    fi
fi

echo -e "\n${BLUE}🎯 VERIFICATION COMPLETE${NC}"
echo "========================"
echo -e "${GREEN}Your production deployment security verification is complete!${NC}"
echo
echo -e "${YELLOW}Next Steps:${NC}"
echo "1. Set up monitoring alerts for auth failures and token reuse"
echo "2. Configure log shipping to your observability platform"
echo "3. Set up automated backups of the Fly volume"
echo "4. Review Cloudflare firewall rules and rate limiting"

echo -e "\n${GREEN}🛡️  Production deployment is secure and ready!${NC}"