# NeuroPilot v17.2 - Quick Reference Card

**⚡ Ultra-fast deployment and operations guide**

---

## 🚀 30-Minute Production Deployment

```bash
# 1. Configure Terraform (5 min)
cd inventory-enterprise/infrastructure/terraform
cp terraform.tfvars.example terraform.tfvars
nano terraform.tfvars  # Fill in API tokens

# 2. Deploy Infrastructure (5 min)
terraform init
terraform apply

# 3. Configure GitHub Secrets (5 min)
# Go to GitHub → Settings → Secrets → Add:
# CLOUDFLARE_API_TOKEN, RAILWAY_TOKEN, NEON_API_KEY, etc.

# 4. Deploy Application (10 min)
git add .
git commit -m "feat: deploy v17.2"
git push origin main
# Watch: https://github.com/YOUR_ORG/YOUR_REPO/actions

# 5. Enable Monitoring (5 min)
crontab -e
# Add: 0 9 * * * /path/to/cost-monitoring.sh

nohup ./infrastructure/scripts/auto-scaling.sh &
```

**Done!** ✅

---

## 📊 Essential Commands

### Check System Health
```bash
# Backend
curl https://api.neuropilot.ai/health

# Frontend
curl https://inventory.neuropilot.ai

# Metrics
curl https://api.neuropilot.ai/metrics
```

### View Costs
```bash
./infrastructure/scripts/cost-monitoring.sh
```

### Manual Scaling
```bash
# Railway
railway run --replicas 3

# Or via Terraform
terraform apply -var="min_instances=2"
```

### View Logs
```bash
# Railway
railway logs --service backend

# Auto-scaling
tail -f /var/log/neuropilot/autoscaling.log

# Cost monitoring
tail -f /var/log/neuropilot/cost.log
```

### Emergency Rollback
```bash
# Railway
railway rollback

# Vercel
vercel rollback

# Terraform
terraform state pull > backup.tfstate
terraform apply
```

---

## 🔑 Required API Tokens

| Service | Where to Get | Permissions Needed |
|---------|--------------|-------------------|
| **Cloudflare** | Profile → API Tokens | DNS, SSL, Firewall |
| **Railway** | Account → Tokens | Full access |
| **Neon** | Settings → API Keys | Full access |
| **Grafana** | Org → API Keys | Admin |
| **Sentry** | Settings → Auth Tokens | project:write |
| **Vercel** | Settings → Tokens | Full access |

---

## 💰 Cost Quick Reference

### Free Tier (Everything)
- Railway: No (min $5/month)
- Neon: Yes (0.5GB)
- Cloudflare: Yes (unlimited)
- Vercel: Yes (100GB/month)
- Grafana: Yes (10k series)
- Sentry: Yes (5k errors/month)

### Minimum Monthly Cost: **$10**
- Railway Hobby: $10
- Everything else: $0 (free tiers)

### Production Monthly Cost: **$43**
- Railway (2 regions): $18
- Neon (replica): $5
- Cloudflare Pro: $20
- Everything else: $0

---

## 📈 Performance Targets

| Metric | Target | Command to Check |
|--------|--------|-----------------|
| **p95 Latency** | <120ms | Check Grafana Panel 1 |
| **Error Rate** | <1% | Check Grafana Panel 3 |
| **Uptime** | 99.95% | Check Grafana |
| **Cost** | <$50/mo | `./cost-monitoring.sh` |

---

## 🔧 Auto-Scaling Defaults

```bash
MIN_INSTANCES=1
MAX_INSTANCES=5
CPU_THRESHOLD=80%
MEMORY_THRESHOLD=80%
LATENCY_THRESHOLD=400ms
SCALE_UP_COOLDOWN=5min
SCALE_DOWN_COOLDOWN=10min
```

**Customize:** Edit values in `auto-scaling.sh`

---

## 🚨 Alert Thresholds

