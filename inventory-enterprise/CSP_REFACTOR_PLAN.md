# CSP Refactor Plan - Remove Inline Event Handlers

## Overview

**Goal:** Remove `'unsafe-inline'` from CSP `scriptSrcAttr` directive by converting all inline event handlers (`onclick`, `onchange`, etc.) to `addEventListener` in JavaScript.

**Current Status:** CSP allows `scriptSrcAttr: ["'unsafe-inline'"]` to support inline event handlers  
**Target Status:** Remove `'unsafe-inline'` for full CSP compliance

## Scope

### Files to Modify
1. `backend/public/owner-super-console-v15.html` - Main HTML file with inline handlers
2. `backend/public/js/owner-super-console.js` - Add event listener setup code
3. `backend/server.js` - Remove `'unsafe-inline'` from CSP

### Handler Count
- **onclick handlers:** ~29+ instances
- **onchange handlers:** ~5+ instances
- **Total:** ~35+ inline handlers to convert

## Strategy

### Phase 1: Create Event Listener Setup Function
Create a centralized function in `owner-super-console.js` that sets up all event listeners on page load.

### Phase 2: Convert Handlers by Category

#### Category 1: Tab Navigation (High Priority)
- All `onclick="switchTab(...)"` handlers
- **Count:** ~13 handlers
- **Pattern:** `onclick="switchTab('tabname')"`

#### Category 2: Button Actions (High Priority)
- Logout, refresh, search buttons
- **Count:** ~10 handlers
- **Pattern:** `onclick="functionName()"`

#### Category 3: Modal Triggers (Medium Priority)
- Open/close modal buttons
- **Count:** ~5 handlers

#### Category 4: Dynamic Content (Low Priority)
- Handlers added via innerHTML (already using addEventListener in some cases)
- **Count:** ~7 handlers

### Phase 3: Update CSP
Remove `'unsafe-inline'` from `scriptSrcAttr` directive.

## Implementation Approach

### Step 1: Create Event Listener Setup
```javascript
// Add to owner-super-console.js
function setupEventListeners() {
  // Tab navigation
  document.querySelectorAll('[data-tab]').forEach(tab => {
    tab.addEventListener('click', () => {
      switchTab(tab.dataset.tab);
    });
  });

  // Buttons
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', logout);
  }

  // ... etc
}
```

### Step 2: Update HTML
Replace inline handlers with data attributes:
```html
<!-- Before -->
<div class="tab" onclick="switchTab('dashboard')">📊 Dashboard</div>

<!-- After -->
<div class="tab" data-tab="dashboard">📊 Dashboard</div>
```

### Step 3: Call Setup on Load
```javascript
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
});
```

## Benefits

1. **Security:** Full CSP compliance, better XSS protection
2. **Maintainability:** Centralized event handling
3. **Performance:** Event delegation possible
4. **Best Practices:** Follows modern JavaScript patterns

## Challenges

1. **Large Scope:** ~35+ handlers to convert
2. **Dynamic Content:** Some handlers are in dynamically generated HTML
3. **Testing:** Need to verify all functionality still works
4. **Breaking Changes:** Risk of missing handlers

## Recommended Approach

### Option A: Incremental Refactor (Recommended)
1. Start with tab navigation (most common)
2. Test thoroughly
3. Move to buttons
4. Continue incrementally

### Option B: Automated Script
1. Create script to find/replace patterns
2. Manual review of each change
3. Test all functionality

### Option C: Event Delegation
1. Use event delegation on parent elements
2. Reduce number of individual listeners
3. Handle dynamic content automatically

## Testing Checklist

After refactoring, verify:
- [ ] All tabs switch correctly
- [ ] All buttons work
- [ ] Modals open/close
- [ ] Forms submit
- [ ] Dynamic content handlers work
- [ ] No console errors
- [ ] CSP headers don't block anything

## Estimated Effort

- **Phase 1 (Setup):** 1-2 hours
- **Phase 2 (Conversion):** 4-6 hours
- **Phase 3 (Testing):** 2-3 hours
- **Total:** 7-11 hours

## Priority

**Medium Priority** - Security improvement, but not blocking current functionality. Can be done incrementally.

---

**Status:** Planning complete, ready for implementation  
**Next Step:** Start with Phase 1 - Create event listener setup function

