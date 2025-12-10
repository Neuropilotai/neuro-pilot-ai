/**
 * Owner Console Bootstrap - CSP Compliant
 * Sets up API_BASE configuration for the owner console
 */

(function bootstrapNPConfig() {
  'use strict';
  try {
    // V22.2: Use same-origin (empty string) when served from backend
    // This eliminates all CORS issues for the admin console
    const currentHost = window.location.hostname;
    let API_BASE;

    if (currentHost.includes('railway.app') || currentHost.includes('localhost') || currentHost === '127.0.0.1' || currentHost === 'api.neuropilot.dev') {
      // Same-origin - no CORS issues, use relative URLs
      API_BASE = '';
    } else {
      // External origin - use canonical API domain
      API_BASE = 'https://api.neuropilot.dev';
    }

    // Clear any stale localStorage URL that might cause issues
    localStorage.removeItem('NP_API_URL');

    window.NP_CONFIG = { API_BASE: API_BASE };
    console.log('[Bootstrap] API_BASE:', API_BASE || '(same-origin)');
  } catch (e) {
    console.warn('Bootstrap failed:', e);
    window.NP_CONFIG = { API_BASE: '' }; // Default to same-origin
  }
})();

