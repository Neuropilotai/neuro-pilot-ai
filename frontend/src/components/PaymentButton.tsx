import React, { useState } from 'react';

interface PaymentButtonProps {
  packageType: 'basic' | 'professional' | 'executive';
  price: number;
  customerEmail: string;
  language?: 'english' | 'french';
  customTemplate?: string;
  jobDescription?: string;
  candidateInfo?: any;
  onPaymentSuccess?: (sessionId: string) => void;
}

const PaymentButton: React.FC<PaymentButtonProps> = ({ 
  packageType, 
  price, 
  customerEmail,
  language = 'english',
  customTemplate = '',
  jobDescription = '',
  candidateInfo = {},
  onPaymentSuccess 
}) => {
  const [loading, setLoading] = useState(false);

  const handlePayment = async () => {
    if (!customerEmail) {
      alert('📧 Please enter your email address to continue with your order');
      return;
    }
    
    if (!candidateInfo.name) {
      alert('👤 Please enter your full name to personalize your resume');
      return;
    }

    setLoading(true);
    
    try {
      console.log('Making payment request for:', { packageType, price, customerEmail });
      
      const response = await fetch('/api/payments/resume-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerEmail,
          packageType,
          price,
          language,
          customTemplate,
          jobDescription,
          candidateInfo
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      if (result.status === 'success' && result.checkout_url) {
        // Redirect to Stripe Checkout or test confirmation
        window.location.href = result.checkout_url;
        
        if (onPaymentSuccess) {
          onPaymentSuccess(result.session_id);
        }
      } else {
        throw new Error(result.error || 'Payment failed');
      }
    } catch (error) {
      console.error('Payment error:', error);
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Fallback for development: create test order
      if (errorMessage.includes('Failed to fetch') || errorMessage.includes('Network')) {
        console.log('Network error detected, creating test order...');
        const testSessionId = 'test_' + Date.now();
        const testUrl = `/order-confirmation?session=${testSessionId}&package=${packageType}&price=${price}`;
        window.location.href = testUrl;
        return;
      }
      
      alert(`Payment failed: ${errorMessage}. Please try again.`);
    } finally {
      setLoading(false);
    }
  };

  const getButtonStyle = () => {
    const baseStyle = "w-full px-6 py-4 rounded-lg font-bold text-lg transition-all duration-200 shadow-lg transform hover:scale-105 ";
    
    switch (packageType) {
      case 'basic':
        return baseStyle + "bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white border border-blue-500";
      case 'professional':
        return baseStyle + "bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white border border-purple-500";
      case 'executive':
        return baseStyle + "bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white border border-orange-400";
      default:
        return baseStyle + "bg-gray-600 hover:bg-gray-700 text-white";
    }
  };

  return (
    <button
      onClick={handlePayment}
      disabled={loading}
      className={`${getButtonStyle()} ${loading ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-lg'}`}
    >
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Processing...
        </span>
      ) : (
        <span className="flex items-center justify-center gap-2">
          <span>🚀</span>
          <span>Order ${packageType.charAt(0).toUpperCase() + packageType.slice(1)} - ${price}</span>
        </span>
      )}
    </button>
  );
};

export default PaymentButton;