#!/usr/bin/env bash
set -euo pipefail

# Colors
GREEN="\033[0;32m"; RED="\033[0;31m"; YELLOW="\033[1;33m"; NC="\033[0m"

echo -e "${GREEN}▶ Checking prerequisites...${NC}"
command -v docker >/dev/null 2>&1 || { echo -e "${RED}Docker not found. Install Docker first.${NC}"; exit 1; }
if ! docker compose version >/dev/null 2>&1; then
  echo -e "${YELLOW}docker compose plugin not found. Falling back to docker-compose if available...${NC}"
  if ! command -v docker-compose >/dev/null 2>&1; then
    echo -e "${RED}docker compose or docker-compose is required.${NC}"; exit 1;
  fi
  USE_DOCKER_COMPOSE=1
else
  USE_DOCKER_COMPOSE=0
fi

# Ensure .env exists
if [ ! -f ".env" ]; then
  echo -e "${RED}.env not found at project root. Aborting.${NC}"; exit 1;
fi

echo -e "${GREEN}▶ Building & starting containers...${NC}"
if [ "$USE_DOCKER_COMPOSE" -eq 0 ]; then
  docker compose up -d --build
else
  docker-compose up -d --build
fi

echo -e "${GREEN}✔ Done!${NC}"
echo -e "API:     ${YELLOW}http://localhost:3001/health${NC}"
echo -e "Frontend:${YELLOW}http://localhost:8080${NC}"
