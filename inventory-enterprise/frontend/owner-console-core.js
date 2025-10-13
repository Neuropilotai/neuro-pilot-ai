/**
 * Owner Console Core v14.3.0
 * Shared JavaScript module for owner-console.html and owner-super-console.html
 *
 * PURPOSE: Single source of truth for all console logic
 * PREVENTS: Feature drift between consoles
 * DATA SOURCE: /api/owner/dashboard (unified endpoint)
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

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

  // Initial data loads
  loadDashboard();
  loadCountLocations();

  // Auto-refresh AI Ops status every 15 seconds
  setInterval(() => {
    if (currentTab === 'ai' || currentTab === 'dashboard') {
      loadAIOpsStatus();
      loadCognitiveIntelligence();
      loadActivityFeed();
    }
  }, 15000);
});

// ============================================================================
// AUTH & SESSION
// ============================================================================

function updateTokenTTL() {
  const ttlEl = document.getElementById('tokenTTL');
  if (!tokenExpiresAt || !ttlEl) return;

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
// UTILITY FUNCTIONS
// ============================================================================

function getTimeAgo(date) {
  const seconds = Math.floor((Date.now() - date) / 1000);

  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

  return date.toLocaleDateString();
}

function formatTimeAgo(date) {
  if (!date) return 'Never';
  const d = new Date(date);
  const seconds = Math.floor((Date.now() - d) / 1000);

  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return d.toLocaleDateString();
}

function showError(context, message) {
  return `
    <div class="alert alert-danger">
      <strong>Error in ${context}:</strong><br>
      ${message}
      <br><br>
      <button type="button" class="btn btn-sm btn-primary" onclick="location.reload()">Reload Page</button>
    </div>
  `;
}

// ============================================================================
// TAB SWITCHING
// ============================================================================

function switchTab(tabName) {
  // Update tab UI
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

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

  // Load tab data (with safe function checks)
  switch (tabName) {
    case 'dashboard':
      loadDashboard();
      break;
    case 'inventory':
      if (typeof loadInventory === 'function') loadInventory();
      break;
    case 'locations':
      if (typeof loadLocations === 'function') loadLocations();
      break;
    case 'pdfs':
      if (typeof loadPDFs === 'function') loadPDFs();
      break;
    case 'count':
      if (typeof loadActiveCount === 'function') loadActiveCount();
      break;
    case 'playground':
      if (typeof loadPlayground === 'function') loadPlayground();
      break;
    case 'ai':
      if (typeof loadAIConsole === 'function') loadAIConsole();
      break;
    case 'forecast':
      if (typeof loadForecast === 'function') loadForecast();
      break;
    case 'reports':
      if (typeof loadReports === 'function') loadReports();
      break;
    case 'settings':
      if (typeof loadSettings === 'function') loadSettings();
      break;
  }
}

// ============================================================================
// DASHBOARD TAB - v14.3 UNIFIED
// ============================================================================

async function loadDashboard() {
  console.log('🔄 Loading dashboard from /api/owner/dashboard...');

  try {
    // v14.3: Single source of truth endpoint
    const response = await fetchAPI('/owner/dashboard');
    console.log('✅ Dashboard data:', response);

    // Render all dashboard components
    renderSystemStatus(response.health);
    renderAIOpsHealth(response.ai_ops_health);
    renderAIModules(response.aiModules);
    renderDBMetrics(response.dbStats);
    renderAuditLogs(response.auditLogs);
    renderVersionInfo(response.versionInfo);
    renderLearningInsights(response.learningInsights);

    // Load additional dashboard widgets
    loadCognitiveIntelligence();
    loadActivityFeed();

    console.log('✅ Dashboard loaded successfully from unified endpoint!');
  } catch (error) {
    console.error('❌ Dashboard load error:', error);
    alert('Dashboard load failed: ' + error.message);

    // Show error on page
    const errorHtml = showError('dashboard', error.message);
    const dashboardEl = document.getElementById('dashboard');
    if (dashboardEl) {
      dashboardEl.innerHTML = errorHtml;
    }
  }
}

// ============================================================================
// DASHBOARD RENDERERS
// ============================================================================

function renderSystemStatus(health) {
  const statusEl = document.getElementById('systemHealth');
  if (!statusEl) return;

  if (health && health.status === 'OK') {
    statusEl.textContent = '✅ OK';
    statusEl.style.color = 'var(--success)';
  } else {
    statusEl.textContent = '❌ Down';
    statusEl.style.color = 'var(--danger)';
  }
}

function renderAIOpsHealth(aiOpsHealth) {
  if (!aiOpsHealth) return;

  // Render AI Ops health score
  const healthScoreEl = document.getElementById('opsHealthScore');
  if (healthScoreEl) {
    healthScoreEl.textContent = aiOpsHealth.health_score || '--';
  }

  const dqiEl = document.getElementById('opsDQIScore');
  if (dqiEl) {
    dqiEl.textContent = aiOpsHealth.data_quality_index || '--';
  }

  const latencyEl = document.getElementById('opsForecastLatency');
  if (latencyEl) {
    latencyEl.textContent = aiOpsHealth.forecast_latency || '--';
  }

  const divergenceEl = document.getElementById('opsLearningDivergence');
  if (divergenceEl) {
    divergenceEl.textContent = aiOpsHealth.learning_divergence || '--';
  }
}

function renderAIModules(aiModules) {
  if (!aiModules || !Array.isArray(aiModules)) return;

  const activeCount = aiModules.filter(m => m.status === 'active').length;
  const activeModulesEl = document.getElementById('activeModulesCount');
  if (activeModulesEl) {
    activeModulesEl.textContent = activeCount;
  }
}

function renderDBMetrics(dbStats) {
  const dbStatsEl = document.getElementById('dbStats');
  if (!dbStatsEl || !dbStats) return;

  const html = `
    <table class="table">
      <tr>
        <td>Total Items</td>
        <td><strong>${dbStats.totalItems || 0}</strong></td>
      </tr>
      <tr>
        <td>Active Locations</td>
        <td><strong>${dbStats.activeLocations || 0}</strong></td>
      </tr>
      <tr>
        <td>Total Invoices</td>
        <td><strong>${dbStats.totalInvoices || 0}</strong></td>
      </tr>
      <tr>
        <td>Active Counts</td>
        <td><strong>${dbStats.activeCounts || 0}</strong></td>
      </tr>
    </table>
  `;
  dbStatsEl.innerHTML = html;
}

function renderAuditLogs(auditLogs) {
  const auditEl = document.getElementById('recentActivity');
  if (!auditEl || !auditLogs || !Array.isArray(auditLogs)) return;

  if (auditLogs.length === 0) {
    auditEl.innerHTML = '<div class="empty-state">No recent activity</div>';
    return;
  }

  let html = '<div style="display: flex; flex-direction: column; gap: 0.75rem;">';

  auditLogs.slice(0, 5).forEach(log => {
    html += `
      <div style="padding: 0.75rem; border-left: 3px solid var(--primary); background: var(--bg); border-radius: 4px;">
        <div style="font-weight: 600; font-size: 0.875rem;">${log.action || 'Activity'}</div>
        <div style="font-size: 0.8125rem; color: var(--text-light);">${log.details || ''}</div>
        <div style="font-size: 0.75rem; color: var(--text-light); margin-top: 0.25rem;">
          ${formatTimeAgo(log.created_at)}
        </div>
      </div>
    `;
  });

  html += '</div>';
  auditEl.innerHTML = html;
}

function renderVersionInfo(versionInfo) {
  if (!versionInfo) return;

  // Update version display if element exists
  const versionEl = document.getElementById('systemVersion');
  if (versionEl) {
    versionEl.textContent = versionInfo.version || 'v14.3.0';
  }
}

function renderLearningInsights(learningInsights) {
  if (!learningInsights || !Array.isArray(learningInsights)) return;

  const appliedCount = learningInsights.filter(i => i.applied).length;
  const learningEl = document.getElementById('learningAppliedCount');
  if (learningEl) {
    learningEl.textContent = appliedCount;
  }
}

// ============================================================================
// AI OPS STATUS - v13.5 ADAPTIVE
// ============================================================================

async function loadAIOpsStatus() {
  console.log('🔄 Loading AI Ops Status...');

  try {
    const data = await fetchAPI('/owner/ai-ops/status');

    // Render health grid
    renderAIOpsHealth(data);

    // Render checks
    const checksEl = document.getElementById('aiOpsChecks');
    if (checksEl && data.checks) {
      let html = '<div style="display: grid; gap: 0.5rem; font-size: 0.875rem;">';

      data.checks.forEach(check => {
        const statusIcon = check.status === 'OK' ? '✅' : check.status === 'WARNING' ? '⚠️' : '❌';
        const statusColor = check.status === 'OK' ? 'var(--success)' : check.status === 'WARNING' ? 'var(--warning)' : 'var(--danger)';

        html += `
          <div style="padding: 0.5rem; border-left: 3px solid ${statusColor}; background: var(--bg); border-radius: 4px;">
            ${statusIcon} <strong>${check.name}</strong>: ${check.message}
          </div>
        `;
      });

      html += '</div>';
      checksEl.innerHTML = html;
    }

    console.log('✅ AI Ops Status loaded');
  } catch (error) {
    console.error('❌ AI Ops Status error:', error);
    const checksEl = document.getElementById('aiOpsChecks');
    if (checksEl) {
      checksEl.innerHTML = showError('AI Ops', error.message);
    }
  }
}

// ============================================================================
// COGNITIVE INTELLIGENCE
// ============================================================================

async function loadCognitiveIntelligence() {
  console.log('🔄 Loading Cognitive Intelligence...');

  try {
    // v14.4: Fetch from dashboard to get AI Intelligence Index
    const dashboardData = await fetchAPI('/owner/dashboard');
    const data = dashboardData.data || {};
    const aiIntelligenceIndex = data.ai_intelligence_index || {};

    // v14.4: Update AI Intelligence Index (featured display)
    const indexEl = document.getElementById('aiIntelligenceIndex');
    if (indexEl) {
      const index = aiIntelligenceIndex.intelligence_index;
      if (index !== null && index !== undefined) {
        indexEl.textContent = index;
        // Color code based on score
        if (index >= 85) {
          indexEl.style.color = '#10b981'; // Green
        } else if (index >= 70) {
          indexEl.style.color = '#f59e0b'; // Yellow
        } else {
          indexEl.style.color = '#ef4444'; // Red
        }
      } else {
        indexEl.textContent = '--';
        indexEl.style.color = '#9ca3af'; // Gray
      }
    }

    // Update trend display
    const trendEl = document.getElementById('aiIndexTrend');
    if (trendEl && aiIntelligenceIndex.trend_pct !== null) {
      const trend = aiIntelligenceIndex.trend_pct;
      const arrow = trend > 0 ? '↑' : trend < 0 ? '↓' : '→';
      const trendColor = trend > 0 ? '#10b981' : trend < 0 ? '#ef4444' : '#9ca3af';
      trendEl.innerHTML = `<span style="color: ${trendColor}">${arrow} ${Math.abs(trend).toFixed(1)}% vs last week</span>`;
    } else if (trendEl) {
      trendEl.textContent = 'No trend data';
    }

    // Try to fetch cognitive data from legacy endpoint (fallback)
    try {
      const cognitiveData = await fetchAPI('/owner/ai/cognitive');

      // Update cognitive metrics
      const avgConfidence = document.getElementById('aiConfidenceAvg');
      if (avgConfidence) {
        avgConfidence.textContent = `${Math.round((cognitiveData.avgConfidence || 0) * 100)}%`;
      }

      const forecastAccuracy = document.getElementById('forecastAccuracyAvg');
      if (forecastAccuracy) {
        forecastAccuracy.textContent = `${Math.round((cognitiveData.forecastAccuracy || 0) * 100)}%`;
      }
    } catch (cogErr) {
      console.debug('Legacy cognitive endpoint not available:', cogErr.message);
    }

    console.log('✅ Cognitive Intelligence loaded (with AI Intelligence Index)');
  } catch (error) {
    console.error('❌ Cognitive Intelligence error:', error);
  }
}

// ============================================================================
// ACTIVITY FEED
// ============================================================================

async function loadActivityFeed() {
  console.log('🔄 Loading Activity Feed...');

  try {
    const data = await fetchAPI('/owner/ai/activity');
    const feedEl = document.getElementById('activityFeed');
    if (!feedEl) return;

    if (!data.activities || data.activities.length === 0) {
      feedEl.innerHTML = '<div class="empty-state">No recent AI activity</div>';
      return;
    }

    let html = '<div style="display: flex; flex-direction: column; gap: 0.75rem;">';

    data.activities.slice(0, 10).forEach(activity => {
      const typeColor = activity.type === 'forecast' ? 'var(--primary)' :
                       activity.type === 'learning' ? 'var(--success)' :
                       activity.type === 'alert' ? 'var(--warning)' : 'var(--border)';

      html += `
        <div style="padding: 0.75rem; border-left: 3px solid ${typeColor}; background: var(--bg); border-radius: 4px;">
          <div style="font-weight: 600; font-size: 0.875rem;">${activity.title}</div>
          <div style="font-size: 0.8125rem; color: var(--text-light);">${activity.message}</div>
          <div style="font-size: 0.75rem; color: var(--text-light); margin-top: 0.25rem;">
            ${formatTimeAgo(activity.created_at)}
          </div>
        </div>
      `;
    });

    html += '</div>';
    feedEl.innerHTML = html;

    console.log('✅ Activity Feed loaded');
  } catch (error) {
    console.error('❌ Activity Feed error:', error);
  }
}

// ============================================================================
// LEARNING TIMELINE
// ============================================================================

async function loadLearningTimeline() {
  console.log('🔄 Loading Learning Timeline...');

  try {
    const data = await fetchAPI('/owner/ai/learning/timeline');
    const timelineEl = document.getElementById('learningTimeline');
    if (!timelineEl) return;

    if (!data.insights || data.insights.length === 0) {
      timelineEl.innerHTML = '<div class="empty-state">No learning insights yet</div>';
      return;
    }

    let html = '<div style="display: flex; flex-direction: column; gap: 0.75rem;">';

    data.insights.slice(0, 10).forEach(insight => {
      const appliedBadge = insight.applied
        ? '<span class="badge badge-success">Applied</span>'
        : '<span class="badge badge-warning">Pending</span>';

      html += `
        <div style="padding: 0.75rem; border: 1px solid var(--border); background: var(--surface); border-radius: 4px;">
          <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
            <strong style="font-size: 0.875rem;">${insight.title}</strong>
            ${appliedBadge}
          </div>
          <div style="font-size: 0.8125rem; color: var(--text-light);">${insight.insight}</div>
          <div style="font-size: 0.75rem; color: var(--text-light); margin-top: 0.5rem;">
            ${formatTimeAgo(insight.created_at)} • Confidence: ${Math.round((insight.confidence || 0) * 100)}%
          </div>
        </div>
      `;
    });

    html += '</div>';
    timelineEl.innerHTML = html;

    console.log('✅ Learning Timeline loaded');
  } catch (error) {
    console.error('❌ Learning Timeline error:', error);
    const timelineEl = document.getElementById('learningTimeline');
    if (timelineEl) {
      timelineEl.innerHTML = showError('Learning Timeline', error.message);
    }
  }
}

// ============================================================================
// AI WIDGETS
// ============================================================================

async function loadAIReorder() {
  console.log('🔄 Loading AI Reorder Widget...');

  try {
    const data = await fetchAPI('/owner/ai/reorder');
    const listEl = document.getElementById('aiReorderList');
    if (!listEl) return;

    if (!data.recommendations || data.recommendations.length === 0) {
      listEl.innerHTML = '<div class="empty-state">No reorder recommendations</div>';
      return;
    }

    let html = '<div style="display: flex; flex-direction: column; gap: 0.75rem;">';

    data.recommendations.slice(0, 5).forEach(rec => {
      html += `
        <div style="padding: 0.75rem; border: 1px solid var(--border); background: var(--surface); border-radius: 4px;">
          <strong style="font-size: 0.875rem;">${rec.item_name}</strong>
          <div style="font-size: 0.8125rem; color: var(--text-light); margin-top: 0.25rem;">
            Reorder: <strong>${rec.recommended_qty} ${rec.unit}</strong>
          </div>
        </div>
      `;
    });

    html += '</div>';
    listEl.innerHTML = html;

    console.log('✅ AI Reorder Widget loaded');
  } catch (error) {
    console.error('❌ AI Reorder Widget error:', error);
  }
}

async function loadAIAnomalies() {
  console.log('🔄 Loading AI Anomalies Widget...');

  try {
    const data = await fetchAPI('/owner/ai/anomalies');
    const listEl = document.getElementById('aiAnomalyList');
    if (!listEl) return;

    if (!data.anomalies || data.anomalies.length === 0) {
      listEl.innerHTML = '<div class="empty-state">✅ No anomalies detected</div>';
      return;
    }

    let html = '<div style="display: flex; flex-direction: column; gap: 0.75rem;">';

    data.anomalies.slice(0, 5).forEach(anomaly => {
      const severityBadge = anomaly.severity === 'high' ? 'badge-danger' :
                           anomaly.severity === 'medium' ? 'badge-warning' : 'badge-info';

      html += `
        <div style="padding: 0.75rem; border: 1px solid var(--border); background: var(--surface); border-radius: 4px;">
          <div style="display: flex; justify-content: space-between; align-items: start;">
            <strong style="font-size: 0.875rem;">${anomaly.item_name}</strong>
            <span class="badge ${severityBadge}">${anomaly.severity}</span>
          </div>
          <div style="font-size: 0.8125rem; color: var(--text-light); margin-top: 0.25rem;">
            ${anomaly.message}
          </div>
        </div>
      `;
    });

    html += '</div>';
    listEl.innerHTML = html;

    console.log('✅ AI Anomalies Widget loaded');
  } catch (error) {
    console.error('❌ AI Anomalies Widget error:', error);
  }
}

async function loadAIUpgrade() {
  console.log('🔄 Loading AI Upgrade Advisor...');

  try {
    const data = await fetchAPI('/owner/ai/upgrade-advisor');
    const adviceEl = document.getElementById('aiUpgradeAdvice');
    if (!adviceEl) return;

    if (!data.recommendations || data.recommendations.length === 0) {
      adviceEl.innerHTML = '<div class="empty-state">✅ System is up to date</div>';
      return;
    }

    let html = '<div style="display: flex; flex-direction: column; gap: 0.75rem;">';

    data.recommendations.forEach(rec => {
      const priorityBadge = rec.priority === 'high' ? 'badge-danger' :
                           rec.priority === 'medium' ? 'badge-warning' : 'badge-info';

      html += `
        <div style="padding: 0.75rem; border: 1px solid var(--border); background: var(--surface); border-radius: 4px;">
          <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
            <strong style="font-size: 0.875rem;">${rec.title}</strong>
            <span class="badge ${priorityBadge}">${rec.priority}</span>
          </div>
          <div style="font-size: 0.8125rem; color: var(--text-light);">${rec.description}</div>
          ${rec.action ? `<button class="btn btn-sm btn-primary" onclick="applyNextBestAction('${rec.id}')" style="margin-top: 0.5rem;">Apply</button>` : ''}
        </div>
      `;
    });

    html += '</div>';
    adviceEl.innerHTML = html;

    console.log('✅ AI Upgrade Advisor loaded');
  } catch (error) {
    console.error('❌ AI Upgrade Advisor error:', error);
  }
}

async function applyNextBestAction(actionId) {
  console.log(`🔄 Applying action: ${actionId}`);

  try {
    const data = await fetchAPI(`/owner/ai/apply-action/${actionId}`, {
      method: 'POST'
    });

    alert('Action applied successfully: ' + data.message);

    // Reload AI widgets
    loadAIUpgrade();
    loadDashboard();

    console.log('✅ Action applied');
  } catch (error) {
    console.error('❌ Apply action error:', error);
    alert('Failed to apply action: ' + error.message);
  }
}

// ============================================================================
// LOCATIONS - UNASSIGNED ITEMS
// ============================================================================

async function loadUnassignedItems(page = 1) {
  console.log('🔄 Loading Unassigned Items...');

  try {
    const data = await fetchAPI(`/owner/locations/unassigned?page=${page}&limit=25`);
    const listEl = document.getElementById('unassignedList');
    const totalEl = document.getElementById('unassignedTotal');

    if (totalEl) {
      totalEl.textContent = data.total || 0;
    }

    if (!listEl) return;

    if (!data.items || data.items.length === 0) {
      listEl.innerHTML = '<tr><td colspan="5" class="empty-state">✅ All items assigned!</td></tr>';
      return;
    }

    let html = '';

    data.items.forEach(item => {
      html += `
        <tr>
          <td><input type="checkbox" class="unassigned-checkbox" data-item-code="${item.item_code}"></td>
          <td><strong>${item.item_code}</strong></td>
          <td>${item.item_name}</td>
          <td>${item.unit || 'EA'}</td>
          <td>
            <button class="btn btn-sm btn-primary" onclick="assignSingleItem('${item.item_code}')">📍 Assign</button>
          </td>
        </tr>
      `;
    });

    listEl.innerHTML = html;

    console.log('✅ Unassigned Items loaded');
  } catch (error) {
    console.error('❌ Unassigned Items error:', error);
    const listEl = document.getElementById('unassignedList');
    if (listEl) {
      listEl.innerHTML = `<tr><td colspan="5">${showError('Unassigned Items', error.message)}</td></tr>`;
    }
  }
}

function assignSingleItem(itemCode) {
  console.log(`📍 Assigning single item: ${itemCode}`);
  // Open assignment modal for single item
  // This would call openAssignModal() with the item code
  alert(`Assign ${itemCode} - Feature coming soon`);
}

// ============================================================================
// COUNT WORKSPACE
// ============================================================================

async function loadCountLocations() {
  try {
    const data = await fetchAPI('/inventory/locations');
    const selectEl = document.getElementById('countLocation');
    const countItemLocationEl = document.getElementById('countItemLocation');

    if (selectEl) {
      selectEl.innerHTML = '<option value="">Select location...</option>';
      (data.locations || []).forEach(loc => {
        selectEl.innerHTML += `<option value="${loc.id}">${loc.name}</option>`;
      });
    }

    if (countItemLocationEl) {
      countItemLocationEl.innerHTML = '<option value="">Select location...</option>';
      (data.locations || []).forEach(loc => {
        countItemLocationEl.innerHTML += `<option value="${loc.id}">${loc.name}</option>`;
      });
    }
  } catch (error) {
    console.error('Error loading count locations:', error);
  }
}

async function loadActiveCount() {
  console.log('🔄 Loading Active Count...');

  try {
    const data = await fetchAPI('/owner/count/active');

    if (data.count) {
      activeCountId = data.count.id;
      // Render active count UI
      const detailsEl = document.getElementById('activeCountDetails');
      if (detailsEl) {
        detailsEl.innerHTML = `
          <div style="padding: 1rem; border: 2px solid var(--success); border-radius: 6px;">
            <strong>Count #${data.count.id}</strong>
            <div style="font-size: 0.875rem; color: var(--text-light); margin-top: 0.5rem;">
              Started: ${formatTimeAgo(data.count.created_at)}<br>
              Items: ${data.count.item_count || 0}
            </div>
            <button class="btn btn-sm btn-primary" onclick="closeCount()" style="margin-top: 1rem; width: 100%;">
              Close Count
            </button>
          </div>
        `;
      }
    } else {
      activeCountId = null;
      const detailsEl = document.getElementById('activeCountDetails');
      if (detailsEl) {
        detailsEl.innerHTML = '<div class="empty-state">No active count</div>';
      }
    }

    console.log('✅ Active Count loaded');
  } catch (error) {
    console.error('❌ Active Count error:', error);
  }
}

// ============================================================================
// MONTH-END PLAYGROUND
// ============================================================================

async function loadPlayground() {
  console.log('🔄 Loading Month-End Playground...');

  try {
    // Load all workspaces
    const workspaces = await fetchAPI('/owner/count/workspaces/all?limit=20');

    // Render playground UI
    const playgroundEl = document.getElementById('playgroundPanel');
    if (!playgroundEl) return;

    let html = `
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">🎮 Month-End Playground</h3>
          <button class="btn btn-sm btn-primary" onclick="openNewWorkspaceModal()">➕ New Workspace</button>
        </div>
        <div style="max-height: 500px; overflow-y: auto;">
          <table class="table">
            <thead>
              <tr>
                <th>Workspace</th>
                <th>Period</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
    `;

    (workspaces.workspaces || []).forEach(ws => {
      const statusBadge = ws.status === 'open' ? 'badge-success' : 'badge-warning';
      html += `
        <tr>
          <td><strong>${ws.name}</strong></td>
          <td>${ws.period_start} to ${ws.period_end}</td>
          <td><span class="badge ${statusBadge}">${ws.status}</span></td>
          <td>
            <button class="btn btn-sm btn-primary" onclick="openWorkspace('${ws.id}')">Open</button>
          </td>
        </tr>
      `;
    });

    html += `
            </tbody>
          </table>
        </div>
      </div>
    `;

    playgroundEl.innerHTML = html;

    console.log('✅ Playground loaded');
  } catch (error) {
    console.error('❌ Playground error:', error);
  }
}

// ============================================================================
// EXPORT: Make functions globally available
// ============================================================================

window.updateTokenTTL = updateTokenTTL;
window.logout = logout;
window.fetchAPI = fetchAPI;
window.getTimeAgo = getTimeAgo;
window.formatTimeAgo = formatTimeAgo;
window.showError = showError;
window.switchTab = switchTab;
window.loadDashboard = loadDashboard;
window.renderSystemStatus = renderSystemStatus;
window.renderAIOpsHealth = renderAIOpsHealth;
window.renderAIModules = renderAIModules;
window.renderDBMetrics = renderDBMetrics;
window.renderAuditLogs = renderAuditLogs;
window.renderVersionInfo = renderVersionInfo;
window.renderLearningInsights = renderLearningInsights;
window.loadAIOpsStatus = loadAIOpsStatus;
window.loadCognitiveIntelligence = loadCognitiveIntelligence;
window.loadActivityFeed = loadActivityFeed;
window.loadLearningTimeline = loadLearningTimeline;
window.loadAIReorder = loadAIReorder;
window.loadAIAnomalies = loadAIAnomalies;
window.loadAIUpgrade = loadAIUpgrade;
window.applyNextBestAction = applyNextBestAction;
window.loadUnassignedItems = loadUnassignedItems;
window.assignSingleItem = assignSingleItem;
window.loadCountLocations = loadCountLocations;
window.loadActiveCount = loadActiveCount;
window.loadPlayground = loadPlayground;
