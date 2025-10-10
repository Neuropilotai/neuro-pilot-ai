import axios from 'axios';
import toast from 'react-hot-toast';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

class ApiService {
  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor to add auth token
    this.client.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('auth_token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }

        const tenantId = localStorage.getItem('tenant_id');
        if (tenantId) {
          config.headers['X-Tenant-Id'] = tenantId;
        }

        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          localStorage.removeItem('auth_token');
          localStorage.removeItem('user');
          window.location.href = '/login';
        }

        const message = error.response?.data?.error || error.message || 'An error occurred';
        toast.error(message);

        return Promise.reject(error);
      }
    );
  }

  // Authentication
  async login(email, password) {
    const { data } = await this.client.post('/auth/login', { email, password });
    if (data.accessToken) {
      localStorage.setItem('auth_token', data.accessToken);
      localStorage.setItem('user', JSON.stringify(data.user));
      if (data.user.tenantId) {
        localStorage.setItem('tenant_id', data.user.tenantId);
      }
    }
    return data;
  }

  async verify2FA(userId, code) {
    const { data } = await this.client.post('/auth/2fa/verify', { userId, code });
    if (data.accessToken) {
      localStorage.setItem('auth_token', data.accessToken);
      localStorage.setItem('user', JSON.stringify(data.user));
      if (data.user.tenantId) {
        localStorage.setItem('tenant_id', data.user.tenantId);
      }
    }
    return data;
  }

  async logout() {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');
    localStorage.removeItem('tenant_id');
  }

  // Metrics
  async getMetrics() {
    const { data } = await this.client.get('/metrics');
    return this.parsePrometheusMetrics(data);
  }

  parsePrometheusMetrics(text) {
    const lines = text.split('\n');
    const metrics = {};

    for (const line of lines) {
      if (line.startsWith('#') || line.trim() === '') continue;

      const match = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)\{?([^}]*)\}?\s+([0-9.e+-]+)/);
      if (match) {
        const [, name, labels, value] = match;
        const labelPairs = {};

        if (labels) {
          labels.split(',').forEach(pair => {
            const [key, val] = pair.split('=');
            if (key && val) {
              labelPairs[key.trim()] = val.replace(/"/g, '').trim();
            }
          });
        }

        if (!metrics[name]) {
          metrics[name] = [];
        }

        metrics[name].push({
          labels: labelPairs,
          value: parseFloat(value),
        });
      }
    }

    return metrics;
  }

  // Tenants
  async getTenants(params = {}) {
    const { data } = await this.client.get('/tenants', { params });
    return data;
  }

  async getTenant(id) {
    const { data } = await this.client.get(`/tenants/${id}`);
    return data;
  }

  async createTenant(tenant) {
    const { data } = await this.client.post('/tenants', tenant);
    return data;
  }

  async updateTenant(id, updates) {
    const { data } = await this.client.put(`/tenants/${id}`, updates);
    return data;
  }

  async deleteTenant(id) {
    const { data } = await this.client.delete(`/tenants/${id}`);
    return data;
  }

  // Roles
  async getRoles(params = {}) {
    const { data } = await this.client.get('/roles', { params });
    return data;
  }

  async getRole(id) {
    const { data } = await this.client.get(`/roles/${id}`);
    return data;
  }

  async createRole(role) {
    const { data } = await this.client.post('/roles', role);
    return data;
  }

  async updateRole(id, updates) {
    const { data } = await this.client.put(`/roles/${id}`, updates);
    return data;
  }

  async deleteRole(id) {
    const { data } = await this.client.delete(`/roles/${id}`);
    return data;
  }

  async getPermissions() {
    const { data } = await this.client.get('/permissions');
    return data;
  }

  async getRolePermissions(roleId) {
    const { data } = await this.client.get(`/roles/${roleId}/permissions`);
    return data;
  }

  async updateRolePermissions(roleId, permissions) {
    const { data } = await this.client.put(`/roles/${roleId}/permissions`, { permissions });
    return data;
  }

  // AI & Forecasting
  async getForecasts(params = {}) {
    const { data } = await this.client.get('/ai/forecast', { params });
    return data;
  }

  async getForecast(itemCode) {
    const { data } = await this.client.get(`/ai/forecast/${itemCode}`);
    return data;
  }

  async getFeedbackMetrics(itemCode, window = 7) {
    const { data } = await this.client.get(`/ai/feedback/${itemCode}/metrics`, {
      params: { window },
    });
    return data;
  }

  async getAIPolicies(params = {}) {
    const { data } = await this.client.get('/ai/policy', { params });
    return data;
  }

  async getAIPolicy(itemCode) {
    const { data } = await this.client.get(`/ai/policy/${itemCode}`);
    return data;
  }

  // Inventory
  async getInventoryItems(params = {}) {
    const { data } = await this.client.get('/inventory/items', { params });
    return data;
  }

  async getInventoryReports(params = {}) {
    const { data } = await this.client.get('/inventory/reports', { params });
    return data;
  }

  // Security & Audit
  async getAuditLogs(params = {}) {
    const { data } = await this.client.get('/audit/logs', { params });
    return data;
  }

  async getRBACDenials(params = {}) {
    const { data } = await this.client.get('/audit/rbac-denials', { params });
    return data;
  }

  async getActiveSessions(params = {}) {
    const { data } = await this.client.get('/auth/sessions', { params });
    return data;
  }

  // Users
  async getUsers(params = {}) {
    const { data } = await this.client.get('/users', { params });
    return data;
  }

  async getUser(id) {
    const { data } = await this.client.get(`/users/${id}`);
    return data;
  }

  async createUser(user) {
    const { data } = await this.client.post('/users', user);
    return data;
  }

  async updateUser(id, updates) {
    const { data } = await this.client.put(`/users/${id}`, updates);
    return data;
  }

  async deleteUser(id) {
    const { data } = await this.client.delete(`/users/${id}`);
    return data;
  }

  // Inventory Counts (NEW)
  async getLocations() {
    const { data } = await this.client.get('/inventory/locations');
    return data;
  }

  async searchInventoryItems(query) {
    const { data } = await this.client.get('/inventory/search', { params: { q: query } });
    return data;
  }

  async saveDraftCount(countData) {
    const { data } = await this.client.post('/inventory/counts/draft', countData);
    return data;
  }

  async submitCountForApproval(countData) {
    const { data } = await this.client.post('/inventory/counts/submit', countData);
    return data;
  }

  async getPendingCounts() {
    const { data } = await this.client.get('/inventory/counts/pending');
    return data;
  }

  async approveCount(countId, approved, notes) {
    const { data } = await this.client.post('/inventory/counts/approve', {
      countId,
      approved,
      notes,
    });
    return data;
  }

  async getCountHistory(params = {}) {
    const { data } = await this.client.get('/inventory/counts/history', { params });
    return data;
  }
}

export const api = new ApiService();
export default api;
