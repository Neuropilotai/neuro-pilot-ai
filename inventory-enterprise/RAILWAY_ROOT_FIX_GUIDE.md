# 🚨 CRITICAL: Fix Railway Root Directory

## Problem
Railway deployments are failing with:
```
Could not find root directory: /inventory-enterprise/backend
```

The old v20.1.0 deployment is still running because new deployments can't start.

---

## ✅ Solution (2 minutes - Must be done in Railway Dashboard)

### Step 1: Open Railway Service Settings
1. Go to: https://railway.com/project/6eb48b9a-8fe0-4836-8247-f6cef566f299/service/8153394f-c7df-44a8-9691-d0f53da3d43d
2. Click **"Settings"** in the left sidebar

### Step 2: Update Root Directory
1. Scroll down to **"Service"** section
2. Find **"Root Directory"** field
3. **Current (WRONG):** `/inventory-enterprise/backend` (with leading slash)
4. **Change to:** `inventory-enterprise/backend` (NO leading slash)
5. Click **"Save"** or **"Update"**

### Step 3: Trigger New Deployment
1. Go to **"Deployments"** tab
2. Click **"Deploy"** button
3. Wait 2 minutes for build

### Step 4: Verify
```bash
curl https://inventory-backend-7-agent-build.up.railway.app/api/health | jq .
```

Should return:
```json
{
  "version": "21.1.0",
  "database": "connected",
  "status": "healthy"
}
```

---

## Why This Happens
Railway interprets paths:
- ❌ `/inventory-enterprise/backend` = Absolute path from filesystem root (doesn't exist in container)
- ✅ `inventory-enterprise/backend` = Relative path from repo root (correct)

---

## After Fix is Applied

Run the full deployment:
```bash
cd ~/neuro-pilot-ai/inventory-enterprise
./quick-deploy-v21_1.sh
```

---

**This MUST be done in the Railway Dashboard UI. There is no CLI command to set the root directory.**
