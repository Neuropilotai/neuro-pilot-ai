/**
 * Central Route & Asset Registry (v15.2.3)
 * Single source of truth for all console paths and assets
 *
 * Purpose:
 * - Prevent hardcoded href/src throughout the codebase
 * - Enable easy refactoring when paths change
 * - Make broken link detection testable
 * - Support CSP compliance (no inline href/src)
 *
 * Usage:
 *   import { Routes, Assets, H } from './route-map.js';
 *   H.setHref(linkEl, 'CONSOLE');
 *   H.setSrc(imgEl, 'LOGO');
 */

/**
 * API Routes
 * All backend API endpoints used by the console
 */
export const Routes = {
  // Console pages
  CONSOLE: '/owner-super-console.html',
  LOGIN: '/index.html',

  // Dashboard & Owner APIs
  DASH_API: '/api/owner/dashboard',
  SYSTEM_HEALTH: '/api/owner/system-health',
  METRICS: '/api/owner/metrics',
  AUDIT_LOGS: '/api/owner/audit-logs',

  // AI & Cognitive APIs
  AI_OPS_STATUS: '/api/owner/ai-ops/status',
  AI_COGNITIVE: '/api/owner/ai/cognitive',
  AI_ACTIVITY: '/api/owner/ai/activity',
  AI_LEARNING_TIMELINE: '/api/owner/ai/learning/timeline',
  AI_REORDER: '/api/owner/ai/reorder',
  AI_ANOMALIES: '/api/owner/ai/anomalies',
  AI_UPGRADE: '/api/owner/ai/upgrade-advisor',

  // Inventory APIs
  INV_BASE: '/api/inventory',
  INV_ITEMS: '/api/inventory/items',
  INV_LOCATIONS: '/api/inventory/locations',

  // Owner Inventory APIs
  OWNER_INV: '/api/owner/inventory',
  OWNER_LOCATIONS: '/api/owner/locations/unassigned',
  OWNER_COUNTS: '/api/owner/counts',

  // Reconciliation APIs
  RECON_BASE: '/api/inventory/reconcile',
  RECON_LIST: '/api/inventory/reconcile/list',
  RECON_PDFS_IMPORT: '/api/inventory/pdfs/import',

  // Menu APIs
  MENU_BASE: '/api/menu',
  MENU_WEEKS: '/api/menu/weeks',
  MENU_WEEK: '/api/menu/week',
  MENU_RECIPE: '/api/menu/recipe',
  MENU_SHOPPING: '/api/menu/shopping-list',
  MENU_HEADCOUNT: '/api/menu/headcount',

  // Count/Workspace APIs
  COUNT_WORKSPACES: '/api/owner/count/workspaces',
  COUNT_WORKSPACE_CURRENT: '/api/owner/count/workspaces/current',
  COUNT_ACTIVE: '/api/owner/count/active',
  COUNT_HISTORY: '/api/owner/counts/history',

  // PDF/Document APIs
  PDFS_AVAILABLE: '/api/owner/pdfs/available',
  DOCUMENTS: '/api/documents',

  // Ops/Admin APIs
  OPS_BROKEN_LINKS: '/api/ops/broken-links/recent',
  OPS_REDIRECTS: '/__redirects',
};

/**
 * Static Assets
 * Images, icons, fonts, and other static files
 */
export const Assets = {
  // Logos & Icons
  LOGO: '/public/img/logo.svg',
  FAVICON: '/favicon.svg',
  PLACEHOLDER: '/public/img/placeholder.svg',
  ICON_SUCCESS: '/public/img/icon-success.svg',
  ICON_WARNING: '/public/img/icon-warning.svg',
  ICON_ERROR: '/public/img/icon-error.svg',

  // Stylesheets
  CSS_MAIN: '/public/css/owner-super.css',
  CSS_OWNER: '/public/css/owner-console.css',

  // Scripts
  JS_CORE: '/owner-console-core.js',
  JS_SUPER: '/owner-super-console.js',
  JS_ROUTE_MAP: '/public/js/route-map.js',

  // Fonts (if any)
  FONT_MAIN: '/public/fonts/inter.woff2',
};

/**
 * Helper utilities for working with routes and assets
 */
export const H = {
  /**
   * Set href attribute using route key
   * @param {HTMLElement} el - Element to update
   * @param {string} key - Route key from Routes object
   * @param {Object} params - Optional query params
   */
  setHref: (el, key, params = null) => {
    if (!el) return;
    let url = Routes[key];
    if (!url) {
      console.warn(`Route key not found: ${key}`);
      return;
    }

    // Add query params if provided
    if (params) {
      const queryString = new URLSearchParams(params).toString();
      url += (url.includes('?') ? '&' : '?') + queryString;
    }

    el.setAttribute('href', url);
  },

  /**
   * Set src attribute using asset key
   * @param {HTMLElement} el - Element to update
   * @param {string} key - Asset key from Assets object
   */
  setSrc: (el, key) => {
    if (!el) return;
    const url = Assets[key];
    if (!url) {
      console.warn(`Asset key not found: ${key}`);
      return;
    }
    el.setAttribute('src', url);
  },

  /**
   * Get route URL by key
   * @param {string} key - Route key
   * @param {Object} params - Optional query params
   * @returns {string} Route URL
   */
  route: (key, params = null) => {
    let url = Routes[key];
    if (!url) {
      console.warn(`Route key not found: ${key}`);
      return '';
    }

    if (params) {
      const queryString = new URLSearchParams(params).toString();
      url += (url.includes('?') ? '&' : '?') + queryString;
    }

    return url;
  },

  /**
   * Get asset URL by key
   * @param {string} key - Asset key
   * @returns {string} Asset URL
   */
  asset: (key) => {
    const url = Assets[key];
    if (!url) {
      console.warn(`Asset key not found: ${key}`);
      return '';
    }
    return url;
  },

  /**
   * Build API URL with params
   * @param {string} base - Base route key
   * @param {string} path - Additional path segments
   * @param {Object} params - Query parameters
   * @returns {string} Complete URL
   */
  api: (base, path = '', params = null) => {
    let url = Routes[base] || base;
    if (path) {
      url += (url.endsWith('/') ? '' : '/') + path.replace(/^\//, '');
    }

    if (params) {
      const queryString = new URLSearchParams(params).toString();
      url += '?' + queryString;
    }

    return url;
  },

  /**
   * Validate that a URL exists in Routes or Assets
   * @param {string} url - URL to validate
   * @returns {boolean} True if URL is registered
   */
  isRegistered: (url) => {
    const allValues = [...Object.values(Routes), ...Object.values(Assets)];
    return allValues.some(registered => {
      // Exact match
      if (registered === url) return true;
      // Starts with match (for API paths with params)
      if (url.startsWith(registered)) return true;
      return false;
    });
  },

  /**
   * Get all registered routes and assets (for testing)
   * @returns {Object} All routes and assets
   */
  getAll: () => ({
    routes: { ...Routes },
    assets: { ...Assets }
  })
};

// Make available globally for non-module contexts
if (typeof window !== 'undefined') {
  window.RouteMap = { Routes, Assets, H };
}
