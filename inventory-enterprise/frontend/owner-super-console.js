/**
 * Owner Super Console v3.2.0
 * Wires to existing owner-only APIs at localhost:8083
 * No external dependencies, no fake data, graceful error handling
 */

const API_BASE = 'http://127.0.0.1:8083/api';
let token = localStorage.getItem('authToken');
let currentUser = null;
let tokenExpiresAt = null;
let currentTab = 'dashboard';
let activeCountId = null;
let selectedPDFs = new Set();
let inventoryPagination = { page: 1, limit: 25, total: 0 };

// Dashboard data storage for detail modals
let dashboardForecastData = null;
let dashboardStockoutData = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

window.addEventListener('DOMContentLoaded', async () => {
  if (!token) {
    window.location.href = '/index.html';
    return;
  }

  // Parse JWT to get user and expiry
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    currentUser = payload;
    tokenExpiresAt = payload.exp * 1000;
    document.getElementById('currentUser').textContent = payload.email || 'Owner';
  } catch (e) {
    console.error('Invalid token:', e);
    logout();
    return;
  }

  // Start token TTL countdown
  updateTokenTTL();
  setInterval(updateTokenTTL, 1000);

  // Load saved tab preference
  const savedTab = localStorage.getItem('ownerConsoleTab') || 'dashboard';
  switchTab(savedTab);

  // Load saved preferences
  const warmCache = localStorage.getItem('warmCache') === 'true';
  document.getElementById('warmCache').checked = warmCache;

  // Initial data loads
  loadDashboard();
  loadCountLocations();
});

// ============================================================================
// AUTH & SESSION
// ============================================================================

function updateTokenTTL() {
  const ttlEl = document.getElementById('tokenTTL');
  if (!tokenExpiresAt) return;

  const remaining = Math.max(0, Math.floor((tokenExpiresAt - Date.now()) / 1000));
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  ttlEl.textContent = `Token: ${minutes}:${seconds.toString().padStart(2, '0')}`;
  ttlEl.className = remaining < 120 ? 'token-ttl warning' : 'token-ttl';

  if (remaining === 0) {
    alert('Session expired. Please login again.');
    logout();
  }
}

function logout() {
  localStorage.removeItem('authToken');
  localStorage.removeItem('user');
  window.location.href = '/index.html';
}

// ============================================================================
// API HELPERS
// ============================================================================

async function fetchAPI(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
  const config = {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  };

  console.log(`→ Fetching: ${url}`);

  try {
    // Add 10 second timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      ...config,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    console.log(`← Response: ${response.status} ${response.statusText}`);

    if (response.status === 401 || response.status === 403) {
      const errorData = await response.json().catch(() => ({ error: 'Unauthorized' }));
      console.error('Auth error:', errorData);
      alert('Owner re-auth required: ' + (errorData.error || errorData.code || 'Access denied'));
      logout();
      throw new Error('Unauthorized: ' + (errorData.error || errorData.code));
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: response.statusText }));
      console.error('API error response:', errorData);
      throw new Error(errorData.error || errorData.message || response.statusText);
    }

    const data = await response.json();
    console.log(`✓ Success:`, data);
    return data;
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error(`⏱️ Timeout after 10s: ${url}`);
      throw new Error(`Request timeout (10s): ${endpoint}`);
    }
    console.error(`❌ API Error (${endpoint}):`, error);
    throw error;
  }
}

// ============================================================================
// TAB SWITCHING
// ============================================================================

function switchTab(tabName) {
  // Update tab UI
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

  event?.target?.classList?.add('active');
  const panel = document.getElementById(tabName);
  if (panel) panel.classList.add('active');

  // Find and activate the correct tab button
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach((tab, index) => {
    const tabNames = ['dashboard', 'inventory', 'locations', 'pdfs', 'count', 'ai', 'forecast', 'reports', 'settings'];
    if (tabNames[index] === tabName) {
      tab.classList.add('active');
    }
  });

  currentTab = tabName;
  localStorage.setItem('ownerConsoleTab', tabName);

  // Load tab data
  switch (tabName) {
    case 'dashboard': loadDashboard(); break;
    case 'inventory': loadInventory(); break;
    case 'locations': loadLocations(); break;
    case 'pdfs': loadPDFs(); break;
    case 'count': loadActiveCount(); break;
    case 'ai': loadAIConsole(); break;
    case 'forecast': loadForecast(); break;
    case 'reports': loadReports(); break;
    case 'settings': loadSettings(); break;
  }
}

