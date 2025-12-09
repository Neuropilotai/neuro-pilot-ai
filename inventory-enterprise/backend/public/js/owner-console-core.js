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

// v14.4.0: Get API base from NP_CONFIG set by bootstrap script
// V22.3: Canonical domain - api.neuropilot.dev
function getAPIBase() {
  if (window.NP_CONFIG && window.NP_CONFIG.API_BASE !== undefined) {
    return window.NP_CONFIG.API_BASE;
  }
  // Fallback if bootstrap didn't run - use same-origin logic
  const currentHost = window.location.hostname;
  if (currentHost.includes('railway.app') || currentHost.includes('localhost') || currentHost === '127.0.0.1' || currentHost === 'api.neuropilot.dev') {
    return ''; // Same-origin - no CORS issues
  }
  return window.API_URL || 'https://api.neuropilot.dev';
}

// Origin Helper - ensures consistent URL handling across all requests
const H = (() => {
  const origin = window.location.origin;
  return {
    route: (p) => p.startsWith('http') ? p : origin + p,
    asset: (p) => p.startsWith('http') ? p : origin + p,
    origin: origin
  };
})();

// For backwards compatibility - but prefer using getAPIBase()
const API_BASE = null; // Will be computed dynamically

// LYRA-FIX: Read from NP_TOKEN (new standard) with fallback to authToken (legacy)
let token = localStorage.getItem('NP_TOKEN') || localStorage.getItem('authToken') || window.NP_TOKEN || window.authToken;

// Migration: if we found legacy token, migrate it
if (!localStorage.getItem('NP_TOKEN') && localStorage.getItem('authToken')) {
  localStorage.setItem('NP_TOKEN', localStorage.getItem('authToken'));
}

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
// CSP-COMPLIANT HELPER FUNCTIONS
// ============================================================================

/**
 * Toggle element visibility using class
 */
function setHidden(el, hidden) {
  if (!el) return;
  el.classList.toggle('u-hide', !!hidden);
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

// ============================================================================
// INITIALIZATION
// ============================================================================

window.addEventListener('DOMContentLoaded', async () => {
  // Re-read token from localStorage (may have been set after script load)
  // Support both new format (np_owner_jwt from quick_login.html) and old format (NP_TOKEN/authToken)
  token = localStorage.getItem('np_owner_jwt') || 
          localStorage.getItem('NP_TOKEN') || 
          localStorage.getItem('authToken') || 
          window.NP_TOKEN || 
          window.authToken;

  if (!token) {
    window.location.href = 'login.html';
    return;
  }

  // Parse JWT to get user and expiry
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    currentUser = payload;
    window.currentUser = payload; // v15.5.1: Make available globally for RBAC
    tokenExpiresAt = payload.exp * 1000;
    document.getElementById('currentUser').textContent = payload.email || 'Owner';
  } catch (e) {
    console.error('Invalid token:', e);
    logout();
    return;
  }

  // v15.5.0: Initialize RBAC client
  if (typeof window.RBACClient !== 'undefined') {
    try {
      await window.RBACClient.init();
      window.RBACClient.gateUI();
      console.log('✅ RBAC initialized and UI gated');
    } catch (rbacErr) {
      console.warn('RBAC initialization failed:', rbacErr.message);
    }
  }

  // v15.5.0: Load app config (shadow mode, etc.)
  try {
    const configResponse = await fetchAPI('/owner/config');
    window.appConfig = configResponse.config || {};
  } catch (configErr) {
    console.warn('Could not load app config:', configErr.message);
    window.appConfig = { shadowMode: false };
  }

  // v15.5.0: Update shadow mode badge (if function exists)
  if (typeof window.updateShadowModeBadge === 'function') {
    window.updateShadowModeBadge();
  }

  // Start token TTL countdown
  updateTokenTTL();
  setInterval(updateTokenTTL, 1000);

  // v23.6.11: Setup event listeners for CSP compliance (replaces inline onclick handlers)
  setupEventListeners();

  // Load saved tab preference
  const savedTab = localStorage.getItem('ownerConsoleTab') || 'dashboard';
  switchTab(savedTab);

  // Initial data loads
  loadDashboard();
  loadCountLocations();

  // Auto-refresh AI Ops status every 15 seconds
  // v23.6.10: Use loadAIOpsStatus from owner-super-console.js (correct function with proper endpoint)
  setInterval(() => {
    if (currentTab === 'ai' || currentTab === 'dashboard') {
      // Call loadAIOpsStatus from owner-super-console.js if available
      if (typeof window.loadAIOpsStatus === 'function') {
        window.loadAIOpsStatus();
      }
      loadCognitiveIntelligence();
      loadActivityFeed();
    }
  }, 15000);
});

/**
 * Setup event listeners for CSP compliance (v23.6.11)
 * Replaces inline onclick/onchange handlers with addEventListener
 */
function setupEventListeners() {
  // Tab navigation - use event delegation for all tabs
  const tabsContainer = document.querySelector('.tabs');
  if (tabsContainer) {
    tabsContainer.addEventListener('click', (e) => {
      const tab = e.target.closest('.tab');
      if (tab && tab.dataset.tab) {
        switchTab(tab.dataset.tab);
      }
    });
  }

  // Report tab navigation - use event delegation for report tabs
  const reportTabsContainer = document.querySelector('[data-report-tab]')?.closest('.flex-gap-half-wrap') || 
                              document.querySelector('.flex-gap-half-wrap');
  if (reportTabsContainer) {
    reportTabsContainer.addEventListener('click', (e) => {
      const reportTab = e.target.closest('[data-report-tab]');
      if (reportTab && reportTab.dataset.reportTab && typeof switchReportTab === 'function') {
        switchReportTab(reportTab.dataset.reportTab);
      }
    });
  }

  // Header buttons
  const healthBadge = document.getElementById('healthBadge');
  if (healthBadge && healthBadge.dataset.action === 'checkHealth') {
    healthBadge.addEventListener('click', () => {
      if (typeof checkHealth === 'function') {
        checkHealth();
      }
    });
  }

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      if (typeof logout === 'function') {
        logout();
      }
    });
  }

  // Buttons with data-action attribute (general pattern for CSP compliance)
  // This handles buttons like: data-action="loadCognitiveIntelligence", data-action="loadInventory", etc.
  // Functions may be defined in owner-console-core.js or owner-super-console.js
  // Since both scripts are loaded before DOMContentLoaded, functions are hoisted and available
  document.querySelectorAll('[data-action]').forEach(el => {
    const action = el.dataset.action;
    if (action) {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        // Check for data-action-arg (for functions that take parameters like triggerJob, adjustPopulation)
        const actionArg = el.dataset.actionArg;
        
        // Try window scope first (functions exported to window like loadInventory, loadCognitiveIntelligence)
        if (typeof window[action] === 'function') {
          if (actionArg !== undefined) {
            // Handle comma-separated arguments (e.g., "25,0" for adjustPopulation)
            if (actionArg.includes(',')) {
              const args = actionArg.split(',').map(arg => {
                const trimmed = arg.trim();
                // Try to parse as number, otherwise keep as string
                const num = Number(trimmed);
                return isNaN(num) ? trimmed : num;
              });
              window[action](...args);
            } else {
              window[action](actionArg);
            }
          } else {
            window[action]();
          }
        } else {
          // Functions declared with 'function' keyword are hoisted and available in global scope
          // Use eval only as fallback for functions not on window (safe here since action comes from data attribute)
          try {
            // Check if function exists in global scope
            const funcExists = typeof eval(action) === 'function';
            if (funcExists) {
              if (actionArg !== undefined) {
                // Handle comma-separated arguments
                if (actionArg.includes(',')) {
                  const args = actionArg.split(',').map(arg => {
                    const trimmed = arg.trim();
                    const num = Number(trimmed);
                    return isNaN(num) ? `'${trimmed}'` : trimmed;
                  });
                  eval(`${action}(${args.join(',')})`);
                } else {
                  eval(`${action}('${actionArg}')`);
                }
              } else {
                eval(`${action}()`);
              }
            } else {
              console.warn(`Function ${action} not found. Make sure it's exported to window or declared globally.`);
            }
          } catch (err) {
            console.warn(`Could not execute ${action}:`, err.message);
          }
        }
      });
    }
  });

  // Input fields with data-input-action attribute (for oninput handlers)
  document.querySelectorAll('[data-input-action]').forEach(el => {
    const action = el.dataset.inputAction;
    if (action) {
      el.addEventListener('input', () => {
        if (typeof window[action] === 'function') {
          window[action]();
        } else {
          try {
            const funcExists = typeof eval(action) === 'function';
            if (funcExists) {
              eval(`${action}()`);
            }
          } catch (err) {
            console.warn(`Could not execute ${action}:`, err.message);
          }
        }
      });
    }
  });

  // Checkboxes/selects with data-change-action attribute (for onchange handlers)
  document.querySelectorAll('[data-change-action]').forEach(el => {
    const action = el.dataset.changeAction;
    if (action) {
      el.addEventListener('change', () => {
        if (typeof window[action] === 'function') {
          window[action]();
        } else {
          try {
            const funcExists = typeof eval(action) === 'function';
            if (funcExists) {
              eval(`${action}()`);
            }
          } catch (err) {
            console.warn(`Could not execute ${action}:`, err.message);
          }
        }
      });
    }
  });
}

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
  window.location.href = 'login.html';
}

