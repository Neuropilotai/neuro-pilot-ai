# NeuroPilot v17.2 - Infrastructure Directory

**Complete infrastructure-as-code and automation suite**

---

## 📂 Directory Structure

```
infrastructure/
├── terraform/                 # Complete Terraform IaC
│   ├── main.tf               # Main orchestration (585 LOC)
│   ├── terraform.tfvars.example  # Config template
│   ├── modules/              # Provider modules
│   │   ├── cloudflare/      # DNS, CDN, WAF, DDoS
│   │   ├── railway/         # Backend hosting + scaling
│   │   ├── neon/            # Database + replicas
│   │   ├── grafana/         # Dashboards + alerts
│   │   └── sentry/          # Error tracking
│   └── README.md            # Terraform usage guide
│
├── grafana/                  # Grafana dashboards
│   └── neuropilot-v17.2-dashboard.json  # 6 panels + alerts
│
└── scripts/                  # Automation scripts
    ├── cost-monitoring.sh   # Cost tracking + alerts
    └── auto-scaling.sh      # Intelligent auto-scaling
```

---

## 🚀 Quick Start

### 1. Deploy Infrastructure (5 minutes)

```bash
cd terraform/
cp terraform.tfvars.example terraform.tfvars
nano terraform.tfvars  # Fill in your API tokens

terraform init
terraform plan
terraform apply
```

### 2. Enable Cost Monitoring (2 minutes)

```bash
cd ../scripts/

# Run daily via cron
crontab -e
# Add: 0 9 * * * /path/to/cost-monitoring.sh

# Or run manually
export MONTHLY_BUDGET=50
export GRAFANA_URL="https://your-org.grafana.net"
export GRAFANA_API_KEY="your-api-key"
./cost-monitoring.sh
```

### 3. Enable Auto-Scaling (2 minutes)

```bash
# Run continuously in background
export RAILWAY_TOKEN="your-token"
export RAILWAY_PROJECT_ID="your-project-id"
nohup ./auto-scaling.sh > /var/log/neuropilot/autoscaling.log 2>&1 &
```

---

## 📊 What's Included

### Terraform Modules (Complete Multi-Cloud IaC)

- **Cloudflare Module**
  - DNS records (frontend + API)
  - SSL/TLS configuration (strict mode)
  - WAF rules (SQL injection, XSS, bot protection)
  - Rate limiting (login protection)
  - Page rules (static asset caching)
  - DDoS protection

- **Railway Module**
  - Backend service deployment
  - Auto-scaling configuration (1-5 instances)
  - Environment variable management
  - Health checks
  - Multi-region support (optional)

- **Neon Module**
  - PostgreSQL database provisioning
  - Read replica configuration
  - Backup policies
  - Auto-scaling compute units
  - Point-in-time recovery

- **Grafana Module**
  - Dashboard creation (6 panels)
  - Alert rule configuration (5 rules)
  - Data source setup
  - Notification channels
  - Annotation tracking

- **Sentry Module**
  - Frontend project setup
  - Backend project setup
  - Error alert rules
  - Performance monitoring
  - Release tracking

---

### Grafana Dashboard (6 Panels)

**Panel 1: API Latency (p95)** - Gauge
- Target: <400ms
- Color thresholds: green → yellow → orange → red
- Real-time p95 latency tracking

**Panel 2: Request Rate** - Timeseries
- Requests per second by method/path
- Stacked area visualization
- 5-minute rate calculation

**Panel 3: Error Rate** - Timeseries
- 4xx and 5xx error tracking
- Percentage-based thresholds
- Target: <1% error rate

**Panel 4: Infrastructure Cost** - Stacked Bars
- Real-time cost breakdown by service
- Budget line overlay
- Monthly cost trending

**Panel 5: Database Performance** - Multi-axis
- Average query time
- p95 query time
- Active connection count
- Target: <100ms avg

**Panel 6: Auto-Scaling** - Timeseries
- CPU usage percentage
- Memory usage percentage
- Active instance count
- Scaling threshold lines

---

