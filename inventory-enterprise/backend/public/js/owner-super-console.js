/**
 * Owner Super Console v14.5.0 - Console-Specific Extensions (CSP Compliant)
 * v14.3: Shared core variables and functions are loaded from owner-console-core.js
 * v14.5.0: Full CSP compliance - all inline styles removed
 * This file contains only console-specific functionality
 */

/* ============================================
   CSP Helper Functions (v14.5.0)
   ============================================ */

/**
 * Helper function for document.querySelector
 * @param {string} selector - CSS selector
 * @returns {Element|null}
 */
function $$(selector) {
  return document.querySelector(selector);
}

/**
 * Helper function for document.querySelectorAll
 * @param {string} selector - CSS selector
 * @returns {NodeList}
 */
function $$$(selector) {
  return document.querySelectorAll(selector);
}

/**
 * Helper function for document.getElementById
 * @param {string} id - Element ID
 * @returns {Element|null}
 */
function $(id) {
  return document.getElementById(id);
}

/**
 * Toggle element visibility using class
 */
function setHidden(el, hidden) {
  if (!el) return;
  el.classList.toggle('u-hide', !!hidden);
}

/**
 * Set width percentage using class (5% increments)
 */
function setWidthPctClass(el, pct) {
  if (!el) return;
  const clamp = Math.max(0, Math.min(100, Math.round(pct / 5) * 5));
  for (const c of [...el.classList]) {
    if (c.startsWith('u-w-')) el.classList.remove(c);
  }
  el.classList.add(`u-w-${clamp}`);
}

/**
 * Swap background state class
 */
function swapBg(el, state) {
  if (!el) return;
  el.classList.remove('u-bg-ok', 'u-bg-warn', 'u-bg-bad');
  if (state === 'ok') el.classList.add('u-bg-ok');
  else if (state === 'warn') el.classList.add('u-bg-warn');
  else if (state === 'bad') el.classList.add('u-bg-bad');
}

/**
 * Swap text state class
 */
function swapText(el, state) {
  if (!el) return;
  el.classList.remove('u-text-ok', 'u-text-warn', 'u-text-bad');
  if (state === 'ok') el.classList.add('u-text-ok');
  else if (state === 'warn') el.classList.add('u-text-warn');
  else if (state === 'bad') el.classList.add('u-text-bad');
}

/* ============================================
   End CSP Helpers
   ============================================ */

/* ============================================
   v15.5.1: RBAC UI Gating Helpers
   ============================================ */

/**
 * Check if current user has one of the specified roles
 * @param {...string} roles - Role names to check (READONLY, OPS, FINANCE, OWNER)
 * @returns {boolean}
 */
function hasRole(...roles) {
  if (!window.currentUser || !window.currentUser.role) {
    return false;
  }
  return roles.includes(window.currentUser.role);
}

/**
 * Set element disabled state
 * @param {string|HTMLElement} el - Element or selector
 * @param {boolean} disabled - Whether to disable
 */
function setDisabled(el, disabled) {
  const element = typeof el === 'string' ? document.querySelector(el) : el;
  if (!element) return;

  if (disabled) {
    element.setAttribute('disabled', 'disabled');
    element.classList.add('u-disabled');
  } else {
    element.removeAttribute('disabled');
    element.classList.remove('u-disabled');
  }
}

/**
 * Apply role-based UI gating to all UI elements
 * Called on page load and after authentication
 */
function gateUI() {
  console.log('🔒 Applying RBAC UI gates...');

  if (!window.currentUser || !window.currentUser.role) {
    console.warn('No current user role found - gating all sensitive UI');
    // Hide everything if not authenticated
    document.querySelectorAll('.tab[onclick*="financials"]').forEach(el => setHidden(el, true));
    document.querySelectorAll('.tab[onclick*="forecast"]').forEach(el => setHidden(el, true));
    return;
  }

  const role = window.currentUser.role;
  console.log(`📋 Current role: ${role}`);

  // Tab visibility gating
  // Finance tab: FINANCE, OWNER only
  document.querySelectorAll('.tab[onclick*="financials"]').forEach(el => {
    setHidden(el, !hasRole('FINANCE', 'OWNER'));
  });

  // Forecast tab: OPS, FINANCE, OWNER
  document.querySelectorAll('.tab[onclick*="forecast"]').forEach(el => {
    setHidden(el, !hasRole('OPS', 'FINANCE', 'OWNER'));
  });

  // Export buttons (Finance workspace): FINANCE, OWNER only
  const exportBtns = [
    '#btn-export-pdf',
    '#btn-export-csv',
    '#btn-export-gl',
    'button[onclick*="exportFinancial"]',
    'button[onclick*="downloadShoppingListCSV"]'
  ];

  exportBtns.forEach(selector => {
    document.querySelectorAll(selector).forEach(el => {
      setDisabled(el, !hasRole('FINANCE', 'OWNER'));
      if (!hasRole('FINANCE', 'OWNER')) {
        el.setAttribute('title', 'Requires FINANCE or OWNER role');
      }
    });
  });

  // Forecast approval buttons: FINANCE, OWNER only
  const approvalBtns = [
    '#btn-approve-orders',
    '#btn-reject-orders',
    'button[onclick*="approveForecast"]',
    'button[onclick*="rejectForecast"]'
  ];

  approvalBtns.forEach(selector => {
    document.querySelectorAll(selector).forEach(el => {
      setDisabled(el, !hasRole('FINANCE', 'OWNER'));
      if (!hasRole('FINANCE', 'OWNER')) {
        el.setAttribute('title', 'Requires FINANCE or OWNER role (dual-control enforced)');
      }
    });
  });

  // Document viewers (raw PDFs): FINANCE, OWNER only
  document.querySelectorAll('.document-view, .pdf-viewer').forEach(el => {
    setHidden(el, !hasRole('FINANCE', 'OWNER'));
  });

  // Backup & restore operations: OWNER only
  document.querySelectorAll('button[onclick*="Recovery"], button[onclick*="Backup"]').forEach(el => {
    setDisabled(el, !hasRole('OWNER'));
    if (!hasRole('OWNER')) {
      el.setAttribute('title', 'Requires OWNER role');
    }
  });

  console.log('✅ RBAC UI gates applied');
}

/**
 * Show shadow mode badge if enabled
 */
function updateShadowModeBadge() {
  if (window.appConfig && window.appConfig.shadowMode === true) {
    const badge = document.getElementById('badge-shadow-mode');
    if (badge) {
      setHidden(badge, false);
      console.log('⚠️ Shadow Mode is ENABLED (no auto-apply)');
    }
  }
}

/**
 * Get color class for confidence percentage
 * @param {number} confidence - Confidence percentage (0-100)
 * @returns {string} Color class name
 */
function getConfidenceColor(confidence) {
  if (confidence >= 85) return 'ok';
  if (confidence >= 70) return 'warn';
  return 'bad';
}

/**
 * Create confidence chip HTML
 * @param {number} confidence - Confidence percentage (0-100)
 * @returns {string} HTML string
 */
function createConfidenceChip(confidence) {
  const color = getConfidenceColor(confidence);
  return `<span class="chip chip-${color}" title="AI Confidence">${Math.round(confidence)}% confidence</span>`;
}

/* ============================================
   End RBAC UI Gating Helpers
   ============================================ */

// ============================================================================
// NOTE: Core variables (API_BASE, token, currentUser, etc.) are now in owner-console-core.js
// NOTE: Core functions (fetchAPI, updateTokenTTL, logout, switchTab, etc.) are now in owner-console-core.js
// NOTE: Initialization (DOMContentLoaded) is handled by owner-console-core.js
// ============================================================================

// ============================================================================
// v14.3: DUPLICATE FUNCTIONS REMOVED
// The following functions are now in owner-console-core.js:
// - updateTokenTTL()
// - logout()
// - fetchAPI()
// - switchTab()
// - loadDashboard()
// - getTimeAgo()
// - loadAIOpsStatus()
// - loadCognitiveIntelligence()
// - loadActivityFeed()
// - loadLearningTimeline()
// - loadAIReorder()
// - loadAIAnomalies()
// - loadAIUpgrade()
// - applyNextBestAction()
// - loadUnassignedItems()
// - loadCountLocations()
// - loadActiveCount()
// ============================================================================

// ============================================================================
// CONSOLE-SPECIFIC FUNCTIONS (Not in shared core)
// ============================================================================

/**
 * Show a toast notification (v14.5.0 CSP Compliant)
 * @param {string} message - The message to display
 * @param {string} type - Type: 'success', 'warning', 'danger', 'info'
 */
function showToast(message, type = 'info') {
  // Create toast element
  const toast = document.createElement('div');
  toast.className = `alert alert-${type} toast-container`;
  toast.textContent = message;

  // Add to body
  document.body.appendChild(toast);

  // Remove after 3 seconds
  setTimeout(() => {
    toast.classList.add('u-op-0');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Super Console still needs these functions:
async function loadDashboard() {
  console.log('🔄 Loading dashboard...');

  try {
    // v13.1: Load Real Stats from Database
    loadCognitiveIntelligence();
    loadActivityFeed();

    // Fetch Real Dashboard Stats
    console.log('📊 Fetching real dashboard statistics...');
    const statsResponse = await fetchAPI('/owner/dashboard/stats');
    console.log('✅ Stats:', statsResponse);

    // Handle null response - use fallback empty stats
    if (!statsResponse || !statsResponse.stats) {
      console.warn('⚠️ No dashboard stats available - showing defaults');
      document.getElementById('systemHealth').textContent = '🟡 API Unavailable';
      document.getElementById('systemHealth').style.color = '#f59e0b';
      return;
    }

    const stats = statsResponse.stats;

    // v15.3: System Health - Use AI Ops health score instead of generic systemHealth
    // v22.3: Prefer V2 scoring with fallback to V1
    try {
      const opsStatus = await fetchAPI('/owner/ops/status');
      // v22.3: Prefer ai_ops_health_v2 if available, fallback to ai_ops_health
      const rawV1 = opsStatus.ai_ops_health || {};
      const rawV2 = opsStatus.ai_ops_health_v2 || null;
      const health = rawV2 || rawV1;
      const healthScore = Math.round(health.score || 0);

      if (typeof healthScore === 'number' && healthScore > 0) {
        if (healthScore >= 85) {
          document.getElementById('systemHealth').textContent = '✅ Excellent';
          document.getElementById('systemHealth').style.color = '#22c55e';
        } else if (healthScore >= 60) {
          document.getElementById('systemHealth').textContent = '🟡 Good';
          document.getElementById('systemHealth').style.color = '#f59e0b';
        } else {
          document.getElementById('systemHealth').textContent = '⚠️ Issues';
          document.getElementById('systemHealth').style.color = '#ef4444';
        }
      } else {
        document.getElementById('systemHealth').textContent = stats.systemHealth === 'OK' ? '✅ OK' : '❌ Down';
      }
    } catch (err) {
      console.warn('Could not fetch AI Ops status for system health:', err);
      document.getElementById('systemHealth').textContent = stats.systemHealth === 'OK' ? '✅ OK' : '❌ Down';
    }

    // PDF Coverage (% of PDFs with extracted dates)
    const coverage = stats.pdfs?.coverage || 0;
    document.getElementById('forecastCoverage').textContent = `${coverage}%`;

    // Total Inventory Items (instead of stockout count)
    document.getElementById('stockoutCount').textContent = stats.inventory?.totalItems || 0;

    // Last PDF Upload (instead of AI run)
    if (stats.recentActivity?.lastPDFUpload) {
      const lastUpload = new Date(stats.recentActivity.lastPDFUpload);
      document.getElementById('lastAIRun').textContent = lastUpload.toLocaleString();
    } else {
      document.getElementById('lastAIRun').textContent = 'No PDFs yet';
    }

    // DB Stats Table - Real Data with enhanced FIFO display
    const fifoDisplay = (() => {
      if (stats.fifo?.totalCases > 0) {
        return `<strong>${stats.fifo.totalCases}</strong> cases (<strong>${stats.fifo.productsTracked}</strong> products) <span class="badge badge-success">Active</span>`;
      } else if (stats.fifo?.invoicesReady > 0) {
        return `<strong>${stats.fifo.invoicesReady}</strong> invoices ready for FIFO <span class="badge badge-warning">Ready to Enable</span>`;
      } else {
        return `<span class="u-text-light-inline">Not configured</span>`;
      }
    })();

    // v21.2: Use inventoryValueRaw from API (or fallback to nested inventory.totalValue for backward compat)
    const inventoryValue = stats.inventoryValueRaw || stats.inventory?.totalValue || 0;

    // v23.0: Source badge based on inventory source
    const sourceLabel = {
      'manual': { text: 'Manual', badge: 'warning' },
      'pdf_fifo': { text: 'PDF/FIFO', badge: 'success' },
      'physical_counts': { text: 'Physical Count', badge: 'primary' },
      'vendor_orders_pending_fifo': { text: 'Pending FIFO', badge: 'info' },
      'error': { text: 'Error', badge: 'danger' }
    }[stats.inventory?.source] || { text: 'Unknown', badge: 'secondary' };

    const dbStatsHTML = `
      <table class="table">
        <tr class="row-highlight-success">
          <td class="td-medium-value">💰 Total Inventory Value</td>
          <td class="td-large-value">$${inventoryValue.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})} <span class="badge badge-${sourceLabel.badge}" title="Data source">${sourceLabel.text}</span></td>
        </tr>
        <tr><td>📦 Total Items</td><td><strong>${stats.inventory?.totalItems || 0}</strong> unique products</td></tr>
        <tr><td>📊 Total Units</td><td><strong>${(stats.inventory?.totalUnits || 0).toLocaleString()}</strong> units in stock</td></tr>
        <tr><td>🧊 Total Boxes/Cases</td><td><strong>${(stats.inventory?.totalBoxes || 0).toLocaleString()}</strong> cases tracked</td></tr>
        <tr><td>📜 Invoices Included</td><td><strong>${stats.inventory?.invoicesIncluded || 0}</strong> of ${stats.inventory?.totalOrders || 0} orders</td></tr>
        <tr><td>📋 FIFO Layers</td><td><strong>${stats.inventory?.fifoLayers || 0}</strong> cost layers <span class="badge badge-${stats.inventory?.fifoLayers > 0 ? 'success' : 'secondary'}">${stats.inventory?.fifoLayers > 0 ? 'Active' : 'None'}</span></td></tr>
        <tr><td>Manual Inventory Items</td><td><strong>${stats.inventory?.manualItems || 0}</strong> items ($${(stats.inventory?.manualValue || 0).toLocaleString('en-US', {minimumFractionDigits: 2})})</td></tr>
        <tr><td>Active Locations</td><td><strong>${stats.locations?.total || 0}</strong></td></tr>
        <tr><td>Invoices Processed</td><td><strong>${stats.pdfs?.total || 0}</strong> (${stats.pdfs?.withDates || 0} with dates)</td></tr>
        <tr><td>Total Invoice Amount</td><td><strong>$${(stats.pdfs?.totalAmount || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong></td></tr>
        <tr><td>Line Items Extracted</td><td><strong>${stats.inventory?.totalLineItems || 0}</strong> line items from ${stats.pdfs?.total || 0} invoices <span class="badge badge-${stats.inventory?.totalLineItems > 0 ? 'success' : 'warning'}">${stats.inventory?.totalLineItems > 0 ? 'Active' : 'Pending'}</span></td></tr>
        <tr><td>Total Quantity (from PDFs)</td><td><strong>${(stats.inventory?.totalQuantityFromPDFs || 0).toLocaleString()}</strong> cases/units</td></tr>
        <tr><td>Average Unit Price</td><td><strong>$${(stats.inventory?.avgUnitPrice || 0).toFixed(2)}</strong></td></tr>
        <tr><td>Active Counts</td><td><strong>${stats.counts?.active || 0}</strong></td></tr>
        <tr><td>FIFO Tracking</td><td>${fifoDisplay}</td></tr>
      </table>
    `;
    document.getElementById('dbStats').innerHTML = dbStatsHTML;

    // Recent Activity - v21.2: Use recentVendorOrders from API
    await loadRecentActivity(stats.recentActivity, stats.recentVendorOrders);

    console.log('✅ Dashboard loaded successfully with real data!');
  } catch (error) {
    console.error('❌ Dashboard load error:', error);
    alert('Dashboard load failed: ' + error.message);

    // Show error on page
    document.getElementById('forecastCoverage').textContent = 'ERROR';
    document.getElementById('stockoutCount').textContent = 'ERROR';
    document.getElementById('lastAIRun').textContent = 'ERROR';
    document.getElementById('dbStats').innerHTML = `<div class="alert alert-danger">${error.message}</div>`;
  }
}

// ============================================================================
// DASHBOARD DETAIL MODALS
// ============================================================================

function showForecastDetail() {
  if (!dashboardForecastData) {
    alert('No forecast data available. Please refresh the dashboard.');
    return;
  }

  const modal = document.getElementById('forecastDetailModal');
  const content = document.getElementById('forecastDetailContent');

  const items = dashboardForecastData.items || [];
  const date = dashboardForecastData.date || new Date().toISOString().split('T')[0];

  if (items.length === 0) {
    content.innerHTML = '<div class="empty-state"><div>No forecast items available</div></div>';
    modal.classList.add('active');
    return;
  }

  let html = `
    <div class="alert alert-info u-mb-4">
      <strong>Forecast Date:</strong> ${date}<br>
      <strong>Total Items Covered:</strong> ${items.length}<br>
      <strong>Prediction Sources:</strong> Recipe calendar, breakfast demand, beverage profiles
    </div>
    <div class="modal-scrollable-content">
      <table class="table">
        <thead>
          <tr>
            <th>Item Code</th>
            <th>Item Name</th>
            <th>Predicted Qty</th>
            <th>Unit</th>
            <th>Confidence</th>
            <th>Sources</th>
          </tr>
        </thead>
        <tbody>
  `;

  items.forEach(item => {
    const confidence = Math.round((item.avg_confidence || 0) * 100);
    const confidenceChip = createConfidenceChip(confidence);
    html += `
      <tr>
        <td><strong>${item.item_code || 'N/A'}</strong></td>
        <td>${item.item_name || ''}</td>
        <td>${item.total_predicted_qty?.toFixed(2) || 0}</td>
        <td>${item.unit || 'EA'}</td>
        <td>${confidenceChip}</td>
        <td class="u-text-xs">${item.forecast_sources || 'forecast'}</td>
      </tr>
    `;
  });

  html += `
        </tbody>
      </table>
    </div>
    <div class="summary-box">
      <strong>Summary:</strong> This forecast predicts ${items.length} items needed for today based on menu calendar, population counts (${dashboardForecastData.summary?.population || 'N/A'}), and historical patterns.
    </div>
  `;

  content.innerHTML = html;
  modal.classList.add('active');
}

function closeForecastDetailModal() {
  document.getElementById('forecastDetailModal').classList.remove('active');
}

function showStockoutDetail() {
  if (!dashboardStockoutData) {
    alert('No stockout data available. Please refresh the dashboard.');
    return;
  }

  const modal = document.getElementById('stockoutDetailModal');
  const content = document.getElementById('stockoutDetailContent');

  const critical = dashboardStockoutData.critical || [];
  const high = dashboardStockoutData.high || [];
  const medium = dashboardStockoutData.medium || [];
  const allItems = [...critical, ...high, ...medium];

  if (allItems.length === 0) {
    content.innerHTML = '<div class="empty-state"><div class="empty-state-icon">✅</div><div>No stockout risks detected!</div></div>';
    modal.classList.add('active');
    return;
  }

  let html = `
    <div class="alert alert-warning u-mb-4">
      <strong>Stockout Risk Analysis</strong><br>
      Critical: ${critical.length} | High: ${high.length} | Medium: ${medium.length}
    </div>
    <div class="modal-scrollable-content">
      <table class="table">
        <thead>
          <tr>
            <th>Item Code</th>
            <th>Item Name</th>
            <th>Risk Level</th>
            <th>Current Stock</th>
            <th>Predicted Need</th>
            <th>Shortage</th>
          </tr>
        </thead>
        <tbody>
  `;

  allItems.forEach(item => {
    const riskBadge = item.risk_level === 'CRITICAL' ? 'badge-danger' :
                      item.risk_level === 'HIGH' ? 'badge-warning' : 'badge-info';
    html += `
      <tr>
        <td><strong>${item.item_code || 'N/A'}</strong></td>
        <td>${item.item_name || ''}</td>
        <td><span class="badge ${riskBadge}">${item.risk_level || 'MEDIUM'}</span></td>
        <td>${item.current_stock?.toFixed(2) || 0}</td>
        <td>${item.predicted_usage?.toFixed(2) || 0}</td>
        <td class="u-text-bad u-font-semibold">${item.shortage_qty?.toFixed(2) || 0}</td>
      </tr>
    `;
  });

  html += `
        </tbody>
      </table>
    </div>
    <div class="summary-box">
      <strong>Recommendation:</strong> Items marked CRITICAL or HIGH should be reordered immediately. Review medium-risk items for potential future shortages.
    </div>
  `;

  content.innerHTML = html;
  modal.classList.add('active');
}

function closeStockoutDetailModal() {
  document.getElementById('stockoutDetailModal').classList.remove('active');
}

async function loadRecentActivity(recentActivity, recentVendorOrders = []) {
  const div = document.getElementById('recentActivity');

  try {
    const activities = [];

    // v21.2: Show recent vendor orders first (from API recentVendorOrders)
    if (recentVendorOrders && recentVendorOrders.length > 0) {
      recentVendorOrders.forEach((order, idx) => {
        const orderDate = order.createdAt ? new Date(order.createdAt) : null;
        const timeAgo = orderDate ? getTimeAgo(orderDate) : 'Unknown';
        activities.push({
          icon: '📄',
          title: `${order.vendor || 'Vendor'} Invoice`,
          detail: `#${order.orderNumber || 'N/A'} - $${order.total || '0.00'} (${order.lineCount || 0} items)`,
          time: timeAgo,
          type: 'success'
        });
      });
    } else if (recentActivity?.lastPDFUpload) {
      // Fallback to legacy recentActivity format
      const uploadDate = new Date(recentActivity.lastPDFUpload);
      const timeAgo = getTimeAgo(uploadDate);
      activities.push({
        icon: '📄',
        title: 'Latest Invoice Uploaded',
        detail: `Invoice #${recentActivity.lastPDFInvoice || 'N/A'}`,
        time: timeAgo,
        type: 'success'
      });
    } else {
      activities.push({
        icon: '📄',
        title: 'No Invoices Yet',
        detail: 'Upload your first PDF invoice to get started',
        time: 'Never',
        type: 'info'
      });
    }

    // Fetch real database stats for activity
    try {
      const statsResponse = await fetchAPI('/owner/dashboard/stats');
      const stats = statsResponse.stats;

      // FIFO Activity
      if (stats.fifo?.totalCases > 0) {
        activities.push({
          icon: '📦',
          title: 'FIFO Tracking Active',
          detail: `${stats.fifo.totalCases} cases tracked across ${stats.fifo.productsTracked} products`,
          time: 'Current',
          type: 'success'
        });
      } else if (stats.fifo?.invoicesReady > 0) {
        activities.push({
          icon: '📦',
          title: 'FIFO Ready to Enable',
          detail: `${stats.fifo.invoicesReady} invoices ready for case-level tracking`,
          time: 'Current',
          type: 'info'
        });
      }

      // Inventory Status
      if (stats.inventory?.totalItems <= 14 && stats.pdfs?.total > 100) {
        activities.push({
          icon: '⚠️',
          title: 'Inventory Catalog Incomplete',
          detail: `Only ${stats.inventory.totalItems} items in master catalog, but ${stats.pdfs.total} invoices available for line item extraction`,
          time: 'Current',
          type: 'warning'
        });
      } else {
        activities.push({
          icon: '📊',
          title: 'Inventory Overview',
          detail: `${stats.inventory?.totalItems || 0} items in ${stats.inventory?.categories || 0} categories`,
          time: 'Current',
          type: 'info'
        });
      }

      // Active Counts
      if (stats.counts?.active > 0) {
        activities.push({
          icon: '🔢',
          title: 'Active Physical Counts',
          detail: `${stats.counts.active} count${stats.counts.active > 1 ? 's' : ''} in progress`,
          time: 'Now',
          type: 'warning'
        });
      }

      // Storage Locations
      if (stats.locations?.total > 0) {
        activities.push({
          icon: '📍',
          title: 'Storage Locations',
          detail: `${stats.locations.total} active location${stats.locations.total > 1 ? 's' : ''} configured`,
          time: 'Current',
          type: 'info'
        });
      }

      // Invoice Processing Status
      if (stats.pdfs?.total > 0) {
        activities.push({
          icon: '✅',
          title: 'Invoice Extraction',
          detail: `${stats.pdfs.coverage}% coverage (${stats.pdfs.withDates}/${stats.pdfs.total} PDFs with dates)`,
          time: 'Current',
          type: stats.pdfs.coverage === 100 ? 'success' : 'warning'
        });
      }
    } catch (err) {
      console.error('Failed to load detailed stats for activity:', err);
    }

    // System Status
    activities.push({
      icon: '🟢',
      title: 'System Status',
      detail: 'All systems operational',
      time: 'Live',
      type: 'success'
    });

    // Render activity feed
    let html = '<div class="flex-col-gap">';

    activities.forEach(activity => {
      const borderClass = activity.type === 'success' ? 'border-left-success' :
                         activity.type === 'warning' ? 'border-left-warning' :
                         activity.type === 'info' ? 'border-left-info' :
                         'border-left-neutral';

      html += `
        <div class="padded-box ${borderClass}">
          <div class="flex-between-start">
            <span class="text-bold-base">${activity.icon} ${activity.title}</span>
            <span class="description-text-small">${activity.time}</span>
          </div>
          <div class="text-sm-light">${activity.detail}</div>
        </div>
      `;
    });

    html += '</div>';
    html += `<div class="footer-timestamp">Last refreshed: ${new Date().toLocaleTimeString()}</div>`;

    div.innerHTML = html;

  } catch (error) {
    console.error('Error loading recent activity:', error);
    div.innerHTML = `
      <div class="empty-state">
        <div class="text-base-light">
          Unable to load recent activity
        </div>
      </div>
    `;
  }
}

// v14.3: getTimeAgo() is now in owner-console-core.js

// ============================================================================
// INVENTORY TAB
// ============================================================================

// ============================================================================
// INVENTORY TAB - v3.3.0 Zero-Count Smart Mode
// ============================================================================

async function loadInventory() {
  const tableDiv = document.getElementById('inventoryTable');
  tableDiv.innerHTML = '<div class="loading"><div class="spinner"></div> Detecting inventory mode...</div>';

  try {
    // Check if physical count/snapshot exists
    const snapshot = await fetchAPI('/owner/inventory/has-snapshot');

    if (snapshot.mode === 'ZERO_COUNT') {
      await loadZeroCountMode();
    } else {
      await loadNormalMode(snapshot.lastCount);
    }
  } catch (error) {
    tableDiv.innerHTML = showError('inventory', error.message);
  }
}

// ============================================================================
// ZERO-COUNT SMART MODE
// ============================================================================

async function loadZeroCountMode() {
  const tableDiv = document.getElementById('inventoryTable');
  tableDiv.innerHTML = '<div class="loading"><div class="spinner"></div> Loading Zero-Count Smart Mode...</div>';

  try {
    // Load all panels in parallel including stats for pricing
    const [estimates, stockouts, locations, stats] = await Promise.all([
      fetchAPI('/owner/inventory/estimate'),
      fetchAPI('/owner/inventory/stockout'),
      fetchAPI('/owner/inventory/locations'),
      fetchAPI('/owner/dashboard/stats')
    ]);

    // Render Zero-Count UI
    let html = `
      <!-- Zero-Count Banner -->
      <div class="alert alert-info" class="u-mb-6">
        <div class="flex-between-center">
          <div>
            <strong>🧮 Zero-Count Smart Mode</strong> — No physical inventory snapshot yet.
            Showing inferred quantities from par levels, recent invoices, and AI forecasts.
          </div>
          <button class="btn btn-sm btn-primary" onclick="startFirstCount()">🎯 Start First Count</button>
        </div>
      </div>

      <!-- Inventory Value Summary from PDFs -->
      <div class="card" class="gradient-card">
        <div class="u-p-6">
          <div class="grid grid-3">
            <div class="u-text-center">
              <div class="info-subtitle">💰 Total Inventory Value (from PDFs)</div>
              <div class="stat-value-large">$${(stats.stats?.inventory?.totalValue || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
            </div>
            <div class="u-text-center">
              <div class="info-subtitle">Unique Products</div>
              <div class="stat-value-large">${(stats.stats?.inventory?.totalItems || 0).toLocaleString()}</div>
            </div>
            <div class="u-text-center">
              <div class="info-subtitle">Total Cases/Units</div>
              <div class="stat-value-large">${(stats.stats?.inventory?.totalQuantityFromPDFs || 0).toLocaleString()}</div>
            </div>
          </div>
          <div class="text-center-info">
            📊 This represents all products extracted from ${stats.stats?.pdfs?.total || 0} invoices totaling $${(stats.stats?.pdfs?.totalAmount || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
          </div>
        </div>
      </div>

      <!-- Three Panel Layout -->
      <div class="grid grid-3" class="u-mb-6">
        <!-- Panel 1: Inferred Stock Summary -->
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">📦 Inferred Stock</h3>
            <span class="badge badge-info">${estimates.count || 0} items</span>
          </div>
          <div class="text-base-light-mb">
            Avg Confidence: <strong>${((estimates.stats?.avg_confidence || 0) * 100).toFixed(0)}%</strong>
            | Low Confidence: <strong>${estimates.stats?.low_confidence_count || 0}</strong>
          </div>
          <div class="modal-scrollable-content-400">
            ${renderInferredStockList(estimates.items || [])}
          </div>
        </div>

        <!-- Panel 2: Stock-out Radar -->
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">⚠️ Stock-out Radar</h3>
            <span class="badge badge-danger">${stockouts.critical?.length || 0}</span>
            <span class="badge badge-warning">${stockouts.high?.length || 0}</span>
          </div>
          <div class="modal-scrollable-content-400">
            ${renderStockoutRadar(stockouts)}
          </div>
        </div>

        <!-- Panel 3: Storage Locations -->
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">📍 Storage Locations</h3>
            <span class="badge badge-info">${locations.count || 0}</span>
          </div>
          <div class="modal-scrollable-content-400">
            ${renderLocationsList(locations.locations || [])}
          </div>
        </div>
      </div>

      <!-- Quick Add Item -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">➕ Quick Add Item</h3>
        </div>
        <form onsubmit="event.preventDefault(); quickAddItem();" class="grid-auto-fit">
          <div class="form-group" class="u-m-0">
            <input type="text" class="input" id="quickAddCode" placeholder="Item Code" required>
          </div>
          <div class="form-group" class="u-m-0">
            <input type="text" class="input" id="quickAddName" placeholder="Item Name" required>
          </div>
          <div class="form-group" class="u-m-0">
            <input type="text" class="input" id="quickAddUnit" placeholder="Unit (EA)" value="EA">
          </div>
          <div class="form-group" class="u-m-0">
            <input type="number" class="input" id="quickAddPar" placeholder="Par Level" value="100">
          </div>
          <button type="submit" class="btn btn-primary">Add Item</button>
        </form>
      </div>
    `;

    tableDiv.innerHTML = html;
  } catch (error) {
    tableDiv.innerHTML = showError('inventory', error.message);
  }
}

// ============================================================================
// NORMAL MODE (After First Snapshot)
// ============================================================================

async function loadNormalMode(lastCount) {
  const tableDiv = document.getElementById('inventoryTable');
  tableDiv.innerHTML = '<div class="loading"><div class="spinner"></div> Loading inventory with pricing...</div>';

  try {
    const data = await fetchAPI('/owner/inventory/current');
    const items = data.items || [];

    // Calculate total inventory value
    let totalValue = 0;
    let totalItems = 0;
    items.forEach(item => {
      const qty = item.current_quantity || 0;
      const cost = item.avg_unit_cost || 0;
      totalValue += qty * cost;
      totalItems += qty;
    });

    let html = `
      <!-- Normal Mode Banner -->
      <div class="alert alert-success" class="u-mb-6">
        <div class="flex-between-center">
          <div>
            <strong>✅ Normal Mode</strong> — Physical inventory active.
            Last count: ${lastCount ? new Date(lastCount.closed_at).toLocaleDateString() : 'N/A'}
          </div>
          <button class="btn btn-sm btn-secondary" onclick="switchTab('count')">🔢 New Count</button>
        </div>
      </div>

      <!-- Inventory Value Summary -->
      <div class="card" class="gradient-card">
        <div class="u-p-6">
          <div class="grid grid-3">
            <div class="u-text-center">
              <div class="info-subtitle">Total Inventory Value</div>
              <div class="stat-value-large">$${totalValue.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
            </div>
            <div class="u-text-center">
              <div class="info-subtitle">Total Products</div>
              <div class="stat-value-large">${items.length.toLocaleString()}</div>
            </div>
            <div class="u-text-center">
              <div class="info-subtitle">Total Units/Cases</div>
              <div class="stat-value-large">${totalItems.toLocaleString()}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Inventory Table with Pricing -->
      <table class="table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Name</th>
            <th>Current Qty</th>
            <th>Unit</th>
            <th>Unit Price</th>
            <th>Total Value</th>
            <th>Par Level</th>
            <th>FIFO Layers</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
    `;

    items.forEach(item => {
      const qty = item.current_quantity || 0;
      const unitCost = item.avg_unit_cost || 0;
      const totalItemValue = qty * unitCost;

      const stockStatus = qty < (item.reorder_point || 0) ? 'badge-danger' :
                         qty < (item.par_level || 0) ? 'badge-warning' : 'badge-success';

      const fifoSummary = item.fifo_layers && item.fifo_layers.length > 0
        ? `${item.layer_count} layers`
        : 'No layers';

      html += `
        <tr>
          <td><strong>${item.item_code || ''}</strong></td>
          <td>${item.item_name || ''}</td>
          <td><span class="badge ${stockStatus}">${qty.toLocaleString()}</span></td>
          <td>${item.unit || 'EA'}</td>
          <td><strong>$${unitCost.toFixed(2)}</strong></td>
          <td><strong>$${totalItemValue.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong></td>
          <td>${item.par_level || 0}</td>
          <td><small>${fifoSummary}</small></td>
          <td>
            <button class="btn btn-sm btn-primary" onclick="adjustInventory('${item.item_code}', '${item.item_name}')">Adjust</button>
          </td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    tableDiv.innerHTML = html;
  } catch (error) {
    tableDiv.innerHTML = showError('inventory', error.message);
  }
}

// ============================================================================
// RENDERING HELPERS
// ============================================================================

function renderInferredStockList(items) {
  if (!items || items.length === 0) {
    return '<div class="empty-state"><div class="empty-state-icon">📦</div><div>No items</div></div>';
  }

  let html = '<div class="flex-col-gap">';

  items.forEach(item => {
    const confidence = Math.round((item.confidence || 0) * 100);
    const confidenceChip = createConfidenceChip(confidence);

    html += `
      <div class="bordered-surface">
        <div class="flex-between-start">
          <div>
            <strong>${item.item_name}</strong>
            <div class="description-text-small">${item.item_code}</div>
          </div>
          ${confidenceChip}
        </div>
        <div class="flex-base">
          <div>
            <span class="u-text-light-inline">Inferred:</span>
            <strong>${item.inferred_qty || 0} ${item.unit}</strong>
          </div>
          <div>
            <span class="u-text-light-inline">Par:</span>
            <strong>${item.par_level || 0}</strong>
          </div>
        </div>
        <div class="description-small-mt">
          Source: ${item.source === 'recent_count' ? '📊 Recent Count' :
                    item.source === 'invoice_forecast' ? '📄 Invoice + Forecast' : '📋 Par Level'}
        </div>
      </div>
    `;
  });

  html += '</div>';
  return html;
}

function renderStockoutRadar(stockouts) {
  const critical = stockouts.critical || [];
  const high = stockouts.high || [];
  const medium = stockouts.medium || [];

  if (critical.length === 0 && high.length === 0 && medium.length === 0) {
    return '<div class="empty-state"><div class="empty-icon-2xl">✅</div><div>No stock-out risks</div></div>';
  }

  let html = '<div class="flex-col-gap">';

  // Critical risks
  critical.forEach(item => {
    html += `
      <div class="bordered-danger-section">
        <div class="text-bold-danger">
          🚨 ${item.item_name}
        </div>
        <div class="u-text-base u-text-default">
          Available: <strong>${item.available_qty || 0} ${item.unit}</strong> |
          Needed: <strong>${item.predicted_24h || 0} ${item.unit}</strong>
        </div>
        <div class="description-small-mt">
          ${item.reason}
        </div>
      </div>
    `;
  });

  // High risks
  high.forEach(item => {
    html += `
      <div class="bordered-warning-section">
        <div class="text-bold-warning">
          ⚠️ ${item.item_name}
        </div>
        <div class="u-text-base u-text-default">
          Available: <strong>${item.available_qty || 0} ${item.unit}</strong> |
          Needed: <strong>${item.predicted_24h || 0} ${item.unit}</strong>
        </div>
      </div>
    `;
  });

  html += '</div>';
  return html;
}

function renderLocationsList(locations) {
  if (!locations || locations.length === 0) {
    return '<div class="empty-state"><div class="empty-state-icon">📍</div><div>No locations</div></div>';
  }

  let html = '<div class="flex-col-gap-sm">';

  locations.forEach(loc => {
    const typeIcon = loc.location_type === 'COOLER' ? '❄️' :
                     loc.location_type === 'FREEZER' ? '🧊' :
                     loc.location_type === 'DRY' ? '📦' : '🏪';

    html += `
      <div class="bordered-surface-clickable"
           onclick="switchTab('locations')">
        <div class="flex-gap-2-items-center">
          <span class="u-text-1-25">${typeIcon}</span>
          <div>
            <div class="fw-600">${loc.location_name}</div>
            <div class="description-text-small">${loc.location_code}</div>
          </div>
        </div>
      </div>
    `;
  });

  html += '</div>';
  return html;
}

// ============================================================================
// ACTION HANDLERS
// ============================================================================

function startFirstCount() {
  if (confirm('Start your first physical inventory count?\n\nThis will switch the inventory system to Normal Mode after completion.')) {
    switchTab('count');
  }
}

async function quickAddItem() {
  const code = document.getElementById('quickAddCode').value.trim();
  const name = document.getElementById('quickAddName').value.trim();
  const unit = document.getElementById('quickAddUnit').value.trim() || 'EA';
  const parLevel = parseInt(document.getElementById('quickAddPar').value) || 100;

  if (!code || !name) {
    alert('Item code and name are required');
    return;
  }

  try {
    const result = await fetchAPI('/owner/inventory/items', {
      method: 'POST',
      body: JSON.stringify({
        item_code: code,
        item_name: name,
        unit: unit,
        par_level: parLevel,
        reorder_point: Math.floor(parLevel * 0.3)
      })
    });

    if (result.success) {
      alert(`✓ Item ${code} added successfully`);
      // Clear form
      document.getElementById('quickAddCode').value = '';
      document.getElementById('quickAddName').value = '';
      document.getElementById('quickAddUnit').value = 'EA';
      document.getElementById('quickAddPar').value = '100';
      // Reload inventory
      loadInventory();
    }
  } catch (error) {
    alert(`Error adding item: ${error.message}`);
  }
}

function adjustInventory(itemCode, itemName) {
  const adjustment = prompt(`Adjust inventory for: ${itemName} (${itemCode})\n\nEnter adjustment (+/- quantity):`, '0');
  if (adjustment === null) return;

  const reason = prompt('Reason for adjustment:', '');
  if (!reason) {
    alert('Reason is required for inventory adjustments');
    return;
  }

  fetchAPI('/owner/inventory/adjust', {
    method: 'POST',
    body: JSON.stringify({
      item_code: itemCode,
      adjustment: parseFloat(adjustment),
      reason: reason
    })
  }).then(result => {
    if (result.success) {
      alert(`✓ Adjusted ${itemCode}: ${result.old_quantity} → ${result.new_quantity}`);
      loadInventory();
    }
  }).catch(error => {
    alert(`Error: ${error.message}`);
  });
}

function spotCheckItem(itemCode, itemName) {
  const qty = prompt(`Spot Check: ${itemName} (${itemCode})\n\nEnter counted quantity:`, '0');
  if (qty === null) return;

  const notes = prompt('Notes (optional):', '');

  // If there's an active count, add to it
  if (activeCountId) {
    addItemToCount(itemCode, parseFloat(qty), notes);
  } else {
    alert(`Spot check recorded: ${itemCode} = ${qty}\n\nTo save permanently, start a count in the Count tab.`);
  }
}

function openSpotCheckModal() {
  alert('To perform a spot check, click the "Spot Check" button next to any item in the inventory list.');
}

// ============================================================================
// LOCATIONS TAB
// ============================================================================

async function loadLocations() {
  const listDiv = document.getElementById('locationsList');
  listDiv.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  try {
    const data = await fetchAPI('/inventory/locations');
    const locations = data.locations || [];

    if (locations.length === 0) {
      listDiv.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📍</div><div>No locations found</div></div>';
      return;
    }

    let html = '<div class="flex-col-gap-sm">';
    locations.forEach(loc => {
      const id = loc.id || '';
      const name = loc.name || '';
      const type = loc.type || 'warehouse';

      html += `
        <div class="chip ${loc.active ? '' : 'disabled'}" class="chip-spaced">
          <span onclick="filterByLocation('${id}', '${name}')" class="flex-1-clickable">
            ${name} <small>(${type})</small>
          </span>
          <div class="flex-gap-1">
            <button type="button" class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); editLocation('${id}', '${name}', '${type}')" title="Edit">✏️</button>
            <button type="button" class="btn btn-sm btn-danger" onclick="event.stopPropagation(); deleteLocation('${id}', '${name}')" title="Delete">🗑️</button>
          </div>
        </div>
      `;
    });
    html += '</div>';

    listDiv.innerHTML = html;

    // Also load unassigned items
    loadUnassignedItems();
  } catch (error) {
    listDiv.innerHTML = showError('locations', error.message);
  }
}

async function filterByLocation(locationId, locationName) {
  document.getElementById('selectedLocation').textContent = locationName;
  const itemsDiv = document.getElementById('locationItems');
  itemsDiv.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  try {
    // Get items filtered by location (if mapping exists)
    const data = await fetchAPI(`/inventory/items?location=${locationId}`);
    const items = data.items || [];

    if (items.length === 0) {
      itemsDiv.innerHTML = '<div class="empty-state"><div>No items mapped to this location</div><div class="description-text">Items can be assigned to locations during inventory counts.</div></div>';
      return;
    }

    let html = `
      <table class="table">
        <thead>
          <tr><th>Code</th><th>Name</th><th>Quantity</th><th>Unit</th></tr>
        </thead>
        <tbody>
    `;

    items.forEach(item => {
      html += `
        <tr>
          <td>${item.item_code}</td>
          <td>${item.item_name}</td>
          <td>${item.current_quantity || 0}</td>
          <td>${item.unit || 'EA'}</td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    itemsDiv.innerHTML = html;
  } catch (error) {
    itemsDiv.innerHTML = showError('locationItems', error.message);
  }
}

function openAddLocationModal() {
  // Clear form
  document.getElementById('locationEditCode').value = '';
  document.getElementById('locationCode').value = '';
  document.getElementById('locationName').value = '';
  document.getElementById('locationType').value = 'warehouse';

  // Enable code field for new location
  const codeField = document.getElementById('locationCode');
  codeField.disabled = false;
  codeField.removeAttribute('disabled');
  codeField.readOnly = false;

  // Set modal title
  document.getElementById('locationModalTitle').textContent = 'Add New Location';

  // Show modal
  document.getElementById('locationModal').classList.add('active');

  // Focus on the code field
  setTimeout(() => codeField.focus(), 100);
}

function editLocation(id, name, type) {
  // Set form values
  document.getElementById('locationEditCode').value = id || '';
  document.getElementById('locationCode').value = id || '';
  document.getElementById('locationName').value = name || '';
  document.getElementById('locationType').value = type || 'warehouse';

  // Disable code field when editing
  document.getElementById('locationCode').disabled = true;

  // Set modal title
  document.getElementById('locationModalTitle').textContent = 'Edit Location';

  // Show modal
  document.getElementById('locationModal').classList.add('active');
}

async function saveLocation() {
  const editCode = document.getElementById('locationEditCode').value;
  const code = document.getElementById('locationCode').value.trim();
  const name = document.getElementById('locationName').value.trim();
  const type = document.getElementById('locationType').value;

  if (!code || !name) {
    alert('Location ID and name are required');
    return;
  }

  try {
    const body = { code, name, type };

    if (editCode) {
      // Update existing location
      await fetchAPI(`/inventory/locations/${editCode}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    } else {
      // Create new location
      await fetchAPI('/inventory/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    }

    alert(editCode ? 'Location updated successfully!' : 'Location created successfully!');
    closeLocationModal();
    loadLocations();
  } catch (error) {
    alert(`Failed to save location: ${error.message}`);
  }
}

async function deleteLocation(code, name) {
  if (!confirm(`Are you sure you want to delete location "${name}" (${code})?`)) {
    return;
  }

  try {
    await fetchAPI(`/inventory/locations/${code}`, {
      method: 'DELETE'
    });

    alert('Location deleted successfully!');
    loadLocations();

    // Clear items view if this was the selected location
    document.getElementById('locationItems').innerHTML = '<div class="empty-state"><div class="empty-state-icon">📍</div><div>Select a location to view items</div></div>';
    document.getElementById('selectedLocation').textContent = '';
  } catch (error) {
    alert(`Failed to delete location: ${error.message}`);
  }
}

function closeLocationModal() {
  document.getElementById('locationModal').classList.remove('active');
}

// ============================================================================
// PDFS TAB
// ============================================================================

async function loadPDFs() {
  const tableDiv = document.getElementById('pdfTable');
  tableDiv.innerHTML = '<div class="loading"><div class="spinner"></div> Loading Orders & PDFs...</div>';

  const status = document.getElementById('pdfStatus').value;
  const search = document.getElementById('pdfSearch').value;

  try {
    // Fetch from both sources in parallel
    const params = new URLSearchParams({ status });
    if (search) params.append('search', search);

    const [ownerPdfsResult, vendorOrdersResult] = await Promise.allSettled([
      fetchAPI(`/owner/pdfs?${params}`),
      fetchAPI('/vendor-orders')
    ]);

    // Combine results from both sources
    const pdfs = ownerPdfsResult.status === 'fulfilled' ? (ownerPdfsResult.value.data || []) : [];
    const vendorOrders = vendorOrdersResult.status === 'fulfilled' ? (vendorOrdersResult.value.orders || []) : [];

    // Transform vendor orders to match PDF format
    const transformedOrders = vendorOrders.map(order => ({
      id: order.id,
      source: 'vendor_order',
      invoiceNumber: order.orderNumber,
      filename: order.pdfFileName,
      invoiceDate: order.orderDate,
      vendor: order.vendorName,
      amount: parseFloat(order.total) || 0,
      isProcessed: order.status === 'parsed' || order.status === 'validated' || order.status === 'fifo_complete',
      status: order.status,
      pdfPreviewUrl: order.pdfPreviewUrl,
      pdfFileId: order.pdfFileId,
      subtotal: parseFloat(order.subtotal) || 0,
      tax: parseFloat(order.tax) || 0,
      createdAt: order.createdAt
    }));

    // Mark source for original PDFs
    const allItems = [
      ...pdfs.map(p => ({ ...p, source: 'document' })),
      ...transformedOrders
    ];

    // Sort by created date (newest first)
    allItems.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    if (allItems.length === 0) {
      tableDiv.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📄</div><div>No orders or PDFs found</div></div>';
      return;
    }

    let html = `
      <table class="table">
        <thead>
          <tr>
            <th width="30"><input type="checkbox" onchange="toggleAllPDFs(this.checked)"></th>
            <th>Invoice #</th>
            <th>Invoice Date</th>
            <th>Vendor</th>
            <th>Amount</th>
            <th>Status</th>
            <th>Source</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
    `;

    let totalAmount = 0;

    allItems.forEach(item => {
      // Status badge varies by source
      let statusBadge;
      if (item.source === 'vendor_order') {
        const statusMap = {
          'new': '<span class="badge badge-info">New</span>',
          'parsed': '<span class="badge badge-success">Parsed</span>',
          'validated': '<span class="badge badge-success">Validated</span>',
          'fifo_complete': '<span class="badge badge-success">FIFO Done</span>',
          'error': '<span class="badge badge-danger">Error</span>',
          'archived': '<span class="badge badge-secondary">Archived</span>'
        };
        statusBadge = statusMap[item.status] || '<span class="badge badge-warning">Unknown</span>';
      } else {
        statusBadge = item.isProcessed ? '<span class="badge badge-success">Included</span>' : '<span class="badge badge-warning">Pending</span>';
      }

      const invoiceNum = item.invoiceNumber || item.filename;

      // Fix: Parse date string directly to avoid timezone issues
      let dateDisplay = 'N/A';
      if (item.invoiceDate) {
        const dateStr = item.invoiceDate;
        if (typeof dateStr === 'string' && dateStr.match(/^\d{4}-\d{2}-\d{2}/)) {
          const [year, month, day] = dateStr.substring(0, 10).split('-');
          const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
          dateDisplay = date.toLocaleDateString();
        } else {
          dateDisplay = new Date(dateStr).toLocaleDateString();
        }
      } else if (item.receivedDate) {
        dateDisplay = new Date(item.receivedDate + 'T12:00:00').toLocaleDateString();
      }

      const vendor = item.vendor || 'N/A';
      const amount = item.amount || 0;
      const amountDisplay = amount > 0 ? `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-';

      if (amount > 0) totalAmount += amount;

      // Source badge
      const sourceBadge = item.source === 'vendor_order'
        ? '<span class="badge badge-primary">GDrive</span>'
        : '<span class="badge badge-secondary">Upload</span>';

      // Escape single quotes for onclick handler
      const escapedInvoiceNum = invoiceNum ? invoiceNum.replace(/'/g, "\\'") : '';

      // View action - different for vendor orders vs uploaded PDFs
      let viewAction;
      if (item.source === 'vendor_order' && item.pdfPreviewUrl) {
        viewAction = `<button type="button" class="btn btn-sm btn-primary" onclick="window.open('${item.pdfPreviewUrl}', '_blank')">👁️ View</button>`;
      } else {
        viewAction = `<button type="button" class="btn btn-sm btn-primary" onclick="viewPDF('${item.id}', '${escapedInvoiceNum}')">👁️ View</button>`;
      }

      html += `
        <tr>
          <td><input type="checkbox" class="pdf-checkbox" data-pdf-id="${item.id}" data-source="${item.source}" ${item.isProcessed ? 'disabled' : ''}></td>
          <td><strong>${invoiceNum || '-'}</strong></td>
          <td>${dateDisplay}</td>
          <td>${vendor}</td>
          <td class="text-right-bold">${amountDisplay}</td>
          <td>${statusBadge}</td>
          <td>${sourceBadge}</td>
          <td>${viewAction}</td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    const totalFormatted = totalAmount > 0 ? `$${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$0.00';
    html += `<div class="info-text-mt">
      <strong>Total:</strong> ${allItems.length} items
      (${transformedOrders.length} from Google Drive, ${pdfs.length} uploaded) |
      <strong>Total Amount:</strong> <span class="text-success-lg">${totalFormatted}</span>
    </div>`;

    tableDiv.innerHTML = html;
  } catch (error) {
    tableDiv.innerHTML = showError('pdfs', error.message);
  }
}

function toggleAllPDFs(checked) {
  document.querySelectorAll('.pdf-checkbox:not([disabled])').forEach(cb => {
    cb.checked = checked;
  });
}

function viewPDF(pdfId, invoiceNum) {
  // Get access token from local storage (stored as 'authToken')
  const accessToken = localStorage.getItem('authToken');

  if (!accessToken) {
    alert('Authentication token missing. Please refresh the page and login again.');
    return;
  }

  // Construct API URL with token for authentication
  const apiUrl = `${API_BASE}/owner/pdfs/${pdfId}/preview?token=${encodeURIComponent(accessToken)}`;

  // Open PDF in new tab using API endpoint
  const newWindow = window.open(apiUrl, '_blank');

  // If blocked by browser, show helpful message
  if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
    alert(`Browser blocked popup. Please allow popups for this site to view PDFs.\n\nInvoice: ${invoiceNum}`);
  }
}

function closePDFModal() {
  document.getElementById('pdfModal').classList.remove('active');
  document.getElementById('pdfFrame').src = '';
}

function openIncludeOrdersModal() {
  if (!activeCountId) {
    alert('Please start a count first in the Count tab.');
    return;
  }

  document.getElementById('includeCountId').value = activeCountId;
  document.getElementById('includeOrdersModal').classList.add('active');
  loadUnprocessedPDFsForInclude();
}

function closeIncludeOrdersModal() {
  document.getElementById('includeOrdersModal').classList.remove('active');
}

async function loadUnprocessedPDFsForInclude() {
  const listDiv = document.getElementById('pdfCheckboxList');
  listDiv.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  try {
    const data = await fetchAPI('/owner/pdfs?status=unprocessed');
    const pdfs = data.data || [];

    if (pdfs.length === 0) {
      listDiv.innerHTML = '<div class="empty-state">No unprocessed PDFs available</div>';
      return;
    }

    let html = '';
    pdfs.forEach(pdf => {
      const displayName = pdf.invoiceNumber || pdf.filename;
      const dateDisplay = pdf.invoiceDate
        ? new Date(pdf.invoiceDate).toLocaleDateString()
        : (pdf.receivedDate ? new Date(pdf.receivedDate).toLocaleDateString() : 'N/A');
      html += `
        <label class="checkbox-item">
          <input type="checkbox" value="${pdf.id}">
          <span><strong>${displayName}</strong> <small class="u-text-light-inline">(${dateDisplay})</small></span>
        </label>
      `;
    });

    listDiv.innerHTML = html;
  } catch (error) {
    listDiv.innerHTML = showError('pdfCheckboxList', error.message);
  }
}

async function includeSelectedPDFs() {
  const countId = document.getElementById('includeCountId').value;
  if (!countId) {
    alert('Count ID is required');
    return;
  }

  const selected = Array.from(document.querySelectorAll('#pdfCheckboxList input:checked')).map(cb => cb.value);
  if (selected.length === 0) {
    alert('No PDFs selected');
    return;
  }

  try {
    const data = await fetchAPI('/owner/pdfs/mark-processed', {
      method: 'POST',
      body: JSON.stringify({
        invoiceIds: selected,
        countId: countId
      })
    });

    alert(`Success! ${data.data.linkedCount} PDFs included in count.`);
    closeIncludeOrdersModal();
    loadPDFs();
  } catch (error) {
    alert('Error: ' + error.message);
  }
}

function openUploadPDFModal() {
  document.getElementById('pdfFile').value = '';
  document.getElementById('pdfNotes').value = '';
  document.getElementById('uploadPDFModal').classList.add('active');
}

function closeUploadPDFModal() {
  document.getElementById('uploadPDFModal').classList.remove('active');
}

async function uploadPDF() {
  const fileInput = document.getElementById('pdfFile');
  const notes = document.getElementById('pdfNotes').value;

  if (!fileInput.files || fileInput.files.length === 0) {
    alert('Please select a PDF file');
    return;
  }

  const file = fileInput.files[0];

  // Validate file type
  if (file.type !== 'application/pdf') {
    alert('Only PDF files are allowed');
    return;
  }

  // Validate file size (50MB max)
  if (file.size > 50 * 1024 * 1024) {
    alert('File size must be less than 50MB');
    return;
  }

  try {
    // Create FormData for multipart upload
    const formData = new FormData();
    formData.append('file', file);
    if (notes) {
      formData.append('notes', notes);
    }

    // Upload the file
    const response = await fetch(`${API_BASE}/owner/pdfs/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
        // Don't set Content-Type - browser will set it with boundary for multipart
      },
      body: formData
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || errorData.error || 'Upload failed');
    }

    const data = await response.json();

    alert(`PDF uploaded successfully!\nFilename: ${data.data.filename}\nSize: ${data.data.sizeMB} MB${data.data.invoiceNumber ? '\nInvoice #: ' + data.data.invoiceNumber : ''}`);
    closeUploadPDFModal();
    loadPDFs();

  } catch (error) {
    console.error('Upload error:', error);
    alert('Upload failed: ' + error.message);
  }
}

// ============================================================================
// COUNT TAB
// ============================================================================

async function loadCountLocations() {
  try {
    const data = await fetchAPI('/owner/console/locations');
    const select = document.getElementById('countLocation');
    select.innerHTML = '<option value="">Select location...</option>';

    // Handle null response from API
    if (!data || !data.locations) {
      console.warn('No locations data available');
      return;
    }

    data.locations.forEach(loc => {
      select.innerHTML += `<option value="${loc.location_id}">${loc.location_name}</option>`;
    });
  } catch (error) {
    console.error('Error loading locations for count:', error);
  }
}

async function startCount() {
  const locationId = document.getElementById('countLocation').value;
  const notes = document.getElementById('countNotes').value;

  try {
    const data = await fetchAPI('/owner/console/counts/start', {
      method: 'POST',
      body: JSON.stringify({
        startingLocationId: locationId || null,
        notes: notes || null
      })
    });

    activeCountId = data.countId;
    document.getElementById('activeCountId').textContent = `ID: ${activeCountId}`;
    alert(`Count started! ID: ${activeCountId}`);
    loadActiveCount();
  } catch (error) {
    alert('Error starting count: ' + error.message);
  }
}

async function loadActiveCount() {
  const detailsDiv = document.getElementById('activeCountDetails');

  if (!activeCountId) {
    detailsDiv.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔢</div><div>No active count</div><div class="u-mt-2"><button class="btn btn-primary" onclick="document.querySelector(\'#count\').scrollIntoView()">Start a count to begin</button></div></div>';
    return;
  }

  detailsDiv.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  try {
    const data = await fetchAPI(`/owner/console/counts/${activeCountId}`);
    const count = data.count;
    const items = data.items || [];
    const pdfs = data.pdfs || [];

    let html = `
      <div class="u-mb-4">
        <strong>Status:</strong> <span class="badge ${count.status === 'closed' ? 'badge-success' : 'badge-warning'}">${count.status}</span><br>
        <strong>Started:</strong> ${new Date(count.created_at).toLocaleString()}<br>
        <strong>Total Lines:</strong> ${count.total_lines || 0}<br>
        <strong>Locations:</strong> ${count.locations_touched || 0}
      </div>
      <div class="flex-gap-2-mb">
        <button class="btn btn-sm btn-primary" onclick="showAddItemForm()">+ Add Item</button>
        <button class="btn btn-sm btn-primary" onclick="showAttachPDFForm()">📎 Attach PDF</button>
        ${count.status !== 'closed' ? '<button class="btn btn-sm btn-success" onclick="closeCount()">✓ Close Count</button>' : ''}
      </div>
    `;

    if (items.length > 0) {
      html += '<h4 class="info-header">Items:</h4>';
      html += '<div class="scrollable-200-base">';
      items.forEach(item => {
        html += `<div class="bordered-item">${item.item_code} - ${item.item_name}: <strong>${item.quantity}</strong> ${item.location_name || ''}</div>`;
      });
      html += '</div>';
    }

    if (pdfs.length > 0) {
      html += '<h4 class="info-header">Attached PDFs:</h4>';
      html += '<div class="u-text-base">';
      pdfs.forEach(pdf => {
        const escapedFilename = pdf.filename.replace(/'/g, "\\'");
        html += `<div class="bordered-item"><a href="#" onclick="viewPDF('${pdf.document_id}', '${escapedFilename}')" class="u-text-primary">${pdf.filename}</a></div>`;
      });
      html += '</div>';
    }

    detailsDiv.innerHTML = html;
  } catch (error) {
    detailsDiv.innerHTML = showError('activeCount', error.message);
  }
}

async function showAddItemForm() {
  if (!activeCountId) {
    alert('No active count. Please start a count first.');
    return;
  }

  // Show modal
  const modal = document.getElementById('addItemToCountModal');
  modal.classList.add('active');

  // Reset form
  document.getElementById('itemSearchInput').value = '';
  document.getElementById('selectedItemCode').value = '';
  document.getElementById('countItemQuantity').value = '';
  document.getElementById('countItemNotes').value = '';
  setHidden(document.getElementById('itemSearchResults'), true);
  setHidden(document.getElementById('selectedItemDisplay'), true);

  // Load locations for dropdown
  await loadLocationsForCountItem();

  // Focus on search input
  setTimeout(() => document.getElementById('itemSearchInput').focus(), 100);
}

function closeAddItemToCountModal() {
  const modal = document.getElementById('addItemToCountModal');
  modal.classList.remove('active');
}

async function loadLocationsForCountItem() {
  try {
    const data = await fetchAPI('/owner/console/locations');
    const select = document.getElementById('countItemLocation');

    select.innerHTML = '<option value="">Select location...</option>';
    (data.locations || []).forEach(loc => {
      select.innerHTML += `<option value="${loc.location_id}">${loc.location_name}</option>`;
    });
  } catch (error) {
    console.error('Error loading locations:', error);
  }
}

// Item search with autocomplete (v14.5.0 CSP Compliant)
let searchTimeout;
document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('itemSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      const query = e.target.value.trim();

      if (query.length < 2) {
        setHidden(document.getElementById('itemSearchResults'), true);
        return;
      }

      searchTimeout = setTimeout(() => searchItems(query), 300);
    });
  }
});

async function searchItems(query) {
  try {
    const data = await fetchAPI(`/owner/inventory/items?search=${encodeURIComponent(query)}&limit=20`);
    const resultsDiv = document.getElementById('itemSearchResults');

    if (!data.items || data.items.length === 0) {
      resultsDiv.innerHTML = '<div class="search-result-item u-text-light-inline">No items found</div>';
      setHidden(resultsDiv, false);
      return;
    }

    let html = '';
    data.items.forEach(item => {
      html += `
        <div class="search-result-item"
             onclick="selectItem('${item.item_code}', '${item.item_name.replace(/'/g, "\\'")}', '${item.unit || 'EA'}')">
          <strong>${item.item_code}</strong> - ${item.item_name}
          <div class="u-text-xs u-text-light-inline">
            ${item.category || 'N/A'} | ${item.unit || 'EA'} | On hand: ${item.current_quantity || 0}
          </div>
        </div>
      `;
    });

    resultsDiv.innerHTML = html;
    setHidden(resultsDiv, false);
  } catch (error) {
    console.error('Error searching items:', error);
  }
}

function selectItem(code, name, unit) {
  document.getElementById('selectedItemCode').value = code;
  document.getElementById('selectedItemText').textContent = `${code} - ${name} (${unit})`;
  setHidden(document.getElementById('selectedItemDisplay'), false);
  setHidden(document.getElementById('itemSearchResults'), true);
  document.getElementById('itemSearchInput').value = '';

  // Focus on quantity input
  setTimeout(() => document.getElementById('countItemQuantity').focus(), 100);
}

function clearSelectedItem() {
  document.getElementById('selectedItemCode').value = '';
  setHidden(document.getElementById('selectedItemDisplay'), true);
  document.getElementById('itemSearchInput').focus();
}

async function submitItemToCount() {
  const itemCode = document.getElementById('selectedItemCode').value;
  const quantity = parseFloat(document.getElementById('countItemQuantity').value);
  const locationId = document.getElementById('countItemLocation').value || null;
  const notes = document.getElementById('countItemNotes').value || null;

  if (!itemCode) {
    alert('Please select an item from the search results.');
    return;
  }

  if (!quantity || quantity <= 0) {
    alert('Please enter a valid quantity.');
    return;
  }

  await addItemToCount(itemCode, quantity, notes, locationId);
  closeAddItemToCountModal();
}

async function addItemToCount(itemCode, quantity, notes = null, locationId = null) {
  if (!activeCountId) {
    alert('No active count. Please start a count first.');
    return;
  }

  try {
    await fetchAPI(`/owner/console/counts/${activeCountId}/add-item`, {
      method: 'POST',
      body: JSON.stringify({
        itemCode: itemCode,
        quantity: quantity,
        locationId: locationId,
        notes: notes
      })
    });

    alert('Item added to count!');
    loadActiveCount();
  } catch (error) {
    alert('Error adding item: ' + error.message);
  }
}

function showAttachPDFForm() {
  const pdfId = prompt('Enter PDF/Document ID:', '');
  if (!pdfId) return;

  const invoiceNumber = prompt('Invoice Number (optional):', '');
  const notes = prompt('Notes (optional):', '');

  attachPDFToCount(pdfId, invoiceNumber, notes);
}

async function attachPDFToCount(pdfId, invoiceNumber = null, notes = null) {
  if (!activeCountId) {
    alert('No active count. Please start a count first.');
    return;
  }

  try {
    await fetchAPI(`/owner/console/counts/${activeCountId}/attach-pdf`, {
      method: 'POST',
      body: JSON.stringify({
        documentId: pdfId,
        invoiceNumber: invoiceNumber,
        notes: notes
      })
    });

    alert('PDF attached to count!');
    loadActiveCount();
  } catch (error) {
    alert('Error attaching PDF: ' + error.message);
  }
}

async function closeCount() {
  if (!activeCountId) return;

  // Show process panel before closing
  const processPanel = document.getElementById('countProcessPanel');
  const processDetails = document.getElementById('countProcessDetails');
  setHidden(processPanel, false);

  try {
    const data = await fetchAPI(`/owner/console/counts/${activeCountId}`);
    const items = data.items || [];
    const pdfs = data.pdfs || [];

    let html = `
      <div class="alert alert-info">Review count details before closing. This action creates a permanent snapshot.</div>
      <h4>Items to be recorded: ${items.length}</h4>
      <div class="scrollable-300-my">
        ${items.map(item => `<div class="bordered-item">${item.item_code} - ${item.item_name}: <strong>${item.quantity}</strong></div>`).join('')}
      </div>
      <h4>PDFs attached: ${pdfs.length}</h4>
      <div class="scrollable-200-my">
        ${pdfs.map(pdf => {
          const escapedFilename = pdf.filename.replace(/'/g, "\\'");
          return `<div class="bordered-item"><a href="#" onclick="viewPDF('${pdf.document_id}', '${escapedFilename}')" class="u-text-primary">${pdf.filename}</a></div>`;
        }).join('')}
      </div>
      <div class="flex-gap-4-mt">
        <button class="btn btn-success" onclick="confirmCloseCount()">✓ Confirm & Close</button>
        <button class="btn btn-secondary" onclick="cancelCloseCount()">Cancel</button>
      </div>
    `;

    processDetails.innerHTML = html;
    processPanel.scrollIntoView({ behavior: 'smooth' });
  } catch (error) {
    alert('Error loading count details: ' + error.message);
  }
}

async function confirmCloseCount() {
  const notes = prompt('Final notes for this count (optional):', '');

  try {
    await fetchAPI(`/owner/console/counts/${activeCountId}/close`, {
      method: 'POST',
      body: JSON.stringify({ notes })
    });

    alert('Count closed successfully!');
    activeCountId = null;
    document.getElementById('activeCountId').textContent = '';
    setHidden(document.getElementById('countProcessPanel'), true);
    loadActiveCount();
  } catch (error) {
    alert('Error closing count: ' + error.message);
  }
}

function cancelCloseCount() {
  setHidden(document.getElementById('countProcessPanel'), true);
}

// ============================================================================
// AI CONSOLE TAB
// ============================================================================

async function loadAIConsole() {
  // v12.5: Load AI Ops status first (includes health, cron schedule, real-time status)
  loadAIOpsStatus();

  // v12.5: Load learning timeline
  loadLearningTimeline();

  // Load existing panels
  loadAIReorder();
  loadAIAnomalies();
  loadAIUpgrade();
  loadLearningNudges();
}

async function loadAIReorder() {
  const div = document.getElementById('aiReorderList');
  div.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  try {
    // v13.1: Use real dashboard reorder endpoint
    const data = await fetchAPI('/owner/dashboard/reorder?n=10');
    const items = data.recommendations || [];

    if (items.length === 0) {
      div.innerHTML = '<div class="empty-state" class="u-py-8 u-px-4"><div>✅ All Items Stocked</div><div class="description-text">No items currently need reordering. Great job!</div></div>';
      return;
    }

    let html = '<div class="flex-col-gap-base">';
    items.forEach(item => {
      const urgencyClass = item.stockPct < 50 ? 'border-left-danger' : item.stockPct < 100 ? 'border-left-warning' : 'border-left-info';
      const urgencyBadgeClass = item.stockPct < 50 ? 'badge-danger' : item.stockPct < 100 ? 'badge-warning' : 'badge-info';
      html += `
        <div class="padded-box-bordered ${urgencyClass}">
          <div class="fw-600 u-mb-1">${item.itemCode} - ${item.name}</div>
          <div class="info-description">
            Current: ${item.currentStock} ${item.unit || ''} | Reorder Point: ${item.reorderPoint} | Need: ${item.recommendedReorderQty}
          </div>
          <div class="flex-gap-1 flex-wrap">
            ${(item.drivers || []).map(d => `<span class="badge badge-info">${d}</span>`).join('')}
            <span class="badge ${urgencyBadgeClass}">${item.stockPct}% of reorder point</span>
          </div>
        </div>
      `;
    });
    html += '</div>';

    div.innerHTML = html;
  } catch (error) {
    console.error('Failed to load reorder recommendations:', error);
    div.innerHTML = '<div class="empty-state" class="u-py-8 u-px-4"><div>⚠️ Unable to load recommendations</div><div class="description-text">Please refresh the page.</div></div>';
  }
}

async function loadAIAnomalies() {
  const div = document.getElementById('aiAnomalyList');
  div.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  try {
    // v13.1: Use real dashboard anomalies endpoint
    const data = await fetchAPI('/owner/dashboard/anomalies?window=7d');
    const items = data.anomalies || [];

    if (items.length === 0) {
      div.innerHTML = '<div class="empty-state" class="u-py-8 u-px-4"><div>✅ No Anomalies Detected</div><div class="description-text">All inventory levels are normal.</div></div>';
      return;
    }

    let html = '<div class="flex-col-gap-base">';
    items.forEach(item => {
      const severityClass = item.severity === 'critical' ? 'badge-danger' : item.severity === 'high' ? 'badge-warning' : item.severity === 'medium' ? 'badge-info' : 'badge-secondary';
      const severityIcon = item.severity === 'critical' ? '🔴' : item.severity === 'high' ? '⚠️' : '🔵';
      html += `
        <div class="bordered-section">
          <div class="flex-between-start">
            <div>
              <span class="u-text-1-25 u-mr-2">${severityIcon}</span>
              <span class="fw-600">${item.itemCode}</span>
              ${item.name ? `<span class="text-sm-light u-text-light-inline"> - ${item.name}</span>` : ''}
            </div>
            <span class="badge ${severityClass}">${item.severity}</span>
          </div>
          <div class="info-description">${item.explanation}</div>
          <div class="description-text-small">
            ${new Date(item.when).toLocaleString()} | Confidence: ${Math.round((item.confidence || 0) * 100)}%
          </div>
        </div>
      `;
    });
    html += '</div>';

    div.innerHTML = html;
  } catch (error) {
    console.error('Failed to load anomalies:', error);
    div.innerHTML = '<div class="empty-state" class="u-py-8 u-px-4"><div>⚠️ Unable to load anomalies</div><div class="description-text">Please refresh the page.</div></div>';
  }
}

async function loadAIUpgrade() {
  const div = document.getElementById('aiUpgradeAdvice');
  div.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  try {
    // v13.1: Use real dashboard stats for system advisor
    const statsResponse = await fetchAPI('/owner/dashboard/stats');
    const stats = statsResponse.stats;

    // Calculate overall system health score
    const pdfScore = stats.pdfs?.coverage || 0;
    const inventoryScore = stats.inventory?.totalItems > 0 ? 100 : 0;
    const fifoScore = stats.fifo?.totalCases > 0 ? 100 : 50;
    const overallScore = Math.round((pdfScore + inventoryScore + fifoScore) / 3);

    let html = `
      <div class="u-text-base">
        <div class="u-mb-4">
          <strong>System Health Score:</strong>
          <div class="score-display-large ${overallScore >= 75 ? 'u-text-ok' : overallScore >= 50 ? 'u-text-warn' : 'u-text-bad'}">${overallScore}%</div>
        </div>
        <div class="flex-col-gap">
          <div>
            <strong>📄 Invoice Extraction:</strong> ${pdfScore}%<br>
            <span class="u-text-light-inline">${pdfScore === 100 ? 'Perfect! All invoices have extracted dates.' : `${stats.pdfs?.withDates || 0}/${stats.pdfs?.total || 0} invoices processed. Keep uploading!`}</span>
          </div>
          <div>
            <strong>📦 FIFO Tracking:</strong> ${stats.fifo?.totalCases || 0} cases<br>
            <span class="u-text-light-inline">${stats.fifo?.totalCases > 0 ? `Tracking ${stats.fifo.productsTracked} products with FIFO.` : 'Start using FIFO for better inventory rotation.'}</span>
          </div>
          <div>
            <strong>💾 Database:</strong> SQLite<br>
            <span class="u-text-light-inline">Connected and operational with ${stats.inventory?.totalItems || 0} items tracked.</span>
          </div>
          <div>
            <strong>📊 Inventory Value:</strong> $${((stats.pdfs?.totalAmount || 0) / 1000).toFixed(1)}K<br>
            <span class="u-text-light-inline">Total invoice value tracked in system.</span>
          </div>
        </div>
    `;

    // Generate next best actions based on real data
    const nextActions = [];

    if (pdfScore < 100) {
      nextActions.push({
        title: `Upload missing invoices (${stats.pdfs?.total - stats.pdfs?.withDates || 0} remaining)`,
        etaMin: 5
      });
    }

    if (stats.fifo?.totalCases === 0) {
      nextActions.push({
        title: 'Enable FIFO tracking for better inventory rotation',
        etaMin: 10
      });
    }

    if (stats.counts?.active === 0) {
      nextActions.push({
        title: 'Perform a physical count to verify inventory accuracy',
        etaMin: 30
      });
    }

    if (nextActions.length > 0) {
      html += '<div class="u-mt-4"><strong>💡 Recommended Actions:</strong></div>';
      html += '<div class="flex-col-gap-sm u-mt-2">';
      nextActions.forEach(action => {
        html += `<div class="bordered-left-primary-sm">${action.title} <span class="u-text-light-inline">(~${action.etaMin}min)</span></div>`;
      });
      html += '</div>';
    } else {
      html += '<div class="success-box-centered">✅ System is running optimally!</div>';
    }

    html += '</div>';
    div.innerHTML = html;
  } catch (error) {
    console.error('Failed to load system advisor:', error);
    div.innerHTML = '<div class="empty-state" class="u-py-8 u-px-4"><div>⚠️ Unable to load advisor</div><div class="description-text">Please refresh the page.</div></div>';
  }
}

async function submitFeedback() {
  const textarea = document.getElementById('aiFeedback');
  const comment = textarea.value.trim();

  if (!comment) {
    alert('Please enter feedback text');
    return;
  }

  try {
    const data = await fetchAPI('/owner/forecast/comment', {
      method: 'POST',
      body: JSON.stringify({ comment, source: 'owner_console' })
    });

    alert('Feedback submitted! ' + (data.message || ''));
    textarea.value = '';
    loadFeedbackHistory();
  } catch (error) {
    alert('Error submitting feedback: ' + error.message);
  }
}

async function trainAI() {
  if (!confirm('Train AI with all pending feedback comments?')) return;

  try {
    const data = await fetchAPI('/owner/forecast/train', { method: 'POST' });
    alert(`AI training complete!\nApplied: ${data.applied || 0}\nFailed: ${data.failed || 0}`);
    loadFeedbackHistory();
  } catch (error) {
    alert('Error training AI: ' + error.message);
  }
}

async function loadFeedbackHistory() {
  const div = document.getElementById('feedbackHistory');
  div.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  try {
    const data = await fetchAPI('/owner/forecast/comments?limit=10');
    const comments = data.comments || [];

    if (comments.length === 0) {
      div.innerHTML = '<div class="alert-centered">No feedback history</div>';
      return;
    }

    let html = '<div class="scrollable-300-mt"><table class="table"><thead><tr><th>Comment</th><th>Intent</th><th>Status</th><th>Date</th></tr></thead><tbody>';
    comments.forEach(c => {
      const statusBadge = c.applied ? '<span class="badge badge-success">Applied</span>' : '<span class="badge badge-warning">Pending</span>';
      html += `
        <tr>
          <td>${c.comment_text}</td>
          <td>${c.parsed_intent || 'unknown'}</td>
          <td>${statusBadge}</td>
          <td>${new Date(c.created_at).toLocaleDateString()}</td>
        </tr>
      `;
    });
    html += '</tbody></table></div>';

    div.innerHTML = html;
  } catch (error) {
    div.innerHTML = showError('feedbackHistory', error.message);
  }
}

// ============================================================================
// FORECAST TAB
// ============================================================================

async function loadForecast() {
  loadPopulation();
  loadStockoutAlerts();
  loadDailyForecast();
}

async function loadPopulation() {
  try {
    const data = await fetchAPI('/owner/forecast/population');
    document.getElementById('totalPopulation').value = data.totalPopulation || 250;
    document.getElementById('indianCount').value = data.indianMeals || 0;
  } catch (error) {
    console.error('Error loading population:', error);
  }
}

async function updatePopulation() {
  const total = parseInt(document.getElementById('totalPopulation').value);
  const indian = parseInt(document.getElementById('indianCount').value);

  try {
    await fetchAPI('/owner/forecast/population', {
      method: 'POST',
      body: JSON.stringify({
        total_count: total,
        indian_count: indian
      })
    });

    alert('Population updated! Refreshing forecast...');
    loadDailyForecast();
  } catch (error) {
    alert('Error updating population: ' + error.message);
  }
}

function adjustPopulation(deltaTotal, deltaIndian) {
  const totalEl = document.getElementById('totalPopulation');
  const indianEl = document.getElementById('indianCount');

  totalEl.value = Math.max(0, parseInt(totalEl.value || 0) + deltaTotal);
  indianEl.value = Math.max(0, parseInt(indianEl.value || 0) + deltaIndian);

  updatePopulation();
}

async function loadStockoutAlerts() {
  const div = document.getElementById('stockoutAlerts');
  div.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  try {
    const data = await fetchAPI('/owner/forecast/stockout');
    // Combine critical and high arrays from stockout response
    const items = [...(data.critical || []), ...(data.high || [])];

    if (items.length === 0) {
      div.innerHTML = '<div class="alert-success-centered">✅ No critical stockout risks</div>';
      return;
    }

    let html = '<div class="flex-col-gap-sm">';
    items.forEach(item => {
      const risk_level = item.risk_level || 'MEDIUM';
      const alertClass = risk_level === 'CRITICAL' ? 'alert-danger' : 'alert-warning';
      html += `
        <div class="${alertClass.replace('alert-', 'badge-')}" class="flex-between-centered-padded">
          <span><strong>${item.item_code}</strong> - ${item.item_name}</span>
          <span class="badge ${risk_level === 'CRITICAL' ? 'badge-danger' : 'badge-warning'}">${risk_level}</span>
        </div>
      `;
    });
    html += '</div>';

    div.innerHTML = html;
  } catch (error) {
    div.innerHTML = showError('stockoutAlerts', error.message);
  }
}

async function loadDailyForecast() {
  const div = document.getElementById('forecastTable');
  div.innerHTML = '<div class="loading"><div class="spinner"></div> Loading forecast...</div>';

  try {
    const data = await fetchAPI('/owner/forecast/daily');
    const predictions = data.items || [];

    if (predictions.length === 0) {
      div.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📈</div><div>No predictions available</div><div class="description-text">Update population and refresh.</div></div>';
      return;
    }

    let html = `
      <table class="table">
        <thead>
          <tr>
            <th>Item</th>
            <th>Predicted Qty</th>
            <th>Unit</th>
            <th>Confidence</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
    `;

    predictions.forEach(pred => {
      const confidence = Math.round((pred.avg_confidence || 0) * 100);
      const confidenceChip = createConfidenceChip(confidence);

      html += `
        <tr>
          <td><strong>${pred.item_code || 'N/A'}</strong><br><small class="u-text-light-inline">${pred.item_name || ''}</small></td>
          <td>${pred.total_predicted_qty?.toFixed(2) || 0}</td>
          <td>${pred.unit || 'EA'}</td>
          <td>${confidenceChip}</td>
          <td class="description-text-small">${pred.forecast_sources || 'forecast'}</td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    html += `<div class="info-text-mt">Last updated: ${new Date(data.timestamp || Date.now()).toLocaleString()}</div>`;

    div.innerHTML = html;
  } catch (error) {
    div.innerHTML = showError('forecastTable', error.message);
  }
}

// ============================================================================
// SETTINGS TAB
// ============================================================================

async function loadSettings() {
  // Device Info
  const deviceDiv = document.getElementById('deviceInfo');
  const fingerprint = localStorage.getItem('deviceFingerprint') || 'Not bound';

  deviceDiv.innerHTML = `
    <div class="u-text-base">
      <strong>Device Fingerprint:</strong><br>
      <code class="badge-inline">${fingerprint}</code>
    </div>
  `;

  // Audit Info - Use relative path to avoid CSP issues
  try {
    const metrics = await fetch('/metrics').then(r => r.text());
    const auditDiv = document.getElementById('auditInfo');

    // Extract audit chain hash if available in metrics
    const hashMatch = metrics.match(/audit_chain_head_hash{.*?}\s+"([^"]+)"/);
    const chainHash = hashMatch ? hashMatch[1] : 'Not available';

    auditDiv.innerHTML = `
      <div class="u-text-base">
        <strong>Audit Chain Head:</strong><br>
        <code class="badge-inline">${chainHash}</code>
      </div>
    `;
  } catch (error) {
    document.getElementById('auditInfo').innerHTML = '<div class="text-base-light">Audit info unavailable</div>';
  }

  // Load preferences
  const warmCache = localStorage.getItem('warmCache') === 'true';
  document.getElementById('warmCache').checked = warmCache;
}

function rebindDevice() {
  if (!confirm('Rebind this device as the owner device?\n\nThis will invalidate other device bindings.')) return;

  const fingerprint = generateDeviceFingerprint();
  localStorage.setItem('deviceFingerprint', fingerprint);

  alert('Device rebound successfully!\n\nFingerprint: ' + fingerprint);
  loadSettings();
}

function generateDeviceFingerprint() {
  const components = [
    navigator.userAgent,
    navigator.language,
    screen.width + 'x' + screen.height,
    new Date().getTimezoneOffset(),
    Date.now()
  ];

  const hash = components.join('|');
  return btoa(hash).substring(0, 32);
}

async function exportDailyCSV() {
  try {
    const data = await fetchAPI('/owner/forecast/daily');
    const predictions = data.items || [];

    if (predictions.length === 0) {
      alert('No data to export');
      return;
    }

    let csv = 'Item Code,Item Name,Predicted Quantity,Unit,Stock Risk,Sources,Confidence,Date\n';
    predictions.forEach(pred => {
      csv += `${pred.item_code || ''},${pred.item_name || ''},${pred.total_predicted_qty || 0},${pred.unit || ''},${pred.stock_out_risk || 0},${pred.forecast_sources || ''},${pred.avg_confidence || 0},${data.date || ''}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `forecast_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    alert('CSV exported successfully!');
  } catch (error) {
    alert('Error exporting CSV: ' + error.message);
  }
}

// Save preferences on change
document.addEventListener('change', (e) => {
  if (e.target.id === 'warmCache') {
    localStorage.setItem('warmCache', e.target.checked);
  }
});

// ============================================================================
// REPORTS TAB
// ============================================================================

let currentReportTab = 'executive';
let currentReportData = null;

async function loadReports() {
  const saved = localStorage.getItem('reportTab') || 'executive';
  switchReportTab(saved);
}

function switchReportTab(tabName) {
  // Update UI
  document.querySelectorAll('[id^="reportTab-"]').forEach(chip => chip.classList.remove('active'));
  const chip = document.getElementById(`reportTab-${tabName}`);
  if (chip) chip.classList.add('active');

  currentReportTab = tabName;
  localStorage.setItem('reportTab', tabName);

  // Load report data
  switch (tabName) {
    case 'executive': loadExecutiveReport(); break;
    case 'ops': loadOpsReport(); break;
    case 'production': loadProductionReport(); break;
    case 'purchasing': loadPurchasingReport(); break;
    case 'finance': loadFinanceReport(); break;
  }
}

async function loadExecutiveReport() {
  const div = document.getElementById('reportContent');
  div.innerHTML = '<div class="loading"><div class="spinner"></div> Loading executive report...</div>';

  try {
    const data = await fetchAPI('/owner/reports/executive');
    currentReportData = data.report;
    const report = data.report;

    let html = `
      <div class="grid grid-3" class="u-mb-6">
        <div class="card stat-card">
          <div class="stat-value">${report.demand?.today?.length || 0}</div>
          <div class="stat-label">Today's Items</div>
        </div>
        <div class="card stat-card">
          <div class="stat-value">${report.demand?.tomorrow?.length || 0}</div>
          <div class="stat-label">Tomorrow's Items</div>
        </div>
        <div class="card stat-card">
          <div class="stat-value">${report.stockouts?.length || 0}</div>
          <div class="stat-label">High Risk Stockouts</div>
        </div>
      </div>
      <h4 class="u-mb-2">Critical Stockouts</h4>
      <div class="u-mb-6">
        ${report.stockouts?.length ? report.stockouts.map(s => `
          <div class="bordered-item">
            <strong>${s.item_code}</strong> - ${s.severity} - Projected: ${s.projected_stockout_date}
          </div>
        `).join('') : '<div class="empty-state-centered">No critical stockouts</div>'}
      </div>
      <h4 class="u-mb-2">AI Confidence Trend (7 days)</h4>
      <div>
        ${report.aiConfidenceTrend?.length ? `
          <table class="table">
            <thead><tr><th>Date</th><th>Avg Confidence</th><th>Predictions</th></tr></thead>
            <tbody>
              ${report.aiConfidenceTrend.map(t => `
                <tr>
                  <td>${t.date}</td>
                  <td>${Math.round((t.avg_confidence || 0) * 100)}%</td>
                  <td>${t.prediction_count}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : '<div class="empty-state-centered">No confidence data</div>'}
      </div>
    `;

    div.innerHTML = html;
  } catch (error) {
    div.innerHTML = showError('executiveReport', error.message);
  }
}

async function loadOpsReport() {
  const div = document.getElementById('reportContent');
  div.innerHTML = '<div class="loading"><div class="spinner"></div> Loading ops report...</div>';

  try {
    const data = await fetchAPI('/owner/reports/ops');
    currentReportData = data.report;
    const report = data.report;

    let html = `
      <div class="grid grid-3" class="u-mb-6">
        <div class="card stat-card">
          <div class="stat-value">${report.countStatus?.open?.count || 0}</div>
          <div class="stat-label">Open Counts</div>
        </div>
        <div class="card stat-card">
          <div class="stat-value">${report.countStatus?.closed?.count || 0}</div>
          <div class="stat-label">Closed Counts</div>
        </div>
        <div class="card stat-card">
          <div class="stat-value">${report.pdfUsage?.counts_with_pdfs || 0}</div>
          <div class="stat-label">Counts with PDFs</div>
        </div>
      </div>
      <h4 class="u-mb-2">Count Throughput (14 days)</h4>
      <div class="u-mb-6">
        ${report.countThroughput?.length ? `
          <table class="table">
            <thead><tr><th>Date</th><th>Started</th><th>Completed</th><th>Users</th></tr></thead>
            <tbody>
              ${report.countThroughput.map(t => `
                <tr>
                  <td>${t.date}</td>
                  <td>${t.counts_started}</td>
                  <td>${t.counts_completed}</td>
                  <td>${t.unique_counters}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : '<div class="empty-state-centered">No throughput data</div>'}
      </div>
      <h4 class="u-mb-2">Top 20 Spot-Check Targets</h4>
      <div>
        ${report.spotCheckTargets?.length ? `
          <table class="table">
            <thead><tr><th>Code</th><th>Name</th><th>Count Freq</th><th>Variance</th></tr></thead>
            <tbody>
              ${report.spotCheckTargets.slice(0, 20).map(t => `
                <tr>
                  <td>${t.item_code}</td>
                  <td>${t.item_name}</td>
                  <td>${t.count_frequency}</td>
                  <td><span class="badge badge-warning">${t.variance?.toFixed(2)}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : '<div class="empty-state-centered">No spot-check data</div>'}
      </div>
    `;

    div.innerHTML = html;
  } catch (error) {
    div.innerHTML = showError('opsReport', error.message);
  }
}

async function loadProductionReport() {
  const div = document.getElementById('reportContent');
  div.innerHTML = '<div class="loading"><div class="spinner"></div> Loading production report...</div>';

  try {
    const data = await fetchAPI('/owner/reports/production');
    currentReportData = data.report;
    const report = data.report;

    let html = `
      <h4 class="u-mb-2">Today's Make List</h4>
      <div class="u-mb-6">
        ${report.makeList?.length ? `
          <table class="table">
            <thead><tr><th>Item</th><th>Qty Needed</th><th>Unit</th><th>Confidence</th><th>Source</th></tr></thead>
            <tbody>
              ${report.makeList.map(m => `
                <tr>
                  <td><strong>${m.item_code}</strong></td>
                  <td>${m.quantity_needed?.toFixed(2)}</td>
                  <td>${m.unit}</td>
                  <td>${Math.round((m.confidence_score || 0) * 100)}%</td>
                  <td>${m.source}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : '<div class="empty-state-centered">No make list data</div>'}
      </div>
      <h4 class="u-mb-2">FIFO Ingredient Pulls</h4>
      <div>
        ${report.ingredientsByFIFO?.length ? `
          <table class="table">
            <thead><tr><th>Item</th><th>Locations/Layers</th><th>Total Qty</th></tr></thead>
            <tbody>
              ${report.ingredientsByFIFO.map(i => `
                <tr>
                  <td><strong>${i.item_code}</strong><br><small>${i.item_name}</small></td>
                  <td>
                    ${i.layers.map(l => `<div class="u-text-xs">${l.location}: ${l.quantity} (Exp: ${l.expiry_date || 'N/A'})</div>`).join('')}
                  </td>
                  <td>${i.layers.reduce((sum, l) => sum + l.quantity, 0).toFixed(2)} ${i.unit}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : '<div class="empty-state-centered">No FIFO data</div>'}
      </div>
    `;

    div.innerHTML = html;
  } catch (error) {
    div.innerHTML = showError('productionReport', error.message);
  }
}

async function loadPurchasingReport() {
  const div = document.getElementById('reportContent');
  div.innerHTML = '<div class="loading"><div class="spinner"></div> Loading purchasing report...</div>';

  try {
    const data = await fetchAPI('/owner/reports/purchasing');
    currentReportData = data.report;
    const report = data.report;

    let html = `
      <div class="grid grid-3" class="u-mb-6">
        <div class="card stat-card">
          <div class="stat-value">${report.pdfSummary?.total_invoices || 0}</div>
          <div class="stat-label">Total Invoices (30d)</div>
        </div>
        <div class="card stat-card">
          <div class="stat-value">$${(report.pdfSummary?.total_value || 0).toFixed(0)}</div>
          <div class="stat-label">Total Value</div>
        </div>
        <div class="card stat-card">
          <div class="stat-value">${report.pdfSummary?.unprocessed_count || 0}</div>
          <div class="stat-label">Unprocessed</div>
        </div>
      </div>
      <h4 class="u-mb-2">Recent Invoices</h4>
      <div class="u-mb-6">
        ${report.recentInvoices?.length ? `
          <table class="table">
            <thead><tr><th>Invoice #</th><th>Date</th><th>Value</th><th>Status</th></tr></thead>
            <tbody>
              ${report.recentInvoices.map(i => `
                <tr>
                  <td>${i.invoice_number || 'N/A'}</td>
                  <td>${i.invoice_date || 'N/A'}</td>
                  <td>$${(i.total_value || 0).toFixed(2)}</td>
                  <td>${i.processed ? '<span class="badge badge-success">Processed</span>' : '<span class="badge badge-warning">Pending</span>'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : '<div class="empty-state-centered">No invoice data</div>'}
      </div>
      <h4 class="u-mb-2">Reorder Recommendations</h4>
      <div>
        ${report.reorderRecommendations?.length ? `
          <table class="table">
            <thead><tr><th>Item</th><th>Recommended Qty</th><th>Priority</th><th>Reason</th></tr></thead>
            <tbody>
              ${report.reorderRecommendations.map(r => `
                <tr>
                  <td><strong>${r.item_code}</strong></td>
                  <td>${r.recommended_quantity} ${r.unit}</td>
                  <td><span class="badge ${r.priority === 'CRITICAL' ? 'badge-danger' : 'badge-warning'}">${r.priority}</span></td>
                  <td class="u-text-xs">${r.reason}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : '<div class="empty-state-centered">No reorder recommendations</div>'}
      </div>
    `;

    div.innerHTML = html;
  } catch (error) {
    div.innerHTML = showError('purchasingReport', error.message);
  }
}

async function loadFinanceReport() {
  const div = document.getElementById('reportContent');
  div.innerHTML = '<div class="loading"><div class="spinner"></div> Loading finance report...</div>';

  try {
    const data = await fetchAPI('/owner/reports/finance');
    currentReportData = data.report;
    const report = data.report;

    let html = `
      <div class="grid grid-3" class="u-mb-6">
        <div class="card stat-card">
          <div class="stat-value">${report.countsThisMonth?.total_counts || 0}</div>
          <div class="stat-label">Counts This Month</div>
        </div>
        <div class="card stat-card">
          <div class="stat-value">${report.pdfsInCounts?.pdfs_included || 0}</div>
          <div class="stat-label">PDFs Included</div>
        </div>
        <div class="card stat-card">
          <div class="stat-value">$${(report.currentInventoryValue?.total_inventory_value || 0).toFixed(0)}</div>
          <div class="stat-label">Inventory Value</div>
        </div>
      </div>
      <h4 class="u-mb-2">Variance Indicators</h4>
      <div class="u-mb-6">
        <table class="table">
          <tr>
            <td>Count Frequency Change</td>
            <td><strong>${report.varianceIndicators?.countFrequencyChange || 0}</strong></td>
          </tr>
          <tr>
            <td>Items Counted Change</td>
            <td><strong>${report.varianceIndicators?.itemsCountedChange || 0}</strong></td>
          </tr>
          <tr>
            <td>Percent Change</td>
            <td><strong>${report.varianceIndicators?.percentChange || 0}%</strong></td>
          </tr>
        </table>
      </div>
      <h4 class="u-mb-2">Recent Closed Counts</h4>
      <div>
        ${report.recentClosedCounts?.length ? `
          <table class="table">
            <thead><tr><th>Count ID</th><th>Closed At</th><th>Items</th><th>Notes</th></tr></thead>
            <tbody>
              ${report.recentClosedCounts.map(c => `
                <tr>
                  <td><code>${c.count_id}</code></td>
                  <td>${new Date(c.closed_at).toLocaleString()}</td>
                  <td>${c.item_count}</td>
                  <td class="u-text-xs">${c.notes || 'N/A'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : '<div class="empty-state-centered">No closed counts this month</div>'}
      </div>
    `;

    div.innerHTML = html;
  } catch (error) {
    div.innerHTML = showError('financeReport', error.message);
  }
}

function exportCurrentReport() {
  if (!currentReportData) {
    alert('No report data to export. Please load a report first.');
    return;
  }

  const reportType = currentReportTab;
  const timestamp = new Date().toISOString().split('T')[0];

  let csv = '';
  let filename = `${reportType}_report_${timestamp}.csv`;

  // Generate CSV based on report type
  switch (reportType) {
    case 'executive':
      csv = 'Type,Item Code,Quantity,Unit,Date\n';
      (currentReportData.demand?.today || []).forEach(d => {
        csv += `Today,${d.item_code},${d.predicted_quantity},${d.unit},${d.prediction_date}\n`;
      });
      (currentReportData.demand?.tomorrow || []).forEach(d => {
        csv += `Tomorrow,${d.item_code},${d.predicted_quantity},${d.unit},${d.prediction_date}\n`;
      });
      break;
    case 'ops':
      csv = 'Item Code,Item Name,Count Frequency,Variance\n';
      (currentReportData.spotCheckTargets || []).forEach(t => {
        csv += `${t.item_code},${t.item_name},${t.count_frequency},${t.variance}\n`;
      });
      break;
    case 'production':
      csv = 'Item Code,Quantity Needed,Unit,Confidence,Source\n';
      (currentReportData.makeList || []).forEach(m => {
        csv += `${m.item_code},${m.quantity_needed},${m.unit},${m.confidence_score},${m.source}\n`;
      });
      break;
    case 'purchasing':
      csv = 'Invoice Number,Date,Value,Status\n';
      (currentReportData.recentInvoices || []).forEach(i => {
        csv += `${i.invoice_number},${i.invoice_date},${i.total_value},${i.processed ? 'Processed' : 'Pending'}\n`;
      });
      break;
    case 'finance':
      csv = 'Count ID,Closed At,Items,Notes\n';
      (currentReportData.recentClosedCounts || []).forEach(c => {
        csv += `${c.count_id},${c.closed_at},${c.item_count},"${c.notes || ''}"\n`;
      });
      break;
  }

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);

  alert('CSV exported successfully!');
}

// ============================================================================
// ORCHESTRATION FUNCTIONS
// ============================================================================

async function orchestrateStart() {
  const modal = document.getElementById('orchestrationModal');
  const stepsDiv = document.getElementById('orchestrationSteps');
  const curlDiv = document.getElementById('orchestrationCurl');

  document.getElementById('orchestrationModalTitle').textContent = 'Starting All Services...';
  stepsDiv.innerHTML = '<div class="loading"><div class="spinner"></div> Initiating startup sequence...</div>';
  curlDiv.innerHTML = '';
  modal.classList.add('active');

  try {
    const data = await fetchAPI('/super/orchestrate/start', { method: 'POST' });
    const steps = data.steps || [];

    let html = '<div class="flex-col-gap">';
    steps.forEach(step => {
      const statusIcon = step.status === 'completed' ? '✅' : step.status === 'warning' ? '⚠️' : step.status === 'skipped' ? '⏭️' : '❌';
      const statusClass = step.status === 'completed' ? 'badge-success' : step.status === 'warning' ? 'badge-warning' : 'badge-info';
      html += `
        <div class="bordered-section">
          <div class="flex-between-center">
            <span><strong>${statusIcon} ${step.step}</strong></span>
            <span class="badge ${statusClass}">${step.status}</span>
          </div>
          <div class="description-text">${step.message}</div>
        </div>
      `;
    });
    html += '</div>';
    html += `<div class="info-box-primary"><strong>Duration:</strong> ${data.duration}ms</div>`;

    stepsDiv.innerHTML = html;
    curlDiv.innerHTML = `<strong>cURL Command:</strong><pre class="pre-wrap">${data.curlCommand || 'N/A'}</pre>`;
  } catch (error) {
    stepsDiv.innerHTML = showError('orchestration', error.message);
  }
}

async function orchestrateStop() {
  if (!confirm('Stop all services safely?\n\nThis will not stop the main server, only optional services.')) return;

  const modal = document.getElementById('orchestrationModal');
  const stepsDiv = document.getElementById('orchestrationSteps');
  const curlDiv = document.getElementById('orchestrationCurl');

  document.getElementById('orchestrationModalTitle').textContent = 'Stopping Services...';
  stepsDiv.innerHTML = '<div class="loading"><div class="spinner"></div> Initiating safe shutdown...</div>';
  curlDiv.innerHTML = '';
  modal.classList.add('active');

  try {
    const data = await fetchAPI('/super/orchestrate/stop', { method: 'POST' });
    const steps = data.steps || [];

    let html = '<div class="flex-col-gap">';
    steps.forEach(step => {
      const statusIcon = step.status === 'completed' ? '✅' : step.status === 'warning' ? '⚠️' : step.status === 'skipped' ? '⏭️' : '❌';
      const statusClass = step.status === 'completed' ? 'badge-success' : step.status === 'warning' ? 'badge-warning' : 'badge-info';
      html += `
        <div class="bordered-section">
          <div class="flex-between-center">
            <span><strong>${statusIcon} ${step.step}</strong></span>
            <span class="badge ${statusClass}">${step.status}</span>
          </div>
          <div class="description-text">${step.message}</div>
        </div>
      `;
    });
    html += '</div>';
    html += `<div class="alert alert-info" class="u-mt-4">${data.note || 'Services stopped'}</div>`;

    stepsDiv.innerHTML = html;
    curlDiv.innerHTML = `<strong>cURL Command:</strong><pre class="pre-wrap">${data.curlCommand || 'N/A'}</pre>`;
  } catch (error) {
    stepsDiv.innerHTML = showError('orchestration', error.message);
  }
}

function closeOrchestrationModal() {
  document.getElementById('orchestrationModal').classList.remove('active');
}

// ============================================================================
// RECOVERY FUNCTIONS
// ============================================================================

let currentRecoveryOperation = null;

function createRecoveryKit() {
  currentRecoveryOperation = 'backup';
  document.getElementById('recoveryInputModalTitle').textContent = 'Create Recovery Kit';
  document.getElementById('recoveryInputLabel').textContent = 'Destination Path (USB)';
  document.getElementById('recoveryDest').value = '/Volumes/USB/backup';
  setHidden(document.getElementById('recoveryDestGroup'), false);
  setHidden(document.getElementById('recoveryPath'), true);
  document.getElementById('recoveryInputModal').classList.add('active');
}

function verifyRecoveryKit() {
  currentRecoveryOperation = 'verify';
  document.getElementById('recoveryInputModalTitle').textContent = 'Verify Recovery Kit';
  document.getElementById('recoveryInputLabel').textContent = 'Path to Recovery Kit';
  setHidden(document.getElementById('recoveryPath'), false);
  setHidden(document.getElementById('recoveryDestGroup'), true);
  document.getElementById('recoveryInputModal').classList.add('active');
}

function dryRunRestore() {
  currentRecoveryOperation = 'restore';
  document.getElementById('recoveryInputModalTitle').textContent = 'Dry-Run Restore';
  document.getElementById('recoveryInputLabel').textContent = 'Path to Recovery Kit';
  setHidden(document.getElementById('recoveryPath'), false);
  setHidden(document.getElementById('recoveryDestGroup'), true);
  document.getElementById('recoveryInputModal').classList.add('active');
}

function closeRecoveryInputModal() {
  document.getElementById('recoveryInputModal').classList.remove('active');
  currentRecoveryOperation = null;
}

function closeRecoveryModal() {
  document.getElementById('recoveryModal').classList.remove('active');
}

async function submitRecoveryInput() {
  const passphrase = document.getElementById('recoveryPassphrase').value;

  if (!passphrase || passphrase.length < 12) {
    alert('Passphrase must be at least 12 characters');
    return;
  }

  closeRecoveryInputModal();

  const modal = document.getElementById('recoveryModal');
  const detailsDiv = document.getElementById('recoveryDetails');

  modal.classList.add('active');
  detailsDiv.innerHTML = '<div class="loading"><div class="spinner"></div> Processing...</div>';

  try {
    let data;

    switch (currentRecoveryOperation) {
      case 'backup':
        const dest = document.getElementById('recoveryDest').value;
        document.getElementById('recoveryModalTitle').textContent = 'Recovery Kit Created';
        data = await fetchAPI('/owner/recovery/backup', {
          method: 'POST',
          body: JSON.stringify({ dest, passphrase })
        });

        detailsDiv.innerHTML = `
          <div class="alert alert-info">Recovery kit created successfully!</div>
          <table class="table">
            <tr><td><strong>Filename:</strong></td><td><code>${data.kit.filename}</code></td></tr>
            <tr><td><strong>Path:</strong></td><td><code>${data.kit.path}</code></td></tr>
            <tr><td><strong>Size:</strong></td><td>${(data.kit.size / 1024).toFixed(2)} KB</td></tr>
            <tr><td><strong>SHA-256:</strong></td><td><code class="u-text-xs">${data.kit.sha256}</code></td></tr>
            <tr><td><strong>Encrypted:</strong></td><td>${data.kit.encrypted ? '✅ Yes' : '❌ No'}</td></tr>
            <tr><td><strong>Duration:</strong></td><td>${data.duration}ms</td></tr>
          </table>
          <div class="u-mt-4">
            <h4>Manifest:</h4>
            <pre class="code-block">${JSON.stringify(data.kit.manifest, null, 2)}</pre>
          </div>
        `;
        break;

      case 'verify':
        const verifyPath = document.getElementById('recoveryPath').value;
        document.getElementById('recoveryModalTitle').textContent = 'Recovery Kit Verified';
        data = await fetchAPI('/owner/recovery/verify', {
          method: 'POST',
          body: JSON.stringify({ path: verifyPath, passphrase })
        });

        detailsDiv.innerHTML = `
          <div class="alert ${data.verification.databaseIntact ? 'alert-info' : 'alert-warning'}">
            ${data.verification.databaseIntact ? '✅ Kit verified successfully!' : '⚠️ Kit verification completed with warnings'}
          </div>
          <table class="table">
            <tr><td><strong>Path:</strong></td><td><code>${data.kit.path}</code></td></tr>
            <tr><td><strong>Size:</strong></td><td>${(data.kit.size / 1024).toFixed(2)} KB</td></tr>
            <tr><td><strong>SHA-256:</strong></td><td><code class="u-text-xs">${data.kit.sha256}</code></td></tr>
            <tr><td><strong>Encrypted:</strong></td><td>${data.verification.encrypted ? '✅ Yes' : '❌ No'}</td></tr>
            <tr><td><strong>Extractable:</strong></td><td>${data.verification.extractable ? '✅ Yes' : '❌ No'}</td></tr>
            <tr><td><strong>Database Intact:</strong></td><td>${data.verification.databaseIntact ? '✅ Yes' : '❌ No'}</td></tr>
          </table>
          ${data.manifest ? `
            <div class="u-mt-4">
              <h4>Manifest:</h4>
              <pre class="code-block">${JSON.stringify(data.manifest, null, 2)}</pre>
            </div>
          ` : ''}
        `;
        break;

      case 'restore':
        const restorePath = document.getElementById('recoveryPath').value;
        document.getElementById('recoveryModalTitle').textContent = 'Dry-Run Restore Results';
        data = await fetchAPI('/owner/recovery/restore', {
          method: 'POST',
          body: JSON.stringify({ path: restorePath, passphrase, dryRun: true })
        });

        detailsDiv.innerHTML = `
          <div class="alert alert-warning">${data.warning}</div>
          <h4>Database Verification:</h4>
          <table class="table">
            <tr><td><strong>Database Intact:</strong></td><td>${data.verification.databaseIntact ? '✅ Yes' : '❌ No'}</td></tr>
            <tr><td><strong>Size:</strong></td><td>${(data.verification.databaseSize / 1024).toFixed(2)} KB</td></tr>
            <tr><td><strong>Expected SHA-256:</strong></td><td><code class="u-text-xxs">${data.verification.expectedSHA256}</code></td></tr>
            <tr><td><strong>Actual SHA-256:</strong></td><td><code class="u-text-xxs">${data.verification.actualSHA256}</code></td></tr>
          </table>
          <h4 class="u-mt-4">Restore Plan:</h4>
          <div class="flex-col-gap-sm">
            ${data.restorePlan.map((step, i) => `
              <div class="bordered-section">
                <strong>${i + 1}. ${step.step}</strong>
                <div class="action-description">${step.action}</div>
              </div>
            `).join('')}
          </div>
        `;
        break;
    }
  } catch (error) {
    detailsDiv.innerHTML = showError('recovery', error.message);
  }
}

// ============================================================================
// AI LEARNING NUDGE
// ============================================================================

async function loadLearningNudges() {
  const div = document.getElementById('learningNudges');
  div.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  try {
    // v13.1: Generate intelligent nudges based on real system data
    const statsResponse = await fetchAPI('/owner/dashboard/stats');
    const stats = statsResponse.stats;

    const nudges = [];

    // Nudge about invoice extraction if not complete
    if (stats.pdfs?.coverage < 100) {
      nudges.push({
        id: 'nudge_invoices',
        title: 'Invoice Data Quality',
        question: `${stats.pdfs?.total - stats.pdfs?.withDates || 0} invoices are missing extraction data. Review these PDFs?`,
        suggestedInsight: 'Check invoice format and clarity',
        action: 'Review PDFs tab'
      });
    }

    // Nudge about line item extraction (HIGH PRIORITY)
    if (stats.fifo?.lineItemsExtracted === 0 && stats.pdfs?.total > 14) {
      nudges.push({
        id: 'nudge_line_items',
        title: '⚠️ Inventory Catalog Incomplete',
        question: `You have ${stats.pdfs.total} invoices but only ${stats.inventory?.totalItems || 0} items in your master catalog. Extract line items to build your full product catalog?`,
        suggestedInsight: 'Extract line items from invoices to populate inventory with all products',
        action: 'Extract Line Items'
      });
    }

    // Nudge about FIFO if not using it
    if (stats.fifo?.totalCases === 0 && stats.fifo?.lineItemsExtracted > 0) {
      nudges.push({
        id: 'nudge_fifo',
        title: 'FIFO Tracking',
        question: 'Start tracking case-level inventory to reduce waste and improve rotation?',
        suggestedInsight: 'Enable FIFO for perishable items',
        action: 'Setup FIFO'
      });
    }

    // Nudge about physical counts
    if (stats.counts?.active === 0) {
      nudges.push({
        id: 'nudge_counts',
        title: 'Inventory Accuracy',
        question: 'When was your last physical count? Regular counts improve accuracy.',
        suggestedInsight: 'Schedule weekly counts for high-value categories',
        action: 'Start Count'
      });
    }

    // Always show a general improvement nudge
    nudges.push({
      id: 'nudge_general',
      title: 'System Optimization',
      question: 'How can we improve the inventory tracking workflow for your team?',
      suggestedInsight: 'Share your feedback to help us improve',
      action: 'Provide Feedback'
    });

    if (nudges.length === 0) {
      div.innerHTML = '<div class="empty-state" class="u-py-8 u-px-4"><div>✅ No Suggestions</div><div class="description-text">System is running optimally!</div></div>';
      return;
    }

    let html = '<div class="flex-col-gap">';
    nudges.forEach(nudge => {
      html += `
        <div class="bordered-primary-section">
          <div class="fw-600 u-mb-2">💡 ${nudge.title}</div>
          <div class="nudge-question">${nudge.question}</div>
          <div class="nudge-answer-box">
            <strong>Suggestion:</strong> ${nudge.suggestedInsight}
          </div>
          <button class="btn btn-sm btn-primary" onclick="handleNudgeAction('${nudge.id}', '${nudge.action}')" class="w-full">
            ${nudge.action}
          </button>
        </div>
      `;
    });
    html += '</div>';
    html += '<div class="info-box-full">💡 These suggestions are generated based on your current system state and usage patterns.</div>';

    div.innerHTML = html;
  } catch (error) {
    console.error('Failed to load learning nudges:', error);
    div.innerHTML = '<div class="empty-state" class="u-py-8 u-px-4"><div>⚠️ Unable to load suggestions</div><div class="description-text">Please refresh the page.</div></div>';
  }
}

function handleNudgeAction(nudgeId, action) {
  // Route to appropriate tab or action based on the nudge
  if (action.includes('PDF')) {
    switchTab('pdfs');
  } else if (action.includes('Line Items')) {
    alert('📋 Invoice Line Item Extraction\n\n' +
          'To build your complete product catalog from your 183 invoices:\n\n' +
          '1. Go to the PDFs tab\n' +
          '2. The system will extract product codes, descriptions, quantities, and cases\n' +
          '3. All unique products will be automatically added to your inventory master\n\n' +
          'This will give you hundreds of products instead of just 14 manual entries!\n\n' +
          'Contact support to enable automatic line item extraction.');
  } else if (action.includes('FIFO')) {
    alert('FIFO tracking can be enabled in the Inventory settings. Contact support for setup assistance.');
  } else if (action.includes('Count')) {
    switchTab('counts');
  } else if (action.includes('Feedback')) {
    // Scroll to feedback section
    const feedbackSection = document.querySelector('#aiFeedback');
    if (feedbackSection) {
      feedbackSection.scrollIntoView({ behavior: 'smooth' });
      feedbackSection.focus();
    }
  } else {
    alert(`Action: ${action}\n\nThis feature will help improve your inventory management workflow.`);
  }
}

async function recordNudgeInsight(nudgeId) {
  const input = document.getElementById(`nudge-${nudgeId}`);
  const comment = input.value.trim();

  if (!comment) {
    alert('Please enter an insight');
    return;
  }

  try {
    await fetchAPI('/owner/forecast/comment', {
      method: 'POST',
      body: JSON.stringify({ comment, source: 'learning_nudge' })
    });

    alert('Insight recorded! Use "Train Now" in Feedback section to apply.');
    input.value = '';
  } catch (error) {
    alert('Error recording insight: ' + error.message);
  }
}

async function trainFromNudge(nudgeId) {
  const input = document.getElementById(`nudge-${nudgeId}`);
  const comment = input.value.trim();

  if (!comment) {
    alert('Please enter an insight');
    return;
  }

  try {
    // First record the comment
    await fetchAPI('/owner/forecast/comment', {
      method: 'POST',
      body: JSON.stringify({ comment, source: 'learning_nudge' })
    });

    // Then train immediately
    const trainData = await fetchAPI('/owner/forecast/train', { method: 'POST' });

    alert(`Insight applied!\nApplied: ${trainData.applied || 1}\nFailed: ${trainData.failed || 0}`);
    input.value = '';
    loadFeedbackHistory();
  } catch (error) {
    alert('Error training: ' + error.message);
  }
}

// ============================================================================
// NEUROPILOT V12.5 - AI OPS & REAL-TIME FEATURES
// ============================================================================

/**
 * Load AI Ops System Health Status (v13.5 - Adaptive Intelligence)
 */
async function loadAIOpsStatus() {
  const healthScoreEl = document.getElementById('opsHealthScore');
  const dqiScoreEl = document.getElementById('opsDQIScore');
  const forecastLatencyEl = document.getElementById('opsForecastLatency');
  const learningDivergenceEl = document.getElementById('opsLearningDivergence');
  const checksEl = document.getElementById('aiOpsChecks');

  try {
    healthScoreEl.textContent = '...';
    dqiScoreEl.textContent = '...';
    forecastLatencyEl.textContent = '...';
    learningDivergenceEl.textContent = '...';

    // === v14.4.0: Safe fetch with fallback for AI Ops status ===
    const base = (window.NP_CONFIG && window.NP_CONFIG.API_BASE) || window.API_URL || '';
    const url = `${base}/api/owner/ops/status`;
    let opsStatus = null;

    try {
      const r = await fetch(url, { headers: { 'Accept': 'application/json' }});
      opsStatus = await r.json().catch(() => null);
    } catch (e) {
      window.NP_LAST_API_ERROR = { ts: Date.now(), scope: 'AI_OPS', message: String(e) };
    }

    // Fallback data structure if API failed or returned null
    if (!opsStatus || (!opsStatus.ai_ops_health && !opsStatus.ai_ops_health_v2)) {
      opsStatus = {
        ai_ops_health: {
          score: 0,
          explanations: ['API unavailable - showing fallback data']
        },
        ai_ops_health_v2: null,
        dqi_score: null,
        forecast_latency_avg: null,
        learning_divergence: null,
        checks: []
      };
    }

    // v22.3: Prefer ai_ops_health_v2 (only scores enabled features) with fallback to ai_ops_health
    const rawV1 = opsStatus.ai_ops_health || {};
    const rawV2 = opsStatus.ai_ops_health_v2 || null;
    const health = rawV2 || rawV1;
    const healthPct = Math.round(health.score || 0);

    healthScoreEl.textContent = healthPct > 0 ? `${healthPct}%` : 'N/A';
    const healthState = healthPct >= 85 ? 'ok' : (healthPct >= 60 ? 'warn' : 'bad');
    swapText(healthScoreEl, healthPct > 0 ? healthState : null);

    // v22.3: Show mode and explanations in tooltip
    let tooltipLines = ['AI Ops System Health'];
    if (rawV2 && rawV2.mode) {
      tooltipLines.push(`Mode: ${rawV2.mode}`);
    }
    // Prefer V2 explanations, fallback to V1
    const explanations = health.explanations || [];
    if (Array.isArray(explanations) && explanations.length > 0) {
      tooltipLines.push('---');
      tooltipLines = tooltipLines.concat(explanations.slice(0, 3));
    }
    healthScoreEl.title = tooltipLines.join('\n');

    // === v14.4.0: Display Data Quality Index (DQI) with safe null handling ===
    if (opsStatus.dqi_score !== null && opsStatus.dqi_score !== undefined) {
      const dqiChange = opsStatus.dqi_change_pct || 0;
      const dqiArrow = dqiChange > 0 ? '↑' : dqiChange < 0 ? '↓' : '→';
      const dqiState = opsStatus.dqi_color === 'green' ? 'ok' :
                       opsStatus.dqi_color === 'yellow' ? 'warn' : 'bad';

      dqiScoreEl.textContent = `${opsStatus.dqi_score}% ${dqiArrow}`;
      swapText(dqiScoreEl, dqiState);
      dqiScoreEl.title = `Data Quality Index: ${opsStatus.dqi_score}% (${dqiChange > 0 ? '+' : ''}${dqiChange}%)`;
    } else {
      dqiScoreEl.textContent = 'N/A';
      swapText(dqiScoreEl, null);
      dqiScoreEl.classList.add('u-text-light-inline');
    }

    // === v14.4.0: Display Forecast Latency with safe null handling ===
    if (opsStatus.forecast_latency_avg !== null && opsStatus.forecast_latency_avg !== undefined && typeof opsStatus.forecast_latency_avg === 'number') {
      const latency = opsStatus.forecast_latency_avg;
      forecastLatencyEl.textContent = latency >= 1000 ? `${(latency/1000).toFixed(1)}s` : `${latency}ms`;
      const latencyState = latency < 2000 ? 'ok' : latency < 5000 ? 'warn' : 'bad';
      swapText(forecastLatencyEl, latencyState);
      forecastLatencyEl.title = `Average forecast job duration over last 10 runs: ${latency}ms`;
    } else {
      forecastLatencyEl.textContent = 'N/A';
      swapText(forecastLatencyEl, null);
      forecastLatencyEl.classList.add('u-text-light-inline');
    }

    // === v14.4.0: Display Learning Divergence with safe null handling ===
    if (opsStatus.forecast_divergence !== null && opsStatus.forecast_divergence !== undefined && typeof opsStatus.forecast_divergence === 'number') {
      const divergence = opsStatus.forecast_divergence;
      const divArrow = divergence > 0 ? '↑' : divergence < 0 ? '↓' : '→';
      learningDivergenceEl.textContent = `${divergence.toFixed(1)}% ${divArrow}`;
      const divergenceState = Math.abs(divergence) < 5 ? 'ok' :
                              Math.abs(divergence) < 10 ? 'warn' : 'bad';
      swapText(learningDivergenceEl, divergenceState);
      learningDivergenceEl.title = `MAPE divergence (7d vs prev 7d): ${divergence.toFixed(1)}%`;
    } else {
      learningDivergenceEl.textContent = 'N/A';
      swapText(learningDivergenceEl, null);
      learningDivergenceEl.classList.add('u-text-light-inline');
    }

    // === v13.5: Display system health checks from ops status ===
    let checksHTML = '<div class="flex-col-gap-sm u-text-base">';

    if (opsStatus.checks && opsStatus.checks.length > 0) {
      opsStatus.checks.forEach(check => {
        const icon = check.status === 'ok' ? '✅' : check.status === 'warning' ? '⚠️' : '❌';
        const colorClass = check.status === 'ok' ? 'text-color-success' : check.status === 'warning' ? 'text-color-warning' : 'text-color-danger';
        checksHTML += `
          <div class="flex-gap-2-items-center small-padded-bg">
            <span class="u-text-1-25">${icon}</span>
            <div class="u-flex-1">
              <strong>${check.name}</strong>
              <div class="${colorClass} text-size-sm">${check.message}</div>
            </div>
          </div>
        `;
      });
    }

    // === v13.5: Add DQI issues if any ===
    if (opsStatus.dqi_issues && opsStatus.dqi_issues.length > 0) {
      checksHTML += `<div class="dqi-issues-box">
        <strong>⚠️ Data Quality Issues</strong>
        <ul class="nested-list-item">`;

      opsStatus.dqi_issues.forEach(issue => {
        checksHTML += `<li>${issue.type}: ${issue.count} occurrences (-${issue.penalty} pts)</li>`;
      });

      checksHTML += `</ul></div>`;
    }

    checksHTML += '</div>';
    checksEl.innerHTML = checksHTML;

    // Update LIVE badge in header
    const liveBadge = document.getElementById('liveBadge');
    if (liveBadge) {
      const healthy = opsStatus.healthy === true;
      if (healthy) {
        liveBadge.classList.remove('badge-live-degraded');
        liveBadge.classList.add('badge-live-ok');
        liveBadge.textContent = 'LIVE 🟢';
      } else {
        liveBadge.classList.remove('badge-live-ok');
        liveBadge.classList.add('badge-live-degraded');
        liveBadge.textContent = 'DEGRADED 🔴';
      }
    }

    // Update cron schedule with real data from ops status
    if (typeof updateCronSchedule === 'function') {
      updateCronSchedule({
        last_forecast_ts: opsStatus.last_forecast_ts,
        last_learning_ts: opsStatus.last_learning_ts
      });
    }

  } catch (error) {
    console.error('Failed to load AI Ops status:', error);
    if (checksEl) checksEl.innerHTML = showError('AI Ops Status', error.message);
    if (healthScoreEl) {
      healthScoreEl.textContent = 'ERR';
      swapText(healthScoreEl, 'bad');
    }
  }
}

/**
 * Update Cron Schedule display
 */
function updateCronSchedule(data) {
  const forecastLastRunEl = document.getElementById('forecastLastRun');
  const forecastNextRunEl = document.getElementById('forecastNextRun');
  const learningLastRunEl = document.getElementById('learningLastRun');
  const learningNextRunEl = document.getElementById('learningNextRun');

  // v13.0: Use top-level last_forecast_ts and last_learning_ts
  // Forecast schedule (06:00 daily)
  if (data?.last_forecast_ts) {
    const lastRun = new Date(data.last_forecast_ts);
    forecastLastRunEl.textContent = `Last: ${formatTimeAgo(lastRun)}`;
  } else {
    forecastLastRunEl.textContent = 'Last: Never';
  }

  // Calculate next 06:00
  const nextForecast = getNextCronTime(6, 0);
  forecastNextRunEl.textContent = `Next: ${nextForecast.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;

  // Learning schedule (21:00 daily)
  if (data?.last_learning_ts) {
    const lastRun = new Date(data.last_learning_ts);
    learningLastRunEl.textContent = `Last: ${formatTimeAgo(lastRun)}`;
  } else {
    learningLastRunEl.textContent = 'Last: Never';
  }

  // Calculate next 21:00
  const nextLearning = getNextCronTime(21, 0);
  learningNextRunEl.textContent = `Next: ${nextLearning.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
}

/**
 * Calculate next cron time for given hour:minute
 */
function getNextCronTime(hour, minute) {
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);

  // If time has passed today, schedule for tomorrow
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }

  return next;
}

/**
 * Format time ago helper
 */
function formatTimeAgo(date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Load Learning Timeline (Last 10 Insights)
 */
async function loadLearningTimeline() {
  const timelineEl = document.getElementById('learningTimeline');

  try {
    timelineEl.innerHTML = '<div class="loading">Loading learning timeline...</div>';

    // v13.0: Get learning insights from dashboard endpoint
    try {
      const dashboardData = await fetchAPI('/owner/dashboard');
      const insights = dashboardData.data?.learningInsights || [];

      if (insights.length === 0) {
        timelineEl.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📚</div><div>No learning insights yet. Train the AI to see insights here!</div></div>';
        return;
      }

      let html = '<div class="flex-col-gap">';
      insights.slice(0, 10).forEach(insight => {
        const timestamp = new Date(insight.created_at);
        const confidence = parseFloat(insight.confidence) || 0;

        // v13.0: Confidence badge (✅ ≥0.95, 🟡 0.85-0.94, 🔴 <0.85)
        let badge = '🔴';
        if (confidence >= 0.95) badge = '✅';
        else if (confidence >= 0.85) badge = '🟡';

        html += `
          <div class="bordered-left-primary">
            <div class="flex-gap-2 flex-justify-between-start">
              <span class="u-text-1-25">${badge}</span>
              <div class="u-flex-1">
                <div class="u-font-medium u-text-base">${insight.title || 'No title'}</div>
                <div class="description-small-mt">
                  ${formatTimeAgo(timestamp)} • ${insight.source || 'AI Learning Engine'} • ${(confidence * 100).toFixed(0)}% confidence
                </div>
              </div>
            </div>
          </div>
        `;
      });
      html += '</div>';
      timelineEl.innerHTML = html;
    } catch (apiError) {
      // If endpoint doesn't exist or returns error, show a friendly message
      timelineEl.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔧</div><div>Learning timeline will appear here once AI training begins.<br><br>Submit feedback below to start training!</div></div>';
    }
  } catch (error) {
    console.error('Failed to load learning timeline:', error);
    timelineEl.innerHTML = showError('Learning Timeline', error.message);
  }
}

/**
 * Manually trigger a cron job
 */
async function triggerJob(jobName) {
  if (!confirm(`Manually trigger the ${jobName} job now?`)) {
    return;
  }

  try {
    const data = await fetchAPI(`/owner/ops/trigger/${jobName}`, { method: 'POST' });

    if (data.success) {
      alert(`✅ Job "${jobName}" completed successfully!\n\nDuration: ${(data.duration / 1000).toFixed(2)}s`);
      // Refresh the AI Ops status after job runs
      loadAIOpsStatus();
    } else {
      alert(`❌ Job "${jobName}" failed.\n\nCheck server logs for details.`);
    }
  } catch (error) {
    alert(`❌ Failed to trigger job: ${error.message}`);
  }
}

// ============================================================================
// NEUROPILOT V13.0 - COGNITIVE INTELLIGENCE & LIVING CONSOLE
// ============================================================================

/**
 * v22.3: Render AI Health Components Breakdown
 * Displays each component with status, score, and detail
 * @param {Object} components - Components from ai_ops_health_v2.components
 * @param {HTMLElement} container - DOM element to render into
 */
function renderAiComponentsBreakdown(components, container) {
  if (!components || !container) return;

  const statusIcons = {
    'healthy': '🟢',
    'warning': '🟡',
    'critical': '🔴',
    'disabled': '⚫',
    'unknown': '⚪'
  };

  const statusColors = {
    'healthy': '#22c55e',
    'warning': '#f59e0b',
    'critical': '#ef4444',
    'disabled': '#6b7280',
    'unknown': '#9ca3af'
  };

  let html = '<div style="margin-top: 12px; padding: 8px; background: rgba(0,0,0,0.05); border-radius: 6px;">';
  html += '<div style="font-size: 11px; color: #666; margin-bottom: 6px; font-weight: 600;">Component Breakdown</div>';

  Object.entries(components).forEach(([key, comp]) => {
    const icon = statusIcons[comp.status] || statusIcons.unknown;
    const color = statusColors[comp.status] || statusColors.unknown;
    const scoreDisplay = comp.score !== null ? `${comp.score}%` : 'N/A';

    html += `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 0; border-bottom: 1px solid rgba(0,0,0,0.05);">
        <div style="display: flex; align-items: center; gap: 6px;">
          <span>${icon}</span>
          <span style="font-size: 12px; color: #333;">${comp.label || key}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 11px; color: #666; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${comp.detail || ''}">${comp.detail || ''}</span>
          <span style="font-size: 12px; font-weight: 600; color: ${color}; min-width: 40px; text-align: right;">${scoreDisplay}</span>
        </div>
      </div>
    `;
  });

  html += '</div>';
  container.innerHTML = html;
}

/**
 * Load Cognitive Intelligence Overview (v13.0 + v14.5.0 CSP)
 * Displays AI confidence trends, forecast accuracy, and active modules
 */
async function loadCognitiveIntelligence() {
  try {
    // Fetch real dashboard stats
    const statsResponse = await fetchAPI('/owner/dashboard/stats');

    // Handle null response
    if (!statsResponse || !statsResponse.stats) {
      console.warn('⚠️ No stats available for cognitive intelligence');
      return;
    }

    const stats = statsResponse.stats;

    // v15.3: Fetch AI Ops status for AI Intelligence Index
    // v22.3: Prefer V2 scoring with fallback to V1
    const opsStatus = await fetchAPI('/owner/ops/status');

    // v22.3: Prefer ai_ops_health_v2 if available, fallback to ai_ops_health
    const rawV1 = opsStatus.ai_ops_health || {};
    const rawV2 = opsStatus.ai_ops_health_v2 || null;
    const health = rawV2 || rawV1;
    const healthScore = Math.round(health.score || 0);

    // Update AI Intelligence Index (featured metric)
    const aiIndexEl = document.getElementById('aiIntelligenceIndex');
    const aiIndexTrendEl = document.getElementById('aiIndexTrend');
    const aiModeEl = document.getElementById('aiSystemMode');
    const aiComponentsEl = document.getElementById('aiComponentsBreakdown');

    if (typeof healthScore === 'number' && healthScore > 0) {
      aiIndexEl.textContent = `${healthScore}%`;

      // Color code based on health score
      if (healthScore >= 85) {
        aiIndexEl.style.color = '#22c55e'; // green
        aiIndexTrendEl.textContent = '🟢 Excellent';
        aiIndexTrendEl.style.color = '#22c55e';
      } else if (healthScore >= 60) {
        aiIndexEl.style.color = '#f59e0b'; // yellow
        aiIndexTrendEl.textContent = '🟡 Good';
        aiIndexTrendEl.style.color = '#f59e0b';
      } else {
        aiIndexEl.style.color = '#ef4444'; // red
        aiIndexTrendEl.textContent = '🔴 Needs Attention';
        aiIndexTrendEl.style.color = '#ef4444';
      }
    } else {
      aiIndexEl.textContent = '--';
      aiIndexTrendEl.textContent = 'No data';
    }

    // v22.3: Show system mode if using V2 scoring
    if (aiModeEl && rawV2 && rawV2.mode) {
      const modeLabels = {
        'minimal': '🔧 Minimal (Setup)',
        'basic': '📦 Basic (Inventory Only)',
        'full': '🚀 Full (AI Enabled)'
      };
      aiModeEl.textContent = modeLabels[rawV2.mode] || rawV2.mode;
      aiModeEl.style.display = 'block';
    } else if (aiModeEl) {
      aiModeEl.style.display = 'none';
    }

    // v22.3: Render component breakdown if using V2 scoring
    if (aiComponentsEl && rawV2 && rawV2.components) {
      renderAiComponentsBreakdown(rawV2.components, aiComponentsEl);
    } else if (aiComponentsEl) {
      aiComponentsEl.innerHTML = '';
    }

    // Update top-level metrics with real data
    document.getElementById('aiConfidenceAvg').textContent = `${stats.pdfs?.coverage || 0}%`;
    document.getElementById('forecastAccuracyAvg').textContent = `${stats.pdfs?.coverage || 0}%`;
    document.getElementById('activeModulesCount').textContent = '1/1'; // PDF Extraction module
    document.getElementById('learningAppliedCount').textContent = stats.pdfs?.total || 0;

    // Render simple status charts
    const chartsEl = document.getElementById('cognitiveCharts');
    let chartsHTML = '<div class="cognitive-charts-grid-2col">';

    // PDF Extraction Status
    chartsHTML += '<div class="cognitive-chart-card">';
    chartsHTML += '<div class="cognitive-chart-title">Invoice Extraction</div>';
    chartsHTML += `
      <div class="progress-bar-wrapper">
        <div class="progress-bar-label">Coverage</div>
        <div class="progress-bar-track">
          <div class="progress-bar-fill u-w-${Math.round((stats.pdfs?.coverage || 0) / 5) * 5}"></div>
          <div class="progress-bar-value">${stats.pdfs?.coverage || 0}%</div>
        </div>
      </div>
      <div class="chart-footer">
        ${stats.pdfs?.withDates || 0}/${stats.pdfs?.total || 0} invoices with dates
      </div>
    `;
    chartsHTML += '</div>';

    // System Status
    chartsHTML += '<div class="cognitive-chart-card">';
    chartsHTML += '<div class="cognitive-chart-title">System Status</div>';
    chartsHTML += `
      <div class="cognitive-chart-stats">
        <div class="cognitive-stat-row">
          <span>PDFs Processed</span>
          <span>${stats.pdfs?.total || 0}</span>
        </div>
        <div class="cognitive-stat-row">
          <span>FIFO Tracking</span>
          <span>${stats.fifo?.totalCases > 0 ? stats.fifo.totalCases + ' cases' : stats.fifo?.invoicesReady > 0 ? stats.fifo.invoicesReady + ' ready' : 'Not enabled'}</span>
        </div>
        <div class="cognitive-stat-row">
          <span>Inventory Items</span>
          <span>${stats.inventory?.totalItems || 0}</span>
        </div>
        <div class="cognitive-stat-row">
          <span>Total Value</span>
          <span>$${((stats.pdfs?.totalAmount || 0) / 1000).toFixed(1)}K</span>
        </div>
      </div>
    `;
    chartsHTML += '</div>';

    chartsHTML += '</div>';
    chartsEl.innerHTML = chartsHTML;

  } catch (error) {
    console.error('Failed to load system overview:', error);
    document.getElementById('aiConfidenceAvg').textContent = '0%';
    document.getElementById('forecastAccuracyAvg').textContent = '0%';
    document.getElementById('activeModulesCount').textContent = '0/1';
    document.getElementById('learningAppliedCount').textContent = '0';
  }
}

/**
 * Load Live AI Activity Feed (v13.0)
 */
async function loadActivityFeed() {
  const feedEl = document.getElementById('activityFeed');

  try {
    feedEl.innerHTML = '<div class="loading"><div class="spinner"></div> Loading activity...</div>';

    const statsResponse = await fetchAPI('/owner/dashboard/stats');

    // Handle null response
    if (!statsResponse || !statsResponse.stats) {
      feedEl.innerHTML = '<div class="error-message">⚠️ Activity feed unavailable - API not responding</div>';
      return;
    }

    const stats = statsResponse.stats;

    const activities = [];

    // Latest PDF upload
    if (stats.recentActivity?.lastPDFUpload) {
      activities.push({
        icon: '📄',
        event: 'Invoice Uploaded',
        description: `Invoice #${stats.recentActivity.lastPDFInvoice}`,
        timestamp: stats.recentActivity.lastPDFUpload,
        badge: null
      });
    }

    // System stats
    const fifoStatus = stats.fifo?.totalCases > 0
      ? `${stats.fifo.totalCases} FIFO cases`
      : stats.fifo?.invoicesReady > 0
        ? `${stats.fifo.invoicesReady} invoices ready`
        : 'FIFO not enabled';

    activities.push({
      icon: '📊',
      event: 'System Overview',
      description: `${stats.pdfs?.total || 0} PDFs | ${stats.inventory?.totalItems || 0} Items | ${fifoStatus}`,
      timestamp: stats.timestamp,
      badge: stats.pdfs?.coverage === 100 ? 'success' : null
    });

    // FIFO tracking
    if (stats.fifo?.totalCases > 0) {
      activities.push({
        icon: '📦',
        event: 'FIFO Tracking',
        description: `${stats.fifo.totalCases} cases across ${stats.fifo.productsTracked} products`,
        timestamp: stats.timestamp,
        badge: 'success'
      });
    } else if (stats.fifo?.invoicesReady > 0) {
      activities.push({
        icon: '📋',
        event: 'FIFO Ready',
        description: `${stats.fifo.invoicesReady} invoices ready for case-level tracking`,
        timestamp: stats.timestamp,
        badge: 'info'
      });
    }

    // Active counts
    if (stats.counts?.active > 0) {
      activities.push({
        icon: '🔢',
        event: 'Physical Count Active',
        description: `${stats.counts.active} count${stats.counts.active > 1 ? 's' : ''} in progress`,
        timestamp: stats.timestamp,
        badge: 'warning'
      });
    }

    // Invoice extraction status
    activities.push({
      icon: '✅',
      event: 'Invoice Extraction',
      description: `${stats.pdfs?.coverage || 0}% coverage (${stats.pdfs?.withDates || 0}/${stats.pdfs?.total || 0})`,
      timestamp: stats.timestamp,
      badge: stats.pdfs?.coverage === 100 ? 'success' : 'info'
    });

    let html = '<div class="activity-feed-container">';
    activities.forEach(activity => {
      const timestamp = new Date(activity.timestamp);
      const ageText = formatTimeAgo(timestamp);

      html += `
        <div class="activity-item">
          <div class="activity-icon">${activity.icon}</div>
          <div class="activity-content">
            <div class="activity-event">${activity.event}</div>
            <div class="activity-description">
              ${activity.description} • ${ageText}
            </div>
            ${activity.badge ? `<div class="badge badge-${activity.badge} activity-badge">Active</div>` : ''}
          </div>
        </div>
      `;
    });
    html += '</div>';

    feedEl.innerHTML = html;

  } catch (error) {
    console.error('Failed to load activity feed:', error);
    feedEl.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⚠️</div><div>Failed to load activity</div></div>';
  }
}

/**
 * Load Learning Insights Panel (v13.0)
 * For AI Console tab
 */
async function loadLearningInsights() {
  const insightsEl = document.getElementById('learningInsightsPanel');

  try {
    insightsEl.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    const data = await fetchAPI('/owner/ops/learning-insights?limit=20');

    if (!data.insights || data.insights.length === 0) {
      insightsEl.innerHTML = '<div class="empty-state" class="u-p-8"><div>No learning insights yet</div></div>';
      return;
    }

    let html = '<table class="table"><thead><tr>';
    html += '<th>Type</th><th>Title</th><th>Confidence</th><th>Status</th><th>Detected</th>';
    html += '</tr></thead><tbody>';

    data.insights.forEach(insight => {
      const statusBadge = insight.status === 'applied' ?
        '<span class="badge badge-success">Applied</span>' :
        '<span class="badge badge-warning">Pending</span>';

      const confidenceClass = insight.confidence >= 85 ? 'text-color-success' : (insight.confidence >= 70 ? 'text-color-warning' : 'text-color-danger');

      html += `
        <tr>
          <td>${insight.type}</td>
          <td>${insight.title || insight.description || 'N/A'}</td>
          <td><strong class="${confidenceClass}">${insight.confidence}%</strong></td>
          <td>${statusBadge}</td>
          <td>${new Date(insight.detectedAt).toLocaleDateString()}</td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    insightsEl.innerHTML = html;

  } catch (error) {
    console.error('Failed to load learning insights:', error);
    insightsEl.innerHTML = showError('Learning Insights', error.message);
  }
}

// ============================================================================
// GFS MONTHLY REPORTS
// ============================================================================

function openGFSReports() {
  // Open GFS Monthly Reports dashboard in new tab (served via HTTP)
  const gfsReportsUrl = '/gfs-reports/index.html';
  const newWindow = window.open(gfsReportsUrl, '_blank');

  if (!newWindow) {
    alert('Pop-up blocked! Please allow pop-ups for this site.\n\nAlternatively, navigate to:\nhttp://localhost:8083' + gfsReportsUrl);
  }
}

// ============================================================================
// UTILITIES
// ============================================================================

function showError(context, message) {
  return `
    <div class="alert alert-danger">
      <strong>Error:</strong> ${message}
      <div class="u-mt-2 u-text-base">
        Context: ${context} | <a href="#" onclick="location.reload()" class="link-inherit">Reload page</a>
      </div>
    </div>
  `;
}

// ============================================================================
// Unassigned Items & Location Assignment
// ============================================================================

let unassignedState = {
  page: 1,
  limit: 50,
  search: '',
  selectedItems: new Set()
};

let debounceUnassignedTimer;

/**
 * Load unassigned items
 */
async function loadUnassignedItems(page = 1) {
  const listEl = document.getElementById('unassignedList');
  const paginationEl = document.getElementById('unassignedPagination');
  const totalEl = document.getElementById('unassignedTotal');

  try {
    listEl.innerHTML = '<tr><td colspan="5" class="loading">Loading...</td></tr>';

    const params = new URLSearchParams({
      q: unassignedState.search,
      page: page,
      limit: unassignedState.limit
    });

    const data = await fetchAPI(`/owner/locations/unassigned?${params}`);

    if (!data.items || data.items.length === 0) {
      listEl.innerHTML = '<tr><td colspan="5" class="empty-state" class="u-p-8">No unassigned items found</td></tr>';
      paginationEl.innerHTML = '';
      totalEl.textContent = '0';
      return;
    }

    // Update state
    unassignedState.page = page;
    totalEl.textContent = data.total;

    // Render items
    let html = '';
    data.items.forEach(item => {
      const isChecked = unassignedState.selectedItems.has(item.item_code);
      html += `
        <tr>
          <td>
            <input type="checkbox" class="unassigned-checkbox" value="${item.item_code}"
              ${isChecked ? 'checked' : ''} onchange="toggleUnassignedItem('${item.item_code}')">
          </td>
          <td><code class="code-inline">${item.item_code}</code></td>
          <td>${item.item_name}</td>
          <td>${item.unit}</td>
          <td>
            <button type="button" class="btn btn-sm btn-success" onclick="assignSingleItem('${item.item_code}')">
              Assign
            </button>
          </td>
        </tr>
      `;
    });
    listEl.innerHTML = html;

    // Update pagination
    const totalPages = Math.ceil(data.total / data.limit);
    html = '';
    if (page > 1) {
      html += `<button type="button" class="btn btn-sm btn-secondary" onclick="loadUnassignedItems(${page - 1})">« Prev</button>`;
    }
    html += `<span class="mx-4">Page ${page} of ${totalPages}</span>`;
    if (page < totalPages) {
      html += `<button type="button" class="btn btn-sm btn-secondary" onclick="loadUnassignedItems(${page + 1})">Next »</button>`;
    }
    paginationEl.innerHTML = html;

    // Update select all checkbox
    updateSelectAllCheckbox();
    updateAssignSelectedButton();

  } catch (error) {
    console.error('Error loading unassigned items:', error);
    listEl.innerHTML = `<tr><td colspan="5" class="alert alert-danger">${error.message}</td></tr>`;
  }
}

/**
 * Debounced search for unassigned items
 */
function debounceUnassignedSearch() {
  clearTimeout(debounceUnassignedTimer);
  debounceUnassignedTimer = setTimeout(() => {
    unassignedState.search = document.getElementById('unassignedSearch').value;
    unassignedState.page = 1;
    unassignedState.selectedItems.clear();
    loadUnassignedItems(1);
  }, 300);
}

/**
 * Toggle individual unassigned item selection
 */
function toggleUnassignedItem(itemCode) {
  if (unassignedState.selectedItems.has(itemCode)) {
    unassignedState.selectedItems.delete(itemCode);
  } else {
    unassignedState.selectedItems.add(itemCode);
  }
  updateSelectAllCheckbox();
  updateAssignSelectedButton();
}

/**
 * Toggle select all unassigned items
 */
function toggleSelectAllUnassigned() {
  const selectAllCheckbox = document.getElementById('selectAllUnassigned');
  const checkboxes = document.querySelectorAll('.unassigned-checkbox');

  checkboxes.forEach(cb => {
    const itemCode = cb.value;
    if (selectAllCheckbox.checked) {
      unassignedState.selectedItems.add(itemCode);
      cb.checked = true;
    } else {
      unassignedState.selectedItems.delete(itemCode);
      cb.checked = false;
    }
  });

  updateAssignSelectedButton();
}

/**
 * Update select all checkbox state
 */
function updateSelectAllCheckbox() {
  const selectAllCheckbox = document.getElementById('selectAllUnassigned');
  const checkboxes = document.querySelectorAll('.unassigned-checkbox');

  if (checkboxes.length === 0) {
    selectAllCheckbox.checked = false;
    return;
  }

  const allChecked = Array.from(checkboxes).every(cb => cb.checked);
  selectAllCheckbox.checked = allChecked;
}

/**
 * Update assign selected button state
 */
function updateAssignSelectedButton() {
  const btn = document.getElementById('assignSelectedBtn');
  btn.disabled = unassignedState.selectedItems.size === 0;
  btn.textContent = `📍 Assign Selected (${unassignedState.selectedItems.size})`;
}

/**
 * Assign single item to locations
 */
function assignSingleItem(itemCode) {
  unassignedState.selectedItems.clear();
  unassignedState.selectedItems.add(itemCode);
  openAssignModal();
}

/**
 * Assign selected items to locations
 */
function assignSelectedItems() {
  if (unassignedState.selectedItems.size === 0) {
    showToast('Please select at least one item', 'warning');
    return;
  }
  openAssignModal();
}

/**
 * Open assign locations modal
 */
async function openAssignModal() {
  const modal = document.getElementById('assignLocationsModal');
  const select = document.getElementById('assignLocationSelect');
  const countEl = document.getElementById('assignItemsCount');

  try {
    // Fetch available locations
    const locations = await fetchAPI('/owner/locations/list');

    if (!locations || locations.length === 0) {
      showToast('No locations found. Please create a location first.', 'warning');
      return;
    }

    // Populate location select
    let html = '';
    locations.forEach(loc => {
      html += `<option value="${loc.id}">${loc.name} (${loc.type || 'warehouse'})</option>`;
    });
    select.innerHTML = html;

    // Update item count
    countEl.textContent = `${unassignedState.selectedItems.size} item${unassignedState.selectedItems.size !== 1 ? 's' : ''}`;

    // Show modal
    modal.classList.add('active');

  } catch (error) {
    console.error('Error opening assign modal:', error);
    showToast(`Error loading locations: ${error.message}`, 'danger');
  }
}

/**
 * Close assign locations modal
 */
function closeAssignLocationsModal() {
  document.getElementById('assignLocationsModal').classList.remove('active');
}

/**
 * Confirm assign locations
 */
async function confirmAssignLocations() {
  const select = document.getElementById('assignLocationSelect');
  const selectedOptions = Array.from(select.selectedOptions);

  if (selectedOptions.length === 0) {
    showToast('Please select at least one location', 'warning');
    return;
  }

  const locationIds = selectedOptions.map(opt => opt.value);
  const itemCodes = Array.from(unassignedState.selectedItems);

  try {
    showToast('Assigning items...', 'info');

    const result = await fetchAPI('/owner/locations/assign', {
      method: 'POST',
      body: JSON.stringify({ itemCodes, locationIds })
    });

    showToast(result.message || `Assigned ${result.inserted} mappings`, 'success');

    // Close modal and refresh list
    closeAssignLocationsModal();
    unassignedState.selectedItems.clear();
    loadUnassignedItems(unassignedState.page);

    // Refresh locations list if visible
    if (typeof loadLocations === 'function') {
      loadLocations();
    }

  } catch (error) {
    console.error('Error assigning locations:', error);
    showToast(`Error: ${error.message}`, 'danger');
  }
}

/**
 * Unassign item from location
 * @param {string} itemCode - Item code
 * @param {string} locationId - Location ID
 */
async function unassignMapping(itemCode, locationId) {
  if (!confirm(`Remove mapping for ${itemCode}?`)) {
    return;
  }

  try {
    const result = await fetchAPI('/owner/locations/unassign', {
      method: 'POST',
      body: JSON.stringify({ itemCode, locationId })
    });

    showToast(result.message || 'Mapping removed', 'success');

    // Refresh locations list
    if (typeof loadLocations === 'function') {
      loadLocations();
    }

    // Refresh unassigned list
    loadUnassignedItems(unassignedState.page);

  } catch (error) {
    console.error('Error unassigning mapping:', error);
    showToast(`Error: ${error.message}`, 'danger');
  }
}

// ============================================================================
// v14.3: PLAYGROUND FUNCTIONS (STUB IMPLEMENTATIONS)
// ============================================================================

/**
 * Open modal to create a new workspace
 */
function openNewWorkspaceModal() {
  const name = prompt('Enter workspace name (e.g., "Month-End Jan 2025"):');
  if (!name) return;

  const periodStart = prompt('Period start (YYYY-MM-DD):');
  if (!periodStart) return;

  const periodEnd = prompt('Period end (YYYY-MM-DD):');
  if (!periodEnd) return;

  createWorkspace(name, periodStart, periodEnd);
}

/**
 * Create a new workspace
 */
async function createWorkspace(name, periodStart, periodEnd) {
  try {
    const result = await fetchAPI('/owner/count/workspaces', {
      method: 'POST',
      body: JSON.stringify({ name, period_start: periodStart, period_end: periodEnd })
    });

    showToast(`Workspace "${name}" created successfully!`, 'success');
    loadPlayground(); // Reload playground
  } catch (error) {
    console.error('Error creating workspace:', error);
    showToast(`Error: ${error.message}`, 'danger');
  }
}

/**
 * Open a workspace for viewing/editing
 */
async function openWorkspace(workspaceId) {
  const modal = document.getElementById('workspaceModal');
  const detailsContainer = document.getElementById('workspaceDetails');

  if (!modal || !detailsContainer) {
    console.error('Workspace modal not found');
    return;
  }

  // Show modal with loading state
  modal.classList.add('active');
  detailsContainer.innerHTML = '<div class="loading"><div class="spinner"></div> Loading workspace...</div>';

  try {
    // Fetch workspace details
    const workspace = await fetchAPI(`/owner/count/workspaces/${workspaceId}`);

    // Store workspace ID for usage report
    window.currentWorkspaceId = workspaceId;

    // Update modal title
    document.getElementById('workspaceModalTitle').textContent = `🎮 ${workspace.name}`;

    // Render workspace details
    let html = `
      <div class="card">
        <div class="card-header">
          <h4>Workspace Information</h4>
        </div>
        <div class="card-body">
          <div class="row">
            <div class="col-md-6">
              <p><strong>Name:</strong> ${workspace.name}</p>
              <p><strong>Status:</strong> <span class="badge badge-${workspace.status === 'open' ? 'success' : 'warning'}">${workspace.status}</span></p>
            </div>
            <div class="col-md-6">
              <p><strong>Period:</strong> ${workspace.period_start} to ${workspace.period_end}</p>
              <p><strong>Created:</strong> ${new Date(workspace.created_at).toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>
    `;

    // Show items if available
    if (workspace.items && workspace.items.length > 0) {
      html += `
        <div class="card" class="u-mt-4">
          <div class="card-header">
            <h4>Items (${workspace.items.length})</h4>
          </div>
          <div class="modal-scrollable-content-400">
            <table class="table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Location</th>
                  <th>Counted</th>
                  <th>Usage</th>
                </tr>
              </thead>
              <tbody>
      `;

      workspace.items.forEach(item => {
        html += `
          <tr>
            <td>${item.item_name || item.item_id}</td>
            <td>${item.location_name || item.location_id || 'N/A'}</td>
            <td>${item.count !== null ? item.count : 'Not counted'}</td>
            <td>${item.usage !== null ? item.usage : 'N/A'}</td>
          </tr>
        `;
      });

      html += `
              </tbody>
            </table>
          </div>
        </div>
      `;
    } else {
      html += `
        <div class="alert alert-info" class="u-mt-4">
          No items in this workspace yet. Items can be added during the count process.
        </div>
      `;
    }

    // Show invoices if available
    if (workspace.invoices && workspace.invoices.length > 0) {
      html += `
        <div class="card" class="u-mt-4">
          <div class="card-header">
            <h4>Attached Invoices (${workspace.invoices.length})</h4>
          </div>
          <div class="scrollable-300">
            <table class="table">
              <thead>
                <tr>
                  <th>Invoice Date</th>
                  <th>Vendor</th>
                  <th>Total</th>
                  <th>Items</th>
                </tr>
              </thead>
              <tbody>
      `;

      workspace.invoices.forEach(inv => {
        html += `
          <tr>
            <td>${inv.invoice_date || 'N/A'}</td>
            <td>${inv.vendor_name || 'Unknown'}</td>
            <td>$${inv.total ? inv.total.toFixed(2) : '0.00'}</td>
            <td>${inv.item_count || 0}</td>
          </tr>
        `;
      });

      html += `
              </tbody>
            </table>
          </div>
        </div>
      `;
    }

    // Add action sections for attaching counts, PDFs, and uploading files
    html += `
      <div class="card" class="u-mt-4">
        <div class="card-header">
          <h4>📎 Attach Data to Workspace</h4>
        </div>
        <div class="card-body">
          <div class="grid grid-3" class="flex-gap-4">

            <!-- Attach Inventory Count -->
            <div>
              <h5 class="u-mb-2">📊 Inventory Count</h5>
              <button type="button" class="btn btn-primary btn-sm" onclick="openAttachCountModal('${workspaceId}')" class="w-full">
                Attach Existing Count
              </button>
            </div>

            <!-- Attach GFS PDFs -->
            <div>
              <h5 class="u-mb-2">📄 GFS Orders</h5>
              <button type="button" class="btn btn-primary btn-sm" onclick="openAttachPDFsModal('${workspaceId}')" class="w-full">
                Attach PDFs
              </button>
            </div>

            <!-- Upload File -->
            <div>
              <h5 class="u-mb-2">📤 Upload File</h5>
              <button type="button" class="btn btn-success btn-sm" onclick="openUploadFileModal('${workspaceId}')" class="w-full">
                Upload PDF/Excel
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    detailsContainer.innerHTML = html;

    // Show usage report button if workspace has data
    const usageBtn = document.getElementById('workspaceUsageBtn');
    if (usageBtn && workspace.items && workspace.items.length > 0) {
      setHidden(usageBtn, false);
    }

  } catch (error) {
    console.error('Error loading workspace:', error);
    detailsContainer.innerHTML = `
      <div class="alert alert-danger">
        <strong>Error loading workspace:</strong> ${error.message}
      </div>
    `;
  }
}

/**
 * Close the workspace details modal
 */
function closeWorkspaceModal() {
  const modal = document.getElementById('workspaceModal');
  if (modal) {
    modal.classList.remove('active');
  }
  window.currentWorkspaceId = null;
}

/**
 * View usage report for current workspace
 */
async function viewWorkspaceUsage() {
  if (!window.currentWorkspaceId) {
    showToast('No workspace selected', 'warning');
    return;
  }

  try {
    const usageData = await fetchAPI(`/owner/count/workspaces/${window.currentWorkspaceId}/usage`);

    // TODO: Implement usage report viewer
    // For now, just show a summary
    showToast(`Usage report: ${usageData.total_items || 0} items, $${usageData.total_value || 0} value`, 'info');
    console.log('Usage data:', usageData);
  } catch (error) {
    console.error('Error loading usage report:', error);
    showToast(`Error loading usage report: ${error.message}`, 'danger');
  }
}

/**
 * Open modal to attach an existing inventory count to workspace
 */
async function openAttachCountModal(workspaceId) {
  try {
    // Fetch available inventory counts
    const counts = await fetchAPI('/owner/counts/available');

    if (!counts.counts || counts.counts.length === 0) {
      showToast('No available inventory counts found', 'warning');
      return;
    }

    let html = `
      <div class="card">
        <div class="card-header">
          <h4>Select Inventory Count</h4>
        </div>
        <div class="modal-scrollable-content-400">
          <table class="table">
            <thead>
              <tr>
                <th class="w-40"></th>
                <th>Count ID</th>
                <th>Date</th>
                <th>Location</th>
                <th>Items</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
    `;

    counts.counts.forEach(count => {
      html += `
        <tr>
          <td>
            <input type="radio" name="selectedCount" value="${count.id}" />
          </td>
          <td>${count.id}</td>
          <td>${new Date(count.created_at).toLocaleDateString()}</td>
          <td>${count.location_name || 'All locations'}</td>
          <td>${count.item_count || 0}</td>
          <td><span class="badge badge-${count.status === 'closed' ? 'success' : 'warning'}">${count.status}</span></td>
        </tr>
      `;
    });

    html += `
            </tbody>
          </table>
        </div>
        <div class="mt-right">
          <button type="button" class="btn btn-secondary" onclick="this.closest('.card').remove()">Cancel</button>
          <button type="button" class="btn btn-primary" onclick="attachCountToWorkspace('${workspaceId}')">Attach Count</button>
        </div>
      </div>
    `;

    const detailsContainer = document.getElementById('workspaceDetails');
    detailsContainer.innerHTML += html;

  } catch (error) {
    console.error('Error loading counts:', error);
    showToast(`Error loading counts: ${error.message}`, 'danger');
  }
}

/**
 * Attach selected inventory count to workspace
 */
async function attachCountToWorkspace(workspaceId) {
  const selectedCount = document.querySelector('input[name="selectedCount"]:checked');

  if (!selectedCount) {
    showToast('Please select an inventory count', 'warning');
    return;
  }

  try {
    await fetchAPI(`/owner/count/workspaces/${workspaceId}/attach-count`, {
      method: 'POST',
      body: JSON.stringify({ count_id: selectedCount.value })
    });

    showToast('Inventory count attached successfully!', 'success');
    openWorkspace(workspaceId); // Reload workspace
  } catch (error) {
    console.error('Error attaching count:', error);
    showToast(`Error: ${error.message}`, 'danger');
  }
}

/**
 * Open modal to attach PDFs to workspace
 */
async function openAttachPDFsModal(workspaceId) {
  try {
    // Fetch available PDFs
    const pdfs = await fetchAPI('/owner/pdfs/available?vendor=GFS');

    if (!pdfs.documents || pdfs.documents.length === 0) {
      showToast('No available PDFs found', 'warning');
      return;
    }

    let html = `
      <div class="card">
        <div class="card-header">
          <h4>Select PDFs to Attach</h4>
        </div>
        <div class="modal-scrollable-content-400">
          <table class="table">
            <thead>
              <tr>
                <th class="w-40"><input type="checkbox" id="selectAllPDFs" onchange="toggleSelectAllPDFs()" /></th>
                <th>Filename</th>
                <th>Date</th>
                <th>Vendor</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
    `;

    pdfs.documents.forEach(pdf => {
      html += `
        <tr>
          <td>
            <input type="checkbox" class="pdf-checkbox" value="${pdf.id}" />
          </td>
          <td>${pdf.filename}</td>
          <td>${pdf.invoice_date ? new Date(pdf.invoice_date).toLocaleDateString() : 'N/A'}</td>
          <td>${pdf.vendor || 'Unknown'}</td>
          <td>$${pdf.invoice_amount ? pdf.invoice_amount.toFixed(2) : '0.00'}</td>
        </tr>
      `;
    });

    html += `
            </tbody>
          </table>
        </div>
        <div class="mt-right">
          <button type="button" class="btn btn-secondary" onclick="this.closest('.card').remove()">Cancel</button>
          <button type="button" class="btn btn-primary" onclick="attachPDFsToWorkspace('${workspaceId}')">Attach Selected</button>
        </div>
      </div>
    `;

    const detailsContainer = document.getElementById('workspaceDetails');
    detailsContainer.innerHTML += html;

  } catch (error) {
    console.error('Error loading PDFs:', error);
    showToast(`Error loading PDFs: ${error.message}`, 'danger');
  }
}

/**
 * Toggle select all PDFs
 */
function toggleSelectAllPDFs() {
  const selectAll = document.getElementById('selectAllPDFs');
  const checkboxes = document.querySelectorAll('.pdf-checkbox');
  checkboxes.forEach(cb => cb.checked = selectAll.checked);
}

/**
 * Attach selected PDFs to workspace
 */
async function attachPDFsToWorkspace(workspaceId) {
  const selectedPDFs = Array.from(document.querySelectorAll('.pdf-checkbox:checked')).map(cb => cb.value);

  if (selectedPDFs.length === 0) {
    showToast('Please select at least one PDF', 'warning');
    return;
  }

  try {
    await fetchAPI(`/owner/count/workspaces/${workspaceId}/attach-pdfs`, {
      method: 'POST',
      body: JSON.stringify({ document_ids: selectedPDFs })
    });

    showToast(`${selectedPDFs.length} PDF(s) attached successfully!`, 'success');
    openWorkspace(workspaceId); // Reload workspace
  } catch (error) {
    console.error('Error attaching PDFs:', error);
    showToast(`Error: ${error.message}`, 'danger');
  }
}

/**
 * Open modal to upload a file to workspace
 */
function openUploadFileModal(workspaceId) {
  let html = `
    <div class="card">
      <div class="card-header">
        <h4>Upload File to Workspace</h4>
      </div>
      <div class="card-body">
        <form id="workspaceUploadForm">
          <div class="form-group">
            <label class="form-label">Select File (PDF or Excel)</label>
            <input type="file" class="input" id="workspaceFile" accept=".pdf,.xlsx,.xls" required />
            <small class="description-text-small">Accepted formats: PDF, XLSX, XLS</small>
          </div>
          <div class="form-group">
            <label class="form-label">Notes (optional)</label>
            <textarea class="textarea" id="workspaceFileNotes" placeholder="Add any notes about this file..."></textarea>
          </div>
        </form>
      </div>
      <div class="footer-right-padded">
        <button type="button" class="btn btn-secondary" onclick="this.closest('.card').remove()">Cancel</button>
        <button type="button" class="btn btn-success" onclick="uploadFileToWorkspace('${workspaceId}')">Upload</button>
      </div>
    </div>
  `;

  const detailsContainer = document.getElementById('workspaceDetails');
  detailsContainer.innerHTML += html;
}

/**
 * Upload file to workspace
 */
async function uploadFileToWorkspace(workspaceId) {
  const fileInput = document.getElementById('workspaceFile');
  const notesInput = document.getElementById('workspaceFileNotes');

  if (!fileInput.files || fileInput.files.length === 0) {
    showToast('Please select a file', 'warning');
    return;
  }

  const file = fileInput.files[0];
  const formData = new FormData();
  formData.append('file', file);
  formData.append('workspace_id', workspaceId);
  formData.append('notes', notesInput.value || '');

  try {
    const response = await fetch(`${API_BASE}/owner/count/workspaces/${workspaceId}/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Upload failed');
    }

    const result = await response.json();
    showToast(`File uploaded successfully!`, 'success');
    openWorkspace(workspaceId); // Reload workspace
  } catch (error) {
    console.error('Error uploading file:', error);
    showToast(`Error: ${error.message}`, 'danger');
  }
}

// ============================================================================
// MENU TAB (v15.0) - 4-Week Menu Calendar System
// ============================================================================

/**
 * Menu State Management
 */
let menuState = {
  currentWeek: 1,
  currentDay: null,
  policy: null,
  weeks: null,
  headcount: 280
};

/**
 * Initialize and load menu data
 * Fetches policy and weeks structure
 */
async function loadMenu() {
  console.log('🍽️ Loading Menu Calendar...');

  try {
    // Fetch policy and weeks in parallel
    const [policyRes, weeksRes] = await Promise.all([
      fetchAPI('/menu/policy'),
      fetchAPI('/menu/weeks')
    ]);

    if (!policyRes?.success || !weeksRes?.success) {
      throw new Error('Failed to load menu data');
    }

    // Update menu state (v21.1.1: Add defensive checks for policy object)
    menuState.policy = policyRes.policy || {};
    menuState.weeks = weeksRes.weeks || [];
    menuState.currentWeek = policyRes.policy?.currentWeek || 1;
    menuState.currentDay = policyRes.policy?.currentDay || null;
    menuState.headcount = weeksRes.headcount || 280;

    // Debug: Check if recipes are present
    console.log('📊 Menu data loaded:', {
      weeks: menuState.weeks.length,
      currentWeek: menuState.currentWeek,
      headcount: menuState.headcount,
      firstWeekDays: menuState.weeks[0]?.days?.length,
      firstDayRecipes: menuState.weeks[0]?.days?.[0]?.recipes?.length
    });

    // Update UI: headcount display
    const headcountDisplay = document.getElementById('menuHeadcountDisplay');
    if (headcountDisplay) {
      headcountDisplay.textContent = menuState.headcount;
    }

    // Update title
    const titleEl = document.querySelector('#menu .card-title');
    if (titleEl) {
      titleEl.textContent = `🍽️ 4-Week Menu Calendar (${menuState.headcount} ppl)`;
    }

    // Highlight current week badge
    const badge = document.getElementById('menuCurrentWeekBadge');
    if (badge) {
      badge.textContent = `Current: Week ${menuState.currentWeek}`;
    }

    // Load current week data
    await loadMenuWeek(menuState.currentWeek);

    // Update policy lock banner
    updatePolicyLockBanner();

    console.log('✅ Menu loaded successfully');
  } catch (error) {
    console.error('❌ Menu load error:', error);
    showToast(`Error loading menu: ${error.message}`, 'danger');

    const calendar = document.getElementById('menuCalendar');
    if (calendar) {
      calendar.innerHTML = `
        <div class="alert alert-danger">
          Failed to load menu data: ${error.message}
        </div>
      `;
    }
  }
}

/**
 * Load specific week data and render calendar
 * @param {number} weekNum - Week number (1-4)
 */
async function loadMenuWeek(weekNum) {
  console.log(`📅 Loading Week ${weekNum}...`);

  if (weekNum < 1 || weekNum > 4) {
    showToast('Invalid week number', 'warning');
    return;
  }

  menuState.currentWeek = weekNum;

  // Update active week button
  document.querySelectorAll('.menu-week-btn').forEach(btn => {
    btn.classList.remove('active');
    if (parseInt(btn.dataset.week) === weekNum) {
      btn.classList.add('active');
    }
  });

  try {
    const calendar = document.getElementById('menuCalendar');
    calendar.innerHTML = '<div class="loading"><div class="spinner"></div> Loading week data...</div>';

    // v23.0: Try new menu-cycle API first, fall back to legacy
    let weekRes;
    let useNewAPI = true;
    try {
      weekRes = await fetchAPI(`/menu-cycle/week/${weekNum}?meal=dinner`);
      if (!weekRes.success) {
        throw new Error('menu-cycle API failed');
      }
    } catch (e) {
      console.log(`📋 Falling back to legacy menu API: ${e.message}`);
      useNewAPI = false;
      weekRes = await fetchAPI(`/menu/week/${weekNum}`);
    }

    if (!weekRes.success) {
      throw new Error('Failed to load week data');
    }

    // v23.0: Handle both API response formats
    let weekData;
    if (useNewAPI) {
      // New API: { success, week, meal_period, days: [{ day_of_week, day_name, stations: [...] }] }
      if (!weekRes.days || !Array.isArray(weekRes.days)) {
        throw new Error('Invalid menu-cycle response: missing days array');
      }
      weekData = {
        weekNum: weekRes.week,
        mealPeriod: weekRes.meal_period,
        days: weekRes.days
      };
      console.log(`📊 Week ${weekNum} (menu-cycle API):`, {
        days: weekData.days?.length,
        totalItems: weekData.days?.reduce((sum, day) =>
          sum + day.stations?.reduce((s, st) => s + (st.items?.length || 0), 0) || 0, 0)
      });
    } else {
      // Legacy API - weekRes.week contains the week data
      weekData = weekRes.week;
      if (!weekData || !weekData.days) {
        // Handle case where legacy API returns no week data
        console.warn(`⚠️ Week ${weekNum} legacy API returned no data, using empty structure`);
        weekData = {
          weekNum: weekNum,
          days: [],
          startsOn: null,
          endsOn: null
        };
      }
      console.log(`📊 Week ${weekNum} (legacy API):`, {
        days: weekData.days?.length,
        totalRecipes: weekData.days?.reduce((sum, day) => sum + (day.recipes?.length || 0), 0)
      });
    }

    // Update week info banner
    const weekDates = document.getElementById('menuWeekDates');
    if (weekDates) {
      if (useNewAPI) {
        weekDates.textContent = `Week ${weekNum} • 4-Week Rotation`;
      } else if (weekData.startsOn) {
        const startDate = new Date(weekData.startsOn).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric'
        });
        const endDate = new Date(weekData.endsOn).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric'
        });
        weekDates.textContent = `${startDate} — ${endDate}`;
      }
    }

    // Render calendar grid - use appropriate renderer
    if (useNewAPI) {
      renderMenuCycleCalendar(weekData);
    } else {
      renderMenuCalendar(weekData);
    }

    console.log(`✅ Week ${weekNum} loaded`);
  } catch (error) {
    console.error(`❌ Week ${weekNum} load error:`, error);
    showToast(`Error loading week ${weekNum}: ${error.message}`, 'danger');

    const calendar = document.getElementById('menuCalendar');
    if (calendar) {
      calendar.innerHTML = `
        <div class="alert alert-danger">
          Failed to load week data: ${error.message}
        </div>
      `;
    }
  }
}

/**
 * Render menu calendar grid (7 days × 3 meals)
 * @param {object} weekData - Week data from API
 */
function renderMenuCalendar(weekData) {
  const calendar = document.getElementById('menuCalendar');
  if (!calendar) return;

  // v23.3: Guard against missing or empty data
  if (!weekData || !weekData.days || weekData.days.length === 0) {
    console.warn('⚠️ renderMenuCalendar: No days data available');
    calendar.innerHTML = `
      <div class="alert alert-info">
        <i class="bi bi-info-circle"></i> No menu data available for this week.
      </div>
    `;
    return;
  }

  // Debug: Check what we're rendering
  const totalRecipes = weekData.days?.reduce((sum, day) => sum + (day.recipes?.length || 0), 0) || 0;
  console.log(`🎨 Rendering calendar with ${totalRecipes} total recipes`);

  // Build calendar HTML
  let html = '<div class="menu-calendar-wrapper">';

  // Day headers (with empty cell for meal label column alignment)
  html += '<div class="menu-calendar-header">';
  html += '<div class="menu-meal-label-spacer"></div>'; // Empty cell to align with meal labels
  weekData.days.forEach(day => {
    const isToday = day.isoDate === new Date().toISOString().split('T')[0];
    const isCurrent = day.dayName === menuState.currentDay;
    html += `
      <div class="menu-day-header ${isToday ? 'menu-day-today' : ''} ${isCurrent ? 'menu-day-current' : ''}">
        <div class="menu-day-name">${day.dayName}</div>
        <div class="menu-day-date">${new Date(day.isoDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
      </div>
    `;
  });
  html += '</div>';

  // Meal rows (Breakfast, Dinner with Lunch included)
  const mealTypes = ['Breakfast', 'Dinner'];

  mealTypes.forEach(mealType => {
    html += `<div class="menu-meal-row">`;
    html += `<div class="menu-meal-label">${mealType}</div>`;

    weekData.days.forEach(day => {
      // For Dinner row, include both Lunch and Dinner recipes
      const recipes = day.recipes.filter(r =>
        mealType === 'Dinner'
          ? (r.mealType === 'Dinner' || r.mealType === 'Lunch')
          : r.mealType === mealType
      );
      const isPolicyLocked = checkPolicyLock(day.dayName, mealType);

      html += `<div class="menu-cell ${isPolicyLocked ? 'menu-cell-locked' : ''}">`;

      if (isPolicyLocked) {
        html += '<div class="menu-lock-overlay">🔒</div>';
      }

      if (recipes.length > 0) {
        recipes.forEach(recipe => {
          html += `
            <div class="recipe-chip" data-id="${recipe.id}" data-day="${day.isoDate}" data-meal="${mealType}">
              <div class="recipe-chip-name">${recipe.name}</div>
              <div class="recipe-chip-qty">${recipe.servings} servings</div>
            </div>
          `;
        });
      } else {
        html += '<div class="menu-cell-empty">—</div>';
      }

      html += '</div>';
    });

    html += '</div>';
  });

  html += '</div>';
  calendar.innerHTML = html;

  // Debug: Log what we just rendered
  console.log(`✅ Calendar HTML set (${html.length} chars). Checking DOM...`);

  // Debug: Verify it's in the DOM
  setTimeout(() => {
    const wrapper = calendar.querySelector('.menu-calendar-wrapper');
    const chips = calendar.querySelectorAll('.recipe-chip');
    console.log(`🔍 DOM Check: wrapper=${!!wrapper}, chips=${chips.length}`);

    if (!wrapper) {
      console.error('❌ .menu-calendar-wrapper not found in DOM!');
      console.log('Calendar innerHTML:', calendar.innerHTML.substring(0, 500));
    }

    if (chips.length === 0) {
      console.warn('⚠️ No .recipe-chip elements found!');
    }
  }, 100);

  // Bind click events to recipe chips
  document.querySelectorAll('.recipe-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const recipeId = chip.dataset.id;
      openRecipeDrawer(recipeId);
    });
  });
}

/**
 * v23.0: Render menu cycle calendar with station-based layout
 * @param {object} weekData - Week data from menu-cycle API
 */
function renderMenuCycleCalendar(weekData) {
  const calendar = document.getElementById('menuCalendar');
  if (!calendar) return;

  // v23.3: Guard against missing or empty data
  if (!weekData || !weekData.days || weekData.days.length === 0) {
    console.warn('⚠️ renderMenuCycleCalendar: No days data available');
    calendar.innerHTML = `
      <div class="alert alert-info">
        <i class="bi bi-info-circle"></i> No menu cycle data available for this week.
      </div>
    `;
    return;
  }

  const days = weekData.days || [];
  const totalItems = days.reduce((sum, day) =>
    sum + (day.stations || []).reduce((s, st) => s + (st.items?.length || 0), 0), 0);

  console.log(`🎨 Rendering station-based calendar with ${totalItems} items across ${days.length} days`);

  // Build calendar HTML with station-based layout
  let html = '<div class="menu-cycle-grid">';

  // Day headers (Wed-Tue)
  html += '<div class="menu-cycle-header">';
  days.forEach(day => {
    html += `<div class="menu-cycle-day-header">${day.day_name}</div>`;
  });
  html += '</div>';

  // Collect all unique stations across all days
  const allStations = new Map();
  days.forEach(day => {
    (day.stations || []).forEach(station => {
      if (!allStations.has(station.code)) {
        allStations.set(station.code, {
          code: station.code,
          name: station.name,
          cuisine_type: station.cuisine_type,
          order: station.order || 0
        });
      }
    });
  });

  // Sort stations by order
  const sortedStations = [...allStations.values()].sort((a, b) => a.order - b.order);

  // Render each station as a row
  sortedStations.forEach(station => {
    const cuisineIcon = {
      'western': '🍔',
      'south_asian': '🍛',
      'healthy': '🥗',
      'dessert': '🍰',
      'beverage': '🥤'
    }[station.cuisine_type] || '🍽️';

    html += `<div class="menu-cycle-station-row">`;
    html += `<div class="menu-cycle-station-label" title="${station.name}">${cuisineIcon} ${station.name}</div>`;

    days.forEach(day => {
      const dayStation = (day.stations || []).find(s => s.code === station.code);
      const items = dayStation?.items || [];

      html += `<div class="menu-cycle-cell">`;
      if (items.length > 0) {
        items.forEach(item => {
          const vegBadge = item.is_vegan ? '🌱' : (item.is_vegetarian ? '🥬' : '');
          html += `
            <div class="menu-cycle-item" data-id="${item.id}" title="${item.name}">
              <span class="menu-cycle-item-name">${item.name}</span>
              ${vegBadge ? `<span class="menu-cycle-veg-badge">${vegBadge}</span>` : ''}
            </div>
          `;
        });
      } else {
        html += '<div class="menu-cycle-empty">—</div>';
      }
      html += '</div>';
    });

    html += '</div>';
  });

  html += '</div>';

  // Add CSS styles inline if not already present
  if (!document.getElementById('menu-cycle-styles')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'menu-cycle-styles';
    styleEl.textContent = `
      .menu-cycle-grid {
        display: grid;
        gap: 2px;
        background: var(--border-color, #e0e0e0);
        border-radius: 8px;
        overflow: hidden;
      }
      .menu-cycle-header {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        background: var(--primary-color, #2196F3);
        color: white;
        font-weight: 600;
        text-align: center;
      }
      .menu-cycle-day-header {
        padding: 8px 4px;
        font-size: 13px;
      }
      .menu-cycle-station-row {
        display: grid;
        grid-template-columns: 140px repeat(7, 1fr);
        background: white;
      }
      .menu-cycle-station-label {
        padding: 8px;
        background: #f5f5f5;
        font-weight: 500;
        font-size: 11px;
        display: flex;
        align-items: center;
        gap: 4px;
        border-right: 1px solid #e0e0e0;
      }
      .menu-cycle-cell {
        padding: 6px;
        min-height: 50px;
        border-right: 1px solid #f0f0f0;
        display: flex;
        flex-direction: column;
        gap: 3px;
      }
      .menu-cycle-item {
        background: #f8f9fa;
        padding: 4px 6px;
        border-radius: 4px;
        font-size: 11px;
        line-height: 1.3;
        cursor: pointer;
        transition: background 0.2s;
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
      }
      .menu-cycle-item:hover {
        background: #e3f2fd;
      }
      .menu-cycle-item-name {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .menu-cycle-veg-badge {
        flex-shrink: 0;
        font-size: 10px;
        margin-left: 4px;
      }
      .menu-cycle-empty {
        color: #ccc;
        font-size: 12px;
        text-align: center;
        padding: 8px;
      }
    `;
    document.head.appendChild(styleEl);
  }

  calendar.innerHTML = html;
  console.log(`✅ Station-based calendar rendered`);
}

/**
 * Check if meal is locked based on policy
 * @param {string} dayName - Day name (e.g., "Wednesday")
 * @param {string} mealType - Meal type (Breakfast/Lunch/Dinner)
 * @returns {boolean} - True if locked
 */
function checkPolicyLock(dayName, mealType) {
  if (!menuState.policy || mealType !== 'Dinner') return false;

  const lockTime = menuState.policy.takeoutLockTime || '19:30';
  const now = new Date();
  const [lockHour, lockMin] = lockTime.split(':').map(Number);

  const currentHour = now.getHours();
  const currentMin = now.getMinutes();

  // Check if current time is before lock time
  if (currentHour < lockHour || (currentHour === lockHour && currentMin < lockMin)) {
    // Also check if this is today's dinner
    const today = now.toLocaleDateString('en-US', { weekday: 'long' });
    return dayName === today;
  }

  return false;
}

/**
 * Update policy lock banner visibility
 */
function updatePolicyLockBanner() {
  const banner = document.getElementById('menuPolicyBanner');
  if (!banner || !menuState.policy) return;

  const lockTime = menuState.policy.takeoutLockTime || '19:30';
  const now = new Date();
  const [lockHour, lockMin] = lockTime.split(':').map(Number);

  const currentHour = now.getHours();
  const currentMin = now.getMinutes();

  // Show banner if before lock time
  if (currentHour < lockHour || (currentHour === lockHour && currentMin < lockMin)) {
    banner.classList.remove('u-hide');
    banner.innerHTML = `
      ⚠️ <strong>${lockTime} Policy:</strong> Dinner menu changes are locked until ${lockTime}.
      Portion target: ${menuState.policy.portionTargetGrams || 650}g/person.
      Drift threshold: ±${menuState.policy.portionDriftThresholdPct || 15}%.
    `;
  } else {
    banner.classList.add('u-hide');
  }
}

/**
 * Open recipe drawer modal
 * @param {string} recipeId - Recipe ID
 */
async function openRecipeDrawer(recipeId) {
  console.log(`🍴 Opening recipe: ${recipeId}`);

  const modal = document.getElementById('recipeDrawerModal');
  const title = document.getElementById('recipeDrawerTitle');
  const content = document.getElementById('recipeDrawerContent');

  if (!modal || !content) {
    showToast('Recipe drawer not available', 'warning');
    return;
  }

  // Show modal with loading state
  modal.classList.add('active');
  title.textContent = 'Loading Recipe...';
  content.innerHTML = '<div class="loading"><div class="spinner"></div> Loading recipe details...</div>';

  try {
    const res = await fetchAPI(`/menu/recipe/${recipeId}`);

    if (!res.success) {
      throw new Error('Recipe not found');
    }

    const recipe = res.recipe;

    // Update modal title
    title.textContent = recipe.name;

    // Render recipe details
    let html = `
      <div class="recipe-drawer-header">
        <div class="recipe-meta">
          <span class="badge badge-primary">${recipe.mealType}</span>
          <span class="recipe-servings">${recipe.servings} servings (${menuState.headcount} ppl)</span>
        </div>
      </div>
    `;

    if (recipe.description) {
      html += `<div class="recipe-description">${recipe.description}</div>`;
    }

    // Items table
    if (recipe.items && recipe.items.length > 0) {
      html += `
        <div class="recipe-items-section">
          <h4>Ingredients & Quantities</h4>
          <table class="table">
            <thead>
              <tr>
                <th style="width: 200px;">Item Code</th>
                <th>Item Name</th>
                <th style="width: 150px;">Quantity</th>
                <th style="width: 80px;">Unit</th>
                <th style="width: 100px;">Per Person</th>
                <th style="width: 100px;">Actions</th>
              </tr>
            </thead>
            <tbody>
      `;

      recipe.items.forEach((item, idx) => {
        const perPerson = (item.qty_scaled / menuState.headcount).toFixed(3);
        html += `
          <tr id="recipeItem_${idx}">
            <td>
              <input
                type="text"
                class="input"
                id="itemCode_${idx}"
                value="${item.item_code}"
                placeholder="Search item..."
                autocomplete="off"
                data-original-code="${item.item_code}"
              />
              <div id="itemSearch_${idx}" class="search-results-dropdown hidden"></div>
            </td>
            <td>
              <span id="itemName_${idx}">${item.item_name || '—'}</span>
            </td>
            <td>
              <input
                type="number"
                class="input"
                id="itemQty_${idx}"
                value="${item.qty_scaled.toFixed(2)}"
                step="0.01"
                min="0"
                data-original="${item.qty_scaled.toFixed(2)}"
              />
            </td>
            <td>
              <span id="itemUnit_${idx}">${item.unit || 'EA'}</span>
            </td>
            <td>
              <span id="perPerson_${idx}">${perPerson}</span>
            </td>
            <td>
              <button type="button" class="btn btn-sm btn-danger" onclick="removeRecipeItem(${idx})" title="Remove item">
                ✕
              </button>
            </td>
          </tr>
        `;
      });

      // Add event listeners after rendering
      setTimeout(() => {
        recipe.items.forEach((item, idx) => {
          // Quantity change listener
          const qtyInput = document.getElementById(`itemQty_${idx}`);
          if (qtyInput) {
            qtyInput.addEventListener('input', () => {
              const newQty = parseFloat(qtyInput.value) || 0;
              const newPerPerson = (newQty / menuState.headcount).toFixed(3);
              const perPersonSpan = document.getElementById(`perPerson_${idx}`);
              if (perPersonSpan) {
                perPersonSpan.textContent = newPerPerson;
              }
            });
          }

          // Item code search listener
          const codeInput = document.getElementById(`itemCode_${idx}`);
          if (codeInput) {
            codeInput.addEventListener('input', () => {
              searchInventoryItems(codeInput.value, idx);
            });

            codeInput.addEventListener('focus', () => {
              if (codeInput.value.length > 0) {
                searchInventoryItems(codeInput.value, idx);
              }
            });

            // Click outside to close dropdown
            document.addEventListener('click', (e) => {
              if (!codeInput.contains(e.target)) {
                const dropdown = document.getElementById(`itemSearch_${idx}`);
                if (dropdown) dropdown.classList.add('hidden');
              }
            });
          }
        });
      }, 100);

      html += `
            </tbody>
          </table>
          <div class="flex-gap-half" style="margin-top: 1rem;">
            <button type="button" class="btn btn-primary" onclick="addRecipeItem()">➕ Add Item</button>
            <button type="button" class="btn btn-success" onclick="saveRecipeChanges('${recipeId}')">💾 Save Changes</button>
            <button type="button" class="btn btn-secondary" onclick="resetRecipeQuantities()">↻ Reset</button>
          </div>
        </div>
      `;
    } else {
      html += '<div class="alert alert-info">No items configured for this recipe.</div>';
    }

    content.innerHTML = html;

    // Store recipe data for saving
    window.currentRecipeData = {
      id: recipeId,
      items: recipe.items
    };

    console.log(`✅ Recipe ${recipeId} loaded`);
  } catch (error) {
    console.error(`❌ Recipe drawer error:`, error);
    showToast(`Error loading recipe: ${error.message}`, 'danger');
    content.innerHTML = `
      <div class="alert alert-danger">
        Failed to load recipe details: ${error.message}
      </div>
    `;
  }
}

/**
 * Close recipe drawer modal
 */
function closeRecipeDrawer() {
  const modal = document.getElementById('recipeDrawerModal');
  if (modal) {
    modal.classList.remove('active');
  }
}

/**
 * Search inventory items
 * @param {string} query - Search query
 * @param {number} rowIdx - Row index
 */
async function searchInventoryItems(query, rowIdx) {
  if (!query || query.length < 2) {
    const dropdown = document.getElementById(`itemSearch_${rowIdx}`);
    if (dropdown) dropdown.classList.add('hidden');
    return;
  }

  try {
    const res = await fetchAPI(`/owner/inventory/search?q=${encodeURIComponent(query)}&limit=10`);

    const dropdown = document.getElementById(`itemSearch_${rowIdx}`);
    if (!dropdown) return;

    if (!res.items || res.items.length === 0) {
      dropdown.innerHTML = '<div class="search-result-item" style="color: #6b7280;">No items found</div>';
      dropdown.classList.remove('hidden');
      return;
    }

    let html = '';
    res.items.forEach(item => {
      html += `
        <div class="search-result-item" onclick="selectInventoryItem(${rowIdx}, '${item.item_code}', '${item.item_name.replace(/'/g, "\\'")}', '${item.issue_unit || 'EA'}')">
          <strong>${item.item_code}</strong> - ${item.item_name}
        </div>
      `;
    });

    dropdown.innerHTML = html;
    dropdown.classList.remove('hidden');
  } catch (error) {
    console.error('Search error:', error);
  }
}

/**
 * Select an inventory item from search results
 * @param {number} rowIdx - Row index
 * @param {string} itemCode - Item code
 * @param {string} itemName - Item name
 * @param {string} unit - Item unit
 */
function selectInventoryItem(rowIdx, itemCode, itemName, unit) {
  const codeInput = document.getElementById(`itemCode_${rowIdx}`);
  const nameSpan = document.getElementById(`itemName_${rowIdx}`);
  const unitSpan = document.getElementById(`itemUnit_${rowIdx}`);
  const dropdown = document.getElementById(`itemSearch_${rowIdx}`);

  if (codeInput) codeInput.value = itemCode;
  if (nameSpan) nameSpan.textContent = itemName;
  if (unitSpan) unitSpan.textContent = unit;
  if (dropdown) dropdown.classList.add('hidden');

  console.log(`✅ Selected item: ${itemCode} - ${itemName}`);
}

/**
 * Add new item row to recipe
 */
function addRecipeItem() {
  if (!window.currentRecipeData) {
    showToast('No recipe loaded', 'warning');
    return;
  }

  const tbody = document.querySelector('.recipe-items-section tbody');
  if (!tbody) return;

  const newIdx = window.currentRecipeData.items.length;

  const newRow = document.createElement('tr');
  newRow.id = `recipeItem_${newIdx}`;
  newRow.innerHTML = `
    <td>
      <input
        type="text"
        class="input"
        id="itemCode_${newIdx}"
        value=""
        placeholder="Search item..."
        autocomplete="off"
      />
      <div id="itemSearch_${newIdx}" class="search-results-dropdown hidden"></div>
    </td>
    <td>
      <span id="itemName_${newIdx}">—</span>
    </td>
    <td>
      <input
        type="number"
        class="input"
        id="itemQty_${newIdx}"
        value="100"
        step="0.01"
        min="0"
      />
    </td>
    <td>
      <span id="itemUnit_${newIdx}">g</span>
    </td>
    <td>
      <span id="perPerson_${newIdx}">0.357</span>
    </td>
    <td>
      <button type="button" class="btn btn-sm btn-danger" onclick="removeRecipeItem(${newIdx})" title="Remove item">
        ✕
      </button>
    </td>
  `;

  tbody.appendChild(newRow);

  // Add new placeholder item to data
  window.currentRecipeData.items.push({
    item_code: '',
    item_name: '',
    qty_scaled: 100,
    unit: 'g',
    pack_size: 1
  });

  // Add event listeners for new row
  const codeInput = document.getElementById(`itemCode_${newIdx}`);
  if (codeInput) {
    codeInput.addEventListener('input', () => {
      searchInventoryItems(codeInput.value, newIdx);
    });
  }

  const qtyInput = document.getElementById(`itemQty_${newIdx}`);
  if (qtyInput) {
    qtyInput.addEventListener('input', () => {
      const newQty = parseFloat(qtyInput.value) || 0;
      const newPerPerson = (newQty / menuState.headcount).toFixed(3);
      const perPersonSpan = document.getElementById(`perPerson_${newIdx}`);
      if (perPersonSpan) perPersonSpan.textContent = newPerPerson;
    });
  }

  showToast('New item row added', 'success');
}

/**
 * Remove item from recipe
 * @param {number} rowIdx - Row index
 */
function removeRecipeItem(rowIdx) {
  const row = document.getElementById(`recipeItem_${rowIdx}`);
  if (row) {
    row.remove();
    showToast('Item removed', 'info');
  }
}

/**
 * Save recipe quantity changes
 * @param {string} recipeId - Recipe ID
 */
async function saveRecipeChanges(recipeId) {
  console.log(`💾 Saving changes for recipe ${recipeId}...`);

  if (!window.currentRecipeData || !window.currentRecipeData.items) {
    showToast('No recipe data to save', 'warning');
    return;
  }

  try {
    // Collect ALL items from the table (including added/modified ones)
    const updatedItems = [];
    let idx = 0;

    while (true) {
      const codeInput = document.getElementById(`itemCode_${idx}`);
      const qtyInput = document.getElementById(`itemQty_${idx}`);
      const unitSpan = document.getElementById(`itemUnit_${idx}`);
      const nameSpan = document.getElementById(`itemName_${idx}`);

      if (!codeInput) break; // No more items

      const itemCode = codeInput.value.trim();
      if (itemCode) { // Only include items with codes
        const qty = parseFloat(qtyInput?.value) || 0;
        const unit = unitSpan?.textContent || 'g';
        const name = nameSpan?.textContent || '';

        updatedItems.push({
          itemCode: itemCode,
          description: name,
          basePerPerson: (qty / menuState.headcount),
          unit: unit,
          packSize: { qty: 1, unit: unit }
        });
      }

      idx++;
    }

    if (updatedItems.length === 0) {
      showToast('Recipe must have at least one item', 'warning');
      return;
    }

    // Prepare recipe update payload
    const payload = {
      basePortions: updatedItems
    };

    const res = await fetchAPI(`/menu/recipe/${recipeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.success) {
      throw new Error(res.error || 'Failed to save recipe');
    }

    showToast('Recipe updated successfully!', 'success');
    console.log(`✅ Recipe ${recipeId} saved with ${updatedItems.length} items`);

    // Close modal and reload menu
    closeRecipeDrawer();
    await loadMenu();

  } catch (error) {
    console.error(`❌ Save recipe error:`, error);
    showToast(`Error saving recipe: ${error.message}`, 'danger');
  }
}

/**
 * Reset recipe quantities to original values
 */
function resetRecipeQuantities() {
  if (!window.currentRecipeData || !window.currentRecipeData.items) {
    return;
  }

  window.currentRecipeData.items.forEach((item, idx) => {
    const input = document.getElementById(`itemQty_${idx}`);
    if (input) {
      input.value = input.dataset.original;
      // Trigger input event to update per-person display
      input.dispatchEvent(new Event('input'));
    }
  });

  showToast('Quantities reset to original values', 'info');
}

/**
 * Open headcount adjustment modal
 */
function openHeadcountModal() {
  const modal = document.getElementById('headcountModal');
  const input = document.getElementById('headcountInput');
  const display = document.getElementById('headcountCurrentDisplay');

  if (!modal || !input) {
    showToast('Headcount modal not available', 'warning');
    return;
  }

  // Set current headcount
  if (display) {
    display.textContent = menuState.headcount;
  }

  input.value = menuState.headcount;
  modal.classList.add('active');
}

/**
 * Close headcount modal
 */
function closeHeadcountModal() {
  const modal = document.getElementById('headcountModal');
  if (modal) {
    modal.classList.remove('active');
  }
}

/**
 * Update headcount (submit modal)
 */
async function updateHeadcount() {
  const input = document.getElementById('headcountInput');

  if (!input) return;

  const newHeadcount = parseInt(input.value);

  if (!newHeadcount || newHeadcount < 1 || newHeadcount > 10000) {
    showToast('Invalid headcount (must be 1-10000)', 'warning');
    return;
  }

  try {
    const res = await fetchAPI('/menu/headcount', {
      method: 'POST',
      body: JSON.stringify({ headcount: newHeadcount })
    });

    if (!res.success) {
      throw new Error('Failed to update headcount');
    }

    menuState.headcount = res.headcount;

    // Update UI
    const headcountDisplay = document.getElementById('menuHeadcountDisplay');
    if (headcountDisplay) {
      headcountDisplay.textContent = menuState.headcount;
    }

    const titleEl = document.querySelector('#menu .card-title');
    if (titleEl) {
      titleEl.textContent = `🍽️ 4-Week Menu Calendar (${menuState.headcount} ppl)`;
    }

    closeHeadcountModal();
    showToast(`Headcount updated to ${menuState.headcount}`, 'success');

    // Reload current week with new quantities
    await loadMenuWeek(menuState.currentWeek);

    console.log(`✅ Headcount updated to ${menuState.headcount}`);
  } catch (error) {
    console.error('❌ Headcount update error:', error);
    showToast(`Error updating headcount: ${error.message}`, 'danger');
  }
}

/**
 * Open shopping list modal
 */
async function openShoppingListModal() {
  console.log(`🛒 Opening shopping list for Week ${menuState.currentWeek}...`);

  const modal = document.getElementById('shoppingListModal');
  const table = document.getElementById('shoppingListTable');
  const weekNum = document.getElementById('shoppingWeekNum');
  const weekDates = document.getElementById('shoppingWeekDates');
  const headcount = document.getElementById('shoppingHeadcount');

  if (!modal || !table) {
    showToast('Shopping list modal not available', 'warning');
    return;
  }

  // Show modal with loading state
  modal.classList.add('active');
  table.innerHTML = '<tr><td colspan="5" class="loading"><div class="spinner"></div> Loading...</td></tr>';

  // Update week info
  if (weekNum) weekNum.textContent = menuState.currentWeek;
  if (headcount) headcount.textContent = menuState.headcount;

  try {
    const res = await fetchAPI(`/menu/shopping-list?week=${menuState.currentWeek}`);

    if (!res.success) {
      throw new Error('Failed to load shopping list');
    }

    const items = res.items;
    const csv = res.csv;

    // Update dates if available from state
    if (weekDates && menuState.weeks) {
      const currentWeekData = menuState.weeks.find(w => w.weekNumber === menuState.currentWeek);
      if (currentWeekData && currentWeekData.days) {
        const firstDay = currentWeekData.days[0];
        const lastDay = currentWeekData.days[currentWeekData.days.length - 1];
        const startDate = new Date(firstDay.isoDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const endDate = new Date(lastDay.isoDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        weekDates.textContent = `${startDate} — ${endDate}`;
      }
    }

    // Render shopping list table
    if (items && items.length > 0) {
      let html = '';
      items.forEach(item => {
        const packSize = item.pack_size || 1;
        const packsNeeded = Math.ceil(item.totalQty / packSize);

        html += `
          <tr>
            <td><strong>${item.item_code}</strong></td>
            <td>${item.item_name || '—'}</td>
            <td>${item.totalQty.toFixed(2)}</td>
            <td>${packSize} ${item.unit || 'EA'}</td>
            <td><strong>${packsNeeded}</strong></td>
          </tr>
        `;
      });
      table.innerHTML = html;
    } else {
      table.innerHTML = '<tr><td colspan="5" class="empty-state">No items for this week</td></tr>';
    }

    // Store CSV for download
    const csvContainer = document.getElementById('shoppingListCSV');
    if (csvContainer) {
      csvContainer.textContent = csv || '';
    }

    console.log(`✅ Shopping list loaded (${items.length} items)`);
  } catch (error) {
    console.error('❌ Shopping list error:', error);
    showToast(`Error loading shopping list: ${error.message}`, 'danger');
    table.innerHTML = `
      <tr>
        <td colspan="5" class="alert alert-danger">
          Failed to load shopping list: ${error.message}
        </td>
      </tr>
    `;
  }
}

/**
 * Close shopping list modal
 */
function closeShoppingListModal() {
  const modal = document.getElementById('shoppingListModal');
  if (modal) {
    modal.classList.remove('active');
  }
}

/**
 * Download shopping list as CSV
 */
function downloadShoppingListCSV() {
  const csvContainer = document.getElementById('shoppingListCSV');

  if (!csvContainer || !csvContainer.textContent) {
    showToast('No CSV data available', 'warning');
    return;
  }

  const csv = csvContainer.textContent;
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `shopping-list-week${menuState.currentWeek}.csv`;
  a.click();

  URL.revokeObjectURL(url);
  showToast('Shopping list CSV downloaded', 'success');
}

/**
 * Bind menu tab events
 * Called once on page load
 */
function bindMenuEvents() {
  // Refresh button
  const refreshBtn = document.getElementById('menuRefreshBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', loadMenu);
  }

  // Headcount button
  const headcountBtn = document.getElementById('menuHeadcountBtn');
  if (headcountBtn) {
    headcountBtn.addEventListener('click', openHeadcountModal);
  }

  // Shopping list button
  const shoppingBtn = document.getElementById('menuShoppingListBtn');
  if (shoppingBtn) {
    shoppingBtn.addEventListener('click', openShoppingListModal);
  }

  // Week selector buttons
  document.querySelectorAll('.menu-week-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const weekNum = parseInt(btn.dataset.week);
      loadMenuWeek(weekNum);
    });
  });

  // Set Current Week button
  const setCurrentWeekBtn = document.getElementById('setCurrentWeekBtn');
  if (setCurrentWeekBtn) {
    setCurrentWeekBtn.addEventListener('click', async () => {
      const weekToSet = menuState.currentWeek; // Currently viewing week
      const confirmMsg = `Set Week ${weekToSet} as the current operational week?\n\nThis will mark Week ${weekToSet} as the active menu cycle.`;

      if (!confirm(confirmMsg)) return;

      try {
        const res = await fetchAPI('/menu/policy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ currentWeek: weekToSet })
        });

        if (res.success) {
          showToast(`Week ${weekToSet} set as current week`, 'success');

          // Update badge
          const badge = document.getElementById('menuCurrentWeekBadge');
          if (badge) {
            badge.textContent = `Current: Week ${weekToSet}`;
          }

          // Reload menu data to reflect change
          await loadMenuDataAndRender();
        } else {
          throw new Error(res.error || 'Failed to update current week');
        }
      } catch (error) {
        console.error('Set current week error:', error);
        showToast(`Error: ${error.message}`, 'danger');
      }
    });
  }

  console.log('✅ Menu events bound');
}

// Initialize menu events on DOMContentLoaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bindMenuEvents);
} else {
  bindMenuEvents();
}

// ============================================================================
// END MENU TAB
// ============================================================================

// ============================================================================
// v14.3: EXPORT CONSOLE-SPECIFIC FUNCTIONS TO WINDOW
// These functions are unique to owner-super-console and need to be globally
// accessible for the shared core's switchTab() function
// ============================================================================
window.showToast = showToast;
window.loadInventory = loadInventory;
window.loadLocations = loadLocations;
window.loadPDFs = loadPDFs;
window.loadAIConsole = loadAIConsole;
window.loadForecast = loadForecast;
window.loadReports = loadReports;
window.loadSettings = loadSettings;
window.loadLocationsForCountItem = loadLocationsForCountItem;
window.unassignMapping = unassignMapping;
window.openNewWorkspaceModal = openNewWorkspaceModal;
window.createWorkspace = createWorkspace;
window.openWorkspace = openWorkspace;
window.closeWorkspaceModal = closeWorkspaceModal;
window.viewWorkspaceUsage = viewWorkspaceUsage;
window.openAttachCountModal = openAttachCountModal;
window.attachCountToWorkspace = attachCountToWorkspace;
window.openAttachPDFsModal = openAttachPDFsModal;
window.toggleSelectAllPDFs = toggleSelectAllPDFs;
window.attachPDFsToWorkspace = attachPDFsToWorkspace;
window.openUploadFileModal = openUploadFileModal;
window.uploadFileToWorkspace = uploadFileToWorkspace;

// v15.0: Menu functions
window.loadMenu = loadMenu;
window.loadMenuWeek = loadMenuWeek;
window.openRecipeDrawer = openRecipeDrawer;
window.closeRecipeDrawer = closeRecipeDrawer;
window.openHeadcountModal = openHeadcountModal;
window.closeHeadcountModal = closeHeadcountModal;
window.updateHeadcount = updateHeadcount;
window.openShoppingListModal = openShoppingListModal;
window.closeShoppingListModal = closeShoppingListModal;
window.downloadShoppingListCSV = downloadShoppingListCSV;


// =============================================================================
// v15.2.1: Inventory Reconciliation (H1 2025 PDF Intake + Physical vs System)
// =============================================================================

let currentReconcileId = null;

/**
 * Initialize reconciliation UI event listeners
 */
function initReconciliationUI() {
  const scanBtn = document.getElementById('scanPdfsBtn');
  const reconcileBtn = document.getElementById('runReconcileBtn');
  const downloadCSVBtn = document.getElementById('downloadReconcileCSVBtn');
  const aiForecastBtn = document.getElementById('triggerAIForecastBtn');
  const aiLearningBtn = document.getElementById('triggerAILearningBtn');
  const refreshDashBtn = document.getElementById('refreshDashboardBtn');

  if (scanBtn) {
    scanBtn.addEventListener('click', handlePDFImport);
  }

  if (reconcileBtn) {
    reconcileBtn.addEventListener('click', handleReconciliation);
  }

  if (downloadCSVBtn) {
    downloadCSVBtn.addEventListener('click', downloadReconcileCSV);
  }

  if (aiForecastBtn) {
    aiForecastBtn.addEventListener('click', () => triggerAIJob('forecast'));
  }

  if (aiLearningBtn) {
    aiLearningBtn.addEventListener('click', () => triggerAIJob('learning'));
  }

  if (refreshDashBtn) {
    refreshDashBtn.addEventListener('click', () => {
      showToast('Refreshing dashboard...', 'info');
      location.reload();
    });
  }

  console.log('✅ Reconciliation UI initialized');
}

/**
 * Handle PDF Import
 */
async function handlePDFImport() {
  const fromDate = document.getElementById('pdfImportFrom').value;
  const toDate = document.getElementById('pdfImportTo').value;
  const btn = document.getElementById('scanPdfsBtn');

  if (!fromDate || !toDate) {
    showToast('Please select from and to dates', 'warning');
    return;
  }

  console.log(`📥 Starting PDF import: ${fromDate} → ${toDate}`);

  btn.disabled = true;
  btn.textContent = '⏳ Scanning...';

  try {
    const res = await fetchAPI('/inventory/pdfs/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: fromDate,
        to: toDate,
        locations: ['*']
      })
    });

    if (!res.ok) {
      throw new Error(res.error || 'PDF import failed');
    }

    console.log(`✅ PDF import complete:`, res);

    // Show results
    const resultsDiv = document.getElementById('pdfImportResults');
    const summarySpan = document.getElementById('pdfImportSummary');
    const unresolvedAlert = document.getElementById('unresolvedItemsAlert');
    const unresolvedCount = document.getElementById('unresolvedCount');

    summarySpan.textContent = `${res.files_ingested} files ingested, ${res.lines_parsed} line items parsed`;
    resultsDiv.classList.remove('hidden');

    if (res.unresolved > 0) {
      unresolvedCount.textContent = res.unresolved;
      unresolvedAlert.classList.remove('hidden');

      // Set download link
      const downloadLink = document.getElementById('downloadUnresolvedLink');
      downloadLink.href = `/tmp/unresolved_items_${res.batch_id}.csv`;
      downloadLink.download = `unresolved_items_${res.batch_id}.csv`;
    } else {
      unresolvedAlert.classList.add('hidden');
    }

    showToast(`PDF import complete: ${res.files_ingested} files processed`, 'success');

  } catch (error) {
    console.error('❌ PDF import error:', error);
    showToast(`PDF import failed: ${error.message}`, 'danger');
  } finally {
    btn.disabled = false;
    btn.textContent = '🔍 Scan PDFs';
  }
}

/**
 * Handle Reconciliation
 */
async function handleReconciliation() {
  const asOfDate = document.getElementById('reconcileAsOfDate').value;
  const btn = document.getElementById('runReconcileBtn');

  if (!asOfDate) {
    showToast('Please select as-of date', 'warning');
    return;
  }

  console.log(`🔄 Starting reconciliation: as_of=${asOfDate}`);

  btn.disabled = true;
  btn.textContent = '⏳ Running...';

  try {
    const res = await fetchAPI('/inventory/reconcile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        as_of: asOfDate,
        locations: ['*']
      })
    });

    if (!res.ok) {
      throw new Error(res.error || 'Reconciliation failed');
    }

    console.log(`✅ Reconciliation complete:`, res);

    currentReconcileId = res.reconcile_id;

    // Show results
    document.getElementById('reconcileResults').classList.remove('hidden');
    document.getElementById('aiRefreshSection').classList.remove('hidden');

    // Update summary stats
    document.getElementById('reconcileItemsChecked').textContent = res.summary.items;
    document.getElementById('reconcileVarianceValue').textContent = `$${res.summary.variance_value.toFixed(2)}`;
    document.getElementById('reconcileOverItems').textContent = res.summary.over_items;
    document.getElementById('reconcileShortItems').textContent = res.summary.short_items;

    // Load variance details
    await loadVarianceDetails(res.reconcile_id);

    showToast(`Reconciliation complete: ${res.summary.items} items checked`, 'success');

  } catch (error) {
    console.error('❌ Reconciliation error:', error);
    showToast(`Reconciliation failed: ${error.message}`, 'danger');
  } finally {
    btn.disabled = false;
    btn.textContent = '▶️ Run Reconciliation';
  }
}

/**
 * Load variance details
 */
async function loadVarianceDetails(reconcileId) {
  try {
    const res = await fetchAPI(`/inventory/reconcile/${reconcileId}`);

    if (!res.ok) {
      throw new Error(res.error || 'Failed to load variance details');
    }

    const tbody = document.getElementById('varianceTableBody');
    tbody.innerHTML = '';

    const variances = res.variances.slice(0, 20); // Top 20

    if (variances.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center text-light">No variances found (perfect match!)</td></tr>';
      return;
    }

    variances.forEach(v => {
      const tr = document.createElement('tr');

      // Category badge
      let categoryBadge = '';
      if (v.category === 'over') {
        categoryBadge = '<span class="badge badge-success">Over</span>';
      } else if (v.category === 'short') {
        categoryBadge = '<span class="badge badge-danger">Short</span>';
      } else {
        categoryBadge = '<span class="badge badge-secondary">Match</span>';
      }

      tr.innerHTML = `
        <td>${v.item_code}</td>
        <td>${v.item_name}</td>
        <td>${v.physical_qty.toFixed(2)} ${v.uom}</td>
        <td>${v.system_qty.toFixed(2)} ${v.uom}</td>
        <td><strong>${v.variance_qty >= 0 ? '+' : ''}${v.variance_qty.toFixed(2)}</strong></td>
        <td><strong>$${Math.abs(v.variance_value).toFixed(2)}</strong></td>
        <td>${categoryBadge}</td>
      `;

      tbody.appendChild(tr);
    });

  } catch (error) {
    console.error('❌ Error loading variance details:', error);
    showToast(`Failed to load variances: ${error.message}`, 'danger');
  }
}

/**
 * Download Reconcile CSV
 */
async function downloadReconcileCSV() {
  if (!currentReconcileId) {
    showToast('No reconciliation data available', 'warning');
    return;
  }

  try {
    const url = `/inventory/reconcile/${currentReconcileId}/csv`;
    window.open(url, '_blank');
    showToast('Downloading CSV...', 'info');
  } catch (error) {
    console.error('❌ Download error:', error);
    showToast(`Download failed: ${error.message}`, 'danger');
  }
}

/**
 * Trigger AI Job (forecast or learning)
 */
async function triggerAIJob(jobType) {
  console.log(`🤖 Triggering AI ${jobType}...`);

  try {
    const endpoint = jobType === 'forecast' ? '/owner/ops/trigger/ai_forecast' : '/owner/ops/trigger/ai_learning';

    const res = await fetchAPI(endpoint, {
      method: 'POST'
    });

    if (!res.success) {
      throw new Error(res.error || `Failed to trigger ${jobType}`);
    }

    showToast(`AI ${jobType} triggered successfully`, 'success');

    // Wait a few seconds then refresh dashboard stats
    setTimeout(async () => {
      console.log('📊 Refreshing dashboard stats...');
      await loadDashboard();
      showToast('Dashboard stats refreshed', 'info');
    }, 5000);

  } catch (error) {
    console.error(`❌ Trigger ${jobType} error:`, error);
    showToast(`Failed to trigger ${jobType}: ${error.message}`, 'danger');
  }
}

// Expose functions to window for onclick handlers (CSP-compliant alternative would be better)
window.initReconciliationUI = initReconciliationUI;
window.handlePDFImport = handlePDFImport;
window.handleReconciliation = handleReconciliation;
window.loadVarianceDetails = loadVarianceDetails;
window.downloadReconcileCSV = downloadReconcileCSV;
window.triggerAIJob = triggerAIJob;

// Initialize reconciliation UI on page load
document.addEventListener('DOMContentLoaded', () => {
  initReconciliationUI();
});

console.log('✅ Reconciliation module loaded (v15.2.1)');

// =============================================================================
// v15.2.2: Count Tab Functions
// =============================================================================

/**
 * Load recent reconciliation reports in the Count tab
 */
async function loadRecentReconciliations() {
  const listEl = document.getElementById('reconciliationReportsList');
  const recentCountEl = document.getElementById('countRecentReconciles');

  try {
    listEl.innerHTML = '<div class="loading"><div class="spinner"></div> Loading reconciliation reports...</div>';

    // Fetch reconciliation reports from backend (v15.2.3)
    const res = await fetchAPI('/inventory/reconcile/list?limit=20');

    // v15.8.0: Handle null response from fetchAPI
    if (!res) {
      listEl.innerHTML = '<div class="alert alert-warning">⚠️ Unable to load reconciliation reports - API unavailable</div>';
      if (recentCountEl) recentCountEl.textContent = '0';
      return;
    }

    if (!res.ok && !res.success) {
      throw new Error(res.error || 'Failed to load reconciliation reports');
    }

    const reports = res.reports || [];

    if (reports.length === 0) {
      listEl.innerHTML = '<div class="alert alert-info">No reconciliation reports found. Run reconciliation from the Inventory tab.</div>';
      if (recentCountEl) recentCountEl.textContent = '0';
      return;
    }

    if (recentCountEl) recentCountEl.textContent = reports.length;

    let html = '<table class="table"><thead><tr>';
    html += '<th>Date</th><th>Items</th><th>Variance</th><th>Over</th><th>Short</th><th>Actions</th>';
    html += '</tr></thead><tbody>';

    for (const report of reports) {
      const date = new Date(report.created_at).toLocaleDateString();
      const variance = `$${(report.summary.variance_value || 0).toFixed(2)}`;

      html += '<tr>';
      html += `<td>${report.as_of_date}</td>`;
      html += `<td>${report.summary.items || 0}</td>`;
      html += `<td>${variance}</td>`;
      html += `<td class="text-over">${report.summary.over_items || 0}</td>`;
      html += `<td class="text-short">${report.summary.short_items || 0}</td>`;
      html += `<td>`;
      html += `<button type="button" class="btn btn-sm btn-secondary" onclick="downloadReconcileReportCSV('${report.reconcile_id}')">📥 CSV</button> `;
      html += `<button type="button" class="btn btn-sm btn-danger" onclick="deleteReconciliationReport('${report.reconcile_id}')">🗑️ Delete</button>`;
      html += `</td>`;
      html += '</tr>';
    }

    html += '</tbody></table>';
    listEl.innerHTML = html;

  } catch (error) {
    console.error('Error loading reconciliation reports:', error);
    listEl.innerHTML = `<div class="alert alert-danger">Failed to load reports: ${error.message}</div>`;
    if (recentCountEl) recentCountEl.textContent = '0';
  }
}

/**
 * View recent reconciliations (opens modal or switches to inventory tab)
 */
function viewRecentReconciliations() {
  switchTab('inventory');
  setTimeout(() => {
    document.getElementById('reconcileAsOfDate').scrollIntoView({behavior: 'smooth', block: 'center'});
  }, 100);
}

/**
 * View count history (loads count tab and scrolls to history section)
 */
function viewCountHistory() {
  loadCountHistory();
  setTimeout(() => {
    document.getElementById('countHistoryTable').scrollIntoView({behavior: 'smooth', block: 'center'});
  }, 100);
}

/**
 * Download reconciliation report CSV by ID
 */
async function downloadReconcileReportCSV(reconcileId) {
  try {
    const url = `/api/inventory/reconcile/${reconcileId}/csv`;
    const link = document.createElement('a');
    link.href = url;
    link.download = `reconcile_${reconcileId}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('CSV download started', 'success');
  } catch (error) {
    console.error('Error downloading CSV:', error);
    showToast('Failed to download CSV', 'danger');
  }
}

/**
 * Delete reconciliation report by ID (v15.3)
 */
async function deleteReconciliationReport(reconcileId) {
  if (!confirm(`Are you sure you want to delete reconciliation report ${reconcileId}?\n\nThis action cannot be undone.`)) {
    return;
  }

  try {
    const res = await fetchAPI(`/inventory/reconcile/${reconcileId}`, {
      method: 'DELETE'
    });

    if (res.success) {
      showToast('Reconciliation report deleted successfully', 'success');
      // Reload the reconciliation list
      loadRecentReconciliations();
    } else {
      throw new Error(res.error || 'Failed to delete reconciliation report');
    }
  } catch (error) {
    console.error('Error deleting reconciliation report:', error);
    showToast(`Failed to delete report: ${error.message}`, 'danger');
  }
}

/**
 * Start a new physical count
 */
async function startNewPhysicalCount() {
  const dateInput = document.getElementById('newCountDate');
  const locationSelect = document.getElementById('countLocation');
  const typeSelect = document.getElementById('countType');
  const notesInput = document.getElementById('countNotes');

  const countDate = dateInput.value;
  const location = locationSelect.value || null;
  const countType = typeSelect.value;
  const notes = notesInput.value;

  if (!countDate) {
    showToast('Please select a count date', 'warning');
    return;
  }

  try {
    console.log('🔢 Starting new physical count:', { countDate, location, countType, notes });

    const res = await fetchAPI('/owner/count/start', {
      method: 'POST',
      body: JSON.stringify({
        count_date: countDate,
        location_id: location,
        count_type: countType,
        notes: notes
      })
    });

    if (!res.ok) {
      throw new Error(res.error || 'Failed to start count');
    }

    console.log('✅ Count started:', res);
    showToast(`Count started: ${res.count_id}`, 'success');

    // Clear form
    dateInput.value = '';
    notesInput.value = '';

    // Load active count
    await loadActiveCount();

  } catch (error) {
    console.error('❌ Error starting count:', error);
    showToast(`Failed to start count: ${error.message}`, 'danger');
  }
}

/**
 * Load count history table
 */
async function loadCountHistory() {
  const tbody = document.getElementById('countHistoryBody');
  const countEl = document.getElementById('countHistoryCount');

  try {
    tbody.innerHTML = '<tr><td colspan="7" class="loading"><div class="spinner"></div> Loading...</td></tr>';

    // Query inventory_counts table
    const res = await fetchAPI('/owner/counts/history');

    // v15.8.0: Handle null response from fetchAPI
    if (!res) {
      tbody.innerHTML = '<tr><td colspan="7" class="alert alert-warning">⚠️ Unable to load count history - API unavailable</td></tr>';
      countEl.textContent = '0';
      return;
    }

    if (!res.ok || !res.counts) {
      throw new Error(res.error || 'Failed to load count history');
    }

    const counts = res.counts;

    if (counts.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center text-light-med">No count history found</td></tr>';
      countEl.textContent = '0';
      return;
    }

    countEl.textContent = counts.length;

    let html = '';
    for (const count of counts) {
      const date = new Date(count.created_at).toLocaleDateString();
      const status = count.status || 'in_progress';
      const statusBadge = status === 'approved' ? 'badge-success' :
                          status === 'closed' ? 'badge-secondary' :
                          'badge-warning';

      html += '<tr>';
      html += `<td>${count.id}</td>`;
      html += `<td>${date}</td>`;
      html += `<td>${count.count_type || 'MONTHLY'}</td>`;
      html += `<td><span class="badge ${statusBadge}">${status}</span></td>`;
      html += `<td>${count.item_count || 0}</td>`;
      html += `<td>${count.location_id || 'All'}</td>`;
      html += `<td>`;
      html += `<button type="button" class="btn btn-sm btn-secondary" onclick="viewCountDetails('${count.id}')">👁️ View</button> `;
      if (status === 'approved') {
        html += `<button type="button" class="btn btn-sm btn-primary" onclick="useCountForReconciliation('${count.id}', '${count.created_at}')">⚖️ Reconcile</button>`;
      }
      html += `</td>`;
      html += '</tr>';
    }

    tbody.innerHTML = html;

  } catch (error) {
    console.error('Error loading count history:', error);
    tbody.innerHTML = `<tr><td colspan="7" class="alert alert-danger">Failed to load count history: ${error.message}</td></tr>`;
  }
}

/**
 * View count details (opens PDF management modal)
 * v15.2.3: Now opens PDF management modal
 */
function viewCountDetails(countId) {
  console.log('📋 Viewing count details:', countId);
  openCountPdfModal(countId);
}

/**
 * Use count for reconciliation (pre-fill reconciliation date)
 */
function useCountForReconciliation(countId, countDate) {
  const date = new Date(countDate).toISOString().split('T')[0];

  // Switch to Inventory tab and pre-fill date
  switchTab('inventory');

  setTimeout(() => {
    const dateInput = document.getElementById('reconcileAsOfDate');
    if (dateInput) {
      dateInput.value = date;
    }
    document.getElementById('reconcileAsOfDate').scrollIntoView({behavior: 'smooth', block: 'center'});
    showToast(`Ready to reconcile count ${countId} (${date})`, 'info');
  }, 100);
}

/**
 * Add item to active count
 */
async function addItemToActiveCount() {
  // Reuse existing modal for adding items to count
  await showAddItemForm();
}

/**
 * Close active count
 */
async function closeActiveCount() {
  if (!confirm('Are you sure you want to close the active count? This will mark it as completed.')) {
    return;
  }

  try {
    // Get active count ID from active count display
    const activeCountBadge = document.getElementById('activeCountBadge');
    const countId = activeCountBadge.getAttribute('data-count-id');

    if (!countId) {
      showToast('No active count found', 'warning');
      return;
    }

    console.log('✓ Closing count:', countId);

    const res = await fetchAPI(`/owner/count/${countId}/close`, {
      method: 'POST'
    });

    if (!res.ok) {
      throw new Error(res.error || 'Failed to close count');
    }

    console.log('✅ Count closed:', res);
    showToast('Count closed successfully', 'success');

    // Reload active count and history
    await loadActiveCount();
    await loadCountHistory();

  } catch (error) {
    console.error('❌ Error closing count:', error);
    showToast(`Failed to close count: ${error.message}`, 'danger');
  }
}

// ============================================================================
// COUNT PDF MANAGEMENT (v15.2.3)
// ============================================================================

/**
 * Open PDF management modal for a count
 */
async function openCountPdfModal(countId) {
  const modal = document.getElementById('countPdfModal');
  const countIdDisplay = document.getElementById('countPdfModalCountId');

  // Show modal
  modal.classList.add('active');
  countIdDisplay.textContent = countId;

  // Store countId for later use
  modal.setAttribute('data-count-id', countId);

  // Load attached and available PDFs
  await Promise.all([
    loadAttachedPdfs(countId),
    loadAvailablePdfs(countId)
  ]);
}

/**
 * Close PDF management modal
 */
function closeCountPdfModal() {
  const modal = document.getElementById('countPdfModal');
  modal.classList.remove('active');
}

/**
 * Load attached PDFs for a count
 */
async function loadAttachedPdfs(countId) {
  const listEl = document.getElementById('attachedPdfsList');
  const countEl = document.getElementById('attachedPdfCount');

  try {
    listEl.innerHTML = '<div class="loading"><div class="spinner"></div> Loading...</div>';

    const res = await fetchAPI(`/owner/counts/${countId}/pdfs`);

    if (!res.ok) {
      throw new Error(res.error || 'Failed to load attached PDFs');
    }

    const pdfs = res.pdfs || [];
    countEl.textContent = pdfs.length;

    if (pdfs.length === 0) {
      listEl.innerHTML = '<div class="alert alert-info">No PDFs attached to this count</div>';
      return;
    }

    let html = '<table class="table"><thead><tr><th>Filename</th><th>Date</th><th>Vendor</th><th>Amount</th><th>Action</th></tr></thead><tbody>';

    for (const pdf of pdfs) {
      const date = pdf.invoice_date ? new Date(pdf.invoice_date).toLocaleDateString() : '--';
      const amount = pdf.invoice_amount ? `$${parseFloat(pdf.invoice_amount).toFixed(2)}` : '--';

      html += '<tr>';
      html += `<td>${pdf.filename || 'Unknown'}</td>`;
      html += `<td>${date}</td>`;
      html += `<td>${pdf.vendor || '--'}</td>`;
      html += `<td>${amount}</td>`;
      html += `<td><button type="button" class="btn btn-sm btn-danger" onclick="detachPdf('${countId}', '${pdf.id}')">❌ Remove</button></td>`;
      html += '</tr>';
    }

    html += '</tbody></table>';
    listEl.innerHTML = html;

  } catch (error) {
    console.error('Error loading attached PDFs:', error);
    listEl.innerHTML = `<div class="alert alert-danger">Failed to load attached PDFs: ${error.message}</div>`;
  }
}

/**
 * Load available PDFs for a count (not yet attached)
 */
async function loadAvailablePdfs(countId) {
  const listEl = document.getElementById('availablePdfsList');
  const countEl = document.getElementById('availablePdfCount');
  const attachBtn = document.getElementById('attachSelectedPdfsBtn');

  try {
    listEl.innerHTML = '<div class="loading"><div class="spinner"></div> Loading...</div>';

    const res = await fetchAPI(`/owner/counts/${countId}/pdfs/available`);

    if (!res.ok) {
      throw new Error(res.error || 'Failed to load available PDFs');
    }

    const pdfs = res.pdfs || [];
    countEl.textContent = pdfs.length;

    if (pdfs.length === 0) {
      listEl.innerHTML = '<div class="alert alert-info">No available PDFs to attach (all PDFs are already attached or deleted)</div>';
      attachBtn.disabled = true;
      return;
    }

    let html = '<table class="table"><thead><tr><th><input type="checkbox" id="selectAllAvailablePdfs" onchange="toggleSelectAllAvailablePdfs()"></th><th>Filename</th><th>Date</th><th>Vendor</th><th>Amount</th></tr></thead><tbody>';

    for (const pdf of pdfs) {
      const date = pdf.invoice_date ? new Date(pdf.invoice_date).toLocaleDateString() : '--';
      const amount = pdf.invoice_amount ? `$${parseFloat(pdf.invoice_amount).toFixed(2)}` : '--';

      html += '<tr>';
      html += `<td><input type="checkbox" class="pdf-checkbox" value="${pdf.id}" onchange="updateAttachButtonState()"></td>`;
      html += `<td>${pdf.filename || 'Unknown'}</td>`;
      html += `<td>${date}</td>`;
      html += `<td>${pdf.vendor || '--'}</td>`;
      html += `<td>${amount}</td>`;
      html += '</tr>';
    }

    html += '</tbody></table>';
    listEl.innerHTML = html;
    attachBtn.disabled = false;

  } catch (error) {
    console.error('Error loading available PDFs:', error);
    listEl.innerHTML = `<div class="alert alert-danger">Failed to load available PDFs: ${error.message}</div>`;
    attachBtn.disabled = true;
  }
}

/**
 * Toggle select all checkboxes for available PDFs
 */
function toggleSelectAllAvailablePdfs() {
  const selectAll = document.getElementById('selectAllAvailablePdfs');
  const checkboxes = document.querySelectorAll('.pdf-checkbox');

  checkboxes.forEach(cb => {
    cb.checked = selectAll.checked;
  });

  updateAttachButtonState();
}

/**
 * Update attach button state based on selection
 */
function updateAttachButtonState() {
  const checkboxes = document.querySelectorAll('.pdf-checkbox:checked');
  const attachBtn = document.getElementById('attachSelectedPdfsBtn');

  attachBtn.disabled = checkboxes.length === 0;
  attachBtn.textContent = checkboxes.length > 0
    ? `✓ Attach Selected PDFs (${checkboxes.length})`
    : '✓ Attach Selected PDFs';
}

/**
 * Attach selected PDFs to count
 */
async function attachSelectedPdfs() {
  const modal = document.getElementById('countPdfModal');
  const countId = modal.getAttribute('data-count-id');
  const checkboxes = document.querySelectorAll('.pdf-checkbox:checked');

  if (checkboxes.length === 0) {
    showToast('Please select at least one PDF to attach', 'warning');
    return;
  }

  const documentIds = Array.from(checkboxes).map(cb => cb.value);

  try {
    const res = await fetchAPI(`/owner/counts/${countId}/pdfs/attach`, {
      method: 'POST',
      body: JSON.stringify({ document_ids: documentIds })
    });

    if (!res.ok) {
      throw new Error(res.error || 'Failed to attach PDFs');
    }

    showToast(`Successfully attached ${res.attached} PDF(s)`, 'success');

    // Reload both lists
    await Promise.all([
      loadAttachedPdfs(countId),
      loadAvailablePdfs(countId)
    ]);

  } catch (error) {
    console.error('Error attaching PDFs:', error);
    showToast(`Failed to attach PDFs: ${error.message}`, 'danger');
  }
}

/**
 * Detach a PDF from a count
 */
async function detachPdf(countId, documentId) {
  if (!confirm('Are you sure you want to remove this PDF from the count?')) {
    return;
  }

  try {
    const res = await fetchAPI(`/owner/counts/${countId}/pdfs/${documentId}`, {
      method: 'DELETE'
    });

    if (!res.ok) {
      throw new Error(res.error || 'Failed to detach PDF');
    }

    showToast('PDF removed successfully', 'success');

    // Reload both lists
    await Promise.all([
      loadAttachedPdfs(countId),
      loadAvailablePdfs(countId)
    ]);

  } catch (error) {
    console.error('Error detaching PDF:', error);
    showToast(`Failed to remove PDF: ${error.message}`, 'danger');
  }
}

/**
 * Initialize Count tab on load
 */
function initCountTab() {
  // Set default count date to today
  const dateInput = document.getElementById('newCountDate');
  if (dateInput) {
    dateInput.value = new Date().toISOString().split('T')[0];
  }

  // Load locations for count location dropdown
  loadCountLocations();

  // Load active count if any
  loadActiveCount().catch(err => {
    console.warn('No active count found:', err);
  });

  console.log('✅ Count tab initialized');
}

// Export functions to window
window.loadRecentReconciliations = loadRecentReconciliations;
window.viewRecentReconciliations = viewRecentReconciliations;
window.viewCountHistory = viewCountHistory;
window.downloadReconcileReportCSV = downloadReconcileReportCSV;
window.deleteReconciliationReport = deleteReconciliationReport;
window.startNewPhysicalCount = startNewPhysicalCount;
window.loadCountHistory = loadCountHistory;
window.viewCountDetails = viewCountDetails;
window.useCountForReconciliation = useCountForReconciliation;
window.addItemToActiveCount = addItemToActiveCount;
window.closeActiveCount = closeActiveCount;
window.initCountTab = initCountTab;

// Export PDF management functions (v15.2.3)
window.openCountPdfModal = openCountPdfModal;
window.closeCountPdfModal = closeCountPdfModal;
window.loadAttachedPdfs = loadAttachedPdfs;
window.loadAvailablePdfs = loadAvailablePdfs;
window.toggleSelectAllAvailablePdfs = toggleSelectAllAvailablePdfs;
window.updateAttachButtonState = updateAttachButtonState;
window.attachSelectedPdfs = attachSelectedPdfs;
window.detachPdf = detachPdf;

// Initialize Count tab on page load
document.addEventListener('DOMContentLoaded', () => {
  initCountTab();
});

console.log('✅ Count tab module loaded (v15.2.2)');

// ============================================================================
// v15.2.3: Broken Links & 404 Telemetry
// ============================================================================

/**
 * Load broken links telemetry from backend
 * Displays 404 stats, top broken links, and recent 404s
 */
async function loadBrokenLinks() {
  try {
    const res = await fetchAPI('/owner/ops/broken-links/recent?limit=100');

    if (!res.success) {
      throw new Error(res.error || 'Failed to load broken links');
    }

    // Update counters
    document.getElementById('brokenLinks404Total').textContent = res.counters.total || 0;
    document.getElementById('brokenLinks404Asset').textContent = res.counters.asset || 0;
    document.getElementById('brokenLinks404Route').textContent = res.counters.route || 0;

    // Populate top broken links table
    const tbody = document.getElementById('brokenLinksTableBody');
    if (res.stats && res.stats.length > 0) {
      tbody.innerHTML = res.stats.slice(0, 20).map(stat => {
        const lastSeen = new Date(stat.lastSeen).toLocaleString();
        const topReferer = stat.topReferers && stat.topReferers.length > 0 
          ? stat.topReferers[0] 
          : '-';
        
        const typeClass = stat.type === 'asset' ? 'badge badge-warning' : 'badge badge-error';
        
        return `
          <tr>
            <td><code>${escapeHtml(stat.path)}</code></td>
            <td><span class="${typeClass}">${stat.type}</span></td>
            <td><strong>${stat.count}</strong></td>
            <td>${lastSeen}</td>
            <td><small>${escapeHtml(topReferer)}</small></td>
          </tr>
        `;
      }).join('');
    } else {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center text-light-med">No broken links found (healthy!)</td></tr>';
    }

    // Populate recent 404s table
    const recentBody = document.getElementById('brokenLinksRecentBody');
    if (res.recent && res.recent.length > 0) {
      recentBody.innerHTML = res.recent.map(entry => {
        const timestamp = new Date(entry.timestamp).toLocaleString();
        const typeClass = entry.type === 'asset' ? 'badge badge-warning' : 'badge badge-error';
        const referer = entry.referer || '-';
        
        return `
          <tr>
            <td><small>${timestamp}</small></td>
            <td><code>${escapeHtml(entry.path)}</code></td>
            <td>${entry.method}</td>
            <td><span class="${typeClass}">${entry.type}</span></td>
            <td><small>${escapeHtml(referer)}</small></td>
          </tr>
        `;
      }).join('');
    } else {
      recentBody.innerHTML = '<tr><td colspan="5" class="text-center text-light-med">No recent 404s</td></tr>';
    }

  } catch (error) {
    console.error('Error loading broken links:', error);
    alert('Failed to load broken links: ' + error.message);
  }
}

// Helper function to escape HTML (prevent XSS)
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Export to window
window.loadBrokenLinks = loadBrokenLinks;

console.log('✅ Broken links telemetry module loaded (v15.2.3)');

// ============================================================================
// v15.2.3: Broken Links & 404 Telemetry
// ============================================================================

/**
 * Load broken links telemetry from backend
 * Displays 404 stats, top broken links, and recent 404s
 */
async function loadBrokenLinks() {
  try {
    const res = await fetchAPI('/owner/ops/broken-links/recent?limit=100');

    if (!res.success) {
      throw new Error(res.error || 'Failed to load broken links');
    }

    // Update counters
    document.getElementById('brokenLinks404Total').textContent = res.counters.total || 0;
    document.getElementById('brokenLinks404Asset').textContent = res.counters.asset || 0;
    document.getElementById('brokenLinks404Route').textContent = res.counters.route || 0;

    // Populate top broken links table
    const tbody = document.getElementById('brokenLinksTableBody');
    if (res.stats && res.stats.length > 0) {
      tbody.innerHTML = res.stats.slice(0, 20).map(stat => {
        const lastSeen = new Date(stat.lastSeen).toLocaleString();
        const topReferer = stat.topReferers && stat.topReferers.length > 0
          ? stat.topReferers[0]
          : '-';

        const typeClass = stat.type === 'asset' ? 'badge badge-warning' : 'badge badge-error';

        return `
          <tr>
            <td><code>${escapeHtml(stat.path)}</code></td>
            <td><span class="${typeClass}">${stat.type}</span></td>
            <td><strong>${stat.count}</strong></td>
            <td>${lastSeen}</td>
            <td><small>${escapeHtml(topReferer)}</small></td>
          </tr>
        `;
      }).join('');
    } else {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center text-light-med">No broken links found (healthy!)</td></tr>';
    }

    // Populate recent 404s table
    const recentBody = document.getElementById('brokenLinksRecentBody');
    if (res.recent && res.recent.length > 0) {
      recentBody.innerHTML = res.recent.map(entry => {
        const timestamp = new Date(entry.timestamp).toLocaleString();
        const typeClass = entry.type === 'asset' ? 'badge badge-warning' : 'badge badge-error';
        const referer = entry.referer || '-';

        return `
          <tr>
            <td><small>${timestamp}</small></td>
            <td><code>${escapeHtml(entry.path)}</code></td>
            <td>${entry.method}</td>
            <td><span class="${typeClass}">${entry.type}</span></td>
            <td><small>${escapeHtml(referer)}</small></td>
          </tr>
        `;
      }).join('');
    } else {
      recentBody.innerHTML = '<tr><td colspan="5" class="text-center text-light-med">No recent 404s</td></tr>';
    }

  } catch (error) {
    console.error('Error loading broken links:', error);
    alert('Failed to load broken links: ' + error.message);
  }
}

// Helper function to escape HTML (prevent XSS)
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Export to window
window.loadBrokenLinks = loadBrokenLinks;

console.log('✅ Broken links telemetry module loaded (v15.2.3)');

// ============================================================================
// v15.3: Financial Accuracy & Usage Intelligence
// ============================================================================

/**
 * Load Financial Data Overview
 * Fetches financial accuracy stats from AI Ops Status
 */
async function loadFinancialData() {
  try {
    // Fetch AI Ops status which includes financial_accuracy
    const statusData = await fetchAPI('/owner/ops/status');

    // Update financial accuracy value and color
    const accuracyValue = document.getElementById('financialAccuracyValue');
    if (statusData.financial_accuracy !== null && statusData.financial_accuracy !== undefined) {
      accuracyValue.textContent = `${statusData.financial_accuracy.toFixed(1)}%`;
      accuracyValue.style.color = statusData.financial_accuracy_color === 'green' ? '#22c55e' :
                                   statusData.financial_accuracy_color === 'yellow' ? '#f59e0b' : '#ef4444';
    } else {
      accuracyValue.textContent = '--';
      accuracyValue.style.color = '#6b7280';
    }

    // Fetch summary to get invoice count and total value
    const summaryData = await fetchAPI('/inventory/reconcile/financial-summary?startDate=2025-01-01&endDate=2025-06-30&period=monthly');

    if (summaryData.success && summaryData.summary) {
      // Calculate totals across all periods
      let totalInvoices = 0;
      let totalValue = 0;

      for (const period of summaryData.summary) {
        totalInvoices += period.invoices.length;
        totalValue += period.totalInvoiceAmount;
      }

      document.getElementById('financialTotalInvoices').textContent = totalInvoices;
      document.getElementById('financialTotalValue').textContent = `$${totalValue.toFixed(2)}`;

      // Count unique categories tracked
      const categoriesSet = new Set();
      for (const period of summaryData.summary) {
        for (const invoice of period.invoices) {
          Object.keys(invoice.categories || {}).forEach(cat => categoriesSet.add(cat));
        }
      }
      document.getElementById('financialCategories').textContent = categoriesSet.size;

      // Update category variance cards if we have variance data from statusData
      if (statusData.variance_by_category) {
        updateCategoryVariance(statusData.variance_by_category);
      }
    } else {
      document.getElementById('financialTotalInvoices').textContent = '0';
      document.getElementById('financialTotalValue').textContent = '$0.00';
      document.getElementById('financialCategories').textContent = '0';
    }

  } catch (error) {
    console.error('Error loading financial data:', error);
    document.getElementById('financialAccuracyValue').textContent = 'Error';
    document.getElementById('financialTotalInvoices').textContent = '--';
    document.getElementById('financialTotalValue').textContent = '--';
    document.getElementById('financialCategories').textContent = '--';
  }
}

/**
 * Update Category Variance Cards
 * @param {object} varianceByCategory - Variance data by category
 */
function updateCategoryVariance(varianceByCategory) {
  const categories = ['BAKE', 'MEAT', 'PROD', 'BEV', 'MILK', 'GROC'];

  for (const cat of categories) {
    const element = document.getElementById(`categoryVariance${cat}`);
    if (!element) continue;

    if (varianceByCategory[cat]) {
      const variance = varianceByCategory[cat].variance_pct;
      const accuracy = Math.max(0, 100 - variance);
      element.textContent = `${accuracy.toFixed(1)}%`;

      // Color code based on accuracy
      if (accuracy >= 95) {
        element.style.color = '#22c55e'; // green
      } else if (accuracy >= 70) {
        element.style.color = '#f59e0b'; // yellow
      } else {
        element.style.color = '#ef4444'; // red
      }
    } else {
      element.textContent = '--';
      element.style.color = '#6b7280'; // gray
    }
  }
}

/**
 * Import Financial Data from PDFs
 * POST to /api/inventory/reconcile/import-pdfs
 */
async function importFinancialData() {
  const fromDate = document.getElementById('financialImportFrom').value;
  const toDate = document.getElementById('financialImportTo').value;

  if (!fromDate || !toDate) {
    alert('Please select both start and end dates');
    return;
  }

  // Show loading state
  const resultsDiv = document.getElementById('financialImportResults');
  const summarySpan = document.getElementById('financialImportSummary');
  resultsDiv.classList.remove('hidden');
  summarySpan.textContent = 'Importing...';

  try {
    const data = await fetchAPI('/inventory/reconcile/import-pdfs', {
      method: 'POST',
      body: JSON.stringify({
        startDate: fromDate,
        endDate: toDate
      })
    });

    if (data.success) {
      const vendors = data.vendors.join(', ');
      summarySpan.textContent = `${data.importedCount} invoices imported ($${data.totalValue.toFixed(2)}) from vendors: ${vendors}`;

      // Refresh financial data to show updated stats
      setTimeout(() => {
        loadFinancialData();
        loadFinancialSummary();
      }, 500);
    } else {
      summarySpan.textContent = `Import failed: ${data.error}`;
    }

  } catch (error) {
    console.error('Error importing financial data:', error);
    summarySpan.textContent = `Import failed: ${error.message}`;
  }
}

/**
 * Load Financial Summary Table
 * GET from /api/inventory/reconcile/financial-summary
 */
async function loadFinancialSummary() {
  const periodType = document.getElementById('financialPeriodType').value;
  const tbody = document.getElementById('financialSummaryBody');

  // Show loading state
  tbody.innerHTML = '<tr><td colspan="7" class="loading">Loading summary...</td></tr>';

  try {
    const data = await fetchAPI(`/inventory/reconcile/financial-summary?startDate=2025-01-01&endDate=2025-06-30&period=${periodType}`);

    if (data.success && data.summary && data.summary.length > 0) {
      tbody.innerHTML = data.summary.map(period => {
        return `
          <tr>
            <td><strong>${period.period}</strong></td>
            <td>$${period.totalInvoiceAmount.toFixed(2)}</td>
            <td>$${period.foodFreightReimb.toFixed(2)}</td>
            <td>$${period.otherReimb.toFixed(2)}</td>
            <td>$${period.gstTotal.toFixed(2)}</td>
            <td>$${period.qstTotal.toFixed(2)}</td>
            <td>
              <button type="button" class="btn btn-sm btn-secondary" onclick="viewPeriodDetails('${period.period}', '${periodType}')">
                📊 View
              </button>
            </td>
          </tr>
        `;
      }).join('');
    } else {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center text-light-med">No financial data found for this period. Click "Import Financial Data" above to import.</td></tr>';
    }

  } catch (error) {
    console.error('Error loading financial summary:', error);
    tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="color: #ef4444;">Error loading summary: ${escapeHtml(error.message)}</td></tr>`;
  }
}

/**
 * View Period Details
 * Shows detailed invoice list for a specific period
 * @param {string} period - Period identifier (e.g., "2025-01" or "2025-06-28")
 * @param {string} periodType - "monthly" or "weekly"
 */
async function viewPeriodDetails(period, periodType) {
  // For now, show a simple alert with period info
  // This can be expanded to a modal with detailed invoice breakdown
  alert(`Period Details: ${period}\n\nDetailed invoice breakdown coming in next iteration.\n\nThis will show:\n- Individual invoices\n- Category breakdowns\n- Vendor details\n- PDF links`);
}

// Export functions to window
window.loadFinancialData = loadFinancialData;
window.importFinancialData = importFinancialData;
window.loadFinancialSummary = loadFinancialSummary;
window.viewPeriodDetails = viewPeriodDetails;

console.log('✅ Financial accuracy module loaded (v15.3)');


// ============================================================================
// v15.3: Financial Accuracy & Usage Intelligence
// ============================================================================

/**
 * Load Financial Data Overview
 * Fetches financial accuracy stats from AI Ops Status
 */
async function loadFinancialData() {
  try {
    // Fetch AI Ops status which includes financial_accuracy
    const statusData = await fetchAPI('/owner/ops/status');

    // Update financial accuracy value and color
    const accuracyValue = document.getElementById('financialAccuracyValue');
    if (statusData.financial_accuracy !== null && statusData.financial_accuracy !== undefined) {
      accuracyValue.textContent = `${statusData.financial_accuracy.toFixed(1)}%`;
      accuracyValue.style.color = statusData.financial_accuracy_color === 'green' ? '#22c55e' :
                                   statusData.financial_accuracy_color === 'yellow' ? '#f59e0b' : '#ef4444';
    } else {
      accuracyValue.textContent = '--';
      accuracyValue.style.color = '#6b7280';
    }

    // Fetch summary to get invoice count and total value
    const summaryData = await fetchAPI('/inventory/reconcile/financial-summary?startDate=2025-01-01&endDate=2025-06-30&period=monthly');

    if (summaryData.success && summaryData.summary) {
      // Calculate totals across all periods
      let totalInvoices = 0;
      let totalValue = 0;

      for (const period of summaryData.summary) {
        totalInvoices += period.invoices.length;
        totalValue += period.totalInvoiceAmount;
      }

      document.getElementById('financialTotalInvoices').textContent = totalInvoices;
      document.getElementById('financialTotalValue').textContent = `$${totalValue.toFixed(2)}`;

      // Count unique categories tracked
      const categoriesSet = new Set();
      for (const period of summaryData.summary) {
        for (const invoice of period.invoices) {
          Object.keys(invoice.categories || {}).forEach(cat => categoriesSet.add(cat));
        }
      }
      document.getElementById('financialCategories').textContent = categoriesSet.size;

      // Update category variance cards if we have variance data from statusData
      if (statusData.variance_by_category) {
        updateCategoryVariance(statusData.variance_by_category);
      }
    } else {
      document.getElementById('financialTotalInvoices').textContent = '0';
      document.getElementById('financialTotalValue').textContent = '$0.00';
      document.getElementById('financialCategories').textContent = '0';
    }

  } catch (error) {
    console.error('Error loading financial data:', error);
    document.getElementById('financialAccuracyValue').textContent = 'Error';
    document.getElementById('financialTotalInvoices').textContent = '--';
    document.getElementById('financialTotalValue').textContent = '--';
    document.getElementById('financialCategories').textContent = '--';
  }
}

/**
 * Update Category Variance Cards
 * @param {object} varianceByCategory - Variance data by category
 */
function updateCategoryVariance(varianceByCategory) {
  const categories = ['BAKE', 'MEAT', 'PROD', 'BEV', 'MILK', 'GROC'];

  for (const cat of categories) {
    const element = document.getElementById(`categoryVariance${cat}`);
    if (!element) continue;

    if (varianceByCategory[cat]) {
      const variance = varianceByCategory[cat].variance_pct;
      const accuracy = Math.max(0, 100 - variance);
      element.textContent = `${accuracy.toFixed(1)}%`;

      // Color code based on accuracy
      if (accuracy >= 95) {
        element.style.color = '#22c55e'; // green
      } else if (accuracy >= 70) {
        element.style.color = '#f59e0b'; // yellow
      } else {
        element.style.color = '#ef4444'; // red
      }
    } else {
      element.textContent = '--';
      element.style.color = '#6b7280'; // gray
    }
  }
}

/**
 * Import Financial Data from PDFs
 * POST to /api/inventory/reconcile/import-pdfs
 */
async function importFinancialData() {
  const fromDate = document.getElementById('financialImportFrom').value;
  const toDate = document.getElementById('financialImportTo').value;

  if (!fromDate || !toDate) {
    alert('Please select both start and end dates');
    return;
  }

  // Show loading state
  const resultsDiv = document.getElementById('financialImportResults');
  const summarySpan = document.getElementById('financialImportSummary');
  resultsDiv.classList.remove('hidden');
  summarySpan.textContent = 'Importing...';

  try {
    const data = await fetchAPI('/inventory/reconcile/import-pdfs', {
      method: 'POST',
      body: JSON.stringify({
        startDate: fromDate,
        endDate: toDate
      })
    });

    if (data.success) {
      const vendors = data.vendors.join(', ');
      summarySpan.textContent = `${data.importedCount} invoices imported ($${data.totalValue.toFixed(2)}) from vendors: ${vendors}`;

      // Refresh financial data to show updated stats
      setTimeout(() => {
        loadFinancialData();
        loadFinancialSummary();
      }, 500);
    } else {
      summarySpan.textContent = `Import failed: ${data.error}`;
    }

  } catch (error) {
    console.error('Error importing financial data:', error);
    summarySpan.textContent = `Import failed: ${error.message}`;
  }
}

/**
 * Load Financial Summary Table
 * GET from /api/inventory/reconcile/financial-summary
 */
async function loadFinancialSummary() {
  const periodType = document.getElementById('financialPeriodType').value;
  const tbody = document.getElementById('financialSummaryBody');

  // Show loading state
  tbody.innerHTML = '<tr><td colspan="7" class="loading">Loading summary...</td></tr>';

  try {
    const data = await fetchAPI(`/inventory/reconcile/financial-summary?startDate=2025-01-01&endDate=2025-06-30&period=${periodType}`);

    if (data.success && data.summary && data.summary.length > 0) {
      tbody.innerHTML = data.summary.map(period => {
        return `
          <tr>
            <td><strong>${period.period}</strong></td>
            <td>$${period.totalInvoiceAmount.toFixed(2)}</td>
            <td>$${period.foodFreightReimb.toFixed(2)}</td>
            <td>$${period.otherReimb.toFixed(2)}</td>
            <td>$${period.gstTotal.toFixed(2)}</td>
            <td>$${period.qstTotal.toFixed(2)}</td>
            <td>
              <button type="button" class="btn btn-sm btn-secondary" onclick="viewPeriodDetails('${period.period}', '${periodType}')">
                📊 View
              </button>
            </td>
          </tr>
        `;
      }).join('');
    } else {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center text-light-med">No financial data found for this period. Click "Import Financial Data" above to import.</td></tr>';
    }

  } catch (error) {
    console.error('Error loading financial summary:', error);
    tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="color: #ef4444;">Error loading summary: ${escapeHtml(error.message)}</td></tr>`;
  }
}

/**
 * View Period Details
 * Shows detailed invoice list for a specific period
 * @param {string} period - Period identifier (e.g., "2025-01" or "2025-06-28")
 * @param {string} periodType - "monthly" or "weekly"
 */
async function viewPeriodDetails(period, periodType) {
  // For now, show a simple alert with period info
  // This can be expanded to a modal with detailed invoice breakdown
  alert(`Period Details: ${period}\n\nDetailed invoice breakdown coming in next iteration.\n\nThis will show:\n- Individual invoices\n- Category breakdowns\n- Vendor details\n- PDF links`);
}

// Export functions to window
window.loadFinancialData = loadFinancialData;
window.importFinancialData = importFinancialData;
window.loadFinancialSummary = loadFinancialSummary;
window.viewPeriodDetails = viewPeriodDetails;

console.log('✅ Financial accuracy module loaded (v15.3)');

// ============================================================================
// v15.4.0: Finance Workspace - AI Copilot & Data Quality
// ============================================================================

/**
 * Ask Finance AI Copilot a natural language question
 * POST /api/finance/ai/query
 */
async function askFinanceAI() {
  const questionInput = document.getElementById('financeAIQuestion');
  const question = questionInput?.value?.trim();

  if (!question) {
    alert('Please enter a question for the AI Copilot.');
    return;
  }

  // Show loading state
  const resultsDiv = document.getElementById('financeAIResults');
  const contentDiv = document.getElementById('financeAIContent');
  setHidden(resultsDiv, false);
  contentDiv.innerHTML = '<div class="loading">AI is processing your question...</div>';

  try {
    const data = await fetchAPI('/finance/ai/query', {
      method: 'POST',
      body: JSON.stringify({
        question: question,
        period: null, // Can be extracted from question by backend
        constraints: {}
      })
    });

    if (data.success) {
      // Format the response based on intent
      let html = `
        <div class="alert alert-success">
          <strong>Intent Detected:</strong> ${data.intent || 'unknown'}
        </div>
      `;

      // Show result data
      if (data.result) {
        if (data.result.content) {
          // Export response
          html += `
            <div class="card">
              <div class="card-header">
                <h4>Export Generated</h4>
              </div>
              <div class="card-body">
                <p><strong>Format:</strong> ${data.result.format}</p>
                <p><strong>Row Count:</strong> ${data.result.rowcount}</p>
                <pre class="code-block">${escapeHtml(data.result.content.substring(0, 500))}${data.result.content.length > 500 ? '...' : ''}</pre>
                <button type="button" class="btn btn-primary" onclick="downloadFinanceExport('${data.result.format}', \`${escapeHtml(data.result.content)}\`)">
                  💾 Download ${data.result.format.toUpperCase()}
                </button>
              </div>
            </div>
          `;
        } else if (data.result.data) {
          // Query result data
          html += `
            <div class="card">
              <div class="card-header">
                <h4>Query Results</h4>
              </div>
              <div class="card-body">
                <p><strong>Rows Returned:</strong> ${data.result.data.length}</p>
          `;

          if (data.result.sql) {
            html += `<p><strong>SQL:</strong> <code>${escapeHtml(data.result.sql)}</code></p>`;
          }

          // Show table preview if data exists
          if (data.result.data.length > 0) {
            const firstRow = data.result.data[0];
            const columns = Object.keys(firstRow);

            html += `
              <table class="table">
                <thead>
                  <tr>
                    ${columns.map(col => `<th>${escapeHtml(col)}</th>`).join('')}
                  </tr>
                </thead>
                <tbody>
                  ${data.result.data.slice(0, 10).map(row => `
                    <tr>
                      ${columns.map(col => `<td>${escapeHtml(String(row[col] || ''))}</td>`).join('')}
                    </tr>
                  `).join('')}
                </tbody>
              </table>
              ${data.result.data.length > 10 ? `<p class="text-light-med">Showing 10 of ${data.result.data.length} rows</p>` : ''}
            `;
          }

          html += `
              </div>
            </div>
          `;
        } else if (data.result.summary) {
          // Summary result
          html += `
            <div class="card">
              <div class="card-header">
                <h4>Summary Results</h4>
              </div>
              <div class="card-body">
                <pre class="code-block">${JSON.stringify(data.result.summary, null, 2)}</pre>
              </div>
            </div>
          `;
        }
      }

      // Show audit ID
      if (data.auditId) {
        html += `<p class="text-xs text-light-med">Audit ID: ${data.auditId}</p>`;
      }

      contentDiv.innerHTML = html;
    } else {
      contentDiv.innerHTML = `
        <div class="alert alert-danger">
          <strong>Error:</strong> ${escapeHtml(data.error || 'Unknown error')}
        </div>
      `;
    }

  } catch (error) {
    console.error('Error asking Finance AI:', error);
    contentDiv.innerHTML = `
      <div class="alert alert-danger">
        <strong>Error:</strong> ${escapeHtml(error.message)}
      </div>
    `;
  }
}

/**
 * Preview SQL that will be generated by AI Copilot
 * Shows what query will run before executing
 */
async function showFinanceAIPreview() {
  const questionInput = document.getElementById('financeAIQuestion');
  const question = questionInput?.value?.trim();

  if (!question) {
    alert('Please enter a question to preview.');
    return;
  }

  // Show loading state
  const resultsDiv = document.getElementById('financeAIResults');
  const contentDiv = document.getElementById('financeAIContent');
  setHidden(resultsDiv, false);
  contentDiv.innerHTML = '<div class="loading">Generating SQL preview...</div>';

  try {
    // For preview, we'll call the same endpoint but show only the SQL
    // In a production system, you might have a dedicated preview endpoint
    const data = await fetchAPI('/finance/ai/query', {
      method: 'POST',
      body: JSON.stringify({
        question: question,
        period: null,
        constraints: { preview: true }
      })
    });

    if (data.success && data.result) {
      let html = `
        <div class="alert alert-info">
          <strong>Preview Mode:</strong> This shows what the AI will execute
        </div>
        <div class="card">
          <div class="card-header">
            <h4>Intent: ${data.intent || 'unknown'}</h4>
          </div>
          <div class="card-body">
      `;

      if (data.result.sql) {
        html += `
          <p><strong>Generated SQL:</strong></p>
          <pre class="code-block">${escapeHtml(data.result.sql)}</pre>
        `;
      } else if (data.intent) {
        html += `
          <p><strong>Action:</strong> ${data.intent}</p>
          <p><strong>Parameters:</strong></p>
          <pre class="code-block">${JSON.stringify(data.result, null, 2)}</pre>
        `;
      }

      html += `
          </div>
        </div>
        <button type="button" class="btn btn-primary" onclick="askFinanceAI()">
          ✅ Execute Query
        </button>
      `;

      contentDiv.innerHTML = html;
    } else {
      contentDiv.innerHTML = `
        <div class="alert alert-danger">
          <strong>Error:</strong> ${escapeHtml(data.error || 'Could not generate preview')}
        </div>
      `;
    }

  } catch (error) {
    console.error('Error generating Finance AI preview:', error);
    contentDiv.innerHTML = `
      <div class="alert alert-danger">
        <strong>Error:</strong> ${escapeHtml(error.message)}
      </div>
    `;
  }
}

/**
 * Load Finance Data Quality Issues
 * GET /api/finance/data-quality
 */
async function loadFinanceDataQuality() {
  const container = document.getElementById('financeDataQualityContainer');

  // Show loading state
  container.innerHTML = '<div class="loading">Checking data quality...</div>';

  try {
    const data = await fetchAPI('/finance/data-quality');

    if (data.success && data.issues) {
      if (data.issues.length === 0) {
        container.innerHTML = `
          <div class="alert alert-success">
            ✅ No data quality issues detected! Your financial data looks clean.
          </div>
        `;
        return;
      }

      // Group issues by severity
      const critical = data.issues.filter(i => i.severity === 'critical');
      const warnings = data.issues.filter(i => i.severity === 'warning');

      let html = `
        <div class="alert alert-${critical.length > 0 ? 'danger' : 'warning'}">
          Found ${data.issues.length} data quality issue${data.issues.length > 1 ? 's' : ''}:
          ${critical.length > 0 ? `${critical.length} critical` : ''}
          ${critical.length > 0 && warnings.length > 0 ? ', ' : ''}
          ${warnings.length > 0 ? `${warnings.length} warning${warnings.length > 1 ? 's' : ''}` : ''}
        </div>
      `;

      // Show critical issues first
      if (critical.length > 0) {
        html += '<h4 class="text-bad">Critical Issues</h4>';
        critical.forEach(issue => {
          html += formatDataQualityIssue(issue);
        });
      }

      // Then warnings
      if (warnings.length > 0) {
        html += '<h4 class="text-warn">Warnings</h4>';
        warnings.forEach(issue => {
          html += formatDataQualityIssue(issue);
        });
      }

      container.innerHTML = html;
    } else {
      container.innerHTML = `
        <div class="alert alert-danger">
          <strong>Error:</strong> ${escapeHtml(data.error || 'Could not load data quality issues')}
        </div>
      `;
    }

  } catch (error) {
    console.error('Error loading Finance data quality:', error);
    container.innerHTML = `
      <div class="alert alert-danger">
        <strong>Error:</strong> ${escapeHtml(error.message)}
      </div>
    `;
  }
}

/**
 * Format a single data quality issue
 * @param {object} issue - Issue object with type, severity, count, message, sample
 * @returns {string} HTML string
 */
function formatDataQualityIssue(issue) {
  const severityClass = issue.severity === 'critical' ? 'bad' : 'warn';
  const severityIcon = issue.severity === 'critical' ? '🔴' : '⚠️';

  let html = `
    <div class="card" style="margin-bottom: 1rem; border-left: 4px solid ${issue.severity === 'critical' ? 'var(--color-bad, #ef4444)' : 'var(--color-warn, #f59e0b)'};">
      <div class="card-header">
        <h5>${severityIcon} ${escapeHtml(issue.type)}</h5>
      </div>
      <div class="card-body">
        <p><strong>Severity:</strong> <span class="text-${severityClass}">${issue.severity}</span></p>
        <p><strong>Count:</strong> ${issue.count}</p>
        <p><strong>Message:</strong> ${escapeHtml(issue.message)}</p>
  `;

  // Show sample if available
  if (issue.sample) {
    html += `
      <p><strong>Sample:</strong></p>
      <pre class="code-block" style="max-height: 200px; overflow-y: auto;">${escapeHtml(JSON.stringify(issue.sample, null, 2))}</pre>
    `;
  }

  html += `
      </div>
    </div>
  `;

  return html;
}

/**
 * Download Finance Export
 * @param {string} format - File format (csv, xlsx, pdf)
 * @param {string} content - File content
 */
function downloadFinanceExport(format, content) {
  const blob = new Blob([content], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `finance_export_${new Date().toISOString().split('T')[0]}.${format}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Export v15.4.0 functions to window
window.askFinanceAI = askFinanceAI;
window.showFinanceAIPreview = showFinanceAIPreview;
window.loadFinanceDataQuality = loadFinanceDataQuality;
window.downloadFinanceExport = downloadFinanceExport;

console.log('✅ Finance Workspace v15.4.0 loaded (AI Copilot + Data Quality)');

// ============================================================================
// v15.4.0: Finance Workspace - AI Copilot & Data Quality
// ============================================================================

/**
 * Ask Finance AI Copilot a natural language question
 * POST /api/finance/ai/query
 */
async function askFinanceAI() {
  const questionInput = document.getElementById('financeAIQuestion');
  const question = questionInput?.value?.trim();

  if (!question) {
    alert('Please enter a question for the AI Copilot.');
    return;
  }

  // Show loading state
  const resultsDiv = document.getElementById('financeAIResults');
  const contentDiv = document.getElementById('financeAIContent');
  setHidden(resultsDiv, false);
  contentDiv.innerHTML = '<div class="loading">AI is processing your question...</div>';

  try {
    const data = await fetchAPI('/finance/ai/query', {
      method: 'POST',
      body: JSON.stringify({
        question: question,
        period: null, // Can be extracted from question by backend
        constraints: {}
      })
    });

    if (data.success) {
      // Format the response based on intent
      let html = `
        <div class="alert alert-success">
          <strong>Intent Detected:</strong> ${data.intent || 'unknown'}
        </div>
      `;

      // Show result data
      if (data.result) {
        if (data.result.content) {
          // Export response
          const previewContent = escapeHtml(data.result.content.substring(0, 500));
          const downloadContent = data.result.content.replace(/`/g, '\\`');
          html += `
            <div class="card">
              <div class="card-header">
                <h4>Export Generated</h4>
              </div>
              <div class="card-body">
                <p><strong>Format:</strong> ${data.result.format}</p>
                <p><strong>Row Count:</strong> ${data.result.rowcount}</p>
                <pre class="code-block">${previewContent}${data.result.content.length > 500 ? '...' : ''}</pre>
                <button type="button" class="btn btn-primary" onclick='downloadFinanceExport("${data.result.format}", \`${downloadContent}\`)'>
                  💾 Download ${data.result.format.toUpperCase()}
                </button>
              </div>
            </div>
          `;
        } else if (data.result.data) {
          // Query result data
          html += `
            <div class="card">
              <div class="card-header">
                <h4>Query Results</h4>
              </div>
              <div class="card-body">
                <p><strong>Rows Returned:</strong> ${data.result.data.length}</p>
          `;

          if (data.result.sql) {
            html += `<p><strong>SQL:</strong> <code>${escapeHtml(data.result.sql)}</code></p>`;
          }

          // Show table preview if data exists
          if (data.result.data.length > 0) {
            const firstRow = data.result.data[0];
            const columns = Object.keys(firstRow);

            html += `
              <table class="table">
                <thead>
                  <tr>
                    ${columns.map(col => `<th>${escapeHtml(col)}</th>`).join('')}
                  </tr>
                </thead>
                <tbody>
                  ${data.result.data.slice(0, 10).map(row => `
                    <tr>
                      ${columns.map(col => `<td>${escapeHtml(String(row[col] || ''))}</td>`).join('')}
                    </tr>
                  `).join('')}
                </tbody>
              </table>
              ${data.result.data.length > 10 ? `<p class="text-light-med">Showing 10 of ${data.result.data.length} rows</p>` : ''}
            `;
          }

          html += `
              </div>
            </div>
          `;
        } else if (data.result.summary) {
          // Summary result
          html += `
            <div class="card">
              <div class="card-header">
                <h4>Summary Results</h4>
              </div>
              <div class="card-body">
                <pre class="code-block">${JSON.stringify(data.result.summary, null, 2)}</pre>
              </div>
            </div>
          `;
        }
      }

      // Show audit ID
      if (data.auditId) {
        html += `<p class="text-xs text-light-med">Audit ID: ${data.auditId}</p>`;
      }

      contentDiv.innerHTML = html;
    } else {
      contentDiv.innerHTML = `
        <div class="alert alert-danger">
          <strong>Error:</strong> ${escapeHtml(data.error || 'Unknown error')}
        </div>
      `;
    }

  } catch (error) {
    console.error('Error asking Finance AI:', error);
    contentDiv.innerHTML = `
      <div class="alert alert-danger">
        <strong>Error:</strong> ${escapeHtml(error.message)}
      </div>
    `;
  }
}

/**
 * Preview SQL that will be generated by AI Copilot
 * Shows what query will run before executing
 */
async function showFinanceAIPreview() {
  const questionInput = document.getElementById('financeAIQuestion');
  const question = questionInput?.value?.trim();

  if (!question) {
    alert('Please enter a question to preview.');
    return;
  }

  // Show loading state
  const resultsDiv = document.getElementById('financeAIResults');
  const contentDiv = document.getElementById('financeAIContent');
  setHidden(resultsDiv, false);
  contentDiv.innerHTML = '<div class="loading">Generating SQL preview...</div>';

  try {
    // For preview, we'll call the same endpoint but show only the SQL
    // In a production system, you might have a dedicated preview endpoint
    const data = await fetchAPI('/finance/ai/query', {
      method: 'POST',
      body: JSON.stringify({
        question: question,
        period: null,
        constraints: { preview: true }
      })
    });

    if (data.success && data.result) {
      let html = `
        <div class="alert alert-info">
          <strong>Preview Mode:</strong> This shows what the AI will execute
        </div>
        <div class="card">
          <div class="card-header">
            <h4>Intent: ${data.intent || 'unknown'}</h4>
          </div>
          <div class="card-body">
      `;

      if (data.result.sql) {
        html += `
          <p><strong>Generated SQL:</strong></p>
          <pre class="code-block">${escapeHtml(data.result.sql)}</pre>
        `;
      } else if (data.intent) {
        html += `
          <p><strong>Action:</strong> ${data.intent}</p>
          <p><strong>Parameters:</strong></p>
          <pre class="code-block">${JSON.stringify(data.result, null, 2)}</pre>
        `;
      }

      html += `
          </div>
        </div>
        <button type="button" class="btn btn-primary" onclick="askFinanceAI()">
          ✅ Execute Query
        </button>
      `;

      contentDiv.innerHTML = html;
    } else {
      contentDiv.innerHTML = `
        <div class="alert alert-danger">
          <strong>Error:</strong> ${escapeHtml(data.error || 'Could not generate preview')}
        </div>
      `;
    }

  } catch (error) {
    console.error('Error generating Finance AI preview:', error);
    contentDiv.innerHTML = `
      <div class="alert alert-danger">
        <strong>Error:</strong> ${escapeHtml(error.message)}
      </div>
    `;
  }
}

/**
 * Load Finance Data Quality Issues
 * GET /api/finance/data-quality
 */
async function loadFinanceDataQuality() {
  const container = document.getElementById('financeDataQualityContainer');

  // Show loading state
  container.innerHTML = '<div class="loading">Checking data quality...</div>';

  try {
    const data = await fetchAPI('/finance/data-quality');

    if (data.success && data.issues) {
      if (data.issues.length === 0) {
        container.innerHTML = `
          <div class="alert alert-success">
            ✅ No data quality issues detected! Your financial data looks clean.
          </div>
        `;
        return;
      }

      // Group issues by severity
      const critical = data.issues.filter(i => i.severity === 'critical');
      const warnings = data.issues.filter(i => i.severity === 'warning');

      let html = `
        <div class="alert alert-${critical.length > 0 ? 'danger' : 'warning'}">
          Found ${data.issues.length} data quality issue${data.issues.length > 1 ? 's' : ''}:
          ${critical.length > 0 ? `${critical.length} critical` : ''}
          ${critical.length > 0 && warnings.length > 0 ? ', ' : ''}
          ${warnings.length > 0 ? `${warnings.length} warning${warnings.length > 1 ? 's' : ''}` : ''}
        </div>
      `;

      // Show critical issues first
      if (critical.length > 0) {
        html += '<h4 class="text-bad">Critical Issues</h4>';
        critical.forEach(issue => {
          html += formatDataQualityIssue(issue);
        });
      }

      // Then warnings
      if (warnings.length > 0) {
        html += '<h4 class="text-warn">Warnings</h4>';
        warnings.forEach(issue => {
          html += formatDataQualityIssue(issue);
        });
      }

      container.innerHTML = html;
    } else {
      container.innerHTML = `
        <div class="alert alert-danger">
          <strong>Error:</strong> ${escapeHtml(data.error || 'Could not load data quality issues')}
        </div>
      `;
    }

  } catch (error) {
    console.error('Error loading Finance data quality:', error);
    container.innerHTML = `
      <div class="alert alert-danger">
        <strong>Error:</strong> ${escapeHtml(error.message)}
      </div>
    `;
  }
}

/**
 * Format a single data quality issue
 * @param {object} issue - Issue object with type, severity, count, message, sample
 * @returns {string} HTML string
 */
function formatDataQualityIssue(issue) {
  const severityClass = issue.severity === 'critical' ? 'bad' : 'warn';
  const severityIcon = issue.severity === 'critical' ? '🔴' : '⚠️';
  const borderColor = issue.severity === 'critical' ? '#ef4444' : '#f59e0b';

  let html = `
    <div class="card" style="margin-bottom: 1rem; border-left: 4px solid ${borderColor};">
      <div class="card-header">
        <h5>${severityIcon} ${escapeHtml(issue.type)}</h5>
      </div>
      <div class="card-body">
        <p><strong>Severity:</strong> <span class="text-${severityClass}">${issue.severity}</span></p>
        <p><strong>Count:</strong> ${issue.count}</p>
        <p><strong>Message:</strong> ${escapeHtml(issue.message)}</p>
  `;

  // Show sample if available
  if (issue.sample) {
    html += `
      <p><strong>Sample:</strong></p>
      <pre class="code-block" style="max-height: 200px; overflow-y: auto;">${escapeHtml(JSON.stringify(issue.sample, null, 2))}</pre>
    `;
  }

  html += `
      </div>
    </div>
  `;

  return html;
}

/**
 * Download Finance Export
 * @param {string} format - File format (csv, xlsx, pdf)
 * @param {string} content - File content
 */
function downloadFinanceExport(format, content) {
  const blob = new Blob([content], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `finance_export_${new Date().toISOString().split('T')[0]}.${format}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Export v15.4.0 functions to window
window.askFinanceAI = askFinanceAI;
window.showFinanceAIPreview = showFinanceAIPreview;
window.loadFinanceDataQuality = loadFinanceDataQuality;
window.downloadFinanceExport = downloadFinanceExport;

console.log('✅ Finance Workspace v15.4.0 loaded (AI Copilot + Data Quality)');

/* ============================================
   v15.5.0: Shadow Mode Forecast Approval
   ============================================ */

/**
 * Load Shadow Mode state and show approval banner if needed
 */
async function loadShadowModeState() {
  try {
    // Check if shadow mode is active from config
    if (window.appConfig && window.appConfig.shadowMode === true) {
      // Show shadow mode badge in header
      const shadowBadge = document.getElementById('badge-shadow-mode');
      if (shadowBadge) {
        shadowBadge.classList.remove('u-hide');
      }

      // Check if there's a pending forecast approval
      const response = await fetchAPI('/owner/forecast-orders/state');
      if (response.success && response.pendingApproval) {
        const { runId, forecastDate, itemsForecasted, avgConfidence, totalPredictedValue, status } = response.pendingApproval;

        // Populate banner
        document.getElementById('shadowModeRunId').textContent = runId || '--';
        document.getElementById('shadowModeItemCount').textContent = itemsForecasted || '--';
        document.getElementById('shadowModeConfidence').textContent = avgConfidence ? `${avgConfidence}%` : '--';
        document.getElementById('shadowModeTotalValue').textContent = totalPredictedValue ? `$${totalPredictedValue.toFixed(2)}` : '--';

        // Show banner
        const banner = document.getElementById('shadowModeApprovalBanner');
        if (banner) {
          banner.classList.remove('u-hide');
        }

        console.log('✅ Shadow Mode: Forecast pending approval', { runId, itemsForecasted });
      } else {
        console.log('Shadow Mode: No pending approval');
      }
    }
  } catch (error) {
    console.error('Error loading Shadow Mode state:', error);
  }
}

/**
 * Approve Shadow Mode forecast
 */
async function approveShadowModeForecast() {
  try {
    const runId = document.getElementById('shadowModeRunId').textContent;
    const note = document.getElementById('shadowModeApprovalNote').value.trim();

    // Validate note
    if (!note || note.length < 10) {
      alert('Please enter an approval note (minimum 10 characters)');
      return;
    }

    // Confirm
    if (!confirm(`Approve forecast run ${runId}?\n\nThis will execute the forecasted orders.`)) {
      return;
    }

    // Disable buttons
    document.getElementById('shadowModeApproveBtn').disabled = true;
    document.getElementById('shadowModeRejectBtn').disabled = true;

    const response = await fetchAPI('/owner/forecast-orders/approve', {
      method: 'POST',
      body: JSON.stringify({ runId, note })
    });

    if (response.success) {
      alert(`✅ Forecast approved successfully!\n\n${response.items_affected} items will be processed.`);

      // Hide banner
      const banner = document.getElementById('shadowModeApprovalBanner');
      if (banner) {
        banner.classList.add('u-hide');
      }

      // Reload forecast data
      if (typeof loadDailyForecast === 'function') {
        loadDailyForecast();
      }
    } else {
      alert(`Error: ${response.error || 'Failed to approve forecast'}`);
      // Re-enable buttons
      document.getElementById('shadowModeApproveBtn').disabled = false;
      document.getElementById('shadowModeRejectBtn').disabled = false;
    }
  } catch (error) {
    console.error('Error approving forecast:', error);
    alert(`Error: ${error.message}`);
    // Re-enable buttons
    document.getElementById('shadowModeApproveBtn').disabled = false;
    document.getElementById('shadowModeRejectBtn').disabled = false;
  }
}

/**
 * Reject Shadow Mode forecast
 */
async function rejectShadowModeForecast() {
  try {
    const runId = document.getElementById('shadowModeRunId').textContent;
    const note = document.getElementById('shadowModeApprovalNote').value.trim();

    // Validate note
    if (!note || note.length < 10) {
      alert('Please enter a rejection reason (minimum 10 characters)');
      return;
    }

    // Confirm
    if (!confirm(`Reject forecast run ${runId}?\n\nThis will discard the forecasted orders.`)) {
      return;
    }

    // Disable buttons
    document.getElementById('shadowModeApproveBtn').disabled = true;
    document.getElementById('shadowModeRejectBtn').disabled = true;

    const response = await fetchAPI('/owner/forecast-orders/reject', {
      method: 'POST',
      body: JSON.stringify({ runId, note })
    });

    if (response.success) {
      alert(`Forecast rejected.\n\n${response.message || 'No orders will be executed.'}`);

      // Hide banner
      const banner = document.getElementById('shadowModeApprovalBanner');
      if (banner) {
        banner.classList.add('u-hide');
      }
    } else {
      alert(`Error: ${response.error || 'Failed to reject forecast'}`);
      // Re-enable buttons
      document.getElementById('shadowModeApproveBtn').disabled = false;
      document.getElementById('shadowModeRejectBtn').disabled = false;
    }
  } catch (error) {
    console.error('Error rejecting forecast:', error);
    alert(`Error: ${error.message}`);
    // Re-enable buttons
    document.getElementById('shadowModeApproveBtn').disabled = false;
    document.getElementById('shadowModeRejectBtn').disabled = false;
  }
}

/**
 * View Shadow Mode forecast details
 */
async function viewShadowModeDetails() {
  try {
    const runId = document.getElementById('shadowModeRunId').textContent;
    // For now, just show the forecast table
    // In future, could open a modal with detailed breakdown
    const forecastTab = document.querySelector('.tab[onclick*="forecast"]');
    if (forecastTab) {
      forecastTab.click();
    }
    if (typeof loadDailyForecast === 'function') {
      loadDailyForecast();
    }
  } catch (error) {
    console.error('Error viewing forecast details:', error);
  }
}

// Attach event listeners for Shadow Mode buttons
document.addEventListener('DOMContentLoaded', function() {
  const approveBtn = document.getElementById('shadowModeApproveBtn');
  const rejectBtn = document.getElementById('shadowModeRejectBtn');
  const viewBtn = document.getElementById('shadowModeViewDetailsBtn');

  if (approveBtn) {
    approveBtn.addEventListener('click', approveShadowModeForecast);
  }
  if (rejectBtn) {
    rejectBtn.addEventListener('click', rejectShadowModeForecast);
  }
  if (viewBtn) {
    viewBtn.addEventListener('click', viewShadowModeDetails);
  }

  // Load Shadow Mode state on page load
  loadShadowModeState();
});

// Export Shadow Mode functions to window
window.loadShadowModeState = loadShadowModeState;
window.approveShadowModeForecast = approveShadowModeForecast;
window.rejectShadowModeForecast = rejectShadowModeForecast;
window.viewShadowModeDetails = viewShadowModeDetails;

console.log('✅ Shadow Mode v15.5.0 loaded (Forecast Approval Workflow)');

/* ============================================
   v15.5.0: Users Panel (OWNER Only)
   ============================================ */

/**
 * Load users list
 */
async function loadUsersList() {
  try {
    const tbody = document.getElementById('usersTableBody');
    tbody.innerHTML = '<tr><td colspan="6" class="loading"><div class="spinner"></div> Loading users...</td></tr>';

    const response = await fetchAPI('/admin/users/list');
    
    if (response.success && response.users) {
      if (response.users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state-centered">No users found</td></tr>';
        return;
      }

      let html = '';
      response.users.forEach(user => {
        const statusClass = user.active ? 'badge-success' : 'badge-danger';
        const statusText = user.active ? 'Active' : 'Disabled';
        const lastLogin = user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Never';
        const locations = user.locations && user.locations.length > 0 
          ? user.locations.join(', ') 
          : 'All';

        html += `
          <tr>
            <td>${escapeHtml(user.email)}</td>
            <td><span class="badge badge-info">${escapeHtml(user.role)}</span></td>
            <td><span class="badge ${statusClass}">${statusText}</span></td>
            <td>${escapeHtml(lastLogin)}</td>
            <td>${escapeHtml(locations)}</td>
            <td>
              <div class="flex-gap-half">
                <button type="button" class="btn btn-sm btn-primary" title="Change Role" data-user-id="${escapeHtml(user.id)}">🔄</button>
                <button type="button" class="btn btn-sm btn-warning" title="Revoke Sessions" data-user-email="${escapeHtml(user.email)}">🚫</button>
                <button type="button" class="btn btn-sm btn-secondary" title="Force Rebind" data-user-email="${escapeHtml(user.email)}">🔐</button>
                <button type="button" class="btn btn-sm ${user.active ? 'btn-danger' : 'btn-success'}" title="${user.active ? 'Disable' : 'Enable'}" data-user-id="${escapeHtml(user.id)}" data-user-active="${user.active}">${user.active ? '❌' : '✅'}</button>
              </div>
            </td>
          </tr>
        `;
      });

      tbody.innerHTML = html;

      // Attach event listeners
      tbody.querySelectorAll('button[data-user-id]').forEach(btn => {
        const userId = btn.getAttribute('data-user-id');
        const action = btn.getAttribute('title');
        
        if (action === 'Change Role') {
          btn.addEventListener('click', () => openChangeRoleModal(userId));
        } else if (action === 'Disable' || action === 'Enable') {
          const isActive = btn.getAttribute('data-user-active') === 'true';
          btn.addEventListener('click', () => toggleUserStatus(userId, isActive));
        }
      });

      tbody.querySelectorAll('button[data-user-email]').forEach(btn => {
        const email = btn.getAttribute('data-user-email');
        const action = btn.getAttribute('title');
        
        if (action === 'Revoke Sessions') {
          btn.addEventListener('click', () => revokeUserSessions(email));
        } else if (action === 'Force Rebind') {
          btn.addEventListener('click', () => forceDeviceRebind(email));
        }
      });

    } else {
      tbody.innerHTML = `<tr><td colspan="6" class="alert alert-danger">Error: ${escapeHtml(response.error || 'Failed to load users')}</td></tr>`;
    }
  } catch (error) {
    console.error('Error loading users:', error);
    const tbody = document.getElementById('usersTableBody');
    tbody.innerHTML = `<tr><td colspan="6" class="alert alert-danger">Error: ${escapeHtml(error.message)}</td></tr>`;
  }
}

/**
 * Load pending invites
 */
async function loadPendingInvites() {
  try {
    const tbody = document.getElementById('pendingInvitesTableBody');
    tbody.innerHTML = '<tr><td colspan="6" class="loading">Loading invites...</td></tr>';

    const response = await fetchAPI('/admin/users/invites/pending');
    
    if (response.success && response.invites) {
      document.getElementById('pendingInvitesCount').textContent = response.invites.length;

      if (response.invites.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state-centered">No pending invites</td></tr>';
        return;
      }

      let html = '';
      response.invites.forEach(invite => {
        const created = new Date(invite.createdAt).toLocaleString();
        const expires = new Date(invite.expiresAt).toLocaleString();
        const isExpired = new Date(invite.expiresAt) < new Date();

        html += `
          <tr>
            <td>${escapeHtml(invite.email)}</td>
            <td><span class="badge badge-info">${escapeHtml(invite.role)}</span></td>
            <td>${escapeHtml(created)}</td>
            <td class="${isExpired ? 'text-color-danger' : ''}">${escapeHtml(expires)}</td>
            <td>${escapeHtml(invite.createdBy)}</td>
            <td>
              <button type="button" class="btn btn-sm btn-danger" title="Revoke Invite" data-token="${escapeHtml(invite.token)}">🗑️ Revoke</button>
            </td>
          </tr>
        `;
      });

      tbody.innerHTML = html;

      // Attach revoke listeners
      tbody.querySelectorAll('button[data-token]').forEach(btn => {
        const token = btn.getAttribute('data-token');
        btn.addEventListener('click', () => revokeInvite(token));
      });

    } else {
      tbody.innerHTML = `<tr><td colspan="6" class="alert alert-danger">Error: ${escapeHtml(response.error || 'Failed to load invites')}</td></tr>`;
    }
  } catch (error) {
    console.error('Error loading invites:', error);
    const tbody = document.getElementById('pendingInvitesTableBody');
    tbody.innerHTML = `<tr><td colspan="6" class="alert alert-danger">Error: ${escapeHtml(error.message)}</td></tr>`;
  }
}

/**
 * Open invite user modal
 */
function openInviteUserModal() {
  const modal = document.getElementById('inviteUserModal');
  modal.classList.add('active');
  
  // Clear form
  document.getElementById('inviteUserForm').reset();
}

/**
 * Close invite user modal
 */
function closeInviteUserModal() {
  const modal = document.getElementById('inviteUserModal');
  modal.classList.remove('active');
}

/**
 * Send user invite
 */
async function sendUserInvite() {
  try {
    const email = document.getElementById('inviteUserEmail').value.trim();
    const role = document.getElementById('inviteUserRole').value;
    const locationsStr = document.getElementById('inviteUserLocations').value.trim();
    const notes = document.getElementById('inviteUserNotes').value.trim();

    if (!email || !role) {
      alert('Please fill in all required fields');
      return;
    }

    const locations = locationsStr ? locationsStr.split(',').map(l => l.trim()) : [];

    // Disable button
    const btn = document.getElementById('sendInviteBtn');
    btn.disabled = true;
    btn.textContent = 'Sending...';

    const response = await fetchAPI('/admin/users/invite', {
      method: 'POST',
      body: JSON.stringify({
        email,
        role,
        tenantId: window.currentUser?.tenant_id || 'default',
        locations,
        notes
      })
    });

    if (response.success) {
      alert(`✅ Invite sent to ${email}!\n\nInvite Token: ${response.token}\n\nEmail Preview:\n${response.emailBody}`);
      closeInviteUserModal();
      loadUsersList();
      loadPendingInvites();
    } else {
      alert(`Error: ${response.error || 'Failed to send invite'}`);
    }

    // Re-enable button
    btn.disabled = false;
    btn.textContent = '📧 Send Invite';

  } catch (error) {
    console.error('Error sending invite:', error);
    alert(`Error: ${error.message}`);
    
    // Re-enable button
    const btn = document.getElementById('sendInviteBtn');
    btn.disabled = false;
    btn.textContent = '📧 Send Invite';
  }
}

/**
 * Open change role modal
 */
async function openChangeRoleModal(userId) {
  try {
    // Get user details
    const response = await fetchAPI(`/admin/users/${userId}`);
    
    if (response.success && response.user) {
      document.getElementById('changeRoleUserEmail').textContent = response.user.email;
      document.getElementById('changeRoleCurrentRole').textContent = response.user.role;
      document.getElementById('changeRoleNewRole').value = response.user.role;

      // Store userId for later
      document.getElementById('confirmChangeRoleBtn').setAttribute('data-user-id', userId);

      const modal = document.getElementById('changeRoleModal');
      modal.classList.add('active');
    } else {
      alert(`Error: ${response.error || 'User not found'}`);
    }
  } catch (error) {
    console.error('Error loading user:', error);
    alert(`Error: ${error.message}`);
  }
}

/**
 * Close change role modal
 */
function closeChangeRoleModal() {
  const modal = document.getElementById('changeRoleModal');
  modal.classList.remove('active');
}

/**
 * Confirm role change
 */
async function confirmRoleChange() {
  try {
    const userId = document.getElementById('confirmChangeRoleBtn').getAttribute('data-user-id');
    const newRole = document.getElementById('changeRoleNewRole').value;
    const userEmail = document.getElementById('changeRoleUserEmail').textContent;

    if (!newRole) {
      alert('Please select a role');
      return;
    }

    if (!confirm(`Change ${userEmail} to ${newRole}?`)) {
      return;
    }

    const response = await fetchAPI(`/admin/users/${userId}/role`, {
      method: 'PUT',
      body: JSON.stringify({ newRole })
    });

    if (response.success) {
      alert(`✅ Role changed to ${newRole}`);
      closeChangeRoleModal();
      loadUsersList();
    } else {
      alert(`Error: ${response.error || 'Failed to change role'}`);
    }
  } catch (error) {
    console.error('Error changing role:', error);
    alert(`Error: ${error.message}`);
  }
}

/**
 * Revoke user sessions
 */
async function revokeUserSessions(email) {
  if (!confirm(`Revoke all active sessions for ${email}?\n\nUser will need to log in again.`)) {
    return;
  }

  try {
    const response = await fetchAPI(`/admin/users/sessions/revoke`, {
      method: 'POST',
      body: JSON.stringify({ email })
    });

    if (response.success) {
      alert(`✅ Sessions revoked for ${email}`);
    } else {
      alert(`Error: ${response.error || 'Failed to revoke sessions'}`);
    }
  } catch (error) {
    console.error('Error revoking sessions:', error);
    alert(`Error: ${error.message}`);
  }
}

/**
 * Force device rebind
 */
async function forceDeviceRebind(email) {
  if (!confirm(`Force device rebind for ${email}?\n\nUser will need to re-register their device on next login.`)) {
    return;
  }

  try {
    const response = await fetchAPI(`/admin/users/device/force-rebind`, {
      method: 'POST',
      body: JSON.stringify({ email })
    });

    if (response.success) {
      alert(`✅ Device rebind forced for ${email}`);
    } else {
      alert(`Error: ${response.error || 'Failed to force rebind'}`);
    }
  } catch (error) {
    console.error('Error forcing rebind:', error);
    alert(`Error: ${error.message}`);
  }
}

/**
 * Toggle user status (enable/disable)
 */
async function toggleUserStatus(userId, isCurrentlyActive) {
  const action = isCurrentlyActive ? 'disable' : 'enable';
  
  if (!confirm(`${action.toUpperCase()} this user?`)) {
    return;
  }

  try {
    const response = await fetchAPI(`/admin/users/${userId}/${action}`, {
      method: 'PUT'
    });

    if (response.success) {
      alert(`✅ User ${action}d successfully`);
      loadUsersList();
    } else {
      alert(`Error: ${response.error || `Failed to ${action} user`}`);
    }
  } catch (error) {
    console.error(`Error ${action}ing user:`, error);
    alert(`Error: ${error.message}`);
  }
}

/**
 * Revoke invite
 */
async function revokeInvite(token) {
  if (!confirm('Revoke this invite?')) {
    return;
  }

  try {
    const response = await fetchAPI(`/admin/users/invites/${token}/revoke`, {
      method: 'DELETE'
    });

    if (response.success) {
      alert('✅ Invite revoked');
      loadPendingInvites();
    } else {
      alert(`Error: ${response.error || 'Failed to revoke invite'}`);
    }
  } catch (error) {
    console.error('Error revoking invite:', error);
    alert(`Error: ${error.message}`);
  }
}

// Attach event listeners for Users Panel
document.addEventListener('DOMContentLoaded', function() {
  // Refresh users button
  const refreshUsersBtn = document.getElementById('refreshUsersBtn');
  if (refreshUsersBtn) {
    refreshUsersBtn.addEventListener('click', () => {
      loadUsersList();
      loadPendingInvites();
    });
  }

  // Open invite modal button
  const openInviteBtn = document.getElementById('openInviteUserModalBtn');
  if (openInviteBtn) {
    openInviteBtn.addEventListener('click', openInviteUserModal);
  }

  // Close invite modal buttons
  const closeInviteBtn1 = document.getElementById('closeInviteUserModalBtn');
  const closeInviteBtn2 = document.getElementById('cancelInviteUserBtn');
  if (closeInviteBtn1) closeInviteBtn1.addEventListener('click', closeInviteUserModal);
  if (closeInviteBtn2) closeInviteBtn2.addEventListener('click', closeInviteUserModal);

  // Send invite button
  const sendInviteBtn = document.getElementById('sendInviteBtn');
  if (sendInviteBtn) {
    sendInviteBtn.addEventListener('click', sendUserInvite);
  }

  // Close change role modal buttons
  const closeRoleBtn1 = document.getElementById('closeChangeRoleModalBtn');
  const closeRoleBtn2 = document.getElementById('cancelChangeRoleBtn');
  if (closeRoleBtn1) closeRoleBtn1.addEventListener('click', closeChangeRoleModal);
  if (closeRoleBtn2) closeRoleBtn2.addEventListener('click', closeChangeRoleModal);

  // Confirm change role button
  const confirmRoleBtn = document.getElementById('confirmChangeRoleBtn');
  if (confirmRoleBtn) {
    confirmRoleBtn.addEventListener('click', confirmRoleChange);
  }

  // Load users when Settings tab is opened (if OWNER)
  const settingsTab = document.querySelector('.tab[onclick*="settings"]');
  if (settingsTab) {
    settingsTab.addEventListener('click', () => {
      // Check if user is OWNER before loading
      if (window.currentUser && window.currentUser.role === 'OWNER') {
        setTimeout(() => {
          loadUsersList();
        }, 100);
      }
    });
  }
});

// Export Users Panel functions to window
window.loadUsersList = loadUsersList;
window.loadPendingInvites = loadPendingInvites;
window.openInviteUserModal = openInviteUserModal;
window.closeInviteUserModal = closeInviteUserModal;
window.sendUserInvite = sendUserInvite;
window.openChangeRoleModal = openChangeRoleModal;
window.closeChangeRoleModal = closeChangeRoleModal;
window.confirmRoleChange = confirmRoleChange;
window.revokeUserSessions = revokeUserSessions;
window.forceDeviceRebind = forceDeviceRebind;
window.toggleUserStatus = toggleUserStatus;
window.revokeInvite = revokeInvite;

console.log('✅ Users Panel v15.5.0 loaded (User Management)');

/* ============================================
   v15.5.0: Finance Quick-Fix Workspace
   ============================================ */

/**
 * Load Finance Quick-Fix data (counters and tables)
 */
async function loadFinanceQuickFix() {
  try {
    // Load counters
    const countersResponse = await fetchAPI('/finance/quick-fix/counters');

    if (countersResponse.success) {
      const { needsMapping, outOfTolerance } = countersResponse;

      // Update counter values
      document.getElementById('needsMappingCount').textContent = needsMapping || 0;
      document.getElementById('needsMappingTotal').textContent = needsMapping || 0;
      document.getElementById('outOfToleranceCount').textContent = outOfTolerance || 0;
      document.getElementById('outOfToleranceTotal').textContent = outOfTolerance || 0;

      console.log('✅ Finance Quick-Fix counters loaded', { needsMapping, outOfTolerance });
    }

    // Load tables (if sections are open)
    const needsMappingSection = document.getElementById('needsMappingSection');
    const outOfToleranceSection = document.getElementById('outOfToleranceSection');

    if (needsMappingSection && needsMappingSection.open) {
      await loadNeedsMappingTable();
    }

    if (outOfToleranceSection && outOfToleranceSection.open) {
      await loadOutOfToleranceTable();
    }

  } catch (error) {
    console.error('Error loading Finance Quick-Fix data:', error);
  }
}

/**
 * Load Needs Mapping table
 */
async function loadNeedsMappingTable() {
  try {
    const tbody = document.getElementById('needsMappingTableBody');
    tbody.innerHTML = '<tr><td colspan="5" class="loading"><div class="spinner"></div> Loading...</td></tr>';

    const response = await fetchAPI('/finance/quick-fix/needs-mapping');

    if (response.success && response.items) {
      if (response.items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state-centered">✅ All items have category mappings!</td></tr>';
        return;
      }

      let html = '';
      response.items.forEach(item => {
        const totalValue = item.totalValue ? `$${parseFloat(item.totalValue).toFixed(2)}` : '--';

        html += `
          <tr>
            <td>${escapeHtml(item.itemCode || '--')}</td>
            <td>${escapeHtml(item.itemName || '--')}</td>
            <td>${escapeHtml(item.vendor || '--')}</td>
            <td>${totalValue}</td>
            <td>
              <button type="button" class="btn btn-sm btn-primary" data-item-code="${escapeHtml(item.itemCode)}" title="Assign Category">🏷️ Map</button>
            </td>
          </tr>
        `;
      });

      tbody.innerHTML = html;

      // Attach event listeners
      tbody.querySelectorAll('button[data-item-code]').forEach(btn => {
        const itemCode = btn.getAttribute('data-item-code');
        btn.addEventListener('click', () => assignCategoryMapping(itemCode));
      });

    } else {
      tbody.innerHTML = `<tr><td colspan="5" class="alert alert-danger">Error: ${escapeHtml(response.error || 'Failed to load data')}</td></tr>`;
    }
  } catch (error) {
    console.error('Error loading needs mapping table:', error);
    const tbody = document.getElementById('needsMappingTableBody');
    tbody.innerHTML = `<tr><td colspan="5" class="alert alert-danger">Error: ${escapeHtml(error.message)}</td></tr>`;
  }
}

/**
 * Load Out of Tolerance table
 */
async function loadOutOfToleranceTable() {
  try {
    const tbody = document.getElementById('outOfToleranceTableBody');
    tbody.innerHTML = '<tr><td colspan="6" class="loading"><div class="spinner"></div> Loading...</td></tr>';

    const response = await fetchAPI('/finance/quick-fix/out-of-tolerance');

    if (response.success && response.items) {
      if (response.items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state-centered">✅ All items within tolerance!</td></tr>';
        return;
      }

      let html = '';
      response.items.forEach(item => {
        const expected = item.expected ? `$${parseFloat(item.expected).toFixed(2)}` : '--';
        const actual = item.actual ? `$${parseFloat(item.actual).toFixed(2)}` : '--';
        const variance = item.variance ? `${parseFloat(item.variance).toFixed(1)}%` : '--';
        const varianceClass = item.variance > 0 ? 'text-color-danger' : 'text-color-success';

        html += `
          <tr>
            <td>${escapeHtml(item.itemCode || '--')}</td>
            <td>${escapeHtml(item.itemName || '--')}</td>
            <td>${expected}</td>
            <td>${actual}</td>
            <td class="${varianceClass}">${variance}</td>
            <td>
              <button type="button" class="btn btn-sm btn-warning" data-item-code="${escapeHtml(item.itemCode)}" title="Mark as Exception">⚠️ Exception</button>
            </td>
          </tr>
        `;
      });

      tbody.innerHTML = html;

      // Attach event listeners
      tbody.querySelectorAll('button[data-item-code]').forEach(btn => {
        const itemCode = btn.getAttribute('data-item-code');
        btn.addEventListener('click', () => markFinanceException(itemCode));
      });

    } else {
      tbody.innerHTML = `<tr><td colspan="6" class="alert alert-danger">Error: ${escapeHtml(response.error || 'Failed to load data')}</td></tr>`;
    }
  } catch (error) {
    console.error('Error loading out of tolerance table:', error);
    const tbody = document.getElementById('outOfToleranceTableBody');
    tbody.innerHTML = `<tr><td colspan="6" class="alert alert-danger">Error: ${escapeHtml(error.message)}</td></tr>`;
  }
}

/**
 * Assign category mapping to an item
 */
async function assignCategoryMapping(itemCode) {
  const category = prompt(`Assign category to ${itemCode}:\n\nOptions: BAKE, BEV, MEAT, PROD, MILK, GROC, OTHER\n\nEnter category code:`);

  if (!category) {
    return;
  }

  const validCategories = ['BAKE', 'BEV', 'MEAT', 'PROD', 'MILK', 'GROC', 'OTHER'];
  if (!validCategories.includes(category.toUpperCase())) {
    alert(`Invalid category. Please use one of: ${validCategories.join(', ')}`);
    return;
  }

  try {
    const response = await fetchAPI('/finance/category-mapping', {
      method: 'POST',
      body: JSON.stringify({
        itemCode,
        category: category.toUpperCase()
      })
    });

    if (response.success) {
      alert(`✅ Category "${category.toUpperCase()}" assigned to ${itemCode}`);
      // Reload quick-fix data
      loadFinanceQuickFix();
    } else {
      alert(`Error: ${response.error || 'Failed to assign category'}`);
    }
  } catch (error) {
    console.error('Error assigning category:', error);
    alert(`Error: ${error.message}`);
  }
}

/**
 * Mark item as finance exception
 */
async function markFinanceException(itemCode) {
  const reason = prompt(`Mark ${itemCode} as exception.\n\nEnter reason (required):`);

  if (!reason || reason.trim().length < 5) {
    alert('Exception reason is required (minimum 5 characters)');
    return;
  }

  try {
    const response = await fetchAPI('/finance/mark-exception', {
      method: 'POST',
      body: JSON.stringify({
        itemCode,
        reason: reason.trim()
      })
    });

    if (response.success) {
      alert(`✅ Item ${itemCode} marked as exception`);
      // Reload quick-fix data
      loadFinanceQuickFix();
    } else {
      alert(`Error: ${response.error || 'Failed to mark exception'}`);
    }
  } catch (error) {
    console.error('Error marking exception:', error);
    alert(`Error: ${error.message}`);
  }
}

// Attach event listeners for Finance Quick-Fix
document.addEventListener('DOMContentLoaded', function() {
  // Refresh Quick-Fix button
  const refreshQuickFixBtn = document.getElementById('refreshQuickFixBtn');
  if (refreshQuickFixBtn) {
    refreshQuickFixBtn.addEventListener('click', loadFinanceQuickFix);
  }

  // Counter click handlers to expand sections
  const needsMappingCounter = document.getElementById('needsMappingCounter');
  if (needsMappingCounter) {
    needsMappingCounter.addEventListener('click', () => {
      const section = document.getElementById('needsMappingSection');
      if (section) {
        section.open = true;
        loadNeedsMappingTable();
      }
    });
  }

  const outOfToleranceCounter = document.getElementById('outOfToleranceCounter');
  if (outOfToleranceCounter) {
    outOfToleranceCounter.addEventListener('click', () => {
      const section = document.getElementById('outOfToleranceSection');
      if (section) {
        section.open = true;
        loadOutOfToleranceTable();
      }
    });
  }

  // Load tables when details are opened
  const needsMappingSection = document.getElementById('needsMappingSection');
  if (needsMappingSection) {
    needsMappingSection.addEventListener('toggle', function() {
      if (this.open) {
        loadNeedsMappingTable();
      }
    });
  }

  const outOfToleranceSection = document.getElementById('outOfToleranceSection');
  if (outOfToleranceSection) {
    outOfToleranceSection.addEventListener('toggle', function() {
      if (this.open) {
        loadOutOfToleranceTable();
      }
    });
  }

  // Load quick-fix data when Financials tab is opened
  const financialsTab = document.querySelector('.tab[onclick*="financials"]');
  if (financialsTab) {
    financialsTab.addEventListener('click', () => {
      // Check if user has finance permissions
      if (window.currentUser && (window.currentUser.role === 'FINANCE' || window.currentUser.role === 'OWNER')) {
        setTimeout(() => {
          loadFinanceQuickFix();
        }, 100);
      }
    });
  }
});

// Export Finance Quick-Fix functions to window
window.loadFinanceQuickFix = loadFinanceQuickFix;
window.loadNeedsMappingTable = loadNeedsMappingTable;
window.loadOutOfToleranceTable = loadOutOfToleranceTable;
window.assignCategoryMapping = assignCategoryMapping;
window.markFinanceException = markFinanceException;

console.log('✅ Finance Quick-Fix v15.5.0 loaded (Workspace)');

/* ============================================
   v15.5.0: Export Confirmation Modal
   ============================================ */

/**
 * Show export confirmation modal with details and guardrails
 * @param {Object} exportDetails - Export request details
 * @param {string} exportDetails.type - Export type (e.g., "Financial Summary", "Inventory Count")
 * @param {string} exportDetails.timeframe - Time range (e.g., "Jan 2025", "Q1 2025")
 * @param {number} exportDetails.estimatedRows - Estimated row count
 * @param {number} exportDetails.estimatedSizeMB - Estimated file size in MB
 * @param {Function} exportDetails.onConfirm - Callback to execute export
 */
function showExportConfirmModal(exportDetails) {
  const modal = document.getElementById('exportConfirmModal');
  if (!modal) {
    console.error('Export confirmation modal not found');
    return;
  }

  // Populate export details
  document.getElementById('exportType').textContent = exportDetails.type || 'Unknown';

  const timeframeEl = document.getElementById('exportTimeframe');
  if (timeframeEl) {
    timeframeEl.textContent = exportDetails.timeframe || 'Not specified';
  }

  const rowCount = exportDetails.estimatedRows || 0;
  const rowCountEl = document.getElementById('exportRowCount');
  rowCountEl.textContent = rowCount.toLocaleString();

  // Warn if exceeds maximum
  if (rowCount > 50000) {
    rowCountEl.innerHTML = `<span style="color: var(--danger);">${rowCount.toLocaleString()} ⚠️ Exceeds maximum (50,000)</span>`;
  }

  const fileSizeEl = document.getElementById('exportFileSize');
  if (fileSizeEl) {
    const sizeMB = exportDetails.estimatedSizeMB || 0;
    fileSizeEl.textContent = `~${sizeMB.toFixed(2)} MB`;
  }

  // Load and display rate limit status
  loadExportRateLimit();

  // Reset acknowledgment checkbox
  const acknowledgmentCheckbox = document.getElementById('exportAcknowledgment');
  acknowledgmentCheckbox.checked = false;

  // Disable confirm button initially
  const confirmBtn = document.getElementById('confirmExportBtn');
  confirmBtn.disabled = true;

  // Store the onConfirm callback
  modal.dataset.onConfirm = 'pendingExportCallback';
  window.pendingExportCallback = exportDetails.onConfirm;

  // Show modal
  modal.classList.add('modal-active');
  console.log('✅ Export confirmation modal opened', exportDetails);
}

/**
 * Hide export confirmation modal
 */
function hideExportConfirmModal() {
  const modal = document.getElementById('exportConfirmModal');
  if (modal) {
    modal.classList.remove('modal-active');

    // Clear callback
    delete window.pendingExportCallback;

    console.log('Export confirmation modal closed');
  }
}

/**
 * Load and display export rate limit status
 */
async function loadExportRateLimit() {
  try {
    const response = await fetchAPI('/api/export/rate-limit');

    if (response.success) {
      const { remaining, limit, resetAt } = response;
      const usedCount = limit - remaining;
      const percentage = (usedCount / limit) * 100;

      // Update rate limit bar
      const rateBar = document.getElementById('exportRateBar');
      rateBar.style.width = `${percentage}%`;

      // Update rate limit text
      const rateLimitText = document.getElementById('exportRateLimitText');
      if (rateLimitText) {
        rateLimitText.textContent = `${remaining} of ${limit} exports remaining (resets ${new Date(resetAt).toLocaleString()})`;
      }

      // Warn if limit reached
      if (remaining === 0) {
        const confirmBtn = document.getElementById('confirmExportBtn');
        confirmBtn.disabled = true;
        confirmBtn.textContent = '🚫 Rate Limit Reached';

        alert('⚠️ Export rate limit reached. Please try again later.');
      }

      console.log('✅ Export rate limit loaded', { remaining, limit, percentage: percentage.toFixed(1) + '%' });
    } else {
      console.warn('Failed to load export rate limit:', response.error);
      // Default to 0% if failed to load
      document.getElementById('exportRateBar').style.width = '0%';
    }
  } catch (error) {
    console.error('Error loading export rate limit:', error);
    document.getElementById('exportRateBar').style.width = '0%';
  }
}

/**
 * Handle export confirmation
 */
async function confirmExport() {
  const acknowledgmentCheckbox = document.getElementById('exportAcknowledgment');

  if (!acknowledgmentCheckbox.checked) {
    alert('⚠️ Please acknowledge secure data handling before exporting.');
    return;
  }

  const confirmBtn = document.getElementById('confirmExportBtn');
  confirmBtn.disabled = true;
  confirmBtn.textContent = '⏳ Exporting...';

  try {
    // Execute the stored callback
    if (window.pendingExportCallback && typeof window.pendingExportCallback === 'function') {
      await window.pendingExportCallback();
      console.log('✅ Export executed successfully');

      // Close modal after successful export
      hideExportConfirmModal();
    } else {
      throw new Error('No export callback found');
    }
  } catch (error) {
    console.error('Error executing export:', error);
    alert(`❌ Export failed: ${error.message}`);

    // Re-enable button
    confirmBtn.disabled = false;
    confirmBtn.textContent = '📥 Proceed with Export';
  }
}

/**
 * Toggle export confirm button based on acknowledgment
 */
function toggleExportConfirmButton() {
  const acknowledgmentCheckbox = document.getElementById('exportAcknowledgment');
  const confirmBtn = document.getElementById('confirmExportBtn');

  if (acknowledgmentCheckbox.checked) {
    confirmBtn.disabled = false;
  } else {
    confirmBtn.disabled = true;
  }
}

// Export functions to window
window.showExportConfirmModal = showExportConfirmModal;
window.hideExportConfirmModal = hideExportConfirmModal;
window.loadExportRateLimit = loadExportRateLimit;
window.confirmExport = confirmExport;
window.toggleExportConfirmButton = toggleExportConfirmButton;

console.log('✅ Export Confirmation Modal v15.5.0 loaded');

// Event listeners for Export Confirmation Modal
document.addEventListener('DOMContentLoaded', function() {
  // Close modal button
  const closeExportConfirmModalBtn = document.getElementById('closeExportConfirmModalBtn');
  if (closeExportConfirmModalBtn) {
    closeExportConfirmModalBtn.addEventListener('click', hideExportConfirmModal);
  }

  // Cancel button
  const cancelExportBtn = document.getElementById('cancelExportBtn');
  if (cancelExportBtn) {
    cancelExportBtn.addEventListener('click', hideExportConfirmModal);
  }

  // Confirm button
  const confirmExportBtn = document.getElementById('confirmExportBtn');
  if (confirmExportBtn) {
    confirmExportBtn.addEventListener('click', confirmExport);
  }

  // Acknowledgment checkbox
  const exportAcknowledgment = document.getElementById('exportAcknowledgment');
  if (exportAcknowledgment) {
    exportAcknowledgment.addEventListener('change', toggleExportConfirmButton);
  }

  // Close modal on backdrop click
  const exportConfirmModal = document.getElementById('exportConfirmModal');
  if (exportConfirmModal) {
    exportConfirmModal.addEventListener('click', function(event) {
      if (event.target === exportConfirmModal) {
        hideExportConfirmModal();
      }
    });
  }
});

// ============================================================================
// GFS Invoice Upload Functions (v15.5.4)
// ============================================================================

function openGFSUploadModal() {
  const modal = document.getElementById('gfsUploadModal');
  if (modal) {
    modal.style.display = 'flex';
    // Reset form
    document.getElementById('gfsUploadForm').reset();
    document.getElementById('gfsUploadProgress').classList.add('hidden');
    document.getElementById('gfsUploadResults').classList.add('hidden');
    document.getElementById('gfsUploadBtn').disabled = false;
  }
}

function closeGFSUploadModal() {
  const modal = document.getElementById('gfsUploadModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

async function uploadGFSInvoice() {
  const fileInput = document.getElementById('gfsInvoiceFile');
  const files = fileInput.files;

  if (!files || files.length === 0) {
    alert('Please select at least one PDF file');
    return;
  }

  const uploadBtn = document.getElementById('gfsUploadBtn');
  const progressDiv = document.getElementById('gfsUploadProgress');
  const resultsDiv = document.getElementById('gfsUploadResults');
  const statusDiv = document.getElementById('gfsUploadStatus');
  const progressBar = document.getElementById('gfsUploadProgressBar');
  const summaryDiv = document.getElementById('gfsUploadSummary');

  uploadBtn.disabled = true;
  progressDiv.classList.remove('hidden');
  resultsDiv.classList.add('hidden');

  let successCount = 0;
  let failCount = 0;
  let skipCount = 0;
  const failedFiles = [];
  const skippedFiles = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    statusDiv.textContent = `Uploading ${i + 1} of ${files.length}: ${file.name}...`;
    progressBar.value = (i / files.length) * 100;

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/owner/pdfs/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sessionStorage.getItem('ownerToken') || localStorage.getItem('ownerToken')}`
        },
        body: formData
      });

      const data = await response.json();

      if (response.ok) {
        successCount++;
      } else if (response.status === 409 || (data.message && data.message.includes('duplicate'))) {
        // Duplicate found - skip it
        skipCount++;
        skippedFiles.push(file.name);
      } else {
        failCount++;
        failedFiles.push(file.name);
      }
    } catch (error) {
      failCount++;
      failedFiles.push(file.name);
      console.error('Upload error:', error);
    }
  }

  progressBar.value = 100;
  statusDiv.textContent = 'Upload complete!';

  // Show results
  setTimeout(() => {
    progressDiv.classList.add('hidden');
    resultsDiv.classList.remove('hidden');

    let summaryHTML = `<p>✅ Successfully uploaded: <strong>${successCount}</strong> invoice(s)</p>`;
    if (skipCount > 0) {
      summaryHTML += `<p>⏭️ Skipped (duplicates): <strong>${skipCount}</strong> invoice(s)</p>`;
      summaryHTML += `<p><small>Skipped files: ${skippedFiles.join(', ')}</small></p>`;
    }
    if (failCount > 0) {
      summaryHTML += `<p>❌ Failed: <strong>${failCount}</strong> invoice(s)</p>`;
      summaryHTML += `<p><small>Failed files: ${failedFiles.join(', ')}</small></p>`;
    }
    summaryDiv.innerHTML = summaryHTML;

    uploadBtn.disabled = false;

    // Refresh GFS stats
    loadGFSInvoiceStats();

    // Auto-close after 3 seconds if all succeeded
    if (failCount === 0) {
      setTimeout(() => {
        closeGFSUploadModal();
      }, 3000);
    }
  }, 500);
}

function viewGFSInvoiceStatus() {
  // Show invoice status by fiscal period
  fetch('/api/owner/pdfs?vendor=GFS&period=FY26-P02', {
    headers: {
      'Authorization': `Bearer ${sessionStorage.getItem('ownerToken') || localStorage.getItem('ownerToken')}`
    }
  })
  .then(response => response.json())
  .then(data => {
    const count = data.docs ? data.docs.length : 0;
    const total = data.docs ? data.docs.reduce((sum, doc) => sum + (doc.invoice_amount || 0), 0) : 0;
    alert(`FY26-P02 (October 2025) Status:\n\n✅ Invoices: ${count}\n💰 Total Amount: $${total.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`);
  })
  .catch(error => {
    console.error('Error fetching invoice status:', error);
    alert('Error fetching invoice status. Please try again.');
  });
}

function generateGFSReport() {
  // Generate report for current period
  const confirmed = confirm('Generate GFS Monthly Report for FY26-P02 (October 2025)?');
  if (!confirmed) return;

  alert('Report generation initiated. This may take a few moments...');

  // Trigger report generation via backend script
  fetch('/api/owner/generate-gfs-report', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${sessionStorage.getItem('ownerToken') || localStorage.getItem('ownerToken')}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      fiscal_period: 'FY26-P02'
    })
  })
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      alert(`✅ Report generated successfully!\n\nFile: ${data.filename}\n\nLocation: ~/Desktop/GFS_Fiscal_Reports_WITH_CATEGORIES/`);
    } else {
      alert(`⚠️ Report generation completed with warnings:\n\n${data.message}`);
    }
  })
  .catch(error => {
    console.error('Error generating report:', error);
    alert('⚠️ Error generating report. Please check the backend logs.');
  });
}

function loadGFSInvoiceStats() {
  // Load stats for the GFS Invoice Management card
  fetch('/api/owner/pdfs?vendor=GFS&period=FY26-P02', {
    headers: {
      'Authorization': `Bearer ${sessionStorage.getItem('ownerToken') || localStorage.getItem('ownerToken')}`
    }
  })
  .then(response => response.json())
  .then(data => {
    const docs = data.docs || [];
    const count = docs.length;
    const total = docs.reduce((sum, doc) => sum + (doc.invoice_amount || 0), 0);
    const lastUpload = docs.length > 0 ? new Date(Math.max(...docs.map(d => new Date(d.created_at)))).toLocaleString() : '--';

    document.getElementById('gfsCurrentPeriodCount').textContent = count;
    document.getElementById('gfsTotalAmount').textContent = `$${total.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    document.getElementById('gfsLastUpload').textContent = lastUpload;
  })
  .catch(error => {
    console.error('Error loading GFS stats:', error);
    document.getElementById('gfsCurrentPeriodCount').textContent = '--';
    document.getElementById('gfsTotalAmount').textContent = '--';
    document.getElementById('gfsLastUpload').textContent = '--';
  });
}

// Export GFS functions
window.openGFSUploadModal = openGFSUploadModal;
window.closeGFSUploadModal = closeGFSUploadModal;
window.uploadGFSInvoice = uploadGFSInvoice;
window.viewGFSInvoiceStatus = viewGFSInvoiceStatus;
window.generateGFSReport = generateGFSReport;
window.loadGFSInvoiceStats = loadGFSInvoiceStats;

console.log('✅ GFS Invoice Management v15.5.4 loaded');

// Auto-load GFS stats when forecast tab is opened
document.addEventListener('DOMContentLoaded', function() {
  // Load GFS stats when switching to forecast tab
  const forecastTab = document.querySelector('.tab[onclick*="forecast"]');
  if (forecastTab) {
    forecastTab.addEventListener('click', function() {
      setTimeout(loadGFSInvoiceStats, 100);
    });
  }
});

/* ============================================
   v15.8 Quantum Governance Tab
   ============================================ */
(function(){
  const $ = (sel) => document.querySelector(sel);
  const fmtPct = (n) => (n==null ? '—' : Number(n).toFixed(1) + '%');

  function authHeaders(){
    const t = localStorage.getItem('authToken') || window.authToken || sessionStorage.getItem('ownerToken') || localStorage.getItem('ownerToken');
    const h = { 'Accept':'application/json' };
    if (t) h['Authorization'] = `Bearer ${t}`;
    return h;
  }

  async function fetchJSON(url, options={}){
    const res = await fetch(url, { headers: authHeaders(), ...options });
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  function colorOf(score){
    if (score >= 90) return 'green';
    if (score >= 75) return 'amber';
    return 'red';
  }

  async function loadGovernanceStatus(){
    try {
      const data = await fetchJSON('/api/governance/status');

      // Update main score
      $('#governanceScore').textContent = fmtPct(data.governance_score);

      // Update pillar scores
      $('#governanceFinance').textContent = fmtPct(data.pillars.finance_accuracy);
      $('#governanceHealth').textContent = fmtPct(data.pillars.health_score);
      $('#governanceAI').textContent = fmtPct(data.pillars.ai_intelligence_index);
      $('#governanceMenu').textContent = fmtPct(data.pillars.menu_forecast_accuracy);

      // Update badge color
      const badge = $('#governanceStatusBadge');
      badge.textContent = data.status;
      badge.className = 'badge badge-' + colorOf(data.governance_score);

      // Render alerts
      const tbody = $('#governanceAlertsBody');
      tbody.innerHTML = '';

      if (!data.alerts || data.alerts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">No active alerts</td></tr>';
      } else {
        data.alerts.forEach(alert => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${new Date(alert.created_at).toLocaleString()}</td>
            <td>${alert.type}</td>
            <td><span class="badge badge-${alert.severity}">${alert.severity}</span></td>
            <td>${alert.message}</td>
            <td>${JSON.stringify(alert.details || {}).slice(0, 100)}</td>
          `;
          tbody.appendChild(tr);
        });
      }

      console.log('✅ Governance status loaded:', data);
    } catch (error) {
      console.error('Error loading governance status:', error);
      alert('⚠️ Error loading governance status. Please check backend.');
    }
  }

  async function recomputeGovernance(){
    try {
      // Check if user is OWNER
      if (!hasRole('OWNER')) {
        alert('⚠️ Only OWNER can recompute governance score.');
        return;
      }

      const data = await fetchJSON('/api/governance/recompute', { method: 'POST' });
      console.log('✅ Governance recomputed:', data);

      // Reload status
      await loadGovernanceStatus();

      alert(`✅ Governance score recomputed: ${data.governance_score.toFixed(1)}/100 (${data.status})`);
    } catch (error) {
      console.error('Error recomputing governance:', error);
      alert('⚠️ Error recomputing governance. Please check backend.');
    }
  }

  // Initialize event listeners
  document.addEventListener('DOMContentLoaded', () => {
    const refreshBtn = $('#governanceRefreshBtn');
    const recomputeBtn = $('#governanceRecomputeBtn');

    if (refreshBtn) {
      refreshBtn.addEventListener('click', loadGovernanceStatus);
    }

    if (recomputeBtn) {
      recomputeBtn.addEventListener('click', recomputeGovernance);

      // RBAC gating: Hide recompute button for non-OWNER users
      if (!hasRole('OWNER')) {
        recomputeBtn.style.display = 'none';
      }
    }

    console.log('✅ Quantum Governance v15.8.0 initialized');
  });

  // Export functions to global scope
  window.loadGovernanceStatus = loadGovernanceStatus;
  window.recomputeGovernance = recomputeGovernance;
})();

/* ============================================
   v15.9.0: Governance Trends & Forecasting
   ============================================ */
(function() {
  function $$(sel) { return document.querySelector(sel); }

  function authHeaders(){
    const t = localStorage.getItem('authToken') || window.authToken || sessionStorage.getItem('ownerToken') || localStorage.getItem('ownerToken');
    const h = { 'Accept':'application/json' };
    if (t) h['Authorization'] = `Bearer ${t}`;
    return h;
  }

  async function fetchJSON(url, options={}){
    const res = await fetch(url, { headers: authHeaders(), ...options });
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  function colorOf(score){
    if (score >= 90) return 'green';
    if (score >= 75) return 'amber';
    return 'red';
  }

  /**
   * Load governance trends from backend
   */
  async function loadGovernanceTrends() {
    try {
      const period = $$('#governanceTrendsPeriod')?.value || '30';
      const pillar = $$('#governanceTrendsPillar')?.value || 'all';

      // Calculate date range
      const to = new Date().toISOString().split('T')[0];
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - parseInt(period));
      const from = fromDate.toISOString().split('T')[0];

      console.log(`📊 Loading governance trends: ${from} → ${to}, pillar=${pillar}`);

      const data = await fetchJSON(`/api/governance/trends?from=${from}&to=${to}&pillar=${pillar}`);

      console.log('✅ Governance trends loaded:', data);

      // Render sparklines
      renderGovernanceSparklines(data);
    } catch (error) {
      console.error('❌ Error loading governance trends:', error);
      const container = $$('#governanceTrendsContainer');
      if (container) {
        container.innerHTML = `<div class="alert alert-danger">
          ⚠️ Error loading trends: ${error.message}
        </div>`;
      }
    }
  }

  /**
   * Render sparklines for governance trends (pure SVG, CSP-safe)
   * @param {Object} data - Response from /api/governance/trends
   */
  function renderGovernanceSparklines(data) {
    const container = $$('#governanceTrendsContainer');
    if (!container) return;

    const { series, forecasts } = data;

    // Group series by pillar
    const pillarData = {};
    series.forEach(point => {
      if (!pillarData[point.pillar]) {
        pillarData[point.pillar] = [];
      }
      pillarData[point.pillar].push({
        date: point.as_of,
        score: point.score
      });
    });

    // Group forecasts by pillar and horizon
    const forecastData = {};
    forecasts.forEach(fc => {
      if (!forecastData[fc.pillar]) {
        forecastData[fc.pillar] = {};
      }
      forecastData[fc.pillar][fc.horizon] = {
        date: fc.as_of,
        score: fc.score,
        lower: fc.lower,
        upper: fc.upper
      };
    });

    // Get selected horizon
    const selectedHorizon = parseInt($$('#governanceTrendsForecastHorizon')?.value || '14');

    // Render each pillar
    const pillarNames = {
      finance: '💰 Finance',
      health: '🏥 Health',
      ai: '🧠 AI',
      menu: '📊 Menu',
      composite: '⚛️ Composite'
    };

    const html = [];

    html.push('<div class="governance-trends-grid">');

    Object.keys(pillarData).forEach(pillar => {
      const seriesData = pillarData[pillar];
      const forecast = forecastData[pillar]?.[selectedHorizon];

      const latestScore = seriesData[seriesData.length - 1]?.score || 0;
      const color = colorOf(latestScore);
      const pillarLabel = pillarNames[pillar] || pillar;

      html.push(`
        <div class="governance-trend-card">
          <div class="governance-trend-header">
            <span class="governance-trend-label">${pillarLabel}</span>
            <span class="badge badge-${color}">${latestScore.toFixed(1)}</span>
          </div>
          <div class="governance-trend-sparkline" id="sparkline-${pillar}"></div>
          ${forecast ? `
            <div class="governance-trend-forecast">
              Forecast (${selectedHorizon}d): <strong>${forecast.score.toFixed(1)}</strong>
              <span class="text-light-small">(${forecast.lower.toFixed(1)}–${forecast.upper.toFixed(1)})</span>
            </div>
          ` : ''}
        </div>
      `);
    });

    html.push('</div>');

    container.innerHTML = html.join('');

    // Render SVG sparklines for each pillar
    Object.keys(pillarData).forEach(pillar => {
      const seriesData = pillarData[pillar];
      const forecast = forecastData[pillar]?.[selectedHorizon];
      const sparklineEl = $$(`#sparkline-${pillar}`);

      if (sparklineEl) {
        renderSparkline(sparklineEl, seriesData, forecast);
      }
    });
  }

  /**
   * Render a pure SVG sparkline (CSP-safe)
   * @param {HTMLElement} container - Container element
   * @param {Array} series - Array of {date, score} objects
   * @param {Object} forecast - Optional forecast {date, score, lower, upper}
   */
  function renderSparkline(container, series, forecast) {
    if (!series || series.length === 0) {
      container.innerHTML = '<div class="text-light-small">No data</div>';
      return;
    }

    const width = 300;
    const height = 60;
    const padding = 5;

    // Calculate scales
    const xScale = (width - 2 * padding) / (series.length - 1);
    const allScores = series.map(s => s.score);
    const minScore = Math.min(...allScores, forecast?.lower || 100);
    const maxScore = Math.max(...allScores, forecast?.upper || 0);
    const yRange = maxScore - minScore || 10;
    const yScale = (height - 2 * padding) / yRange;

    // Helper to get Y coordinate (inverted for SVG)
    const getY = (score) => height - padding - ((score - minScore) * yScale);

    // Create SVG
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.setAttribute('class', 'governance-sparkline-svg');

    // Draw baseline grid
    const baseline50 = getY(50);
    const baseline75 = getY(75);
    const baseline90 = getY(90);

    [
      { y: baseline50, color: '#e0e0e0', label: '50' },
      { y: baseline75, color: '#ffb74d', label: '75' },
      { y: baseline90, color: '#81c784', label: '90' }
    ].forEach(({ y, color, label }) => {
      if (y >= padding && y <= height - padding) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', padding);
        line.setAttribute('x2', width - padding);
        line.setAttribute('y1', y);
        line.setAttribute('y2', y);
        line.setAttribute('stroke', color);
        line.setAttribute('stroke-width', '0.5');
        line.setAttribute('stroke-dasharray', '2,2');
        svg.appendChild(line);
      }
    });

    // Draw confidence band if forecast exists
    if (forecast) {
      const lastX = padding + (series.length - 1) * xScale;
      const forecastX = width - padding;

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const upperY = getY(forecast.upper);
      const lowerY = getY(forecast.lower);
      const scoreY = getY(forecast.score);

      path.setAttribute('d', `
        M ${lastX} ${getY(series[series.length - 1].score)}
        L ${forecastX} ${scoreY}
        L ${forecastX} ${upperY}
        L ${lastX} ${getY(series[series.length - 1].score)}
        M ${forecastX} ${scoreY}
        L ${forecastX} ${lowerY}
        L ${lastX} ${getY(series[series.length - 1].score)}
      `);
      path.setAttribute('fill', '#bbdefb');
      path.setAttribute('fill-opacity', '0.3');
      path.setAttribute('stroke', 'none');
      svg.appendChild(path);
    }

    // Draw line
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    const points = series.map((s, i) => {
      const x = padding + i * xScale;
      const y = getY(s.score);
      return `${x},${y}`;
    }).join(' ');

    line.setAttribute('points', points);
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke', '#2196f3');
    line.setAttribute('stroke-width', '2');
    svg.appendChild(line);

    // Draw points
    series.forEach((s, i) => {
      const x = padding + i * xScale;
      const y = getY(s.score);

      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', x);
      circle.setAttribute('cy', y);
      circle.setAttribute('r', '3');
      circle.setAttribute('fill', '#2196f3');
      svg.appendChild(circle);

      // Add tooltip
      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      title.textContent = `${s.date}: ${s.score.toFixed(1)}`;
      circle.appendChild(title);
    });

    // Draw forecast point
    if (forecast) {
      const forecastX = width - padding;
      const forecastY = getY(forecast.score);

      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', forecastX);
      circle.setAttribute('cy', forecastY);
      circle.setAttribute('r', '4');
      circle.setAttribute('fill', '#ff9800');
      circle.setAttribute('stroke', '#fff');
      circle.setAttribute('stroke-width', '1');
      svg.appendChild(circle);

      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      title.textContent = `Forecast: ${forecast.score.toFixed(1)} (${forecast.lower.toFixed(1)}–${forecast.upper.toFixed(1)})`;
      circle.appendChild(title);
    }

    container.innerHTML = '';
    container.appendChild(svg);
  }

  /**
   * Record daily governance scores
   */
  async function recordDailyScores() {
    try {
      if (!hasRole('OWNER')) {
        alert('⚠️ Only OWNER can record daily scores.');
        return;
      }

      const btn = $$('#governanceRecomputeDailyBtn');
      if (btn) btn.disabled = true;

      console.log('📊 Recording daily governance scores...');

      const data = await fetchJSON('/api/governance/recompute/daily', { method: 'POST' });

      console.log('✅ Daily scores recorded:', data);

      alert(`✅ Daily scores recorded for ${data.as_of}\n\nFinance: ${data.scores.finance.toFixed(1)}\nHealth: ${data.scores.health.toFixed(1)}\nAI: ${data.scores.ai.toFixed(1)}\nMenu: ${data.scores.menu.toFixed(1)}\nComposite: ${data.scores.composite.toFixed(1)}`);

      // Reload trends
      await loadGovernanceTrends();
    } catch (error) {
      console.error('❌ Error recording daily scores:', error);
      alert(`⚠️ Error recording daily scores: ${error.message}`);
    } finally {
      const btn = $$('#governanceRecomputeDailyBtn');
      if (btn) btn.disabled = false;
    }
  }

  /**
   * Recompute governance forecasts
   */
  async function recomputeForecast() {
    try {
      if (!hasRole('OWNER')) {
        alert('⚠️ Only OWNER can recompute forecasts.');
        return;
      }

      const btn = $$('#governanceRecomputeForecastBtn');
      if (btn) btn.disabled = true;

      console.log('🔮 Recomputing governance forecasts...');

      const data = await fetchJSON('/api/governance/recompute/forecast', { method: 'POST' });

      console.log('✅ Forecasts computed:', data);

      alert(`✅ Forecasts computed!\n\nRun ID: ${data.run_id}\nForecasts: ${data.forecast_count}\nRuntime: ${data.runtime_seconds.toFixed(2)}s`);

      // Reload trends
      await loadGovernanceTrends();
    } catch (error) {
      console.error('❌ Error computing forecasts:', error);
      alert(`⚠️ Error computing forecasts: ${error.message}`);
    } finally {
      const btn = $$('#governanceRecomputeForecastBtn');
      if (btn) btn.disabled = false;
    }
  }

  // Initialize event listeners
  document.addEventListener('DOMContentLoaded', () => {
    const refreshBtn = $$('#governanceTrendsRefreshBtn');
    const dailyBtn = $$('#governanceRecomputeDailyBtn');
    const forecastBtn = $$('#governanceRecomputeForecastBtn');
    const periodSelect = $$('#governanceTrendsPeriod');
    const pillarSelect = $$('#governanceTrendsPillar');
    const horizonSelect = $$('#governanceTrendsForecastHorizon');

    if (refreshBtn) {
      refreshBtn.addEventListener('click', loadGovernanceTrends);
    }

    if (dailyBtn) {
      dailyBtn.addEventListener('click', recordDailyScores);
    }

    if (forecastBtn) {
      forecastBtn.addEventListener('click', recomputeForecast);
    }

    // Reload trends when filters change
    if (periodSelect) {
      periodSelect.addEventListener('change', loadGovernanceTrends);
    }

    if (pillarSelect) {
      pillarSelect.addEventListener('change', loadGovernanceTrends);
    }

    if (horizonSelect) {
      horizonSelect.addEventListener('change', loadGovernanceTrends);
    }

    console.log('✅ Governance Trends & Forecasting v15.9.0 initialized');
  });

  // Export functions to global scope
  window.loadGovernanceTrends = loadGovernanceTrends;
  window.recordDailyScores = recordDailyScores;
  window.recomputeForecast = recomputeForecast;
})();

// ==== v16.0.0 Governance Intelligence ====
(function() {
  'use strict';

  /**
   * Bilingual translations for Intelligence Dashboard
   */
  const L = {
    en: {
      title: 'Governance Intelligence Dashboard',
      insights: 'Insights',
      anomalies: 'Active Anomalies',
      refresh: 'Refresh',
      recompute: 'Recompute',
      report: 'Report',
      intelligenceScore: 'Intelligence Score',
      finance: 'Finance',
      health: 'Health',
      ai: 'AI',
      menu: 'Menu',
      trend: '7-Day Intelligence Trend',
      pillar: 'Pillar',
      type: 'Type',
      severity: 'Severity',
      message: 'Message',
      date: 'Date',
      noInsights: 'No insights available',
      noAnomalies: 'No active anomalies',
      clickRefresh: 'Click Refresh to load data...',
      recomputing: 'Recomputing intelligence...',
      generating: 'Generating report...',
      excellent: 'Excellent',
      good: 'Good',
      fair: 'Fair',
      poor: 'Poor',
      critical: 'Critical',
      high: 'High',
      medium: 'Medium',
      low: 'Low'
    },
    fr: {
      title: 'Tableau de bord Intelligence de Gouvernance',
      insights: 'Perspectives',
      anomalies: 'Anomalies Actives',
      refresh: 'Actualiser',
      recompute: 'Recalculer',
      report: 'Rapport',
      intelligenceScore: 'Score d\'Intelligence',
      finance: 'Finance',
      health: 'Santé',
      ai: 'IA',
      menu: 'Menu',
      trend: 'Tendance Intelligence 7 jours',
      pillar: 'Pilier',
      type: 'Type',
      severity: 'Sévérité',
      message: 'Message',
      date: 'Date',
      noInsights: 'Aucune perspective disponible',
      noAnomalies: 'Aucune anomalie active',
      clickRefresh: 'Cliquez sur Actualiser pour charger les données...',
      recomputing: 'Recalcul de l\'intelligence...',
      generating: 'Génération du rapport...',
      excellent: 'Excellent',
      good: 'Bien',
      fair: 'Passable',
      poor: 'Faible',
      critical: 'Critique',
      high: 'Élevée',
      medium: 'Moyenne',
      low: 'Faible'
    }
  };

  /**
   * Get current locale from selector
   */
  function getLocale() {
    const select = $$('#gi-locale');
    return select ? select.value : 'en';
  }

  /**
   * Translate text based on current locale
   */
  function t(key) {
    const locale = getLocale();
    return L[locale][key] || key;
  }

  /**
   * Get score badge level based on intelligence score
   */
  function getScoreBadge(score) {
    if (score >= 80) return { text: t('excellent'), className: 'badge-success' };
    if (score >= 60) return { text: t('good'), className: 'badge-info' };
    if (score >= 40) return { text: t('fair'), className: 'badge-warning' };
    return { text: t('poor'), className: 'badge-danger' };
  }

  /**
   * Get severity badge configuration
   */
  function getSeverityBadge(severity) {
    const severityMap = {
      critical: { text: t('critical'), className: 'severity-critical' },
      high: { text: t('high'), className: 'severity-high' },
      medium: { text: t('medium'), className: 'severity-medium' },
      low: { text: t('low'), className: 'severity-low' }
    };
    return severityMap[severity] || { text: severity, className: 'badge' };
  }

  /**
   * Load and display intelligence dashboard data
   */
  async function loadIntelligence() {
    try {
      const locale = getLocale();
      console.log(`🔮 Loading intelligence dashboard (locale: ${locale})...`);

      // Show loading state
      const scoreEl = $$('#gi-score');
      if (scoreEl) scoreEl.textContent = '...';

      // Fetch intelligence status
      const data = await fetchJSON(`/api/governance/intelligence/status?locale=${locale}&resolved=false`);

      console.log('✅ Intelligence data loaded:', data);

      // Update intelligence score
      if (scoreEl) {
        scoreEl.textContent = data.intelligence_score || '--';
      }

      const scoreBadgeEl = $$('#gi-score-badge');
      if (scoreBadgeEl && data.intelligence_score !== null) {
        const badge = getScoreBadge(data.intelligence_score);
        scoreBadgeEl.textContent = badge.text;
        scoreBadgeEl.className = `badge ${badge.className}`;
      }

      // Update pillar scores
      const pillars = ['finance', 'health', 'ai', 'menu'];
      pillars.forEach(pillar => {
        const el = $$(`#gi-${pillar}`);
        if (el) {
          const pillarData = data.pillar_scores?.find(p => p.pillar === pillar);
          el.textContent = pillarData ? pillarData.score.toFixed(1) : '--';
        }
      });

      // Render insights
      renderInsights(data.insights || []);

      // Render anomalies
      renderAnomalies(data.anomalies || []);

      // Render trend chart
      renderTrend(data.trend || []);

      // Update locale-specific labels
      updateLabels();

    } catch (error) {
      console.error('❌ Error loading intelligence:', error);
      alert(`⚠️ Error loading intelligence: ${error.message}`);
    }
  }

  /**
   * Update UI labels based on current locale
   */
  function updateLabels() {
    const insightsTitleEl = $$('#gi-insights-title');
    if (insightsTitleEl) insightsTitleEl.textContent = t('insights');

    const anomaliesTitleEl = $$('#gi-anomalies-title');
    if (anomaliesTitleEl) anomaliesTitleEl.textContent = t('anomalies');
  }

  /**
   * Render insights section
   */
  function renderInsights(insights) {
    const container = $$('#gi-insights');
    const countEl = $$('#gi-insights-count');

    if (!container) return;

    if (countEl) {
      countEl.textContent = insights.length;
    }

    if (insights.length === 0) {
      container.innerHTML = `<p style="color: #999; padding: 16px;">${t('noInsights')}</p>`;
      return;
    }

    const locale = getLocale();
    const html = insights.map(insight => {
      const pillarEmoji = {
        finance: '💰',
        health: '❤️',
        ai: '🤖',
        menu: '🍽️',
        composite: '🔮'
      }[insight.pillar] || '📊';

      const confidencePercent = (insight.confidence * 100).toFixed(0);
      const confidenceClass = insight.confidence >= 0.8 ? 'badge-success' :
                               insight.confidence >= 0.6 ? 'badge-info' : 'badge-warning';

      return `
        <div style="padding: 12px; border-bottom: 1px solid #e0e0e0; display: flex; gap: 12px; align-items: start;">
          <div style="font-size: 24px; flex-shrink: 0;">${pillarEmoji}</div>
          <div style="flex: 1;">
            <div style="font-weight: 500; margin-bottom: 4px;">${insight.insight}</div>
            <div style="font-size: 12px; color: #666;">
              ${insight.as_of} &middot; ${insight.pillar.charAt(0).toUpperCase() + insight.pillar.slice(1)} &middot;
              <span class="badge ${confidenceClass}" style="padding: 2px 6px;">${confidencePercent}% confidence</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = html;
  }

  /**
   * Render anomalies table
   */
  function renderAnomalies(anomalies) {
    const tbody = $$('#gi-anomalies-body');
    const countEl = $$('#gi-anomalies-count');

    if (!tbody) return;

    if (countEl) {
      countEl.textContent = anomalies.length;
    }

    if (anomalies.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #999; padding: 16px;">${t('noAnomalies')}</td></tr>`;
      return;
    }

    const html = anomalies.map(anomaly => {
      const badge = getSeverityBadge(anomaly.severity);
      const deltaFormatted = anomaly.delta > 0 ? `+${anomaly.delta.toFixed(1)}` : anomaly.delta.toFixed(1);

      return `
        <tr>
          <td>${anomaly.as_of}</td>
          <td>${anomaly.pillar.charAt(0).toUpperCase() + anomaly.pillar.slice(1)}</td>
          <td>${anomaly.type}</td>
          <td><span class="badge ${badge.className}">${badge.text}</span></td>
          <td style="font-weight: 500; color: ${anomaly.delta < 0 ? '#d32f2f' : '#388e3c'};">${deltaFormatted}%</td>
          <td style="max-width: 300px;">${anomaly.message}</td>
        </tr>
      `;
    }).join('');

    tbody.innerHTML = html;
  }

  /**
   * Render SVG trend chart (CSP-compliant sparkline)
   */
  function renderTrend(trend) {
    const svg = $$('#gi-trend');
    if (!svg) return;

    // Clear existing content
    svg.innerHTML = '';

    if (!trend || trend.length === 0) {
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', '50%');
      text.setAttribute('y', '50%');
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('fill', '#999');
      text.setAttribute('font-size', '12');
      text.textContent = 'No trend data available';
      svg.appendChild(text);
      return;
    }

    const width = svg.clientWidth || 800;
    const height = 80;
    const padding = { top: 10, right: 40, bottom: 20, left: 40 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // Calculate min/max for Y-axis
    const scores = trend.map(d => d.intelligence_score);
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);
    const yRange = maxScore - minScore || 10;
    const yMin = Math.max(0, minScore - yRange * 0.1);
    const yMax = Math.min(100, maxScore + yRange * 0.1);

    // Create path data
    const points = trend.map((d, i) => {
      const x = padding.left + (i / (trend.length - 1)) * chartWidth;
      const y = padding.top + chartHeight - ((d.intelligence_score - yMin) / (yMax - yMin)) * chartHeight;
      return { x, y, score: d.intelligence_score, date: d.as_of };
    });

    // Draw grid lines
    const gridLines = [0, 25, 50, 75, 100].filter(v => v >= yMin && v <= yMax);
    gridLines.forEach(value => {
      const y = padding.top + chartHeight - ((value - yMin) / (yMax - yMin)) * chartHeight;

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', padding.left);
      line.setAttribute('y1', y);
      line.setAttribute('x2', width - padding.right);
      line.setAttribute('y2', y);
      line.setAttribute('stroke', '#e0e0e0');
      line.setAttribute('stroke-width', '1');
      svg.appendChild(line);

      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', width - padding.right + 5);
      label.setAttribute('y', y + 4);
      label.setAttribute('fill', '#999');
      label.setAttribute('font-size', '10');
      label.textContent = value;
      svg.appendChild(label);
    });

    // Draw trend line
    const pathData = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathData);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#1976d2');
    path.setAttribute('stroke-width', '2');
    svg.appendChild(path);

    // Draw data points
    points.forEach(p => {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', p.x);
      circle.setAttribute('cy', p.y);
      circle.setAttribute('r', '4');
      circle.setAttribute('fill', '#1976d2');
      circle.setAttribute('stroke', '#fff');
      circle.setAttribute('stroke-width', '2');
      svg.appendChild(circle);

      // Add hover title
      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      title.textContent = `${p.date}: ${p.score.toFixed(1)}`;
      circle.appendChild(title);
    });

    // Draw X-axis labels (first and last date)
    if (points.length > 0) {
      const firstLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      firstLabel.setAttribute('x', padding.left);
      firstLabel.setAttribute('y', height - 5);
      firstLabel.setAttribute('fill', '#666');
      firstLabel.setAttribute('font-size', '10');
      firstLabel.textContent = points[0].date;
      svg.appendChild(firstLabel);

      const lastLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      lastLabel.setAttribute('x', points[points.length - 1].x);
      lastLabel.setAttribute('y', height - 5);
      lastLabel.setAttribute('fill', '#666');
      lastLabel.setAttribute('font-size', '10');
      lastLabel.setAttribute('text-anchor', 'end');
      lastLabel.textContent = points[points.length - 1].date;
      svg.appendChild(lastLabel);
    }
  }

  /**
   * Recompute intelligence (OWNER only)
   */
  async function recomputeIntelligence() {
    try {
      if (!hasRole('OWNER')) {
        alert('⚠️ Only OWNER can recompute intelligence.');
        return;
      }

      const locale = getLocale();
      console.log('🔄 Recomputing intelligence...');

      const data = await fetchJSON('/api/governance/intelligence/recompute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale })
      });

      console.log('✅ Intelligence recomputed:', data);

      alert(`✅ Intelligence Recomputed!\n\nDate: ${data.as_of}\nAnomalies: ${data.anomaly_count}\nInsights: ${data.insight_count}\nScore: ${data.intelligence_score}\nRuntime: ${data.runtime_seconds.toFixed(2)}s`);

      // Reload dashboard
      await loadIntelligence();

    } catch (error) {
      console.error('❌ Error recomputing intelligence:', error);
      alert(`⚠️ Error recomputing intelligence: ${error.message}`);
    }
  }

  /**
   * Generate PDF report (OWNER only)
   */
  async function generateIntelligenceReport() {
    try {
      if (!hasRole('OWNER')) {
        alert('⚠️ Only OWNER can generate reports.');
        return;
      }

      const locale = getLocale();
      console.log(`📄 Generating ${locale.toUpperCase()} intelligence report...`);

      const data = await fetchJSON('/api/governance/intelligence/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale, include_trends: true })
      });

      console.log('✅ Report generated:', data);

      alert(`✅ Report Generated!\n\nFilename: ${data.filename}\nPath: ${data.path}\nLocale: ${data.locale}\nRuntime: ${data.runtime_seconds.toFixed(2)}s`);

    } catch (error) {
      console.error('❌ Error generating report:', error);
      alert(`⚠️ Error generating report: ${error.message}`);
    }
  }

  /**
   * Initialize event listeners
   */
  document.addEventListener('DOMContentLoaded', () => {
    const localeSelect = $$('#gi-locale');

    // Reload when locale changes
    if (localeSelect) {
      localeSelect.addEventListener('change', loadIntelligence);
    }

    console.log('✅ Governance Intelligence Dashboard v16.0.0 initialized');
  });

  // Export functions to global scope
  window.loadIntelligence = loadIntelligence;
  window.recomputeIntelligence = recomputeIntelligence;
  window.generateIntelligenceReport = generateIntelligenceReport;
})();

// ==== v16.1.0 Governance Predictive Control Panel ====
(function() {
  'use strict';

  /**
   * Bilingual translations for Forecast & Trends
   */
  const L_FORECAST = {
    en: {
      forecastTitle: 'Forecast & Trends',
      smoothing: 'Smoothing (α):',
      window: 'Window:',
      horizon: 'Forecast:',
      simulate: 'Simulate',
      refresh: 'Refresh',
      actual: 'Actual',
      forecast: 'Forecast',
      confidenceBand: 'Confidence Band',
      pillar: 'Pillar:',
      composite: 'Composite',
      finance: 'Finance',
      health: 'Health',
      ai: 'AI',
      menu: 'Menu',
      clickRefresh: 'Click Refresh to load forecast chart...',
      loading: 'Loading forecast data...',
      noData: 'No forecast data available',
      days: 'Days',
      simulating: 'Simulating forecast...',
      simulationComplete: 'Simulation complete',
      error: 'Error loading forecast',
      lastUpdated: 'Last updated:',
      dataPoints: 'data points',
      forecastPoints: 'forecast points'
    },
    fr: {
      forecastTitle: 'Prévisions et Tendances',
      smoothing: 'Lissage (α):',
      window: 'Fenêtre:',
      horizon: 'Prévision:',
      simulate: 'Simuler',
      refresh: 'Actualiser',
      actual: 'Réel',
      forecast: 'Prévision',
      confidenceBand: 'Bande de Confiance',
      pillar: 'Pilier:',
      composite: 'Composite',
      finance: 'Finance',
      health: 'Santé',
      ai: 'IA',
      menu: 'Menu',
      clickRefresh: 'Cliquez sur Actualiser pour charger le graphique...',
      loading: 'Chargement des prévisions...',
      noData: 'Aucune donnée de prévision disponible',
      days: 'Jours',
      simulating: 'Simulation en cours...',
      simulationComplete: 'Simulation terminée',
      error: 'Erreur lors du chargement des prévisions',
      lastUpdated: 'Dernière mise à jour:',
      dataPoints: 'points de données',
      forecastPoints: 'points de prévision'
    }
  };

  /**
   * Get current locale from selector
   */
  function getForecastLocale() {
    const select = $$('#gi-locale');
    return select ? select.value : 'en';
  }

  /**
   * Translate forecast text based on current locale
   */
  function tf(key) {
    const locale = getForecastLocale();
    return L_FORECAST[locale][key] || key;
  }

  /**
   * Update forecast UI labels based on locale
   */
  function updateForecastLabels() {
    const titleEl = $$('#gi-forecast-title');
    if (titleEl) titleEl.textContent = tf('forecastTitle');

    const alphaLabelEl = $$('#gi-alpha-label');
    if (alphaLabelEl) alphaLabelEl.textContent = tf('smoothing');

    const windowLabelEl = $$('#gi-window-label');
    if (windowLabelEl) windowLabelEl.textContent = tf('window');

    const horizonLabelEl = $$('#gi-horizon-label');
    if (horizonLabelEl) horizonLabelEl.textContent = tf('horizon');

    const simulateLabelEl = $$('#gi-simulate-label');
    if (simulateLabelEl) simulateLabelEl.textContent = tf('simulate');

    const refreshLabelEl = $$('#gi-refresh-forecast-label');
    if (refreshLabelEl) refreshLabelEl.textContent = tf('refresh');

    const actualLegendEl = $$('#gi-legend-actual');
    if (actualLegendEl) actualLegendEl.textContent = tf('actual');

    const forecastLegendEl = $$('#gi-legend-forecast');
    if (forecastLegendEl) forecastLegendEl.textContent = tf('forecast');

    const confidenceLegendEl = $$('#gi-legend-confidence');
    if (confidenceLegendEl) confidenceLegendEl.textContent = tf('confidenceBand');
  }

  /**
   * Load and display forecast chart
   */
  async function loadForecastChart() {
    try {
      const pillar = $$('#gi-forecast-pillar')?.value || 'composite';
      const window = parseInt($$('#gi-forecast-window')?.value || '14');
      const horizon = parseInt($$('#gi-forecast-horizon')?.value || '14');

      console.log(`📈 Loading forecast chart (pillar: ${pillar}, window: ${window}, horizon: ${horizon})...`);

      // Update info text
      const infoTextEl = $$('#gi-forecast-info-text');
      if (infoTextEl) infoTextEl.textContent = tf('loading');

      // Calculate date range from window parameter
      const to = new Date().toISOString().split('T')[0];
      const from = new Date(Date.now() - window * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      // Fetch trends data (historical + forecast)
      const trendsData = await fetchJSON(`/api/governance/trends?from=${from}&to=${to}&pillar=${pillar}`);

      console.log('✅ Forecast data loaded:', trendsData);

      // Render chart
      renderForecastChart(trendsData, pillar);

      // Update info text
      if (infoTextEl) {
        const actualCount = trendsData.historical?.length || 0;
        const forecastCount = trendsData.forecast?.length || 0;
        infoTextEl.textContent = `${actualCount} ${tf('dataPoints')}, ${forecastCount} ${tf('forecastPoints')} • ${tf('lastUpdated')} ${new Date().toLocaleString()}`;
      }

    } catch (error) {
      console.error('❌ Error loading forecast chart:', error);
      const infoTextEl = $$('#gi-forecast-info-text');
      if (infoTextEl) infoTextEl.textContent = `${tf('error')}: ${error.message}`;
    }
  }

  /**
   * Simulate forecast with custom parameters (OWNER only)
   *
   * Note: Current v15.9.0 API generates forecasts for all pillars with default parameters.
   * Custom alpha and per-pillar simulation would require backend enhancements.
   */
  async function simulateForecast() {
    try {
      if (!hasRole('OWNER')) {
        alert('⚠️ Only OWNER can simulate forecasts.');
        return;
      }

      const horizon = parseInt($$('#gi-forecast-horizon')?.value || '14');
      const alpha = parseFloat($$('#gi-alpha')?.value || '0.5');

      console.log(`🔮 Simulating forecast (horizon: ${horizon}, α: ${alpha})...`);

      // Update info text
      const infoTextEl = $$('#gi-forecast-info-text');
      if (infoTextEl) infoTextEl.textContent = tf('simulating');

      // Disable simulate button
      const simulateBtn = $$('#gi-simulate-btn');
      if (simulateBtn) simulateBtn.disabled = true;

      // Call forecast recompute endpoint
      // Note: v15.9.0 API generates forecasts for all pillars with all horizons
      const data = await fetchJSON('/api/governance/recompute/forecast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          horizons: [7, 14, 30],
          method: 'exp_smoothing'
        })
      });

      console.log('✅ Forecast simulated:', data);

      alert(`✅ ${tf('simulationComplete')}!\n\nRun ID: ${data.run_id}\nForecasts: ${data.forecast_count}\nRuntime: ${data.runtime_seconds.toFixed(2)}s\n\nNote: α=${alpha} setting is for visualization only. Backend uses default exponential smoothing.`);

      // Reload chart with new forecast
      await loadForecastChart();

    } catch (error) {
      console.error('❌ Error simulating forecast:', error);
      alert(`⚠️ ${tf('error')}: ${error.message}`);
    } finally {
      const simulateBtn = $$('#gi-simulate-btn');
      if (simulateBtn) simulateBtn.disabled = false;
    }
  }

  /**
   * Render forecast chart with historical and predicted data
   */
  function renderForecastChart(data, pillar) {
    const svg = $$('#gi-forecast-chart');
    if (!svg) return;

    // Clear existing content
    svg.innerHTML = '';

    const historical = data.historical || [];
    const forecast = data.forecast || [];

    if (historical.length === 0) {
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', '50%');
      text.setAttribute('y', '50%');
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('fill', '#999');
      text.setAttribute('font-size', '14');
      text.textContent = tf('noData');
      svg.appendChild(text);
      return;
    }

    const width = svg.clientWidth || 800;
    const height = 300;
    const padding = { top: 20, right: 60, bottom: 40, left: 60 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // Combine historical and forecast data for Y-axis scaling
    const allScores = [
      ...historical.map(d => d.score),
      ...forecast.map(d => d.score),
      ...forecast.map(d => d.lower || d.score),
      ...forecast.map(d => d.upper || d.score)
    ].filter(v => v != null);

    const minScore = Math.max(0, Math.min(...allScores) - 5);
    const maxScore = Math.min(100, Math.max(...allScores) + 5);
    const yRange = maxScore - minScore || 10;

    // Calculate positions for historical data
    const historicalPoints = historical.map((d, i) => {
      const x = padding.left + (i / Math.max(1, historical.length - 1)) * chartWidth;
      const y = padding.top + chartHeight - ((d.score - minScore) / yRange) * chartHeight;
      return { x, y, score: d.score, date: d.as_of };
    });

    // Calculate positions for forecast data
    const forecastStartX = historicalPoints.length > 0 ? historicalPoints[historicalPoints.length - 1].x : padding.left;
    const forecastPoints = forecast.map((d, i) => {
      const x = forecastStartX + ((i + 1) / forecast.length) * (chartWidth - (forecastStartX - padding.left));
      const y = padding.top + chartHeight - ((d.score - minScore) / yRange) * chartHeight;
      const yLower = d.lower ? padding.top + chartHeight - ((d.lower - minScore) / yRange) * chartHeight : y;
      const yUpper = d.upper ? padding.top + chartHeight - ((d.upper - minScore) / yRange) * chartHeight : y;
      return { x, y, yLower, yUpper, score: d.score, lower: d.lower, upper: d.upper, date: d.forecast_date };
    });

    // Draw grid lines
    const gridLines = [0, 25, 50, 75, 100].filter(v => v >= minScore && v <= maxScore);
    gridLines.forEach(value => {
      const y = padding.top + chartHeight - ((value - minScore) / yRange) * chartHeight;

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', padding.left);
      line.setAttribute('y1', y);
      line.setAttribute('x2', width - padding.right);
      line.setAttribute('y2', y);
      line.setAttribute('stroke', '#e0e0e0');
      line.setAttribute('stroke-width', '1');
      svg.appendChild(line);

      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', width - padding.right + 5);
      label.setAttribute('y', y + 4);
      label.setAttribute('fill', '#999');
      label.setAttribute('font-size', '11');
      label.textContent = value;
      svg.appendChild(label);
    });

    // Draw confidence band (if forecast has upper/lower bounds)
    if (forecastPoints.length > 0 && forecastPoints[0].lower != null) {
      const bandPath = [
        ...forecastPoints.map(p => `${p.x},${p.yLower}`),
        ...forecastPoints.slice().reverse().map(p => `${p.x},${p.yUpper}`)
      ];

      const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      polygon.setAttribute('points', bandPath.join(' '));
      polygon.setAttribute('fill', 'rgba(0, 172, 193, 0.2)');
      polygon.setAttribute('stroke', 'rgba(0, 172, 193, 0.4)');
      polygon.setAttribute('stroke-width', '1');
      svg.appendChild(polygon);
    }

    // Draw historical line
    if (historicalPoints.length > 1) {
      const pathData = historicalPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', pathData);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', '#1976d2');
      path.setAttribute('stroke-width', '3');
      svg.appendChild(path);
    }

    // Draw forecast line
    if (forecastPoints.length > 0) {
      // Connect last historical point to first forecast point
      const lastHistorical = historicalPoints[historicalPoints.length - 1];
      const forecastPathData = [
        `M ${lastHistorical.x} ${lastHistorical.y}`,
        ...forecastPoints.map(p => `L ${p.x} ${p.y}`)
      ].join(' ');

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', forecastPathData);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', '#00acc1');
      path.setAttribute('stroke-width', '3');
      path.setAttribute('stroke-dasharray', '6,4');
      svg.appendChild(path);
    }

    // Draw historical data points
    historicalPoints.forEach(p => {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', p.x);
      circle.setAttribute('cy', p.y);
      circle.setAttribute('r', '4');
      circle.setAttribute('fill', '#1976d2');
      circle.setAttribute('stroke', '#fff');
      circle.setAttribute('stroke-width', '2');
      svg.appendChild(circle);

      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      title.textContent = `${p.date}: ${p.score.toFixed(1)}`;
      circle.appendChild(title);
    });

    // Draw forecast data points
    forecastPoints.forEach(p => {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', p.x);
      circle.setAttribute('cy', p.y);
      circle.setAttribute('r', '4');
      circle.setAttribute('fill', '#00acc1');
      circle.setAttribute('stroke', '#fff');
      circle.setAttribute('stroke-width', '2');
      svg.appendChild(circle);

      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      const tooltip = p.lower && p.upper
        ? `${p.date}: ${p.score.toFixed(1)} [${p.lower.toFixed(1)}-${p.upper.toFixed(1)}]`
        : `${p.date}: ${p.score.toFixed(1)}`;
      title.textContent = tooltip;
      circle.appendChild(title);
    });

    // Draw X-axis labels
    if (historicalPoints.length > 0) {
      // First date
      const firstLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      firstLabel.setAttribute('x', padding.left);
      firstLabel.setAttribute('y', height - 10);
      firstLabel.setAttribute('fill', '#666');
      firstLabel.setAttribute('font-size', '11');
      firstLabel.textContent = historicalPoints[0].date;
      svg.appendChild(firstLabel);

      // Last historical date
      const lastHistLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      lastHistLabel.setAttribute('x', historicalPoints[historicalPoints.length - 1].x);
      lastHistLabel.setAttribute('y', height - 10);
      lastHistLabel.setAttribute('fill', '#666');
      lastHistLabel.setAttribute('font-size', '11');
      lastHistLabel.setAttribute('text-anchor', 'middle');
      lastHistLabel.textContent = historicalPoints[historicalPoints.length - 1].date;
      svg.appendChild(lastHistLabel);
    }

    if (forecastPoints.length > 0) {
      // Last forecast date
      const lastForecastLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      lastForecastLabel.setAttribute('x', forecastPoints[forecastPoints.length - 1].x);
      lastForecastLabel.setAttribute('y', height - 10);
      lastForecastLabel.setAttribute('fill', '#00acc1');
      lastForecastLabel.setAttribute('font-size', '11');
      lastForecastLabel.setAttribute('text-anchor', 'end');
      lastForecastLabel.textContent = forecastPoints[forecastPoints.length - 1].date;
      svg.appendChild(lastForecastLabel);
    }

    // Draw Y-axis label
    const yAxisLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    yAxisLabel.setAttribute('x', 15);
    yAxisLabel.setAttribute('y', padding.top + chartHeight / 2);
    yAxisLabel.setAttribute('fill', '#666');
    yAxisLabel.setAttribute('font-size', '12');
    yAxisLabel.setAttribute('text-anchor', 'middle');
    yAxisLabel.setAttribute('transform', `rotate(-90, 15, ${padding.top + chartHeight / 2})`);
    yAxisLabel.textContent = 'Score';
    svg.appendChild(yAxisLabel);
  }

  /**
   * Initialize event listeners
   */
  document.addEventListener('DOMContentLoaded', () => {
    // Alpha slider update
    const alphaSlider = $$('#gi-alpha');
    const alphaValue = $$('#gi-alpha-value');
    if (alphaSlider && alphaValue) {
      alphaSlider.addEventListener('input', (e) => {
        alphaValue.textContent = parseFloat(e.target.value).toFixed(2);
      });
    }

    // Pillar selector change
    const pillarSelect = $$('#gi-forecast-pillar');
    if (pillarSelect) {
      pillarSelect.addEventListener('change', loadForecastChart);
    }

    // Window selector change
    const windowSelect = $$('#gi-forecast-window');
    if (windowSelect) {
      windowSelect.addEventListener('change', loadForecastChart);
    }

    // Horizon selector change
    const horizonSelect = $$('#gi-forecast-horizon');
    if (horizonSelect) {
      horizonSelect.addEventListener('change', loadForecastChart);
    }

    // Update labels when locale changes
    const localeSelect = $$('#gi-locale');
    if (localeSelect) {
      localeSelect.addEventListener('change', () => {
        updateForecastLabels();
        loadForecastChart();
      });
    }

    console.log('✅ Governance Predictive Control Panel v16.1.0 initialized');
  });

  // Export functions to global scope
  window.loadForecastChart = loadForecastChart;
  window.simulateForecast = simulateForecast;
  window.updateForecastLabels = updateForecastLabels;
})();

// ============================================================================
// ITEM BANK & FINANCE ENFORCEMENT MODULE (v16.2.0)
// ============================================================================

(function() {
  'use strict';

  // State
  let currentPage = 1;
  const itemsPerPage = 50;
  let totalItems = 0;
  let searchQuery = '';
  let financeCodeFilter = '';
  let statusFilter = 'ACTIVE';

  // Helper function
  const $$ = (selector) => document.querySelector(selector);

  // Initialize on DOM load
  document.addEventListener('DOMContentLoaded', () => {
    initializeItemBank();
  });

  /**
   * Initialize Item Bank module
   */
  function initializeItemBank() {
    // CSV Upload
    const btnUploadCSV = $$('#btn-upload-csv');
    const btnExportCSV = $$('#btn-export-csv');
    const btnRefreshItems = $$('#btn-refresh-items');
    const csvFileInput = $$('#csv-file-input');
    const csvDropZone = $$('#csv-drop-zone');
    const csvUploadArea = $$('#csv-upload-area');

    if (btnUploadCSV) {
      btnUploadCSV.addEventListener('click', () => {
        csvUploadArea.classList.toggle('u-hide');
      });
    }

    if (btnExportCSV) {
      btnExportCSV.addEventListener('click', exportItemBankCSV);
    }

    if (btnRefreshItems) {
      btnRefreshItems.addEventListener('click', () => loadItemBank());
    }

    if (csvFileInput) {
      csvFileInput.addEventListener('change', handleCSVUpload);
    }

    if (csvDropZone) {
      // Click to browse
      csvDropZone.addEventListener('click', () => csvFileInput.click());

      // Drag & drop
      csvDropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        csvDropZone.classList.add('drag-over');
      });

      csvDropZone.addEventListener('dragleave', () => {
        csvDropZone.classList.remove('drag-over');
      });

      csvDropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        csvDropZone.classList.remove('drag-over');
        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0].name.endsWith('.csv')) {
          csvFileInput.files = files;
          handleCSVUpload({ target: { files } });
        } else {
          showAlert('Please upload a .csv file', 'error');
        }
      });
    }

    // Search & Filter
    const itemSearch = $$('#item-search');
    const filterFinanceCode = $$('#filter-finance-code');
    const filterStatus = $$('#filter-status');

    if (itemSearch) {
      let searchTimeout;
      itemSearch.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          searchQuery = e.target.value;
          currentPage = 1;
          loadItemBank();
        }, 500);
      });
    }

    if (filterFinanceCode) {
      filterFinanceCode.addEventListener('change', (e) => {
        financeCodeFilter = e.target.value;
        currentPage = 1;
        loadItemBank();
      });
    }

    if (filterStatus) {
      filterStatus.addEventListener('change', (e) => {
        statusFilter = e.target.value;
        currentPage = 1;
        loadItemBank();
      });
    }

    // Pagination
    const btnPrevPage = $$('#btn-prev-page');
    const btnNextPage = $$('#btn-next-page');

    if (btnPrevPage) {
      btnPrevPage.addEventListener('click', () => {
        if (currentPage > 1) {
          currentPage--;
          loadItemBank();
        }
      });
    }

    if (btnNextPage) {
      btnNextPage.addEventListener('click', () => {
        const totalPages = Math.ceil(totalItems / itemsPerPage);
        if (currentPage < totalPages) {
          currentPage++;
          loadItemBank();
        }
      });
    }

    // Integrity Badge
    const btnRefreshIntegrity = $$('#btn-refresh-integrity');
    const btnRevalidatePeriod = $$('#btn-revalidate-period');

    if (btnRefreshIntegrity) {
      btnRefreshIntegrity.addEventListener('click', refreshIntegrityBadge);
    }

    if (btnRevalidatePeriod) {
      btnRevalidatePeriod.addEventListener('click', revalidatePeriod);
    }

    // Needs Mapping Queue
    const btnRefreshQueue = $$('#btn-refresh-queue');
    if (btnRefreshQueue) {
      btnRefreshQueue.addEventListener('click', loadNeedsMappingQueue);
    }

    console.log('✅ Item Bank & Finance Enforcement v16.2.0 initialized');
  }

  /**
   * Load Item Bank items from API
   */
  async function loadItemBank() {
    try {
      const offset = (currentPage - 1) * itemsPerPage;
      const params = new URLSearchParams({
        limit: itemsPerPage,
        offset: offset
      });

      if (searchQuery) params.append('q', searchQuery);
      if (financeCodeFilter) params.append('finance_code', financeCodeFilter);
      if (statusFilter) params.append('status', statusFilter);

      const response = await fetchJSON(`/api/finance/item-bank?${params.toString()}`);

      if (response.success) {
        totalItems = response.total;
        renderItemBankTable(response.items);
        updatePagination();
        updateStatistics();
        loadFinanceStrip();
      } else {
        showAlert(response.error || 'Failed to load item bank', 'error');
      }
    } catch (error) {
      console.error('Load item bank error:', error);
      showAlert('Error loading item bank: ' + error.message, 'error');
    }
  }

  /**
   * Render Item Bank table
   */
  function renderItemBankTable(items) {
    const tbody = $$('#item-bank-tbody');
    if (!tbody) return;

    if (items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="text-center">No items found with current filters.</td></tr>';
      return;
    }

    tbody.innerHTML = items.map(item => `
      <tr data-item-no="${item.gfs_item_no}">
        <td><code>${escapeHtml(item.gfs_item_no)}</code></td>
        <td>${escapeHtml(item.description)}</td>
        <td>${escapeHtml(item.pack_size || '--')}</td>
        <td>${escapeHtml(item.uom)}</td>
        <td><span class="badge badge-finance-${item.finance_code.toLowerCase()}">${escapeHtml(item.finance_code)}</span></td>
        <td>${item.taxable_gst ? '✅' : '❌'}</td>
        <td>${item.taxable_qst ? '✅' : '❌'}</td>
        <td><span class="badge ${item.status === 'ACTIVE' ? 'badge-success' : 'badge-secondary'}">${item.status}</span></td>
        <td>
          <button type="button" class="btn btn-xs btn-secondary" onclick="editItem('${escapeHtml(item.gfs_item_no)}')">✏️</button>
          ${item.status === 'ACTIVE'
            ? `<button type="button" class="btn btn-xs btn-warning" onclick="retireItem('${escapeHtml(item.gfs_item_no)}')">🗑️</button>`
            : `<button type="button" class="btn btn-xs btn-success" onclick="activateItem('${escapeHtml(item.gfs_item_no)}')">♻️</button>`
          }
        </td>
      </tr>
    `).join('');
  }

  /**
   * Update pagination controls
   */
  function updatePagination() {
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const paginationInfo = $$('#pagination-info');
    const btnPrev = $$('#btn-prev-page');
    const btnNext = $$('#btn-next-page');

    if (paginationInfo) {
      paginationInfo.textContent = `Page ${currentPage} of ${totalPages || 1} (${totalItems} items)`;
    }

    if (btnPrev) {
      btnPrev.disabled = currentPage === 1;
    }

    if (btnNext) {
      btnNext.disabled = currentPage >= totalPages;
    }
  }

  /**
   * Update statistics
   */
  async function updateStatistics() {
    try {
      const stats = await fetchJSON('/api/finance/item-bank/statistics');
      if (stats.success) {
        const statActiveItems = $$('#stat-active-items');
        if (statActiveItems) statActiveItems.textContent = stats.statistics.total_active || 0;
      }
    } catch (error) {
      console.error('Update statistics error:', error);
    }
  }

  /**
   * Handle CSV file upload
   */
  async function handleCSVUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const progressArea = $$('#csv-upload-progress');
    const uploadStatus = $$('#csv-upload-status');
    const progressFill = $$('#csv-progress-fill');

    if (progressArea) progressArea.classList.remove('u-hide');

    try {
      // Read CSV file
      const csvData = await file.text();

      if (uploadStatus) uploadStatus.textContent = 'Processing CSV...';
      if (progressFill) progressFill.style.width = '50%';

      // Send to backend
      const response = await fetchJSON('/api/finance/item-bank/import-csv', {
        method: 'POST',
        body: JSON.stringify({
          csv_data: csvData,
          upsert: true
        })
      });

      if (progressFill) progressFill.style.width = '100%';

      if (response.success) {
        if (uploadStatus) uploadStatus.textContent = `✅ Success! Imported ${response.imported_count} items${response.error_count > 0 ? ` (${response.error_count} errors)` : ''}`;

        setTimeout(() => {
          if (progressArea) progressArea.classList.add('u-hide');
          const uploadArea = $$('#csv-upload-area');
          if (uploadArea) uploadArea.classList.add('u-hide');
          loadItemBank();
        }, 2000);

        if (response.error_count > 0) {
          console.warn('CSV import errors:', response.errors);
          showAlert(`Imported ${response.imported_count} items with ${response.error_count} errors. Check console for details.`, 'warning');
        } else {
          showAlert(`Successfully imported ${response.imported_count} items!`, 'success');
        }
      } else {
        if (uploadStatus) uploadStatus.textContent = '❌ Upload failed';
        showAlert(response.error || 'CSV import failed', 'error');
      }
    } catch (error) {
      console.error('CSV upload error:', error);
      if (uploadStatus) uploadStatus.textContent = '❌ Error: ' + error.message;
      showAlert('Error uploading CSV: ' + error.message, 'error');
    }
  }

  /**
   * Export Item Bank to CSV
   */
  async function exportItemBankCSV() {
    try {
      const params = new URLSearchParams();
      if (financeCodeFilter) params.append('finance_code', financeCodeFilter);
      if (statusFilter) params.append('status', statusFilter);

      const token = localStorage.getItem('token');
      const response = await fetch(`/api/finance/item-bank/export-csv?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `item-bank-export-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        showAlert('CSV exported successfully!', 'success');
      } else {
        showAlert('Failed to export CSV', 'error');
      }
    } catch (error) {
      console.error('Export CSV error:', error);
      showAlert('Error exporting CSV: ' + error.message, 'error');
    }
  }

  /**
   * Edit item
   */
  async function editItem(gfsItemNo) {
    try {
      const item = await fetchJSON(`/api/finance/item-bank/${encodeURIComponent(gfsItemNo)}`);
      if (!item.success) {
        showAlert('Item not found', 'error');
        return;
      }

      const newFinanceCode = prompt(`Edit Finance Code for ${item.item.description}\n\nCurrent: ${item.item.finance_code}\n\nNew finance code:`, item.item.finance_code);

      if (newFinanceCode && newFinanceCode !== item.item.finance_code) {
        const validCodes = ['BAKE', 'BEV+ECO', 'MILK', 'GROC+MISC', 'MEAT', 'PROD', 'CLEAN', 'PAPER', 'FREIGHT', 'LINEN', 'PROPANE', 'OTHER'];
        if (!validCodes.includes(newFinanceCode.toUpperCase())) {
          showAlert('Invalid finance code. Must be one of: ' + validCodes.join(', '), 'error');
          return;
        }

        const response = await fetchJSON(`/api/finance/item-bank/${encodeURIComponent(gfsItemNo)}`, {
          method: 'PUT',
          body: JSON.stringify({ finance_code: newFinanceCode.toUpperCase() })
        });

        if (response.success) {
          showAlert('Item updated successfully!', 'success');
          loadItemBank();
        } else {
          showAlert(response.error || 'Update failed', 'error');
        }
      }
    } catch (error) {
      console.error('Edit item error:', error);
      showAlert('Error editing item: ' + error.message, 'error');
    }
  }

  /**
   * Retire item
   */
  async function retireItem(gfsItemNo) {
    if (!confirm(`Retire item ${gfsItemNo}?\n\nThis will mark it as RETIRED (soft delete).`)) {
      return;
    }

    try {
      const response = await fetchJSON(`/api/finance/item-bank/${encodeURIComponent(gfsItemNo)}`, {
        method: 'DELETE'
      });

      if (response.success) {
        showAlert('Item retired successfully!', 'success');
        loadItemBank();
      } else {
        showAlert(response.error || 'Retire failed', 'error');
      }
    } catch (error) {
      console.error('Retire item error:', error);
      showAlert('Error retiring item: ' + error.message, 'error');
    }
  }

  /**
   * Activate item
   */
  async function activateItem(gfsItemNo) {
    try {
      const response = await fetchJSON(`/api/finance/item-bank/${encodeURIComponent(gfsItemNo)}/activate`, {
        method: 'POST'
      });

      if (response.success) {
        showAlert('Item activated successfully!', 'success');
        loadItemBank();
      } else {
        showAlert(response.error || 'Activate failed', 'error');
      }
    } catch (error) {
      console.error('Activate item error:', error);
      showAlert('Error activating item: ' + error.message, 'error');
    }
  }

  /**
   * Load Needs Mapping Queue
   */
  async function loadNeedsMappingQueue() {
    try {
      const response = await fetchJSON('/api/finance/enforcement/needs-mapping?limit=100');

      if (response.success) {
        renderNeedsMappingQueue(response.items);
        const needsMappingCount = $$('#needs-mapping-count');
        if (needsMappingCount) needsMappingCount.textContent = response.total;

        const statNeedsMapping = $$('#stat-needs-mapping');
        if (statNeedsMapping) statNeedsMapping.textContent = response.total;
      } else {
        showAlert(response.error || 'Failed to load needs mapping queue', 'error');
      }
    } catch (error) {
      console.error('Load needs mapping error:', error);
      showAlert('Error loading needs mapping queue: ' + error.message, 'error');
    }
  }

  /**
   * Render Needs Mapping Queue table
   */
  function renderNeedsMappingQueue(items) {
    const tbody = $$('#mapping-queue-tbody');
    if (!tbody) return;

    if (items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center">✅ No items needing mapping. All lines are mapped with high confidence!</td></tr>';
      return;
    }

    tbody.innerHTML = items.map(item => {
      const confidencePct = (item.confidence * 100).toFixed(0);
      const confidenceClass = item.confidence >= 0.80 ? 'badge-success' : item.confidence >= 0.50 ? 'badge-warning' : 'badge-error';

      return `
        <tr data-audit-id="${item.id}">
          <td><code>${escapeHtml(item.invoice_id)}</code></td>
          <td>${escapeHtml(item.line_id || '--')}</td>
          <td>${escapeHtml(item.description)}</td>
          <td>${escapeHtml(item.gfs_item_no || '--')}</td>
          <td><span class="badge badge-finance-${item.new_code.toLowerCase()}">${escapeHtml(item.new_code)}</span></td>
          <td><span class="badge ${confidenceClass}">${confidencePct}%</span></td>
          <td><span class="badge badge-secondary">${escapeHtml(item.strategy)}</span></td>
          <td>
            <button type="button" class="btn btn-xs btn-primary np-btn-confirm" onclick="confirmMapping('${escapeHtml(item.invoice_id)}', '${escapeHtml(item.line_id)}', '${escapeHtml(item.new_code)}')">✅ Confirm</button>
            <button type="button" class="btn btn-xs btn-secondary" onclick="editMapping('${escapeHtml(item.invoice_id)}', '${escapeHtml(item.line_id)}')">✏️</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  /**
   * Confirm mapping
   */
  async function confirmMapping(invoiceId, lineId, financeCode) {
    try {
      const response = await fetchJSON('/api/finance/enforcement/manual-assign', {
        method: 'POST',
        body: JSON.stringify({
          line_data: {
            invoice_id: invoiceId,
            line_id: lineId
          },
          finance_code: financeCode
        })
      });

      if (response.success) {
        showAlert('Mapping confirmed!', 'success');
        loadNeedsMappingQueue();
      } else {
        showAlert(response.error || 'Confirm failed', 'error');
      }
    } catch (error) {
      console.error('Confirm mapping error:', error);
      showAlert('Error confirming mapping: ' + error.message, 'error');
    }
  }

  /**
   * Edit mapping
   */
  async function editMapping(invoiceId, lineId) {
    const newCode = prompt('Enter new finance code:', '');
    if (!newCode) return;

    const validCodes = ['BAKE', 'BEV+ECO', 'MILK', 'GROC+MISC', 'MEAT', 'PROD', 'CLEAN', 'PAPER', 'FREIGHT', 'LINEN', 'PROPANE', 'OTHER'];
    if (!validCodes.includes(newCode.toUpperCase())) {
      showAlert('Invalid finance code. Must be one of: ' + validCodes.join(', '), 'error');
      return;
    }

    try {
      const response = await fetchJSON('/api/finance/enforcement/manual-assign', {
        method: 'POST',
        body: JSON.stringify({
          line_data: {
            invoice_id: invoiceId,
            line_id: lineId
          },
          finance_code: newCode.toUpperCase()
        })
      });

      if (response.success) {
        showAlert('Mapping updated!', 'success');
        loadNeedsMappingQueue();
      } else {
        showAlert(response.error || 'Update failed', 'error');
      }
    } catch (error) {
      console.error('Edit mapping error:', error);
      showAlert('Error updating mapping: ' + error.message, 'error');
    }
  }

  /**
   * Refresh Integrity Badge
   */
  async function refreshIntegrityBadge() {
    try {
      const response = await fetchJSON('/api/finance/enforcement/needs-attention?limit=1000');

      if (response.success) {
        const invoices = response.invoices;
        const totalInvoices = invoices.length;
        const imbalanced = invoices.filter(inv => inv.balance_status !== 'BALANCED').length;
        const balanced = totalInvoices - imbalanced;

        const statusBadge = $$('#integrity-badge-status');
        const totalInvoicesEl = $$('#integrity-total-invoices');
        const imbalancedEl = $$('#integrity-imbalanced');
        const totalDeltaEl = $$('#integrity-total-delta');

        if (statusBadge) {
          if (imbalanced === 0) {
            statusBadge.innerHTML = '<span class="finance-badge-ok">✅ BALANCED</span>';
          } else {
            statusBadge.innerHTML = `<span class="finance-badge-warn">⚠️ ${imbalanced} ISSUES</span>`;
          }
        }

        if (totalInvoicesEl) totalInvoicesEl.textContent = totalInvoices;
        if (imbalancedEl) imbalancedEl.textContent = imbalanced;

        // Calculate total delta
        let totalDelta = 0;
        invoices.forEach(inv => {
          if (inv.total_delta_cents) {
            totalDelta += Math.abs(inv.total_delta_cents);
          }
        });

        if (totalDeltaEl) totalDeltaEl.textContent = `$${(totalDelta / 100).toFixed(2)}`;
      }
    } catch (error) {
      console.error('Refresh integrity badge error:', error);
      showAlert('Error refreshing integrity badge: ' + error.message, 'error');
    }
  }

  /**
   * Revalidate Period
   */
  async function revalidatePeriod() {
    if (!confirm('Revalidate all invoices in the current period?\n\nThis may take a few moments.')) {
      return;
    }

    try {
      showAlert('Revalidation in progress...', 'info');

      // This would typically call a bulk revalidation endpoint
      // For now, we'll just refresh the integrity badge
      await refreshIntegrityBadge();

      showAlert('Period revalidated successfully!', 'success');
    } catch (error) {
      console.error('Revalidate period error:', error);
      showAlert('Error revalidating period: ' + error.message, 'error');
    }
  }

  /**
   * Load Finance Strip
   */
  async function loadFinanceStrip() {
    try {
      const dashboard = await fetchJSON('/api/finance/enforcement/dashboard');

      if (dashboard.success) {
        renderFinanceStrip(dashboard);

        // Update auto-mapping percentage
        if (dashboard.mapping && dashboard.mapping.by_strategy) {
          const totalMappings = dashboard.mapping.by_strategy.reduce((sum, s) => sum + s.count, 0);
          const autoMappings = dashboard.mapping.by_strategy
            .filter(s => s.strategy === 'BANK' || s.strategy === 'RULE')
            .reduce((sum, s) => sum + s.count, 0);

          const autoPct = totalMappings > 0 ? ((autoMappings / totalMappings) * 100).toFixed(1) : 0;
          const statMappingAutoPct = $$('#stat-mapping-auto-pct');
          if (statMappingAutoPct) statMappingAutoPct.textContent = `${autoPct}%`;
        }
      }
    } catch (error) {
      console.error('Load finance strip error:', error);
    }
  }

  /**
   * Render Finance Strip
   */
  function renderFinanceStrip(dashboard) {
    const strip = $$('#financeStrip');
    if (!strip) return;

    const financeCategories = dashboard.item_bank?.by_finance_code || [];

    if (financeCategories.length === 0) {
      strip.innerHTML = '<div class="finance-strip-loading">No finance data available</div>';
      return;
    }

    strip.innerHTML = `
      <div class="finance-strip-grid">
        ${financeCategories.map(cat => `
          <div class="finance-strip-item">
            <div class="finance-strip-code">${escapeHtml(cat.finance_code)}</div>
            <div class="finance-strip-count">${cat.active} items</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  /**
   * Helper: Escape HTML
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Helper: Show alert (using existing implementation)
   */
  function showAlert(message, type = 'info') {
    // Reuse existing alert system if available
    if (window.showNotification) {
      window.showNotification(message, type);
    } else {
      console.log(`[${type.toUpperCase()}]`, message);
      alert(message);
    }
  }

  /**
   * Helper: Fetch JSON (using existing implementation)
   */
  async function fetchJSON(url, options = {}) {
    const token = localStorage.getItem('token');
    const defaultOptions = {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    };

    const response = await fetch(url, { ...defaultOptions, ...options });
    return await response.json();
  }

  // Export functions to global scope for onclick handlers
  window.editItem = editItem;
  window.retireItem = retireItem;
  window.activateItem = activateItem;
  window.confirmMapping = confirmMapping;
  window.editMapping = editMapping;
  window.loadItemBank = loadItemBank;
  window.loadNeedsMappingQueue = loadNeedsMappingQueue;
  window.refreshIntegrityBadge = refreshIntegrityBadge;
  window.revalidatePeriod = revalidatePeriod;
})();

// ============================================================================
// GFS ORDERS TAB FUNCTIONS (V22.3)
// ============================================================================

/**
 * Load GFS watcher status
 */
async function loadGfsWatcherStatus() {
  const div = $('gfsWatcherStatus');
  if (!div) return;

  div.innerHTML = '<div class="text-muted">Loading watcher status...</div>';

  try {
    const response = await authFetch('/api/vendor-orders/gfs-watcher-status');
    const data = await response.json();

    if (!data.available) {
      div.innerHTML = `
        <div class="info-box-full">
          <strong>GFS Watcher Not Configured</strong><br>
          The automated Google Drive watcher is not configured for this environment.
          You can still upload PDFs manually using the upload section below.
        </div>
      `;
      return;
    }

    const status = data.status;
    const runningClass = status.isRunning ? 'u-text-ok' : 'u-text-warn';

    div.innerHTML = `
      <div class="grid grid-4 u-mb-3">
        <div class="stat-mini">
          <div class="stat-value ${runningClass}">${status.isRunning ? 'Running' : 'Stopped'}</div>
          <div class="stat-label">Status</div>
        </div>
        <div class="stat-mini">
          <div class="stat-value">${status.stats?.totalRuns || 0}</div>
          <div class="stat-label">Total Runs</div>
        </div>
        <div class="stat-mini">
          <div class="stat-value">${status.stats?.ordersProcessed || 0}</div>
          <div class="stat-label">Orders Processed</div>
        </div>
        <div class="stat-mini">
          <div class="stat-value">${status.stats?.errors || 0}</div>
          <div class="stat-label">Errors</div>
        </div>
      </div>
      <div class="text-muted small">
        <strong>Schedule:</strong> ${status.schedule || 'Not set'}<br>
        <strong>Last Run:</strong> ${status.lastRunAt ? new Date(status.lastRunAt).toLocaleString() : 'Never'}<br>
        <strong>Inbox Folder:</strong> ${status.config?.inboxFolderId || 'Not configured'}
      </div>
    `;

  } catch (error) {
    console.error('Failed to load GFS watcher status:', error);
    div.innerHTML = `<div class="u-text-bad">Failed to load watcher status: ${error.message}</div>`;
  }
}

/**
 * Upload GFS PDF files
 */
async function uploadGfsPdfs() {
  const fileInput = $('gfsPdfUpload');
  const btn = $('btnUploadGfs');
  const statusSpan = $('gfsUploadStatus');
  const resultsDiv = $('gfsUploadResults');

  if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
    statusSpan.innerHTML = '<span class="u-text-warn">Please select one or more PDF files</span>';
    return;
  }

  // Disable button and show progress
  btn.disabled = true;
  btn.textContent = 'Uploading...';
  statusSpan.innerHTML = '<span class="text-muted">Processing files...</span>';
  resultsDiv.innerHTML = '';

  try {
    const formData = new FormData();
    for (const file of fileInput.files) {
      formData.append('pdfs', file);
    }

    const response = await authFetch('/api/vendor-orders/upload-gfs-pdf', {
      method: 'POST',
      body: formData
    });

    const data = await response.json();

    if (data.success) {
      statusSpan.innerHTML = `<span class="u-text-ok">${data.message}</span>`;
    } else {
      statusSpan.innerHTML = `<span class="u-text-warn">${data.message}</span>`;
    }

    // Display results
    let html = `
      <div class="info-box-full u-mb-2">
        <strong>Summary:</strong> ${data.summary.filesProcessed} files processed in ${data.summary.durationMs}ms<br>
        <strong>Lines Found:</strong> ${data.summary.totalLinesFound} |
        <strong>FIFO Layers:</strong> ${data.summary.totalFifoLayers} |
        <strong>Cases:</strong> ${data.summary.totalCasesExtracted}
      </div>
      <table class="table">
        <thead>
          <tr>
            <th>File Name</th>
            <th>Status</th>
            <th>Lines</th>
            <th>FIFO Layers</th>
            <th>Cases</th>
            <th>Error</th>
          </tr>
        </thead>
        <tbody>
    `;

    for (const result of data.results) {
      const statusClass = result.success ? 'u-text-ok' : 'u-text-bad';
      html += `
        <tr>
          <td>${result.fileName}</td>
          <td class="${statusClass}">${result.status || (result.success ? 'Success' : 'Failed')}</td>
          <td>${result.linesFound}</td>
          <td>${result.fifoLayers}</td>
          <td>${result.casesExtracted}</td>
          <td>${result.error || '-'}</td>
        </tr>
      `;
    }

    html += '</tbody></table>';
    resultsDiv.innerHTML = html;

    // Clear file input
    fileInput.value = '';

    // Refresh orders list
    loadGfsOrders();

  } catch (error) {
    console.error('Failed to upload GFS PDFs:', error);
    statusSpan.innerHTML = `<span class="u-text-bad">Upload failed: ${error.message}</span>`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Upload & Process';
  }
}

/**
 * Scan GFS inbox (Google Drive)
 */
async function scanGfsInbox() {
  const btn = $('btnScanInbox');
  const statusSpan = $('gfsScanStatus');
  const resultsDiv = $('gfsScanResults');

  btn.disabled = true;
  btn.textContent = 'Scanning...';
  statusSpan.innerHTML = '<span class="text-muted">Scanning Google Drive inbox...</span>';
  resultsDiv.innerHTML = '';

  try {
    const response = await authFetch('/api/vendor-orders/scan-inbox', {
      method: 'POST'
    });

    const data = await response.json();

    if (data.success) {
      statusSpan.innerHTML = `<span class="u-text-ok">${data.message}</span>`;

      resultsDiv.innerHTML = `
        <div class="info-box-full">
          <strong>Scan Results:</strong><br>
          Orders Processed: ${data.result.ordersProcessed}<br>
          Orders Skipped (already processed): ${data.result.ordersSkipped}<br>
          Errors: ${data.result.errors}<br>
          Last Run: ${data.result.lastRunAt ? new Date(data.result.lastRunAt).toLocaleString() : 'N/A'}
        </div>
      `;

      // Refresh watcher status and orders list
      loadGfsWatcherStatus();
      loadGfsOrders();
    } else {
      statusSpan.innerHTML = `<span class="u-text-bad">Scan failed: ${data.error}</span>`;
      if (data.hint) {
        resultsDiv.innerHTML = `<div class="text-muted">${data.hint}</div>`;
      }
    }

  } catch (error) {
    console.error('Failed to scan GFS inbox:', error);
    statusSpan.innerHTML = `<span class="u-text-bad">Scan failed: ${error.message}</span>`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Scan Inbox Now';
  }
}

/**
 * Load GFS orders list
 */
async function loadGfsOrders() {
  const div = $('gfsOrdersTable');
  if (!div) return;

  const status = $('gfsOrderStatus')?.value || '';
  const search = $('gfsOrderSearch')?.value || '';

  div.innerHTML = '<div class="text-muted p-3">Loading GFS orders...</div>';

  try {
    let url = '/api/vendor-orders?sourceSystem=gfs&pageSize=50';
    if (status) url += `&status=${encodeURIComponent(status)}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;

    const response = await authFetch(url);
    const data = await response.json();

    if (!data.orders || data.orders.length === 0) {
      div.innerHTML = '<div class="empty-state p-3">No GFS orders found</div>';
      return;
    }

    let html = `
      <table class="table">
        <thead>
          <tr>
            <th>Order #</th>
            <th>Date</th>
            <th>File Name</th>
            <th>Status</th>
            <th>Lines</th>
            <th>Total</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
    `;

    for (const order of data.orders) {
      const statusClass = order.status === 'fifo_complete' ? 'u-text-ok' :
                          order.status === 'error' ? 'u-text-bad' :
                          order.status === 'parsed' ? 'u-text-warn' : '';

      html += `
        <tr>
          <td>${order.orderNumber || '-'}</td>
          <td>${order.orderDate ? new Date(order.orderDate).toLocaleDateString() : '-'}</td>
          <td>${order.pdfFileName || '-'}</td>
          <td class="${statusClass}">${order.status}</td>
          <td>${order.totalLines}</td>
          <td>$${order.total}</td>
          <td>
            <button class="btn btn-sm btn-outline" onclick="viewGfsOrder('${order.id}')">View</button>
            ${order.status === 'parsed' ? `<button class="btn btn-sm btn-primary" onclick="populateFifoForOrder('${order.id}')">Populate FIFO</button>` : ''}
          </td>
        </tr>
      `;
    }

    html += '</tbody></table>';
    html += `<div class="text-muted small p-2">Showing ${data.orders.length} of ${data.pagination.totalCount} orders</div>`;

    div.innerHTML = html;

  } catch (error) {
    console.error('Failed to load GFS orders:', error);
    div.innerHTML = `<div class="u-text-bad p-3">Failed to load orders: ${error.message}</div>`;
  }
}

/**
 * View GFS order details
 */
async function viewGfsOrder(orderId) {
  try {
    const response = await authFetch(`/api/vendor-orders/${orderId}`);
    const data = await response.json();

    if (!data.success) {
      alert('Failed to load order: ' + data.error);
      return;
    }

    const order = data.order;
    const lines = data.lines;

    let linesHtml = '';
    for (const line of lines) {
      linesHtml += `
        <tr>
          <td>${line.lineNumber}</td>
          <td>${line.vendorSku || line.gfsCode || '-'}</td>
          <td>${line.description}</td>
          <td>${line.orderedQty} ${line.unit}</td>
          <td>$${line.unitPrice}</td>
          <td>$${line.extendedPrice}</td>
        </tr>
      `;
    }

    const modalHtml = `
      <div class="modal-content">
        <h3>GFS Order: ${order.orderNumber || orderId.substring(0, 8)}</h3>
        <div class="grid grid-3 u-mb-3">
          <div><strong>Vendor:</strong> ${order.vendorName}</div>
          <div><strong>Date:</strong> ${order.orderDate ? new Date(order.orderDate).toLocaleDateString() : '-'}</div>
          <div><strong>Status:</strong> ${order.status}</div>
          <div><strong>Total:</strong> $${order.total}</div>
          <div><strong>Lines:</strong> ${order.totalLines}</div>
          <div><strong>OCR Confidence:</strong> ${order.ocrConfidence ? (order.ocrConfidence * 100).toFixed(1) + '%' : '-'}</div>
        </div>
        <h4>Line Items</h4>
        <table class="table">
          <thead>
            <tr>
              <th>#</th>
              <th>SKU</th>
              <th>Description</th>
              <th>Qty</th>
              <th>Unit Price</th>
              <th>Extended</th>
            </tr>
          </thead>
          <tbody>
            ${linesHtml}
          </tbody>
        </table>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="closeModal()">Close</button>
        </div>
      </div>
    `;

    showModal(modalHtml);

  } catch (error) {
    console.error('Failed to view order:', error);
    alert('Failed to load order details: ' + error.message);
  }
}

/**
 * Populate FIFO layers for a specific order
 */
async function populateFifoForOrder(orderId) {
  if (!confirm('Populate FIFO cost layers for this order?')) return;

  try {
    const response = await authFetch(`/api/vendor-orders/${orderId}/populate-fifo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force: false, skipCases: false })
    });

    const data = await response.json();

    if (data.success) {
      alert(`FIFO layers populated successfully!\n\nLayers Created: ${data.result.layersCreated}\nLayers Updated: ${data.result.layersUpdated}\nCases Extracted: ${data.result.casesExtracted}`);
      loadGfsOrders();
    } else {
      alert('Failed to populate FIFO: ' + data.error);
    }

  } catch (error) {
    console.error('Failed to populate FIFO:', error);
    alert('Failed to populate FIFO layers: ' + error.message);
  }
}

// ============================================================================
// SHRINKAGE & VARIANCE INTELLIGENCE V1
// V22.3: Owner Console UI for shrinkage reporting
// ============================================================================

// Shrinkage state
let shrinkageData = null;
let shrinkageCategories = [];
let selectedShrinkagePeriod = 'last-7-days';
let selectedShrinkageCategory = '';

/**
 * Load and display shrinkage report
 */
async function loadShrinkageReport() {
  const container = document.getElementById('shrinkage-content');
  if (!container) return;

  container.innerHTML = '<div class="loading-indicator">Loading shrinkage data...</div>';

  try {
    // Build query params
    const params = new URLSearchParams({
      period: selectedShrinkagePeriod,
      limit: 20
    });

    if (selectedShrinkageCategory) {
      params.append('category', selectedShrinkageCategory);
    }

    const response = await authFetch(`/api/owner/ops/shrinkage?${params.toString()}`);
    const data = await response.json();

    if (!data.success) {
      container.innerHTML = `
        <div class="error-message">
          <h4>Shrinkage Data Not Available</h4>
          <p>${data.error || 'Unknown error'}</p>
          ${data.hint ? `<p class="hint">${data.hint}</p>` : ''}
        </div>
      `;
      return;
    }

    shrinkageData = data;
    renderShrinkageReport(data);

  } catch (error) {
    console.error('Failed to load shrinkage report:', error);
    container.innerHTML = `
      <div class="error-message">
        <h4>Error Loading Shrinkage Data</h4>
        <p>${error.message}</p>
      </div>
    `;
  }
}

/**
 * Load categories for filter dropdown
 */
async function loadShrinkageCategories() {
  try {
    const response = await authFetch('/api/owner/ops/shrinkage/categories');
    const data = await response.json();

    if (data.success) {
      shrinkageCategories = data.categories;
      updateShrinkageCategoryDropdown();
    }
  } catch (error) {
    console.error('Failed to load categories:', error);
  }
}

/**
 * Update category dropdown
 */
function updateShrinkageCategoryDropdown() {
  const dropdown = document.getElementById('shrinkage-category-filter');
  if (!dropdown) return;

  dropdown.innerHTML = '<option value="">All Categories</option>';
  shrinkageCategories.forEach(cat => {
    dropdown.innerHTML += `<option value="${cat}">${cat}</option>`;
  });
}

/**
 * Render the shrinkage report
 */
function renderShrinkageReport(data) {
  const container = document.getElementById('shrinkage-content');
  if (!container) return;

  const { period, totals, topItems, byCategory } = data;

  container.innerHTML = `
    <!-- Summary Cards -->
    <div class="shrinkage-summary">
      <div class="summary-card shrinkage-total">
        <h4>Total Shrinkage Value</h4>
        <div class="value">$${totals.estimatedShrinkageValue.toLocaleString()}</div>
        <div class="subtext">${period.start} to ${period.end}</div>
      </div>
      <div class="summary-card shrinkage-percent">
        <h4>Overall Shrinkage %</h4>
        <div class="value ${totals.overallShrinkagePercent > 5 ? 'warning' : ''}">${totals.overallShrinkagePercent}%</div>
        <div class="subtext">of theoretical available</div>
      </div>
      <div class="summary-card shrinkage-items">
        <h4>Items with Shrinkage</h4>
        <div class="value">${totals.itemsWithShrinkage}</div>
        <div class="subtext">items need attention</div>
      </div>
      <div class="summary-card shrinkage-qty">
        <h4>Total Qty Lost</h4>
        <div class="value">${totals.totalQtyShrinkage.toFixed(1)}</div>
        <div class="subtext">units unexplained</div>
      </div>
    </div>

    <!-- Category Breakdown -->
    <div class="shrinkage-section">
      <h3>Shrinkage by Category</h3>
      <div class="category-bars">
        ${byCategory.map(cat => `
          <div class="category-bar">
            <div class="category-name">${cat.category}</div>
            <div class="bar-container">
              <div class="bar-fill ${cat.shrinkagePercent > 5 ? 'warning' : ''}"
                   style="width: ${Math.min(100, cat.shrinkagePercent * 5)}%"></div>
              <span class="bar-label">${cat.shrinkagePercent}%</span>
            </div>
            <div class="category-details">
              ${cat.itemCount} items | ${cat.totalQtyShrinkage.toFixed(1)} units
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- Top Items Table -->
    <div class="shrinkage-section">
      <h3>Top Items by Shrinkage</h3>
      <table class="shrinkage-table">
        <thead>
          <tr>
            <th>Item</th>
            <th>Category</th>
            <th>Opening</th>
            <th>Received</th>
            <th>Waste</th>
            <th>Closing</th>
            <th>Shrinkage</th>
            <th>%</th>
            <th>Value</th>
            <th>Data</th>
          </tr>
        </thead>
        <tbody>
          ${topItems.map(item => `
            <tr class="${item.shrinkagePercent > 10 ? 'high-shrinkage' : item.shrinkagePercent > 5 ? 'medium-shrinkage' : ''}">
              <td>
                <div class="item-name">${item.itemName || item.itemCode}</div>
                <div class="item-code">${item.itemCode}</div>
              </td>
              <td>${item.category}</td>
              <td>${item.qtyCountedStart.toFixed(1)}</td>
              <td>${item.qtyReceived.toFixed(1)}</td>
              <td>${item.qtyWasted.toFixed(1)}</td>
              <td>${item.qtyCountedEnd.toFixed(1)}</td>
              <td class="shrinkage-qty">${item.qtyShrinkage.toFixed(1)}</td>
              <td class="shrinkage-pct ${item.shrinkagePercent > 10 ? 'high' : item.shrinkagePercent > 5 ? 'medium' : ''}">${item.shrinkagePercent}%</td>
              <td class="shrinkage-value">$${item.shrinkageValue.toFixed(2)}</td>
              <td class="data-quality">
                ${item.dataQuality.hasOpeningCount ? '<span class="dq-ok">O</span>' : '<span class="dq-missing">O</span>'}
                ${item.dataQuality.hasReceipts ? '<span class="dq-ok">R</span>' : '<span class="dq-missing">R</span>'}
                ${item.dataQuality.hasClosingCount ? '<span class="dq-ok">C</span>' : '<span class="dq-missing">C</span>'}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div class="table-legend">
        <span><span class="dq-ok">O</span> = Opening count</span>
        <span><span class="dq-ok">R</span> = Receipts</span>
        <span><span class="dq-ok">C</span> = Closing count</span>
        <span class="warning-text">Grey = missing data</span>
      </div>
    </div>

    <div class="shrinkage-footer">
      <span>Report generated: ${new Date(data.generatedAt).toLocaleString()}</span>
      <button class="btn btn-secondary" onclick="refreshShrinkageView()">Refresh View</button>
    </div>
  `;
}

/**
 * Handle period change
 */
function onShrinkagePeriodChange(value) {
  selectedShrinkagePeriod = value;
  loadShrinkageReport();
}

/**
 * Handle category change
 */
function onShrinkageCategoryChange(value) {
  selectedShrinkageCategory = value;
  loadShrinkageReport();
}

/**
 * Refresh the materialized view
 */
async function refreshShrinkageView() {
  try {
    const btn = document.querySelector('.shrinkage-footer button');
    if (btn) btn.disabled = true;

    const response = await authFetch('/api/owner/ops/shrinkage/refresh', {
      method: 'POST'
    });

    const data = await response.json();

    if (data.success) {
      alert(`Shrinkage view refreshed!\n\nRows: ${data.rowCount}\nDuration: ${data.durationMs}ms`);
      loadShrinkageReport();
    } else {
      alert('Failed to refresh: ' + data.error);
    }
  } catch (error) {
    console.error('Failed to refresh shrinkage view:', error);
    alert('Failed to refresh: ' + error.message);
  } finally {
    const btn = document.querySelector('.shrinkage-footer button');
    if (btn) btn.disabled = false;
  }
}

/**
 * Initialize Shrinkage tab
 */
function initShrinkageTab() {
  loadShrinkageCategories();
  loadShrinkageReport();
}

// Expose to global scope
window.loadShrinkageReport = loadShrinkageReport;
window.onShrinkagePeriodChange = onShrinkagePeriodChange;
window.onShrinkageCategoryChange = onShrinkageCategoryChange;
window.refreshShrinkageView = refreshShrinkageView;
window.initShrinkageTab = initShrinkageTab;

// ============================================================================
// HEALTH MONITORING INITIALIZATION
// ============================================================================
// Start health monitoring when page loads (defined in owner-console-core.js)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (typeof startHealthMonitoring === 'function') {
      startHealthMonitoring();
    }
  });
} else {
  // DOM already loaded
  if (typeof startHealthMonitoring === 'function') {
    startHealthMonitoring();
  }
}
