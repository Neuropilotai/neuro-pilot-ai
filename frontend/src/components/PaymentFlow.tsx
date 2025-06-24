import React, { useState } from 'react';
import CustomerForm from './CustomerForm_complete';

export const PaymentFlow: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<'select' | 'form' | 'payment'>('select');
  const [selectedService, setSelectedService] = useState<{type: 'resume' | 'trading', package: string} | null>(null);
  const [loading, setLoading] = useState(false);

  const handleServiceSelection = (type: 'resume' | 'trading', packageName: string) => {
    setSelectedService({ type, package: packageName });
    setCurrentStep('form');
  };

  const handleCustomerSubmit = async (customerData: any) => {
    if (!selectedService) return;
    
    setLoading(true);
    
    try {
      const endpoint = selectedService.type === 'resume' 
        ? '/api/create-checkout-resume' 
        : '/api/create-checkout-trading';
      
      const payload = selectedService.type === 'resume'
        ? {
            packageType: selectedService.package,
            customerEmail: customerData.email,
            customerData
          }
        : {
            plan: selectedService.package,
            customerEmail: customerData.email,
            customerData
          };

      const response = await fetch(`http://localhost:8000${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error('Payment setup failed');
      }

      const { url } = await response.json();
      window.location.href = url; // Redirect to Stripe Checkout
    } catch (error) {
      console.error('Payment error:', error);
      alert('Payment setup failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (currentStep === 'form' && selectedService) {
    return (
      <div style={{ padding: '2rem', background: '#0f172a', color: 'white', minHeight: '100vh' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <button
            onClick={() => setCurrentStep('select')}
            style={{
              background: 'none',
              border: 'none',
              color: '#3b82f6',
              cursor: 'pointer',
              fontSize: '1rem',
              marginBottom: '2rem'
            }}
          >
            ← Back to Services
          </button>
          
          <div style={{ 
            background: 'rgba(30, 41, 59, 0.5)',
            padding: '1.5rem',
            borderRadius: '12px',
            marginBottom: '2rem',
            border: '1px solid rgba(71, 85, 105, 0.3)'
          }}>
            <h3 style={{ margin: '0 0 0.5rem 0' }}>
              Selected: {selectedService.type === 'resume' ? '📝 Resume' : '📈 Trading'} - {selectedService.package}
            </h3>
            <p style={{ margin: 0, opacity: 0.8 }}>
              {selectedService.type === 'resume' 
                ? `${selectedService.package} resume package`
                : `${selectedService.package} trading signals plan`
              }
            </p>
          </div>

          <CustomerForm 
            service={selectedService.type}
            onSubmit={handleCustomerSubmit}
          />
          
          {loading && (
            <div style={{ 
              textAlign: 'center', 
              padding: '2rem',
              background: 'rgba(59, 130, 246, 0.1)',
              borderRadius: '12px',
              border: '1px solid rgba(59, 130, 246, 0.3)'
            }}>
              <div style={{ 
                width: '50px', 
                height: '50px',
                border: '3px solid rgba(59, 130, 246, 0.3)',
                borderTop: '3px solid #3b82f6',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                margin: '0 auto 1rem'
              }}></div>
              <p>Setting up your payment...</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', background: '#0f172a', color: 'white', minHeight: '100vh' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <h1 style={{ 
            fontSize: '3.5rem', 
            marginBottom: '1rem',
            background: 'linear-gradient(135deg, #3b82f6, #22c55e)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            🧠 Neuro.Pilot.AI
          </h1>
          <h2 style={{ marginBottom: '1rem' }}>Choose Your AI Service</h2>
          <p style={{ fontSize: '1.2rem', opacity: 0.8 }}>
            Professional AI services that deliver results
          </p>
        </div>

        {/* Resume Services */}
        <div style={{ marginBottom: '4rem' }}>
          <h3 style={{ 
            color: '#3b82f6', 
            marginBottom: '2rem',
            fontSize: '2rem',
            textAlign: 'center'
          }}>
            📝 AI Resume Generation
          </h3>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', 
            gap: '2rem' 
          }}>
            
            {/* Basic Resume */}
            <div style={{
              background: 'rgba(59, 130, 246, 0.1)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: '20px',
              padding: '2rem',
              textAlign: 'center',
              transition: 'transform 0.3s ease'
            }}>
              <h4 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Basic Package</h4>
              <div style={{ fontSize: '3rem', fontWeight: 'bold', color: '#22c55e', margin: '1rem 0' }}>
                $29
              </div>
              <ul style={{ textAlign: 'left', margin: '1.5rem 0', paddingLeft: '1rem' }}>
                <li>✅ AI-generated resume</li>
                <li>✅ ATS optimization</li>
                <li>✅ Professional formatting</li>
                <li>✅ 24-hour delivery</li>
              </ul>
              <button
                onClick={() => handleServiceSelection('resume', 'basic')}
                style={{
                  width: '100%',
                  padding: '1rem',
                  background: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '12px',
                  fontSize: '1.1rem',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                Get Started
              </button>
            </div>

            {/* Professional Resume */}
            <div style={{
              background: 'rgba(59, 130, 246, 0.2)',
              border: '2px solid #3b82f6',
              borderRadius: '20px',
              padding: '2rem',
              textAlign: 'center',
              position: 'relative'
            }}>
              <div style={{
                position: 'absolute',
                top: '-10px',
                left: '50%',
                transform: 'translateX(-50%)',
                background: '#f59e0b',
                color: 'white',
                padding: '0.5rem 1rem',
                borderRadius: '20px',
                fontSize: '0.9rem',
                fontWeight: 'bold'
              }}>
                MOST POPULAR
              </div>
              <h4 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Professional Package</h4>
              <div style={{ fontSize: '3rem', fontWeight: 'bold', color: '#22c55e', margin: '1rem 0' }}>
                $59
              </div>
              <ul style={{ textAlign: 'left', margin: '1.5rem 0', paddingLeft: '1rem' }}>
                <li>✅ Everything in Basic</li>
                <li>✅ Custom cover letter</li>
                <li>✅ LinkedIn optimization</li>
                <li>✅ Industry targeting</li>
                <li>✅ Priority support</li>
              </ul>
              <button
                onClick={() => handleServiceSelection('resume', 'professional')}
                style={{
                  width: '100%',
                  padding: '1rem',
                  background: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '12px',
                  fontSize: '1.1rem',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                Get Started
              </button>
            </div>

            {/* Executive Resume */}
            <div style={{
              background: 'rgba(168, 85, 247, 0.1)',
              border: '1px solid rgba(168, 85, 247, 0.3)',
              borderRadius: '20px',
              padding: '2rem',
              textAlign: 'center'
            }}>
              <h4 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Executive Package</h4>
              <div style={{ fontSize: '3rem', fontWeight: 'bold', color: '#22c55e', margin: '1rem 0' }}>
                $99
              </div>
              <ul style={{ textAlign: 'left', margin: '1.5rem 0', paddingLeft: '1rem' }}>
                <li>✅ Everything in Professional</li>
                <li>✅ Executive summary</li>
                <li>✅ Career strategy consultation</li>
                <li>✅ 30-day revisions</li>
                <li>✅ Personal branding guide</li>
              </ul>
              <button
                onClick={() => handleServiceSelection('resume', 'executive')}
                style={{
                  width: '100%',
                  padding: '1rem',
                  background: '#a855f7',
                  color: 'white',
                  border: 'none',
                  borderRadius: '12px',
                  fontSize: '1.1rem',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                Get Started
              </button>
            </div>
          </div>
        </div>

        {/* Trading Services */}
        <div>
          <h3 style={{ 
            color: '#22c55e', 
            marginBottom: '2rem',
            fontSize: '2rem',
            textAlign: 'center'
          }}>
            📈 AI Trading Signals
          </h3>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', 
            gap: '2rem' 
          }}>
            
            {/* Basic Trading */}
            <div style={{
              background: 'rgba(34, 197, 94, 0.1)',
              border: '1px solid rgba(34, 197, 94, 0.3)',
              borderRadius: '20px',
              padding: '2rem',
              textAlign: 'center'
            }}>
              <h4 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Basic Plan</h4>
              <div style={{ fontSize: '3rem', fontWeight: 'bold', color: '#22c55e', margin: '1rem 0' }}>
                $49<span style={{ fontSize: '1rem' }}>/mo</span>
              </div>
              <ul style={{ textAlign: 'left', margin: '1.5rem 0', paddingLeft: '1rem' }}>
                <li>✅ Daily trading signals</li>
                <li>✅ Major stocks coverage</li>
                <li>✅ Basic risk management</li>
                <li>✅ Email notifications</li>
              </ul>
              <button
                onClick={() => handleServiceSelection('trading', 'basic')}
                style={{
                  width: '100%',
                  padding: '1rem',
                  background: '#22c55e',
                  color: 'white',
                  border: 'none',
                  borderRadius: '12px',
                  fontSize: '1.1rem',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                Subscribe
              </button>
            </div>

            {/* Premium Trading */}
            <div style={{
              background: 'rgba(34, 197, 94, 0.2)',
              border: '2px solid #22c55e',
              borderRadius: '20px',
              padding: '2rem',
              textAlign: 'center',
              position: 'relative'
            }}>
              <div style={{
                position: 'absolute',
                top: '-10px',
                left: '50%',
                transform: 'translateX(-50%)',
                background: '#f59e0b',
                color: 'white',
                padding: '0.5rem 1rem',
                borderRadius: '20px',
                fontSize: '0.9rem',
                fontWeight: 'bold'
              }}>
                RECOMMENDED
              </div>
              <h4 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Premium Plan</h4>
              <div style={{ fontSize: '3rem', fontWeight: 'bold', color: '#22c55e', margin: '1rem 0' }}>
                $99<span style={{ fontSize: '1rem' }}>/mo</span>
              </div>
              <ul style={{ textAlign: 'left', margin: '1.5rem 0', paddingLeft: '1rem' }}>
                <li>✅ Everything in Basic</li>
                <li>✅ Real-time signals</li>
                <li>✅ Portfolio analysis</li>
                <li>✅ Advanced risk tools</li>
                <li>✅ Crypto coverage</li>
              </ul>
              <button
                onClick={() => handleServiceSelection('trading', 'premium')}
                style={{
                  width: '100%',
                  padding: '1rem',
                  background: '#22c55e',
                  color: 'white',
                  border: 'none',
                  borderRadius: '12px',
                  fontSize: '1.1rem',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                Subscribe
              </button>
            </div>

            {/* Pro Trading */}
            <div style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '20px',
              padding: '2rem',
              textAlign: 'center'
            }}>
              <h4 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Pro Plan</h4>
              <div style={{ fontSize: '3rem', fontWeight: 'bold', color: '#22c55e', margin: '1rem 0' }}>
                $199<span style={{ fontSize: '1rem' }}>/mo</span>
              </div>
              <ul style={{ textAlign: 'left', margin: '1.5rem 0', paddingLeft: '1rem' }}>
                <li>✅ Everything in Premium</li>
                <li>✅ Custom strategies</li>
                <li>✅ 1-on-1 support</li>
                <li>✅ Priority signals</li>
                <li>✅ API access</li>
              </ul>
              <button
                onClick={() => handleServiceSelection('trading', 'pro')}
                style={{
                  width: '100%',
                  padding: '1rem',
                  background: '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '12px',
                  fontSize: '1.1rem',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                Subscribe
              </button>
            </div>
          </div>
        </div>

        {/* Launch Promotion Banner */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(59, 130, 246, 0.2))',
          border: '1px solid rgba(34, 197, 94, 0.3)',
          borderRadius: '20px',
          padding: '2rem',
          textAlign: 'center',
          marginTop: '3rem'
        }}>
          <h3 style={{ color: '#22c55e', marginBottom: '1rem' }}>🎉 Launch Special Offer!</h3>
          <p style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>
            Get started with exclusive discount codes:
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', flexWrap: 'wrap' }}>
            <div style={{ 
              background: 'rgba(34, 197, 94, 0.2)',
              padding: '1rem 2rem',
              borderRadius: '12px',
              border: '1px solid rgba(34, 197, 94, 0.4)'
            }}>
              <strong>LAUNCH20</strong> - 20% off Trading Signals
            </div>
            <div style={{ 
              background: 'rgba(59, 130, 246, 0.2)',
              padding: '1rem 2rem',
              borderRadius: '12px',
              border: '1px solid rgba(59, 130, 246, 0.4)'
            }}>
              <strong>SAVE10</strong> - $10 off Resume Packages
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentFlow;