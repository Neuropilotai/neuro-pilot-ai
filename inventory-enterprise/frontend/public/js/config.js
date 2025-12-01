/**
 * NeuroPilot Inventory Enterprise V21.1 - Frontend Configuration
 *
 * IMPORTANT: Update API_BASE_URL when deploying to a new Railway backend
 */

const CONFIG = {
  // ============================================
  // API Configuration
  // ============================================

  // V22.3: Canonical API URL - api.neuropilot.dev
  // Same-origin detection for Railway/localhost, otherwise use canonical domain
  API_BASE_URL: (function() {
    const currentHost = window.location.hostname;
    // Same-origin: Railway backend or local development
    if (currentHost.includes('railway.app') || currentHost.includes('localhost') || currentHost === '127.0.0.1') {
      return ''; // Same-origin - no CORS issues
    }
    // Same-origin: Custom domain pointing to backend
    if (currentHost === 'api.neuropilot.dev') {
      return ''; // Same-origin
    }
    // Cross-origin: Use canonical API domain
    return window.NP_API_URL || 'https://api.neuropilot.dev';
  })(),

  // API Endpoints
  endpoints: {
    // Auth
    login: '/api/auth/login',
    logout: '/api/auth/logout',
    refresh: '/api/auth/refresh',
    me: '/api/me',

    // Inventory
    inventory: '/api/inventory',
    items: '/api/items',
    locations: '/api/locations',

    // Vendors & Recipes
    vendors: '/api/vendors',
    recipes: '/api/recipes',
    menu: '/api/menu',

    // Operations
    population: '/api/population',
    waste: '/api/waste',
    pdfs: '/api/pdfs',

    // Owner/Admin
    owner: '/api/owner',
    ownerOps: '/api/owner/ops',
    governance: '/api/governance',

    // POS
    posCatalog: '/api/pos/catalog',
    posRegisters: '/api/pos/registers',
    posOrders: '/api/pos/orders',
    posPayments: '/api/pos/payments',
    posReports: '/api/pos/reports',
    posPdfs: '/api/pdfs/pos',

    // Health & Diagnostics
    health: '/health',
    metrics: '/metrics',
    diag: '/diag'
  },

  // ============================================
  // Token Configuration
  // ============================================
  tokenKey: 'NP_TOKEN',
  refreshTokenKey: 'NP_REFRESH_TOKEN',
  userKey: 'NP_USER',

  // Token refresh threshold (5 minutes before expiry)
  tokenRefreshThreshold: 5 * 60 * 1000,

  // ============================================
  // RBAC Roles
  // ============================================
  roles: {
    OWNER: 'owner',
    ADMIN: 'admin',
    MANAGER: 'manager',
    STAFF: 'staff',
    VIEWER: 'viewer'
  },

  // Role hierarchy (higher index = more privileges)
  roleHierarchy: ['viewer', 'staff', 'manager', 'admin', 'owner'],

  // ============================================
  // Helper Functions
  // ============================================

  /**
   * Get full API URL for an endpoint
   * @param {string} endpoint - Endpoint key or path
   * @returns {string} Full URL
   */
  getUrl(endpoint) {
    const path = this.endpoints[endpoint] || endpoint;
    return this.API_BASE_URL + path;
  },

  /**
   * Get stored auth token
   * @returns {string|null}
   */
  getToken() {
    return localStorage.getItem(this.tokenKey);
  },

  /**
   * Get stored user info
   * @returns {Object|null}
   */
  getUser() {
    const userStr = localStorage.getItem(this.userKey);
    if (!userStr) return null;
    try {
      return JSON.parse(userStr);
    } catch {
      return null;
    }
  },

  /**
   * Check if token is expired
   * @returns {boolean}
   */
  isTokenExpired() {
    const token = this.getToken();
    if (!token) return true;

    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return !payload.exp || (payload.exp * 1000) < Date.now();
    } catch {
      return true;
    }
  },

  /**
   * Check if user has required role
   * @param {string} requiredRole - Minimum required role
   * @returns {boolean}
   */
  hasRole(requiredRole) {
    const user = this.getUser();
    if (!user || !user.role) return false;

    const userRoleIndex = this.roleHierarchy.indexOf(user.role.toLowerCase());
    const requiredRoleIndex = this.roleHierarchy.indexOf(requiredRole.toLowerCase());

    return userRoleIndex >= requiredRoleIndex;
  },

  /**
   * Clear all auth data
   */
  clearAuth() {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.refreshTokenKey);
    localStorage.removeItem(this.userKey);
  },

  /**
   * Store auth data after login
   * @param {Object} data - Login response data
   */
  setAuth(data) {
    if (data.accessToken) {
      localStorage.setItem(this.tokenKey, data.accessToken);
    }
    if (data.refreshToken) {
      localStorage.setItem(this.refreshTokenKey, data.refreshToken);
    }
    if (data.user) {
      localStorage.setItem(this.userKey, JSON.stringify(data.user));
    }
  }
};

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
}

// Log config on load (development only)
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
  console.log('[Config] API Base URL:', CONFIG.API_BASE_URL);
  console.log('[Config] Token present:', !!CONFIG.getToken());
  console.log('[Config] User:', CONFIG.getUser()?.email || 'Not logged in');
}
