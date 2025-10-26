# NeuroPilot v17.1 Upgrade Guide

**Cloud Intelligence Mode: Multi-Region + Observability + Auto-Healing**

---

## 🎯 Overview

v17.1 transforms NeuroPilot from a single-region deployment to an enterprise-grade, self-healing, globally distributed system with full observability.

### What's New

| Feature | v16.6 | v17.1 |
|---------|-------|-------|
| Regions | 1 (US-EAST) | 2-3 (US-EAST, US-WEST, EU-WEST) |
| Observability | Basic logs | Grafana + Sentry + Metrics |
| Auto-Healing | Manual | Automated (latency, errors, health) |
| Load Testing | Manual | Automated (k6 benchmarks) |
| IaC | Scripts | Terraform |
| SLA | 99.9% | 99.95% → 99.99% |
| Cost | $10/mo | $18-25/mo |

---

## 📦 New Components

### 1. Observability Stack

**Grafana Cloud** (Free tier)
- 📊 Production metrics dashboard
- 🔔 Alert rules (latency, errors)
- 📈 15+ custom metrics
- ⏱️ 14-day retention

**Sentry** (Free tier)
- 🐛 Frontend error tracking
- 🔥 Backend exception monitoring
- 📍 User session tracking
- 🎯 Release performance

### 2. Benchmarking Suite

**k6 Load Testing**
- 🚀 Realistic traffic patterns (100 VUs, 60s)
- 📊 p50/p95/p99 latency analysis
- 📈 Throughput and error rate metrics
- 📁 JSON export for trending

**Automated Analysis**
- ✅ Threshold validation (p95 < 400ms, errors < 5%)
- 📊 Performance recommendations
- 📈 Grafana integration
- 📁 Historical comparison

### 3. Auto-Healing Monitor

**Capabilities**:
- 🔍 Real-time health monitoring (60s interval)
- 🔄 Automatic service restart (latency > 400ms)
- 🗑️ Cache purge on high errors
- 📊 Metrics export to Grafana
- 🔔 Slack/PagerDuty alerts

### 4. Infrastructure as Code

**Terraform Modules**:
- ☁️ Cloudflare (DNS, SSL, WAF, rate limiting)
- 🚂 Railway (multi-region deployment)
- 🗄️ Neon (database replication)
- 📊 Grafana (dashboards, alerts)

### 5. Cloudflare Workers

**wrangler.toml Configuration**:
- 🌐 Edge computing
- 💾 KV cache layer
- 🔄 Session state management
- ⏱️ Cron health checks

---

## 🚀 Upgrade Path

### Option A: Minimal Upgrade (Observability Only)

**What you get**:
- Grafana Cloud dashboards
- Sentry error tracking
- Load testing scripts
- Auto-healing monitor

**Cost**: $10/month (no increase)
**Time**: 30 minutes
**Downtime**: 0 minutes

**Steps**:
```bash
cd backend

# 1. Set up Grafana
export GRAFANA_URL="https://your-org.grafana.net"
export GRAFANA_API_KEY="your_api_key"
./monitoring/grafana-import.sh

# 2. Set up Sentry
export SENTRY_DSN="https://xxx@sentry.io/yyy"
./monitoring/sentry-setup.sh

# 3. Deploy with monitoring
railway up --detached

# 4. Run benchmark
./scripts/run_benchmark.sh
./scripts/analyze_benchmark.sh benchmarks/results/*.json

# 5. Start auto-healing (optional)
./scripts/autoheal-monitor.sh
```

---

### Option B: Full Upgrade (Multi-Region + Observability)

**What you get**:
- Everything from Option A
- Multi-region deployment (US-EAST + US-WEST)
- Automatic failover (3-5 min RTO)
- Database replication
- Terraform IaC

**Cost**: $18/month (+$8)
**Time**: 2 hours
**Downtime**: 0 minutes (rolling deployment)

