import { useState } from 'react';
import { X, ShieldCheck } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import toast from 'react-hot-toast';

export default function TwoFactorModal({ isOpen, onClose, onSuccess }) {
  const { verify2FA, isLoading } = useAuthStore();
  const [code, setCode] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (code.length !== 6) {
      toast.error('Please enter a 6-digit code');
      return;
    }

    try {
      const result = await verify2FA(code);
      if (result.success) {
        onSuccess();
      }
    } catch (error) {
      console.error('2FA verification failed:', error);
      setCode('');
    }
  };

  const handleChange = (e) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 6);
    setCode(value);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-8 border border-gray-200 dark:border-gray-800">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
        </button>

        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-primary rounded-2xl mb-4 shadow-glow">
            <ShieldCheck className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Two-Factor Authentication
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Enter the 6-digit code from your authenticator app
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={code}
              onChange={handleChange}
              className="block w-full px-4 py-4 text-center text-2xl font-mono tracking-widest border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="000000"
              autoFocus
              required
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || code.length !== 6}
            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-gradient-primary hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
          >
            {isLoading ? (
              <div className="flex items-center">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                Verifying...
              </div>
            ) : (
              'Verify Code'
            )}
          </button>
        </form>

        {/* Help text */}
        <div className="mt-6 text-center text-xs text-gray-500 dark:text-gray-400">
          <p>Don't have access to your authenticator app?</p>
          <button
            type="button"
            className="text-primary-600 dark:text-primary-400 hover:underline mt-1"
          >
            Contact support
          </button>
        </div>
      </div>
    </div>
  );
}
