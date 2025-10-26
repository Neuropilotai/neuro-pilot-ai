#!/bin/bash
# Security Verification Script for NeuroPilot Backend
# Run this before every deployment

set -e

echo "========================================"
echo "🔒 NeuroPilot Security Verification"
echo "========================================"
echo ""

ERRORS=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. Check package-lock.json exists
echo "📦 Checking package-lock.json..."
if [ -f package-lock.json ]; then
  echo -e "${GREEN}✅ package-lock.json exists${NC}"
else
  echo -e "${RED}❌ package-lock.json missing! Run: npm i --package-lock-only${NC}"
  ERRORS=$((ERRORS + 1))
fi

# 2. Check .dockerignore exists and contains critical exclusions
echo ""
echo "🐋 Checking .dockerignore..."
if [ -f .dockerignore ]; then
  if grep -q ".env" .dockerignore && grep -q "*.pem" .dockerignore && grep -q "*.key" .dockerignore; then
    echo -e "${GREEN}✅ .dockerignore properly configured${NC}"
  else
    echo -e "${RED}❌ .dockerignore missing critical exclusions${NC}"
    ERRORS=$((ERRORS + 1))
  fi
else
  echo -e "${RED}❌ .dockerignore missing!${NC}"
  ERRORS=$((ERRORS + 1))
fi

# 3. Check for .env files in directory
echo ""
echo "🔍 Checking for .env files..."
if find . -maxdepth 2 -name '.env' -o -name '.env.local' -o -name '.env.production' | grep -v node_modules | grep -q .; then
  echo -e "${YELLOW}⚠️  .env files found (ensure they're in .gitignore)${NC}"
  find . -maxdepth 2 -name '.env*' | grep -v node_modules | grep -v .env.example
else
  echo -e "${GREEN}✅ No .env files in repository root${NC}"
fi

# 4. Check for hardcoded secrets in code
echo ""
echo "🔎 Scanning for hardcoded secrets..."
SECRETS_FOUND=$(grep -r -i --include="*.js" --exclude-dir=node_modules \
  -E '(password|secret|api_key|token)\s*=\s*["\x27][A-Za-z0-9]{8,}' . || true)

if [ -z "$SECRETS_FOUND" ]; then
  echo -e "${GREEN}✅ No obvious hardcoded secrets found${NC}"
else
  echo -e "${YELLOW}⚠️  Potential secrets found (review manually):${NC}"
  echo "$SECRETS_FOUND" | head -5
fi

# 5. Check .gitignore properly configured
echo ""
echo "📋 Checking .gitignore..."
if [ -f ../.gitignore ]; then
  if grep -q ".env" ../.gitignore; then
    echo -e "${GREEN}✅ .gitignore excludes .env files${NC}"
  else
    echo -e "${RED}❌ .gitignore doesn't exclude .env!${NC}"
    ERRORS=$((ERRORS + 1))
  fi
else
  echo -e "${YELLOW}⚠️  No .gitignore found in parent directory${NC}"
fi

# 6. Check Dockerfile uses multi-stage build
echo ""
echo "🏗️  Checking Dockerfile..."
if [ -f Dockerfile ]; then
  if grep -q "AS builder" Dockerfile && grep -q "AS runtime" Dockerfile; then
    echo -e "${GREEN}✅ Dockerfile uses multi-stage build${NC}"
  else
    echo -e "${YELLOW}⚠️  Dockerfile should use multi-stage build${NC}"
  fi

  if grep -q "USER appuser" Dockerfile; then
    echo -e "${GREEN}✅ Dockerfile uses non-root user${NC}"
  else
    echo -e "${RED}❌ Dockerfile should use non-root user${NC}"
    ERRORS=$((ERRORS + 1))
  fi
else
  echo -e "${RED}❌ Dockerfile not found${NC}"
  ERRORS=$((ERRORS + 1))
fi

# 7. Check for npm audit issues
echo ""
echo "🔐 Running npm audit..."
if npm audit --audit-level=moderate --production > /dev/null 2>&1; then
  echo -e "${GREEN}✅ No moderate+ npm vulnerabilities${NC}"
else
  echo -e "${YELLOW}⚠️  npm audit found vulnerabilities (run 'npm audit' for details)${NC}"
fi

# 8. Verify Railway configuration
echo ""
echo "🚂 Checking Railway configuration..."
if [ -f railway.json ]; then
  if grep -q "DOCKERFILE" railway.json; then
    echo -e "${GREEN}✅ railway.json configured for Dockerfile${NC}"
  else
    echo -e "${YELLOW}⚠️  railway.json should use DOCKERFILE builder${NC}"
  fi
else
  echo -e "${YELLOW}⚠️  railway.json not found${NC}"
fi

# Summary
echo ""
echo "========================================"
if [ $ERRORS -eq 0 ]; then
  echo -e "${GREEN}✅ All critical security checks passed!${NC}"
  echo "========================================"
  exit 0
else
  echo -e "${RED}❌ $ERRORS critical security issues found${NC}"
  echo "========================================"
  echo ""
  echo "Fix the issues above before deploying."
  exit 1
fi
