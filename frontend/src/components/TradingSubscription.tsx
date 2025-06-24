import React, { useState } from 'react';

interface TradingSubscriptionProps {
  customerEmail: string;
  onSubscriptionSuccess?: (sessionId: string) => void;
}

const TradingSubscription: React.FC<TradingSubscriptionProps> = ({ 
  customerEmail,
  onSubscriptionSuccess 
}) => {
  const [loading, setLoading] = useState(false);

  const handleSubscribe = async () => {
    if (!customerEmail) {
      alert('Please enter your email address');
      return;
    }

    setLoading(true);
    
    try {
      const response = await fetch('/api/payments/trading-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerEmail })
      });

      const result = await response.json();
      
      if (result.status === 'success' && result.checkout_url) {
        // Redirect to Stripe Checkout
        window.location.href = result.checkout_url;
        
        if (onSubscriptionSuccess) {
          onSubscriptionSuccess(result.session_id);
        }
      } else {
        throw new Error(result.error || 'Subscription failed');
      }
    } catch (error) {
      console.error('Subscription error:', error);
      alert('Subscription failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gradient-to-br from-green-50 to-blue-50 p-6 rounded-xl border border-green-200">
      <div className="text-center">
        <h3 className="text-2xl font-bold text-gray-800 mb-2">
          🚀 Premium Trading Signals
        </h3>
        <p className="text-gray-600 mb-4">
          Get exclusive AI-powered trading signals and market analysis
        </p>
        
        <div className="bg-white p-4 rounded-lg shadow-sm mb-4">
          <div className="text-3xl font-bold text-green-600 mb-2">$99/month</div>
          <ul className="text-sm text-gray-600 space-y-1">
            <li>✅ Real-time trading signals</li>
            <li>✅ AI market analysis</li>
            <li>✅ Risk management alerts</li>
            <li>✅ Portfolio optimization</li>
            <li>✅ 24/7 market monitoring</li>
          </ul>
        </div>

        <button
          onClick={handleSubscribe}
          disabled={loading || !customerEmail}
          className="w-full bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 disabled:opacity-50"
        >
          {loading ? (
            <span className="flex items-center justify-center">
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Processing...
            </span>
          ) : (
            'Subscribe Now'
          )}
        </button>
        
        <p className="text-xs text-gray-500 mt-2">
          Cancel anytime • Secure payment via Stripe
        </p>
      </div>
    </div>
  );
};

export default TradingSubscription;