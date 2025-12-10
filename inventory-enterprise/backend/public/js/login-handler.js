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
      const health = await API.getHealth();
      statusDot.classList.add('connected');
      statusDot.classList.remove('disconnected');
      statusText.textContent = `Connected to ${CONFIG.API_BASE_URL.replace('https://', '').split('.')[0]}`;
    } catch (error) {
      statusDot.classList.add('disconnected');
      statusDot.classList.remove('connected');
      statusText.textContent = 'Backend unavailable';
      console.error('Backend health check failed:', error);
    }
  }

  // Check if already logged in
  function checkExistingSession() {
    if (!CONFIG.isTokenExpired()) {
      const user = CONFIG.getUser();
      if (user) {
        redirectToDashboard(user.role);
      }
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


