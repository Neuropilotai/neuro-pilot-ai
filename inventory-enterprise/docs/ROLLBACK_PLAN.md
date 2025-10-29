# NeuroNexus v19.0 - Rollback & Recovery Plan

**Version:** v19.0
**Platform:** Railway
**Recovery Time Objective (RTO):** < 5 minutes
**Recovery Point Objective (RPO):** Last deployment

---

## 🚨 When to Rollback

Trigger rollback immediately if:

- ❌ Health checks failing for > 5 minutes
- ❌ Critical errors in logs (crashes, OOM)
- ❌ Scheduler not starting
- ❌ ML service unreachable
- ❌ Database corrupted
- ❌ SMTP failing (no daily reports)
- ❌ >30% drop in forecast accuracy

**DO NOT rollback for:**
- ✅ Minor warnings in logs
- ✅ Single failed health check
- ✅ Transient network errors

---

## 🔄 Rollback Methods

### Method 1: Disable Scheduler (Safe Switch) ⚡ FASTEST

**Use when:** Autonomous jobs causing issues, but core API working

**Time:** 30 seconds

**Steps:**
1. Railway Dashboard → backend service → Variables
2. Set `SCHEDULER_ENABLED=false`
3. Click **Save** (auto-redeploys)

**Effect:**
- ✅ Stops all cron jobs (forecast, retrain, health)
- ✅ API remains available
- ✅ No data loss

**Verification:**
```bash
curl https://resourceful-achievement-production.up.railway.app/api/health | jq '.scheduler.enabled'
# Expected: false
```

**To re-enable:**
```bash
# Set SCHEDULER_ENABLED=true in Railway Variables
```

---

### Method 2: Redeploy Previous Deployment 🔧 RECOMMENDED

**Use when:** Current deployment broken, need to restore last working version

**Time:** 2-3 minutes

**Steps:**

1. **Railway Dashboard:**
   - Click backend service
   - Navigate to **Deployments** tab
   - Find last successful deployment (green checkmark)
   - Note deployment ID and timestamp

2. **Verify last good deployment:**
   - Click deployment → View logs
   - Confirm: "Server running on port 3000"
   - Confirm: "Autonomous Scheduler started"

3. **Redeploy:**
   - Click **⋯** (three dots) next to deployment
   - Click **Redeploy**
   - Confirm: "Redeploy this deployment?"

4. **Wait for deployment:**
   - Monitor build logs
   - Wait for health check: ✅

5. **Verify rollback:**
```bash
curl https://resourceful-achievement-production.up.railway.app/api/health
# Check version, timestamp
```

**Expected result:**
- Service restored to previous working state
- All autonomous jobs running

---

### Method 3: Git Revert + Push 📝 CLEAN

**Use when:** Want to revert code changes in Git history

**Time:** 3-5 minutes

**Steps:**

1. **Find last good commit:**
```bash
git log --oneline -10
# Find commit before v19.0 (e.g., "814cf140a9")
```

2. **Revert commits:**
```bash
# Revert v19.0 commits (814cf140a9, 6d86c6f0ba)
git revert 814cf140a9 6d86c6f0ba --no-edit

# Or revert to specific commit:
git revert --no-commit HEAD~2..HEAD
git commit -m "Rollback v19.0 to v18.0"
```

3. **Push to trigger auto-deploy:**
```bash
git push origin main
```

4. **Monitor Railway deployment:**
   - Railway detects push
   - Auto-deploys reverted code
   - Watch logs for success

5. **Verify:**
```bash
curl https://resourceful-achievement-production.up.railway.app/api/health
# Check version matches reverted state
```

---

### Method 4: Deploy from Git Tag 🏷️ PRECISE

**Use when:** Want to deploy specific tagged release

**Time:** 2-3 minutes

**Prerequisites:** Releases tagged (v18.0, v19.0, etc.)

**Steps:**

1. **List available tags:**
```bash
git tag -l "v*"
# v18.0
# v19.0
```

2. **Railway Dashboard:**
   - Settings → **GitHub**
   - Deploy Branch/Tag: Select `v18.0`
   - Click **Deploy**

3. **Alternative - CLI:**
```bash
# Checkout tag
git checkout v18.0

# Force push to main (⚠️ DANGEROUS)
git push origin v18.0:main --force
```

4. **Verify:**
```bash
curl https://resourceful-achievement-production.up.railway.app/api/health | jq '.version'
# Expected: "18.0" or tag version
```

---

## 🏷️ Release Tagging Strategy

### Creating Release Tags

**Before each deployment:**
```bash
# Tag current deployment
git tag -a v19.0 -m "Autonomous Foundation Release"
git push origin v19.0

# Tag hotfixes
git tag -a v19.0.1 -m "Hotfix: scheduler timing"
git push origin v19.0.1
```

