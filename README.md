# >� Neuro.Pilot.AI - Autonomous AI Company

An advanced autonomous AI system featuring trading agents, AI-powered resume generation, and intelligent orchestration capabilities.

## =� Features

### Core AI Agents
- **> Trading Agent**: Real-time market analysis with paper trading capabilities
- **=� Resume Generator**: AI-powered resume creation with multiple packages
- **>� Learning Agent**: Adaptive machine learning optimization
- **<� Orchestrator**: Multi-agent coordination and task management

### Technical Capabilities
- **Real-time WebSocket Dashboard**: Live agent monitoring and system stats
- **Payment Processing**: Stripe integration for resume orders and trading subscriptions
- **TradingView Pro Integration**: Advanced Python-based trading analysis
- **Docker Containerization**: Production-ready deployment
- **TypeScript Frontend**: Professional React dashboard

## <� Project Structure

```
neuro-pilot-ai/
   backend/                    # Node.js Express API
      agents/                # Trading agents
         trading/
             live_trading_agent.js
             tradingview_pro_agent.py
             tradingview_pro_wrapper.js
      ai_resume_generator.js  # OpenAI-powered resume generator
      payment_processor.js    # Stripe integration
      real_trading_agent.js   # Core trading logic
      server.js              # Main server
      system_monitor.js      # System health monitoring
   frontend/                  # React TypeScript dashboard
      src/
         components/       # UI components
         pages/           # App pages
      public/
   data/                     # Data storage
      trading/             # Trading data & strategies
         pine_scripts/    # TradingView Pine scripts
         backtests/       # Historical test results
         signals/         # Trading signals
      resumes/            # Generated resumes
      learning/           # ML models & training data
   config/                  # Configuration files
      prompts/            # AI prompts
      settings/           # System settings
      strategies/         # Trading strategies
   logs/                   # Application logs
```

## =' Installation & Setup

### Prerequisites
- Node.js 18+ 
- Python 3.8+
- npm or yarn

### Quick Start

1. **Clone and Install**
```bash
git clone <repository-url>
cd neuro-pilot-ai
npm install
cd frontend && npm install
```

2. **Environment Setup**
```bash
cp .env.example .env
# Edit .env with your API keys
```

3. **Python Dependencies**
```bash
pip install -r requirements.txt
```

4. **Start Development**
```bash
npm run dev
```

## = Environment Variables

Create a `.env` file in the root directory:

```env
# OpenAI API (Required for Resume Generation)
OPENAI_API_KEY=your_openai_api_key_here

# Stripe Payment Processing (Required for Payments)
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key_here
STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_publishable_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here

# Server Configuration
NODE_ENV=development
PORT=8000
```

## =� API Endpoints

### Agent Status
- `GET /api/agents/status` - Get all agent statuses
- `GET /api/system/stats` - System performance metrics

### Trading
- `GET /api/trading/signals` - Get real-time trading signals
- `POST /api/trading/execute` - Execute trading orders

### Resume Generation
- `POST /api/resume/generate` - Generate AI-powered resume
- `GET /api/resume/orders` - Get resume order history

### Payment Processing
- `POST /api/payments/resume-checkout` - Create resume payment session
- `POST /api/payments/trading-subscription` - Create trading subscription
- `POST /api/payments/webhook` - Stripe webhook handler

## =3 Docker Deployment

### Development
```bash
docker-compose up -d
```

### Production
```bash
docker-compose -f docker-compose.prod.yml up -d
```

## =� Available Scripts

```bash
# Development
npm run dev          # Start both frontend and backend
npm run backend      # Start backend only
npm run frontend     # Start frontend only

# Production
npm run build        # Build for production
npm start           # Start production server

# Docker
npm run docker:dev   # Start development containers
npm run docker:prod  # Start production containers
```

## = Security Features

- Environment variable protection
- CORS configuration
- Input validation
- Secure payment processing
- Rate limiting
- Error handling

## >� Testing

The system includes comprehensive testing:

```bash
# Run all tests
npm test

# Test specific components
npm run test:backend
npm run test:frontend
npm run test:trading
npm run test:payments
```

## =� Production Deployment

### Requirements for Production

1. **API Keys Setup**
   - OpenAI API key for resume generation
   - Stripe keys for payment processing
   - (Optional) TradingView Pro account for advanced trading

2. **Environment Configuration**
   - Set `NODE_ENV=production`
   - Configure proper CORS origins
   - Set up SSL certificates

3. **Database Setup**
   - Initialize SQLite databases
   - Set up data persistence volumes

4. **Monitoring**
   - Configure logging
   - Set up health checks
   - Monitor system resources

### Deployment Steps

1. **Server Setup**
```bash
# Build production images
docker-compose -f docker-compose.prod.yml build

# Deploy with SSL
docker-compose -f docker-compose.prod.yml up -d
```

2. **Database Initialization**
```bash
# Initialize trading database
node backend/scripts/init-db.js

# Set up initial configurations
node backend/scripts/setup-config.js
```

3. **Payment Setup**
```bash
# Create Stripe products
node backend/create_stripe_products.js
```

## =� Monitoring & Maintenance

### System Health
- **CPU Usage**: Monitored via `/api/system/stats`
- **Memory Usage**: Real-time tracking with alerts
- **Agent Status**: Live monitoring of all 4 agents
- **WebSocket Connections**: Active connection tracking

### Performance Metrics
- **Trading Performance**: Win rate, P&L, signal accuracy
- **Resume Generation**: Order completion time, success rate
- **Payment Processing**: Transaction success rate
- **Learning Progress**: Model optimization scores

## = Agent Coordination

The system features intelligent agent orchestration:

1. **Trading Agent**: Monitors markets 24/7, generates signals
2. **Resume Agent**: Processes orders, manages queue
3. **Learning Agent**: Continuously optimizes strategies
4. **Orchestrator**: Coordinates tasks, manages resources

## =� Advanced Features

### Machine Learning
- Adaptive trading strategies
- Performance optimization
- Market sentiment analysis
- Risk management

### Real-time Updates
- WebSocket-based live dashboard
- Instant notification system
- Real-time trading signals
- Live system monitoring

### Scalability
- Horizontal scaling support
- Load balancing ready
- Database sharding capable
- CDN integration

## <� Troubleshooting

### Common Issues

1. **High Memory Usage**
   - Monitor system stats endpoint
   - Check for memory leaks
   - Restart services if needed

2. **Payment Failures**
   - Verify Stripe keys
   - Check webhook configuration
   - Monitor payment logs

3. **Trading Errors**
   - Verify market data feeds
   - Check API rate limits
   - Review trading logs

### Support
- Check logs in `/logs` directory
- Monitor system health endpoints
- Review error tracking

## =� License

MIT License - see LICENSE file for details.

## > Contributing

1. Fork the repository
2. Create feature branch
3. Commit changes
4. Push to branch
5. Create Pull Request

---

**Neuro.Pilot.AI** - The future of autonomous AI systems is here. =