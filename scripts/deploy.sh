#!/bin/bash

# 🚀 Neuro.Pilot.AI Production Deployment Script

set -e

echo "🧠 Starting Neuro.Pilot.AI Production Deployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    echo -e "${RED}❌ Please don't run this script as root${NC}"
    exit 1
fi

# Check dependencies
echo -e "${BLUE}🔍 Checking dependencies...${NC}"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed${NC}"
    exit 1
fi

# Check npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm is not installed${NC}"
    exit 1
fi

# Check Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is not installed${NC}"
    exit 1
fi

# Check Python
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}❌ Python3 is not installed${NC}"
    exit 1
fi

echo -e "${GREEN}✅ All dependencies found${NC}"

# Check environment file
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}⚠️  .env file not found. Creating from example...${NC}"
    cp .env.example .env
    echo -e "${RED}❌ Please edit .env file with your API keys before continuing${NC}"
    exit 1
fi

# Validate environment variables
echo -e "${BLUE}🔍 Validating environment variables...${NC}"

source .env

if [ -z "$OPENAI_API_KEY" ] || [ "$OPENAI_API_KEY" = "your_openai_api_key_here" ]; then
    echo -e "${YELLOW}⚠️  OPENAI_API_KEY not configured - Resume generation will be disabled${NC}"
fi

if [ -z "$STRIPE_SECRET_KEY" ] || [ "$STRIPE_SECRET_KEY" = "sk_test_your_stripe_secret_key_here" ]; then
    echo -e "${YELLOW}⚠️  STRIPE_SECRET_KEY not configured - Payment processing will be disabled${NC}"
fi

# Install dependencies
echo -e "${BLUE}📦 Installing Node.js dependencies...${NC}"
npm install

echo -e "${BLUE}📦 Installing frontend dependencies...${NC}"
cd frontend
npm install
cd ..

echo -e "${BLUE}🐍 Installing Python dependencies...${NC}"
pip3 install -r requirements.txt

# Build frontend for production
echo -e "${BLUE}🏗️  Building frontend for production...${NC}"
cd frontend
npm run build
cd ..

# Create necessary directories
echo -e "${BLUE}📁 Creating necessary directories...${NC}"
mkdir -p logs/agent-activity
mkdir -p logs/performance
mkdir -p logs/system
mkdir -p data/trading/backtests
mkdir -p data/trading/historical
mkdir -p data/trading/real-time
mkdir -p data/trading/signals
mkdir -p data/resumes/generated
mkdir -p data/resumes/feedback
mkdir -p data/resumes/templates
mkdir -p data/learning/models
mkdir -p data/learning/embeddings
mkdir -p data/learning/performance

# Set permissions
echo -e "${BLUE}🔐 Setting permissions...${NC}"
chmod +x scripts/*.sh
chmod -R 755 data/
chmod -R 755 logs/

# Initialize database
echo -e "${BLUE}🗄️  Initializing database...${NC}"
if [ -f "backend/scripts/init-db.js" ]; then
    node backend/scripts/init-db.js
else
    echo -e "${YELLOW}⚠️  Database initialization script not found${NC}"
fi

# Create Stripe products if configured
if [ -n "$STRIPE_SECRET_KEY" ] && [ "$STRIPE_SECRET_KEY" != "sk_test_your_stripe_secret_key_here" ]; then
    echo -e "${BLUE}💳 Creating Stripe products...${NC}"
    node backend/create_stripe_products.js
fi

# Docker deployment
echo -e "${BLUE}🐳 Preparing Docker deployment...${NC}"

# Create production docker-compose file if it doesn't exist
if [ ! -f "docker-compose.prod.yml" ]; then
    echo -e "${YELLOW}⚠️  Creating production docker-compose.yml...${NC}"
    cat > docker-compose.prod.yml << EOF
version: '3.8'

services:
  backend:
    build: 
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "8000:8000"
    environment:
      - NODE_ENV=production
      - OPENAI_API_KEY=\${OPENAI_API_KEY}
      - STRIPE_SECRET_KEY=\${STRIPE_SECRET_KEY}
      - STRIPE_PUBLISHABLE_KEY=\${STRIPE_PUBLISHABLE_KEY}
      - STRIPE_WEBHOOK_SECRET=\${STRIPE_WEBHOOK_SECRET}
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
    restart: unless-stopped

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    restart: unless-stopped
    depends_on:
      - backend

volumes:
  data:
  logs:
EOF
fi

# Build and start services
echo -e "${BLUE}🚀 Building and starting services...${NC}"
docker-compose -f docker-compose.prod.yml build
docker-compose -f docker-compose.prod.yml up -d

# Wait for services to start
echo -e "${BLUE}⏳ Waiting for services to start...${NC}"
sleep 10

# Health check
echo -e "${BLUE}🏥 Performing health check...${NC}"
if curl -f http://localhost:8000/api/agents/status > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Backend service is healthy${NC}"
else
    echo -e "${RED}❌ Backend service health check failed${NC}"
    echo -e "${YELLOW}📋 Checking logs...${NC}"
    docker-compose -f docker-compose.prod.yml logs backend
    exit 1
fi

if curl -f http://localhost:3000 > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Frontend service is healthy${NC}"
else
    echo -e "${YELLOW}⚠️  Frontend service may take a moment to start${NC}"
fi

# Success message
echo -e "${GREEN}"
echo "🎉 Neuro.Pilot.AI Production Deployment Complete!"
echo ""
echo "🌐 Services:"
echo "   Frontend: http://localhost:3000"
echo "   Backend:  http://localhost:8000"
echo "   API Status: http://localhost:8000/api/agents/status"
echo ""
echo "📊 Monitoring:"
echo "   System Stats: http://localhost:8000/api/system/stats"
echo "   Logs: docker-compose -f docker-compose.prod.yml logs -f"
echo ""
echo "🛑 To stop services:"
echo "   docker-compose -f docker-compose.prod.yml down"
echo -e "${NC}"

# Optional: Start monitoring
read -p "Start real-time monitoring? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${BLUE}📊 Starting real-time monitoring...${NC}"
    docker-compose -f docker-compose.prod.yml logs -f
fi

echo -e "${GREEN}🚀 Deployment completed successfully!${NC}"