**Tag naming convention:**
- `v<major>.<minor>` - Feature releases (v19.0, v20.0)
- `v<major>.<minor>.<patch>` - Hotfixes (v19.0.1, v19.0.2)

**Benefits:**
- ✅ Easy rollback to specific version
- ✅ Clear deployment history
- ✅ Reproducible builds

---

## 💾 Database Rollback

### SQLite Backup & Restore

**Before deployment (backup):**
```bash
railway run --service backend sqlite3 database.db ".backup backup-$(date +%Y%m%d).db"
railway run --service backend gzip backup-$(date +%Y%m%d).db
```

**After failed deployment (restore):**
```bash
# Download backup
railway run --service backend gunzip backup-20251029.db.gz
railway run --service backend sqlite3 database.db ".restore backup-20251029.db"
```

### PostgreSQL Rollback (If Migrated)

**Backup:**
```bash
railway run pg_dump $DATABASE_URL > backup-$(date +%Y%m%d).sql
```

**Restore:**
```bash
railway run psql $DATABASE_URL < backup-20251029.sql
```

---

## 📊 Rollback Verification Checklist

After rollback, verify:

- [ ] **Health endpoint:** 200 OK
  ```bash
  curl -f https://resourceful-achievement-production.up.railway.app/api/health
  ```

- [ ] **Version correct:** Matches expected version
  ```bash
  curl https://resourceful-achievement-production.up.railway.app/api/health | jq '.version'
  ```

- [ ] **Scheduler status:** Enabled (if expected)
  ```bash
  curl https://resourceful-achievement-production.up.railway.app/api/health | jq '.scheduler.enabled'
  ```

- [ ] **Logs clean:** No errors in Railway logs
  ```bash
  railway logs --service backend | grep -i error
  ```

- [ ] **ML service reachable:**
  ```bash
  railway run --service backend curl -f http://ml-service.railway.internal:8000/status
  ```

- [ ] **Database integrity:**
  ```bash
  railway run --service backend sqlite3 database.db "PRAGMA integrity_check;"
  # Expected: ok
  ```

- [ ] **Authentication working:** Login succeeds
  ```bash
  curl -X POST https://<backend>/api/auth/login -d '{"email":"...","password":"..."}'
  ```

---

## 🚦 Post-Rollback Actions

### Immediate (< 15 minutes)

1. **Notify team:**
   ```
   Subject: ROLLBACK - v19.0 → v18.0
   
   Rolled back NeuroNexus to v18.0 due to [issue].
   
   Current status: Stable
   Next steps: Root cause analysis
   ```

2. **Create incident log:**
   - Time of failure
   - Symptoms observed
   - Rollback method used
   - Time to recovery
   - Impact (users affected, data loss)

3. **Monitor metrics:**
   - Check Railway CPU/memory
   - Watch error rates
   - Verify forecast accuracy

### Short-term (< 24 hours)

1. **Root cause analysis:**
   - Review deployment logs
   - Compare before/after configs
   - Identify breaking change

2. **Create hotfix:**
   - Fix identified issue
   - Test in staging
   - Deploy as v19.0.1

3. **Update runbooks:**
   - Document new failure mode
   - Add mitigation steps

### Long-term (< 1 week)

1. **Post-mortem:**
   - What went wrong?
   - Why did monitoring miss it?
   - How to prevent recurrence?

2. **Improve CI/CD:**
   - Add test coverage
   - Enhance smoke tests
   - Add canary deployments

---

## 🧪 Testing Rollback Procedures (Dry Run)

**Quarterly rollback drills:**

```bash
# 1. Deploy to staging
railway link --environment staging
railway up

# 2. Trigger intentional failure
railway run --service backend node -e "process.exit(1)"

# 3. Practice rollback (Method 2)
# Railway Dashboard → Deployments → Redeploy previous

# 4. Verify recovery
curl https://staging-backend.railway.app/api/health

# 5. Document time taken
# Target: < 5 minutes
```

---

## 📞 Escalation Path

| Severity | Contact | Response Time |
|----------|---------|---------------|
| **P0 - Critical** | On-call engineer + CTO | < 15 minutes |
| **P1 - High** | On-call engineer | < 1 hour |
| **P2 - Medium** | Dev team | < 4 hours |
| **P3 - Low** | Dev team | < 24 hours |

**P0 triggers:**
- Production down > 5 minutes
- Data loss detected
- Security breach

**Rollback authority:**
- On-call engineer: Can rollback without approval
- Dev team: Requires tech lead approval
- Scheduled rollback: Requires change management

---

## 📚 Related Documents

- Deployment Guide: `AUTONOMOUS_RAILWAY_DEPLOYMENT_GUIDE.md`
- Smoke Tests: `scripts/smoke-tests.md`
- Monitoring: Railway Dashboard → Metrics

**END OF ROLLBACK PLAN**
