import React, { useState } from 'react';
import PaymentForm from './PaymentForm';

interface CustomerFormProps {
  onSubmit: (data: any) => void;
  service: 'resume' | 'trading';
}

export const CustomerForm: React.FC<CustomerFormProps> = ({ onSubmit, service }) => {
  const [step, setStep] = useState<'details' | 'payment' | 'confirmation'>('details');
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    jobTitle: '',
    industry: '',
    experience: '',
    targetRole: '',
    cvFile: null as File | null
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 'details') {
      setStep('payment');
    }
  };

  const handlePaymentSuccess = (paymentResult: any) => {
    setStep('confirmation');
    onSubmit({ ...formData, ...paymentResult });
  };

  const handlePaymentError = (error: string) => {
    alert(`Payment failed: ${error}`);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type (PDF, DOC, DOCX)
      const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      if (allowedTypes.includes(file.type)) {
        setFormData({...formData, cvFile: file});
      } else {
        alert('Please upload a PDF, DOC, or DOCX file');
        e.target.value = '';
      }
    }
  };

  // Show payment step
  if (step === 'payment') {
    return (
      <PaymentForm
        orderData={formData}
        onPaymentSuccess={handlePaymentSuccess}
        onPaymentError={handlePaymentError}
      />
    );
  }

  // Show confirmation step
  if (step === 'confirmation') {
    return (
      <div style={{ 
        background: 'rgba(30, 41, 59, 0.5)', 
        padding: '2rem', 
        borderRadius: '16px',
        border: '1px solid rgba(71, 85, 105, 0.3)',
        margin: '2rem 0',
        textAlign: 'center'
      }}>
        <h3 style={{ color: '#22c55e', marginBottom: '1.5rem' }}>
          ✅ Order Confirmed!
        </h3>
        <p style={{ color: 'white', marginBottom: '1rem' }}>
          Thank you {formData.name}! Your order has been processed successfully.
        </p>
        <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>
          You'll receive your optimized resume within 24 hours at {formData.email}
        </p>
      </div>
    );
  }

  return (
    <div style={{ 
      background: 'rgba(30, 41, 59, 0.5)', 
      padding: '2rem', 
      borderRadius: '16px',
      border: '1px solid rgba(71, 85, 105, 0.3)',
      margin: '2rem 0'
    }}>
      <h3 style={{ color: 'white', marginBottom: '1.5rem' }}>
        {service === 'resume' ? '📝 Resume Order Details' : '📈 Trading Subscription'}
      </h3>
      
      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1rem' }}>
        <div>
          <label style={{ color: '#94a3b8', display: 'block', marginBottom: '0.5rem' }}>
            Full Name *
          </label>
          <input
            type="text"
            required
            value={formData.name}
            onChange={(e) => setFormData({...formData, name: e.target.value})}
            style={{
              width: '100%',
              padding: '0.75rem',
              background: 'rgba(71, 85, 105, 0.2)',
              border: '1px solid rgba(71, 85, 105, 0.5)',
              borderRadius: '8px',
              color: 'white',
              fontSize: '1rem'
            }}
            placeholder="Enter your full name"
          />
        </div>

        <div>
          <label style={{ color: '#94a3b8', display: 'block', marginBottom: '0.5rem' }}>
            Email Address *
          </label>
          <input
            type="email"
            required
            value={formData.email}
            onChange={(e) => setFormData({...formData, email: e.target.value})}
            style={{
              width: '100%',
              padding: '0.75rem',
              background: 'rgba(71, 85, 105, 0.2)',
              border: '1px solid rgba(71, 85, 105, 0.5)',
              borderRadius: '8px',
              color: 'white',
              fontSize: '1rem'
            }}
            placeholder="your@email.com"
          />
        </div>

        {service === 'resume' && (
          <>
            <div>
              <label style={{ color: '#94a3b8', display: 'block', marginBottom: '0.5rem' }}>
                Current Job Title
              </label>
              <input
                type="text"
                value={formData.jobTitle}
                onChange={(e) => setFormData({...formData, jobTitle: e.target.value})}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  background: 'rgba(71, 85, 105, 0.2)',
                  border: '1px solid rgba(71, 85, 105, 0.5)',
                  borderRadius: '8px',
                  color: 'white',
                  fontSize: '1rem'
                }}
                placeholder="e.g. Senior Software Engineer"
              />
            </div>

            <div>
              <label style={{ color: '#94a3b8', display: 'block', marginBottom: '0.5rem' }}>
                Target Role
              </label>
              <input
                type="text"
                value={formData.targetRole}
                onChange={(e) => setFormData({...formData, targetRole: e.target.value})}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  background: 'rgba(71, 85, 105, 0.2)',
                  border: '1px solid rgba(71, 85, 105, 0.5)',
                  borderRadius: '8px',
                  color: 'white',
                  fontSize: '1rem'
                }}
                placeholder="What job are you applying for?"
              />
            </div>

            <div>
              <label style={{ color: '#94a3b8', display: 'block', marginBottom: '0.5rem' }}>
                📎 Upload Current CV/Resume (Optional)
              </label>
              <div style={{
                border: '2px dashed rgba(71, 85, 105, 0.5)',
                borderRadius: '8px',
                padding: '1.5rem',
                textAlign: 'center',
                background: 'rgba(71, 85, 105, 0.1)',
                position: 'relative'
              }}>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx"
                  onChange={handleFileUpload}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    opacity: 0,
                    cursor: 'pointer'
                  }}
                />
                {formData.cvFile ? (
                  <div>
                    <p style={{ color: '#22c55e', margin: 0, fontWeight: 'bold' }}>
                      ✅ {formData.cvFile.name}
                    </p>
                    <p style={{ color: '#94a3b8', fontSize: '0.8rem', margin: '0.5rem 0 0 0' }}>
                      File uploaded successfully! Click to replace.
                    </p>
                  </div>
                ) : (
                  <div>
                    <p style={{ color: '#94a3b8', margin: 0 }}>
                      📄 Click to upload your current CV/Resume
                    </p>
                    <p style={{ color: '#64748b', fontSize: '0.8rem', margin: '0.5rem 0 0 0' }}>
                      Supported formats: PDF, DOC, DOCX (Max 10MB)
                    </p>
                  </div>
                )}
              </div>
              <p style={{ color: '#64748b', fontSize: '0.75rem', margin: '0.5rem 0 0 0' }}>
                💡 Uploading your current CV helps our AI create a more personalized and optimized resume
              </p>
            </div>
          </>
        )}

        <button
          type="submit"
          style={{
            width: '100%',
            padding: '1rem',
            background: 'linear-gradient(135deg, #22c55e, #16a34a)',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '1.1rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            marginTop: '1rem'
          }}
        >
          Continue to Payment 💳
        </button>
      </form>

      <div style={{ 
        marginTop: '1.5rem', 
        padding: '1rem', 
        background: 'rgba(34, 197, 94, 0.1)',
        borderRadius: '8px',
        border: '1px solid rgba(34, 197, 94, 0.3)'
      }}>
        <p style={{ color: '#22c55e', fontSize: '0.9rem', margin: 0 }}>
          💡 <strong>Limited Time:</strong> Use code LAUNCH20 for 20% off your first month!
        </p>
      </div>
    </div>
  );
};

export default CustomerForm;