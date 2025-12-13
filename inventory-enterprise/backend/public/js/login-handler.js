/**
 * Login Handler - CSP Compliant
 * Handles login form submission and backend status checking
 */

(function() {
  const form = document.getElementById('loginForm');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const loginBtn = document.getElementById('loginBtn');
  const errorDiv = document.getElementById('error');
  const successDiv = document.getElementById('success');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');

  // Check backend connectivity on load
  async function checkBackendStatus() {
    try {
      if (typeof API !== 'undefined' && typeof API.getHealth === 'function') {
        const health = await API.getHealth();
        statusDot.classList.add('connected');
        statusDot.classList.remove('disconnected');
        const apiBase = typeof CONFIG !== 'undefined' ? CONFIG.API_BASE_URL : window.location.origin;
        statusText.textContent = `Connected to ${apiBase.replace('https://', '').split('.')[0]}`;
      } else {
        // Fallback: try direct health check
        const healthUrl = '/health';
        const response = await fetch(healthUrl);
        if (response.ok) {
          statusDot.classList.add('connected');
          statusDot.classList.remove('disconnected');
          statusText.textContent = 'Connected';
        } else {
          throw new Error('Health check failed');
        }
      }
    } catch (error) {
      statusDot.classList.add('disconnected');
      statusDot.classList.remove('connected');
      statusText.textContent = 'Backend unavailable';
      console.error('Backend health check failed:', error);
    }
  }

  // Check if already logged in
  function checkExistingSession() {
    try {
      // Check for owner token first (from quick_login)
      const ownerToken = localStorage.getItem('np_owner_jwt');
      if (ownerToken) {
        try {
          const payload = JSON.parse(atob(ownerToken.split('.')[1]));
          const currentTime = Math.floor(Date.now() / 1000);
          if (payload.exp && payload.exp > currentTime) {
            // Valid owner token, redirect to console
            window.location.href = 'owner-super-console-v15.html';
            return;
          }
        } catch (e) {
          // Invalid token, clear it
          localStorage.removeItem('np_owner_jwt');
        }
      }

      // Check for regular token (from standard login)
      if (typeof CONFIG !== 'undefined' && !CONFIG.isTokenExpired()) {
        const user = CONFIG.getUser();
        if (user) {
          redirectToDashboard(user.role);
        }
      }
    } catch (error) {
      // Silently fail - user should login normally
      console.debug('Session check failed:', error);
    }
  }

  // Redirect based on role
  function redirectToDashboard(role) {
    const roleLower = (role || 'staff').toLowerCase();

    switch (roleLower) {
      case 'owner':
      case 'admin':
        window.location.href = 'owner-super-console-v15.html';
        break;
      case 'manager':
        window.location.href = 'owner-super-console-v15.html';
        break;
      case 'staff':
        window.location.href = 'pos.html';
        break;
      default:
        window.location.href = 'owner-super-console-v15.html';
    }
  }

  // Handle login form submission
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const email = emailInput.value.trim();
      const password = passwordInput.value;

      if (!email || !password) {
        showError('Please enter both email and password.');
        return;
      }

      // Disable button and show loading
      loginBtn.disabled = true;
      loginBtn.innerHTML = '<span class="spinner"></span>Signing in...';
      hideAlerts();

      try {
        const data = await API.login(email, password);

        // Store token in both formats for compatibility
        if (data.accessToken) {
          localStorage.setItem('NP_TOKEN', data.accessToken);
          // Also store as np_owner_jwt if user is owner/admin
          if (data.user && (data.user.role === 'owner' || data.user.role === 'admin')) {
            localStorage.setItem('np_owner_jwt', data.accessToken);
          }
        }

        showSuccess(`Welcome back, ${data.user.email}! Redirecting...`);

        setTimeout(() => {
          redirectToDashboard(data.user.role);
        }, 800);

      } catch (error) {
        console.error('Login error:', error);
        showError(error.message || 'Login failed. Please check your credentials.');
        loginBtn.disabled = false;
        loginBtn.innerHTML = 'Sign In';
      }
    });
  }

  function showError(message) {
    if (errorDiv) {
      errorDiv.textContent = message;
      errorDiv.style.display = 'block';
      if (successDiv) successDiv.style.display = 'none';
    }
  }

  function showSuccess(message) {
    if (successDiv) {
      successDiv.textContent = message;
      successDiv.style.display = 'block';
      if (errorDiv) errorDiv.style.display = 'none';
    }
  }

  function hideAlerts() {
    if (errorDiv) errorDiv.style.display = 'none';
    if (successDiv) successDiv.style.display = 'none';
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      checkBackendStatus();
      checkExistingSession();
    });
  } else {
    // DOM already loaded
    checkBackendStatus();
    checkExistingSession();
  }
})();


