// Global Application State
const APP_CONFIG = {
    API_BASE_URL: 'http://localhost:3001/api',
    TOKEN_KEY: 'inventory_access_token',
    USER_KEY: 'inventory_user_data'
};

let currentUser = null;
let currentView = 'dashboard';

// Initialize Application
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

async function initializeApp() {
    try {
        // Check if user is logged in
        const token = getToken();
        if (!token) {
            showLoginForm();
            return;
        }

        // Validate token and get user info
        const userInfo = await getCurrentUser();
        if (!userInfo) {
            clearAuth();
            showLoginForm();
            return;
        }

        currentUser = userInfo;
        showMainApp();
        await loadDashboardData();
        
    } catch (error) {
        console.error('App initialization failed:', error);
        showLoginForm();
    }
}

// Authentication Functions
function getToken() {
    return localStorage.getItem(APP_CONFIG.TOKEN_KEY);
}

function setToken(token) {
    localStorage.setItem(APP_CONFIG.TOKEN_KEY, token);
}

function clearAuth() {
    localStorage.removeItem(APP_CONFIG.TOKEN_KEY);
    localStorage.removeItem(APP_CONFIG.USER_KEY);
    currentUser = null;
}

async function getCurrentUser() {
    try {
        const response = await fetch(`${APP_CONFIG.API_BASE_URL}/auth/me`, {
            headers: {
                'Authorization': `Bearer ${getToken()}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error('Failed to get user info');
        }

        const data = await response.json();
        return data.user;
    } catch (error) {
        console.error('Failed to get current user:', error);
        return null;
    }
}

// UI Navigation Functions
function showLoginForm() {
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('registerScreen').style.display = 'none';
    document.getElementById('mainApp').style.display = 'none';
}

function showRegisterForm() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('registerScreen').style.display = 'flex';
    document.getElementById('mainApp').style.display = 'none';
}

function showMainApp() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('registerScreen').style.display = 'none';
    document.getElementById('mainApp').style.display = 'block';
    
    updateUserInterface();
    setActiveView('dashboard');
}

function updateUserInterface() {
    if (!currentUser) return;

    // Update user display
    document.getElementById('userName').textContent = currentUser.firstName;
    document.getElementById('userFullName').textContent = `${currentUser.firstName} ${currentUser.lastName}`;
    document.getElementById('userRole').textContent = currentUser.role;

    // Show/hide admin features
    const adminElements = document.querySelectorAll('.admin-only');
    adminElements.forEach(el => {
        if (currentUser.role === 'admin') {
            el.style.display = '';
        } else {
            el.style.display = 'none';
        }
    });
}

// View Management
function setActiveView(viewName) {
    // Update navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // Hide all views
    document.querySelectorAll('.view').forEach(view => {
        view.style.display = 'none';
    });
    
    // Show selected view
    const targetView = document.getElementById(`${viewName}View`);
    if (targetView) {
        targetView.style.display = 'block';
        currentView = viewName;
    }
}

function showDashboard() {
    setActiveView('dashboard');
    document.querySelector('[onclick="showDashboard()"]').classList.add('active');
    loadDashboardData();
}

function showInventory() {
    setActiveView('inventory');
    document.querySelector('[onclick="showInventory()"]').classList.add('active');
    loadInventoryData();
}

function showLocations() {
    setActiveView('locations');
    document.querySelector('[onclick="showLocations()"]').classList.add('active');
    loadLocationsData();
}

function showTransfers() {
    setActiveView('transfers');
    document.querySelector('[onclick="showTransfers()"]').classList.add('active');
    loadTransfersData();
}

function showReports() {
    setActiveView('reports');
    document.querySelector('[onclick="showReports()"]').classList.add('active');
    loadReportsData();
}

function showUsers() {
    if (currentUser.role !== 'admin') {
        showToast('Access denied. Admin privileges required.', 'error');
        return;
    }
    setActiveView('users');
    document.querySelector('[onclick="showUsers()"]').classList.add('active');
    loadUsersData();
}

// Dashboard Functions
async function loadDashboardData() {
    try {
        showLoading();
        
        // Load inventory summary
        const response = await apiRequest('/inventory/items?limit=1000');
        const inventoryData = response.data || response;
        
        // Update stats
        updateDashboardStats(inventoryData);
        
        hideLoading();
    } catch (error) {
        console.error('Failed to load dashboard data:', error);
        showToast('Failed to load dashboard data', 'error');
        hideLoading();
    }
}

function updateDashboardStats(data) {
    const items = data.items || [];
    const summary = data.summary || {};
    
    // Update stats cards
    document.getElementById('totalItems').textContent = summary.totalItems || items.length || 0;
    document.getElementById('lowStockItems').textContent = summary.lowStockItems || 0;
    document.getElementById('totalValue').textContent = formatCurrency(summary.totalValue || 0);
    document.getElementById('locationCount').textContent = summary.locations || 0;
}

function refreshDashboard() {
    loadDashboardData();
    showToast('Dashboard refreshed', 'success');
}

// Inventory Functions
async function loadInventoryData() {
    try {
        showLoading();
        
        const response = await apiRequest('/inventory/items');
        const data = response.data || response;
        
        displayInventoryTable(data.items || []);
        updateInventoryPagination(data.pagination || {});
        loadFilterOptions(data.items || []);
        
        hideLoading();
    } catch (error) {
        console.error('Failed to load inventory:', error);
        showToast('Failed to load inventory data', 'error');
        hideLoading();
    }
}

function displayInventoryTable(items) {
    const tbody = document.getElementById('inventoryTableBody');
    tbody.innerHTML = '';
    
    items.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>
                <div class="item-info">
                    <div class="item-name">${escapeHtml(item.name)}</div>
                    <div class="item-code text-muted">${escapeHtml(item.supplierCode || '')}</div>
                </div>
            </td>
            <td>${escapeHtml(item.category)}</td>
            <td>
                ${item.quantity} ${escapeHtml(item.unit)}
                ${item.minQuantity ? `<br><small class="text-muted">Min: ${item.minQuantity}</small>` : ''}
            </td>
            <td>
                <div class="location-info">
                    <div>${escapeHtml(item.locationDetails?.name || item.location)}</div>
                    <small class="text-muted">${escapeHtml(item.locationDetails?.type || '')}</small>
                </div>
            </td>
            <td>${formatCurrency(item.totalValue || 0)}</td>
            <td>
                <span class="status-badge status-${getStatusClass(item.stockStatus)}">
                    ${getStatusLabel(item.stockStatus)}
                </span>
            </td>
            <td>
                <div class="action-buttons">
                    <button class="action-btn" onclick="editItem('${item.id}')" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn" onclick="showTransferModal('${item.id}')" title="Transfer">
                        <i class="fas fa-exchange-alt"></i>
                    </button>
                    <button class="action-btn danger" onclick="deleteItem('${item.id}')" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function loadFilterOptions(items) {
    // Load categories
    const categories = [...new Set(items.map(item => item.category))].sort();
    const categorySelect = document.getElementById('categoryFilter');
    categorySelect.innerHTML = '<option value="">All Categories</option>';
    categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        categorySelect.appendChild(option);
    });
    
    // Load locations
    const locations = [...new Set(items.map(item => item.location))].sort();
    const locationSelect = document.getElementById('locationFilter');
    locationSelect.innerHTML = '<option value="">All Locations</option>';
    locations.forEach(location => {
        const option = document.createElement('option');
        option.value = location;
        option.textContent = location;
        locationSelect.appendChild(option);
    });
}

// Modal Functions
function showModal(modalId) {
    document.getElementById('modalOverlay').classList.add('show');
    document.getElementById(modalId).classList.add('show');
}

function closeModal() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.classList.remove('show');
    });
    document.getElementById('modalOverlay').classList.remove('show');
}

function showAddItemModal() {
    document.getElementById('itemModalTitle').textContent = 'Add New Item';
    document.getElementById('itemForm').reset();
    loadLocationOptions();
    showModal('itemModal');
}

async function loadLocationOptions() {
    try {
        const response = await apiRequest('/inventory/locations');
        const locations = response.locations || [];
        
        const selects = ['itemLocation', 'fromLocation', 'toLocation'];
        selects.forEach(selectId => {
            const select = document.getElementById(selectId);
            if (select) {
                select.innerHTML = '<option value="">Select Location</option>';
                locations.forEach(location => {
                    const option = document.createElement('option');
                    option.value = location.id;
                    option.textContent = location.name;
                    select.appendChild(option);
                });
            }
        });
    } catch (error) {
        console.error('Failed to load locations:', error);
    }
}

// Utility Functions
function showLoading() {
    document.getElementById('loadingSpinner').style.display = 'flex';
}

function hideLoading() {
    document.getElementById('loadingSpinner').style.display = 'none';
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <i class="fas fa-${getToastIcon(type)}"></i>
        <div class="toast-message">${escapeHtml(message)}</div>
        <button class="toast-close" onclick="this.parentElement.remove()">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    container.appendChild(toast);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (toast.parentElement) {
            toast.remove();
        }
    }, 5000);
}

function getToastIcon(type) {
    const icons = {
        success: 'check-circle',
        error: 'exclamation-circle',
        warning: 'exclamation-triangle',
        info: 'info-circle'
    };
    return icons[type] || 'info-circle';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(amount);
}

function getStatusClass(status) {
    const statusMap = {
        'normal': 'normal',
        'low_stock': 'low',
        'out_of_stock': 'out'
    };
    return statusMap[status] || 'normal';
}

function getStatusLabel(status) {
    const labelMap = {
        'normal': 'Normal',
        'low_stock': 'Low Stock',
        'out_of_stock': 'Out of Stock'
    };
    return labelMap[status] || 'Normal';
}

// API Request Helper
async function apiRequest(endpoint, options = {}) {
    const url = `${APP_CONFIG.API_BASE_URL}${endpoint}`;
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getToken()}`
        }
    };
    
    const requestOptions = {
        ...defaultOptions,
        ...options,
        headers: {
            ...defaultOptions.headers,
            ...options.headers
        }
    };
    
    try {
        const response = await fetch(url, requestOptions);
        
        if (!response.ok) {
            if (response.status === 401) {
                // Token expired or invalid
                clearAuth();
                showLoginForm();
                throw new Error('Authentication required');
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('API request failed:', error);
        throw error;
    }
}

// User Menu Functions
function toggleUserMenu() {
    const dropdown = document.getElementById('userDropdown');
    dropdown.classList.toggle('show');
}

// Close dropdowns when clicking outside
document.addEventListener('click', function(event) {
    const userMenu = document.querySelector('.user-menu');
    const dropdown = document.getElementById('userDropdown');
    
    if (!userMenu.contains(event.target)) {
        dropdown.classList.remove('show');
    }
});

// Logout Function
async function logout() {
    try {
        // Call logout endpoint
        await apiRequest('/auth/logout', {
            method: 'POST'
        });
    } catch (error) {
        console.error('Logout request failed:', error);
    } finally {
        clearAuth();
        showLoginForm();
        showToast('Logged out successfully', 'success');
    }
}

// Password toggle function
function togglePassword(inputId) {
    const input = document.getElementById(inputId);
    const button = input.parentElement.querySelector('.password-toggle i');
    
    if (input.type === 'password') {
        input.type = 'text';
        button.className = 'fas fa-eye-slash';
    } else {
        input.type = 'password';
        button.className = 'fas fa-eye';
    }
}

// Global error handler
window.addEventListener('error', function(event) {
    console.error('Global error:', event.error);
    showToast('An unexpected error occurred', 'error');
});

// Handle unhandled promise rejections
window.addEventListener('unhandledrejection', function(event) {
    console.error('Unhandled promise rejection:', event.reason);
    showToast('An unexpected error occurred', 'error');
});

// Export functions for use in other files
window.APP = {
    showModal,
    closeModal,
    showToast,
    apiRequest,
    formatCurrency,
    escapeHtml,
    getCurrentUser,
    updateUserInterface
};