**Steps**:
```bash
# Phase 1: Observability (30 minutes)
# Follow Option A steps above

# Phase 2: Multi-Region Deployment (1 hour)
cd backend

# 1. Deploy secondary region
export RAILWAY_REGION="us-west-1"
railway up --region us-west-1 --detached
SECONDARY_URL=$(railway domain)

# 2. Set up database replica
# Go to: https://console.neon.tech → Replication → Create read replica (eu-west-1)

# 3. Configure Terraform
cd terraform
cp terraform.tfvars.example terraform.tfvars
nano terraform.tfvars  # Fill in credentials

# 4. Deploy infrastructure
terraform init
terraform plan
terraform apply

# Phase 3: Verification (30 minutes)
# 1. Run smoke tests in all regions
./scripts/smoke-test.sh

# 2. Test failover
railway stop  # Stop primary
curl https://api.neuropilot.ai/health  # Should fail over to secondary
railway start  # Restore primary

# 3. Run load test
./scripts/run_benchmark.sh
./scripts/analyze_benchmark.sh benchmarks/results/*.json
```

---

## 📊 Cost Breakdown

### v16.6 (Current)

| Service | Plan | Monthly Cost |
|---------|------|--------------|
| Railway | Hobby | $8 |
| Vercel | Hobby | $0 |
| Neon | Free | $0 |
| Cloudflare | Free | $0 |
| **Total** | | **$8-10** |

---

### v17.1 Option A (Observability Only)

| Service | Plan | Monthly Cost |
|---------|------|--------------|
| Railway | Hobby | $8 |
| Vercel | Hobby | $0 |
| Neon | Free | $0 |
| Cloudflare | Free | $0 |
| **Grafana Cloud** | **Free** | **$0** |
| **Sentry** | **Free** | **$0** |
| **Total** | | **$8-10** ✅ |

**No cost increase!**

---

### v17.1 Option B (Multi-Region)

| Service | Plan | Monthly Cost |
|---------|------|--------------|
| Railway Primary | Hobby | $8 |
| **Railway Secondary** | **Hobby (standby)** | **$5** |
| Vercel | Hobby | $0 |
| **Neon + Replica** | **Free + $5** | **$5** |
| Cloudflare | Free | $0 |
| Grafana Cloud | Free | $0 |
| Sentry | Free | $0 |
| **Total** | | **$18** |

**+$8-10/month increase (+80-100%)**

**ROI**:
- Uptime: 99.9% → 99.95% (+0.05%)
- Downtime: 8.76 hours/year → 4.38 hours/year (50% reduction)
- Recovery Time: Manual (30+ min) → Automatic (3-5 min)

---

### Future: v17.2+ (Active-Active)

| Service | Plan | Monthly Cost |
|---------|------|--------------|
| Railway × 3 regions | Hobby | $24 |
| Vercel | Hobby | $0 |
| Neon | Pro (multi-region writes) | $20 |
| Cloudflare | Free | $0 |
| Grafana Cloud | Free | $0 |
| Sentry | Free | $0 |
| **Total** | | **$44** |

**Target SLA**: 99.99% uptime

---

## 📁 New Files Created

### Scripts (6 files)

```
backend/scripts/
├── run_benchmark.sh              # k6 load testing (100 VUs, 60s)
├── analyze_benchmark.sh          # Performance analysis + Grafana export
├── autoheal-monitor.sh           # Auto-healing service monitor
└── test_sentry.js                # Sentry integration test

backend/monitoring/
├── grafana-import.sh             # Grafana dashboard setup
└── sentry-setup.sh               # Sentry SDK integration
```

### Infrastructure as Code (3 files)

```
backend/terraform/
├── main.tf                       # Cloudflare + Grafana resources
├── terraform.tfvars.example      # Variable template
└── README.md                     # Terraform usage guide
```

### Configuration (1 file)

```
backend/cloudflare/
└── wrangler.toml                 # Cloudflare Workers config
```

### Documentation (3 files)

```
docs/observability/
└── GRAFANA_SETUP_GUIDE.md        # Complete Grafana setup

docs/failover/
└── MULTI_REGION_FAILOVER_PLAN.md # Failover procedures

inventory-enterprise/
└── NEUROPILOT_V17_1_UPGRADE_GUIDE.md  # This file
```

**Total**: 13 new files

---

## 🧪 Testing Checklist

After upgrade, verify:

### Observability

