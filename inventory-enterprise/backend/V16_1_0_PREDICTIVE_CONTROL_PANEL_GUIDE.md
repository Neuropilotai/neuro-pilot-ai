# NeuroPilot v16.1.0 - Governance Predictive Control Panel

**Version**: 16.1.0
**Release Date**: 2025-10-18
**Status**: ✅ Production Ready

---

## 🎯 Quick Start Guide

### What's New in v16.1.0

The Governance Predictive Control Panel extends the v16.0.0 Intelligence Dashboard with **interactive forecast visualization**, **predictive simulation controls**, and **real-time trend analysis**. This release enables OWNER users to experiment with different forecasting parameters and visualize their impact on governance predictions.

---

## 📊 Key Features

### 1. Interactive Forecast Chart
- **Dual-line visualization**: Actual data (blue solid) + Forecast (cyan dashed)
- **Confidence bands**: Semi-transparent polygon showing prediction uncertainty
- **Hover tooltips**: Date, score, and confidence range on data point hover
- **Auto-scaling**: Y-axis adjusts based on data range (0-100)
- **Grid lines**: 25-point intervals for easy reading

### 2. Adjustable Controls
- **α (Alpha) Smoothing Slider**: 0.1 to 1.0, step 0.05
  - Lower α (0.1-0.3): More weight on historical data, smoother curves
  - Higher α (0.7-1.0): More responsive to recent changes, more volatile
- **Window Selector**: 7/14/30 days of historical data
- **Forecast Horizon**: 7/14/30 days of future predictions
- **Pillar Selector**: Composite, Finance, Health, AI, Menu

### 3. Forecast Simulation (OWNER-only)
- Click **🔮 Simulate** to generate custom forecasts
- Uses selected α, window, and horizon parameters
- Displays simulation results (run ID, forecast count, runtime)
- Automatically reloads chart with new predictions

### 4. Bilingual Support (EN/FR)
- All UI labels translate when locale changes
- Forecast messages in English and French
- Consistent with v16.0.0 Intelligence Dashboard

---

## 🚀 Using the Predictive Control Panel

### Step 1: Open Intelligence Tab
1. Navigate to owner-super-console.html
2. Click **🔮 Intelligence** tab
3. Scroll down to **📈 Forecast & Trends** section

### Step 2: Load Initial Forecast
1. Click **↻ Refresh** button
2. Chart loads with composite governance forecast
3. Blue line shows actual scores, cyan line shows predictions
4. Light blue band shows confidence interval

### Step 3: Explore Different Pillars
1. Select pillar from dropdown: **Composite**, **Finance**, **Health**, **AI**, **Menu**
2. Chart automatically refreshes with new data
3. Each pillar has independent forecasts

### Step 4: Adjust Forecast Parameters
1. **Drag α slider** to change smoothing factor (0.1-1.0)
   - Watch value update in real-time next to slider
2. **Change Window** to use more/less historical data (7/14/30 days)
3. **Change Forecast Horizon** for shorter/longer predictions (7/14/30 days)
4. Chart refreshes automatically on parameter change

### Step 5: Simulate Custom Forecast (OWNER-only)
1. Set desired parameters: α, window, horizon, pillar
2. Click **🔮 Simulate** button
3. Backend generates new forecast with custom parameters
4. Alert shows simulation results:
   - Run ID (UUID for tracking)
   - Forecast count (number of predictions generated)
   - Runtime (seconds)
5. Chart updates with new forecast and confidence band

### Step 6: Switch Languages
1. Use locale selector at top of Intelligence tab
2. Select **🇬🇧 English** or **🇫🇷 Français**
3. All forecast labels update dynamically
4. Chart reloads with localized data

---

## 📈 Understanding the Chart

### Visual Elements

