import React, { useState, useEffect } from 'react';
import './PricingPlans.css';

interface PricingData {
  subscriptions: {
    basic: { name: string; price: number; interval: string };
    pro: { name: string; price: number; interval: string };
    enterprise: { name: string; price: number; interval: string };
  };
  one_time: {
    ai_models: { name: string; price: number };
    historical_data: { name: string; price: number };
  };
  resume: {
    basic: { name: string; price: number };
    professional: { name: string; price: number };
    executive: { name: string; price: number };
  };
}

interface Plan {
  id: string;
  name: string;
  description: string;
  price: number;
  interval?: string;
  features: string[];
  popular?: boolean;
  category: 'subscription' | 'one_time' | 'resume';
}

const PricingPlans: React.FC = () => {
  const [pricingData, setPricingData] = useState<PricingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<'subscription' | 'one_time' | 'resume'>('subscription');

  useEffect(() => {
    fetchPricing();
  }, []);

  const fetchPricing = async () => {
    try {
      const response = await fetch('/api/pricing');
      const data = await response.json();
      if (data.status === 'success') {
        setPricingData(data.pricing);
      }
    } catch (error) {
      console.error('Failed to fetch pricing:', error);
    } finally {
      setLoading(false);
    }
  };

  const plans: Plan[] = [
    // Subscription Plans
    {
      id: 'basic',
      name: 'Neuro Basic',
      description: 'Essential trading tools and basic AI insights',
      price: 29,
      interval: 'month',
      category: 'subscription',
      features: [
        'Basic trading signals',
        'Portfolio tracking',
        'Standard support',
        'Limited API calls',
        'Email notifications'
      ]
    },
    {
      id: 'pro',
      name: 'Neuro Pro',
      description: 'Advanced AI trading with enhanced features',
      price: 99,
      interval: 'month',
      category: 'subscription',
      popular: true,
      features: [
        'Advanced AI trading signals',
        'Real-time market analysis',
        'Priority support',
        'Unlimited API calls',
        'Custom indicators',
        'Advanced analytics',
        'Risk management tools'
      ]
    },
    {
      id: 'enterprise',
      name: 'Neuro Enterprise',
      description: 'Full platform access with dedicated support',
      price: 299,
      interval: 'month',
      category: 'subscription',
      features: [
        'All Pro features',
        'Dedicated account manager',
        'Custom integrations',
        'White-label options',
        'Advanced analytics',
        'API access',
        'Custom strategies',
        'Priority processing'
      ]
    },
    // One-time Purchases
    {
      id: 'ai_models',
      name: 'Premium AI Models',
      description: 'Access to exclusive trading algorithms',
      price: 199,
      category: 'one_time',
      features: [
        'Exclusive trading algorithms',
        'Advanced ML models',
        'Lifetime access',
        'Regular updates',
        'Documentation included'
      ]
    },
    {
      id: 'historical_data',
      name: 'Historical Data Package',
      description: '10 years of historical market data',
      price: 49,
      category: 'one_time',
      features: [
        '10 years of market data',
        'Multiple asset classes',
        'CSV, JSON, SQL formats',
        'API access included',
        'Regular updates'
      ]
    },
    // Resume Packages
    {
      id: 'resume_basic',
      name: 'Basic Resume',
      description: 'Professional AI-generated resume',
      price: 29,
      category: 'resume',
      features: [
        'AI-generated resume',
        'ATS optimization',
        'Professional formatting',
        '24-hour delivery',
        'One revision'
      ]
    },
    {
      id: 'resume_professional',
      name: 'Professional Resume',
      description: 'Resume + Cover Letter + LinkedIn',
      price: 59,
      category: 'resume',
      popular: true,
      features: [
        'Everything in Basic',
        'Cover letter',
        'LinkedIn optimization',
        'Two revisions',
        'Industry customization'
      ]
    },
    {
      id: 'resume_executive',
      name: 'Executive Resume',
      description: 'Premium package with 30-day support',
      price: 99,
      category: 'resume',
      features: [
        'Everything in Professional',
        '30-day revision support',
        'Executive formatting',
        'Multiple formats',
        'Personal consultation'
      ]
    }
  ];

  const handlePurchase = async (planId: string, category: string) => {
    try {
      let endpoint = '';
      let body: any = {
        customerEmail: 'user@example.com' // In real app, get from user context
      };

      if (category === 'subscription') {
        endpoint = '/api/payments/neuro-subscription';
        body.planType = planId;
      } else if (category === 'one_time') {
        endpoint = '/api/payments/one-time-purchase';
        body.productType = planId;
      } else if (category === 'resume') {
        endpoint = '/api/payments/resume-checkout';
        body.packageType = planId.replace('resume_', '');
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      
      if (data.status === 'success') {
        window.open(data.checkout_url, '_blank');
      } else {
        alert('Error: ' + data.error);
      }
    } catch (error) {
      console.error('Purchase error:', error);
      alert('Failed to initiate purchase');
    }
  };

  const filteredPlans = plans.filter(plan => plan.category === selectedCategory);

  if (loading) {
    return (
      <div className="pricing-container">
        <div className="loading">Loading pricing information...</div>
      </div>
    );
  }

  return (
    <div className="pricing-container">
      <div className="pricing-header">
        <h1>Choose Your Plan</h1>
        <p>Select the perfect plan for your trading and career needs</p>
      </div>

      <div className="category-tabs">
        <button 
          className={selectedCategory === 'subscription' ? 'active' : ''}
          onClick={() => setSelectedCategory('subscription')}
        >
          🔄 Subscriptions
        </button>
        <button 
          className={selectedCategory === 'one_time' ? 'active' : ''}
          onClick={() => setSelectedCategory('one_time')}
        >
          💎 One-time Purchases
        </button>
        <button 
          className={selectedCategory === 'resume' ? 'active' : ''}
          onClick={() => setSelectedCategory('resume')}
        >
          📄 Resume Services
        </button>
      </div>

      <div className="plans-grid">
        {filteredPlans.map((plan) => (
          <div 
            key={plan.id} 
            className={`plan-card ${plan.popular ? 'popular' : ''}`}
          >
            {plan.popular && <div className="popular-badge">Most Popular</div>}
            
            <div className="plan-header">
              <h3>{plan.name}</h3>
              <p className="plan-description">{plan.description}</p>
              <div className="plan-price">
                <span className="currency">$</span>
                <span className="amount">{plan.price}</span>
                {plan.interval && <span className="interval">/{plan.interval}</span>}
              </div>
            </div>

            <ul className="plan-features">
              {plan.features.map((feature, index) => (
                <li key={index}>
                  <span className="checkmark">✓</span>
                  {feature}
                </li>
              ))}
            </ul>

            <button 
              className="plan-button"
              onClick={() => handlePurchase(plan.id, plan.category)}
            >
              {plan.category === 'subscription' ? 'Start Subscription' : 
               plan.category === 'one_time' ? 'Purchase Now' : 
               'Order Resume'}
            </button>
          </div>
        ))}
      </div>

      <div className="pricing-footer">
        <div className="guarantee">
          <h3>🛡️ 30-Day Money-Back Guarantee</h3>
          <p>Not satisfied? Get your money back, no questions asked.</p>
        </div>
        
        <div className="support">
          <h3>💬 24/7 Support</h3>
          <p>Our AI experts are here to help you succeed.</p>
        </div>
        
        <div className="security">
          <h3>🔒 Secure Payments</h3>
          <p>All payments processed securely through Stripe.</p>
        </div>
      </div>
    </div>
  );
};

export default PricingPlans;