import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

const OrderConfirmation: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [orderDetails, setOrderDetails] = useState({
    session: '',
    package: '',
    price: ''
  });

  useEffect(() => {
    setOrderDetails({
      session: searchParams.get('session') || '',
      package: searchParams.get('package') || '',
      price: searchParams.get('price') || ''
    });
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-gray-50 py-16">
      <div className="max-w-3xl mx-auto px-6">
        <div className="bg-white rounded-lg shadow-sm border p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <span className="text-green-600 text-2xl">✓</span>
          </div>
          
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            Order Received Successfully!
          </h1>
          
          <p className="text-lg text-gray-600 mb-8">
            Thank you for your order. Our AI agents are now preparing your professional resume.
          </p>
          
          <div className="bg-blue-50 p-6 rounded-lg mb-8">
            <h2 className="text-xl font-semibold text-blue-900 mb-4">Order Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
              <div>
                <span className="text-sm font-medium text-blue-700">Package:</span>
                <p className="text-blue-900 font-semibold capitalize">{orderDetails.package}</p>
              </div>
              <div>
                <span className="text-sm font-medium text-blue-700">Price:</span>
                <p className="text-blue-900 font-semibold">${orderDetails.price}</p>
              </div>
              <div>
                <span className="text-sm font-medium text-blue-700">Session ID:</span>
                <p className="text-blue-900 font-mono text-sm">{orderDetails.session}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-green-50 p-6 rounded-lg mb-8">
            <h3 className="text-lg font-semibold text-green-900 mb-3">What happens next?</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
              <div className="text-center">
                <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-2">
                  <span className="text-white font-bold">1</span>
                </div>
                <p className="text-green-800">AI Analysis</p>
                <p className="text-green-600">Job requirements analyzed</p>
              </div>
              <div className="text-center">
                <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center mx-auto mb-2">
                  <span className="text-white font-bold">2</span>
                </div>
                <p className="text-green-800">Content Generation</p>
                <p className="text-green-600">Resume content created</p>
              </div>
              <div className="text-center">
                <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center mx-auto mb-2">
                  <span className="text-white font-bold">3</span>
                </div>
                <p className="text-green-800">Design & Format</p>
                <p className="text-green-600">Professional formatting applied</p>
              </div>
              <div className="text-center">
                <div className="w-8 h-8 bg-orange-600 rounded-full flex items-center justify-center mx-auto mb-2">
                  <span className="text-white font-bold">4</span>
                </div>
                <p className="text-green-800">Delivery</p>
                <p className="text-green-600">Sent to your email</p>
              </div>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a 
              href="/" 
              className="px-6 py-3 bg-blue-600 text-white rounded-md font-semibold hover:bg-blue-700 transition-colors"
            >
              Order Another Resume
            </a>
            <a 
              href="/dashboard" 
              className="px-6 py-3 bg-gray-100 text-gray-700 rounded-md font-semibold hover:bg-gray-200 transition-colors"
            >
              View Dashboard
            </a>
          </div>
          
          <div className="mt-8 text-sm text-gray-500">
            <p>Questions? Contact us at support@neuropilot.ai</p>
            <p className="mt-2">Expected delivery: 24-48 hours</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrderConfirmation;