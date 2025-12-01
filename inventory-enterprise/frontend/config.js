// API Configuration
// This file is automatically updated during deployment
const API_CONFIG = {
    // Backend API URL - V22.3: Canonical domain - api.neuropilot.dev
    BASE_URL: (function() {
        const currentHost = window.location.hostname;
        if (currentHost.includes('railway.app') || currentHost.includes('localhost') || currentHost === '127.0.0.1' || currentHost === 'api.neuropilot.dev') {
            return ''; // Same-origin - no CORS issues
        }
        return window.NP_API_URL || 'https://api.neuropilot.dev';
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
