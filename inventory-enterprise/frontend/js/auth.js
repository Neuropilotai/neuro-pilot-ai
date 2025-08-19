// Authentication handling

// Login form handler
document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    
    if (registerForm) {
        registerForm.addEventListener('submit', handleRegister);
    }
});

// Login function
async function handleLogin(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const loginData = {
        email: formData.get('email').trim().toLowerCase(),
        password: formData.get('password')
    };
    
    // Basic validation
    if (!loginData.email || !loginData.password) {
        showAuthError('loginError', 'Please fill in all fields');
        return;
    }
    
    if (!isValidEmail(loginData.email)) {
        showAuthError('loginError', 'Please enter a valid email address');
        return;
    }
    
    try {
        showLoading();
        
        const response = await fetch(`${APP_CONFIG.API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(loginData)
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Login failed');
        }
        
        // Store token and user data
        setToken(data.accessToken);
        localStorage.setItem(APP_CONFIG.USER_KEY, JSON.stringify(data.user));
        
        // Set current user and show main app
        currentUser = data.user;
        hideAuthError('loginError');
        showMainApp();
        
        showToast('Login successful!', 'success');
        
    } catch (error) {
        console.error('Login error:', error);
        showAuthError('loginError', error.message);
    } finally {
        hideLoading();
    }
}

// Register function
async function handleRegister(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const registerData = {
        firstName: formData.get('firstName').trim(),
        lastName: formData.get('lastName').trim(),
        email: formData.get('email').trim().toLowerCase(),
        password: formData.get('password'),
        role: formData.get('role') || 'staff'
    };
    
    // Validation
    const validation = validateRegistrationData(registerData);
    if (!validation.isValid) {
        showAuthError('registerError', validation.error);
        return;
    }
    
    try {
        showLoading();
        
        const response = await fetch(`${APP_CONFIG.API_BASE_URL}/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(registerData)
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            if (data.details && Array.isArray(data.details)) {
                // Show validation errors
                const errorMessage = data.details.map(detail => detail.msg).join(', ');
                throw new Error(errorMessage);
            }
            throw new Error(data.error || 'Registration failed');
        }
        
        hideAuthError('registerError');
        showLoginForm();
        showToast('Account created successfully! Please log in.', 'success');
        
        // Pre-fill login form with registered email
        document.getElementById('loginEmail').value = registerData.email;
        
    } catch (error) {
        console.error('Registration error:', error);
        showAuthError('registerError', error.message);
    } finally {
        hideLoading();
    }
}

// Change password function
async function changePassword() {
    const currentPassword = prompt('Enter your current password:');
    if (!currentPassword) return;
    
    const newPassword = prompt('Enter your new password (min 8 characters):');
    if (!newPassword) return;
    
    const confirmPassword = prompt('Confirm your new password:');
    if (newPassword !== confirmPassword) {
        showToast('Passwords do not match', 'error');
        return;
    }
    
    // Validate new password
    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.isValid) {
        showToast(passwordValidation.errors.join(', '), 'error');
        return;
    }
    
    try {
        showLoading();
        
        const response = await fetch(`${APP_CONFIG.API_BASE_URL}/auth/change-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify({
                currentPassword,
                newPassword
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Password change failed');
        }
        
        showToast('Password changed successfully', 'success');
        
    } catch (error) {
        console.error('Password change error:', error);
        showToast(error.message, 'error');
    } finally {
        hideLoading();
    }
}

// Show user profile
function showProfile() {
    if (!currentUser) return;
    
    const profileInfo = `
        <div class="profile-info">
            <h3>Profile Information</h3>
            <p><strong>Name:</strong> ${currentUser.firstName} ${currentUser.lastName}</p>
            <p><strong>Email:</strong> ${currentUser.email}</p>
            <p><strong>Role:</strong> ${currentUser.role}</p>
            <p><strong>Last Login:</strong> ${currentUser.lastLogin ? new Date(currentUser.lastLogin).toLocaleString() : 'N/A'}</p>
            <p><strong>Account Created:</strong> ${new Date(currentUser.createdAt).toLocaleString()}</p>
        </div>
    `;
    
    // Create a simple modal for profile display
    const modal = document.createElement('div');
    modal.className = 'modal show';
    modal.innerHTML = `
        <div class="modal-header">
            <h3>User Profile</h3>
            <button class="modal-close" onclick="this.closest('.modal').remove(); document.getElementById('modalOverlay').classList.remove('show')">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <div class="modal-content">
            ${profileInfo}
        </div>
    `;
    
    document.body.appendChild(modal);
    document.getElementById('modalOverlay').classList.add('show');
}

// Validation functions
function validateRegistrationData(data) {
    if (!data.firstName || data.firstName.length < 1) {
        return { isValid: false, error: 'First name is required' };
    }
    
    if (!data.lastName || data.lastName.length < 1) {
        return { isValid: false, error: 'Last name is required' };
    }
    
    if (!data.email || !isValidEmail(data.email)) {
        return { isValid: false, error: 'Valid email address is required' };
    }
    
    const passwordValidation = validatePassword(data.password);
    if (!passwordValidation.isValid) {
        return { isValid: false, error: passwordValidation.errors.join(', ') };
    }
    
    return { isValid: true };
}

function validatePassword(password) {
    const errors = [];
    
    if (!password || password.length < 8) {
        errors.push('Password must be at least 8 characters long');
    }
    
    if (!/[A-Z]/.test(password)) {
        errors.push('Password must contain at least one uppercase letter');
    }
    
    if (!/[a-z]/.test(password)) {
        errors.push('Password must contain at least one lowercase letter');
    }
    
    if (!/\d/.test(password)) {
        errors.push('Password must contain at least one number');
    }
    
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
        errors.push('Password must contain at least one special character');
    }
    
    return {
        isValid: errors.length === 0,
        errors
    };
}

function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Auth error handling
function showAuthError(elementId, message) {
    const errorElement = document.getElementById(elementId);
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.classList.add('show');
    }
}

function hideAuthError(elementId) {
    const errorElement = document.getElementById(elementId);
    if (errorElement) {
        errorElement.classList.remove('show');
    }
}

// Token refresh function
async function refreshToken() {
    try {
        const response = await fetch(`${APP_CONFIG.API_BASE_URL}/auth/refresh`, {
            method: 'POST',
            credentials: 'include', // Include cookies
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error('Token refresh failed');
        }
        
        const data = await response.json();
        setToken(data.accessToken);
        
        return data.accessToken;
    } catch (error) {
        console.error('Token refresh failed:', error);
        clearAuth();
        showLoginForm();
        throw error;
    }
}

// Auto token refresh
let tokenRefreshInterval;

function startTokenRefresh() {
    // Refresh token every 10 minutes (token expires in 15 minutes)
    tokenRefreshInterval = setInterval(async () => {
        try {
            await refreshToken();
            console.log('Token refreshed automatically');
        } catch (error) {
            console.error('Auto token refresh failed:', error);
            clearInterval(tokenRefreshInterval);
        }
    }, 10 * 60 * 1000); // 10 minutes
}

function stopTokenRefresh() {
    if (tokenRefreshInterval) {
        clearInterval(tokenRefreshInterval);
        tokenRefreshInterval = null;
    }
}

// Session management
function checkSession() {
    const token = getToken();
    if (!token) {
        showLoginForm();
        return false;
    }
    
    // Check if token is expired (basic check - in production use JWT decode)
    try {
        const tokenData = JSON.parse(atob(token.split('.')[1]));
        const currentTime = Math.floor(Date.now() / 1000);
        
        if (tokenData.exp < currentTime) {
            // Token expired
            clearAuth();
            showLoginForm();
            showToast('Session expired. Please log in again.', 'warning');
            return false;
        }
        
        return true;
    } catch (error) {
        // Invalid token format
        clearAuth();
        showLoginForm();
        return false;
    }
}

// Handle session expiry
function handleSessionExpiry() {
    clearAuth();
    stopTokenRefresh();
    showLoginForm();
    showToast('Your session has expired. Please log in again.', 'warning');
}

// Check session periodically
setInterval(() => {
    if (currentUser && !checkSession()) {
        handleSessionExpiry();
    }
}, 60000); // Check every minute

// Start token refresh when user logs in successfully
function startSession() {
    startTokenRefresh();
}

// Stop token refresh when user logs out
function endSession() {
    stopTokenRefresh();
}

// Enhanced logout function
async function enhancedLogout() {
    try {
        await logout();
        endSession();
    } catch (error) {
        console.error('Logout error:', error);
        // Force logout even if API call fails
        clearAuth();
        endSession();
        showLoginForm();
    }
}

// Export authentication functions
window.AUTH = {
    handleLogin,
    handleRegister,
    changePassword,
    showProfile,
    refreshToken,
    checkSession,
    startSession,
    endSession,
    enhancedLogout,
    validatePassword,
    isValidEmail
};