### Automation Scripts

**cost-monitoring.sh** (320 LOC)
- Tracks Railway, Neon, Cloudflare costs
- Real-time budget monitoring
- Exports Prometheus metrics
- Grafana Cloud integration
- Slack alerts (80% and 96% thresholds)
- Daily email reports

**auto-scaling.sh** (450 LOC)
- CPU-based scaling (threshold: 80%)
- Memory-based scaling (threshold: 80%)
- Latency-based scaling (threshold: 400ms)
- Cooldown periods (5min up, 10min down)
- Railway API integration
- Grafana annotations
- Slack notifications
- State persistence

---

## 💰 Cost Estimates

### Minimum (Single Region)
```
Railway:     $10/month
Neon:        $0 (free tier)
Cloudflare:  $0 (free tier)
Grafana:     $0 (free tier)
Sentry:      $0 (free tier)
---
Total:       $10/month ✅
```

### Production (High Availability)
```
Railway (2 regions):  $18/month
Neon (replica):       $5/month
Cloudflare (Pro):     $20/month
Grafana:              $0 (free tier)
Sentry:               $0 (free tier)
---
Total:                $43/month ✅
```

---

## 🔑 Required API Tokens

| Service | Get Token From | Permissions |
|---------|---------------|-------------|
| Cloudflare | Profile → API Tokens | DNS, SSL, Firewall |
| Railway | Account → Tokens | Full access |
| Neon | Settings → API Keys | Full access |
| Grafana | Org → API Keys | Admin |
| Sentry | Settings → Auth Tokens | project:write |

---

## 📚 Documentation

- **Complete Guide:** `../NEUROPILOT_V17_2_COMPLETE_GUIDE.md`
- **Quick Reference:** `../V17_2_QUICK_REFERENCE.md`
- **Deployment Summary:** `../V17_2_DEPLOYMENT_SUMMARY.md`
- **Terraform README:** `terraform/README.md`

---

## 🧪 Testing

### Verify Infrastructure
```bash
terraform output
# Should show all URLs and resource IDs
```

### Test Cost Monitoring
```bash
./scripts/cost-monitoring.sh
# Should display cost breakdown and send to Grafana
```

### Test Auto-Scaling
```bash
export RAILWAY_TOKEN="your-token"
./scripts/auto-scaling.sh
# Should show current metrics and scaling decisions
```

---

## 🐛 Troubleshooting

**Terraform fails:**
```bash
# Verify tokens
terraform validate
terraform plan

# Check provider versions
terraform version
```

**Cost monitoring shows $0:**
```bash
# Verify Railway token
echo $RAILWAY_TOKEN

# Test API manually
railway whoami
```

**Auto-scaling not working:**
```bash
# Check script is running
ps aux | grep auto-scaling

# View logs
tail -f /var/log/neuropilot/autoscaling.log
```

---

## 🔒 Security

**Important:**
- ❌ **NEVER** commit `terraform.tfvars` to git
- ✅ Always use `.gitignore` for secrets
- ✅ Rotate API tokens every 90 days
- ✅ Use GitHub Secrets for CI/CD
- ✅ Enable WAF and rate limiting
- ✅ Use TLS 1.3 minimum

**Files to .gitignore:**
```
terraform.tfvars
*.tfstate
*.tfstate.backup
.terraform/
```

---

## 🚀 Next Steps

1. **Configure Terraform**
   - Copy `terraform.tfvars.example`
   - Fill in API tokens
   - Run `terraform apply`

2. **Set Up Monitoring**
   - Enable cost monitoring cron
   - Start auto-scaling script
   - Verify Grafana dashboard

3. **Deploy Application**
   - Push to GitHub
   - GitHub Actions runs CI/CD
   - Monitor deployment in Grafana

4. **Test Everything**
   - Run smoke tests
   - Trigger auto-scaling manually
   - Verify cost tracking

---

**Version:** v17.2
**Status:** ✅ Production Ready
**Deployment Time:** 30 minutes
**Cost:** $10-43/month

For complete documentation, see parent directory.
