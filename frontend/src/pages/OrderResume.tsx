import React, { useState } from 'react';
import PaymentButton from '../components/PaymentButton';

const OrderResume: React.FC = () => {
  const [customerEmail, setCustomerEmail] = useState('');
  const [selectedPackage, setSelectedPackage] = useState<'basic' | 'professional' | 'executive'>('professional');
  
  // Debug: Log when package selection changes
  console.log('Current selected package:', selectedPackage);
  const [selectedLanguage, setSelectedLanguage] = useState<'english' | 'french'>('english');
  const [customTemplate, setCustomTemplate] = useState<string>('');
  const [jobDescription, setJobDescription] = useState('');
  const [candidateInfo, setCandidateInfo] = useState({
    name: '',
    experience: '',
    skills: ''
  });

  const packages = {
    basic: { 
      price: 29, 
      features: [
        'AI-Generated Content (English/French)',
        'Beautiful Canva Templates', 
        'Professional Formatting', 
        'ATS Optimization', 
        '1 Revision'
      ] 
    },
    professional: { 
      price: 59, 
      features: [
        'Everything in Basic',
        'Premium Canva Templates',
        'Custom Template Selection',
        'Cover Letter Included',
        'LinkedIn Optimization',
        '3 Revisions',
        'Multiple Export Formats'
      ] 
    },
    executive: { 
      price: 99, 
      features: [
        'Everything in Professional',
        'Luxury Executive Templates',
        'Gold Accents & Premium Design',
        'Executive Summary',
        'Advanced Graphics & Layouts',
        'Unlimited Revisions',
        '1-on-1 Consultation',
        'Priority Processing'
      ] 
    }
  };

  const customTemplates = [
    { id: '', name: 'Default Package Template', description: 'Use the standard template for your package' },
    { id: 'creative', name: 'Creative & Artistic', description: 'Perfect for creative professionals and designers' },
    { id: 'tech', name: 'Tech & Modern', description: 'Ideal for IT, engineering, and tech roles' },
    { id: 'business', name: 'Corporate & Elegant', description: 'Professional design for business roles' },
    { id: 'minimalist', name: 'Minimalist & Clean', description: 'Simple, clean design that focuses on content' }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* AI Learning Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-5xl mx-auto px-6 py-8">
          <div className="text-center">
            <div className="inline-flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center">
                <span className="text-white text-xl">🧠</span>
              </div>
              <h1 className="text-3xl font-bold text-gray-900">AI Resume Builder</h1>
            </div>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Powered by 4 specialized AI agents that learn from your job requirements to create the perfect resume
            </p>
          </div>
        </div>
      </div>

      {/* AI Process Visualization */}
      <div className="bg-blue-50 border-b">
        <div className="max-w-5xl mx-auto px-6 py-6">
          <div className="grid grid-cols-4 gap-4 text-center">
            <div className="flex flex-col items-center">
              <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center mb-2">
                <span className="text-white font-bold">1</span>
              </div>
              <span className="text-sm font-medium text-gray-700">Analyze Job</span>
            </div>
            <div className="flex flex-col items-center">
              <div className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center mb-2">
                <span className="text-white font-bold">2</span>
              </div>
              <span className="text-sm font-medium text-gray-700">AI Learning</span>
            </div>
            <div className="flex flex-col items-center">
              <div className="w-10 h-10 bg-purple-600 rounded-full flex items-center justify-center mb-2">
                <span className="text-white font-bold">3</span>
              </div>
              <span className="text-sm font-medium text-gray-700">Generate Content</span>
            </div>
            <div className="flex flex-col items-center">
              <div className="w-10 h-10 bg-orange-600 rounded-full flex items-center justify-center mb-2">
                <span className="text-white font-bold">4</span>
              </div>
              <span className="text-sm font-medium text-gray-700">Deliver Resume</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Form */}
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Order Form */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-sm border p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center gap-2">
                <span className="text-blue-600">📝</span>
                Tell Our AI About You
              </h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="your@email.com"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                  <input
                    type="text"
                    value={candidateInfo.name}
                    onChange={(e) => setCandidateInfo({...candidateInfo, name: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="John Doe"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Years of Experience</label>
                  <input
                    type="text"
                    value={candidateInfo.experience}
                    onChange={(e) => setCandidateInfo({...candidateInfo, experience: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="5 years"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Key Skills</label>
                  <textarea
                    value={candidateInfo.skills}
                    onChange={(e) => setCandidateInfo({...candidateInfo, skills: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                    rows={3}
                    placeholder="JavaScript, Python, React, Node.js..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Target Job Description</label>
                  <div className="text-xs text-blue-600 mb-1">🧠 Our AI will analyze this to optimize your resume</div>
                  <textarea
                    value={jobDescription}
                    onChange={(e) => setJobDescription(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                    rows={4}
                    placeholder="Paste the job description you're applying for..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Resume Language</label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className={`flex items-center p-3 border rounded-md cursor-pointer ${
                      selectedLanguage === 'english' ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
                    }`}>
                      <input
                        type="radio"
                        name="language"
                        value="english"
                        checked={selectedLanguage === 'english'}
                        onChange={(e) => setSelectedLanguage(e.target.value as 'english' | 'french')}
                        className="mr-2"
                      />
                      <div>
                        <div className="font-medium">🇺🇸 English</div>
                        <div className="text-xs text-gray-500">North American</div>
                      </div>
                    </label>
                    <label className={`flex items-center p-3 border rounded-md cursor-pointer ${
                      selectedLanguage === 'french' ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
                    }`}>
                      <input
                        type="radio"
                        name="language"
                        value="french"
                        checked={selectedLanguage === 'french'}
                        onChange={(e) => setSelectedLanguage(e.target.value as 'english' | 'french')}
                        className="mr-2"
                      />
                      <div>
                        <div className="font-medium">🇫🇷 Français</div>
                        <div className="text-xs text-gray-500">European</div>
                      </div>
                    </label>
                  </div>
                </div>

                {(selectedPackage === 'professional' || selectedPackage === 'executive') && (
                  <div className="bg-gray-50 p-4 rounded-md border">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Template Style (Optional)</label>
                    <select
                      value={customTemplate}
                      onChange={(e) => setCustomTemplate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      {customTemplates.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.name} - {template.description}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      AI will select the best template for your industry
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Package Selection */}
          <div className="space-y-4">
            <div className="bg-white rounded-lg shadow-sm border p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <span className="text-blue-600">🤖</span>
                AI Package Selection
              </h2>
              <div className="bg-blue-50 p-3 rounded-md mb-4">
                <div className="text-sm text-blue-800">
                  <strong>Selected:</strong> {selectedPackage.charAt(0).toUpperCase() + selectedPackage.slice(1)} - ${packages[selectedPackage].price}
                </div>
              </div>

              <div className="space-y-3">
                {Object.entries(packages).map(([packageType, details]) => (
                  <div 
                    key={packageType}
                    className={`p-4 border rounded-lg cursor-pointer transition-all ${
                      selectedPackage === packageType 
                        ? 'border-blue-500 bg-blue-50' 
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => {
                      console.log('Clicked package:', packageType);
                      setSelectedPackage(packageType as any);
                    }}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h3 className="text-lg font-semibold capitalize text-gray-900">{packageType}</h3>
                        {packageType === 'professional' && (
                          <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full font-medium">
                            Most Popular
                          </span>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="text-2xl font-bold text-gray-900">${details.price}</span>
                        <div className="text-sm text-gray-500">USD</div>
                      </div>
                    </div>
                    
                    <ul className="space-y-2 text-sm">
                      {details.features.map((feature, index) => (
                        <li key={index} className="flex items-start gap-2">
                          <span className="text-green-600 mt-0.5">✓</span>
                          <span className="text-gray-700">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              <div className="mt-6">
                <div className="bg-gray-50 p-4 rounded-md border mb-4">
                  <h4 className="font-medium text-gray-900 mb-2">Ready to order?</h4>
                  <p className="text-sm text-gray-600 mb-3">
                    Click the button below to proceed with secure payment for your AI-generated resume.
                  </p>
                </div>
                <PaymentButton
                  packageType={selectedPackage}
                  price={packages[selectedPackage].price}
                  customerEmail={customerEmail}
                  language={selectedLanguage}
                  customTemplate={customTemplate}
                  jobDescription={jobDescription}
                  candidateInfo={candidateInfo}
                  onPaymentSuccess={(sessionId) => {
                    console.log('Payment successful:', sessionId);
                    // Handle successful payment - could trigger resume generation
                  }}
                />
              </div>
              
              <div className="mt-4 flex justify-center gap-4 text-sm text-gray-600">
                <span className="flex items-center gap-1">
                  <span>🔒</span> Secure Payment
                </span>
                <span className="flex items-center gap-1">
                  <span>⚡</span> 24-48hr Delivery
                </span>
                <span className="flex items-center gap-1">
                  <span>💯</span> Money-back Guarantee
                </span>
              </div>
            </div>
          </div>
        </div>
        
        {/* AI Learning Features */}
        <div className="mt-8 bg-white rounded-lg shadow-sm border p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <span className="text-blue-600">🧠</span>
            How Our AI Learns & Adapts
          </h3>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="flex gap-3">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-blue-600 text-sm font-bold">AI</span>
              </div>
              <div>
                <h4 className="font-medium text-gray-900">Job Analysis Agent</h4>
                <p className="text-sm text-gray-600">Analyzes job descriptions to identify key requirements and skills</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-green-600 text-sm font-bold">95%</span>
              </div>
              <div>
                <h4 className="font-medium text-gray-900">Learning Accuracy</h4>
                <p className="text-sm text-gray-600">Continuously improving through machine learning algorithms</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-purple-600 text-sm font-bold">🎯</span>
              </div>
              <div>
                <h4 className="font-medium text-gray-900">Content Optimization</h4>
                <p className="text-sm text-gray-600">Tailors resume content to match specific job requirements</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-orange-600 text-sm font-bold">⚡</span>
              </div>
              <div>
                <h4 className="font-medium text-gray-900">Real-time Processing</h4>
                <p className="text-sm text-gray-600">Instant analysis and content generation within 24-48 hours</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrderResume;