# NeuroPilot Security Posture & Operational Runbook
**Version**: 18.0-enterprise
**Date**: 2025-10-27
**Classification**: Internal - Operations Team

---

## 🎯 Executive Summary

NeuroPilot Inventory Enterprise API is now secured with **enterprise-grade container security** and **supply chain transparency**. All builds are reproducible, scanned, and non-root. CORS is restrictive with audit logging. SBOM is generated for every build.

**Key Achievements**:
- ✅ Docker builds reproducible (lockfile + SHA256 pinning)
- ✅ Security scanning on every build (Trivy HIGH/CRITICAL fail)
- ✅ CORS restricted to Vercel domains only
- ✅ SBOM generation (CycloneDX) for supply chain traceability
- ✅ Non-root execution (UID 1001)
- ✅ Secret exclusion validated in CI
- ✅ Health checks + tini + pinned base digests

---

## 🔐 Security Controls

### 1. CORS (Cross-Origin Resource Sharing)

**Configuration** (server.js:176-203):
```javascript
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : [
      'https://neuropilot-inventory-ngrq6b78x-david-mikulis-projects-73b27c6d.vercel.app',
      'https://neuropilot-inventory.vercel.app'
    ];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // Allow server-to-server, mobile apps
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn('CORS blocked request from unauthorized origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  maxAge: 600 // 10 minutes cache
}));
```

**Why This Matters**:
- Prevents malicious websites from making authenticated requests
- Logs all blocked attempts for security monitoring
- Allows legitimate frontend domains only

**How to Add New Origins**:
```bash
# Railway Dashboard → Service → Variables
ALLOWED_ORIGINS=https://neuropilot-inventory.vercel.app,https://new-domain.com
```

**Verification**:
```bash
# Should succeed
curl -sI -H "Origin: https://neuropilot-inventory.vercel.app" \
  https://resourceful-achievement-production.up.railway.app/api/health | \
  grep access-control-allow-origin

# Should be empty/blocked
curl -sI -H "Origin: https://evil.com" \
  https://resourceful-achievement-production.up.railway.app/api/health | \
  grep access-control-allow-origin
```

### 2. Container Security

#### Non-Root User
**UID/GID**: 1001:1001 (appuser)
**Why**: Limits blast radius if container is compromised

**Verification**:
```bash
docker run --rm neuropilot-api:prod id
# Expected: uid=1001(appuser) gid=1001(appuser)
```

#### Secret Exclusion
**Mechanisms**:
1. `.dockerignore` excludes `.env*`, `*.pem`, `*.key`, etc.
2. Runtime stage removes any accidentally copied secrets
3. CI scans image layers for secret patterns

**Verification** (in CI):
```bash
docker run --rm neuropilot-api:prod find /app -name '.env*'
# Expected: (empty)
```

#### Base Image Pinning
**Image**: `node:20-alpine@sha256:6178e78b972f79c335df281f4b7674a2d85071aae2af020ffa39f0a770265435`
**Why**: Reproducible builds, protection against supply chain attacks

**Maintenance**: Update digest quarterly or when Alpine security patches released

#### Health Check
**Endpoint**: `/api/health`
**Interval**: 30s
**Timeout**: 3s
**Start Period**: 10s
**Retries**: 3

**Response**:
```json
{
  "status": "healthy",
  "timestamp": "2025-10-27T10:02:30.958Z",
  "service": "neuro-pilot-ai",
  "version": "1.0.0"
}
```

### 3. Supply Chain Security

#### Package Lock Enforcement
**CI Check** (.github/workflows/backend-security-scan.yml:37-54):
- FAILS build if `package-lock.json` missing
- FAILS build if lockfile out of sync with `package.json`
- Ensures reproducible dependency resolution

**Local Regeneration**:
```bash
cd backend
rm -rf node_modules package-lock.json
npm install --package-lock-only
git add package-lock.json
git commit -m "chore: update package-lock.json"
```

#### SBOM (Software Bill of Materials)
**Format**: CycloneDX JSON
**Generation**: Automatic on every CI build
**Storage**: GitHub Actions artifacts (90-day retention)
**Tool**: Trivy

**Where to Download**:
1. GitHub → Actions tab
2. Select latest "Backend Security Scan & Build" workflow run
3. Scroll to **Artifacts** section
4. Download `sbom-cyclonedx`