// ============================================================================
// API HELPERS
// ============================================================================

/**
 * Build auth headers - gracefully handles missing token
 * Supports both new format (np_owner_jwt + np_owner_device) and old format (NP_TOKEN/authToken)
 */
function authHeaders() {
  // Check for token in both new and old formats (same priority as token initialization)
  const t = localStorage.getItem('np_owner_jwt') || 
            localStorage.getItem('NP_TOKEN') || 
            localStorage.getItem('authToken') || 
            window.NP_TOKEN || 
            window.authToken;
  
  // Check for device ID (new format from quick_login.html)
  const deviceId = localStorage.getItem('np_owner_device');
  
  const h = { 'Accept': 'application/json' };
  
  if (t) {
    h['Authorization'] = `Bearer ${t}`;
  } else {
    console.warn('⚠️ No auth token found - API calls may fail');
  }
  
  // Include X-Owner-Device header if device ID is present (required for owner routes)
  if (deviceId) {
    h['X-Owner-Device'] = deviceId;
  }
  
  return h;
}

/**
 * PATCH 2: Unified API URL builder
 * Normalizes all API paths to valid absolute URLs
 */
function apiUrl(path) {
  const base = (window.NP_CONFIG && window.NP_CONFIG.API_BASE) || window.API_URL || '';
  if (!path || typeof path !== 'string') return base + '/api/health';
  if (path.startsWith('/api/')) return base + path;
  if (/^\.?\/?api\//i.test(path)) return base + '/' + path.replace(/^\.?\/*/,'');
  if (path.startsWith('/')) return base + '/api' + path;
  return base + '/api/' + path;
}

/**
 * PATCH 2: Hardened fetchAPI with zero-crash guarantee
 * Always returns null on failure, never throws, never causes "Invalid value" errors
 */
async function fetchAPI(path, opts = {}) {
  const url = apiUrl(path);
  try {
    const res = await fetch(url, Object.assign({ headers: authHeaders() }, opts));
    const data = await res.json().catch(() => null);
    if (data == null) throw new Error('Empty JSON');
    return data;
  } catch (e) {
    console.warn('⚠️ API Error (' + path + '):', e?.message || e);
    window.NP_LAST_API_ERROR = { ts: Date.now(), scope: 'API:' + path, message: String(e?.message || e) };
    return null;
  }
}

// ============================================================================
// HEALTH & STATUS MONITORING
// ============================================================================

/**
 * Check server health and update badge
 */
async function checkHealth() {
  const healthBadge = document.getElementById('healthBadge');
  const healthIcon = document.getElementById('healthIcon');
  const healthText = document.getElementById('healthText');
  const authStatus = document.getElementById('authStatus');

  if (!healthBadge) return;

  // Set loading state
  healthIcon.textContent = '⏳';
  healthText.textContent = 'Checking...';
  healthBadge.className = 'badge';

  try {
    const apiBase = getAPIBase();
    const response = await fetch(apiBase + '/api/health', {
      headers: { 'Accept': 'application/json' }
    });

    if (response.ok) {
      const data = await response.json();
      healthIcon.textContent = '🟢';
      healthText.textContent = 'Healthy';
      healthBadge.className = 'badge badge-live';
      healthBadge.title = `Server v${data.version || 'unknown'} - Click to refresh`;
    } else {
      healthIcon.textContent = '🟡';
      healthText.textContent = 'Degraded';
      healthBadge.className = 'badge badge-warn';
      healthBadge.title = `HTTP ${response.status} - Click to refresh`;
    }
  } catch (error) {
    healthIcon.textContent = '🔴';
    healthText.textContent = 'Offline';
    healthBadge.className = 'badge badge-danger';
    healthBadge.title = 'Server unreachable - Click to retry';
  }

  // Check auth status
  if (authStatus) {
    const token = localStorage.getItem('authToken') || window.authToken;
    if (!token) {
      authStatus.innerHTML = '<a href="' + H.route('/quick_login.html') + '" class="auth-status-login">⚠️ Login</a>';
    } else {
      authStatus.innerHTML = '<span class="auth-status-authenticated">✓ Authenticated</span>';
    }
  }
}

/**
 * Start periodic health checks
 */
function startHealthMonitoring() {
  // Initial check
  checkHealth();

  // Check every 30 seconds
  setInterval(checkHealth, 30000);
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
    const tabNames = ['dashboard', 'inventory', 'locations', 'pdfs', 'count', 'ai', 'forecast', 'reports', 'shrinkage', 'settings'];
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
      if (typeof loadRecentReconciliations === 'function') loadRecentReconciliations();
      if (typeof loadCountHistory === 'function') loadCountHistory();
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
    case 'menu':
      loadMenu();
      break;
    case 'reports':
      if (typeof loadReports === 'function') loadReports();
      break;
    case 'settings':
      if (typeof loadSettings === 'function') loadSettings();
      break;
    case 'shrinkage':
      if (typeof initShrinkageTab === 'function') initShrinkageTab();
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
    // v22.3: Prefer ai_ops_health_v2 (only scores enabled features) with fallback to v1
    renderAIOpsHealth(response.ai_ops_health, response.ai_ops_health_v2);
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
    swapText(statusEl, 'ok');
  } else {
    statusEl.textContent = '❌ Down';
    swapText(statusEl, 'bad');
  }
}

