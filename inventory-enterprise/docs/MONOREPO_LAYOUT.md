# NeuroNexus - Monorepo Layout & Path Mapping

**Repository:** `Neuropilotai/neuro-pilot-ai`
**Structure:** Monorepo (multiple projects in one repo)
**Platform:** Railway (requires correct path mapping)

---

## 📁 Repository Structure

```
neuro-pilot-ai/                              # ← Git repository root
├── .git/                                    # Git metadata
├── .github/
│   └── workflows/                           # GitHub Actions (repo-wide)
│       ├── autonomous_railway_deploy.yml    # v19.0 CI/CD (CORRECT PATHS)
│       └── (legacy workflows)               # May have incorrect paths
│
└── inventory-enterprise/                    # ← Main project directory
    ├── .github/
    │   └── workflows/
    │       ├── autonomous_ci.yml            # Legacy (path issues)
    │       └── autonomous_railway_deploy.yml # ✅ Correct monorepo paths
    │
    ├── backend/                             # ⭐ BACKEND SERVICE ROOT
    │   ├── Procfile                         # Railway start command
    │   ├── package.json                     # Node.js dependencies
    │   ├── package-lock.json                # Locked versions
    │   ├── server.js                        # ⚡ Entry point
    │   ├── database.js                      # DB wrapper
    │   ├── scheduler.js                     # Autonomous cron jobs
    │   ├── generate_daily_report.js         # Email reports
    │   ├── routes/
    │   │   ├── recommendations.js           # Recommendations API
    │   │   └── (other routes)
    │   ├── config/
    │   │   └── database.js                  # DB config
    │   └── database.db                      # SQLite database
    │
    ├── ml-service/                          # ⭐ ML SERVICE ROOT
    │   ├── Procfile                         # Railway start command
    │   ├── requirements.txt                 # Python dependencies
    │   └── main.py                          # ⚡ FastAPI entry point
    │
    ├── migrations/                          # Database migrations
    │   ├── 001_forecast_schema_v1.sql
    │   └── 002_autonomous_foundation.sql
    │
    ├── docs/                                # Documentation
    │   ├── ENV_VARS_V19.md                  # Environment variables
    │   ├── ROLLBACK_PLAN.md                 # Rollback procedures
    │   └── MONOREPO_LAYOUT.md               # ← You are here
    │
    ├── scripts/                             # Utility scripts
    │   └── smoke-tests.md                   # Post-deployment tests
    │
    ├── railway.json                         # Railway monorepo config
    ├── AUTONOMOUS_RAILWAY_DEPLOYMENT_GUIDE.md
    └── (other docs)
```

---

## 🗺️ Path Mapping for Railway

### Backend Service

| Setting | Value |
|---------|-------|
| **Service Name** | `backend` |
| **Root Directory** | `inventory-enterprise/backend` |
| **Build Command** | `npm ci` |
| **Start Command** | `node server.js` |
| **Watch Paths** | `inventory-enterprise/backend/**` |
| **Health Check** | `/api/health` |

**CRITICAL:** Root directory MUST point to `inventory-enterprise/backend`, not:
- ❌ `backend` (missing parent directory)
- ❌ `inventory-enterprise` (too high - would try to run migrations as main app)
- ❌ Repo root (would not find package.json)

**How Railway resolves paths:**
```
Git root: /workspace/
Railway root: /workspace/inventory-enterprise/backend/
Entry point: /workspace/inventory-enterprise/backend/server.js
```

---

### ML Service

| Setting | Value |
|---------|-------|
| **Service Name** | `ml-service` |
| **Root Directory** | `inventory-enterprise/ml-service` |
| **Build Command** | `pip install -r requirements.txt` |
| **Start Command** | `uvicorn main:app --host 0.0.0.0 --port $PORT` |
| **Watch Paths** | `inventory-enterprise/ml-service/**` |
| **Health Check** | `/status` |

**CRITICAL:** Must use exact name `ml-service` for internal networking:
- Internal URL: `http://ml-service.railway.internal:8000`
- If named differently: Update `ML_URL` in backend Variables

---

## 🚨 Common Monorepo Mistakes

### Mistake 1: Wrong Working Directory

**Symptom:** `No such file or directory: package.json`

**Incorrect:**
```yaml
# .github/workflows/deploy.yml
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci  # ❌ No package.json at repo root!
```

**Correct:**
```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: inventory-enterprise/backend  # ✅
    steps:
      - uses: actions/checkout@v4
      - run: npm ci  # ✅ Now finds package.json
```

---

### Mistake 2: Path Filters Don't Match

**Symptom:** GitHub Actions workflow doesn't trigger on push

**Incorrect:**
```yaml
on:
  push:
    paths:
      - 'backend/**'  # ❌ Misses 'inventory-enterprise/' prefix
```

**Correct:**
```yaml
on:
  push:
    paths:
      - 'inventory-enterprise/backend/**'  # ✅ Matches actual structure
```

**Test your path filter:**
```bash
# Show files changed in last commit
git diff --name-only HEAD~1 HEAD

# Output should show:
inventory-enterprise/backend/server.js  # ← Must start with 'inventory-enterprise/'
```

---

### Mistake 3: Railway Root Directory Wrong

