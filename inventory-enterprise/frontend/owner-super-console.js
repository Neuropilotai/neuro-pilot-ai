/**
 * Owner Super Console v3.2.0 - Console-Specific Extensions
 * v14.3: Shared core variables and functions are loaded from owner-console-core.js
 * This file contains only console-specific functionality
 */

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
 * Show a toast notification
 * @param {string} message - The message to display
 * @param {string} type - Type: 'success', 'warning', 'danger', 'info'
 */
function showToast(message, type = 'info') {
  // Create toast element
  const toast = document.createElement('div');
  toast.className = `alert alert-${type}`;
  toast.style.position = 'fixed';
  toast.style.top = '20px';
  toast.style.right = '20px';
  toast.style.zIndex = '9999';
  toast.style.minWidth = '300px';
  toast.style.maxWidth = '500px';
  toast.style.padding = '1rem';
  toast.style.borderRadius = '8px';
  toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
  toast.textContent = message;

  // Add to body
  document.body.appendChild(toast);

  // Remove after 3 seconds
  setTimeout(() => {
    toast.style.transition = 'opacity 0.3s';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Super Console still needs these functions:
async function loadDashboardOLD() {
  console.log('🔄 Loading dashboard...');

  try {
    // v13.1: Load Real Stats from Database
    loadCognitiveIntelligence();
    loadActivityFeed();

    // Fetch Real Dashboard Stats
    console.log('📊 Fetching real dashboard statistics...');
    const statsResponse = await fetchAPI('/owner/dashboard/stats');
    console.log('✅ Stats:', statsResponse);
    const stats = statsResponse.stats;

    // System Health
    document.getElementById('systemHealth').textContent = stats.systemHealth === 'OK' ? '✅ OK' : '❌ Down';

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
        return `<span style="color: var(--text-light);">Not configured</span>`;
      }
    })();

    const dbStatsHTML = `
      <table class="table">
        <tr style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white;">
          <td style="font-size: 1.1rem; font-weight: 700;">💰 Total Inventory Value</td>
          <td style="font-size: 1.5rem; font-weight: 700;">$${(stats.inventory?.totalValue || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
        </tr>
        <tr><td>Unique Products (from PDFs)</td><td><strong>${stats.inventory?.totalItems || 0}</strong> <span class="badge badge-success">Auto-Extracted</span></td></tr>
        <tr><td>Manual Inventory Items</td><td><strong>${stats.inventory?.manualItems || 0}</strong> items</td></tr>
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

    // Recent Activity
    await loadRecentActivity(stats.recentActivity);

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
    <div class="alert alert-info" style="margin-bottom: 1rem;">
      <strong>Forecast Date:</strong> ${date}<br>
      <strong>Total Items Covered:</strong> ${items.length}<br>
      <strong>Prediction Sources:</strong> Recipe calendar, breakfast demand, beverage profiles
    </div>
    <div style="max-height: 500px; overflow-y: auto;">
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
    const confidenceBadge = confidence > 80 ? 'badge-success' : confidence > 60 ? 'badge-warning' : 'badge-info';
    html += `
      <tr>
        <td><strong>${item.item_code || 'N/A'}</strong></td>
        <td>${item.item_name || ''}</td>
        <td>${item.total_predicted_qty?.toFixed(2) || 0}</td>
        <td>${item.unit || 'EA'}</td>
        <td><span class="badge ${confidenceBadge}">${confidence}%</span></td>
        <td style="font-size: 0.75rem;">${item.forecast_sources || 'forecast'}</td>
      </tr>
    `;
  });

  html += `
        </tbody>
      </table>
    </div>
    <div style="margin-top: 1rem; padding: 0.75rem; background: var(--bg); border-radius: 6px; font-size: 0.875rem;">
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
    <div class="alert alert-warning" style="margin-bottom: 1rem;">
      <strong>Stockout Risk Analysis</strong><br>
      Critical: ${critical.length} | High: ${high.length} | Medium: ${medium.length}
    </div>
    <div style="max-height: 500px; overflow-y: auto;">
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
        <td style="color: var(--danger); font-weight: 600;">${item.shortage_qty?.toFixed(2) || 0}</td>
      </tr>
    `;
  });

  html += `
        </tbody>
      </table>
    </div>
    <div style="margin-top: 1rem; padding: 0.75rem; background: var(--bg); border-radius: 6px; font-size: 0.875rem;">
      <strong>Recommendation:</strong> Items marked CRITICAL or HIGH should be reordered immediately. Review medium-risk items for potential future shortages.
    </div>
  `;

  content.innerHTML = html;
  modal.classList.add('active');
}

function closeStockoutDetailModal() {
  document.getElementById('stockoutDetailModal').classList.remove('active');
}

async function loadRecentActivity(recentActivity) {
  const div = document.getElementById('recentActivity');

  try {
    const activities = [];

    // Last PDF Upload
    if (recentActivity?.lastPDFUpload) {
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
    let html = '<div style="display: flex; flex-direction: column; gap: 0.75rem;">';

    activities.forEach(activity => {
      const borderColor = activity.type === 'success' ? 'var(--success)' :
                         activity.type === 'warning' ? 'var(--warning)' :
                         activity.type === 'info' ? 'var(--primary)' :
                         'var(--border)';

      html += `
        <div style="padding: 0.75rem; border-left: 3px solid ${borderColor}; background: var(--bg); border-radius: 4px;">
          <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.25rem;">
            <span style="font-weight: 600; font-size: 0.875rem;">${activity.icon} ${activity.title}</span>
            <span style="font-size: 0.75rem; color: var(--text-light);">${activity.time}</span>
          </div>
          <div style="font-size: 0.8125rem; color: var(--text-light);">${activity.detail}</div>
        </div>
      `;
    });

    html += '</div>';
    html += `<div style="margin-top: 0.75rem; padding: 0.5rem; text-align: center; font-size: 0.75rem; color: var(--text-light);">Last refreshed: ${new Date().toLocaleTimeString()}</div>`;

    div.innerHTML = html;

  } catch (error) {
    console.error('Error loading recent activity:', error);
    div.innerHTML = `
      <div class="empty-state">
        <div style="font-size: 0.875rem; color: var(--text-light);">
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
      <div class="alert alert-info" style="margin-bottom: 1.5rem;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <strong>🧮 Zero-Count Smart Mode</strong> — No physical inventory snapshot yet.
            Showing inferred quantities from par levels, recent invoices, and AI forecasts.
          </div>
          <button class="btn btn-sm btn-primary" onclick="startFirstCount()">🎯 Start First Count</button>
        </div>
      </div>

      <!-- Inventory Value Summary from PDFs -->
      <div class="card" style="margin-bottom: 1.5rem; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none;">
        <div style="padding: 1.5rem;">
          <div class="grid grid-3">
            <div style="text-align: center;">
              <div style="font-size: 0.875rem; opacity: 0.9; margin-bottom: 0.5rem;">💰 Total Inventory Value (from PDFs)</div>
              <div style="font-size: 2rem; font-weight: 700;">$${(stats.stats?.inventory?.totalValue || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 0.875rem; opacity: 0.9; margin-bottom: 0.5rem;">Unique Products</div>
              <div style="font-size: 2rem; font-weight: 700;">${(stats.stats?.inventory?.totalItems || 0).toLocaleString()}</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 0.875rem; opacity: 0.9; margin-bottom: 0.5rem;">Total Cases/Units</div>
              <div style="font-size: 2rem; font-weight: 700;">${(stats.stats?.inventory?.totalQuantityFromPDFs || 0).toLocaleString()}</div>
            </div>
          </div>
          <div style="text-align: center; margin-top: 1rem; font-size: 0.875rem; opacity: 0.9;">
            📊 This represents all products extracted from ${stats.stats?.pdfs?.total || 0} invoices totaling $${(stats.stats?.pdfs?.totalAmount || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
          </div>
        </div>
      </div>

      <!-- Three Panel Layout -->
      <div class="grid grid-3" style="margin-bottom: 1.5rem;">
        <!-- Panel 1: Inferred Stock Summary -->
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">📦 Inferred Stock</h3>
            <span class="badge badge-info">${estimates.count || 0} items</span>
          </div>
          <div style="font-size: 0.875rem; color: var(--text-light); margin-bottom: 1rem;">
            Avg Confidence: <strong>${((estimates.stats?.avg_confidence || 0) * 100).toFixed(0)}%</strong>
            | Low Confidence: <strong>${estimates.stats?.low_confidence_count || 0}</strong>
          </div>
          <div style="max-height: 400px; overflow-y: auto;">
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
          <div style="max-height: 400px; overflow-y: auto;">
            ${renderStockoutRadar(stockouts)}
          </div>
        </div>

        <!-- Panel 3: Storage Locations -->
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">📍 Storage Locations</h3>
            <span class="badge badge-info">${locations.count || 0}</span>
          </div>
          <div style="max-height: 400px; overflow-y: auto;">
            ${renderLocationsList(locations.locations || [])}
          </div>
        </div>
      </div>

      <!-- Quick Add Item -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">➕ Quick Add Item</h3>
        </div>
        <form onsubmit="event.preventDefault(); quickAddItem();" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem;">
          <div class="form-group" style="margin: 0;">
            <input type="text" class="input" id="quickAddCode" placeholder="Item Code" required>
          </div>
          <div class="form-group" style="margin: 0;">
            <input type="text" class="input" id="quickAddName" placeholder="Item Name" required>
          </div>
          <div class="form-group" style="margin: 0;">
            <input type="text" class="input" id="quickAddUnit" placeholder="Unit (EA)" value="EA">
          </div>
          <div class="form-group" style="margin: 0;">
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
      <div class="alert alert-success" style="margin-bottom: 1.5rem;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <strong>✅ Normal Mode</strong> — Physical inventory active.
            Last count: ${lastCount ? new Date(lastCount.closed_at).toLocaleDateString() : 'N/A'}
          </div>
          <button class="btn btn-sm btn-secondary" onclick="switchTab('count')">🔢 New Count</button>
        </div>
      </div>

      <!-- Inventory Value Summary -->
      <div class="card" style="margin-bottom: 1.5rem; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none;">
        <div style="padding: 1.5rem;">
          <div class="grid grid-3">
            <div style="text-align: center;">
              <div style="font-size: 0.875rem; opacity: 0.9; margin-bottom: 0.5rem;">Total Inventory Value</div>
              <div style="font-size: 2rem; font-weight: 700;">$${totalValue.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 0.875rem; opacity: 0.9; margin-bottom: 0.5rem;">Total Products</div>
              <div style="font-size: 2rem; font-weight: 700;">${items.length.toLocaleString()}</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 0.875rem; opacity: 0.9; margin-bottom: 0.5rem;">Total Units/Cases</div>
              <div style="font-size: 2rem; font-weight: 700;">${totalItems.toLocaleString()}</div>
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

  let html = '<div style="display: flex; flex-direction: column; gap: 0.75rem;">';

  items.forEach(item => {
    const confidence = item.confidence || 0;
    const confidenceClass = confidence >= 0.7 ? 'badge-success' : confidence >= 0.4 ? 'badge-warning' : 'badge-danger';
    const confidenceLabel = confidence >= 0.7 ? 'High' : confidence >= 0.4 ? 'Medium' : 'Low';

    html += `
      <div style="padding: 0.75rem; border: 1px solid var(--border); border-radius: 6px; background: var(--surface);">
        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
          <div>
            <strong>${item.item_name}</strong>
            <div style="font-size: 0.75rem; color: var(--text-light);">${item.item_code}</div>
          </div>
          <span class="badge ${confidenceClass}">${confidenceLabel}</span>
        </div>
        <div style="display: flex; gap: 1rem; font-size: 0.875rem;">
          <div>
            <span style="color: var(--text-light);">Inferred:</span>
            <strong>${item.inferred_qty || 0} ${item.unit}</strong>
          </div>
          <div>
            <span style="color: var(--text-light);">Par:</span>
            <strong>${item.par_level || 0}</strong>
          </div>
        </div>
        <div style="font-size: 0.75rem; color: var(--text-light); margin-top: 0.25rem;">
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
    return '<div class="empty-state"><div style="font-size: 2rem;">✅</div><div>No stock-out risks</div></div>';
  }

  let html = '<div style="display: flex; flex-direction: column; gap: 0.75rem;">';

  // Critical risks
  critical.forEach(item => {
    html += `
      <div style="padding: 0.75rem; border-left: 4px solid var(--danger); background: #fee2e2; border-radius: 4px;">
        <div style="font-weight: 600; color: var(--danger); margin-bottom: 0.25rem;">
          🚨 ${item.item_name}
        </div>
        <div style="font-size: 0.875rem; color: var(--text);">
          Available: <strong>${item.available_qty || 0} ${item.unit}</strong> |
          Needed: <strong>${item.predicted_24h || 0} ${item.unit}</strong>
        </div>
        <div style="font-size: 0.75rem; color: var(--text-light); margin-top: 0.25rem;">
          ${item.reason}
        </div>
      </div>
    `;
  });

  // High risks
  high.forEach(item => {
    html += `
      <div style="padding: 0.75rem; border-left: 4px solid var(--warning); background: #fef3c7; border-radius: 4px;">
        <div style="font-weight: 600; color: var(--warning); margin-bottom: 0.25rem;">
          ⚠️ ${item.item_name}
        </div>
        <div style="font-size: 0.875rem; color: var(--text);">
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

  let html = '<div style="display: flex; flex-direction: column; gap: 0.5rem;">';

  locations.forEach(loc => {
    const typeIcon = loc.location_type === 'COOLER' ? '❄️' :
                     loc.location_type === 'FREEZER' ? '🧊' :
                     loc.location_type === 'DRY' ? '📦' : '🏪';

    html += `
      <div style="padding: 0.75rem; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); cursor: pointer;"
           onclick="switchTab('locations')">
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <span style="font-size: 1.25rem;">${typeIcon}</span>
          <div>
            <div style="font-weight: 600;">${loc.location_name}</div>
            <div style="font-size: 0.75rem; color: var(--text-light);">${loc.location_code}</div>
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

    let html = '<div style="display: flex; flex-direction: column; gap: 0.5rem;">';
    locations.forEach(loc => {
      const id = loc.id || '';
      const name = loc.name || '';
      const type = loc.type || 'warehouse';

      html += `
        <div class="chip ${loc.active ? '' : 'disabled'}" style="justify-content: space-between; padding: 0.5rem;">
          <span onclick="filterByLocation('${id}', '${name}')" style="flex: 1; cursor: pointer;">
            ${name} <small>(${type})</small>
          </span>
          <div style="display: flex; gap: 0.25rem;">
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
      itemsDiv.innerHTML = '<div class="empty-state"><div>No items mapped to this location</div><div style="margin-top: 0.5rem; font-size: 0.875rem; color: var(--text-light);">Items can be assigned to locations during inventory counts.</div></div>';
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
  tableDiv.innerHTML = '<div class="loading"><div class="spinner"></div> Loading PDFs...</div>';

  const status = document.getElementById('pdfStatus').value;
  const search = document.getElementById('pdfSearch').value;

  try {
    const params = new URLSearchParams({ status });
    if (search) params.append('search', search);

    const data = await fetchAPI(`/owner/pdfs?${params}`);
    const pdfs = data.data || [];

    if (pdfs.length === 0) {
      tableDiv.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📄</div><div>No PDFs found</div></div>';
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
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
    `;

    let totalAmount = 0;

    pdfs.forEach(pdf => {
      const statusBadge = pdf.isProcessed ? '<span class="badge badge-success">Included</span>' : '<span class="badge badge-warning">Pending</span>';
      const invoiceNum = pdf.invoiceNumber || pdf.filename;

      // Fix: Parse date string directly to avoid timezone issues
      // Database stores dates as YYYY-MM-DD, display as-is without timezone conversion
      let dateDisplay = 'N/A';
      if (pdf.invoiceDate) {
        const dateStr = pdf.invoiceDate;
        if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
          // Parse YYYY-MM-DD directly without timezone conversion
          const [year, month, day] = dateStr.split('-');
          const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
          dateDisplay = date.toLocaleDateString();
        } else {
          // Fallback for other formats
          dateDisplay = new Date(dateStr + 'T12:00:00').toLocaleDateString();
        }
      } else if (pdf.receivedDate) {
        dateDisplay = new Date(pdf.receivedDate + 'T12:00:00').toLocaleDateString();
      }

      const vendor = pdf.vendor || 'N/A';
      const amount = pdf.amount || 0;
      const amountDisplay = amount > 0 ? `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-';

      if (amount > 0) totalAmount += amount;

      // Escape single quotes for onclick handler
      const escapedInvoiceNum = invoiceNum.replace(/'/g, "\\'");
      html += `
        <tr>
          <td><input type="checkbox" class="pdf-checkbox" data-pdf-id="${pdf.id}" ${pdf.isProcessed ? 'disabled' : ''}></td>
          <td><strong>${invoiceNum}</strong></td>
          <td>${dateDisplay}</td>
          <td>${vendor}</td>
          <td style="text-align: right; font-weight: 600;">${amountDisplay}</td>
          <td>${statusBadge}</td>
          <td><button type="button" class="btn btn-sm btn-primary" onclick="viewPDF('${pdf.id}', '${escapedInvoiceNum}')">👁️ View</button></td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    const totalFormatted = totalAmount > 0 ? `$${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$0.00';
    html += `<div style="margin-top: 1rem; color: var(--text-light); font-size: 0.875rem;">
      <strong>Total:</strong> ${data.summary?.total || pdfs.length} PDFs
      (${data.summary?.processed || 0} processed, ${data.summary?.unprocessed || 0} pending) |
      <strong>Total Amount:</strong> <span style="color: var(--success); font-size: 1.1rem;">${totalFormatted}</span>
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
          <span><strong>${displayName}</strong> <small style="color: var(--text-light);">(${dateDisplay})</small></span>
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

    (data.locations || []).forEach(loc => {
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
    detailsDiv.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔢</div><div>No active count</div><div style="margin-top: 0.5rem;"><button class="btn btn-primary" onclick="document.querySelector(\'#count\').scrollIntoView()">Start a count to begin</button></div></div>';
    return;
  }

  detailsDiv.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  try {
    const data = await fetchAPI(`/owner/console/counts/${activeCountId}`);
    const count = data.count;
    const items = data.items || [];
    const pdfs = data.pdfs || [];

    let html = `
      <div style="margin-bottom: 1rem;">
        <strong>Status:</strong> <span class="badge ${count.status === 'closed' ? 'badge-success' : 'badge-warning'}">${count.status}</span><br>
        <strong>Started:</strong> ${new Date(count.created_at).toLocaleString()}<br>
        <strong>Total Lines:</strong> ${count.total_lines || 0}<br>
        <strong>Locations:</strong> ${count.locations_touched || 0}
      </div>
      <div style="display: flex; gap: 0.5rem; margin-bottom: 1rem;">
        <button class="btn btn-sm btn-primary" onclick="showAddItemForm()">+ Add Item</button>
        <button class="btn btn-sm btn-primary" onclick="showAttachPDFForm()">📎 Attach PDF</button>
        ${count.status !== 'closed' ? '<button class="btn btn-sm btn-success" onclick="closeCount()">✓ Close Count</button>' : ''}
      </div>
    `;

    if (items.length > 0) {
      html += '<h4 style="margin-top: 1rem; margin-bottom: 0.5rem; font-size: 0.875rem;">Items:</h4>';
      html += '<div style="max-height: 200px; overflow-y: auto; font-size: 0.875rem;">';
      items.forEach(item => {
        html += `<div style="padding: 0.5rem; border-bottom: 1px solid var(--border);">${item.item_code} - ${item.item_name}: <strong>${item.quantity}</strong> ${item.location_name || ''}</div>`;
      });
      html += '</div>';
    }

    if (pdfs.length > 0) {
      html += '<h4 style="margin-top: 1rem; margin-bottom: 0.5rem; font-size: 0.875rem;">Attached PDFs:</h4>';
      html += '<div style="font-size: 0.875rem;">';
      pdfs.forEach(pdf => {
        const escapedFilename = pdf.filename.replace(/'/g, "\\'");
        html += `<div style="padding: 0.5rem; border-bottom: 1px solid var(--border);"><a href="#" onclick="viewPDF('${pdf.document_id}', '${escapedFilename}')" style="color: var(--primary);">${pdf.filename}</a></div>`;
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
  document.getElementById('itemSearchResults').style.display = 'none';
  document.getElementById('selectedItemDisplay').style.display = 'none';

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

// Item search with autocomplete
let searchTimeout;
document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('itemSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      const query = e.target.value.trim();

      if (query.length < 2) {
        document.getElementById('itemSearchResults').style.display = 'none';
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
      resultsDiv.innerHTML = '<div style="padding: 0.75rem; color: var(--text-light);">No items found</div>';
      resultsDiv.style.display = 'block';
      return;
    }

    let html = '';
    data.items.forEach(item => {
      html += `
        <div style="padding: 0.75rem; border-bottom: 1px solid var(--border); cursor: pointer; transition: background 0.2s;"
             onmouseover="this.style.background='var(--bg)'"
             onmouseout="this.style.background='white'"
             onclick="selectItem('${item.item_code}', '${item.item_name.replace(/'/g, "\\'")}', '${item.unit || 'EA'}')">
          <strong>${item.item_code}</strong> - ${item.item_name}
          <div style="font-size: 0.75rem; color: var(--text-light);">
            ${item.category || 'N/A'} | ${item.unit || 'EA'} | On hand: ${item.current_quantity || 0}
          </div>
        </div>
      `;
    });

    resultsDiv.innerHTML = html;
    resultsDiv.style.display = 'block';
  } catch (error) {
    console.error('Error searching items:', error);
  }
}

function selectItem(code, name, unit) {
  document.getElementById('selectedItemCode').value = code;
  document.getElementById('selectedItemText').textContent = `${code} - ${name} (${unit})`;
  document.getElementById('selectedItemDisplay').style.display = 'block';
  document.getElementById('itemSearchResults').style.display = 'none';
  document.getElementById('itemSearchInput').value = '';

  // Focus on quantity input
  setTimeout(() => document.getElementById('countItemQuantity').focus(), 100);
}

function clearSelectedItem() {
  document.getElementById('selectedItemCode').value = '';
  document.getElementById('selectedItemDisplay').style.display = 'none';
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
  processPanel.style.display = 'block';

  try {
    const data = await fetchAPI(`/owner/console/counts/${activeCountId}`);
    const items = data.items || [];
    const pdfs = data.pdfs || [];

    let html = `
      <div class="alert alert-info">Review count details before closing. This action creates a permanent snapshot.</div>
      <h4>Items to be recorded: ${items.length}</h4>
      <div style="max-height: 300px; overflow-y: auto; margin: 1rem 0;">
        ${items.map(item => `<div style="padding: 0.5rem; border-bottom: 1px solid var(--border);">${item.item_code} - ${item.item_name}: <strong>${item.quantity}</strong></div>`).join('')}
      </div>
      <h4>PDFs attached: ${pdfs.length}</h4>
      <div style="max-height: 200px; overflow-y: auto; margin: 1rem 0;">
        ${pdfs.map(pdf => {
          const escapedFilename = pdf.filename.replace(/'/g, "\\'");
          return `<div style="padding: 0.5rem; border-bottom: 1px solid var(--border);"><a href="#" onclick="viewPDF('${pdf.document_id}', '${escapedFilename}')" style="color: var(--primary);">${pdf.filename}</a></div>`;
        }).join('')}
      </div>
      <div style="display: flex; gap: 1rem; margin-top: 1rem;">
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
    document.getElementById('countProcessPanel').style.display = 'none';
    loadActiveCount();
  } catch (error) {
    alert('Error closing count: ' + error.message);
  }
}

function cancelCloseCount() {
  document.getElementById('countProcessPanel').style.display = 'none';
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
      div.innerHTML = '<div class="empty-state" style="padding: 2rem 1rem;"><div>✅ All Items Stocked</div><div style="font-size: 0.875rem; color: var(--text-light); margin-top: 0.5rem;">No items currently need reordering. Great job!</div></div>';
      return;
    }

    let html = '<div style="display: flex; flex-direction: column; gap: 0.75rem; font-size: 0.875rem;">';
    items.forEach(item => {
      const urgencyColor = item.stockPct < 50 ? 'var(--danger)' : item.stockPct < 100 ? 'var(--warning)' : 'var(--info)';
      html += `
        <div style="padding: 0.75rem; border: 1px solid var(--border); border-radius: 6px; border-left: 3px solid ${urgencyColor};">
          <div style="font-weight: 600; margin-bottom: 0.25rem;">${item.itemCode} - ${item.name}</div>
          <div style="color: var(--text-light); margin-bottom: 0.5rem; font-size: 0.8125rem;">
            Current: ${item.currentStock} ${item.unit || ''} | Reorder Point: ${item.reorderPoint} | Need: ${item.recommendedReorderQty}
          </div>
          <div style="display: flex; gap: 0.25rem; flex-wrap: wrap;">
            ${(item.drivers || []).map(d => `<span class="badge badge-info">${d}</span>`).join('')}
            <span class="badge" style="background: ${urgencyColor};">${item.stockPct}% of reorder point</span>
          </div>
        </div>
      `;
    });
    html += '</div>';

    div.innerHTML = html;
  } catch (error) {
    console.error('Failed to load reorder recommendations:', error);
    div.innerHTML = '<div class="empty-state" style="padding: 2rem 1rem;"><div>⚠️ Unable to load recommendations</div><div style="font-size: 0.875rem; color: var(--text-light); margin-top: 0.5rem;">Please refresh the page.</div></div>';
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
      div.innerHTML = '<div class="empty-state" style="padding: 2rem 1rem;"><div>✅ No Anomalies Detected</div><div style="font-size: 0.875rem; color: var(--text-light); margin-top: 0.5rem;">All inventory levels are normal.</div></div>';
      return;
    }

    let html = '<div style="display: flex; flex-direction: column; gap: 0.75rem; font-size: 0.875rem;">';
    items.forEach(item => {
      const severityClass = item.severity === 'critical' ? 'badge-danger' : item.severity === 'high' ? 'badge-warning' : item.severity === 'medium' ? 'badge-info' : 'badge-secondary';
      const severityIcon = item.severity === 'critical' ? '🔴' : item.severity === 'high' ? '⚠️' : '🔵';
      html += `
        <div style="padding: 0.75rem; border: 1px solid var(--border); border-radius: 6px;">
          <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
            <div>
              <span style="font-size: 1.25rem; margin-right: 0.5rem;">${severityIcon}</span>
              <span style="font-weight: 600;">${item.itemCode}</span>
              ${item.name ? `<span style="color: var(--text-light); font-size: 0.8125rem;"> - ${item.name}</span>` : ''}
            </div>
            <span class="badge ${severityClass}">${item.severity}</span>
          </div>
          <div style="color: var(--text-light); margin-bottom: 0.5rem; font-size: 0.8125rem;">${item.explanation}</div>
          <div style="font-size: 0.75rem; color: var(--text-light);">
            ${new Date(item.when).toLocaleString()} | Confidence: ${Math.round((item.confidence || 0) * 100)}%
          </div>
        </div>
      `;
    });
    html += '</div>';

    div.innerHTML = html;
  } catch (error) {
    console.error('Failed to load anomalies:', error);
    div.innerHTML = '<div class="empty-state" style="padding: 2rem 1rem;"><div>⚠️ Unable to load anomalies</div><div style="font-size: 0.875rem; color: var(--text-light); margin-top: 0.5rem;">Please refresh the page.</div></div>';
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
      <div style="font-size: 0.875rem;">
        <div style="margin-bottom: 1rem;">
          <strong>System Health Score:</strong>
          <div style="font-size: 2rem; color: ${overallScore >= 75 ? 'var(--success)' : overallScore >= 50 ? 'var(--warning)' : 'var(--danger)'}; font-weight: 700;">${overallScore}%</div>
        </div>
        <div style="display: flex; flex-direction: column; gap: 0.75rem;">
          <div>
            <strong>📄 Invoice Extraction:</strong> ${pdfScore}%<br>
            <span style="color: var(--text-light);">${pdfScore === 100 ? 'Perfect! All invoices have extracted dates.' : `${stats.pdfs?.withDates || 0}/${stats.pdfs?.total || 0} invoices processed. Keep uploading!`}</span>
          </div>
          <div>
            <strong>📦 FIFO Tracking:</strong> ${stats.fifo?.totalCases || 0} cases<br>
            <span style="color: var(--text-light);">${stats.fifo?.totalCases > 0 ? `Tracking ${stats.fifo.productsTracked} products with FIFO.` : 'Start using FIFO for better inventory rotation.'}</span>
          </div>
          <div>
            <strong>💾 Database:</strong> SQLite<br>
            <span style="color: var(--text-light);">Connected and operational with ${stats.inventory?.totalItems || 0} items tracked.</span>
          </div>
          <div>
            <strong>📊 Inventory Value:</strong> $${((stats.pdfs?.totalAmount || 0) / 1000).toFixed(1)}K<br>
            <span style="color: var(--text-light);">Total invoice value tracked in system.</span>
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
      html += '<div style="margin-top: 1rem;"><strong>💡 Recommended Actions:</strong></div>';
      html += '<div style="display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.5rem;">';
      nextActions.forEach(action => {
        html += `<div style="padding: 0.5rem; background: var(--bg); border-radius: 4px; border-left: 3px solid var(--primary);">${action.title} <span style="color: var(--text-light);">(~${action.etaMin}min)</span></div>`;
      });
      html += '</div>';
    } else {
      html += '<div style="margin-top: 1rem; padding: 1rem; background: var(--bg); border-radius: 4px; text-align: center; color: var(--success);">✅ System is running optimally!</div>';
    }

    html += '</div>';
    div.innerHTML = html;
  } catch (error) {
    console.error('Failed to load system advisor:', error);
    div.innerHTML = '<div class="empty-state" style="padding: 2rem 1rem;"><div>⚠️ Unable to load advisor</div><div style="font-size: 0.875rem; color: var(--text-light); margin-top: 0.5rem;">Please refresh the page.</div></div>';
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
      div.innerHTML = '<div style="padding: 1rem; text-align: center; color: var(--text-light); font-size: 0.875rem;">No feedback history</div>';
      return;
    }

    let html = '<div style="max-height: 300px; overflow-y: auto; margin-top: 1rem;"><table class="table"><thead><tr><th>Comment</th><th>Intent</th><th>Status</th><th>Date</th></tr></thead><tbody>';
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
      div.innerHTML = '<div style="padding: 1rem; text-align: center; color: var(--success); font-weight: 600;">✅ No critical stockout risks</div>';
      return;
    }

    let html = '<div style="display: flex; flex-direction: column; gap: 0.5rem;">';
    items.forEach(item => {
      const risk_level = item.risk_level || 'MEDIUM';
      const alertClass = risk_level === 'CRITICAL' ? 'alert-danger' : 'alert-warning';
      html += `
        <div class="${alertClass.replace('alert-', 'badge-')}" style="padding: 0.75rem; border-radius: 6px; display: flex; justify-content: space-between; align-items: center;">
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
      div.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📈</div><div>No predictions available</div><div style="margin-top: 0.5rem; font-size: 0.875rem; color: var(--text-light);">Update population and refresh.</div></div>';
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
      const confidenceBadge = confidence > 80 ? 'badge-success' : confidence > 60 ? 'badge-warning' : 'badge-info';

      html += `
        <tr>
          <td><strong>${pred.item_code || 'N/A'}</strong><br><small style="color: var(--text-light);">${pred.item_name || ''}</small></td>
          <td>${pred.total_predicted_qty?.toFixed(2) || 0}</td>
          <td>${pred.unit || 'EA'}</td>
          <td><span class="badge ${confidenceBadge}">${confidence}%</span></td>
          <td style="font-size: 0.75rem; color: var(--text-light);">${pred.forecast_sources || 'forecast'}</td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    html += `<div style="margin-top: 1rem; color: var(--text-light); font-size: 0.875rem;">Last updated: ${new Date(data.timestamp || Date.now()).toLocaleString()}</div>`;

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
    <div style="font-size: 0.875rem;">
      <strong>Device Fingerprint:</strong><br>
      <code style="font-size: 0.75rem; background: var(--bg); padding: 0.25rem 0.5rem; border-radius: 4px; display: inline-block; margin-top: 0.5rem;">${fingerprint}</code>
    </div>
  `;

  // Audit Info
  try {
    const metrics = await fetch('http://127.0.0.1:8083/metrics').then(r => r.text());
    const auditDiv = document.getElementById('auditInfo');

    // Extract audit chain hash if available in metrics
    const hashMatch = metrics.match(/audit_chain_head_hash{.*?}\s+"([^"]+)"/);
    const chainHash = hashMatch ? hashMatch[1] : 'Not available';

    auditDiv.innerHTML = `
      <div style="font-size: 0.875rem;">
        <strong>Audit Chain Head:</strong><br>
        <code style="font-size: 0.75rem; background: var(--bg); padding: 0.25rem 0.5rem; border-radius: 4px; display: inline-block; margin-top: 0.5rem;">${chainHash}</code>
      </div>
    `;
  } catch (error) {
    document.getElementById('auditInfo').innerHTML = '<div style="color: var(--text-light); font-size: 0.875rem;">Audit info unavailable</div>';
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
      <div class="grid grid-3" style="margin-bottom: 1.5rem;">
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
      <h4 style="margin-bottom: 0.5rem;">Critical Stockouts</h4>
      <div style="margin-bottom: 1.5rem;">
        ${report.stockouts?.length ? report.stockouts.map(s => `
          <div style="padding: 0.5rem; border-bottom: 1px solid var(--border);">
            <strong>${s.item_code}</strong> - ${s.severity} - Projected: ${s.projected_stockout_date}
          </div>
        `).join('') : '<div style="padding: 1rem; text-align: center; color: var(--text-light);">No critical stockouts</div>'}
      </div>
      <h4 style="margin-bottom: 0.5rem;">AI Confidence Trend (7 days)</h4>
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
        ` : '<div style="padding: 1rem; text-align: center; color: var(--text-light);">No confidence data</div>'}
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
      <div class="grid grid-3" style="margin-bottom: 1.5rem;">
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
      <h4 style="margin-bottom: 0.5rem;">Count Throughput (14 days)</h4>
      <div style="margin-bottom: 1.5rem;">
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
        ` : '<div style="padding: 1rem; text-align: center; color: var(--text-light);">No throughput data</div>'}
      </div>
      <h4 style="margin-bottom: 0.5rem;">Top 20 Spot-Check Targets</h4>
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
        ` : '<div style="padding: 1rem; text-align: center; color: var(--text-light);">No spot-check data</div>'}
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
      <h4 style="margin-bottom: 0.5rem;">Today's Make List</h4>
      <div style="margin-bottom: 1.5rem;">
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
        ` : '<div style="padding: 1rem; text-align: center; color: var(--text-light);">No make list data</div>'}
      </div>
      <h4 style="margin-bottom: 0.5rem;">FIFO Ingredient Pulls</h4>
      <div>
        ${report.ingredientsByFIFO?.length ? `
          <table class="table">
            <thead><tr><th>Item</th><th>Locations/Layers</th><th>Total Qty</th></tr></thead>
            <tbody>
              ${report.ingredientsByFIFO.map(i => `
                <tr>
                  <td><strong>${i.item_code}</strong><br><small>${i.item_name}</small></td>
                  <td>
                    ${i.layers.map(l => `<div style="font-size: 0.75rem;">${l.location}: ${l.quantity} (Exp: ${l.expiry_date || 'N/A'})</div>`).join('')}
                  </td>
                  <td>${i.layers.reduce((sum, l) => sum + l.quantity, 0).toFixed(2)} ${i.unit}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : '<div style="padding: 1rem; text-align: center; color: var(--text-light);">No FIFO data</div>'}
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
      <div class="grid grid-3" style="margin-bottom: 1.5rem;">
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
      <h4 style="margin-bottom: 0.5rem;">Recent Invoices</h4>
      <div style="margin-bottom: 1.5rem;">
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
        ` : '<div style="padding: 1rem; text-align: center; color: var(--text-light);">No invoice data</div>'}
      </div>
      <h4 style="margin-bottom: 0.5rem;">Reorder Recommendations</h4>
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
                  <td style="font-size: 0.75rem;">${r.reason}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : '<div style="padding: 1rem; text-align: center; color: var(--text-light);">No reorder recommendations</div>'}
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
      <div class="grid grid-3" style="margin-bottom: 1.5rem;">
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
      <h4 style="margin-bottom: 0.5rem;">Variance Indicators</h4>
      <div style="margin-bottom: 1.5rem;">
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
      <h4 style="margin-bottom: 0.5rem;">Recent Closed Counts</h4>
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
                  <td style="font-size: 0.75rem;">${c.notes || 'N/A'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : '<div style="padding: 1rem; text-align: center; color: var(--text-light);">No closed counts this month</div>'}
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

    let html = '<div style="display: flex; flex-direction: column; gap: 0.75rem;">';
    steps.forEach(step => {
      const statusIcon = step.status === 'completed' ? '✅' : step.status === 'warning' ? '⚠️' : step.status === 'skipped' ? '⏭️' : '❌';
      const statusClass = step.status === 'completed' ? 'badge-success' : step.status === 'warning' ? 'badge-warning' : 'badge-info';
      html += `
        <div style="padding: 0.75rem; border: 1px solid var(--border); border-radius: 6px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span><strong>${statusIcon} ${step.step}</strong></span>
            <span class="badge ${statusClass}">${step.status}</span>
          </div>
          <div style="margin-top: 0.5rem; font-size: 0.875rem; color: var(--text-light);">${step.message}</div>
        </div>
      `;
    });
    html += '</div>';
    html += `<div style="margin-top: 1rem; padding: 0.75rem; background: var(--bg); border-radius: 6px;"><strong>Duration:</strong> ${data.duration}ms</div>`;

    stepsDiv.innerHTML = html;
    curlDiv.innerHTML = `<strong>cURL Command:</strong><pre style="margin-top: 0.5rem; white-space: pre-wrap;">${data.curlCommand || 'N/A'}</pre>`;
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

    let html = '<div style="display: flex; flex-direction: column; gap: 0.75rem;">';
    steps.forEach(step => {
      const statusIcon = step.status === 'completed' ? '✅' : step.status === 'warning' ? '⚠️' : step.status === 'skipped' ? '⏭️' : '❌';
      const statusClass = step.status === 'completed' ? 'badge-success' : step.status === 'warning' ? 'badge-warning' : 'badge-info';
      html += `
        <div style="padding: 0.75rem; border: 1px solid var(--border); border-radius: 6px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span><strong>${statusIcon} ${step.step}</strong></span>
            <span class="badge ${statusClass}">${step.status}</span>
          </div>
          <div style="margin-top: 0.5rem; font-size: 0.875rem; color: var(--text-light);">${step.message}</div>
        </div>
      `;
    });
    html += '</div>';
    html += `<div class="alert alert-info" style="margin-top: 1rem;">${data.note || 'Services stopped'}</div>`;

    stepsDiv.innerHTML = html;
    curlDiv.innerHTML = `<strong>cURL Command:</strong><pre style="margin-top: 0.5rem; white-space: pre-wrap;">${data.curlCommand || 'N/A'}</pre>`;
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
  document.getElementById('recoveryDestGroup').style.display = 'block';
  document.getElementById('recoveryPath').style.display = 'none';
  document.getElementById('recoveryInputModal').classList.add('active');
}

function verifyRecoveryKit() {
  currentRecoveryOperation = 'verify';
  document.getElementById('recoveryInputModalTitle').textContent = 'Verify Recovery Kit';
  document.getElementById('recoveryInputLabel').textContent = 'Path to Recovery Kit';
  document.getElementById('recoveryPath').style.display = 'block';
  document.getElementById('recoveryDestGroup').style.display = 'none';
  document.getElementById('recoveryInputModal').classList.add('active');
}

function dryRunRestore() {
  currentRecoveryOperation = 'restore';
  document.getElementById('recoveryInputModalTitle').textContent = 'Dry-Run Restore';
  document.getElementById('recoveryInputLabel').textContent = 'Path to Recovery Kit';
  document.getElementById('recoveryPath').style.display = 'block';
  document.getElementById('recoveryDestGroup').style.display = 'none';
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
            <tr><td><strong>SHA-256:</strong></td><td><code style="font-size: 0.75rem;">${data.kit.sha256}</code></td></tr>
            <tr><td><strong>Encrypted:</strong></td><td>${data.kit.encrypted ? '✅ Yes' : '❌ No'}</td></tr>
            <tr><td><strong>Duration:</strong></td><td>${data.duration}ms</td></tr>
          </table>
          <div style="margin-top: 1rem;">
            <h4>Manifest:</h4>
            <pre style="font-size: 0.75rem; background: var(--bg); padding: 1rem; border-radius: 4px; overflow-x: auto;">${JSON.stringify(data.kit.manifest, null, 2)}</pre>
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
            <tr><td><strong>SHA-256:</strong></td><td><code style="font-size: 0.75rem;">${data.kit.sha256}</code></td></tr>
            <tr><td><strong>Encrypted:</strong></td><td>${data.verification.encrypted ? '✅ Yes' : '❌ No'}</td></tr>
            <tr><td><strong>Extractable:</strong></td><td>${data.verification.extractable ? '✅ Yes' : '❌ No'}</td></tr>
            <tr><td><strong>Database Intact:</strong></td><td>${data.verification.databaseIntact ? '✅ Yes' : '❌ No'}</td></tr>
          </table>
          ${data.manifest ? `
            <div style="margin-top: 1rem;">
              <h4>Manifest:</h4>
              <pre style="font-size: 0.75rem; background: var(--bg); padding: 1rem; border-radius: 4px; overflow-x: auto;">${JSON.stringify(data.manifest, null, 2)}</pre>
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
            <tr><td><strong>Expected SHA-256:</strong></td><td><code style="font-size: 0.65rem;">${data.verification.expectedSHA256}</code></td></tr>
            <tr><td><strong>Actual SHA-256:</strong></td><td><code style="font-size: 0.65rem;">${data.verification.actualSHA256}</code></td></tr>
          </table>
          <h4 style="margin-top: 1rem;">Restore Plan:</h4>
          <div style="display: flex; flex-direction: column; gap: 0.5rem;">
            ${data.restorePlan.map((step, i) => `
              <div style="padding: 0.75rem; border: 1px solid var(--border); border-radius: 6px;">
                <strong>${i + 1}. ${step.step}</strong>
                <div style="font-size: 0.875rem; color: var(--text-light); margin-top: 0.25rem;">${step.action}</div>
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
      div.innerHTML = '<div class="empty-state" style="padding: 2rem 1rem;"><div>✅ No Suggestions</div><div style="font-size: 0.875rem; color: var(--text-light); margin-top: 0.5rem;">System is running optimally!</div></div>';
      return;
    }

    let html = '<div style="display: flex; flex-direction: column; gap: 1rem;">';
    nudges.forEach(nudge => {
      html += `
        <div style="padding: 1rem; border: 1px solid var(--border); border-radius: 8px; background: var(--bg); border-left: 3px solid var(--primary);">
          <div style="font-weight: 600; margin-bottom: 0.5rem;">💡 ${nudge.title}</div>
          <div style="font-size: 0.875rem; color: var(--text-light); margin-bottom: 0.75rem;">${nudge.question}</div>
          <div style="font-size: 0.8125rem; padding: 0.5rem; background: rgba(59, 130, 246, 0.1); border-radius: 4px; margin-bottom: 0.75rem;">
            <strong>Suggestion:</strong> ${nudge.suggestedInsight}
          </div>
          <button class="btn btn-sm btn-primary" onclick="handleNudgeAction('${nudge.id}', '${nudge.action}')" style="width: 100%;">
            ${nudge.action}
          </button>
        </div>
      `;
    });
    html += '</div>';
    html += '<div style="margin-top: 1rem; padding: 1rem; background: var(--bg); border-radius: 6px; font-size: 0.875rem; color: var(--text-light);">💡 These suggestions are generated based on your current system state and usage patterns.</div>';

    div.innerHTML = html;
  } catch (error) {
    console.error('Failed to load learning nudges:', error);
    div.innerHTML = '<div class="empty-state" style="padding: 2rem 1rem;"><div>⚠️ Unable to load suggestions</div><div style="font-size: 0.875rem; color: var(--text-light); margin-top: 0.5rem;">Please refresh the page.</div></div>';
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

    // === v13.5: Use AI Ops status endpoint with DQI and predictive health ===
    const opsStatus = await fetchAPI('/owner/ops/status');

    // v13.5 Live Console: Update health score from composite ai_ops_health
    const healthPct = opsStatus.ai_ops_health ? opsStatus.ai_ops_health.score : (opsStatus.healthPct || 0);
    healthScoreEl.textContent = `${healthPct}%`;
    healthScoreEl.style.color = healthPct >= 85 ? 'var(--success)' : (healthPct >= 60 ? 'var(--warning)' : 'var(--danger)');

    // Show top 3 explanations as tooltip
    if (opsStatus.ai_ops_health && opsStatus.ai_ops_health.explanations) {
      const topExplanations = opsStatus.ai_ops_health.explanations.slice(0, 3).join('\n');
      healthScoreEl.title = `AI Ops System Health:\n${topExplanations}`;
    }

    // === v13.5: Display Data Quality Index (DQI) ===
    if (opsStatus.dqi_score !== null && opsStatus.dqi_score !== undefined) {
      const dqiChange = opsStatus.dqi_change_pct || 0;
      const dqiArrow = dqiChange > 0 ? '↑' : dqiChange < 0 ? '↓' : '→';
      const dqiColor = opsStatus.dqi_color === 'green' ? 'var(--success)' :
                        opsStatus.dqi_color === 'yellow' ? 'var(--warning)' : 'var(--danger)';

      dqiScoreEl.textContent = `${opsStatus.dqi_score}% ${dqiArrow}`;
      dqiScoreEl.style.color = dqiColor;
      dqiScoreEl.title = `Data Quality Index: ${opsStatus.dqi_score}% (${dqiChange > 0 ? '+' : ''}${dqiChange}%)`;
    } else {
      dqiScoreEl.textContent = '--';
      dqiScoreEl.style.color = 'var(--text-light)';
    }

    // === v13.5: Display Forecast Latency ===
    if (opsStatus.forecast_latency_avg !== null && opsStatus.forecast_latency_avg !== undefined && typeof opsStatus.forecast_latency_avg === 'number') {
      const latency = opsStatus.forecast_latency_avg;
      forecastLatencyEl.textContent = latency >= 1000 ? `${(latency/1000).toFixed(1)}s` : `${latency}ms`;
      forecastLatencyEl.style.color = latency < 2000 ? 'var(--success)' : latency < 5000 ? 'var(--warning)' : 'var(--danger)';
      forecastLatencyEl.title = `Average forecast job duration over last 10 runs: ${latency}ms`;
    } else {
      forecastLatencyEl.textContent = '--';
      forecastLatencyEl.style.color = 'var(--text-light)';
    }

    // === v13.5: Display Learning Divergence ===
    if (opsStatus.forecast_divergence !== null && opsStatus.forecast_divergence !== undefined && typeof opsStatus.forecast_divergence === 'number') {
      const divergence = opsStatus.forecast_divergence;
      const divArrow = divergence > 0 ? '↑' : divergence < 0 ? '↓' : '→';
      learningDivergenceEl.textContent = `${divergence.toFixed(1)}% ${divArrow}`;
      learningDivergenceEl.style.color = Math.abs(divergence) < 5 ? 'var(--success)' :
                                          Math.abs(divergence) < 10 ? 'var(--warning)' : 'var(--danger)';
      learningDivergenceEl.title = `MAPE divergence (7d vs prev 7d): ${divergence.toFixed(1)}%`;
    } else {
      learningDivergenceEl.textContent = '--';
      learningDivergenceEl.style.color = 'var(--text-light)';
    }

    // === v13.5: Display system health checks from ops status ===
    let checksHTML = '<div style="display: flex; flex-direction: column; gap: 0.5rem; font-size: 0.875rem;">';

    if (opsStatus.checks && opsStatus.checks.length > 0) {
      opsStatus.checks.forEach(check => {
        const icon = check.status === 'ok' ? '✅' : check.status === 'warning' ? '⚠️' : '❌';
        const color = check.status === 'ok' ? 'var(--success)' : check.status === 'warning' ? 'var(--warning)' : 'var(--danger)';
        checksHTML += `
          <div style="display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem; background: var(--bg); border-radius: 4px;">
            <span style="font-size: 1.25rem;">${icon}</span>
            <div style="flex: 1;">
              <strong>${check.name}</strong>
              <div style="color: ${color}; font-size: 0.8125rem;">${check.message}</div>
            </div>
          </div>
        `;
      });
    }

    // === v13.5: Add DQI issues if any ===
    if (opsStatus.dqi_issues && opsStatus.dqi_issues.length > 0) {
      checksHTML += `<div style="margin-top: 0.5rem; padding: 0.5rem; background: var(--bg); border-radius: 4px; border-left: 3px solid var(--warning);">
        <strong>⚠️ Data Quality Issues</strong>
        <ul style="margin: 0.5rem 0 0 1.5rem; font-size: 0.8125rem;">`;

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
        liveBadge.style.background = '#10b981';
        liveBadge.textContent = 'LIVE 🟢';
      } else {
        liveBadge.style.background = '#ef4444';
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
      healthScoreEl.style.color = 'var(--danger)';
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

      let html = '<div style="display: flex; flex-direction: column; gap: 0.75rem;">';
      insights.slice(0, 10).forEach(insight => {
        const timestamp = new Date(insight.created_at);
        const confidence = parseFloat(insight.confidence) || 0;

        // v13.0: Confidence badge (✅ ≥0.95, 🟡 0.85-0.94, 🔴 <0.85)
        let badge = '🔴';
        if (confidence >= 0.95) badge = '✅';
        else if (confidence >= 0.85) badge = '🟡';

        html += `
          <div style="padding: 0.75rem; background: var(--bg); border-left: 3px solid var(--primary); border-radius: 4px;">
            <div style="display: flex; justify-content: between; align-items: start; gap: 0.5rem;">
              <span style="font-size: 1.25rem;">${badge}</span>
              <div style="flex: 1;">
                <div style="font-weight: 500; font-size: 0.875rem;">${insight.title || 'No title'}</div>
                <div style="font-size: 0.75rem; color: var(--text-light); margin-top: 0.25rem;">
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
 * Load Cognitive Intelligence Overview (v13.0)
 * Displays AI confidence trends, forecast accuracy, and active modules
 */
async function loadCognitiveIntelligence() {
  try {
    // Fetch real dashboard stats
    const statsResponse = await fetchAPI('/owner/dashboard/stats');
    const stats = statsResponse.stats;

    // Update top-level metrics with real data
    document.getElementById('aiConfidenceAvg').textContent = `${stats.pdfs?.coverage || 0}%`;
    document.getElementById('forecastAccuracyAvg').textContent = `${stats.pdfs?.coverage || 0}%`;
    document.getElementById('activeModulesCount').textContent = '1/1'; // PDF Extraction module
    document.getElementById('learningAppliedCount').textContent = stats.pdfs?.total || 0;

    // Render simple status charts
    const chartsEl = document.getElementById('cognitiveCharts');
    let chartsHTML = '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">';

    // PDF Extraction Status
    chartsHTML += '<div style="background: rgba(255,255,255,0.1); padding: 1rem; border-radius: 6px;">';
    chartsHTML += '<div style="font-weight: 600; margin-bottom: 0.5rem;">Invoice Extraction</div>';
    chartsHTML += `
      <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
        <div style="width: 80px; font-size: 0.75rem;">Coverage</div>
        <div style="flex: 1; background: rgba(255,255,255,0.2); border-radius: 4px; height: 24px; position: relative;">
          <div style="background: #10b981; width: ${stats.pdfs?.coverage || 0}%; height: 100%; border-radius: 4px;"></div>
          <div style="position: absolute; right: 4px; top: 3px; font-size: 0.75rem; font-weight: 600;">${stats.pdfs?.coverage || 0}%</div>
        </div>
      </div>
      <div style="font-size: 0.75rem; opacity: 0.9; margin-top: 0.5rem;">
        ${stats.pdfs?.withDates || 0}/${stats.pdfs?.total || 0} invoices with dates
      </div>
    `;
    chartsHTML += '</div>';

    // System Status
    chartsHTML += '<div style="background: rgba(255,255,255,0.1); padding: 1rem; border-radius: 6px;">';
    chartsHTML += '<div style="font-weight: 600; margin-bottom: 0.5rem;">System Status</div>';
    chartsHTML += `
      <div style="display: flex; flex-direction: column; gap: 0.5rem;">
        <div style="display: flex; justify-content: space-between; font-size: 0.875rem;">
          <span>PDFs Processed</span>
          <span style="font-weight: 600;">${stats.pdfs?.total || 0}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 0.875rem;">
          <span>FIFO Tracking</span>
          <span style="font-weight: 600;">${stats.fifo?.totalCases > 0 ? stats.fifo.totalCases + ' cases' : stats.fifo?.invoicesReady > 0 ? stats.fifo.invoicesReady + ' ready' : 'Not enabled'}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 0.875rem;">
          <span>Inventory Items</span>
          <span style="font-weight: 600;">${stats.inventory?.totalItems || 0}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 0.875rem;">
          <span>Total Value</span>
          <span style="font-weight: 600;">$${((stats.pdfs?.totalAmount || 0) / 1000).toFixed(1)}K</span>
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

    let html = '<div style="max-height: 400px; overflow-y: auto; font-size: 0.875rem;">';
    activities.forEach(activity => {
      const timestamp = new Date(activity.timestamp);
      const ageText = formatTimeAgo(timestamp);

      html += `
        <div style="display: flex; gap: 0.75rem; padding: 0.75rem; border-bottom: 1px solid var(--border);">
          <div style="font-size: 1.5rem;">${activity.icon}</div>
          <div style="flex: 1;">
            <div style="font-weight: 500;">${activity.event}</div>
            <div style="color: var(--text-light); font-size: 0.8125rem; margin-top: 0.125rem;">
              ${activity.description} • ${ageText}
            </div>
            ${activity.badge ? `<div class="badge badge-${activity.badge}" style="margin-top: 0.25rem;">Active</div>` : ''}
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
      insightsEl.innerHTML = '<div class="empty-state" style="padding: 2rem;"><div>No learning insights yet</div></div>';
      return;
    }

    let html = '<table class="table"><thead><tr>';
    html += '<th>Type</th><th>Title</th><th>Confidence</th><th>Status</th><th>Detected</th>';
    html += '</tr></thead><tbody>';

    data.insights.forEach(insight => {
      const statusBadge = insight.status === 'applied' ?
        '<span class="badge badge-success">Applied</span>' :
        '<span class="badge badge-warning">Pending</span>';

      const confidenceColor = insight.confidence >= 85 ? 'var(--success)' : (insight.confidence >= 70 ? 'var(--warning)' : 'var(--danger)');

      html += `
        <tr>
          <td>${insight.type}</td>
          <td>${insight.title || insight.description || 'N/A'}</td>
          <td><strong style="color: ${confidenceColor};">${insight.confidence}%</strong></td>
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
      <div style="margin-top: 0.5rem; font-size: 0.875rem;">
        Context: ${context} | <a href="#" onclick="location.reload()" style="color: inherit; text-decoration: underline;">Reload page</a>
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
      listEl.innerHTML = '<tr><td colspan="5" class="empty-state" style="padding: 2rem;">No unassigned items found</td></tr>';
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
          <td><code style="background: var(--bg); padding: 0.25rem 0.5rem; border-radius: 4px;">${item.item_code}</code></td>
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
    html += `<span style="margin: 0 1rem;">Page ${page} of ${totalPages}</span>`;
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
  modal.style.display = 'flex';
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
        <div class="card" style="margin-top: 1rem;">
          <div class="card-header">
            <h4>Items (${workspace.items.length})</h4>
          </div>
          <div style="max-height: 400px; overflow-y: auto;">
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
        <div class="alert alert-info" style="margin-top: 1rem;">
          No items in this workspace yet. Items can be added during the count process.
        </div>
      `;
    }

    // Show invoices if available
    if (workspace.invoices && workspace.invoices.length > 0) {
      html += `
        <div class="card" style="margin-top: 1rem;">
          <div class="card-header">
            <h4>Attached Invoices (${workspace.invoices.length})</h4>
          </div>
          <div style="max-height: 300px; overflow-y: auto;">
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
      <div class="card" style="margin-top: 1rem;">
        <div class="card-header">
          <h4>📎 Attach Data to Workspace</h4>
        </div>
        <div class="card-body">
          <div class="grid grid-3" style="gap: 1rem;">

            <!-- Attach Inventory Count -->
            <div>
              <h5 style="margin-bottom: 0.5rem;">📊 Inventory Count</h5>
              <button type="button" class="btn btn-primary btn-sm" onclick="openAttachCountModal('${workspaceId}')" style="width: 100%;">
                Attach Existing Count
              </button>
            </div>

            <!-- Attach GFS PDFs -->
            <div>
              <h5 style="margin-bottom: 0.5rem;">📄 GFS Orders</h5>
              <button type="button" class="btn btn-primary btn-sm" onclick="openAttachPDFsModal('${workspaceId}')" style="width: 100%;">
                Attach PDFs
              </button>
            </div>

            <!-- Upload File -->
            <div>
              <h5 style="margin-bottom: 0.5rem;">📤 Upload File</h5>
              <button type="button" class="btn btn-success btn-sm" onclick="openUploadFileModal('${workspaceId}')" style="width: 100%;">
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
      usageBtn.style.display = 'inline-block';
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
    modal.style.display = 'none';
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
        <div style="max-height: 400px; overflow-y: auto;">
          <table class="table">
            <thead>
              <tr>
                <th style="width: 40px;"></th>
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
        <div style="margin-top: 1rem; text-align: right;">
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
        <div style="max-height: 400px; overflow-y: auto;">
          <table class="table">
            <thead>
              <tr>
                <th style="width: 40px;"><input type="checkbox" id="selectAllPDFs" onchange="toggleSelectAllPDFs()" /></th>
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
        <div style="margin-top: 1rem; text-align: right;">
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
            <small style="color: var(--text-light); font-size: 0.75rem;">Accepted formats: PDF, XLSX, XLS</small>
          </div>
          <div class="form-group">
            <label class="form-label">Notes (optional)</label>
            <textarea class="textarea" id="workspaceFileNotes" placeholder="Add any notes about this file..."></textarea>
          </div>
        </form>
      </div>
      <div style="margin-top: 1rem; text-align: right; padding: 0 1rem 1rem;">
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

