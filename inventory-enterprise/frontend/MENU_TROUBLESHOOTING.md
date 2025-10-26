# Menu Tab Troubleshooting Guide

## Current Issue
Menu calendar is not visible despite:
- ✅ API calls succeeding (21 recipes per week)
- ✅ JavaScript rendering function executing
- ✅ Console logs showing data loaded
- ❌ Nothing visible on screen

## What We've Fixed

### 1. Backend Data Structure ✅
- Added `transformRecipe()` to convert backend format to frontend
- Fixed field names: `meal` → `mealType`, `calculatedLines` → `items`
- All API routes updated and tested

### 2. CSS Styles ✅
- Added complete menu calendar CSS (~220 lines)
- Grid layout with 7×3 structure
- Recipe chips with gradients
- Responsive breakpoints
- **Location:** `/frontend/public/css/owner-super.css` (lines 1782-2004)

### 3. Cache-Busting ✅
- CSS: `owner-super.css?v=15.0.1`
- JS: `owner-super-console.js?v=15.0.1`

### 4. Debug Logging ✅
Added extensive console logging:
```javascript
📊 Menu data loaded: {...}
📊 Week N data: {...}
🎨 Rendering calendar with 21 total recipes
✅ Calendar HTML set (X chars)
🔍 DOM Check: wrapper=true, chips=21
```

## Next Debugging Steps

### Step 1: Hard Refresh Browser
**CRITICAL:** Must clear browser cache:
- **Windows/Linux:** `Ctrl + Shift + R`
- **Mac:** `Cmd + Shift + R`
- **Or:** Clear cache in DevTools (F12 → Network → Disable cache)

### Step 2: Check Console for New Logs
After refresh, console should show:
```
✅ Calendar HTML set (12000+ chars)
🔍 DOM Check: wrapper=true, chips=21
```

If you see:
- `wrapper=false` → HTML not rendering
- `chips=0` → Recipes not rendering
- Error messages → Report them

### Step 3: Inspect DOM Structure
1. Open DevTools (F12)
2. Go to **Elements** tab
3. Find: `<div id="menuCalendar">`
4. Expand it - should see:
```html
<div class="menu-calendar-wrapper">
  <div class="menu-calendar-header">
    <div class="menu-day-header">Wed</div>
    <div class="menu-day-header">Thu</div>
    ...
  </div>
  <div class="menu-meal-row">
    <div class="menu-meal-label">Breakfast</div>
    <div class="menu-cell">
      <div class="recipe-chip">...</div>
    </div>
    ...
  </div>
</div>
```

If `<div id="menuCalendar">` is empty → JS not running
If it has HTML but not visible → CSS not loaded

### Step 4: Verify CSS Loaded
1. DevTools → **Network** tab
2. Refresh page (F5)
3. Look for: `owner-super.css?v=15.0.1`
4. Status should be: **200 OK**
5. Click it → Preview → Search for `.menu-calendar-wrapper`

If not found → CSS cache issue
If 404 → File path problem

### Step 5: Check CSS Application
1. DevTools → **Elements** tab
2. Find: `<div class="menu-calendar-wrapper">`
3. Look at **Styles** panel on right
4. Should see:
```css
.menu-calendar-wrapper {
  display: flex;
  flex-direction: column;
  gap: 0;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}
```

If styles are crossed out → CSS conflict
If no styles shown → CSS not applied

## Common Issues & Solutions

### Issue: Browser Cache
**Symptom:** Old version of JS/CSS loading
**Solution:**
```bash
# Clear browser cache completely
# Or use incognito mode
```

### Issue: CSS Not Loading
**Symptom:** Network shows 404 for CSS
**Solution:**
```bash
# Check file exists
ls -la frontend/public/css/owner-super.css

# Verify server is serving static files
curl http://localhost:8083/public/css/owner-super.css | head -20
```

### Issue: Grid Not Displaying
**Symptom:** HTML exists but not visible
**Solution:** Check CSS Grid support:
```javascript
// In console:
document.querySelector('.menu-calendar-header').style.display
// Should be 'grid'
```

### Issue: Recipe Chips Missing
**Symptom:** Grid shows but cells are empty
**Solution:** Check data transformation:
```javascript
// In console, after loading menu:
console.log(window.menuState?.weeks?.[0]?.days?.[0]?.recipes)
// Should show array of recipes with 'mealType' field
```

## Manual Test Checklist

After hard refresh, verify:

- [ ] Console shows: `✅ Menu events bound`
- [ ] Console shows: `🍽️ Loading Menu Calendar...`
- [ ] Console shows: `📊 Menu data loaded`
- [ ] Console shows: `🎨 Rendering calendar with 21 total recipes`
- [ ] Console shows: `✅ Calendar HTML set (X chars)`
- [ ] Console shows: `🔍 DOM Check: wrapper=true, chips=21`
- [ ] Network tab shows CSS loaded (200 OK)
- [ ] Elements tab shows `<div class="menu-calendar-wrapper">` with content
- [ ] No errors in console
- [ ] Menu tab visibly shows calendar grid
- [ ] Recipe chips are visible and clickable

## Expected Visual Result

You should see:

```
┌─────────────────────────────────────────────────────────────────┐
│ 🍽️ 4-Week Menu Calendar (280 ppl)                              │
│ [↻ Refresh] [👥 Headcount] [🛒 Shopping List]                  │
├─────────────────────────────────────────────────────────────────┤
│ [Week 1] [Week 2] [Week 3] [Week 4]    Current: Week 2         │
├─────────────────────────────────────────────────────────────────┤
│ Dec 25 — Dec 31 • 280 people                                   │
├─────────────────────────────────────────────────────────────────┤
│         │  Wed  │  Thu  │  Fri  │  Sat  │  Sun  │  Mon  │  Tue │
├─────────┼───────┼───────┼───────┼───────┼───────┼───────┼───────┤
│Breakfast│  🔵   │  🔵   │  🔵   │  🔵   │  🔵   │  🔵   │  🔵   │
├─────────┼───────┼───────┼───────┼───────┼───────┼───────┼───────┤
│  Lunch  │  🔵   │  🔵   │  🔵   │  🔵   │  🔵   │  🔵   │  🔵   │
├─────────┼───────┼───────┼───────┼───────┼───────┼───────┼───────┤
│ Dinner  │  🔵   │  🔵   │  🔵   │  🔵   │  🔵   │  🔵   │  🔵   │
└─────────┴───────┴───────┴───────┴───────┴───────┴───────┴───────┘
```

Each 🔵 = blue gradient recipe chip with recipe name

## If Still Not Working

### Nuclear Option: Clear Everything
```bash
# 1. Stop server
pkill -f "node.*server.js"

# 2. Clear browser completely
# - Close browser
# - Reopen in incognito mode

# 3. Restart server
cd backend
node server.js

# 4. Load page fresh
# http://localhost:8083/owner-super-console.html
```

### Diagnostic Script
Run in browser console after hard refresh:
```javascript
// Check menu state
console.log('Menu State:', window.menuState);

// Check calendar div
const cal = document.getElementById('menuCalendar');
console.log('Calendar exists:', !!cal);
console.log('Calendar HTML length:', cal?.innerHTML?.length);
console.log('Has wrapper:', !!cal?.querySelector('.menu-calendar-wrapper'));
console.log('Chip count:', cal?.querySelectorAll('.recipe-chip')?.length);

// Check CSS loaded
const link = document.querySelector('link[href*="owner-super.css"]');
console.log('CSS link:', link?.href);
console.log('CSS loaded:', link?.sheet !== null);

// Check grid display
const header = cal?.querySelector('.menu-calendar-header');
if (header) {
  const computed = window.getComputedStyle(header);
  console.log('Grid display:', computed.display);
  console.log('Grid columns:', computed.gridTemplateColumns);
}
```

## Files Modified (for rollback if needed)

1. `/backend/routes/menu.js` - Data transformation
2. `/frontend/owner-super-console.js` - Menu JavaScript (4456-5130)
3. `/frontend/public/css/owner-super.css` - Menu CSS (1782-2004)
4. `/frontend/owner-super-console.html` - Cache-busting versions

## Success Criteria

✅ Menu tab shows full calendar grid
✅ 21 blue recipe chips visible per week
✅ Clicking chip opens recipe drawer
✅ Week buttons switch between weeks
✅ Headcount button opens modal
✅ Shopping list button works
✅ Console shows no errors

---

**Last Updated:** 2025-10-13 16:50 PST
**Status:** Awaiting user hard refresh test
**Version:** v15.0.1
