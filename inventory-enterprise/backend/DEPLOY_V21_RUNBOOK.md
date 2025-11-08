# V21.0 Enterprise Features Deployment Runbook

## Overview
Complete enterprise inventory system with vendor pricing, recipes, menu planning, waste tracking, and PDF generation.

## Pre-Deployment Checklist

### 1. Database Migrations
Run migrations in order:
```bash
psql $DATABASE_URL -f db/migrations/004_vendor_pricing.sql
psql $DATABASE_URL -f db/migrations/005_recipes.sql
psql $DATABASE_URL -f db/migrations/006_waste.sql
psql $DATABASE_URL -f db/migrations/007_menu_linking.sql
```

### 2. Wire Routes in Server
Add to `server-v20_1.js` or create `server-v21_0.js`:
```javascript
const vendorsRouter = require('./routes/vendors');
const recipesRouter = require('./routes/recipes');
const wasteRouter = require('./routes/waste');
const populationRouter = require('./routes/population');
const pdfsRouter = require('./routes/pdfs');

app.use('/api/vendors', authGuard, vendorsRouter);
app.use('/api/recipes', authGuard, recipesRouter);
app.use('/api/waste', authGuard, wasteRouter);
app.use('/api/population', authGuard, populationRouter);
app.use('/api/pdfs', authGuard, pdfsRouter);
```

### 3. Deploy Frontend
Copy updated `owner-super-console-enterprise.html` to `backend/public/`:
```bash
cp frontend/public/owner-super-console-enterprise.html backend/public/
```

## Smoke Tests

### Test 1: Vendor Pricing Import
```bash
curl -X POST https://inventory-backend-7-agent-build.up.railway.app/api/vendors/prices/import \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "rows": [
      {"vendor":"SYSCO","item_sku":"BEEF001","price":12.50,"currency":"USD","effective_from":"2025-01-01"},
      {"vendor":"SYSCO","item_sku":"CHICKEN001","price":8.75,"currency":"USD","effective_from":"2025-01-01"}
    ]
  }'
```

Expected: `{"success":true,"imported":2,"errors":0}`

### Test 2: Recipe Creation & Costing
```bash
# Create recipe
curl -X POST https://inventory-backend-7-agent-build.up.railway.app/api/recipes \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "code":"CHILI001",
    "name":"Texas Chili",
    "yield_qty":10,
    "yield_uom":"portions",
    "prep_loss_pct":5,
    "allergens":["gluten"]
  }'

# Add ingredients
curl -X POST https://inventory-backend-7-agent-build.up.railway.app/api/recipes/1/ingredients \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"item_sku":"BEEF001","qty":2,"uom":"kg"}'

# Get cost
curl https://inventory-backend-7-agent-build.up.railway.app/api/recipes/1/cost \
  -H "Authorization: Bearer $TOKEN"
```

Expected: Cost breakdown with unit_cost per portion

### Test 3: Waste Event
```bash
curl -X POST https://inventory-backend-7-agent-build.up.railway.app/api/waste \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "item_sku":"BEEF001",
    "qty":0.5,
    "uom":"kg",
    "reason":"spoilage",
    "subreason":"expired",
    "notes":"Freezer failure"
  }'
```

Expected: Event created with cost_at_event calculated

### Test 4: Menu Planning
```bash
curl -X POST https://inventory-backend-7-agent-build.up.railway.app/api/menu/recipe \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "cycle_week":1,
    "day_of_week":1,
    "service":"lunch",
    "recipe_code":"CHILI001",
    "target_portions":50
  }'
```

Expected: Recipe added to Monday lunch, Week 1

### Test 5: PDF Generation
```bash
curl -X POST https://inventory-backend-7-agent-build.up.railway.app/api/pdfs/generate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type":"waste",
    "params":{"from":"2025-01-01","to":"2025-01-31"}
  }' \
  --output waste_report.txt
```

Expected: Downloaded text file with waste summary

## Validation Checklist

- [ ] All migrations applied successfully
- [ ] Routes wired and responding
- [ ] Vendor price import works (CSV with 10 rows)
- [ ] Recipe cost calculation accurate
- [ ] Waste events capture cost
- [ ] Menu forecast cost updates with population
- [ ] PDF generation downloads files
- [ ] Frontend all tabs render (Owner mode)
- [ ] No console errors
- [ ] Governance logs PDF exports

## Monitoring

```bash
# Check logs
railway logs --tail

# Verify database
psql $DATABASE_URL -c "SELECT COUNT(*) FROM vendors;"
psql $DATABASE_URL -c "SELECT COUNT(*) FROM recipes;"
psql $DATABASE_URL -c "SELECT COUNT(*) FROM waste_events;"
```

## Rollback Plan

If issues occur:
```bash
# Rollback database
psql $DATABASE_URL -c "DROP TABLE IF EXISTS waste_events CASCADE;"
psql $DATABASE_URL -c "DROP TABLE IF EXISTS menu_recipes CASCADE;"
psql $DATABASE_URL -c "DROP TABLE IF EXISTS menus CASCADE;"
psql $DATABASE_URL -c "DROP TABLE IF EXISTS population CASCADE;"
psql $DATABASE_URL -c "DROP TABLE IF EXISTS recipe_cost_snapshots CASCADE;"
psql $DATABASE_URL -c "DROP TABLE IF EXISTS recipe_ingredients CASCADE;"
psql $DATABASE_URL -c "DROP TABLE IF EXISTS recipes CASCADE;"
psql $DATABASE_URL -c "DROP TABLE IF EXISTS vendor_prices CASCADE;"
psql $DATABASE_URL -c "DROP TABLE IF EXISTS vendor_items CASCADE;"
psql $DATABASE_URL -c "DROP TABLE IF EXISTS org_vendor_defaults CASCADE;"
psql $DATABASE_URL -c "DROP TABLE IF EXISTS vendors CASCADE;"

# Redeploy previous version
git checkout v20.1
git push origin main --force
```

## Notes

- All endpoints honor org_id/site_id tenancy
- Costing uses org preferred vendor with fallbacks
- PDF generation is text-based (upgrade to jsPDF in v21.1)
- Frontend uses localStorage: NP_API_URL, NP_MOCK_MODE='false'
- Owner/Admin roles see all tabs
- Rate limiting: 100 req/5min per IP
