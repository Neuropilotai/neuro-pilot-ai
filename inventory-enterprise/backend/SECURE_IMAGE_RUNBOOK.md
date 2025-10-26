# Secure Docker Image Runbook - NeuroPilot Backend

## Overview

This runbook provides step-by-step procedures for building, scanning, and deploying secure Docker images for the NeuroPilot backend. Following these procedures ensures that no secrets leak into images and that all security best practices are enforced.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Generate package-lock.json](#1-generate-package-lockjson)
3. [Build Secure Docker Image](#2-build-secure-docker-image)
4. [Scan Image with Trivy](#3-scan-image-with-trivy)
5. [Verify No Secrets in Image](#4-verify-no-secrets-in-image)
6. [Run Container with Security Flags](#5-run-container-with-security-flags)
7. [Deploy to Railway/Cloud Platform](#6-deploy-to-railwaycloud-platform)
8. [CI/CD Pipeline](#7-cicd-pipeline)
9. [Troubleshooting](#8-troubleshooting)
10. [Security Checklist](#9-security-checklist)

---

## Prerequisites

Install the following tools:

```bash
# Docker (latest version)
docker --version

# Trivy scanner
brew install trivy  # macOS
# OR
wget -qO - https://aquasecurity.github.io/trivy-repo/deb/public.key | sudo apt-key add -
echo "deb https://aquasecurity.github.io/trivy-repo/deb $(lsb_release -sc) main" | sudo tee /etc/apt/sources.list.d/trivy.list
sudo apt-get update && sudo apt-get install trivy

# Node.js 20+
node --version

# Git
git --version
```

---

## 1. Generate package-lock.json

**Why**: Enables reproducible builds with `npm ci` and ensures dependency integrity.

**Steps**:

```bash
cd /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise/backend

# Generate or update package-lock.json
npm install --package-lock-only

# Verify it was created
ls -lh package-lock.json

# Commit to Git
git add package-lock.json
git commit -m "chore: add/update package-lock.json for reproducible builds"
```

**Validation**:
- File should be ~300KB+ (contains full dependency tree)
- Should be committed to version control
- Never add to `.dockerignore` or `.gitignore`

---

## 2. Build Secure Docker Image

**Command**:

```bash
cd /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise/backend

# Build with BuildKit (recommended)
DOCKER_BUILDKIT=1 docker build \
  -t neuropilot-backend:secure \
  -f Dockerfile \
  .

# Verify build succeeded
docker images | grep neuropilot-backend
```

**Expected Output**:
```
neuropilot-backend   secure   abc123def456   2 minutes ago   150MB
```

**Multi-platform build (optional)**:
```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t neuropilot-backend:secure \
  --load \
  .
```

---

## 3. Scan Image with Trivy

**Why**: Detect vulnerabilities in OS packages and Node.js dependencies before deployment.

### 3.1 Basic Scan (Fail on HIGH/CRITICAL)

```bash
trivy image \
  --severity HIGH,CRITICAL \
  --exit-code 1 \
  neuropilot-backend:secure
```

**Exit codes**:
- `0` = No vulnerabilities found
- `1` = Vulnerabilities found (build should fail)

### 3.2 Detailed Scan (All Severities)

```bash
trivy image \
  --severity LOW,MEDIUM,HIGH,CRITICAL \
  --format table \
  neuropilot-backend:secure
```

### 3.3 Generate SARIF Report (for GitHub Security)

```bash
trivy image \
  --format sarif \
  --output trivy-results.sarif \
  --severity HIGH,CRITICAL \
  neuropilot-backend:secure

# Upload to GitHub (requires GitHub CLI)
gh api repos/:owner/:repo/code-scanning/sarifs \
  --method POST \
  --field sarif=@trivy-results.sarif
```

### 3.4 Scan and Ignore Unfixed Vulnerabilities

```bash
trivy image \
  --severity HIGH,CRITICAL \
  --ignore-unfixed \
  --exit-code 1 \
  neuropilot-backend:secure
```

**When to use**:
- Production builds (don't fail on unfixable CVEs)
- Development builds should fail on all vulnerabilities

---

## 4. Verify No Secrets in Image

### 4.1 Check Docker Image History

```bash
# Look for secrets in layer commands
docker history neuropilot-backend:secure --no-trunc | grep -iE '(secret|password|token|api_key|jwt|env)'
```

**Expected**: No matches (exit code 1)

### 4.2 Inspect Image Filesystem

```bash
# Check for .env files
docker run --rm neuropilot-backend:secure find /app -name '.env*'

# Check for key files
docker run --rm neuropilot-backend:secure find /app -name '*.pem' -o -name '*.key'

# Check for secrets directory
docker run --rm neuropilot-backend:secure ls -la /app/secrets 2>&1
```

**Expected**: All should return empty or "No such file"

### 4.3 Automated Secret Scanning

```bash
# Using Trivy secret scan
trivy image \
  --scanners secret \
  neuropilot-backend:secure

# Using gitleaks (if installed)
docker save neuropilot-backend:secure | gitleaks detect --source stdin --no-git
```

### 4.4 Manual Verification Script

```bash
#!/bin/bash
# verify-no-secrets.sh

IMAGE_NAME="neuropilot-backend:secure"

echo "🔍 Checking for secrets in Docker image..."

# Check for .env files
if docker run --rm $IMAGE_NAME find /app -name '.env*' 2>/dev/null | grep -q .; then
  echo "❌ ERROR: .env files found in image!"
  exit 1
fi

# Check for key files
if docker run --rm $IMAGE_NAME find /app \( -name '*.pem' -o -name '*.key' -o -name '*.crt' \) 2>/dev/null | grep -q .; then
  echo "❌ ERROR: Key/cert files found in image!"
  exit 1
fi

# Check environment variables don't contain secrets
if docker inspect $IMAGE_NAME --format='{{.Config.Env}}' | grep -iE '(password|secret|token|api_key)='; then
  echo "⚠️ WARNING: Potential secrets in environment variables!"
  exit 1
fi

echo "✅ No secrets found in image!"
exit 0
```

---

## 5. Run Container with Security Flags

### 5.1 Development/Testing (Minimal Security)

```bash
docker run -d \
  --name neuropilot-api-dev \
  -p 8083:8083 \
  -e NODE_ENV=production \
  -e DATABASE_URL="postgresql://user:pass@localhost:5432/db" \
  -e JWT_SECRET="$(openssl rand -hex 64)" \
  neuropilot-backend:secure
```

### 5.2 Production (Maximum Security)

```bash
docker run -d \
  --name neuropilot-api-prod \
  --restart=always \
  --read-only \
  --tmpfs /tmp:rw,exec,nosuid,nodev,size=100m \
  --tmpfs /app/logs:rw,nosuid,nodev,size=200m \
  --cap-drop ALL \
  --cap-add NET_BIND_SERVICE \
  --security-opt=no-new-privileges:true \
  --health-cmd="node -e \"require('http').get('http://localhost:8083/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))\"" \
  --health-interval=30s \
  --health-timeout=3s \
  --health-retries=3 \
  -p 8083:8083 \
  -e NODE_ENV=production \
  -e DATABASE_URL="$DATABASE_URL" \
  -e JWT_SECRET="$JWT_SECRET" \
  -e JWT_REFRESH_SECRET="$JWT_REFRESH_SECRET" \
  -e ENCRYPTION_KEY="$ENCRYPTION_KEY" \
  neuropilot-backend:secure
```

**Security flags explained**:

| Flag | Purpose |
|------|---------|
| `--read-only` | Root filesystem is read-only (prevents tampering) |
| `--tmpfs /tmp` | Writable temp directory (in-memory, ephemeral) |
| `--cap-drop ALL` | Drop all Linux capabilities |
| `--cap-add NET_BIND_SERVICE` | Only allow binding to network ports |
| `--security-opt=no-new-privileges` | Prevent privilege escalation |
| `--health-cmd` | Automatic health monitoring |

### 5.3 Using Docker Compose (Production)

```yaml
# docker-compose.secure.yml
version: '3.8'

services:
  neuropilot-api:
    image: neuropilot-backend:secure
    restart: always
    read_only: true
    cap_drop:
      - ALL
    cap_add:
      - NET_BIND_SERVICE
    security_opt:
      - no-new-privileges:true
    tmpfs:
      - /tmp:rw,exec,nosuid,nodev,size=100m
      - /app/logs:rw,nosuid,nodev,size=200m
    ports:
      - "8083:8083"
    environment:
      NODE_ENV: production
      DATABASE_URL: ${DATABASE_URL}
      JWT_SECRET: ${JWT_SECRET}
      JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET}
      ENCRYPTION_KEY: ${ENCRYPTION_KEY}
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:8083/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"]
      interval: 30s
      timeout: 3s
      retries: 3
      start_period: 10s
```

**Run**:
```bash
docker-compose -f docker-compose.secure.yml up -d
```

---

## 6. Deploy to Railway/Cloud Platform

### 6.1 Railway Deployment

Railway automatically uses the Dockerfile. Ensure `railway.json` is configured:

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "Dockerfile"
  },
  "deploy": {
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10,
    "healthcheckPath": "/api/health",
    "healthcheckTimeout": 100
  }
}
```

**Set environment variables in Railway Dashboard**:
- ✅ Use Railway's "Variables" tab (NOT in Dockerfile)
- ✅ Use `${{Postgres.DATABASE_URL}}` for database
- ✅ Generate secrets with: `node generate-railway-secrets.js`

### 6.2 AWS ECS/Fargate

```bash
# Build for ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com

# Tag and push
docker tag neuropilot-backend:secure <account-id>.dkr.ecr.us-east-1.amazonaws.com/neuropilot-backend:latest
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/neuropilot-backend:latest

# Deploy with Fargate task definition (set secrets via AWS Secrets Manager)
```

### 6.3 Google Cloud Run

```bash
# Tag for GCR
docker tag neuropilot-backend:secure gcr.io/<project-id>/neuropilot-backend:latest

# Push to GCR
docker push gcr.io/<project-id>/neuropilot-backend:latest

# Deploy (secrets via Secret Manager)
gcloud run deploy neuropilot-backend \
  --image gcr.io/<project-id>/neuropilot-backend:latest \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated
```

---

## 7. CI/CD Pipeline

The GitHub Actions workflow (`.github/workflows/backend-security-scan.yml`) automatically:

1. ✅ Verifies `package-lock.json` exists
2. ✅ Runs `npm audit` (fails on moderate+ vulnerabilities)
3. ✅ Builds Docker image
4. ✅ Runs Trivy scan (fails on HIGH/CRITICAL CVEs)
5. ✅ Checks for secrets in image layers
6. ✅ Verifies container runs as non-root
7. ✅ Uploads SARIF report to GitHub Security

**Trigger workflow**:
```bash
git push origin main
```

**View results**:
- GitHub → Actions tab → "Backend Security Scan & Build"
- GitHub → Security tab → Code scanning alerts

---

## 8. Troubleshooting

### Issue: package-lock.json missing

**Error**:
```
WARNING: package-lock.json missing — falling back to npm install
```

**Fix**:
```bash
cd backend
npm install --package-lock-only
git add package-lock.json
git commit -m "chore: add package-lock.json"
```

### Issue: Trivy scan fails with HIGH/CRITICAL vulnerabilities

**Error**:
```
Total: 5 (HIGH: 3, CRITICAL: 2)
```

**Fix**:
```bash
# Update dependencies
npm update

# Audit and fix
npm audit fix

# If fix not available, update manually
npm install package-name@latest

# Rebuild image
docker build -t neuropilot-backend:secure .
```

### Issue: Secrets found in image

**Error**:
```
❌ ERROR: .env files found in image!
```

**Fix**:
1. Verify `.dockerignore` includes `.env*`
2. Remove secrets from source directory
3. Rebuild image
4. Re-scan with Trivy

### Issue: Container exits immediately

**Check logs**:
```bash
docker logs neuropilot-api-prod
```

**Common causes**:
- Missing environment variables
- Database connection failure
- Port already in use
- Read-only filesystem issue (add tmpfs for writable dirs)

### Issue: Health check failing

**Debug**:
```bash
# Test health endpoint manually
docker exec neuropilot-api-prod curl http://localhost:8083/api/health

# Check server logs
docker logs -f neuropilot-api-prod
```

---

## 9. Security Checklist

Before deploying to production, verify:

### Pre-Build Checklist

- [ ] `package-lock.json` committed to Git
- [ ] `.dockerignore` excludes `.env*`, `*.pem`, `*.key`, `secrets/*`
- [ ] No secrets in source code (`grep -r "secret" .`)
- [ ] No hardcoded API keys or tokens
- [ ] Dependencies up to date (`npm outdated`)

### Build Checklist

- [ ] Image built with `DOCKER_BUILDKIT=1`
- [ ] Multi-stage build used (minimal final image)
- [ ] Non-root user configured (`USER appuser`)
- [ ] Secrets removed from final stage (`RUN rm -f .env`)

### Scan Checklist

- [ ] Trivy scan passed (no HIGH/CRITICAL)
- [ ] No secrets in image layers (`docker history`)
- [ ] No `.env` files in image
- [ ] No key files in image (`.pem`, `.key`, `.crt`)
- [ ] `npm audit` passed (no moderate+ vulnerabilities)

### Runtime Checklist

- [ ] Secrets injected via environment variables (not baked in)
- [ ] Railway/Vercel variables configured
- [ ] CORS configured for frontend domain only
- [ ] HTTPS enforced (platform handles TLS)
- [ ] Container runs as non-root
- [ ] Read-only filesystem enabled (production)
- [ ] Capabilities dropped (`--cap-drop ALL`)
- [ ] Health check configured and passing

### Monitoring Checklist

- [ ] Logs streaming to centralized service
- [ ] Alerts configured for errors
- [ ] Metrics tracked (CPU, memory, requests)
- [ ] Uptime monitoring enabled
- [ ] Security scanning automated in CI/CD

---

## 10. Quick Reference Commands

```bash
# Generate secrets
node generate-railway-secrets.js

# Build image
DOCKER_BUILDKIT=1 docker build -t neuropilot-backend:secure .

# Scan image
trivy image --severity HIGH,CRITICAL --exit-code 1 neuropilot-backend:secure

# Verify no secrets
docker run --rm neuropilot-backend:secure find /app -name '.env*'

# Run securely
docker run -d --read-only --cap-drop ALL --cap-add NET_BIND_SERVICE \
  -e DATABASE_URL="$DATABASE_URL" -p 8083:8083 neuropilot-backend:secure

# Check logs
docker logs -f neuropilot-api-prod

# Health check
curl http://localhost:8083/api/health

# Stop container
docker stop neuropilot-api-prod
docker rm neuropilot-api-prod

# CI/CD workflow
git push origin main  # Triggers GitHub Actions
```

---

## Support

- **Trivy Docs**: https://aquasecurity.github.io/trivy/
- **Docker Security**: https://docs.docker.com/engine/security/
- **Railway Docs**: https://docs.railway.app
- **Node.js Security**: https://nodejs.org/en/docs/guides/security/

---

**Last Updated**: 2025-10-26
**Version**: 1.0.0
**Maintainer**: NeuroPilot Security Team
