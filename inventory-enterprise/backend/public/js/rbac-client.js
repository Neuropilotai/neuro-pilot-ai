/**
 * RBAC Client Helper - v15.5.0
 *
 * Fetches user capabilities from backend and provides helper functions
 * for role-based UI gating (hide/disable tabs, buttons, etc.)
 *
 * Usage:
 *   await RBACClient.init();
 *   if (RBACClient.can('viewFinance')) { ... }
 *   RBACClient.gateUI();
 *
 * @version 15.5.0
 */

const RBACClient = (function() {
  'use strict';

  // Internal state
  let capabilities = null;
  let user = null;
  let roles = null;
  let initialized = false;

  /**
   * PATCH 3: Hardened RBAC init with zero-crash guarantee
   * Always succeeds, degrades to OWNER role on failure
   * @param {Object} options - Optional { endpoint: '...' }
   * @returns {Promise<Object>} User capabilities
   */
  async function init(options) {
    options = options || {};

    try {
      const base = (window.NP_CONFIG && window.NP_CONFIG.API_BASE) || window.API_URL || '';
      const ep = (options.endpoint && typeof options.endpoint === 'string' && /^https?:\/\//i.test(options.endpoint))
        ? options.endpoint
        : base + '/api/rbac/bootstrap';

      const res = await fetch(ep, { headers: { 'Accept': 'application/json' }});
      const data = await res.json().catch(() => ({}));

      const role = data.role || 'OWNER';
      const permissions = Array.isArray(data.permissions) ? data.permissions : [];

      // Update internal state
      capabilities = data.capabilities || {};
      user = data.user || { role: role, email: data.email || 'unknown' };
      roles = Array.isArray(data.roles) ? data.roles : [];
      initialized = true;

      // Also expose via window.__RBAC__ for compatibility
      window.__RBAC__ = { role, permissions };

      console.log('✅ RBAC initialized:', { role, permissions: permissions.length });

      return window.__RBAC__;
    } catch (e) {
      console.warn('[RBAC] init degraded:', e);
      window.NP_LAST_API_ERROR = { ts: Date.now(), scope: 'RBAC_INIT', message: String(e) };

      // Degrade gracefully - assume owner role with full permissions
      capabilities = {};
      user = { role: 'OWNER', email: 'degraded' };
      roles = [];
      initialized = true;

      window.__RBAC__ = { role: 'OWNER', permissions: [] };

      return window.__RBAC__;
    }
  }

  /**
   * Check if user has a capability
   * @param {string} capability - Capability name (e.g., 'canViewFinance')
   * @returns {boolean}
   */
  function can(capability) {
    if (!initialized || !capabilities) {
      console.warn('RBAC not initialized');
      return false;
    }

    return capabilities[capability] === true;
  }

  /**
   * Check if user has a specific role
   * @param {string} roleName - Role name (OWNER, FINANCE, OPS, READONLY)
   * @returns {boolean}
   */
  function hasRole(roleName) {
    if (!initialized || !user) {
      return false;
    }

    return user.role === roleName;
  }

  /**
   * Check if user has at least this role level
   * @param {string} minimumRole - Minimum role required
   * @returns {boolean}
   */
  function hasRoleLevel(minimumRole) {
    if (!initialized || !user) {
      return false;
    }

    const roleHierarchy = {
      OWNER: 4,
      FINANCE: 3,
      OPS: 2,
      READONLY: 1
    };

    const userLevel = roleHierarchy[user.role] || 0;
    const minLevel = roleHierarchy[minimumRole] || 0;

    return userLevel >= minLevel;
  }

  /**
   * Get current user info
   * @returns {Object|null}
   */
  function getUser() {
    return user;
  }

  /**
   * Get all capabilities
   * @returns {Object|null}
   */
  function getCapabilities() {
    return capabilities;
  }

  /**
   * Apply UI gating based on capabilities
   * Hides/disables elements based on data-rbac-* attributes
   *
   * Attributes:
   *   data-rbac-show="canViewFinance" - Show only if capability is true
   *   data-rbac-hide="canViewFinance" - Hide if capability is true
   *   data-rbac-disable="canExportFinance" - Disable if capability is false
   *   data-rbac-role="OWNER" - Show only if user has exact role
   *   data-rbac-min-role="FINANCE" - Show only if user has at least this role level
   */
  function gateUI() {
    if (!initialized) {
      console.warn('RBAC: Cannot gate UI - not initialized');
      return;
    }

    // Show elements conditionally
    document.querySelectorAll('[data-rbac-show]').forEach(element => {
      const capability = element.getAttribute('data-rbac-show');
      if (can(capability)) {
        element.classList.remove('u-hide');
      } else {
        element.classList.add('u-hide');
      }
    });

    // Hide elements conditionally
    document.querySelectorAll('[data-rbac-hide]').forEach(element => {
      const capability = element.getAttribute('data-rbac-hide');
      if (can(capability)) {
        element.classList.add('u-hide');
      } else {
        element.classList.remove('u-hide');
      }
    });

    // Disable elements conditionally
    document.querySelectorAll('[data-rbac-disable]').forEach(element => {
      const capability = element.getAttribute('data-rbac-disable');
      if (!can(capability)) {
        element.disabled = true;
        element.classList.add('btn-disabled');
        // Add tooltip if not present
        if (!element.hasAttribute('title')) {
          const requiredRole = getRequiredRoleForCapability(capability);
          element.setAttribute('title', `Requires ${requiredRole} role`);
        }
      } else {
        element.disabled = false;
        element.classList.remove('btn-disabled');
      }
    });

    // Role-based visibility (exact role match)
    document.querySelectorAll('[data-rbac-role]').forEach(element => {
      const requiredRole = element.getAttribute('data-rbac-role');
      if (hasRole(requiredRole)) {
        element.classList.remove('u-hide');
      } else {
        element.classList.add('u-hide');
      }
    });

    // Minimum role level visibility
    document.querySelectorAll('[data-rbac-min-role]').forEach(element => {
      const minRole = element.getAttribute('data-rbac-min-role');
      if (hasRoleLevel(minRole)) {
        element.classList.remove('u-hide');
      } else {
        element.classList.add('u-hide');
      }
    });

    console.log('✅ UI gating applied');
  }

  /**
   * Helper to determine which role is required for a capability
   * @param {string} capability
   * @returns {string}
   */
  function getRequiredRoleForCapability(capability) {
    const capabilityRoleMap = {
      canManageUsers: 'OWNER',
      canViewSettings: 'OWNER',
      canExportFinance: 'FINANCE or OWNER',
      canEditFinance: 'FINANCE or OWNER',
      canApproveFinance: 'FINANCE or OWNER',
      canApproveForecast: 'FINANCE or OWNER',
      canCreateForecast: 'OPS, FINANCE or OWNER',
      canMapCategories: 'FINANCE or OWNER'
    };

    return capabilityRoleMap[capability] || 'higher role';
  }

  /**
   * Disable an element and add tooltip explaining why
   * @param {HTMLElement} element
   * @param {string} reason
   */
  function disableWithReason(element, reason) {
    element.disabled = true;
    element.classList.add('btn-disabled');
    element.setAttribute('title', reason);
  }

  /**
   * Enable an element and remove disabled state
   * @param {HTMLElement} element
   */
  function enable(element) {
    element.disabled = false;
    element.classList.remove('btn-disabled');
    element.removeAttribute('title');
  }

  /**
   * Show a tab if user has capability, hide otherwise
   * @param {string} tabId - Tab element ID
   * @param {string} capability - Required capability
   */
  function gateTab(tabId, capability) {
    const tabElement = document.getElementById(tabId);
    if (!tabElement) {
      console.warn(`RBAC: Tab ${tabId} not found`);
      return;
    }

    if (can(capability)) {
      tabElement.classList.remove('u-hide');
    } else {
      tabElement.classList.add('u-hide');
    }
  }

  /**
   * Check if user is authenticated
   * @returns {boolean}
   */
  function isAuthenticated() {
    return initialized && user !== null;
  }

  // Public API
  return {
    init,
    can,
    hasRole,
    hasRoleLevel,
    getUser,
    getCapabilities,
    gateUI,
    gateTab,
    disableWithReason,
    enable,
    isAuthenticated
  };
})();

// Make globally available
window.RBACClient = RBACClient;
