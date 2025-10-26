# Multi-Region Failover Plan - NeuroPilot v17.1

**Geographic routing + auto-recovery for 99.99% uptime**

---

## 🌍 Overview

NeuroPilot v17.1 supports multi-region deployment across 3 geographic locations:
- **US-EAST** (Primary) - Washington DC
- **US-WEST** (Secondary) - San Francisco
- **EU-WEST** (Tertiary) - London

**Target SLA**: 99.99% uptime (52 minutes downtime/year)

---

## 📊 Architecture

```
                    ┌─────────────────┐
                    │  Cloudflare CDN │
                    │  (Global Edge)  │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
       ┌──────▼───────┐ ┌───▼──────────┐ ┌─▼────────────┐
       │   US-EAST    │ │   US-WEST    │ │   EU-WEST    │
       │   (Primary)  │ │  (Secondary) │ │  (Tertiary)  │
       └──────┬───────┘ └───┬──────────┘ └─┬────────────┘
              │             │              │
       ┌──────▼───────┐ ┌───▼──────────┐ ┌─▼────────────┐
       │ Railway      │ │ Railway      │ │ Railway      │
       │ us-east-1    │ │ us-west-1    │ │ eu-west-1    │
       └──────┬───────┘ └───┬──────────┘ └─┬────────────┘
              │             │              │
       ┌──────▼───────────────────────────────────┐
       │      Neon PostgreSQL (Multi-Region)      │
       │  Primary: us-east-1, Replica: eu-west-1  │
       └──────────────────────────────────────────┘
```

---

## 🚀 Deployment Strategy

### Phase 1: Single Region (Current - v16.6)

**Status**: ✅ Deployed

**Infrastructure**:
- Railway: 1 instance (US-EAST)
- Vercel: Global CDN (auto multi-region)
- Neon: 1 database (US-EAST)
- Cloudflare: Global edge network

**Cost**: ~$10/month
**Uptime**: 99.9% (Railway SLA)

---

### Phase 2: Multi-Region Active-Passive (v17.1)

**Status**: 🟡 Ready to deploy

**Infrastructure**:
- Railway: 2 instances (US-EAST primary, US-WEST standby)
- Vercel: Global CDN (no changes)
- Neon: Primary + read replica
- Cloudflare: Geo-routing + health checks

**Cost**: ~$18/month
**Uptime**: 99.95%

**Setup**:
```bash
# Deploy to US-WEST
railway up --region us-west-1 --detached

# Configure Neon read replica
# (via Neon dashboard → Replication)

# Update Cloudflare load balancer
cd backend/terraform
terraform apply
```

---

### Phase 3: Multi-Region Active-Active (v17.2+)

**Status**: 🔵 Future enhancement

**Infrastructure**:
- Railway: 3 instances (US-EAST, US-WEST, EU-WEST all active)
- Vercel: Global CDN (no changes)
- Neon: Multi-region write support (when available)
- Cloudflare: Load balancing across all regions

**Cost**: ~$25/month
**Uptime**: 99.99%

---

## 🔄 Failover Mechanisms

### 1. Automatic Failover (Cloudflare Health Checks)

**Configuration**:
```hcl
# In terraform/main.tf
resource "cloudflare_load_balancer" "api" {
  zone_id = var.cloudflare_zone_id
  name    = "api.neuropilot.ai"

  default_pool_ids = [
    cloudflare_load_balancer_pool.us_east.id,
    cloudflare_load_balancer_pool.us_west.id,
  ]

  fallback_pool_id = cloudflare_load_balancer_pool.us_west.id

  # Health check every 60s
  # Fail after 3 consecutive failures (3 minutes)
  # Recovery after 2 consecutive successes
}

resource "cloudflare_load_balancer_pool" "us_east" {
  name = "us-east-primary"

  origins {
    name    = "railway-us-east"
    address = "neuropilot-us-east.up.railway.app"
    enabled = true
  }

  check_regions = ["NAM"]

  monitor = cloudflare_load_balancer_monitor.api_health.id
}

resource "cloudflare_load_balancer_monitor" "api_health" {
  expected_codes = "200"
  method         = "GET"
  timeout        = 5
  path           = "/health"
  interval       = 60
  retries        = 3
  description    = "API health check"
}
```

**Failover Time**: ~3 minutes (3 failed checks × 60s interval)

---

### 2. Manual Failover

**Scenario**: Primary region catastrophic failure

