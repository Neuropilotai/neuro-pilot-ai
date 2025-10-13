/**
 * Login Page JavaScript
 * CSP Compliant - No inline scripts
 */

// Update copyright year dynamically
document.addEventListener('DOMContentLoaded', function() {
  const currentYear = new Date().getFullYear();
  const footerElement = document.querySelector('.footer');
  if (footerElement) {
    footerElement.innerHTML = footerElement.innerHTML.replace(/©\s*\d{4}/, `© ${currentYear}`);
  }

  // Attach click handler to owner login button
  const ownerBtn = document.getElementById('ownerQuickLoginBtn');
  if (ownerBtn) {
    ownerBtn.addEventListener('click', handleOwnerDeviceLogin);
  }
});

// Owner Device Quick Login Handler
async function handleOwnerDeviceLogin() {
  const btn = document.getElementById('ownerQuickLoginBtn');
  const messageDiv = document.getElementById('ownerLoginMessage');
  const errorDiv = document.getElementById('loginError');

  // Reset messages
  errorDiv.classList.remove('show');
  messageDiv.classList.remove('show');

  // Disable button and show loading state
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span><span>Authenticating device...</span>';

  try {
    const response = await fetch('http://localhost:8083/api/auth/device-login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();

    if (response.ok && data.success) {
      // Store auth token
      localStorage.setItem('authToken', data.accessToken);

      // Show success message
      messageDiv.textContent = '✅ Device authenticated! Redirecting to Owner Console...';
      messageDiv.classList.add('show');

      // Redirect to owner console after short delay
      setTimeout(() => {
        window.location.href = '/owner-super-console.html';
      }, 800);

    } else {
      // Show error message
      errorDiv.innerHTML = `
        <strong>Device Not Authorized</strong><br>
        ${data.error || 'This device is not registered for owner access.'}<br>
        <small class="error-message-hint">
          ${data.hint || 'Please login with email/password from the authorized device first to register it.'}
        </small>
      `;
      errorDiv.classList.add('show');

      // Re-enable button
      btn.disabled = false;
      btn.innerHTML = '<span>🔐</span><span>Owner Quick Login (Device)</span><span>→</span>';
    }

  } catch (error) {
    console.error('Device login error:', error);
    errorDiv.textContent = 'Network error: ' + error.message;
    errorDiv.classList.add('show');

    // Re-enable button
    btn.disabled = false;
    btn.innerHTML = '<span>🔐</span><span>Owner Quick Login (Device)</span><span>→</span>';
  }
}

// Make function globally available
window.handleOwnerDeviceLogin = handleOwnerDeviceLogin;
