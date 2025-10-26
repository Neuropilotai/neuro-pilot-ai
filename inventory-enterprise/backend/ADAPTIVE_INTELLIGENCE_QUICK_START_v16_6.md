# Adaptive Intelligence - Quick Start Guide (v16.6)

## 🚀 1. Smoke the API (3 minutes)

```bash
TOKEN=$(cat .owner_token)

# Status (read-only)
curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:8083/api/ai/adaptive/status | python3 -m json.tool

# Retrain (canonical write endpoint)
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"days":30,"force":false}' \
  http://localhost:8083/api/ai/adaptive/retrain | python3 -m json.tool

# History
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8083/api/ai/adaptive/history?limit=10" | python3 -m json.tool
```

### Expected Outputs

**Status Response:**
```json
{
  "success": true,
  "data": {
    "policy": {
      "max_retries": 3,
      "base_delay_ms": 200,
      "jitter_pct": 30,
      "enabled": true
    },
    "metrics": {
      "success_rate": 98.5,
      "avg_attempts": 1.2,
      "lock_rate": 1.8
    }
  }
}
```

**Retrain Response (if tuning needed):**
```json
{
  "success": true,
  "message": "Retrain cycle completed",
  "recommendation_id": 4,
  "window_days": 30
}
```

**Retrain Response (if system stable):**
```json
{
  "success": true,
  "message": "No tuning changes recommended (system stable)",
  "recommendation_id": null,
  "window_days": 30
}
```

---

## 📊 2. Metrics Quick Look

```bash
# Check AI, governance, and DB retry metrics
curl -s http://localhost:8083/metrics | grep -E '^ai_|governance_|db_retry'
```

### Expected Metrics

```prometheus
# AI Stability metrics
ai_stability_score 98.5
ai_current_max_retries 3
ai_current_base_delay_ms 200
ai_observations_total 1247
ai_recommendations_total 3

# Governance metrics (if integrated)
governance_composite_score 92.3
governance_stability_weight 0.10

# DB Retry metrics
db_retry_success_rate 0.985
db_retry_avg_attempts 1.2
db_retry_lock_rate 0.018
```

**Note**: If `ai_*` metrics aren't showing up, they need to be added to `utils/metricsExporter.js`. The API endpoints work regardless.

---

## ⚠️ 3. Legacy Path Verification

```bash
# Legacy path still works (logs deprecation warning)
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8083/api/stability/status > /dev/null
```

Check server logs for deprecation warning:
```
[WARN] [DEPRECATION] /api/stability* → use /api/ai/adaptive*
  path: /api/stability/status
  ip: ::1
  user: neuro.pilot.ai@gmail.com
```

✅ **This is expected behavior** - legacy endpoints work but warn users to migrate.

---

## 🎨 4. UI Hook (60-Second Drop-In)

Add this tiny status card to your owner console. It polls every 60s and shows retrain button for OWNER.

### HTML + Script (Complete Component)

```html
<div id="ai-adaptive-card" class="card">
  <div class="card-title">🤖 AI Stability</div>
  <div class="row">
    <div>Score:</div><div id="ai-stab-score">—</div>
  </div>
  <div class="row">
    <div>Success Rate:</div><div id="ai-stab-success">—</div>
  </div>
  <div class="row">
    <div>Avg Attempts:</div><div id="ai-stab-attempts">—</div>
  </div>
  <button id="ai-retrain-btn" class="np-btn u-owner-only">🔄 Retrain</button>
</div>

<script>
(async function(){
  // Get auth headers
  async function headers(){
    const t = localStorage.getItem('authToken') || window.authToken;
    const h = { Accept:'application/json' };
    if(t) h.Authorization = `Bearer ${t}`;
    return h;
  }

  // Refresh status
  async function refresh(){
    try{
      const r = await fetch('/api/ai/adaptive/status', {headers: await headers()});
      if(!r.ok) throw new Error('HTTP '+r.status);
      const data = await r.json();

      if(data.success && data.data) {
        const { metrics } = data.data;
        document.getElementById('ai-stab-score').textContent =
          metrics.success_rate ? metrics.success_rate.toFixed(1) + '%' : '—';
        document.getElementById('ai-stab-success').textContent =
          metrics.success_rate ? metrics.success_rate.toFixed(1) + '%' : '—';
        document.getElementById('ai-stab-attempts').textContent =
          metrics.avg_attempts ? metrics.avg_attempts.toFixed(2) : '—';
      }
    }catch(e){
      console.warn('AI status error:', e);
      document.getElementById('ai-stab-score').textContent = 'Error';
    }
  }

  // Retrain handler
  document.getElementById('ai-retrain-btn')?.addEventListener('click', async ()=>{
    const btn = document.getElementById('ai-retrain-btn');
    btn.disabled = true;
    btn.textContent = '⏳ Retraining...';

    try{
      const r = await fetch('/api/ai/adaptive/retrain',{
        method:'POST',
        headers: { ...(await headers()), 'Content-Type':'application/json' },
        body: JSON.stringify({days:30, force:false})
      });

      if(!r.ok) throw new Error('HTTP '+r.status);
      const result = await r.json();

      await refresh();

      if(result.recommendation_id) {
        alert(`✅ Retrain completed\nRecommendation ID: ${result.recommendation_id}`);
      } else {
        alert('✅ System stable - no tuning needed');
      }
    }catch(e){
      alert('❌ Retrain failed: '+e.message);
    }finally{
      btn.disabled = false;
      btn.textContent = '🔄 Retrain';
    }
  });

  // Initial load + auto-refresh every 60s
  await refresh();
  setInterval(refresh, 60000);
})();
</script>

<style>
#ai-adaptive-card {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 16px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  max-width: 300px;
}

#ai-adaptive-card .card-title {
  font-size: 1.2em;
  font-weight: bold;
  margin-bottom: 12px;
}

#ai-adaptive-card .row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 0.95em;
}

#ai-adaptive-card .row > div:first-child {
  opacity: 0.9;
}

#ai-adaptive-card .row > div:last-child {
  font-weight: bold;
}

#ai-retrain-btn {
  width: 100%;
  margin-top: 12px;
  background: rgba(255,255,255,0.2);
  border: 1px solid rgba(255,255,255,0.3);
  color: white;
  padding: 10px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: bold;
  transition: all 0.3s;
}

#ai-retrain-btn:hover:not(:disabled) {
  background: rgba(255,255,255,0.3);
  transform: translateY(-2px);
}

#ai-retrain-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Hide for non-owners (if using RBAC classes) */
body:not(.role-owner) .u-owner-only {
  display: none !important;
}
</style>
```

