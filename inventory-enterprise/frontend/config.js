// API Configuration
// This file is automatically updated during deployment
const API_CONFIG = {
    // Backend API URL - V22.2: Use same-origin when served from backend
    BASE_URL: (function() {
        const currentHost = window.location.hostname;
        if (currentHost.includes('railway.app') || currentHost.includes('localhost') || currentHost === '127.0.0.1') {
            return ''; // Same-origin - no CORS issues
        }
        return window.RAILWAY_BACKEND_URL || 'https://inventory-backend-production-3a2c.up.railway.app';
    })(),

    // API endpoints
    endpoints: {
        login: '/api/auth/login',
        me: '/api/auth/me',
        health: '/health',
        inventory: '/api/inventory/items',
        security: '/api/security/status',
        metrics: '/metrics'
    },

    // Helper function to get full API URL
    getUrl: function(endpoint) {
        return this.BASE_URL + (this.endpoints[endpoint] || endpoint);
    }
};

// For development, allow override via localStorage
if (localStorage.getItem('API_BASE_URL')) {
    API_CONFIG.BASE_URL = localStorage.getItem('API_BASE_URL');
    console.log('[Config] Using custom API URL:', API_CONFIG.BASE_URL);
}
