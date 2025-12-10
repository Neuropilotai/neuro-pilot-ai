# CSP Refactor Testing Guide

## Overview
This guide helps verify that all converted event handlers work correctly after the CSP refactor.

## Testing Checklist

### Phase 1: Tab Navigation & Header (19 handlers)
- [ ] **Tab Navigation**
  - [ ] Click each tab (Dashboard, Inventory, Locations, PDFs, Count, Playground, AI Console, Forecast, Menu, Financials, Finance Brain, Item Bank, Governance, Intelligence, Reports, Settings)
  - [ ] Verify tabs switch correctly
  - [ ] Verify content loads for each tab

- [ ] **Header Buttons**
  - [ ] Click health badge - should refresh health status
  - [ ] Click logout button - should log out

### Phase 2: Locations, PDFs, Count, AI Console (16 handlers)
- [ ] **Locations Tab**
  - [ ] Click "Add New" button - should open location modal
  - [ ] Verify location list loads

- [ ] **PDFs Tab**
  - [ ] Click "Upload PDF" button - should open upload modal
  - [ ] Click "Include in Count" button - should open include orders modal
  - [ ] Change PDF status filter dropdown - should filter PDFs
  - [ ] Verify PDF list loads

- [ ] **Count Tab**
  - [ ] Verify count workspace buttons work
  - [ ] Verify count history loads

- [ ] **AI Console Tab**
  - [ ] Click refresh buttons - should reload data
  - [ ] Verify AI ops status loads

### Phase 3: Forecast, Financials, Intelligence, Reports (18 handlers)
- [ ] **Forecast Tab**
  - [ ] Click forecast detail buttons - should open modals
  - [ ] Verify forecast data loads

- [ ] **Financials Tab**
  - [ ] Click report tab chips (Purchasing, Finance) - should switch tabs
  - [ ] Click "Export CSV" button - should export report
  - [ ] Verify financial data loads

- [ ] **Intelligence Tab**
  - [ ] Click refresh buttons - should reload data
  - [ ] Verify intelligence data loads

- [ ] **Reports Tab**
  - [ ] Verify report tabs work
  - [ ] Verify reports load correctly

### Phase 4: Modal Handlers (18 handlers)
- [ ] **PDF Modal**
  - [ ] Open PDF viewer - click close button - should close modal

- [ ] **Include Orders Modal**
  - [ ] Open modal - click close/cancel - should close
  - [ ] Click "Include Selected" - should work

- [ ] **Upload PDF Modal**
  - [ ] Open modal - click close/cancel - should close
  - [ ] Click "Upload" button - should upload PDF

- [ ] **GFS Upload Modal**
  - [ ] Open modal - click close/cancel - should close
  - [ ] Click "Upload" button - should upload GFS invoice

- [ ] **Location Modal**
  - [ ] Open modal - click close/cancel - should close
  - [ ] Click "Save Location" - should save location

- [ ] **Add Item to Count Modal**
  - [ ] Open modal - click close/cancel - should close
  - [ ] Click "Add Item" - should add item

- [ ] **Assign Locations Modal**
  - [ ] Open modal - click close/cancel - should close
  - [ ] Click "Assign" - should assign locations

- [ ] **Workspace Modal**
  - [ ] Open modal - click close - should close
  - [ ] Click "View Usage Report" - should show usage

- [ ] **Recipe Drawer Modal**
  - [ ] Open modal - click close - should close

- [ ] **Headcount Modal**
  - [ ] Open modal - click close/cancel - should close
  - [ ] Click "Update" - should update headcount

- [ ] **Shopping List Modal**
  - [ ] Open modal - click close - should close
  - [ ] Click "Download CSV" - should download

- [ ] **Count PDF Modal**
  - [ ] Open modal - click close - should close

- [ ] **Recovery Modals**
  - [ ] Open recovery modals - click close/cancel - should close
  - [ ] Click submit buttons - should work

- [ ] **Orchestration Modal**
  - [ ] Open modal - click close - should close

- [ ] **Forecast/Stockout Detail Modals**
  - [ ] Open modals - click close - should close

### Phase 5: Remaining Handlers (29 handlers)
- [ ] **Dashboard Cards**
  - [ ] Click "PDF Import" card - should switch to inventory tab and scroll
  - [ ] Click "Reconcile" card - should switch to inventory tab and scroll
  - [ ] Click "View Recent Reconciliations" - should show reconciliations
  - [ ] Click "View Count History" - should show count history