### Integration

Add to `owner-super-console.html`:
```html
<div class="dashboard-widgets">
  <!-- Existing widgets -->
  <div id="ai-adaptive-card" class="card">...</div>
</div>
```

---

## 📈 5. Prometheus/Grafana Quick Wins

### Alert Rules

Add to your Prometheus `alerts.yml`:

```yaml
groups:
  - name: adaptive_intelligence
    interval: 30s
    rules:
      # Stability SLO (warn)
      - alert: StabilityScoreLow
        expr: avg_over_time(ai_stability_score[30m]) < 85
        for: 5m
        labels:
          severity: warning
          component: adaptive_intelligence
        annotations:
          summary: "AI Stability score below SLO"
          description: "30-min average stability score is {{ $value | humanize }}% (threshold: 85%)"

      # Retrain failures (critical)
      - alert: RetrainFailures
        expr: increase(ai_retrain_failed_total[10m]) > 0
        for: 1m
        labels:
          severity: critical
          component: adaptive_intelligence
        annotations:
          summary: "AI Retrain failures detected"
          description: "{{ $value }} retrain failures in the last 10 minutes"

      # Legacy usage tracker (info)
      - alert: LegacyEndpointUsage
        expr: increase(api_legacy_stability_hits_total[1h]) > 0
        labels:
          severity: info
          component: deprecation
        annotations:
          summary: "Legacy /api/stability/* endpoints still in use"
          description: "{{ $value }} calls to deprecated endpoints in the last hour. Migrate to /api/ai/adaptive/*"
```

### Grafana Dashboard Panel

Add this panel to your Grafana dashboard:

```json
{
  "title": "Adaptive Intelligence - Stability Score",
  "type": "graph",
  "targets": [
    {
      "expr": "ai_stability_score",
      "legendFormat": "Stability Score",
      "refId": "A"
    }
  ],
  "yaxes": [
    {
      "format": "percent",
      "min": 0,
      "max": 100
    }
  ],
  "thresholds": [
    {
      "value": 85,
      "colorMode": "critical",
      "op": "lt",
      "fill": true,
      "line": true
    }
  ]
}
```

---

## 🚫 6. Deprecation Plan (v17)

### Step 1: Mark Deprecated in Docs

Add this banner to all documentation referencing `/api/stability/*`:

