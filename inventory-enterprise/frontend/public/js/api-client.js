/**
 * NeuroPilot Inventory Enterprise V21.1 - API Client
 *
 * Features:
 * - Automatic token refresh
 * - Request retry on 401
 * - Global error handling
 * - Request/response logging (dev mode)
 */

const API = {
  // ============================================
  // Core Request Method
  // ============================================

  /**
   * Make an authenticated API request
   * @param {string} endpoint - Endpoint key or path
   * @param {Object} options - Fetch options
   * @returns {Promise<Object>} Response data
   */
  async request(endpoint, options = {}) {
    const url = CONFIG.getUrl(endpoint);
    const token = CONFIG.getToken();

    // Build headers
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Log request in dev mode
    if (this.isDevMode()) {
      console.log(`[API] ${options.method || 'GET'} ${url}`);
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers
      });

      // Handle 401 - try token refresh
      if (response.status === 401 && token) {
        const refreshed = await this.refreshToken();
        if (refreshed) {
          // Retry with new token
          headers['Authorization'] = `Bearer ${CONFIG.getToken()}`;
          const retryResponse = await fetch(url, { ...options, headers });
          return this.handleResponse(retryResponse);
        } else {
          // Refresh failed, redirect to login
          this.handleAuthError();
          throw new Error('Session expired. Please log in again.');
        }
      }

      return this.handleResponse(response);

    } catch (error) {
      console.error('[API] Request failed:', error);
      throw error;
    }
  },

  /**
   * Handle API response
   * @param {Response} response - Fetch response
   * @returns {Promise<Object>} Parsed response data
   */
  async handleResponse(response) {
    const contentType = response.headers.get('content-type');

    let data;
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    if (!response.ok) {
      const error = new Error(data.error || data.message || `HTTP ${response.status}`);
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  },

  // ============================================
  // Token Management
  // ============================================

  /**
   * Attempt to refresh the access token
   * @returns {Promise<boolean>} Success status
   */
  async refreshToken() {
    const refreshToken = localStorage.getItem(CONFIG.refreshTokenKey);
    if (!refreshToken) return false;

    try {
      const response = await fetch(CONFIG.getUrl('refresh'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken })
      });

      if (!response.ok) return false;

      const data = await response.json();
      if (data.accessToken) {
        localStorage.setItem(CONFIG.tokenKey, data.accessToken);
        if (data.refreshToken) {
          localStorage.setItem(CONFIG.refreshTokenKey, data.refreshToken);
        }
        return true;
      }

      return false;
    } catch {
      return false;
    }
  },

  /**
   * Handle authentication error
   */
  handleAuthError() {
    CONFIG.clearAuth();
    // Redirect to login if not already there
    if (!window.location.pathname.includes('login')) {
      window.location.href = '/login.html';
    }
  },

  // ============================================
  // HTTP Method Shortcuts
  // ============================================

  async get(endpoint, params = {}) {
    let url = endpoint;
    if (Object.keys(params).length > 0) {
      const searchParams = new URLSearchParams(params);
      url = `${endpoint}?${searchParams}`;
    }
    return this.request(url, { method: 'GET' });
  },

  async post(endpoint, data = {}) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async put(endpoint, data = {}) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  async patch(endpoint, data = {}) {
    return this.request(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
  },

  async delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  },

  // ============================================
  // Auth Endpoints
  // ============================================

  async login(email, password) {
    const data = await this.post('login', { email, password });
    CONFIG.setAuth(data);
    return data;
  },

  async logout() {
    try {
      await this.post('logout');
    } catch {
      // Ignore logout errors
    }
    CONFIG.clearAuth();
  },

  async getMe() {
    return this.get('me');
  },

  // ============================================
  // Inventory Endpoints
  // ============================================

  async getInventory(params = {}) {
    return this.get('inventory', params);
  },

  async getItems(params = {}) {
    return this.get('items', params);
  },

  async getItem(id) {
    return this.get(`/api/inventory/${id}`);
  },

  async createItem(data) {
    return this.post('inventory', data);
  },

  async updateItem(id, data) {
    return this.put(`/api/inventory/${id}`, data);
  },

  async deleteItem(id) {
    return this.delete(`/api/inventory/${id}`);
  },

  // ============================================
  // Vendor Endpoints
  // ============================================

  async getVendors(params = {}) {
    return this.get('vendors', params);
  },

  async getVendor(id) {
    return this.get(`/api/vendors/${id}`);
  },

  async createVendor(data) {
    return this.post('vendors', data);
  },

  async updateVendor(id, data) {
    return this.put(`/api/vendors/${id}`, data);
  },

  // ============================================
  // Recipe & Menu Endpoints
  // ============================================

  async getRecipes(params = {}) {
    return this.get('recipes', params);
  },

  async getMenu(params = {}) {
    return this.get('menu', params);
  },

  // ============================================
  // Owner/Governance Endpoints
  // ============================================

  async getOwnerStatus() {
    return this.get('/api/owner/ops/status');
  },

  async getGovernanceStatus() {
    return this.get('/api/governance/status');
  },

  async triggerJob(job) {
    return this.post(`/api/owner/ops/jobs/${job}/trigger`);
  },

  // ============================================
  // POS Endpoints
  // ============================================

  async getPosRegisters() {
    return this.get('posRegisters');
  },

  async getPosOrders(params = {}) {
    return this.get('posOrders', params);
  },

  async createPosOrder(data) {
    return this.post('posOrders', data);
  },

  // ============================================
  // Health & Diagnostics
  // ============================================

  async getHealth() {
    return this.get('health');
  },

  async getDiag() {
    return this.get('/diag/db');
  },

  // ============================================
  // Utility
  // ============================================

  isDevMode() {
    return window.location.hostname === 'localhost' ||
           window.location.hostname === '127.0.0.1';
  }
};

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = API;
}
