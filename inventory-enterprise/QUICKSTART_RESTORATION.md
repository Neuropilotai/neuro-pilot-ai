# 🚀 QUICK START - SYSTEM RESTORATION

**Status**: Environment fixed, Railway redeploying
**Next**: Seed database and verify

---

## ⚡ IMMEDIATE ACTIONS (Copy & Paste)

### 1️⃣ Wait for Railway Deploy to Complete (~3 minutes)

```bash
# Monitor deployment
railway logs --follow

# Press Ctrl+C when you see:
# ✅ "Server started on port"
# ✅ "Phase3 Cron Scheduler initialized"
```

---

### 2️⃣ Seed the Database (CRITICAL - Makes dashboards show data)

```bash
# Navigate to backend
cd /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise/backend

# Run seed script
DATABASE_URL=$(railway variables get DATABASE_URL) node scripts/seed-production-data.js
```

**Expected output:**
```
✅ Database seeding complete!
📊 Summary:
   Owner: owner@neuropilot.ai (Password: NeuroPilot2025!)
   Locations: 5
   Vendors: 5
   Inventory Items: 15
   Menu Items: 6
   AI Insights: 2
```

---

### 3️⃣ Test the Owner Console

**URL**: https://resourceful-achievement-7-agent-neuropilotai.up.railway.app/login.html

**Credentials:**
- Email: `owner@neuropilot.ai`
- Password: `NeuroPilot2025!`

**Verify:**
- ✅ Login works
- ✅ Dashboard shows inventory count > 0
- ✅ Locations appear in dropdown
- ✅ No JavaScript errors in browser console

---

### 4️⃣ Manually Trigger AI Jobs (Optional - For immediate testing)

```bash
# Get auth token (after login, run this in browser console):
# localStorage.getItem('NP_TOKEN')

# Replace <YOUR_TOKEN> with actual token from above
TOKEN="<YOUR_TOKEN>"

# Trigger AI forecast
curl -X POST \
  https://resourceful-achievement-7-agent-neuropilotai.up.railway.app/api/owner/ops/trigger/ai_forecast \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"

# Trigger AI learning
curl -X POST \
  https://resourceful-achievement-7-agent-neuropilotai.up.railway.app/api/owner/ops/trigger/ai_learning \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"
```

---

### 5️⃣ Verify AI Ops Status

```bash
# Check AI Ops health (replace <YOUR_TOKEN>)
curl -H "Authorization: Bearer $TOKEN" \
  https://resourceful-achievement-7-agent-neuropilotai.up.railway.app/api/owner/ops/status | jq .

# Expected:
# {
#   "healthy": true,
#   "healthPct": 75,
#   "ai_ops_health": { "score": 50-70 },
#   "active_modules": { ... }
# }
```

---

## 🔍 TROUBLESHOOTING

### Problem: "Cannot connect to database"

```bash
# Verify DATABASE_URL is set
railway variables | grep DATABASE_URL

# If empty, get from Railway dashboard and set locally:
export DATABASE_URL="postgresql://..."
```

### Problem: "Module not found: bcrypt"

```bash
# Install dependencies
cd /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise/backend
npm install
```

### Problem: "Login fails with 401"

```bash
# Check JWT_SECRET is set
railway variables | grep JWT_SECRET

# If empty, it was set during redeploy. Restart Railway:
railway restart
```

### Problem: "Dashboards show 0 counts"

```bash
# Database not seeded yet. Run seed script:
cd backend
DATABASE_URL=$(railway variables get DATABASE_URL) node scripts/seed-production-data.js
```

---

## 📊 SUCCESS INDICATORS

### After Deploy Completes:
- ✅ Railway logs show "Server started"
- ✅ Health endpoint returns 200: `curl https://resourceful-achievement-7-agent-neuropilotai.up.railway.app/health`
- ✅ No errors in Railway logs

### After Database Seeded:
- ✅ Login works with owner@neuropilot.ai
- ✅ Dashboard shows 15 inventory items
- ✅ Locations dropdown shows 5 locations
- ✅ Vendors dropdown shows 5 vendors

### After AI Jobs Run:
- ✅ Activity feed shows events
- ✅ AI Ops health score > 0
- ✅ Forecast accuracy shows data
- ✅ Learning insights appear

---

## 🎯 WHAT'S NOW WORKING

### ✅ Backend Infrastructure
- Environment variables configured
- Cron scheduler enabled
- AI forecasting engine enabled
- AI learning engine enabled
- JWT authentication stable
- Database schema complete

### ✅ After Seeding
- Owner account created
- Storage locations defined
- Vendors configured
- 15 inventory items ready
- Sample menu created
- AI insights seeded

### 🟡 Auto-Populated Over Time
- AI forecasts (after 06:00 daily job)
- Learning insights (after 21:00 daily job)
- Activity feed (as events occur)
- Audit logs (as actions happen)

---

## 📞 QUICK COMMANDS

```bash
# View logs
railway logs --tail 50

# Check status
railway status

# Connect to database
railway connect postgres

# Restart service
railway restart

# View all variables
railway variables --kv
```

---

## 🚨 IF STILL HAVING ISSUES

1. **Check Railway dashboard**: https://railway.com/project/6eb48b9a-8fe0-4836-8247-f6cef566f299/
2. **View deployment logs** for errors
3. **Verify environment variables** are set correctly
4. **Run seed script again** if database is empty
5. **Contact support** with error messages from logs

---

## ✅ FINAL CHECKLIST

- [ ] Railway redeploy completed (check logs)
- [ ] Database seeded (run seed script)
- [ ] Login works (test with owner@neuropilot.ai)
- [ ] Dashboard shows data (15 items)
- [ ] AI jobs triggered manually (optional)
- [ ] Cron scheduler running (check logs for "Phase3")

---

**Generated**: November 19, 2025
**Mission**: Claude Supreme Engineer - System Restoration
**Time to Full Restoration**: ~5-10 minutes from now

🎉 **You're almost there!** Just seed the database and you're fully operational.
