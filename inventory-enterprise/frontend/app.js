// Authentication and app initialization
let currentUser = null;
let authToken = null;

// Check if user is already logged in
document.addEventListener('DOMContentLoaded', function() {
    authToken = localStorage.getItem('authToken');
    if (authToken) {
        validateToken();
    } else {
        showLogin();
    }

    // Setup login form
    const loginForm = document.getElementById('loginForm');
    const logoutBtn = document.getElementById('logoutBtn');

    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
});

function showLogin() {
    const loginContainer = document.getElementById('loginContainer');
    const dashboardContainer = document.getElementById('dashboardContainer');

    if (loginContainer) {
        loginContainer.classList.remove('u-hidden');
        loginContainer.classList.add('u-block');
    }
    if (dashboardContainer) {
        dashboardContainer.classList.add('u-hidden');
        dashboardContainer.classList.remove('u-block');
    }
}

function showDashboard() {
    const loginContainer = document.getElementById('loginContainer');
    const dashboardContainer = document.getElementById('dashboardContainer');

    if (loginContainer) {
        loginContainer.classList.add('u-hidden');
        loginContainer.classList.remove('u-block');
    }
    if (dashboardContainer) {
        dashboardContainer.classList.remove('u-hidden');
        dashboardContainer.classList.add('u-block');
    }
    loadDashboardData();
}

async function handleLogin(e) {
    e.preventDefault();

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('loginError');
    const loginBtn = document.getElementById('loginBtn');

    loginBtn.textContent = 'Logging in...';
    loginBtn.disabled = true;
    errorDiv.classList.remove('show');

    try {
        const response = await fetch(API_CONFIG.getUrl('login'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (response.ok) {
            authToken = data.accessToken;
            currentUser = data.user;
            localStorage.setItem('authToken', authToken);

            // Redirect owner users to owner console
            if (currentUser.role === 'owner') {
                window.location.href = '/owner-super-console.html';
            } else {
                showDashboard();
            }
        } else {
            showError(data.message || 'Login failed');
        }
    } catch (error) {
        showError('Network error: ' + error.message);
    } finally {
        loginBtn.textContent = 'Login';
        loginBtn.disabled = false;
    }
}

async function validateToken() {
    try {
        const response = await fetch(API_CONFIG.getUrl('me'), {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            currentUser = data.user;

            // Redirect owner users to owner console
            if (currentUser.role === 'owner') {
                window.location.href = '/owner-super-console.html';
            } else {
                showDashboard();
            }
        } else {
            // Token is invalid, clear it and show login
            console.log('Token validation failed:', response.status);
            localStorage.removeItem('authToken');
            authToken = null;
            showLogin();
        }
    } catch (error) {
        console.error('Token validation error:', error);
        localStorage.removeItem('authToken');
        authToken = null;
        showLogin();
    }
}

function handleLogout() {
    localStorage.removeItem('authToken');
    authToken = null;
    currentUser = null;
    showLogin();
}

function showError(message) {
    const errorDiv = document.getElementById('loginError');
    errorDiv.textContent = message;
    errorDiv.classList.add('show');
}

async function loadDashboardData() {
    if (currentUser) {
        document.getElementById('userInfo').textContent =
            `${currentUser.firstName} ${currentUser.lastName} (${currentUser.role})`;
    }

    try {
        const response = await fetch(API_CONFIG.getUrl('health'));
        const data = await response.json();
        document.getElementById('status').textContent = 'API Status: ' + data.status;

        // Load inventory data if user has permission
        if (currentUser && hasPermission('inventory:read')) {
            loadInventoryData();
        }
    } catch (error) {
        document.getElementById('status').textContent = 'Error: ' + error.message;
    }
}

async function loadInventoryData() {
    try {
        const response = await fetch(API_CONFIG.getUrl('inventory'), {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            const itemCount = data.items ? data.items.length : 0;
            document.getElementById('inventoryData').innerHTML =
                `<h3>Inventory Items: ${itemCount}</h3>`;
        }
    } catch (error) {
        console.error('Failed to load inventory:', error);
    }
}

function hasPermission(permission) {
    return currentUser && currentUser.permissions &&
           currentUser.permissions.includes(permission);
}
