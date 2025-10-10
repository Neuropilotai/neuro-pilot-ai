import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Mail, Shield } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore';
import TwoFactorModal from '../components/TwoFactorModal';
import LegalFooter from '../components/LegalFooter';
import toast from 'react-hot-toast';

export default function Login() {
  const navigate = useNavigate();
  const { login, requires2FA, isLoading } = useAuthStore();
  const { theme, toggleTheme } = useThemeStore();

  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });

  const [show2FA, setShow2FA] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.email || !formData.password) {
      toast.error('Please fill in all fields');
      return;
    }

    try {
      const result = await login(formData.email, formData.password);

      if (result.requires2FA) {
        setShow2FA(true);
      } else if (result.success) {
        toast.success('Login successful!');
        navigate('/dashboard');
      }
    } catch (error) {
      console.error('Login failed:', error);
    }
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handle2FASuccess = () => {
    toast.success('Login successful!');
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-dark">
      <div className="absolute inset-0 bg-grid-pattern opacity-10"></div>

      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        className="absolute top-6 right-6 p-2 rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur-sm transition-colors"
        aria-label="Toggle theme"
      >
        {theme === 'light' ? '🌙' : '☀️'}
      </button>

      <div className="relative w-full max-w-md p-8">
        {/* Login Card */}
        <div className="bg-white/10 backdrop-blur-md rounded-2xl shadow-2xl p-8 border border-white/20">
          {/* Logo & Title */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-primary rounded-2xl mb-4 shadow-glow">
              <Shield className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">
              Inventory Enterprise
            </h1>
            <p className="text-gray-300 text-sm">
              Enterprise Dashboard v3.0.0
            </p>
            <p className="text-gray-400 text-xs mt-1">
              Phase 3: Autonomous Learning Layer
            </p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-200 mb-2">
                Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  className="block w-full pl-10 pr-3 py-3 border border-white/20 rounded-lg bg-white/10 backdrop-blur-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="admin@example.com"
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-200 mb-2">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="password"
                  id="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  className="block w-full pl-10 pr-3 py-3 border border-white/20 rounded-lg bg-white/10 backdrop-blur-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-gradient-primary hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              {isLoading ? (
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  Signing in...
                </div>
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-6 text-center text-sm text-gray-400">
            <p>Protected by enterprise-grade security</p>
            <p className="mt-1 text-xs">
              2FA • RBAC • Multi-Tenancy • Real-time AI • Autonomous Learning
            </p>
          </div>
        </div>

        {/* Legal Footer */}
        <div className="mt-6">
          <LegalFooter variant="purple" />
        </div>
      </div>

      {/* 2FA Modal */}
      {show2FA && (
        <TwoFactorModal
          isOpen={show2FA}
          onClose={() => setShow2FA(false)}
          onSuccess={handle2FASuccess}
        />
      )}
    </div>
  );
}