/**
 * v22.3: Updated to prefer V2 scoring with V1 fallback
 * V2 only scores enabled features, avoiding penalty for disabled systems
 * @param {Object} aiOpsHealthV1 - Legacy V1 scoring (may penalize disabled features)
 * @param {Object} aiOpsHealthV2 - New V2 scoring (only scores enabled features)
 */
function renderAIOpsHealth(aiOpsHealthV1, aiOpsHealthV2) {
  // v22.3: Prefer V2 if available, fallback to V1
  const health = aiOpsHealthV2 || aiOpsHealthV1;
  if (!health) return;

  // Render AI Ops health score - V2 uses 'score', V1 uses 'health_score'
  const healthScoreEl = document.getElementById('opsHealthScore');
  if (healthScoreEl) {
    const score = health.score !== undefined ? Math.round(health.score) : (health.health_score || '--');
    healthScoreEl.textContent = score;

    // Color code based on score
    if (typeof score === 'number') {
      if (score >= 85) {
        swapText(healthScoreEl, 'ok');
      } else if (score >= 70) {
        swapText(healthScoreEl, 'warn');
      } else {
        swapText(healthScoreEl, 'bad');
      }
    }
  }

  // v22.3: Show mode indicator if V2
  const modeEl = document.getElementById('opsHealthMode');
  if (modeEl && aiOpsHealthV2 && aiOpsHealthV2.mode) {
    modeEl.textContent = `Mode: ${aiOpsHealthV2.mode}`;
    modeEl.style.display = 'block';
  } else if (modeEl) {
    modeEl.style.display = 'none';
  }

  // Legacy V1 fields (may not exist in V2)
  const dqiEl = document.getElementById('opsDQIScore');
  if (dqiEl) {
    dqiEl.textContent = health.data_quality_index || '--';
  }

  const latencyEl = document.getElementById('opsForecastLatency');
  if (latencyEl) {
    latencyEl.textContent = health.forecast_latency || '--';
  }

  const divergenceEl = document.getElementById('opsLearningDivergence');
  if (divergenceEl) {
    divergenceEl.textContent = health.learning_divergence || '--';
  }

  // v22.3: Render component breakdown if V2 is available
  const breakdownEl = document.getElementById('opsHealthComponents');
  if (breakdownEl && aiOpsHealthV2 && aiOpsHealthV2.components) {
    renderOpsHealthComponents(aiOpsHealthV2.components, breakdownEl);
  }
}

/**
 * v22.3: Render component breakdown for V2 scoring
 * @param {Array} components - Array of component objects with label, status, score, weight, detail
 * @param {HTMLElement} container - Container element to render into
 */