- [ ] Grafana dashboard accessible
- [ ] All 8 panels populated with data
- [ ] Alerts firing on test conditions
- [ ] Sentry capturing frontend errors
- [ ] Sentry capturing backend errors
- [ ] Metrics endpoint responding: `curl https://api.neuropilot.ai/metrics`

### Load Testing

- [ ] k6 installed: `k6 version`
- [ ] Benchmark completes successfully
- [ ] Analysis generates report
- [ ] p95 latency < 400ms
- [ ] Error rate < 5%
- [ ] Metrics exported to Grafana

### Auto-Healing

- [ ] Monitor starts without errors
- [ ] Health checks running every 60s
- [ ] Metrics logged to `logs/autoheal.log`
- [ ] Slack notifications working (if configured)
- [ ] Restart triggered on high latency (test)

### Multi-Region (Option B only)

- [ ] Secondary region deployed
- [ ] Health checks passing in both regions
- [ ] Cloudflare load balancer configured
- [ ] Failover test successful (3-5 min)
- [ ] Database replication lag < 1 second
- [ ] All regions show in Grafana

### Infrastructure as Code

- [ ] Terraform initialized: `terraform init`
- [ ] Plan shows expected resources: `terraform plan`
- [ ] Apply succeeds: `terraform apply`
- [ ] State tracking resources correctly
- [ ] Destroy works (test in staging first!)

---

## 🐛 Troubleshooting

### Issue: Grafana "No Data"

**Symptom**: Dashboard shows "No data" for all panels

**Fix**:
```bash
# 1. Verify metrics endpoint
curl https://api.neuropilot.ai/metrics
# Should return Prometheus metrics

# 2. Check Prometheus data source
# Go to: https://your-org.grafana.net/datasources
# Verify "NeuroPilot Prometheus" exists and is default

# 3. Wait 2-3 minutes for first scrape

# 4. Check time range (last 6 hours)
```

---

### Issue: Sentry Not Capturing Errors

**Symptom**: No errors appearing in Sentry dashboard

**Fix**:
```bash
# 1. Verify DSN configured
echo $SENTRY_DSN

# 2. Test integration
node scripts/test_sentry.js

# 3. Check Sentry dashboard (wait 30 seconds)
# https://sentry.io/organizations/your-org/issues/

# 4. Verify Sentry initialized in code
# Backend: require('./src/sentry.js').initSentry(app)
# Frontend: import { initSentry } from './src/lib/sentry.js'
```

---

### Issue: Auto-Healing False Positives

**Symptom**: Service restarts too frequently

**Fix**:
```bash
# Adjust thresholds in autoheal-monitor.sh
export LATENCY_THRESHOLD_MS=600  # Increase from 400ms
export ERROR_RATE_THRESHOLD_PCT=10  # Increase from 5%
export CHECK_INTERVAL=120  # Check every 2 minutes instead of 1

# Or disable auto-restart
export ENABLE_AUTO_RESTART=false
```

---

### Issue: Terraform Apply Fails

**Symptom**: `Error: Invalid Cloudflare API token`

**Fix**:
```bash
# 1. Verify token permissions
# Go to: https://dash.cloudflare.com/profile/api-tokens
# Check token has: Zone.DNS.Edit, Zone.Settings.Edit, Zone.Firewall.Edit

# 2. Test token manually
curl -X GET "https://api.cloudflare.com/client/v4/user/tokens/verify" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"

# 3. Regenerate if needed
# Delete old token, create new one with correct permissions
```

---

### Issue: Multi-Region Failover Not Working

**Symptom**: Requests not failing over to secondary when primary down

**Fix**:
```bash
# 1. Check Cloudflare load balancer
terraform state show cloudflare_load_balancer.api

# 2. Verify health checks
# Go to: https://dash.cloudflare.com → Traffic → Load Balancing
# Check "Health Check Events"

# 3. Test manually
curl -I https://api.neuropilot.ai/health
# Check cf-ray header for origin

# 4. Reduce health check interval (faster failover)
# In terraform/main.tf, set interval = 30 (instead of 60)
```

---

## 🎓 Training & Documentation

### For DevOps Team

