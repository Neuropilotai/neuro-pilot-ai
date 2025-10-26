/**
 * Centralized Authentication Module
 * Manages JWT tokens with in-memory + localStorage persistence
 *
 * @module auth
 * @version 1.0.0
 */

const TOKEN_KEY = "authToken";
const LEGACY_TOKEN_KEY = "ownerToken"; // For migration

let inMemoryToken = null;

/**
 * Set authentication token (persists to localStorage)
 * @param {string|null} token - JWT token or null to clear
 */
export function setToken(token) {
  inMemoryToken = token;
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
    // Clean up legacy token
    localStorage.removeItem(LEGACY_TOKEN_KEY);
    sessionStorage.removeItem(LEGACY_TOKEN_KEY);
  } else {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(LEGACY_TOKEN_KEY);
    sessionStorage.removeItem(LEGACY_TOKEN_KEY);
  }
}

/**
 * Get authentication token (from memory or localStorage)
 * @returns {string|null} JWT token or null
 */
export function getToken() {
  // Check in-memory cache first
  if (inMemoryToken) return inMemoryToken;

  // Check localStorage
  let token = localStorage.getItem(TOKEN_KEY);

  // Migration: Check legacy keys if new key not found
  if (!token) {
    token = localStorage.getItem(LEGACY_TOKEN_KEY) || sessionStorage.getItem(LEGACY_TOKEN_KEY);
    if (token) {
      // Migrate to new key
      setToken(token);
      console.log('✅ Migrated token from legacy storage');
    }
  }

  // Cache in memory
  inMemoryToken = token;
  return token;
}

/**
 * Get Authorization header object
 * @returns {Object} Header object with Authorization or empty object
 */
export function getAuthHeader() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Check if user is authenticated
 * @returns {boolean} True if valid token exists
 */
export function isAuthenticated() {
  return !!getToken();
}

/**
 * Decode JWT token (without verification - client-side only)
 * @returns {Object|null} Decoded payload or null
 */
export function getTokenPayload() {
  const token = getToken();
  if (!token) return null;

  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    console.error('Failed to decode token:', e);
    return null;
  }
}

/**
 * Get current user info from token
 * @returns {Object|null} User object { id, email, role } or null
 */
export function getCurrentUser() {
  const payload = getTokenPayload();
  if (!payload) return null;

  return {
    id: payload.id || payload.sub,
    email: payload.email,
    role: payload.role
  };
}

/**
 * Check if token is expired
 * @returns {boolean} True if token is expired or invalid
 */
export function isTokenExpired() {
  const payload = getTokenPayload();
  if (!payload || !payload.exp) return true;

  // Check if expired (with 60 second buffer)
  return Date.now() >= payload.exp * 1000 - 60000;
}

/**
 * Logout user (clears token and redirects)
 * @param {boolean} redirect - Whether to redirect to login (default: true)
 */
export function logout(redirect = true) {
  inMemoryToken = null;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(LEGACY_TOKEN_KEY);
  sessionStorage.removeItem(LEGACY_TOKEN_KEY);

  if (redirect && typeof window !== 'undefined') {
    // Redirect to login or home
    window.location.href = '/login.html';
  }
}

/**
 * Initialize auth module (check for expired tokens)
 */
export function initAuth() {
  if (isAuthenticated() && isTokenExpired()) {
    console.warn('⚠️  Token expired, logging out');
    logout(false); // Don't redirect if on login page
  }
}

// Auto-initialize on import
if (typeof window !== 'undefined') {
  initAuth();
}

// Export for direct access in browser console (dev/debugging only)
if (typeof window !== 'undefined') {
  window.__auth = {
    setToken,
    getToken,
    logout,
    getCurrentUser,
    isAuthenticated
  };
}

/**
 * Automatically refresh token if expired or about to expire
 * @param {string} baseUrl - API base URL
 * @returns {Promise<string>} Valid access token
 * @throws {Error} If refresh fails or no refresh token available
 */
export async function refreshIfNeeded(baseUrl) {
  const token = getToken();

  // If token is valid and not expired, return it
  if (token && !isTokenExpired()) {
    return token;
  }

  // Get refresh token
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) {
    logout();
    throw new Error('no_refresh_token');
  }

  try {
    // Request new tokens
    const response = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      credentials: 'include'
    });

    if (!response.ok) {
      logout();
      throw new Error('refresh_failed');
    }

    const data = await response.json();

    // Update tokens
    setToken(data.token);
    if (data.refreshToken) {
      localStorage.setItem('refreshToken', data.refreshToken);
    }

    return data.token;
  } catch (error) {
    logout();
    throw error;
  }
}

export default {
  setToken,
  getToken,
  getAuthHeader,
  isAuthenticated,
  getCurrentUser,
  getTokenPayload,
  isTokenExpired,
  logout,
  initAuth,
  refreshIfNeeded
};