function renderOpsHealthComponents(components, container) {
  if (!components || !container) return;

  const statusIcons = {
    'healthy': '🟢',
    'warning': '🟡',
    'critical': '🔴',
    'disabled': '⚫',
    'unknown': '⚪'
  };

  let html = '<div class="ops-health-components">';

  components.forEach(comp => {
    const icon = statusIcons[comp.status] || statusIcons['unknown'];
    const scoreDisplay = comp.status === 'disabled' ? 'N/A' : `${Math.round(comp.score || 0)}%`;
    const weightDisplay = comp.status === 'disabled' ? '' : `(${comp.weight}%)`;

    html += `
      <div class="ops-component-row" title="${comp.detail || comp.label}">
        <span class="ops-component-icon">${icon}</span>
        <span class="ops-component-label">${comp.label}</span>
        <span class="ops-component-score">${scoreDisplay} ${weightDisplay}</span>
      </div>
    `;
  });

  html += '</div>';
  container.innerHTML = html;
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

  let html = '<div class="flex-col-gap">';

  auditLogs.slice(0, 5).forEach(log => {
    html += `
      <div class="bordered-left-primary">
        <div class="text-bold-base">${log.action || 'Activity'}</div>
        <div class="text-sm-light">${log.details || ''}</div>
        <div class="description-small-mt">
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

// v23.6.10: REMOVED - This function was calling wrong endpoint /owner/ai-ops/status
// The correct function is in owner-super-console.js which calls /owner/ops/status
// This was causing 401 errors because the wrong endpoint doesn't exist
// async function loadAIOpsStatus() {
//   console.log('🔄 Loading AI Ops Status...');
//   ... (removed to prevent function name conflict)
// }

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
          swapText(indexEl, 'ok');
        } else if (index >= 70) {
          swapText(indexEl, 'warn');
        } else {
          swapText(indexEl, 'bad');
        }
      } else {
        indexEl.textContent = '--';
        swapText(indexEl, null);
        indexEl.classList.add('u-text-light-inline');
      }
    }

    // Update trend display
    const trendEl = document.getElementById('aiIndexTrend');
    if (trendEl && aiIntelligenceIndex.trend_pct !== null) {
      const trend = aiIntelligenceIndex.trend_pct;
      const arrow = trend > 0 ? '↑' : trend < 0 ? '↓' : '→';
      const trendClass = trend > 0 ? 'text-color-success' : trend < 0 ? 'text-color-danger' : 'u-text-light-inline';
      trendEl.innerHTML = `<span class="${trendClass}">${arrow} ${Math.abs(trend).toFixed(1)}% vs last week</span>`;
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

    let html = '<div class="flex-col-gap">';

    data.activities.slice(0, 10).forEach(activity => {
      const typeClass = activity.type === 'forecast' ? 'border-left-info' :
                       activity.type === 'learning' ? 'border-left-success' :
                       activity.type === 'alert' ? 'border-left-warning' : 'border-left-neutral';

      html += `
        <div class="padded-box ${typeClass}">
          <div class="text-bold-base">${activity.title}</div>
          <div class="text-sm-light">${activity.message}</div>
          <div class="description-small-mt">
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

    let html = '<div class="flex-col-gap">';

    data.insights.slice(0, 10).forEach(insight => {
      const appliedBadge = insight.applied
        ? '<span class="badge badge-success">Applied</span>'
        : '<span class="badge badge-warning">Pending</span>';

      html += `
        <div class="bordered-surface-card">
          <div class="flex-between-start">
            <strong class="u-text-base">${insight.title}</strong>
            ${appliedBadge}
          </div>
          <div class="text-sm-light">${insight.insight}</div>
          <div class="description-text-small u-mt-2">
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

    let html = '<div class="flex-col-gap">';

    data.recommendations.slice(0, 5).forEach(rec => {
      html += `
        <div class="bordered-surface-card">
          <strong class="u-text-base">${rec.item_name}</strong>
          <div class="text-sm-light description-small-mt">
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

    let html = '<div class="flex-col-gap">';

    data.anomalies.slice(0, 5).forEach(anomaly => {
      const severityBadge = anomaly.severity === 'high' ? 'badge-danger' :
                           anomaly.severity === 'medium' ? 'badge-warning' : 'badge-info';

      html += `
        <div class="bordered-surface-card">
          <div class="flex-between-start-only">
            <strong class="u-text-base">${anomaly.item_name}</strong>
            <span class="badge ${severityBadge}">${anomaly.severity}</span>
          </div>
          <div class="text-sm-light description-small-mt">
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

    let html = '<div class="flex-col-gap">';

    data.recommendations.forEach(rec => {
      const priorityBadge = rec.priority === 'high' ? 'badge-danger' :
                           rec.priority === 'medium' ? 'badge-warning' : 'badge-info';

      html += `
        <div class="bordered-surface-card">
          <div class="flex-between-start">
            <strong class="u-text-base">${rec.title}</strong>
            <span class="badge ${priorityBadge}">${rec.priority}</span>
          </div>
          <div class="text-sm-light">${rec.description}</div>
          ${rec.action ? `<button class="btn btn-sm btn-primary" onclick="applyNextBestAction('${rec.id}')" class="u-mt-2">Apply</button>` : ''}
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
          <div class="bordered-success-card">
            <strong>Count #${data.count.id}</strong>
            <div class="description-text">
              Started: ${formatTimeAgo(data.count.created_at)}<br>
              Items: ${data.count.item_count || 0}
            </div>
            <button class="btn btn-sm btn-primary" onclick="closeCount()" class="w-full-mt">
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
        <div class="modal-scrollable-content">
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
// MENU TAB - v14.4.2
// ============================================================================

// Menu state
let menuWeekData = null;
let menuCurrentWeek = 1;
let menuHeadcount = 280;
let menuCurrentWeekNumber = 1;
let menuShoppingListData = null;

/**
 * Load menu data and initialize the tab
 */
async function loadMenu() {
  console.log('🔄 Loading Menu Tab...');

  try {
    // Fetch 4-week overview
    const data = await fetchAPI('/menu/weeks');

    menuHeadcount = data.headcount || 280;
    menuCurrentWeekNumber = data.currentWeek || 1;

    // Update headcount display
    const headcountDisplay = document.getElementById('menuHeadcountDisplay');
    if (headcountDisplay) {
      headcountDisplay.textContent = menuHeadcount;
    }

    // Update current week badge
    const currentWeekBadge = document.getElementById('menuCurrentWeekBadge');
    if (currentWeekBadge) {
      currentWeekBadge.textContent = `Current: Week ${menuCurrentWeekNumber}`;
    }

    // Load week 1 by default
    loadMenuWeek(1);

    // Attach event listeners
    attachMenuEventListeners();

    console.log('✅ Menu Tab loaded');
  } catch (error) {
    console.error('❌ Menu Tab error:', error);
    const calendarEl = document.getElementById('menuCalendar');
    if (calendarEl) {
      calendarEl.innerHTML = showError('Menu', error.message);
    }
  }
}

/**
 * Load specific week data
 */
async function loadMenuWeek(weekNum) {
  console.log(`🔄 Loading Menu Week ${weekNum}...`);

  try {
    const data = await fetchAPI(`/menu/week/${weekNum}`);

    menuWeekData = data.week;
    menuCurrentWeek = weekNum;

    // Update week selector active state
    document.querySelectorAll('.menu-week-btn').forEach(btn => {
      if (parseInt(btn.getAttribute('data-week')) === weekNum) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Update week info
    const weekDatesEl = document.getElementById('menuWeekDates');
    if (weekDatesEl) {
      weekDatesEl.textContent = `${menuWeekData.startsOn} to ${menuWeekData.endsOn}`;
    }

    // Render calendar
    renderMenuCalendar();

    console.log(`✅ Week ${weekNum} loaded`);
  } catch (error) {
    console.error(`❌ Week ${weekNum} error:`, error);
    const calendarEl = document.getElementById('menuCalendar');
    if (calendarEl) {
      calendarEl.innerHTML = showError(`Week ${weekNum}`, error.message);
    }
  }
}

/**
 * Render menu calendar grid
 */
function renderMenuCalendar() {
  const calendarEl = document.getElementById('menuCalendar');
  if (!calendarEl || !menuWeekData) return;

  let html = '';

  menuWeekData.days.forEach(day => {
    const dayName = day.dayName;
    const isoDate = day.isoDate;
    const recipes = day.recipes || [];

    html += `
      <div class="menu-day-card">
        <div class="menu-day-header">
          ${dayName}
          <div class="menu-day-date">${isoDate}</div>
        </div>
        <div class="menu-day-recipes">
    `;

    if (recipes.length === 0) {
      html += `<div class="menu-day-empty">No recipes assigned</div>`;
    } else {
      recipes.forEach(recipe => {
        html += `
          <div class="menu-recipe-chip" data-recipe-id="${recipe.id}">
            <span class="menu-recipe-chip-name">${recipe.name}</span>
            <span class="menu-recipe-chip-cuisine">${recipe.cuisine || 'Universal'}</span>
          </div>
        `;
      });
    }

    html += `
        </div>
      </div>
    `;
  });

  calendarEl.innerHTML = html;

  // Attach recipe click handlers
  document.querySelectorAll('.menu-recipe-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const recipeId = chip.getAttribute('data-recipe-id');
      openRecipeDrawer(recipeId);
    });
  });
}

/**
 * Attach menu event listeners
 */
function attachMenuEventListeners() {
  // Week selector buttons
  document.querySelectorAll('.menu-week-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const weekNum = parseInt(btn.getAttribute('data-week'));
      loadMenuWeek(weekNum);
    });
  });

  // Refresh button
  const refreshBtn = document.getElementById('menuRefreshBtn');
  if (refreshBtn) {
    refreshBtn.onclick = () => loadMenu();
  }

  // Headcount button
  const headcountBtn = document.getElementById('menuHeadcountBtn');
  if (headcountBtn) {
    headcountBtn.onclick = () => openHeadcountModal();
  }

  // Shopping list button
  const shoppingListBtn = document.getElementById('menuShoppingListBtn');
  if (shoppingListBtn) {
    shoppingListBtn.onclick = () => openShoppingListModal();
  }
}

/**
 * Open recipe drawer modal
 */
async function openRecipeDrawer(recipeId) {
  console.log(`🔄 Opening recipe: ${recipeId}`);

  const modal = document.getElementById('recipeDrawerModal');
  const content = document.getElementById('recipeDrawerContent');
  if (!modal || !content) return;

  modal.classList.add('active');
  content.innerHTML = '<div class="loading"><div class="spinner"></div> Loading recipe...</div>';

  try {
    const data = await fetchAPI(`/menu/recipe/${recipeId}`);
    const recipe = data.recipe;

    let html = `
      <div class="recipe-drawer-header">
        <div>
          <div class="recipe-drawer-title">${recipe.name}</div>
          <div class="recipe-drawer-meta">
            <span>🌍 ${recipe.cuisine}</span>
            <span>👥 ${menuHeadcount} people</span>
          </div>
          ${recipe.allergens && recipe.allergens.length > 0 ? `
            <div class="recipe-drawer-allergens">
              ${recipe.allergens.map(a => `<span class="recipe-allergen-badge">${a}</span>`).join('')}
            </div>
          ` : ''}
        </div>
      </div>

      <div class="recipe-portions-table">
        <table class="table">
          <thead>
            <tr>
              <th>Item Code</th>
              <th>Description</th>
              <th>Quantity</th>
              <th>Pack Size</th>
              <th>Packs</th>
            </tr>
          </thead>
          <tbody>
    `;

    recipe.calculatedLines.forEach(line => {
      html += `
        <tr>
          <td><strong>${line.itemCode}</strong></td>
          <td>${line.description}</td>
          <td><strong>${line.totalIssueQty} ${line.unit}</strong></td>
          <td>${line.packSize ? `${line.packSize.qty} ${line.packSize.unit}` : '-'}</td>
          <td>${line.totalPacks ? `<strong>${line.totalPacks}</strong>` : '-'}</td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
      </div>
    `;

    if (recipe.notes) {
      html += `
        <div class="recipe-notes">
          <strong>📝 Notes:</strong><br>
          ${recipe.notes}
        </div>
      `;
    }

    content.innerHTML = html;

    console.log('✅ Recipe drawer opened');
  } catch (error) {
    console.error('❌ Recipe drawer error:', error);
    content.innerHTML = showError('Recipe', error.message);
  }
}

/**
 * Close recipe drawer
 */
function closeRecipeDrawer() {
  const modal = document.getElementById('recipeDrawerModal');
  if (modal) {
    modal.classList.remove('active');
  }
}

/**
 * Open headcount modal
 */
function openHeadcountModal() {
  const modal = document.getElementById('headcountModal');
  const currentDisplay = document.getElementById('headcountCurrentDisplay');
  const input = document.getElementById('headcountInput');

  if (modal) {
    modal.classList.add('active');
  }

  if (currentDisplay) {
    currentDisplay.textContent = menuHeadcount;
  }

  if (input) {
    input.value = menuHeadcount;
    input.focus();
  }
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
 * Update headcount
 */
async function updateHeadcount() {
  const input = document.getElementById('headcountInput');
  if (!input) return;

  const newHeadcount = parseInt(input.value);

  if (!newHeadcount || newHeadcount < 1 || newHeadcount > 10000) {
    alert('Headcount must be between 1 and 10,000');
    return;
  }

  console.log(`🔄 Updating headcount to ${newHeadcount}...`);

  try {
    const data = await fetchAPI('/menu/headcount', {
      method: 'POST',
      body: JSON.stringify({ headcount: newHeadcount })
    });

    menuHeadcount = data.headcount;

    // Update display
    const headcountDisplay = document.getElementById('menuHeadcountDisplay');
    if (headcountDisplay) {
      headcountDisplay.textContent = menuHeadcount;
    }

    closeHeadcountModal();

    // Reload current week to show updated quantities
    loadMenuWeek(menuCurrentWeek);

    alert(`✅ Headcount updated to ${menuHeadcount} people`);

    console.log('✅ Headcount updated');
  } catch (error) {
    console.error('❌ Headcount update error:', error);
    alert('Failed to update headcount: ' + error.message);
  }
}

/**
 * Open shopping list modal
 */
async function openShoppingListModal() {
  console.log(`🔄 Opening shopping list for week ${menuCurrentWeek}...`);

  const modal = document.getElementById('shoppingListModal');
  const table = document.getElementById('shoppingListTable');
  const weekNumEl = document.getElementById('shoppingWeekNum');
  const weekDatesEl = document.getElementById('shoppingWeekDates');
  const headcountEl = document.getElementById('shoppingHeadcount');

  if (!modal || !table) return;

  modal.classList.add('active');
  table.innerHTML = '<tr><td colspan="5" class="loading"><div class="spinner"></div> Loading...</td></tr>';

  // Update header info
  if (weekNumEl) weekNumEl.textContent = menuCurrentWeek;
  if (weekDatesEl && menuWeekData) {
    weekDatesEl.textContent = `${menuWeekData.startsOn} to ${menuWeekData.endsOn}`;
  }
  if (headcountEl) headcountEl.textContent = menuHeadcount;

  try {
    const data = await fetchAPI(`/menu/shopping-list?week=${menuCurrentWeek}`);

    menuShoppingListData = data;

    if (!data.items || data.items.length === 0) {
      table.innerHTML = '<tr><td colspan="5" class="empty-state">No items in shopping list</td></tr>';
      return;
    }

    let html = '';

    data.items.forEach(item => {
      html += `
        <tr>
          <td><strong>${item.itemCode}</strong></td>
          <td>${item.description}</td>
          <td><strong>${item.totalIssueQty} ${item.unit}</strong></td>
          <td>${item.packSize ? `${item.packSize.qty} ${item.packSize.unit}` : '-'}</td>
          <td>${item.totalPacks ? `<strong>${item.totalPacks}</strong>` : '-'}</td>
        </tr>
      `;
    });

    table.innerHTML = html;

    console.log('✅ Shopping list opened');
  } catch (error) {
    console.error('❌ Shopping list error:', error);
    table.innerHTML = `<tr><td colspan="5">${showError('Shopping List', error.message)}</td></tr>`;
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
  if (!menuShoppingListData || !menuShoppingListData.csv) {
    alert('No shopping list data to download');
    return;
  }

  const csv = menuShoppingListData.csv;
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `shopping-list-week-${menuCurrentWeek}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);

  console.log('✅ CSV downloaded');
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
window.renderOpsHealthComponents = renderOpsHealthComponents;
window.renderAIModules = renderAIModules;
window.renderDBMetrics = renderDBMetrics;
window.renderAuditLogs = renderAuditLogs;
window.renderVersionInfo = renderVersionInfo;
window.renderLearningInsights = renderLearningInsights;
// v23.6.10: REMOVED - loadAIOpsStatus export to prevent overriding correct function from owner-super-console.js
// window.loadAIOpsStatus = loadAIOpsStatus;
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
window.loadMenu = loadMenu;
window.loadMenuWeek = loadMenuWeek;
window.renderMenuCalendar = renderMenuCalendar;
window.attachMenuEventListeners = attachMenuEventListeners;
window.openRecipeDrawer = openRecipeDrawer;
window.closeRecipeDrawer = closeRecipeDrawer;
window.openHeadcountModal = openHeadcountModal;
window.closeHeadcountModal = closeHeadcountModal;
window.updateHeadcount = updateHeadcount;
window.openShoppingListModal = openShoppingListModal;
window.closeShoppingListModal = closeShoppingListModal;
window.downloadShoppingListCSV = downloadShoppingListCSV;
