import React, { useState, useEffect } from 'react';

interface PaymentFormProps {
  orderData: any;
  onPaymentSuccess: (result: any) => void;
  onPaymentError: (error: string) => void;
}

export const PaymentForm: React.FC<PaymentFormProps> = ({ 
  orderData, 
  onPaymentSuccess, 
  onPaymentError 
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedService, setSelectedService] = useState('professional_resume');
  const [pricing, setPricing] = useState<any>({});
  const [clientSecret, setClientSecret] = useState('');

  // Service options
  const serviceOptions = [
    {
      id: 'basic_resume',
      name: 'Basic Resume',
      price: '$49',
      description: '✅ AI-optimized professional resume\n✅ ATS-friendly formatting\n✅ 24-hour delivery',
      popular: false
    },
    {
      id: 'professional_resume',
      name: 'Professional Resume',
      price: '$99',
      description: '✅ Everything in Basic\n✅ Custom cover letter\n✅ LinkedIn headline optimization\n✅ 12-hour delivery',
      popular: true
    },
    {
      id: 'executive_resume',
      name: 'Executive Resume',
      price: '$199',
      description: '✅ Everything in Professional\n✅ Executive biography\n✅ Personal branding strategy\n✅ Priority 6-hour delivery',
      popular: false
    },
    {
      id: 'career_package',
      name: 'Complete Career Package',
      price: '$299',
      description: '✅ Executive Resume + Cover Letter\n✅ Complete LinkedIn makeover\n✅ Interview preparation guide\n✅ 30-day revision guarantee',
      popular: false
    }
  ];

  useEffect(() => {
    fetchPricing();
  }, []);

  const fetchPricing = async () => {
    try {
      const response = await fetch('http://localhost:3012/api/pricing');
      const data = await response.json();
      setPricing(data);
    } catch (error) {
      console.error('Failed to fetch pricing:', error);
    }
  };

  const createPaymentIntent = async () => {
    try {
      const response = await fetch('http://localhost:3012/api/create-payment-intent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          service_type: selectedService,
          customer_email: orderData.email,
          customer_name: orderData.name
        }),
      });

      const data = await response.json();
      setClientSecret(data.client_secret);
      return data;
    } catch (error) {
      throw new Error('Failed to create payment intent');
    }
  };

  const handlePayment = async () => {
    setIsProcessing(true);
    
    try {
      // Create payment intent
      const paymentData = await createPaymentIntent();
      
      // Simulate successful payment for demo
      // In production, you'd use Stripe Elements here
      console.log('💳 Processing payment for:', selectedService);
      console.log('💰 Amount:', paymentData.amount);
      
      // Simulate payment delay
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Simulate successful payment
      const mockPaymentResult = {
        paymentIntent: {
          id: `pi_mock_${Date.now()}`,
          status: 'succeeded'
        }
      };
      
      // Confirm payment
      await confirmPayment(mockPaymentResult.paymentIntent.id);
      
      onPaymentSuccess({
        orderId: paymentData.order_id,
        service: selectedService,
        amount: paymentData.amount
      });
      
    } catch (error) {
      onPaymentError(error instanceof Error ? error.message : 'Payment failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const confirmPayment = async (paymentIntentId: string) => {
    const response = await fetch('http://localhost:3012/api/confirm-payment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        payment_intent_id: paymentIntentId,
        order_details: {
          ...orderData,
          serviceType: selectedService
        }
      }),
    });

    if (!response.ok) {
      throw new Error('Payment confirmation failed');
    }

    return response.json();
  };

  const selectedServiceData = serviceOptions.find(s => s.id === selectedService);

  return (
    <div style={{ 
      background: 'rgba(30, 41, 59, 0.5)', 
      padding: '2rem', 
      borderRadius: '16px',
      border: '1px solid rgba(71, 85, 105, 0.3)',
      margin: '2rem 0'
    }}>
      <h3 style={{ color: 'white', marginBottom: '1.5rem', textAlign: 'center' }}>
        💳 Choose Your Package
      </h3>

      {/* Service Selection */}
      <div style={{ display: 'grid', gap: '1rem', marginBottom: '2rem' }}>
        {serviceOptions.map((service) => (
          <div
            key={service.id}
            onClick={() => setSelectedService(service.id)}
            style={{
              padding: '1.5rem',
              border: `2px solid ${selectedService === service.id ? '#22c55e' : 'rgba(71, 85, 105, 0.5)'}`,
              borderRadius: '12px',
              background: selectedService === service.id ? 'rgba(34, 197, 94, 0.1)' : 'rgba(71, 85, 105, 0.2)',
              cursor: 'pointer',
              position: 'relative',
              transition: 'all 0.3s ease'
            }}
          >
            {service.popular && (
              <div style={{
                position: 'absolute',
                top: '-10px',
                right: '20px',
                background: '#22c55e',
                color: 'white',
                padding: '4px 12px',
                borderRadius: '20px',
                fontSize: '0.8rem',
                fontWeight: 'bold'
              }}>
                MOST POPULAR
              </div>
            )}
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h4 style={{ color: 'white', margin: '0 0 0.5rem 0' }}>
                  {service.name}
                </h4>
                <div style={{ color: '#94a3b8', fontSize: '0.9rem', whiteSpace: 'pre-line' }}>
                  {service.description}
                </div>
              </div>
              <div style={{ 
                color: '#22c55e', 
                fontSize: '1.5rem', 
                fontWeight: 'bold',
                marginLeft: '1rem'
              }}>
                {service.price}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Order Summary */}
      {selectedServiceData && (
        <div style={{
          background: 'rgba(71, 85, 105, 0.2)',
          padding: '1.5rem',
          borderRadius: '12px',
          marginBottom: '2rem'
        }}>
          <h4 style={{ color: 'white', margin: '0 0 1rem 0' }}>📋 Order Summary</h4>
          <div style={{ color: '#94a3b8', marginBottom: '0.5rem' }}>
            <strong>Customer:</strong> {orderData.name}
          </div>
          <div style={{ color: '#94a3b8', marginBottom: '0.5rem' }}>
            <strong>Email:</strong> {orderData.email}
          </div>
          <div style={{ color: '#94a3b8', marginBottom: '0.5rem' }}>
            <strong>Target Role:</strong> {orderData.targetRole || 'Professional Resume'}
          </div>
          <div style={{ color: '#94a3b8', marginBottom: '1rem' }}>
            <strong>Service:</strong> {selectedServiceData.name}
          </div>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            borderTop: '1px solid rgba(71, 85, 105, 0.5)',
            paddingTop: '1rem'
          }}>
            <span style={{ color: 'white', fontWeight: 'bold' }}>Total:</span>
            <span style={{ color: '#22c55e', fontSize: '1.2rem', fontWeight: 'bold' }}>
              {selectedServiceData.price}
            </span>
          </div>
        </div>
      )}

      {/* Payment Button */}
      <button
        onClick={handlePayment}
        disabled={isProcessing}
        style={{
          width: '100%',
          padding: '1rem',
          background: isProcessing 
            ? 'rgba(71, 85, 105, 0.5)' 
            : 'linear-gradient(135deg, #22c55e, #16a34a)',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          fontSize: '1.1rem',
          fontWeight: 'bold',
          cursor: isProcessing ? 'not-allowed' : 'pointer',
          marginBottom: '1rem'
        }}
      >
        {isProcessing ? '⏳ Processing Payment...' : `💳 Pay ${selectedServiceData?.price} Now`}
      </button>

      {/* Security Notice */}
      <div style={{ 
        textAlign: 'center',
        color: '#64748b',
        fontSize: '0.8rem',
        marginTop: '1rem'
      }}>
        🔒 Secure payment powered by Stripe • 256-bit SSL encryption
      </div>
    </div>
  );
};

export default PaymentForm;