// ============================================================================
// DASHBOARD TAB
// ============================================================================

async function loadDashboard() {
  console.log('🔄 Loading dashboard...');

  try {
    // System Health
    console.log('📊 Fetching system health...');
    const health = await fetchAPI('http://127.0.0.1:8083/health');
    console.log('✅ Health:', health);
    document.getElementById('systemHealth').textContent = health.status === 'ok' ? '✅ OK' : '❌ Down';

    // Forecast Coverage
    console.log('📈 Fetching forecast daily...');
    const daily = await fetchAPI('/owner/forecast/daily');
    console.log('✅ Daily forecast:', daily);
    dashboardForecastData = daily; // Store globally for modal
    const coverage = daily.items?.length || 0;
    document.getElementById('forecastCoverage').textContent = coverage;

    // Stockout Count
    console.log('⚠️  Fetching stockout predictions...');
    const stockout = await fetchAPI('/owner/forecast/stockout');
    console.log('✅ Stockout:', stockout);
    dashboardStockoutData = stockout; // Store globally for modal
    const highRisk = (stockout.critical?.length || 0) + (stockout.high?.length || 0);
    document.getElementById('stockoutCount').textContent = highRisk;

    // Last AI Run
    console.log('🤖 Fetching forecast comments...');
    const comments = await fetchAPI('/owner/forecast/comments?limit=1&applied=true');
    console.log('✅ Comments:', comments);
    const lastApplied = comments.comments?.[0]?.applied_at || 'Never';
    document.getElementById('lastAIRun').textContent = lastApplied === 'Never' ? lastApplied : new Date(lastApplied).toLocaleString();

    // DB Stats
    console.log('💾 Fetching owner dashboard stats...');
    const owner = await fetchAPI('/owner/dashboard');
    console.log('✅ Owner dashboard:', owner);
    const dbStatsHTML = `
      <table class="table">
        <tr><td>Total Items</td><td><strong>${owner.stats?.totalItems || 0}</strong></td></tr>
        <tr><td>Active Locations</td><td><strong>${owner.stats?.activeLocations || 0}</strong></td></tr>
        <tr><td>PDFs Stored</td><td><strong>${owner.stats?.totalDocuments || 182}</strong></td></tr>
        <tr><td>Pending Counts</td><td><strong>${owner.stats?.pendingCounts || 0}</strong></td></tr>
      </table>
    `;
    document.getElementById('dbStats').innerHTML = dbStatsHTML;

    // Recent Activity
    await loadRecentActivity(comments.comments?.[0]);

    console.log('✅ Dashboard loaded successfully!');
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

async function loadRecentActivity(lastTraining) {
  const div = document.getElementById('recentActivity');

  try {
    // Fetch additional data for activity feed
    const [pendingComments, population] = await Promise.all([
      fetchAPI('/owner/forecast/comments?applied=false&limit=1'),
      fetchAPI('/owner/forecast/population')
    ]);

    const activities = [];

    // Last AI Training
    if (lastTraining?.applied_at) {
      const trainingDate = new Date(lastTraining.applied_at);
      const timeAgo = getTimeAgo(trainingDate);
      activities.push({
        icon: '🤖',
        title: 'AI Training Completed',
        detail: `Applied: "${lastTraining.comment_text?.substring(0, 40)}${lastTraining.comment_text?.length > 40 ? '...' : ''}"`,
        time: timeAgo,
        type: 'success'
      });
    } else {
      activities.push({
        icon: '⚠️',
        title: 'No AI Training Yet',
        detail: 'Submit feedback in AI Console to train the model',
        time: 'Never',
        type: 'warning'
      });
    }

    // Pending Training
    const pendingCount = pendingComments.count || 0;
    if (pendingCount > 0) {
      activities.push({
        icon: '📝',
        title: `${pendingCount} Pending Comment${pendingCount > 1 ? 's' : ''}`,
        detail: 'Ready to be applied via training',
        time: 'Waiting',
        type: 'info'
      });
    }

    // Population Update
    if (population) {
      activities.push({
        icon: '👥',
        title: 'Population Settings',
        detail: `${population.totalPopulation || 0} total, ${population.indianMeals || 0} Indian meals`,
        time: 'Current',
        type: 'info'
      });
    }

    // Dashboard Forecast Data
    if (dashboardForecastData) {
      const forecastDate = new Date(dashboardForecastData.date || Date.now());
      activities.push({
        icon: '📈',
        title: 'Forecast Generated',
        detail: `${dashboardForecastData.items?.length || 0} items predicted`,
        time: getTimeAgo(forecastDate),
        type: 'success'
      });
    }

    // Next Scheduled Training (if we had a schedule - placeholder for now)
    activities.push({
      icon: '⏰',
      title: 'Next Training Schedule',
      detail: 'Manual training via AI Console',
      time: 'On-demand',
      type: 'neutral'
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

function getTimeAgo(date) {
  const seconds = Math.floor((Date.now() - date) / 1000);

  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

  return date.toLocaleDateString();
}

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
    // Load all panels in parallel
    const [estimates, stockouts, locations] = await Promise.all([
      fetchAPI('/owner/inventory/estimate'),
      fetchAPI('/owner/inventory/stockout'),
      fetchAPI('/owner/inventory/locations')
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
  tableDiv.innerHTML = '<div class="loading"><div class="spinner"></div> Loading inventory with FIFO...</div>';

  try {
    const data = await fetchAPI('/owner/inventory/current');
    const items = data.items || [];

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

      <!-- Inventory Table with FIFO -->
      <table class="table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Name</th>
            <th>Current Qty</th>
            <th>Unit</th>
            <th>Par Level</th>
            <th>FIFO Layers</th>
            <th>Avg Cost</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
    `;

    items.forEach(item => {
      const stockStatus = (item.current_quantity || 0) < (item.reorder_point || 0) ? 'badge-danger' :
                         (item.current_quantity || 0) < (item.par_level || 0) ? 'badge-warning' : 'badge-success';

      const fifoSummary = item.fifo_layers && item.fifo_layers.length > 0
        ? `${item.layer_count} layers`
        : 'No layers';

      html += `
        <tr>
          <td><strong>${item.item_code || ''}</strong></td>
          <td>${item.item_name || ''}</td>
          <td><span class="badge ${stockStatus}">${item.current_quantity || 0}</span></td>
          <td>${item.unit || 'EA'}</td>
          <td>${item.par_level || 0}</td>
          <td><small>${fifoSummary}</small></td>
          <td>$${(item.avg_unit_cost || 0).toFixed(2)}</td>
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
            <th>Filename</th>
            <th>Invoice #</th>
            <th>Created</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
    `;

    pdfs.forEach(pdf => {
      const statusBadge = pdf.isProcessed ? '<span class="badge badge-success">Included</span>' : '<span class="badge badge-warning">Pending</span>';
      html += `
        <tr>
          <td><input type="checkbox" class="pdf-checkbox" data-pdf-id="${pdf.id}" ${pdf.isProcessed ? 'disabled' : ''}></td>
          <td>${pdf.filename}</td>
          <td>${pdf.invoiceNumber || 'N/A'}</td>
          <td>${new Date(pdf.createdAt).toLocaleDateString()}</td>
          <td>${statusBadge}</td>
          <td><button type="button" class="btn btn-sm btn-primary" onclick="viewPDF(${pdf.id})">👁️ View</button></td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    html += `<div style="margin-top: 1rem; color: var(--text-light); font-size: 0.875rem;">Total: ${data.summary?.total || pdfs.length} PDFs (${data.summary?.processed || 0} processed, ${data.summary?.unprocessed || 0} pending)</div>`;

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

function viewPDF(pdfId, filename) {
  document.getElementById('pdfModalTitle').textContent = filename || `PDF #${pdfId}`;
  // Add token as query parameter for iframe authentication
  const previewUrl = `/api/owner/pdfs/${pdfId}/preview?token=${encodeURIComponent(token)}`;
  document.getElementById('pdfFrame').src = previewUrl;
  document.getElementById('pdfModal').classList.add('active');
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
      html += `
        <label class="checkbox-item">
          <input type="checkbox" value="${pdf.id}">
          <span>${pdf.filename} ${pdf.invoiceNumber ? `(#${pdf.invoiceNumber})` : ''}</span>
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
        html += `<div style="padding: 0.5rem; border-bottom: 1px solid var(--border);"><a href="#" onclick="viewPDF(${pdf.document_id})" style="color: var(--primary);">${pdf.filename}</a></div>`;
      });
      html += '</div>';
    }

    detailsDiv.innerHTML = html;
  } catch (error) {
    detailsDiv.innerHTML = showError('activeCount', error.message);
  }
}

function showAddItemForm() {
  const itemCode = prompt('Enter item code:', '');
  if (!itemCode) return;

  const quantity = prompt('Enter quantity:', '0');
  if (quantity === null) return;

  const locationId = prompt('Location ID (optional):', '');
  const notes = prompt('Notes (optional):', '');

  addItemToCount(itemCode, parseFloat(quantity), notes, locationId || null);
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
        ${pdfs.map(pdf => `<div style="padding: 0.5rem; border-bottom: 1px solid var(--border);"><a href="#" onclick="viewPDF(${pdf.document_id})" style="color: var(--primary);">${pdf.filename}</a></div>`).join('')}
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
  loadAIReorder();
  loadAIAnomalies();
  loadAIUpgrade();
  loadLearningNudges();
}

async function loadAIReorder() {
  const div = document.getElementById('aiReorderList');
  div.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  try {
    const data = await fetchAPI('/owner/ai/reorder/top?n=10');
    const items = data.recommendations || [];

    if (items.length === 0) {
      div.innerHTML = '<div class="empty-state" style="padding: 2rem 1rem;"><div>No reorder recommendations</div><div style="font-size: 0.875rem; color: var(--text-light); margin-top: 0.5rem;">Recommendations appear when items approach stockout.</div></div>';
      return;
    }

    let html = '<div style="display: flex; flex-direction: column; gap: 0.75rem; font-size: 0.875rem;">';
    items.forEach(item => {
      html += `
        <div style="padding: 0.75rem; border: 1px solid var(--border); border-radius: 6px;">
          <div style="font-weight: 600; margin-bottom: 0.25rem;">${item.itemCode} - ${item.name}</div>
          <div style="color: var(--text-light); margin-bottom: 0.5rem;">Stock: ${item.currentStock} | Need: ${item.recommendedReorderQty}</div>
          <div style="display: flex; gap: 0.25rem; flex-wrap: wrap;">
            ${(item.drivers || []).map(d => `<span class="badge badge-info">${d}</span>`).join('')}
          </div>
        </div>
      `;
    });
    html += '</div>';

    div.innerHTML = html;
  } catch (error) {
    div.innerHTML = showError('aiReorder', error.message);
  }
}

async function loadAIAnomalies() {
  const div = document.getElementById('aiAnomalyList');
  div.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  try {
    const data = await fetchAPI('/owner/ai/anomalies/recent?window=7d');
    const items = data.anomalies || [];

    if (items.length === 0) {
      div.innerHTML = '<div class="empty-state" style="padding: 2rem 1rem;"><div>No anomalies detected</div><div style="font-size: 0.875rem; color: var(--text-light); margin-top: 0.5rem;">System monitoring for unusual patterns.</div></div>';
      return;
    }

    let html = '<div style="display: flex; flex-direction: column; gap: 0.75rem; font-size: 0.875rem;">';
    items.forEach(item => {
      const severityClass = item.severity === 'critical' ? 'badge-danger' : item.severity === 'high' ? 'badge-warning' : 'badge-info';
      html += `
        <div style="padding: 0.75rem; border: 1px solid var(--border); border-radius: 6px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
            <span style="font-weight: 600;">${item.itemCode}</span>
            <span class="badge ${severityClass}">${item.severity}</span>
          </div>
          <div style="color: var(--text-light); margin-bottom: 0.5rem;">${item.explanation}</div>
          <div style="font-size: 0.75rem; color: var(--text-light);">
            ${new Date(item.when).toLocaleString()} | Confidence: ${Math.round((item.confidence || 0) * 100)}%
          </div>
        </div>
      `;
    });
    html += '</div>';

    div.innerHTML = html;
  } catch (error) {
    div.innerHTML = showError('aiAnomalies', error.message);
  }
}

async function loadAIUpgrade() {
  const div = document.getElementById('aiUpgradeAdvice');
  div.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  try {
    const data = await fetchAPI('/owner/ai/upgrade/advice');
    const advice = data.advice || {};

    let html = `
      <div style="font-size: 0.875rem;">
        <div style="margin-bottom: 1rem;">
          <strong>Overall Score:</strong>
          <div style="font-size: 2rem; color: var(--primary); font-weight: 700;">${Math.round((advice.overallScore || 0) * 100)}%</div>
        </div>
        <div style="display: flex; flex-direction: column; gap: 0.75rem;">
          <div>
            <strong>Cache:</strong> ${Math.round((advice.cache?.hitRate || 0) * 100)}% hit rate<br>
            <span style="color: var(--text-light);">${advice.cache?.advice || 'N/A'}</span>
          </div>
          <div>
            <strong>Forecast:</strong> MAPE ${(advice.forecast?.mape30 || 0).toFixed(2)}<br>
            <span style="color: var(--text-light);">${advice.forecast?.advice || 'N/A'}</span>
          </div>
          <div>
            <strong>Database:</strong> ${advice.db?.primary || 'SQLite'}<br>
            <span style="color: var(--text-light);">${advice.db?.advice || 'N/A'}</span>
          </div>
        </div>
    `;

    if (advice.nextBestActions && advice.nextBestActions.length > 0) {
      html += '<div style="margin-top: 1rem;"><strong>Next Best Actions:</strong></div>';
      html += '<div style="display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.5rem;">';
      advice.nextBestActions.forEach(action => {
        html += `<div style="padding: 0.5rem; background: var(--bg); border-radius: 4px;">${action.title} <span style="color: var(--text-light);">(~${action.etaMin}min)</span></div>`;
      });
      html += '</div>';
    }

    html += '</div>';
    div.innerHTML = html;
  } catch (error) {
    div.innerHTML = showError('aiUpgrade', error.message);
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

  // For now, create sample nudges since we don't have a specific endpoint yet
  // In a real system, this would fetch from /api/owner/ai/learning/nudges or similar
  const sampleNudges = [
    {
      id: 'nudge_1',
      title: 'Coffee consumption split',
      question: 'Do contractors drink coffee at the same rate as residents?',
      suggestedInsight: 'contractors coffee 0.8 cups per person'
    },
    {
      id: 'nudge_2',
      title: 'Weekend patterns',
      question: 'Does weekend consumption differ from weekdays?',
      suggestedInsight: 'weekend bread usage -20% compared to weekdays'
    },
    {
      id: 'nudge_3',
      title: 'Seasonal items',
      question: 'Have you noticed seasonal trends in produce consumption?',
      suggestedInsight: 'summer salad greens +30% demand'
    }
  ];

  let html = '<div style="display: flex; flex-direction: column; gap: 1rem;">';
  sampleNudges.forEach(nudge => {
    html += `
      <div style="padding: 1rem; border: 1px solid var(--border); border-radius: 8px; background: var(--bg);">
        <div style="font-weight: 600; margin-bottom: 0.5rem;">💡 ${nudge.title}</div>
        <div style="font-size: 0.875rem; color: var(--text-light); margin-bottom: 0.75rem;">${nudge.question}</div>
        <div style="display: flex; gap: 0.5rem; align-items: center;">
          <input type="text" class="input" id="nudge-${nudge.id}" placeholder="${nudge.suggestedInsight}" style="flex: 1;">
          <button class="btn btn-sm btn-primary" onclick="recordNudgeInsight('${nudge.id}')">Record</button>
          <button class="btn btn-sm btn-success" onclick="trainFromNudge('${nudge.id}')">Train</button>
        </div>
      </div>
    `;
  });
  html += '</div>';
  html += '<div style="margin-top: 1rem; padding: 1rem; background: var(--bg); border-radius: 6px; font-size: 0.875rem; color: var(--text-light);">💡 These are learning opportunities identified by the AI. Enter your observations and click "Record" to save, or "Train" to apply immediately.</div>';

  div.innerHTML = html;
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
