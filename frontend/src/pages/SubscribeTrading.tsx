import React, { useState } from 'react';
import TradingSubscription from '../components/TradingSubscription';

const SubscribeTrading: React.FC = () => {
  const [customerEmail, setCustomerEmail] = useState('');

  const features = [
    { icon: '📊', title: 'Real-Time Analysis', description: 'Advanced AI algorithms analyze market data 24/7' },
    { icon: '🎯', title: 'High Accuracy', description: '95%+ success rate on trading signal predictions' },
    { icon: '⚡', title: 'Instant Alerts', description: 'Get notified immediately when opportunities arise' },
    { icon: '🛡️', title: 'Risk Management', description: 'Built-in stop-loss and risk assessment tools' },
    { icon: '📈', title: 'Multiple Assets', description: 'Stocks, crypto, forex, and commodities coverage' },
    { icon: '🤖', title: 'AI-Powered', description: 'Self-learning algorithms that improve over time' }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-gray-800 mb-4">
            🚀 Premium Trading Signals
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Join thousands of successful traders using our AI-powered trading signals. 
            Our advanced algorithms analyze market data 24/7 to identify profitable opportunities.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-12 items-start">
          {/* Features Grid */}
          <div>
            <h2 className="text-3xl font-bold text-gray-800 mb-8">What You Get</h2>
            <div className="grid gap-6">
              {features.map((feature, index) => (
                <div key={index} className="flex items-start space-x-4 p-4 bg-white rounded-xl shadow-sm">
                  <div className="text-3xl">{feature.icon}</div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800">{feature.title}</h3>
                    <p className="text-gray-600">{feature.description}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 p-6 bg-green-100 rounded-xl border border-green-200">
              <h3 className="text-xl font-bold text-green-800 mb-2">30-Day Money Back Guarantee</h3>
              <p className="text-green-700">
                Not satisfied with our signals? Get a full refund within 30 days. 
                No questions asked.
              </p>
            </div>
          </div>

          {/* Subscription Form */}
          <div className="lg:sticky lg:top-8">
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <input
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
                placeholder="your@email.com"
                required
              />
            </div>

            <TradingSubscription
              customerEmail={customerEmail}
              onSubscriptionSuccess={(sessionId) => {
                console.log('Subscription successful:', sessionId);
                // Handle successful subscription
              }}
            />

            <div className="mt-6 space-y-4">
              <div className="bg-white p-4 rounded-lg shadow-sm">
                <h4 className="font-semibold text-gray-800 mb-2">📊 Recent Performance</h4>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold text-green-600">+127%</div>
                    <div className="text-xs text-gray-600">Last 30 days</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-blue-600">95.2%</div>
                    <div className="text-xs text-gray-600">Accuracy</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-purple-600">2,847</div>
                    <div className="text-xs text-gray-600">Active users</div>
                  </div>
                </div>
              </div>

              <div className="bg-white p-4 rounded-lg shadow-sm">
                <h4 className="font-semibold text-gray-800 mb-2">💬 What Our Users Say</h4>
                <blockquote className="text-sm text-gray-600 italic">
                  "The AI trading signals have completely transformed my trading strategy. 
                  I've seen consistent profits month after month."
                </blockquote>
                <cite className="text-xs text-gray-500 mt-1 block">- Sarah K., Professional Trader</cite>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-16 text-center">
          <div className="bg-white p-8 rounded-2xl shadow-lg max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-gray-800 mb-4">
              Ready to Start Making Smarter Trades?
            </h2>
            <p className="text-lg text-gray-600 mb-6">
              Join our community of successful traders and start receiving AI-powered signals today.
            </p>
            <div className="grid md:grid-cols-3 gap-6 text-center">
              <div>
                <div className="text-4xl mb-2">⚡</div>
                <h3 className="font-semibold">Instant Setup</h3>
                <p className="text-sm text-gray-600">Start receiving signals immediately</p>
              </div>
              <div>
                <div className="text-4xl mb-2">🔒</div>
                <h3 className="font-semibold">Secure & Private</h3>
                <p className="text-sm text-gray-600">Your data is encrypted and protected</p>
              </div>
              <div>
                <div className="text-4xl mb-2">📞</div>
                <h3 className="font-semibold">24/7 Support</h3>
                <p className="text-sm text-gray-600">Expert support whenever you need it</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SubscribeTrading;