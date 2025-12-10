/**
 * Quick Login Handler - CSP Compliant
 * Handles quick owner login form submission
 */

(function() {
  const form = document.getElementById('loginForm');
  const errorMsg = document.getElementById('errorMsg');
  const loginBtn = document.getElementById('loginBtn');

  if (!form || !errorMsg || !loginBtn) {
    console.error('Quick login form elements not found');
    return;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorMsg.textContent = '';
    loginBtn.disabled = true;
    loginBtn.textContent = 'Logging in...';

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const deviceId = document.getElementById('device').value.trim();

    if (!deviceId) {
      errorMsg.textContent = 'Device ID is required';
      loginBtn.disabled = false;
      loginBtn.textContent = 'Login & Go to Console';
      return;
    }

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();
      if (!res.ok || !data.accessToken) {
        throw new Error(data.message || data.error || 'Login failed');
      }

      localStorage.setItem('np_owner_jwt', data.accessToken);
      localStorage.setItem('np_owner_device', deviceId);

      window.location.href = '/owner-super-console-v15.html';
    } catch (err) {
      errorMsg.textContent = err.message || 'Login failed';
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = 'Login & Go to Console';
    }
  });
})();

