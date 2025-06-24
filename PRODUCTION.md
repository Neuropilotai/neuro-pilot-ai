# 🚀 Production Deployment Guide

## Pre-Deployment Checklist

### ✅ Environment Setup
- [ ] `.env` file configured with real API keys
- [ ] `NODE_ENV=production`
- [ ] SSL certificates ready (if using HTTPS)
- [ ] Domain/subdomain configured
- [ ] Firewall rules configured

### ✅ API Keys & Services
- [ ] OpenAI API key with sufficient credits
- [ ] Stripe account configured (live keys for production)
- [ ] Stripe webhook endpoints configured
- [ ] Database backups enabled
- [ ] Error tracking service (Sentry, etc.)

### ✅ Security
- [ ] Environment variables secured
- [ ] CORS origins properly configured
- [ ] Rate limiting enabled
- [ ] Input validation in place
- [ ] Secrets management configured

### ✅ Performance
- [ ] Frontend build optimized
- [ ] Database indexes created
- [ ] Caching strategy implemented
- [ ] CDN configured (optional)
- [ ] Load balancing ready (if needed)

## Deployment Steps

### 1. Quick Deploy (Recommended)
```bash
./scripts/deploy.sh
```

### 2. Manual Deploy

#### Backend Setup
```bash
# Install dependencies
npm install
cd backend && npm install

# Build frontend
cd ../frontend && npm run build

# Start production server
cd ../backend && NODE_ENV=production node server.js
```

#### Docker Deploy
```bash
# Build and start all services
docker-compose -f docker-compose.prod.yml up -d

# Monitor logs
docker-compose -f docker-compose.prod.yml logs -f
```

## Post-Deployment Verification

### ✅ Health Checks
```bash
# Backend API
curl http://localhost:8000/api/agents/status

# System stats
curl http://localhost:8000/api/system/stats

# Frontend access
curl http://localhost:3000
```

### ✅ Functionality Tests
- [ ] Agent status dashboard loads
- [ ] Real-time updates working
- [ ] Payment processing (test mode first)
- [ ] Resume generation
- [ ] Trading signals
- [ ] WebSocket connections

### ✅ Performance Monitoring
- [ ] CPU usage < 70%
- [ ] Memory usage < 80%
- [ ] Response times < 500ms
- [ ] Database queries optimized
- [ ] Error rates < 1%

## Production Configuration

### Environment Variables
```env
# Production Settings
NODE_ENV=production
PORT=8000

# API Keys (REQUIRED)
OPENAI_API_KEY=sk-...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Optional Enhancements
REDIS_URL=redis://localhost:6379
DATABASE_URL=postgresql://...
SENTRY_DSN=https://...
```

### Nginx Configuration (Optional)
```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Frontend
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Backend API
    location /api/ {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # WebSocket support
    location /socket.io/ {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## Monitoring & Maintenance

### System Monitoring
```bash
# Check service status
docker-compose -f docker-compose.prod.yml ps

# View resource usage
docker stats

# Check logs
docker-compose -f docker-compose.prod.yml logs -f backend
```

### Health Endpoints
- `GET /api/agents/status` - Agent health
- `GET /api/system/stats` - System metrics
- `GET /` - Basic health check

### Log Files
- `logs/system/` - System logs
- `logs/agent-activity/` - Agent activity
- `logs/performance/` - Performance metrics

## Scaling & Optimization

### Horizontal Scaling
```bash
# Scale backend services
docker-compose -f docker-compose.prod.yml up --scale backend=3

# Load balancer configuration
# Configure nginx/HAProxy for multiple backend instances
```

### Performance Optimization
- Enable Redis caching
- Implement database connection pooling
- Use CDN for static assets
- Optimize database queries
- Enable gzip compression

## Backup & Recovery

### Database Backup
```bash
# Backup SQLite databases
cp backend/agents/trading/learning_database.db backups/
cp data/learning/models/* backups/models/
```

### Configuration Backup
```bash
# Backup configuration
tar -czf config-backup.tar.gz config/ .env
```

### Full System Backup
```bash
# Backup entire data directory
tar -czf neuropilot-backup.tar.gz data/ logs/ config/ .env
```

## Security Hardening

### Network Security
- Configure firewall rules
- Use HTTPS/SSL certificates
- Implement DDoS protection
- Monitor for suspicious activity

### Application Security
- Regular dependency updates
- Security headers configuration
- Input sanitization
- Rate limiting implementation

### API Security
- API key rotation schedule
- Webhook signature verification
- Request logging and monitoring
- Access control implementation

## Troubleshooting

### Common Issues

#### High Memory Usage
```bash
# Check memory usage
curl http://localhost:8000/api/system/stats

# Restart services if needed
docker-compose -f docker-compose.prod.yml restart
```

#### Payment Processing Errors
- Verify Stripe webhook configuration
- Check API key permissions
- Monitor Stripe dashboard for errors
- Review payment processor logs

#### Trading Agent Issues
- Check market data API limits
- Verify paper trading configuration
- Review trading logs
- Check WebSocket connections

### Emergency Procedures

#### Service Restart
```bash
# Restart all services
docker-compose -f docker-compose.prod.yml restart

# Restart specific service
docker-compose -f docker-compose.prod.yml restart backend
```

#### Rollback Deployment
```bash
# Stop current deployment
docker-compose -f docker-compose.prod.yml down

# Deploy previous version
git checkout previous-tag
./scripts/deploy.sh
```

## Support & Maintenance

### Regular Maintenance Tasks
- [ ] Weekly: Check system logs
- [ ] Weekly: Monitor performance metrics
- [ ] Monthly: Update dependencies
- [ ] Monthly: Review security logs
- [ ] Quarterly: Performance optimization review

### Performance Monitoring
- CPU and memory usage trends
- Response time metrics
- Error rate monitoring
- Database performance
- Trading agent performance

### Alerts & Notifications
Set up alerts for:
- High memory usage (>80%)
- High CPU usage (>70%)
- Service downtime
- Payment processing errors
- Trading agent failures

---

## 🆘 Emergency Contacts

- **System Administrator**: [contact info]
- **Payment Support**: [Stripe dashboard]
- **API Support**: [OpenAI support]
- **Hosting Support**: [hosting provider]

---

**Last Updated**: 2025-06-19
**Version**: 1.0.0