**Use Cases**:
- Compliance audits (SOC 2, ISO 27001)
- Incident response (was vulnerable package X deployed?)
- License compliance
- Supply chain risk assessment

#### Vulnerability Scanning
**Tool**: Trivy
**Thresholds**:
- HIGH severity: Fails build
- CRITICAL severity: Fails build
- MEDIUM/LOW: Logged but allowed

**Frequency**: Every push to main/staging/fix branches

**Manual Scan**:
```bash
trivy image --severity HIGH,CRITICAL neuropilot-api:prod
```

---

## 🚀 Deployment

### Environment Variables (Railway)

**Required**:
```bash
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@host:port/db
JWT_SECRET=<strong-secret-minimum-64-chars>
PORT=8083
```

**Optional but Recommended**:
```bash
ALLOWED_ORIGINS=https://neuropilot-inventory.vercel.app,https://*.vercel.app
LOG_LEVEL=info
```

**Security Notes**:
- `JWT_SECRET` must be cryptographically strong (64+ characters)
- Never commit secrets to Git
- Rotate `JWT_SECRET` quarterly or after security incident
- Use Railway's built-in secret management (encrypted at rest)

### Start Command
```bash
node server.js
```

### Health Check Path
```
/api/health
```

### Expected Response Time
- Health check: <100ms
- API endpoints: <500ms (P95)

---

## 📊 Observability

### Health Monitoring
**Quick Watch** (30-second intervals):
```bash
watch -n 30 'curl -s -o /dev/null -w "%{http_code} %{time_total}\n" \
  https://resourceful-achievement-production.up.railway.app/api/health'
```

**Expected Output**:
```
200 0.084
200 0.092
200 0.078
```

**Alerts to Set Up**:
- Health check returns non-200: CRITICAL
- Response time >1s: WARNING
- 5 consecutive failures: CRITICAL

### Logging

**CORS Blocks** (security-relevant):
```
logger.warn('CORS blocked request from unauthorized origin:', origin);
```

**What to Monitor**:
- Sudden spike in blocked CORS requests → potential attack
- Blocked requests from known domains → configuration issue
- Repeated blocks from same IP → consider IP blocking

**Log Aggregation**:
- Railway provides built-in logging
- Consider shipping to Datadog/Sentry for long-term retention
- Set up alerts for `CORS blocked` patterns

### Metrics to Track

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| Health Check Uptime | 99.9% | <99.5% |
| API Response Time (P95) | <500ms | >1s |
| CORS Blocks/hour | <10 | >100 |
| CPU Usage | <50% | >80% |
| Memory Usage | <70% | >85% |
| Image Size | ~150MB | >200MB |
| Build Time | 2-3min | >5min |

---

## 🔄 Rollback Procedures

### Quick Rollback (Railway)
```bash
# Option 1: Railway Dashboard
# Go to Deployments → Select previous working deployment → Click "Redeploy"

# Option 2: Railway CLI
railway redeploy --rollback

# Option 3: Pin to specific commit
git log --oneline  # Find last known-good commit SHA
# In Railway: Settings → Deploy → Deploy from commit → Enter SHA
```

**Rollback Decision Matrix**:
| Scenario | Action | Rollback? |
|----------|--------|-----------|
| Health check failing | Check logs first | YES if >5min |
| CORS blocking legit traffic | Fix ALLOWED_ORIGINS | NO (env var fix) |
| High error rate (>5%) | Check logs | YES if critical |
| Slow responses (>1s P95) | Check DB, scaling | MAYBE |
| Security vulnerability found | Assess severity | YES if HIGH/CRITICAL |

### Post-Rollback
1. Investigate root cause in logs
2. Reproduce issue locally
3. Fix and test in staging
4. Redeploy with fix

---

## 🧪 Testing