**Symptom:** Railway build fails with "buildpack not detected"

**Incorrect Railway settings:**
```
Root Directory: backend  # ❌ Railway looks in /workspace/backend (doesn't exist)
```

**Correct:**
```
Root Directory: inventory-enterprise/backend  # ✅ Railway looks in /workspace/inventory-enterprise/backend
```

**Verification:**
```bash
# In Railway build logs, you should see:
Nixpacks detected: Node.js
Working directory: /workspace/inventory-enterprise/backend
Found package.json: /workspace/inventory-enterprise/backend/package.json
```

---

### Mistake 4: Cache Paths Don't Match

**Symptom:** GitHub Actions cache never hits

**Incorrect:**
```yaml
- uses: actions/setup-node@v4
  with:
    cache: 'npm'
    cache-dependency-path: 'package-lock.json'  # ❌ Not found
```

**Correct:**
```yaml
- uses: actions/setup-node@v4
  with:
    cache: 'npm'
    cache-dependency-path: 'inventory-enterprise/backend/package-lock.json'  # ✅
```

---

### Mistake 5: Relative Imports Break

**Symptom:** `require('./config/database')` fails in Railway

**Cause:** Working directory assumptions

**Fix:** Always use paths relative to service root:
```javascript
// ❌ Bad (assumes execution from repo root)
const db = require('../../../backend/config/database');

// ✅ Good (relative to backend/ directory)
const db = require('./config/database');
```

Railway sets working directory to service root automatically.

---

## 🛠️ Debugging Path Issues

### Check 1: Verify Git Paths

```bash
# Show all files in backend/
git ls-files inventory-enterprise/backend/

# Should output:
inventory-enterprise/backend/package.json
inventory-enterprise/backend/server.js
inventory-enterprise/backend/Procfile
...
```

---

### Check 2: Test GitHub Actions Locally

```bash
# Install act (GitHub Actions local runner)
brew install act

# Run workflow locally
act -W .github/workflows/autonomous_railway_deploy.yml
```

---

### Check 3: Verify Railway Build

```bash
# Railway CLI - simulate build
cd inventory-enterprise/backend
railway run npm ci
railway run node server.js
```

---

### Check 4: Check Working Directory in Railway

```bash
# Add to server.js temporarily:
console.log('Working directory:', process.cwd());
console.log('__dirname:', __dirname);

# Deploy and check logs:
railway logs --service backend | grep "Working directory"
# Expected: /app (Railway always uses /app as working dir)
```

---

## 📝 Railway Monorepo Best Practices

### 1. Use Explicit Root Directories

Always set `Root Directory` in Railway service settings:
- Backend: `inventory-enterprise/backend`
- ML Service: `inventory-enterprise/ml-service`

### 2. Use Watch Patterns

Tell Railway which files should trigger deploys:
```json
{
  "services": {
    "backend": {
      "build": {
        "watchPatterns": [
          "inventory-enterprise/backend/**"
        ]
      }
    }
  }
}
```

### 3. Test Paths in CI

Add path verification step:
```yaml
- name: Verify paths
  run: |
    test -f inventory-enterprise/backend/package.json || exit 1
    test -f inventory-enterprise/ml-service/requirements.txt || exit 1
```

### 4. Document Structure

Keep this file (`MONOREPO_LAYOUT.md`) updated when:
- Adding new services
- Changing directory structure
- Moving files

---

## 🔍 Path Reference Quick Lookup

| Need | Path |
|------|------|
| Backend package.json | `inventory-enterprise/backend/package.json` |
| Backend entry point | `inventory-enterprise/backend/server.js` |
| ML service entry point | `inventory-enterprise/ml-service/main.py` |
| Database migrations | `inventory-enterprise/migrations/*.sql` |
| GitHub Actions | `.github/workflows/*.yml` (repo root) |
| Railway config | `inventory-enterprise/railway.json` |
| Environment vars docs | `inventory-enterprise/docs/ENV_VARS_V19.md` |
| Deployment guide | `inventory-enterprise/AUTONOMOUS_RAILWAY_DEPLOYMENT_GUIDE.md` |

---

## 🚀 Deploy from Monorepo (Step-by-Step)

### Git Workflow

```bash
# 1. Make changes to backend
cd inventory-enterprise/backend
vim server.js

# 2. Stage changes (from repo root or subdirectory)
git add .

# 3. Commit (mention service in message)
git commit -m "backend: fix scheduler timing"

# 4. Push to trigger CI/CD
git push origin main
```

### Railway Auto-Deploy

Railway watches these paths:
- `inventory-enterprise/backend/**` → Redeploys backend service
- `inventory-enterprise/ml-service/**` → Redeploys ml-service
- Other paths → No deploy triggered

---

## ✅ Monorepo Checklist

Before deployment, verify:

- [ ] Railway Root Directory set correctly for each service
- [ ] GitHub Actions `working-directory` matches actual paths
- [ ] GitHub Actions `paths` filters include `inventory-enterprise/`
- [ ] Cache paths in CI include full path to lock files
- [ ] Watch patterns in `railway.json` match service directories
- [ ] No hardcoded absolute paths in code
- [ ] All imports relative to service root

---

**END OF MONOREPO LAYOUT GUIDE**
