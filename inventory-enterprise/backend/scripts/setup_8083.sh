#!/bin/bash

# ═══════════════════════════════════════════════════════════════
# Setup Script for Port 8083
# Version: v2.7.0-2025-10-07
# ═══════════════════════════════════════════════════════════════

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "🚀 Inventory Enterprise Setup (Port 8083)"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Check for .env file
if [ ! -f ".env" ]; then
  echo -e "${YELLOW}📝 Creating .env from .env.example...${NC}"
  cp .env.example .env
  echo -e "${GREEN}  ✅ .env created${NC}"
else
  echo -e "${GREEN}  ✅ .env already exists${NC}"
fi

# Ensure PORT=8083 in .env
if ! grep -q "^PORT=8083" .env 2>/dev/null; then
  echo -e "${YELLOW}📝 Setting PORT=8083 in .env...${NC}"
  sed -i.bak 's/^PORT=.*/PORT=8083/' .env 2>/dev/null || \
  (grep -v "^PORT=" .env > .env.tmp && echo "PORT=8083" >> .env.tmp && mv .env.tmp .env)
  echo -e "${GREEN}  ✅ PORT set to 8083${NC}"
fi

# Ensure logs directory exists
mkdir -p logs

echo ""
echo -e "${GREEN}✅ Setup complete!${NC}"
echo ""
echo "Next steps:"
echo "  1. npm run migrate:all"
echo "  2. npm run seed:roles"
echo "  3. PORT=8083 npm run start:all"
echo ""