### Pre-Deployment Checklist
```bash
cd backend

# 1. Dependencies
rm -rf node_modules
npm ci --omit=dev

# 2. Lockfile sync
npm ci --omit=dev --dry-run

# 3. Security audit
npm audit --production

# 4. Docker build (if Docker available)
DOCKER_BUILDKIT=1 docker build -t neuropilot-api:test .

# 5. Security scan (if Trivy available)
trivy image --severity HIGH,CRITICAL neuropilot-api:test

# 6. SBOM generation (if Trivy available)
trivy image --format cyclonedx --output sbom.json neuropilot-api:test

# 7. Test container (if Docker available)
docker run -d --name test -p 8083:8083 \
  -e DATABASE_URL="test" \
  -e JWT_SECRET="test-secret-64-chars-minimum-for-testing-purposes-only-do-not-use" \
  neuropilot-api:test

sleep 5
curl http://localhost:8083/api/health
docker stop test && docker rm test
```

### Post-Deployment Verification
```bash
BACKEND="https://resourceful-achievement-production.up.railway.app"
FRONTEND="https://neuropilot-inventory.vercel.app"

# 1. Health check
curl -s "$BACKEND/api/health" | jq .

# 2. CORS (allowed)
curl -sI -H "Origin: $FRONTEND" "$BACKEND/api/health" | grep access-control

# 3. CORS (blocked)
curl -sI -H "Origin: https://evil.com" "$BACKEND/api/health" | grep access-control

# 4. Response time
time curl -s "$BACKEND/api/health" > /dev/null

# 5. Security headers
curl -sI "$BACKEND/api/health" | grep -E "(strict-transport|x-frame|x-content-type)"

# 6. Rate limiting (if applicable)
for i in {1..50}; do curl -s -o /dev/null -w "%{http_code} " "$BACKEND/api/health"; done
```

---

## 🛠️ Maintenance

### Quarterly Tasks
1. **Update Base Image Digest** (Dockerfile:4)
   - Check for new `node:20-alpine` releases
   - Update SHA256 digest
   - Test and deploy

2. **Rotate JWT_SECRET**
   - Generate new secret: `openssl rand -base64 64`
   - Update Railway env var
   - Redeploy (will invalidate existing tokens)

3. **Review SBOM**
   - Download latest SBOM artifact
   - Review for new vulnerabilities
   - Update dependencies if needed

4. **Audit CORS Origins**
   - Review `ALLOWED_ORIGINS` list
   - Remove decommissioned domains
   - Add new authorized domains

### Monthly Tasks
1. **Review Security Logs**
   - Check for unusual CORS block patterns
   - Look for failed authentication attempts
   - Review rate limiting effectiveness

2. **Run Security Audit**
   ```bash
   npm audit --production
   npm audit fix  # If safe updates available
   ```

3. **Check for Dependency Updates**
   ```bash
   npm outdated
   # Update patch/minor versions
   npm update
   npm audit
   git add package.json package-lock.json
   git commit -m "chore: update dependencies"
   ```

### Weekly Tasks
1. **Monitor Health Check Uptime**
   - Review Railway metrics
   - Check for any downtime incidents

2. **Review Build Times**
   - Ensure builds complete in 2-3 minutes
   - Investigate if builds are slowing down

---

## 🚨 Incident Response

### CORS Vulnerability Detected
**Symptoms**: `access-control-allow-origin: *` in production

**Immediate Actions**:
1. Check if server.js:176-203 is deployed
2. Verify ALLOWED_ORIGINS env var is set
3. Check Railway logs for `CORS allowed origins:` message
4. If wildcard persists, restart service
5. If still failing, rollback and investigate

**Root Cause Examples**:
- Deployment failed silently
- server.js not included in Docker image
- CORS middleware being overridden

### Container Running as Root
**Detection**: `docker run --rm <image> id` returns `uid=0`

**Immediate Actions**:
1. Stop deployment immediately
2. Check Dockerfile USER directive (should be line 42)
3. Verify CI step "Verify running as non-root" passed
4. Rebuild image from scratch
5. Verify before redeploying

### Secrets Leaked in Image
**Detection**: CI step "Verify no .env files in image" fails

**Immediate Actions**:
1. Block deployment
2. Identify leaked secret (check CI logs)
3. Rotate compromised secret immediately
4. Update .dockerignore to exclude pattern
5. Rebuild and scan before deploying
6. Audit Git history for committed secrets

### High/Critical Vulnerability Found
**Detection**: Trivy scan fails build

**Assessment**:
1. Check CVE details in Trivy output
2. Determine if vulnerability is exploitable in your context
3. Check if fix is available