```markdown
⚠️ **DEPRECATED**: This endpoint path is deprecated as of v16.6.
Use `/api/ai/adaptive/*` instead. Legacy paths will be removed in v17.0 (January 2026).
```

### Step 2: CI Check to Block Future Commits

Create `.ci/check-legacy-endpoints.sh`:

```bash
#!/bin/bash
# Check for legacy /api/stability/ endpoint references

set -e

echo "🔍 Checking for deprecated /api/stability/ endpoint usage..."

# Search in source files (exclude node_modules, docs, and this script)
if grep -R \
  --exclude-dir=node_modules \
  --exclude-dir=.git \
  --exclude='*.md' \
  --exclude='check-legacy-endpoints.sh' \
  -n '/api/stability/' \
  inventory-enterprise/; then

  echo ""
  echo "❌ ERROR: Legacy /api/stability/ endpoint detected!"
  echo "📝 Action: Replace with /api/ai/adaptive/"
  echo ""
  exit 1
fi

echo "✅ No legacy endpoint references found"
exit 0
```

Make it executable:
```bash
chmod +x .ci/check-legacy-endpoints.sh
```

### Step 3: Add to GitHub Actions

Add to `.github/workflows/ci.yml`:

```yaml
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Check for deprecated endpoints
        run: .ci/check-legacy-endpoints.sh
```

### Step 4: Track Legacy Usage

Add counter to `utils/metricsExporter.js`:

```javascript
// Track legacy endpoint usage
const legacyStabilityHits = new promClient.Counter({
  name: 'api_legacy_stability_hits_total',
  help: 'Total hits to deprecated /api/stability/* endpoints',
  labelNames: ['path', 'method']
});

// In your deprecation middleware (server.js):
app.use('/api/stability', (req, res, next) => {
  // Track the hit
  metricsExporter.recordLegacyStabilityHit(req.originalUrl, req.method);

  // Log deprecation warning
  logger.warn('[DEPRECATION] /api/stability* → use /api/ai/adaptive*', {
    path: req.originalUrl,
    ip: req.ip,
    user: req.user?.email || 'unauthenticated'
  });

  next();
}, stabilityRoutes);
```

---

## 🔄 7. Rollback Strategy

**Key Benefit**: Dual-path mounting means rollback is trivial.

### If Issues Arise

1. **Keep using legacy paths** - They still work perfectly
   ```bash
   # Just use the old path
   curl -s -H "Authorization: Bearer $TOKEN" \
     http://localhost:8083/api/stability/status
   ```

2. **No downtime** - Both paths serve the same routes
   - Frontend can use `/api/stability/*`
   - Scripts can use `/api/stability/*`
   - New code uses `/api/ai/adaptive/*`

3. **Gradual migration** - No rush
   - Week 1: Test new endpoints
   - Week 2-4: Migrate frontend
   - Month 2: Migrate scripts
   - v17.0: Remove legacy (3+ months out)

### Emergency Rollback

If you need to disable the new path entirely:

```javascript
// In server.js - comment out canonical path
// app.use('/api/ai/adaptive', stabilityRoutes);

// Keep only legacy path
app.use('/api/stability', stabilityRoutes); // No warning middleware
```

This reverts to v16.5 behavior instantly with zero code changes elsewhere.

---

## 📋 8. Deployment Checklist

### Pre-Deploy
- [ ] Review changes in `routes/stability.js`
- [ ] Review changes in `server.js`
- [ ] Run `./scripts/verify_adaptive_intelligence.sh` locally
- [ ] Test UI card in dev environment

### Deploy
- [ ] Deploy backend with dual-path mounting
- [ ] Verify server starts without errors
- [ ] Run smoke tests (section 1 above)
- [ ] Check metrics endpoint (section 2 above)
- [ ] Verify legacy path logs deprecation (section 3 above)

### Post-Deploy
- [ ] Monitor server logs for errors
- [ ] Check Grafana for `ai_*` metrics
- [ ] Test retrain endpoint with owner token
- [ ] Verify UI card updates every 60s
- [ ] Send migration notice to API consumers

### Week 1 Monitoring
- [ ] Track `api_legacy_stability_hits_total` metric
- [ ] Monitor deprecation warnings in logs
- [ ] Check alert thresholds in Prometheus
- [ ] Collect feedback from frontend team

---

## 🎯 Success Metrics

After 1 week, you should see:

| Metric | Target | Check |
|--------|--------|-------|
| New endpoint adoption | >50% of traffic | Grafana |
| Legacy endpoint usage | <50% of traffic | Grafana |
| Stability score | >90% | `/api/ai/adaptive/status` |
| Retrain failures | 0 | Prometheus alerts |
| UI card load time | <200ms | Browser DevTools |

---

## 🆘 Troubleshooting

### Issue: "ai_* metrics not showing"
**Solution**: Metrics exposition not required for API to work. Add to `utils/metricsExporter.js` if needed.

### Issue: "401 Unauthorized"
**Solution**: Ensure owner token is valid:
```bash
# Regenerate token
node generate_owner_token.js
TOKEN=$(cat .owner_token)
```

### Issue: "No tuning changes recommended"
**Solution**: This is normal! System is stable. Force retrain:
```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"days":30,"force":true}' \
  http://localhost:8083/api/ai/adaptive/retrain
```

### Issue: "UI card shows 'Error'"
**Solution**: Check browser console for:
- CORS errors → Check `cors` middleware
- 401 errors → Check auth token
- Network errors → Check server is running on :8083

---

## 📚 Related Documentation

- [Full API Reference](./ADAPTIVE_INTELLIGENCE_API_v16_6.md)
- [Frontend Integration Guide](./docs/AI_STABILITY_PANEL_INTEGRATION.md)
- [Implementation Summary](./V16_6_ADAPTIVE_INTELLIGENCE_IMPLEMENTATION_COMPLETE.md)
- [Verification Script](./scripts/verify_adaptive_intelligence.sh)

---

**Quick Start Version**: 1.0
**Last Updated**: 2025-10-20
**Deployment Time**: ~5 minutes
**Rollback Time**: ~30 seconds
