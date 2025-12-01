/**
 * NeuroInnovate Inventory Enterprise - Unified API Client
 * Version: 21.1.1-LYRA-FIX
 *
 * Solves:
 * - Token storage mismatch (NP_TOKEN vs authToken)
 * - BASE URL inconsistency
 * - Fetch pattern fragmentation
 * - Error handling standardization
 */

(function(window) {
  'use strict';

  /**
   * API Configuration Manager
   */
  class APIConfig {
    constructor() {
      this.init();
    }

    init() {
      // Read BASE URL from meta tag, localStorage, or fallback
      const meta = document.querySelector('meta[name="np-api-url"]');
      const metaUrl = meta?.content?.trim();
      const storedUrl = localStorage.getItem('NP_API_URL');

      // Primary production URL - Railway inventory-backend service
      const DEFAULT_URL = 'https://inventory-backend-production-3a2c.up.railway.app';

      this.apiBase = metaUrl || storedUrl || DEFAULT_URL;

      // Persist for future use
      localStorage.setItem('NP_API_URL', this.apiBase);

      // Make globally accessible
      window.NP_CONFIG = window.NP_CONFIG || {};
      window.NP_CONFIG.API_BASE = this.apiBase;
    }

    getBaseURL() {
      return this.apiBase;
    }

    setBaseURL(url) {
      this.apiBase = url;
      localStorage.setItem('NP_API_URL', url);
      window.NP_CONFIG.API_BASE = url;
    }
  }

  /**
   * Token Manager - Handles all token storage/retrieval
   */
  class TokenManager {
    constructor() {
      this.TOKEN_KEY = 'NP_TOKEN';  // Standardized key
      this.USER_KEY = 'NP_USER';
      this.LEGACY_TOKEN_KEY = 'authToken'; // For migration
    }

    /**
     * Get token - checks both new and legacy keys
     */
    getToken() {
      let token = localStorage.getItem(this.TOKEN_KEY);

      // Migration: check legacy key
      if (!token) {
        token = localStorage.getItem(this.LEGACY_TOKEN_KEY);
        if (token) {
          // Migrate to new key
          this.setToken(token);
          localStorage.removeItem(this.LEGACY_TOKEN_KEY);
        }
      }

      // Fallback to window global (for compatibility)
      if (!token) {
        token = window.authToken || window.NP_TOKEN;
      }

      return token;
    }

    setToken(token) {
      localStorage.setItem(this.TOKEN_KEY, token);
      window.NP_TOKEN = token; // Also set global
    }

    removeToken() {
      localStorage.removeItem(this.TOKEN_KEY);
      localStorage.removeItem(this.LEGACY_TOKEN_KEY);
      delete window.NP_TOKEN;
      delete window.authToken;
    }

    getUser() {
      const userStr = localStorage.getItem(this.USER_KEY);
      try {
        return userStr ? JSON.parse(userStr) : null;
      } catch (e) {
        console.error('Failed to parse user data:', e);
        return null;
      }
    }

    setUser(user) {
      localStorage.setItem(this.USER_KEY, JSON.stringify(user));
    }

    removeUser() {
      localStorage.removeItem(this.USER_KEY);
    }

    isAuthenticated() {
      return !!this.getToken();
    }

    clear() {
      this.removeToken();
      this.removeUser();
    }
  }

  /**
   * Unified API Client
   */
  class APIClient {
    constructor() {
      this.config = new APIConfig();
      this.tokens = new TokenManager();
      this.orgId = localStorage.getItem('NP_ORG_ID');
      this.siteId = localStorage.getItem('NP_SITE_ID');
    }

    /**
     * Normalize endpoint path
     */
    normalizePath(endpoint) {
      // Ensure starts with /
      if (!endpoint.startsWith('/')) {
        endpoint = '/' + endpoint;
      }

      // Add /api prefix if missing
      if (!endpoint.startsWith('/api/') && !endpoint.startsWith('/health') && !endpoint.startsWith('/metrics')) {
        endpoint = '/api' + endpoint;
      }

      return endpoint;
    }

    /**
     * Build full URL
     */
    buildURL(endpoint) {
      const normalized = this.normalizePath(endpoint);
      const base = this.config.getBaseURL();
      return `${base}${normalized}`;
    }

    /**
     * Build headers
     */
    buildHeaders(customHeaders = {}) {
      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...customHeaders
      };

      // Add auth token if available
      const token = this.tokens.getToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      // Add tenant headers if available
      if (this.orgId) {
        headers['x-org-id'] = this.orgId;
      }
      if (this.siteId) {
        headers['x-site-id'] = this.siteId;
      }

      // Default tenant ID for single-tenant mode
      headers['X-Tenant-Id'] = '1';

      return headers;
    }

    /**
     * Main request method
     */
    async request(endpoint, options = {}) {
      const url = this.buildURL(endpoint);
      const headers = this.buildHeaders(options.headers);

      const config = {
        ...options,
        headers,
        credentials: 'include' // For cookies if needed
      };

      try {
        const response = await fetch(url, config);

        // Handle 401 - token expired
        if (response.status === 401) {
          this.tokens.clear();

          // Redirect to login if not already there
          if (!window.location.pathname.includes('login')) {
            window.location.href = '/login.html?session=expired';
          }

          throw new Error('Authentication required');
        }

        // Handle other errors
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
        }

        // Parse JSON response
        const data = await response.json();
        return data;

      } catch (error) {
        // Network errors
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
          console.error('Network error - API unavailable:', url);
          throw new Error('API unavailable - please check your connection');
        }

        // Re-throw with context
        console.error(`API Error [${endpoint}]:`, error);
        throw error;
      }
    }

    /**
     * Convenience methods
     */
    async get(endpoint, options = {}) {
      return this.request(endpoint, { ...options, method: 'GET' });
    }

    async post(endpoint, data, options = {}) {
      return this.request(endpoint, {
        ...options,
        method: 'POST',
        body: JSON.stringify(data)
      });
    }

    async put(endpoint, data, options = {}) {
      return this.request(endpoint, {
        ...options,
        method: 'PUT',
        body: JSON.stringify(data)
      });
    }

    async delete(endpoint, options = {}) {
      return this.request(endpoint, { ...options, method: 'DELETE' });
    }

    async patch(endpoint, data, options = {}) {
      return this.request(endpoint, {
        ...options,
        method: 'PATCH',
        body: JSON.stringify(data)
      });
    }

    /**
     * Authentication methods
     */
    async login(email, password) {
      const response = await this.post('/auth/login', { email, password });

      // Store token and user
      if (response.accessToken) {
        this.tokens.setToken(response.accessToken);
      }
      if (response.user) {
        this.tokens.setUser(response.user);
      }

      return response;
    }

    async deviceLogin(fingerprint) {
      const response = await this.post('/auth/device-login', { fingerprint });

      if (response.accessToken) {
        this.tokens.setToken(response.accessToken);
      }
      if (response.user) {
        this.tokens.setUser(response.user);
      }

      return response;
    }

    async logout() {
      try {
        await this.post('/auth/logout');
      } catch (e) {
        // Continue even if API call fails
        console.warn('Logout API call failed:', e);
      } finally {
        this.tokens.clear();
      }
    }

    /**
     * Health check
     */
    async healthCheck() {
      return this.get('/health');
    }

    /**
     * Set tenancy
     */
    setTenancy(orgId, siteId) {
      this.orgId = orgId;
      this.siteId = siteId;
      localStorage.setItem('NP_ORG_ID', orgId);
      localStorage.setItem('NP_SITE_ID', siteId);
    }

    /**
     * Get current config
     */
    getConfig() {
      return {
        apiBase: this.config.getBaseURL(),
        orgId: this.orgId,
        siteId: this.siteId,
        isAuthenticated: this.tokens.isAuthenticated(),
        user: this.tokens.getUser()
      };
    }
  }

  // Create global instance
  window.API = new APIClient();

  // Backwards compatibility
  window.api = (...args) => window.API.request(...args);
  window.apiGet = (...args) => window.API.get(...args);
  window.apiPost = (...args) => window.API.post(...args);

  console.log('[API-UNIFIED] Initialized v21.1.1-LYRA-FIX');
  console.log('[API-UNIFIED] Base URL:', window.API.getConfig().apiBase);
  console.log('[API-UNIFIED] Authenticated:', window.API.getConfig().isAuthenticated);

})(window);