**Actions**:
- **Fix Available**: Update dependency, test, deploy
- **No Fix Yet**:
  - Assess risk (CVSS score, attack vector)
  - Consider temporary mitigation (WAF rules, etc.)
  - Monitor vendor for patch
  - Document decision in security log

**Thresholds**:
- CRITICAL with remote exploit: Hotfix within 24 hours
- CRITICAL local only: Patch within 1 week
- HIGH: Patch within 2 weeks

---

## 📞 Stakeholder Communication

### For Executives
> "Our backend API is now enterprise-grade secure with reproducible builds, automated vulnerability scanning, and restricted CORS. We generate a Software Bill of Materials (SBOM) for every deployment, giving us full supply chain visibility for compliance and incident response."

### For Engineering Teams
> "Docker builds are now reproducible with lockfile enforcement and SHA256 base pinning. We run Trivy scans on every build (fail on HIGH/CRITICAL), generate SBOMs in CycloneDX format, and restrict CORS to authorized Vercel domains only. Images run as non-root (UID 1001) with health checks."

### For Security/Compliance Teams
> "We've implemented enterprise container security: multi-stage builds with non-root execution, secret exclusion validated in CI, CORS restricted with audit logging, automated vulnerability scanning with fail thresholds, and SBOM generation (CycloneDX) for supply chain traceability. Artifacts retained 90 days."

### For Operations Teams
> "New deployments use BuildKit cache (50-80% faster builds), health checks on /api/health, tini for signal handling, and pinned npm version (10.7.0). Rollback via Railway dashboard or CLI. Monitor CORS blocks in logs for security events."

---

## 📚 References

### Internal Documentation
- `DOCKER_BUILD_FIX_COMPLETE.md` - Detailed build fix documentation
- `DEPLOYMENT_VERIFICATION_STATUS.md` - Current deployment status
- `SECURITY_AUDIT_REPORT.md` - Security testing results
- `backend/test-cors.sh` - Automated CORS testing script

### External Resources
- [OWASP CORS Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [CycloneDX SBOM Specification](https://cyclonedx.org/)
- [Docker Security Best Practices](https://docs.docker.com/develop/security-best-practices/)
- [Trivy Documentation](https://aquasecurity.github.io/trivy/)
- [Railway Documentation](https://docs.railway.app/)

### Compliance Mappings
- **SOC 2**: SBOM generation, vulnerability scanning, access controls (CORS)
- **ISO 27001**: Supply chain security, change management, incident response
- **NIST CSF**: Asset management (SBOM), protective technology (container security)

---

## 🎓 Knowledge Transfer

### For New Team Members
1. Read this runbook
2. Review `DOCKER_BUILD_FIX_COMPLETE.md`
3. Run local verification commands
4. Deploy to staging environment
5. Monitor Railway logs for 1 week
6. Shadow on-call rotation

### Key Concepts to Understand
- **Multi-Stage Docker Builds**: Separate build and runtime stages
- **BuildKit Cache Mounts**: Speed up dependency installation
- **Corepack**: npm version manager built into Node.js
- **SBOM**: Software Bill of Materials for supply chain visibility
- **CORS**: Cross-Origin Resource Sharing security model
- **Trivy**: Comprehensive security scanner
- **Railway**: Platform-as-a-Service deployment

---

**Document Maintained By**: DevSecOps Team
**Last Reviewed**: 2025-10-27
**Next Review**: 2025-11-27 (monthly)
**Classification**: Internal - Operations Team
**Version**: 1.0-enterprise

---

## ✅ Quick Reference Card

**Health Check URL**:
```
https://resourceful-achievement-production.up.railway.app/api/health
```

**Expected Response**:
```json
{"status":"healthy","timestamp":"...","service":"neuro-pilot-ai","version":"1.0.0"}
```

**CORS Test (Allowed)**:
```bash
curl -sI -H "Origin: https://neuropilot-inventory.vercel.app" \
  https://resourceful-achievement-production.up.railway.app/api/health | \
  grep access-control-allow-origin
```

**Rollback Command**:
```bash
railway redeploy --rollback
```

**SBOM Download**:
```
GitHub → Actions → Latest Workflow → Artifacts → sbom-cyclonedx
```

**Emergency Contacts**:
- DevOps Lead: [Contact Info]
- Security Team: [Contact Info]
- On-Call Rotation: [PagerDuty/Opsgenie Link]