**Steps**:
```bash
# 1. Disable primary region in Cloudflare
terraform apply -var="primary_region=us-west"

# 2. Promote Neon read replica to primary (if needed)
# Via Neon dashboard: Replication → Promote to Primary

# 3. Update DNS (if Cloudflare down)
# Via domain registrar: Point api.neuropilot.ai to us-west IP

# 4. Verify
curl https://api.neuropilot.ai/health
# Should show us-west region in response
```

**Failover Time**: ~5 minutes (manual steps + DNS propagation)

---

### 3. Auto-Healing Monitor

**Configuration**: `backend/scripts/autoheal-monitor.sh`

**Triggers**:
- Latency > 400ms for 5 minutes → Restart service
- Error rate > 5% for 2 minutes → Purge cache + restart
- 5xx errors → Immediate restart

**Running**:
```bash
# Start auto-healing monitor
cd backend
./scripts/autoheal-monitor.sh

# Or run as systemd service
sudo cp scripts/autoheal.service /etc/systemd/system/
sudo systemctl enable autoheal
sudo systemctl start autoheal
```

---

## 🧪 Failover Testing

### Test 1: Health Check Failure Simulation

**Objective**: Verify automatic failover when primary fails

**Steps**:
```bash
# 1. Record baseline
curl -I https://api.neuropilot.ai/health
# cf-ray header shows origin (e.g., IAD = us-east)

# 2. Simulate primary failure (stop Railway service)
railway stop  # In us-east region

# 3. Wait 3-5 minutes for failover

# 4. Verify failover
curl -I https://api.neuropilot.ai/health
# cf-ray header now shows us-west origin (e.g., SFO)

# 5. Restore primary
railway start
```

**Expected Outcome**:
- ✅ Requests automatically route to us-west
- ✅ No 5xx errors during failover
- ✅ Latency increases by <50ms
- ✅ Automatic recovery when primary returns

---

### Test 2: Database Failover

**Objective**: Test Neon replica promotion

**Steps**:
```bash
# 1. Check current primary
echo $DATABASE_URL
# Shows us-east endpoint

# 2. Promote replica (via Neon dashboard)
# Replication → Select replica → Promote to Primary

# 3. Update connection string
export DATABASE_URL="postgresql://user:pass@replica-host.neon.tech/db?sslmode=require"
railway variables set DATABASE_URL="$DATABASE_URL"

# 4. Verify
railway run psql $DATABASE_URL -c "SELECT pg_is_in_recovery();"
# Should return: f (false = not in recovery = primary)
```

**Expected Outcome**:
- ✅ Replica promoted successfully
- ✅ Write operations work on new primary
- ✅ No data loss
- ✅ Replication lag < 1 second

---

### Test 3: Full Region Outage

**Objective**: Simulate complete us-east outage

**Steps**:
```bash
# 1. Disable us-east Railway instance
railway stop

# 2. Disable us-east in Cloudflare
cd backend/terraform
terraform apply -var="disable_us_east=true"

# 3. Promote Neon replica
# (via dashboard)

# 4. Verify all systems on us-west
curl https://api.neuropilot.ai/health
# Returns 200 OK from us-west

# 5. Run smoke tests
./scripts/smoke-test.sh
# All tests pass

# 6. Run load test
./scripts/run_benchmark.sh
# p95 latency < 400ms
```

**Expected Outcome**:
- ✅ 100% traffic routes to us-west
- ✅ All API endpoints functional
- ✅ Database writes work
- ✅ User sessions preserved
- ✅ Total downtime < 5 minutes

---

## 📈 Monitoring & Alerts

### Health Check Dashboard

**Grafana Panel**:
```promql
# Uptime by region
avg_over_time(up{job="neuropilot-api"}[5m])

# Failover events
changes(cloudflare_pool_health{pool="us-east"}[1h])

# Request distribution
sum(rate(http_requests_total[5m])) by (region)
```

### Failover Alerts

**Slack notification when**:
- Primary region health check fails
- Automatic failover triggered
- Manual intervention required

**PagerDuty escalation when**:
- Both primary and secondary fail
- Database replication lag > 10 seconds
- Failover unsuccessful after 10 minutes

---

## 💰 Cost Analysis

### Phase 1: Single Region (Current)

| Service | Region | Cost/Month |
|---------|--------|------------|
| Railway | US-EAST | $8 |
| Vercel | Global | $0 |
| Neon | US-EAST | $0 |
| Cloudflare | Global | $0 |
| **Total** | | **$8** |