| Alert | Threshold | Action |
|-------|-----------|--------|
| High Latency | >400ms for 5min | Slack |
| High Errors | >5% for 2min | PagerDuty |
| Cost Warning | >80% budget | Email + Slack |
| Cost Critical | >96% budget | PagerDuty |
| DB Slow Query | >500ms avg | Slack |

---

## 📂 File Locations

```
infrastructure/
├── terraform/
│   ├── main.tf                    # Main config
│   ├── terraform.tfvars           # Your secrets (DO NOT COMMIT)
│   └── modules/                   # Terraform modules
├── grafana/
│   └── neuropilot-v17.2-dashboard.json
└── scripts/
    ├── cost-monitoring.sh         # Run daily
    └── auto-scaling.sh            # Run continuously

.github/workflows/
└── deploy-v17.2.yml              # CI/CD pipeline

backend/scripts/
├── smoke-test.sh                  # Health checks
├── run_benchmark.sh               # Load testing
└── analyze_benchmark.sh           # Performance analysis
```

---

## 🐛 Common Issues

### Terraform Error
```bash
# Fix: Verify token
curl -X GET "https://api.cloudflare.com/client/v4/user/tokens/verify" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Railway Deploy Fails
```bash
# Fix: Re-link project
railway link YOUR_PROJECT_ID
railway up
```

### High Costs
```bash
# Fix: Scale down instances
railway run --replicas 1

# Or disable multi-region
terraform apply -var="enable_multi_region=false"
```

### No Metrics in Grafana
```bash
# Fix: Wait 2-3 minutes for first scrape
# Then check data source configured correctly
```

---

## 📞 Emergency Contacts

**Deployment Issues:**
- Check GitHub Actions logs
- Review Railway deployment logs
- Check Sentry for errors

**Performance Issues:**
- Check Grafana dashboard
- Review auto-scaling logs
- Run `smoke-test.sh`

**Cost Overruns:**
- Run `cost-monitoring.sh`
- Check budget alerts in Grafana
- Scale down non-critical services

---

## 🎯 Daily Operations Checklist

### Morning
- [ ] Check Grafana dashboard
- [ ] Review cost metrics
- [ ] Check for failed deployments
- [ ] Review Sentry errors

### Weekly
- [ ] Review auto-scaling decisions
- [ ] Analyze load test results
- [ ] Review and adjust budgets
- [ ] Update documentation

### Monthly
- [ ] Rotate API tokens
- [ ] Review and optimize costs
- [ ] Security audit
- [ ] Backup verification

---

## 🔐 Security Checklist

- [ ] All API tokens rotated every 90 days
- [ ] `terraform.tfvars` in `.gitignore`
- [ ] GitHub Secrets configured (not in code)
- [ ] WAF enabled in Cloudflare
- [ ] Rate limiting enabled
- [ ] TLS 1.3 enforced
- [ ] npm audit passing
- [ ] Trivy scans passing

---

## 📚 Documentation Links

- **Full Guide:** `NEUROPILOT_V17_2_COMPLETE_GUIDE.md`
- **v17.1 Guide:** `NEUROPILOT_V17_1_UPGRADE_GUIDE.md`
- **Architecture:** `PRODUCTION_DEPLOYMENT_ARCHITECTURE.md`
- **Terraform README:** `infrastructure/terraform/README.md`

---

## 🏆 Quick Wins

### Reduce Costs
```bash
# Use free tiers only
terraform apply -var="enable_multi_region=false" \
                -var="enable_waf=false"
# Cost: $10/month
```

### Improve Performance
```bash
# More aggressive scaling
export CPU_THRESHOLD=70
export MAX_INSTANCES=10
# p95 latency: <100ms
```

### Increase Reliability
```bash
# Enable multi-region HA
terraform apply -var="enable_multi_region=true" \
                -var="enable_auto_failover=true"
# Uptime: 99.99%
```

---

**Version:** v17.2
**Last Updated:** 2025-10-23
**Quick Start Time:** 30 minutes
**Monthly Cost:** $10-43

**For full documentation, see:** `NEUROPILOT_V17_2_COMPLETE_GUIDE.md`