**Required Reading**:
1. `GRAFANA_SETUP_GUIDE.md` - Observability setup
2. `MULTI_REGION_FAILOVER_PLAN.md` - Failover procedures
3. `terraform/README.md` - IaC usage

**Hands-On Labs**:
1. Run load test and analyze results
2. Trigger and resolve a test alert
3. Simulate region failover
4. Deploy infrastructure change with Terraform

---

### For Developers

**Required Reading**:
1. `monitoring/sentry-setup.sh` - Error tracking integration
2. `scripts/run_benchmark.sh` - Load testing
3. Grafana dashboard walkthrough

**Best Practices**:
- Add custom metrics for new features
- Test error handling with Sentry
- Run benchmarks before/after performance changes
- Check Grafana dashboard during deployments

---

## 📅 Rollout Plan

### Week 1: Observability (Option A)

**Monday-Tuesday**: Setup
- Create Grafana Cloud account
- Create Sentry account
- Run setup scripts
- Deploy with monitoring

**Wednesday-Thursday**: Testing
- Run load tests
- Verify dashboards
- Test alerts
- Train team

**Friday**: Production
- Enable in production
- Monitor for 48 hours
- Document any issues

---

### Week 2-3: Multi-Region (Option B)

**Week 2**: Infrastructure
- Deploy secondary region (staging first)
- Set up database replication
- Configure Terraform
- Test failover in staging

**Week 3**: Production
- Deploy to production (off-peak hours)
- Monitor for 1 week
- Document procedures
- Train on-call team

---

## ✅ Success Metrics

After v17.1 upgrade, track:

| Metric | v16.6 Baseline | v17.1 Target |
|--------|----------------|--------------|
| Uptime | 99.9% | 99.95%+ |
| p95 Latency | Unknown | <120ms |
| Error Rate | Unknown | <1% |
| MTTR (Mean Time to Recovery) | 30+ minutes | <5 minutes |
| Observability Coverage | 0% | 100% |
| Auto-Healing Events | N/A | >90% successful |
| Failover Success Rate | N/A | >95% |

---

## 🔄 Rollback Plan

If issues arise:

### Rollback Observability (Option A)

```bash
# 1. Stop auto-healing monitor
pkill -f autoheal-monitor

# 2. Remove Sentry from code
# Comment out initSentry() calls
git revert <commit-hash>
railway up --detached

# 3. Disable Grafana alerts
# Go to dashboard → Mute all alerts

# Cost: Back to $10/month immediately
```

### Rollback Multi-Region (Option B)

```bash
# 1. Remove secondary region from Cloudflare
cd terraform
terraform destroy -target=cloudflare_load_balancer.api

# 2. Stop secondary Railway instance
railway stop --region us-west-1

# 3. Remove Neon replica (optional, saves $5/month)
# Go to Neon dashboard → Delete replica

# Cost: Back to $10/month within 24 hours
```

---

## 📞 Support & Resources

**Documentation**:
- Grafana Cloud Docs: https://grafana.com/docs/
- Sentry Docs: https://docs.sentry.io/
- Railway Docs: https://docs.railway.app/
- Terraform Registry: https://registry.terraform.io/

**Community**:
- NeuroPilot Slack: #v17-upgrade
- GitHub Discussions: https://github.com/neuropilot/discussions

**Emergency Contacts**:
- On-call: (see PagerDuty)
- DevOps Lead: (see team directory)

---

## 🎉 Summary

**v17.1 Upgrade Delivers**:
- ✅ Full observability (Grafana + Sentry)
- ✅ Automated load testing and analysis
- ✅ Self-healing infrastructure
- ✅ Multi-region failover (optional)
- ✅ Infrastructure as Code (Terraform)
- ✅ 99.95%+ uptime SLA
- ✅ <5 minute recovery time

**Investment**:
- Cost: $0-10/month (Option A) or +$8/month (Option B)
- Time: 30 minutes (Option A) or 2 hours (Option B)
- Downtime: 0 minutes (rolling deployment)

**Recommendation**: Start with Option A (observability only) for 2 weeks, then evaluate Option B (multi-region) based on traffic growth and uptime requirements.

---

**Version**: v17.1.0
**Release Date**: 2025-01-23
**Status**: Ready for production deployment
**License**: MIT