**Historical Data (Blue Line)**
- Solid blue line (#1976d2)
- Shows actual governance scores from past days
- Data points: 4px circles with white border
- Hover: Circle grows to 6px, shows tooltip

**Forecast Data (Cyan Dashed Line)**
- Dashed cyan line (#00acc1)
- Shows predicted governance scores for future days
- Connects to last historical data point
- Data points: 4px circles with white border
- Hover: Shows date, score, and confidence range

**Confidence Band (Light Blue Polygon)**
- Semi-transparent light blue area
- Shows uncertainty range (lower to upper bounds)
- Wider band = more uncertainty
- Narrower band = more confidence
- Calculated using 80% confidence intervals (±1.28σ)

**Grid Lines**
- Horizontal lines at 0, 25, 50, 75, 100
- Light gray (#e0e0e0)
- Y-axis values shown on right side

**Axis Labels**
- **X-axis**: First date, last historical date, last forecast date
- **Y-axis**: "Score" (rotated, left side)

### Reading Tooltips

**Historical Data Point Tooltip:**
```
2025-10-15: 52.3
```
- Date: When score was recorded
- Score: Actual governance score

**Forecast Data Point Tooltip:**
```
2025-10-25: 58.7 [55.2-62.1]
```
- Date: Forecast date
- Score: Predicted governance score
- [Lower-Upper]: Confidence interval range

---

## 🔧 Technical Details

### API Endpoints Used

**GET /api/governance/trends**
```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8083/api/governance/trends?period=14&pillar=composite&forecast_horizon=14"
```

Response:
```json
{
  "success": true,
  "historical": [
    { "as_of": "2025-10-10", "score": 45.2 },
    { "as_of": "2025-10-11", "score": 47.8 },
    ...
  ],
  "forecast": [
    { "forecast_date": "2025-10-19", "score": 52.3, "lower": 48.1, "upper": 56.5 },
    { "forecast_date": "2025-10-20", "score": 53.7, "lower": 49.2, "upper": 58.2 },
    ...
  ]
}
```

**POST /api/governance/recompute/forecast**
```bash
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"pillar":"composite","horizon":14,"alpha":0.5,"locale":"en"}' \
  "http://localhost:8083/api/governance/recompute/forecast"
```

Response:
```json
{
  "success": true,
  "run_id": "abc123...",
  "forecast_count": 14,
  "runtime_seconds": 0.45
}
```

### Files Modified

| File | Lines Added | Purpose |
|------|-------------|---------|
| `frontend/owner-super-console.html` | 87 | Forecast section HTML |
| `frontend/owner-super-console.js` | 459 | Forecast visualization logic |
| `frontend/public/css/owner-super.css` | 72 | Slider and chart styles |
| `CHANGELOG.md` | 218 | v16.1.0 release notes |
| `scripts/verify_governance_predictive.sh` | 485 | Testing script |

**Total**: ~1,321 lines

---

## 🧪 Testing & Verification

### Run Verification Script

```bash
cd /Users/davidmikulis/neuro-pilot-ai/inventory-enterprise/backend
./scripts/verify_governance_predictive.sh
```

**Expected Output:**
```
═══════════════════════════════════════════════════════════════
  Governance Predictive Control Panel Verification (v16.1.0)
═══════════════════════════════════════════════════════════════

[INFO] Checking prerequisites...
[PASS] Server is running
[PASS] Owner token found
[PASS] Owner token is valid

[INFO] Testing Governance Trends API...
[PASS] GET /api/governance/trends returned success
[PASS] Response contains historical data
[PASS] Response contains forecast data

[INFO] Testing forecast for all pillars...
[PASS] Pillar 'composite' forecast loaded
[PASS] Pillar 'finance' forecast loaded
[PASS] Pillar 'health' forecast loaded
[PASS] Pillar 'ai' forecast loaded
[PASS] Pillar 'menu' forecast loaded

[INFO] Testing forecast simulation...
[PASS] POST /api/governance/recompute/forecast succeeded
[PASS] Simulation run_id: abc123...
[PASS] Forecast count: 14
[PASS] Runtime: 0.45s

[INFO] Testing forecast with different parameters...
[PASS] Simulation with α=0.1 succeeded
[PASS] Simulation with α=0.5 succeeded
[PASS] Simulation with α=1.0 succeeded

[INFO] Testing bilingual forecast generation...
[PASS] Forecast generation with locale 'en' succeeded
[PASS] Forecast generation with locale 'fr' succeeded

[INFO] Checking frontend HTML elements...
[PASS] Frontend HTML file exists
[PASS] Forecast chart SVG element found
[PASS] Alpha slider found
[PASS] Pillar selector found
[PASS] Simulate button found

[INFO] Checking frontend JavaScript functions...
[PASS] Frontend JavaScript file exists
[PASS] loadForecastChart() function found
[PASS] simulateForecast() function found
[PASS] renderForecastChart() function found
[PASS] Bilingual translation object found

[INFO] Checking CSS styles...
[PASS] CSS file exists
[PASS] Forecast slider styles found
[PASS] Forecast chart styles found

[INFO] Validating forecast data structure...
[PASS] Forecast data structure valid
[PASS] Historical data contains 'as_of' field
[PASS] Historical data contains 'score' field
[PASS] Forecast data contains date field
[PASS] Forecast data contains confidence bounds (lower/upper)

═══════════════════════════════════════════════════════════════
✅ ALL TESTS PASSED (40/40)
═══════════════════════════════════════════════════════════════
```

### Manual Testing Checklist

- [ ] Open Intelligence tab
- [ ] Scroll to "Forecast & Trends" section
- [ ] Click Refresh → Chart displays
- [ ] Hover over data points → Tooltips appear
- [ ] Select different pillar → Chart updates
- [ ] Drag α slider → Value updates
- [ ] Change window selector → Chart reloads
- [ ] Change horizon selector → Chart reloads
- [ ] **OWNER**: Click Simulate → New forecast generated
- [ ] Toggle locale EN↔FR → Labels update
- [ ] Verify confidence band appears
- [ ] Check legend displays correctly

---

## 🎨 Customization

### Adjusting Chart Colors

Edit `/frontend/public/css/owner-super.css`:

```css
/* Historical line color */
#gi-forecast-chart path[stroke="#1976d2"] {
  stroke: #your-color;
}

/* Forecast line color */
#gi-forecast-chart path[stroke="#00acc1"] {
  stroke: #your-color;
}

/* Confidence band */
polygon[fill*="rgba(0, 172, 193"] {
  fill: rgba(your-r, your-g, your-b, 0.2);
  stroke: rgba(your-r, your-g, your-b, 0.4);
}
```

### Changing Default Parameters

Edit `/frontend/owner-super-console.html`:

```html
<!-- Default alpha -->
<input type="range" id="gi-alpha" value="0.5" ... >

<!-- Default window -->
<option value="14" selected>14 Days</option>

<!-- Default horizon -->
<option value="14" selected>14 Days</option>
```

### Adding New Pillars

1. Add option to pillar selector in HTML:
```html
<option value="new_pillar">🆕 New Pillar</option>
```

2. Ensure backend supports pillar in governance_daily table

---

## 🔒 RBAC Permissions

| Role | View Chart | Refresh | Change Parameters | Simulate |
|------|------------|---------|-------------------|----------|
| **OWNER** | ✅ | ✅ | ✅ | ✅ |
| **FINANCE** | ✅ | ✅ | ✅ | ❌ |
| **OPS** | ✅ | ✅ | ✅ | ❌ |
| **READONLY** | ❌ | ❌ | ❌ | ❌ |

**Note:** Non-OWNER users see the Simulate button but it's disabled via `u-owner-only` CSS class.

---

## 🐛 Troubleshooting

### Chart Not Loading

**Symptom**: "No forecast data available" message

**Causes:**
1. No historical governance data in database
2. Forecasts not yet generated

**Solution:**
```bash
# Generate daily scores first
curl -X POST http://localhost:8083/api/governance/recompute/daily \
  -H "Authorization: Bearer $TOKEN"

# Generate forecasts
curl -X POST http://localhost:8083/api/governance/recompute/forecast \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"pillar":"composite","horizon":14}'
```

### Simulate Button Doesn't Work

**Symptom**: Button click does nothing

**Causes:**
1. User is not OWNER role
2. JavaScript error in console

**Solution:**
- Check browser console for errors
- Verify user role: `localStorage.getItem('user_role')`
- Ensure token has OWNER permissions

### Chart Shows Only Blue Line

**Symptom**: No cyan forecast line visible

**Cause:** No forecast data in response

**Solution:**
- Click "🔮 Simulate" to generate forecasts
- Or run backend forecast computation manually

### Slider Not Updating Value

**Symptom**: Dragging slider doesn't change displayed value

**Cause:** JavaScript event listener not attached

**Solution:**
- Hard refresh browser (Cmd+Shift+R / Ctrl+Shift+F5)
- Check console for initialization errors

---

## 📚 Additional Resources

- **v16.0.0 Intelligence Dashboard**: See `GOVERNANCE_INTELLIGENCE_README.md`
- **v15.9.0 Forecasting Backend**: See CHANGELOG.md v15.9.0 section
- **API Documentation**: See CHANGELOG.md for endpoint specs
- **RBAC Configuration**: See `security/rbac.js`

---

## 🎉 What's Next

### Planned Enhancements (v16.2.0+)

- **Multi-pillar overlay**: Compare multiple pillars on same chart
- **Export chart to PNG/SVG**: Download visualizations
- **Forecast comparison**: Side-by-side view of different α values
- **Advanced statistics**: MAE, RMSE, MAPE metrics display
- **Custom date range picker**: Select arbitrary historical periods
- **Zoom and pan**: Interactive chart navigation
- **Annotation mode**: Mark significant events on timeline

---

## 📞 Support

For issues or questions:
- **GitHub Issues**: [NeuroPilot Issues](https://github.com/neuropilot-ai/inventory-enterprise/issues)
- **Documentation**: This file + CHANGELOG.md
- **Backend APIs**: See v15.9.0 GovernanceTrendService

---

**End of Guide**
