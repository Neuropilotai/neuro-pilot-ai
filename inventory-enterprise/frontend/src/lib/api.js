/**
 * Centralized API Client
 * Automatically includes auth headers and handles common errors
 *
 * @module api
 * @version 1.0.0
 */

import { getAuthHeader, logout, isTokenExpired } from './auth.js';

// API base URL from environment or default to localhost
const API_BASE_URL = typeof import.meta !== 'undefined'
  ? import.meta.env.VITE_API_URL || 'http://localhost:8083'
  : (window.__API_BASE_URL || 'http://localhost:8083');

/**
 * Centralized fetch wrapper with auth and error handling
 * @param {string} path - API endpoint path (e.g., '/inventory/low-stock')
 * @param {RequestInit} init - Fetch options
 * @returns {Promise<Response>} Fetch response
 */
export async function api(path, init = {}) {
  // Check for expired token before making request
  if (isTokenExpired()) {
    console.warn('⚠️  Token expired, logging out');
    logout();
    throw new Error('Authentication expired');
  }

  // Merge headers
  const headers = new Headers(init.headers || {});

  // Add auth header
  const authHeader = getAuthHeader();
  Object.entries(authHeader).forEach(([key, value]) => {
    headers.set(key, String(value));
  });

  // Set Content-Type if not already set and body is present
  if (init.body && !headers.has('Content-Type')) {
    if (typeof init.body === 'string') {
      headers.set('Content-Type', 'application/json');
    }
  }

  // Make request
  const url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;

  try {
    const response = await fetch(url, {
      ...init,
      headers,
      credentials: 'include' // Include cookies for future cookie-based auth
    });

    // Handle 401 Unauthorized
    if (response.status === 401) {
      console.warn('⚠️  Unauthorized request, logging out');
      logout();
      throw new Error('Unauthorized');
    }

    // Handle 403 Forbidden
    if (response.status === 403) {
      console.error('❌ Forbidden: Insufficient permissions');
      // Don't logout, just throw error
      throw new Error('Forbidden: You don\'t have permission to access this resource');
    }

    return response;
  } catch (error) {
    // Network error or other fetch failure
    if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
      console.error('❌ Network error: Cannot reach API server');
      throw new Error('Network error: Cannot reach server');
    }
    throw error;
  }
}

/**
 * GET request
 * @param {string} path - API endpoint path
 * @param {RequestInit} init - Additional fetch options
 * @returns {Promise<any>} Parsed JSON response
 */
export async function get(path, init = {}) {
  const response = await api(path, { ...init, method: 'GET' });
  return response.json();
}

/**
 * POST request
 * @param {string} path - API endpoint path
 * @param {any} data - Request body (will be JSON stringified)
 * @param {RequestInit} init - Additional fetch options
 * @returns {Promise<any>} Parsed JSON response
 */
export async function post(path, data, init = {}) {
  const response = await api(path, {
    ...init,
    method: 'POST',
    body: JSON.stringify(data)
  });
  return response.json();
}

/**
 * PUT request
 * @param {string} path - API endpoint path
 * @param {any} data - Request body (will be JSON stringified)
 * @param {RequestInit} init - Additional fetch options
 * @returns {Promise<any>} Parsed JSON response
 */
export async function put(path, data, init = {}) {
  const response = await api(path, {
    ...init,
    method: 'PUT',
    body: JSON.stringify(data)
  });
  return response.json();
}

/**
 * PATCH request
 * @param {string} path - API endpoint path
 * @param {any} data - Request body (will be JSON stringified)
 * @param {RequestInit} init - Additional fetch options
 * @returns {Promise<any>} Parsed JSON response
 */
export async function patch(path, data, init = {}) {
  const response = await api(path, {
    ...init,
    method: 'PATCH',
    body: JSON.stringify(data)
  });
  return response.json();
}

/**
 * DELETE request
 * @param {string} path - API endpoint path
 * @param {RequestInit} init - Additional fetch options
 * @returns {Promise<any>} Parsed JSON response
 */
export async function del(path, init = {}) {
  const response = await api(path, { ...init, method: 'DELETE' });
  return response.json();
}

/**
 * Upload file (multipart/form-data)
 * @param {string} path - API endpoint path
 * @param {FormData} formData - Form data with file
 * @param {RequestInit} init - Additional fetch options
 * @returns {Promise<any>} Parsed JSON response
 */
export async function upload(path, formData, init = {}) {
  // Don't set Content-Type for FormData - browser will set it with boundary
  const response = await api(path, {
    ...init,
    method: 'POST',
    body: formData
  });
  return response.json();
}

/**
 * Download file (returns blob)
 * @param {string} path - API endpoint path
 * @param {RequestInit} init - Additional fetch options
 * @returns {Promise<Blob>} File blob
 */
export async function download(path, init = {}) {
  const response = await api(path, { ...init, method: 'GET' });
  return response.blob();
}

// Export for browser console debugging
if (typeof window !== 'undefined') {
  window.__api = {
    api,
    get,
    post,
    put,
    patch,
    del,
    upload,
    download,
    baseUrl: API_BASE_URL
  };
}

export default {
  api,
  get,
  post,
  put,
  patch,
  del,
  delete: del,
  upload,
  download
};