- [ ] **AI Console Buttons**
  - [ ] Click "Refresh" on Learning Timeline - should reload
  - [ ] Click "Refresh" on AI Reorder - should reload
  - [ ] Click "Refresh" on AI Anomalies - should reload
  - [ ] Click "Refresh" on AI Upgrade - should reload
  - [ ] Click "Submit Feedback" - should submit
  - [ ] Click "Train Now" - should train AI
  - [ ] Click "History" - should show feedback history
  - [ ] Click "Refresh" on Learning Nudges - should reload

- [ ] **Reports Tab**
  - [ ] Click report tab chips - should switch tabs
  - [ ] Click "Export CSV" - should export

- [ ] **Finance Brain**
  - [ ] Click "Sync Now" - should sync
  - [ ] Click "Refresh" - should reload
  - [ ] Click "Scan" for duplicates - should scan

- [ ] **Settings Tab**
  - [ ] Click "Rebind Device" - should rebind
  - [ ] Click "Export Daily Summary CSV" - should export
  - [ ] Click "Start All Services" - should start
  - [ ] Click "Stop All Services" - should stop
  - [ ] Click "Create Recovery Kit" - should create
  - [ ] Click "Verify Recovery Kit" - should verify
  - [ ] Click "Dry-Run Restore" - should run
  - [ ] Click "Refresh" on Broken Links - should reload

- [ ] **Form Submissions**
  - [ ] Submit recovery input form - should work
  - [ ] Submit PDF upload form - should work
  - [ ] Submit GFS upload form - should work
  - [ ] Submit location form - should work
  - [ ] Submit add item to count form - should work

## Browser Console Checks

### Check for Errors
1. Open browser DevTools (F12)
2. Go to Console tab
3. Look for:
   - ❌ Any errors about "function not found"
   - ❌ Any CSP violations
   - ❌ Any undefined function calls

### Check for Warnings
- Look for warnings like: "Function X not found. Make sure it's exported to window or declared globally."
- These indicate handlers that need fixing

## Common Issues & Fixes

### Issue: Button doesn't work
**Check:**
1. Is the function exported to `window`?
2. Is the function declared globally?
3. Check browser console for errors

**Fix:**
- Export function: `window.functionName = functionName;`
- Or ensure function is declared with `function` keyword (hoisted)

### Issue: Modal doesn't close
**Check:**
1. Is `closeModalName` function defined?
2. Check if modal has correct ID

**Fix:**
- Ensure close function exists and is accessible

### Issue: Form doesn't submit
**Check:**
1. Is form's onsubmit handler being converted?
2. Check browser console for errors

**Fix:**
- `setupEventListeners` should handle this automatically
- If not, check form ID matches

### Issue: Scroll-to doesn't work
**Check:**
1. Does target element exist?
2. Is `data-scroll-to` attribute set correctly?

**Fix:**
- Ensure target element ID matches `data-scroll-to` value

## Testing Script

Run this in browser console to test all handlers:

```javascript
// Test all data-action handlers
const actionHandlers = document.querySelectorAll('[data-action]');
console.log(`Found ${actionHandlers.length} data-action handlers`);

// Test all data-change-action handlers
const changeHandlers = document.querySelectorAll('[data-change-action]');
console.log(`Found ${changeHandlers.length} data-change-action handlers`);

// Test all data-report-tab handlers
const reportTabs = document.querySelectorAll('[data-report-tab]');
console.log(`Found ${reportTabs.length} report tab handlers`);

// Check for any remaining onclick handlers (should be 0)
const remainingOnclick = document.querySelectorAll('[onclick]');
console.log(`Remaining onclick handlers: ${remainingOnclick.length} (should be 0)`);

// Check for any remaining onchange handlers (should be 0)
const remainingOnchange = document.querySelectorAll('[onchange]');
console.log(`Remaining onchange handlers: ${remainingOnchange.length} (should be 0)`);
```

## Success Criteria

✅ All handlers work without errors
✅ No CSP violations in console
✅ No "function not found" warnings
✅ All modals open/close correctly
✅ All forms submit correctly
✅ All tabs switch correctly
✅ All buttons trigger correct actions

## Next Steps After Testing

1. If all tests pass: Remove `'unsafe-inline'` from CSP
2. If issues found: Fix handlers and retest
3. Document any dynamic handlers that need event delegation

