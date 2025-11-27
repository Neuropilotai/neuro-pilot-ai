// API Configuration
// This file is automatically updated during deployment
const API_CONFIG = {
    // Backend API URL - will be replaced during Railway build
    BASE_URL: window.RAILWAY_BACKEND_URL || 'https://resourceful-achievement-production.up.railway.app',

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