---

### Phase 2: Multi-Region Active-Passive

| Service | Region | Cost/Month |
|---------|--------|------------|
| Railway Primary | US-EAST | $8 |
| Railway Standby | US-WEST | $5 (smaller instance) |
| Vercel | Global | $0 |
| Neon + Replica | US-EAST + EU-WEST | $5 |
| Cloudflare | Global | $0 |
| **Total** | | **$18** |

**Increase**: +$10/month (+125%)
**Benefit**: 99.95% uptime (vs 99.9%)

---

### Phase 3: Multi-Region Active-Active

| Service | Region | Cost/Month |
|---------|--------|------------|
| Railway | US-EAST | $8 |
| Railway | US-WEST | $8 |
| Railway | EU-WEST | $8 |
| Vercel | Global | $0 |
| Neon Multi-Region | Global | $20 (Pro plan) |
| Cloudflare | Global | $0 |
| **Total** | | **$44** |

**Increase**: +$36/month (+450%)
**Benefit**: 99.99% uptime, global low-latency

---

## 🛠️ Deployment Steps

### Deploy Phase 2 (Active-Passive)

```bash
# Step 1: Deploy secondary region
cd backend
export RAILWAY_REGION="us-west-1"
railway up --region us-west-1 --detached

# Get secondary URL
SECONDARY_URL=$(railway domain)
echo "Secondary: $SECONDARY_URL"

# Step 2: Set up Neon read replica
# Go to: https://console.neon.tech/app/projects
# Select project → Replication → Create read replica (eu-west-1)

# Step 3: Configure Cloudflare load balancer
cd terraform
cp terraform.tfvars.example terraform.tfvars
# Add secondary_railway_host
terraform apply

# Step 4: Verify failover
./scripts/test_failover.sh
```

**Time**: 30 minutes
**Downtime**: 0 seconds (rolling deployment)

---

## 🔍 Recovery Procedures

### Scenario 1: Primary Region Degraded Performance

**Symptoms**: Latency > 400ms, error rate < 5%

**Action**:
1. Auto-healing monitor restarts service
2. If issue persists after 3 restarts → fail over to secondary
3. Investigate primary region (Railway logs, Grafana metrics)

**Recovery**:
- Fix underlying issue
- Restore primary region
- Cloudflare automatically routes traffic back

---

### Scenario 2: Primary Region Complete Outage

**Symptoms**: Health checks fail, 100% error rate

**Action**:
1. Cloudflare automatically fails over (3-5 minutes)
2. Promote Neon read replica to primary (if writes needed)
3. Page on-call engineer

**Recovery**:
- Wait for Railway to restore service
- Or manually deploy to new region
- Resync database if needed

---

### Scenario 3: Database Replication Lag

**Symptoms**: Replication lag > 2 seconds

**Action**:
1. Check Neon dashboard for replication status
2. Reduce write load on primary
3. If lag > 10 seconds → stop writes to secondary

**Recovery**:
- Wait for replication to catch up
- Or promote replica and accept data loss window
- Investigate cause (network issue, high write volume)

---

## ✅ Readiness Checklist

Before enabling multi-region:

**Infrastructure**:
- [ ] Secondary Railway instance deployed
- [ ] Neon read replica created
- [ ] Cloudflare load balancer configured
- [ ] Health checks passing in all regions

**Monitoring**:
- [ ] Grafana dashboard shows all regions
- [ ] Alerts configured (health checks, failover)
- [ ] Slack/PagerDuty integration tested

**Testing**:
- [ ] Health check failure test passed
- [ ] Database failover test passed
- [ ] Full region outage test passed
- [ ] Load testing in all regions

**Documentation**:
- [ ] Runbooks updated
- [ ] Team trained on failover procedures
- [ ] On-call rotation established

---

## 📚 Additional Resources

**Railway Multi-Region**: https://docs.railway.app/deploy/multi-region
**Neon Replication**: https://neon.tech/docs/guides/read-replicas
**Cloudflare Load Balancing**: https://developers.cloudflare.com/load-balancing/

---

**Status**: Ready for Phase 2 deployment
**Target SLA**: 99.95% (Phase 2) → 99.99% (Phase 3)
**RTO (Recovery Time Objective)**: 3-5 minutes (automatic)
**RPO (Recovery Point Objective)**: < 1 second (database replication)
