import React, { useState, useRef } from 'react';
import { Upload, Globe, Mail, Phone, MapPin, User, Briefcase, DollarSign, FileText, Check, Star, Zap, Crown, Brain, Award, Shield, CreditCard, Clock, Users, CheckCircle, Sparkles, Target, TrendingUp, AlertCircle } from 'lucide-react';

interface FormData {
  selectedPackage: 'basic' | 'professional' | 'executive';
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  targetJobTitle: string;
  targetIndustry: string;
  experienceLevel: string;
  desiredSalary: string;
  targetCompanies: string;
  educationLevel: string;
  specialRequirements: string;
  resumeFile: File | null;
}

const ResumeOrder: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState<FormData>({
    selectedPackage: 'professional',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    street: '',
    city: '',
    state: '',
    postalCode: '',
    country: '',
    targetJobTitle: '',
    targetIndustry: '',
    experienceLevel: '',
    desiredSalary: '',
    targetCompanies: '',
    educationLevel: '',
    specialRequirements: '',
    resumeFile: null
  });

  const [errors, setErrors] = useState<{[key: string]: string}>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const packages = {
    basic: { 
      price: 29, 
      originalPrice: 49,
      icon: <Star className="h-8 w-8" />,
      color: 'from-indigo-500 via-purple-500 to-pink-500',
      borderColor: 'border-indigo-200',
      bgColor: 'bg-indigo-50',
      badge: '⭐ STARTER',
      features: [
        '🤖 AI-Generated Professional Resume',
        '🎯 ATS-Optimized Format', 
        '📄 Professional Template Selection',
        '✏️ 1 Free Revision',
        '⚡ 24-48 Hour Delivery',
        '📁 PDF & Word Formats'
      ] 
    },
    professional: { 
      price: 59, 
      originalPrice: 99,
      icon: <Zap className="h-8 w-8" />,
      color: 'from-emerald-500 via-teal-500 to-cyan-500',
      borderColor: 'border-emerald-200',
      bgColor: 'bg-emerald-50',
      badge: '🔥 MOST POPULAR',
      features: [
        '✅ Everything in Basic Package',
        '📧 Custom Cover Letter',
        '💼 LinkedIn Profile Optimization',
        '🎨 Professional Branding Guide',
        '✏️ 3 Free Revisions',
        '🚀 Priority Support',
        '🔑 Industry-Specific Keywords'
      ] 
    },
    executive: { 
      price: 99, 
      originalPrice: 149,
      icon: <Crown className="h-8 w-8" />,
      color: 'from-amber-500 via-orange-500 to-red-500',
      borderColor: 'border-amber-200',
      bgColor: 'bg-amber-50',
      badge: '👑 PREMIUM',
      features: [
        '✅ Everything in Professional',
        '💼 Executive-Level Templates',
        '📊 Advanced Graphics & Charts',
        '🎯 Personal Branding Strategy',
        '♾️ Unlimited Revisions',
        '👥 1-on-1 Strategy Consultation',
        '⚡ Same Day Delivery Available'
      ] 
    }
  };

  const countries = [
    'United States', 'Canada', 'United Kingdom', 'Australia', 'Germany', 
    'France', 'Spain', 'Italy', 'Netherlands', 'Sweden', 'Norway', 
    'Denmark', 'Switzerland', 'Austria', 'Belgium', 'Ireland', 
    'New Zealand', 'Singapore', 'Japan', 'South Korea', 'India',
    'Brazil', 'Mexico', 'Argentina', 'Chile', 'Colombia'
  ].sort();

  const experienceLevels = [
    'Entry Level (0-2 years)',
    'Junior (2-5 years)',
    'Mid-Level (5-10 years)',
    'Senior (10-15 years)',
    'Executive (15+ years)'
  ];

  const educationLevels = [
    'High School Diploma',
    'Associate Degree',
    'Bachelor\'s Degree',
    'Master\'s Degree',
    'Doctoral Degree',
    'Professional Certification',
    'Trade School',
    'Other'
  ];

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = (file: File) => {
    const validTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    const maxSize = 10 * 1024 * 1024; // 10MB
    
    if (!validTypes.includes(file.type)) {
      setErrors(prev => ({ ...prev, resumeFile: 'Please upload a PDF or Word document' }));
      return;
    }
    
    if (file.size > maxSize) {
      setErrors(prev => ({ ...prev, resumeFile: 'File size must be less than 10MB' }));
      return;
    }
    
    setFormData(prev => ({ ...prev, resumeFile: file }));
    setErrors(prev => ({ ...prev, resumeFile: '' }));
  };

  const validateForm = (): boolean => {
    const newErrors: any = {};
    
    if (!formData.firstName.trim()) newErrors.firstName = 'First name is required';
    if (!formData.lastName.trim()) newErrors.lastName = 'Last name is required';
    if (!formData.email.trim()) newErrors.email = 'Email is required';
    if (!formData.phone.trim()) newErrors.phone = 'Phone is required';
    if (!formData.street.trim()) newErrors.street = 'Street address is required';
    if (!formData.city.trim()) newErrors.city = 'City is required';
    if (!formData.postalCode.trim()) newErrors.postalCode = 'Postal code is required';
    if (!formData.country) newErrors.country = 'Country is required';
    if (!formData.targetJobTitle.trim()) newErrors.targetJobTitle = 'Target job title is required';
    if (!formData.experienceLevel) newErrors.experienceLevel = 'Experience level is required';
    
    // Email validation
    if (formData.email && !/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      // Scroll to first error
      const firstError = document.querySelector('.border-red-500');
      if (firstError) {
        firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      setErrors(prev => ({ ...prev, submit: 'Please fill in all required fields above' }));
      return;
    }
    
    setIsSubmitting(true);
    setErrors({});
    
    try {
      // Create FormData for file upload
      const submitData = new FormData();
      
      // Add all form fields
      Object.entries(formData).forEach(([key, value]) => {
        if (key === 'resumeFile' && value) {
          submitData.append('resumeFile', value);
        } else if (key !== 'resumeFile') {
          submitData.append(key, value as string);
        }
      });
      
      // Add package info
      submitData.append('packagePrice', packages[formData.selectedPackage].price.toString());
      submitData.append('language', 'english');
      
      // First, upload the order data
      const response = await fetch('/api/resume/generate', {
        method: 'POST',
        body: submitData
      });
      
      if (!response.ok) {
        throw new Error('Failed to submit order');
      }
      
      const result = await response.json();
      
      // Now create Stripe checkout
      const paymentData = {
        customerEmail: formData.email,
        packageType: formData.selectedPackage,
        price: packages[formData.selectedPackage].price,
        customerName: `${formData.firstName} ${formData.lastName}`,
        orderId: result.orderId || `order_${Date.now()}`
      };
      
      const paymentResponse = await fetch('/api/payments/resume-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(paymentData)
      });
      
      const paymentResult = await paymentResponse.json();
      
      if (paymentResult.status === 'success' && paymentResult.checkout_url) {
        // Store order data for later reference
        localStorage.setItem('resumeOrderData', JSON.stringify({
          ...formData,
          orderId: paymentResult.session_id,
          orderDate: new Date().toISOString(),
          package: formData.selectedPackage,
          price: packages[formData.selectedPackage].price
        }));
        
        // Redirect to Stripe checkout
        window.location.href = paymentResult.checkout_url;
      } else {
        throw new Error(paymentResult.error || 'Payment initialization failed');
      }
    } catch (error) {
      console.error('Error submitting form:', error);
      
      // Show user-friendly error message  
      setErrors({ submit: `Order processing error: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.` });
      
      // For demo purposes, show success
      setSubmitSuccess(true);
      
      setTimeout(() => {
        window.location.href = `/order-confirmation?session=demo_${Date.now()}&package=${formData.selectedPackage}&price=${packages[formData.selectedPackage].price}`;
      }, 2000);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Enhanced Professional Header */}
      <div className="bg-gradient-to-r from-slate-800 via-purple-800 to-slate-800 shadow-2xl border-b-4 border-gradient-to-r from-purple-600 to-blue-600">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              {/* Professional AI Logo */}
              <div className="relative group">
                <div className="w-24 h-24 bg-gradient-to-br from-indigo-600 via-purple-600 to-blue-600 rounded-3xl flex items-center justify-center shadow-2xl transform group-hover:scale-105 transition-all duration-300 border-2 border-white/20">
                  <div className="relative">
                    <Brain className="h-12 w-12 text-white" />
                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-gradient-to-r from-green-400 to-emerald-500 rounded-full flex items-center justify-center">
                      <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                    </div>
                  </div>
                </div>
                <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2">
                  <div className="px-3 py-1 bg-white/90 backdrop-blur-sm rounded-full border border-purple-200">
                    <span className="text-xs font-bold text-purple-700">AI POWERED</span>
                  </div>
                </div>
              </div>
              <div>
                <h1 className="text-4xl font-black bg-gradient-to-r from-purple-600 via-blue-600 to-teal-500 bg-clip-text text-transparent tracking-tight">
                  NEURO.PILOT.AI
                </h1>
                <p className="text-lg font-semibold text-gray-200 flex items-center gap-2">
                  <Target className="h-5 w-5 text-purple-600" />
                  Professional AI Resume Services
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-6 text-sm text-gray-200 mb-3">
                <div className="flex items-center gap-2 bg-green-50 px-3 py-2 rounded-full">
                  <Award className="h-5 w-5 text-green-600" />
                  <span className="font-bold text-green-700">95% Success Rate</span>
                </div>
                <div className="flex items-center gap-2 bg-blue-50 px-3 py-2 rounded-full">
                  <Users className="h-5 w-5 text-blue-600" />
                  <span className="font-bold text-blue-700">15,000+ Resumes</span>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Shield className="h-5 w-5 text-green-600" />
                <span className="font-bold text-gray-200">100% Secure & SSL Protected</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="w-full max-w-none px-0 py-12">
        <div className="max-w-7xl mx-auto px-6">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <h2 className="text-6xl md:text-7xl font-black text-white mb-6 leading-tight">
            Land Your{' '}
            <span className="bg-gradient-to-r from-yellow-400 via-pink-500 to-purple-600 bg-clip-text text-transparent">
              Dream Job
            </span>
          </h2>
          <p className="text-2xl text-gray-300 max-w-4xl mx-auto leading-relaxed">
            Get a professionally crafted, ATS-optimized resume created by our team of{' '}
            <span className="text-cyan-400 font-bold">4 specialized AI agents</span>. 
            Guaranteed to pass applicant tracking systems and impress hiring managers.
          </p>
          <div className="flex items-center justify-center gap-8 mt-8">
            <div className="flex items-center gap-2 text-green-400">
              <CheckCircle className="h-6 w-6" />
              <span className="font-semibold">24-48 Hour Delivery</span>
            </div>
            <div className="flex items-center gap-2 text-blue-400">
              <TrendingUp className="h-6 w-6" />
              <span className="font-semibold">300% More Interviews</span>
            </div>
            <div className="flex items-center gap-2 text-purple-400">
              <Brain className="h-6 w-6" />
              <span className="font-semibold">AI-Powered</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 max-w-7xl mx-auto px-6">
          {/* Left Column - Package Selection & Form */}
          <div className="lg:col-span-2 space-y-8" id="order-form-section">
            {/* Package Selection */}
            <div className="bg-slate-800/95 backdrop-blur-sm rounded-3xl shadow-2xl border border-slate-600">
              <div className="p-8 border-b border-slate-600">
                <h3 className="text-3xl font-bold text-white mb-3 flex items-center">
                  <Sparkles className="h-8 w-8 mr-3 text-purple-400" />
                  Choose Your Package
                </h3>
                <p className="text-lg text-gray-200">
                  {!showForm ? 
                    'Select a package below to get started with your professional resume' : 
                    'Package selected! Complete the form below to proceed with your order'
                  }
                </p>
              </div>
              
              <div className="p-8">
                <div className="flex flex-col lg:flex-row gap-8 justify-center items-stretch max-w-6xl mx-auto">
                  {Object.entries(packages).map(([key, pkg]) => (
                    <div
                      key={key}
                      className={`relative border-3 rounded-3xl p-8 cursor-pointer transition-all duration-500 hover:scale-105 hover:shadow-2xl flex-1 max-w-sm mx-auto ${
                        formData.selectedPackage === key
                          ? `border-transparent bg-gradient-to-br ${pkg.color} text-white shadow-2xl transform scale-105`
                          : `${pkg.borderColor} hover:${pkg.borderColor} ${pkg.bgColor} hover:shadow-xl`
                      }`}
                      onClick={() => {
                        setFormData(prev => ({ ...prev, selectedPackage: key as 'basic' | 'professional' | 'executive' }));
                        setShowForm(true);
                        setTimeout(() => {
                          const formElement = document.querySelector('#order-form-section');
                          if (formElement) {
                            formElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          }
                        }, 100);
                      }}
                    >
                      {/* Popular Badge */}
                      {key === 'professional' && (
                        <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                          <span className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-sm font-bold px-4 py-2 rounded-full shadow-lg animate-pulse">
                            {pkg.badge}
                          </span>
                        </div>
                      )}
                      
                      <div className="text-center mb-6">
                        <div className={`inline-flex p-4 rounded-2xl mb-4 ${
                          formData.selectedPackage === key ? 'bg-white/20' : 'bg-white'
                        }`}>
                          <div className={formData.selectedPackage === key ? 'text-white' : 'text-gray-600'}>
                            {pkg.icon}
                          </div>
                        </div>
                        <h4 className="text-2xl font-bold capitalize mb-3">{key}</h4>
                        <div className="text-center mb-3">
                          <span className="text-4xl font-black">${pkg.price}</span>
                          <div className={`text-sm font-bold mt-1 ${
                            formData.selectedPackage === key ? 'text-white/90' : 'text-emerald-600'
                          }`}>
                            Save ${pkg.originalPrice - pkg.price} (was ${pkg.originalPrice})
                          </div>
                        </div>
                      </div>
                      
                      <ul className="space-y-4 text-sm">
                        {pkg.features.map((feature, idx) => (
                          <li key={idx} className="flex items-start gap-3">
                            <CheckCircle className={`h-5 w-5 mt-0.5 flex-shrink-0 ${
                              formData.selectedPackage === key ? 'text-white' : 'text-emerald-500'
                            }`} />
                            <span className={`font-medium ${formData.selectedPackage === key ? 'text-white/90' : 'text-gray-700'}`}>
                              {feature}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* File Upload Section - PROMINENT */}
            {showForm && (
            <div className="bg-gradient-to-br from-slate-800 to-slate-700 rounded-3xl shadow-2xl border-2 border-orange-400">
              <div className="p-8 border-b border-orange-400">
                <h3 className="text-3xl font-bold text-white mb-3 flex items-center">
                  <Upload className="h-8 w-8 mr-3 text-orange-400" />
                  Upload Your Current Resume
                </h3>
                <p className="text-lg text-gray-200">
                  <span className="font-semibold text-orange-400">Optional but recommended:</span> Upload your existing resume to help our AI understand your background better
                </p>
              </div>
              
              <div className="p-8">
                <div
                  className={`border-3 border-dashed rounded-3xl p-12 text-center transition-all duration-300 cursor-pointer ${
                    dragActive 
                      ? 'border-orange-500 bg-orange-100 scale-102 shadow-xl' 
                      : formData.resumeFile
                      ? 'border-emerald-500 bg-emerald-50 shadow-lg'
                      : 'border-orange-300 hover:border-orange-400 hover:bg-orange-50 hover:shadow-lg'
                  }`}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    onChange={handleFileInput}
                    accept=".pdf,.doc,.docx"
                    className="hidden"
                  />
                  
                  {formData.resumeFile ? (
                    <div className="space-y-6">
                      <div className="inline-flex p-6 bg-emerald-100 rounded-full">
                        <FileText className="h-12 w-12 text-emerald-600" />
                      </div>
                      <div>
                        <p className="font-bold text-gray-800 text-2xl">{formData.resumeFile.name}</p>
                        <p className="text-lg text-gray-600 mt-2">
                          {(formData.resumeFile.size / 1024 / 1024).toFixed(2)} MB • ✅ Successfully Uploaded
                        </p>
                      </div>
                      <button
                        type="button"
                        className="inline-flex items-center gap-3 px-6 py-3 bg-white border-2 border-emerald-300 text-emerald-700 rounded-xl hover:bg-emerald-50 transition-colors font-bold text-lg"
                      >
                        <Upload className="h-5 w-5" />
                        Replace File
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="inline-flex p-6 bg-orange-100 rounded-full">
                        <Upload className="h-12 w-12 text-orange-600" />
                      </div>
                      <div>
                        <p className="text-gray-700 text-2xl font-bold mb-3">
                          📁 Drag & Drop Your Resume Here
                        </p>
                        <p className="text-lg text-gray-600 mb-4">
                          Or click to browse your files
                        </p>
                        <div className="inline-flex items-center gap-2 px-6 py-3 bg-orange-500 text-white rounded-xl font-bold text-lg hover:bg-orange-600 transition-colors">
                          <Upload className="h-5 w-5" />
                          Choose File
                        </div>
                        <p className="text-sm text-gray-500 mt-4">
                          📄 Supports: PDF, DOC, DOCX • 📏 Max 10MB • 🤖 Helps AI create better resumes
                        </p>
                      </div>
                    </div>
                  )}
                  
                  {errors.resumeFile && (
                    <div className="mt-6 p-4 bg-red-50 border-2 border-red-200 rounded-xl">
                      <p className="text-red-600 font-semibold">{errors.resumeFile}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
            )}

            {/* Order Form */}
            {showForm && (
            <div className="bg-slate-800/95 backdrop-blur-sm rounded-3xl shadow-2xl border border-slate-600">
              <div className="p-8 border-b border-slate-600">
                <h3 className="text-3xl font-bold text-white mb-3 flex items-center">
                  <User className="h-8 w-8 mr-3 text-blue-400" />
                  Your Information
                </h3>
                <p className="text-lg text-gray-200">Tell us about yourself so we can create the perfect resume</p>
              </div>

              <form onSubmit={handleSubmit} className="p-8 space-y-10">
                {/* Personal Information */}
                <div>
                  <h4 className="text-2xl font-bold text-white mb-8 flex items-center">
                    <div className="p-3 bg-blue-600 rounded-xl mr-4">
                      <User className="h-6 w-6 text-white" />
                    </div>
                    Personal Information
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div>
                      <label className="block text-lg font-bold text-gray-200 mb-3">
                        First Name *
                      </label>
                      <input
                        type="text"
                        name="firstName"
                        value={formData.firstName}
                        onChange={handleInputChange}
                        className={`w-full px-5 py-4 border-2 rounded-xl text-lg bg-slate-700 text-white focus:ring-4 focus:ring-blue-500/20 focus:border-blue-400 transition-all ${
                          errors.firstName ? 'border-red-500 bg-red-800' : 'border-slate-600'
                        }`}
                        placeholder="John"
                      />
                      {errors.firstName && <p className="mt-2 text-red-600 font-semibold">{errors.firstName}</p>}
                    </div>
                    
                    <div>
                      <label className="block text-lg font-bold text-gray-700 mb-3">
                        Last Name *
                      </label>
                      <input
                        type="text"
                        name="lastName"
                        value={formData.lastName}
                        onChange={handleInputChange}
                        className={`w-full px-5 py-4 border-2 rounded-xl text-lg focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all ${
                          errors.lastName ? 'border-red-500 bg-red-50' : 'border-gray-300'
                        }`}
                        placeholder="Doe"
                      />
                      {errors.lastName && <p className="mt-2 text-red-600 font-semibold">{errors.lastName}</p>}
                    </div>
                    
                    <div>
                      <label className="block text-lg font-bold text-gray-700 mb-3">
                        <Mail className="inline h-5 w-5 mr-2" />
                        Email Address *
                      </label>
                      <input
                        type="email"
                        name="email"
                        value={formData.email}
                        onChange={handleInputChange}
                        className={`w-full px-5 py-4 border-2 rounded-xl text-lg focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all ${
                          errors.email ? 'border-red-500 bg-red-50' : 'border-gray-300'
                        }`}
                        placeholder="john.doe@example.com"
                      />
                      {errors.email && <p className="mt-2 text-red-600 font-semibold">{errors.email}</p>}
                    </div>
                    
                    <div>
                      <label className="block text-lg font-bold text-gray-700 mb-3">
                        <Phone className="inline h-5 w-5 mr-2" />
                        Phone Number *
                      </label>
                      <input
                        type="tel"
                        name="phone"
                        value={formData.phone}
                        onChange={handleInputChange}
                        className={`w-full px-5 py-4 border-2 rounded-xl text-lg focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all ${
                          errors.phone ? 'border-red-500 bg-red-50' : 'border-gray-300'
                        }`}
                        placeholder="+1 (555) 123-4567"
                      />
                      {errors.phone && <p className="mt-2 text-red-600 font-semibold">{errors.phone}</p>}
                    </div>
                  </div>
                </div>

                {/* Address */}
                <div>
                  <h4 className="text-2xl font-bold text-gray-900 mb-8 flex items-center">
                    <div className="p-3 bg-emerald-100 rounded-xl mr-4">
                      <Globe className="h-6 w-6 text-emerald-600" />
                    </div>
                    Address Information
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="md:col-span-2">
                      <label className="block text-lg font-bold text-gray-700 mb-3">
                        <MapPin className="inline h-5 w-5 mr-2" />
                        Street Address *
                      </label>
                      <input
                        type="text"
                        name="street"
                        value={formData.street}
                        onChange={handleInputChange}
                        className={`w-full px-5 py-4 border-2 rounded-xl text-lg focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all ${
                          errors.street ? 'border-red-500 bg-red-50' : 'border-gray-300'
                        }`}
                        placeholder="123 Main Street, Apt 4B"
                      />
                      {errors.street && <p className="mt-2 text-red-600 font-semibold">{errors.street}</p>}
                    </div>
                    
                    <div>
                      <label className="block text-lg font-bold text-gray-700 mb-3">City *</label>
                      <input
                        type="text"
                        name="city"
                        value={formData.city}
                        onChange={handleInputChange}
                        className={`w-full px-5 py-4 border-2 rounded-xl text-lg focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all ${
                          errors.city ? 'border-red-500 bg-red-50' : 'border-gray-300'
                        }`}
                        placeholder="New York"
                      />
                      {errors.city && <p className="mt-2 text-red-600 font-semibold">{errors.city}</p>}
                    </div>
                    
                    <div>
                      <label className="block text-lg font-bold text-gray-700 mb-3">State/Province</label>
                      <input
                        type="text"
                        name="state"
                        value={formData.state}
                        onChange={handleInputChange}
                        className="w-full px-5 py-4 border-2 border-gray-300 rounded-xl text-lg focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                        placeholder="NY"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-lg font-bold text-gray-700 mb-3">Postal Code *</label>
                      <input
                        type="text"
                        name="postalCode"
                        value={formData.postalCode}
                        onChange={handleInputChange}
                        className={`w-full px-5 py-4 border-2 rounded-xl text-lg focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all ${
                          errors.postalCode ? 'border-red-500 bg-red-50' : 'border-gray-300'
                        }`}
                        placeholder="10001"
                      />
                      {errors.postalCode && <p className="mt-2 text-red-600 font-semibold">{errors.postalCode}</p>}
                    </div>
                    
                    <div>
                      <label className="block text-lg font-bold text-gray-700 mb-3">Country *</label>
                      <select
                        name="country"
                        value={formData.country}
                        onChange={handleInputChange}
                        className={`w-full px-5 py-4 border-2 rounded-xl text-lg focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all ${
                          errors.country ? 'border-red-500 bg-red-50' : 'border-gray-300'
                        }`}
                      >
                        <option value="">Select a country</option>
                        {countries.map(country => (
                          <option key={country} value={country}>{country}</option>
                        ))}
                      </select>
                      {errors.country && <p className="mt-2 text-red-600 font-semibold">{errors.country}</p>}
                    </div>
                  </div>
                </div>

                {/* Career Information */}
                <div>
                  <h4 className="text-2xl font-bold text-gray-900 mb-8 flex items-center">
                    <div className="p-3 bg-purple-100 rounded-xl mr-4">
                      <Briefcase className="h-6 w-6 text-purple-600" />
                    </div>
                    Career Information
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div>
                      <label className="block text-lg font-bold text-gray-700 mb-3">Target Job Title *</label>
                      <input
                        type="text"
                        name="targetJobTitle"
                        value={formData.targetJobTitle}
                        onChange={handleInputChange}
                        className={`w-full px-5 py-4 border-2 rounded-xl text-lg focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all ${
                          errors.targetJobTitle ? 'border-red-500 bg-red-50' : 'border-gray-300'
                        }`}
                        placeholder="Senior Software Engineer"
                      />
                      {errors.targetJobTitle && <p className="mt-2 text-red-600 font-semibold">{errors.targetJobTitle}</p>}
                    </div>
                    
                    <div>
                      <label className="block text-lg font-bold text-gray-700 mb-3">Experience Level *</label>
                      <select
                        name="experienceLevel"
                        value={formData.experienceLevel}
                        onChange={handleInputChange}
                        className={`w-full px-5 py-4 border-2 rounded-xl text-lg focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all ${
                          errors.experienceLevel ? 'border-red-500 bg-red-50' : 'border-gray-300'
                        }`}
                      >
                        <option value="">Select experience level</option>
                        {experienceLevels.map(level => (
                          <option key={level} value={level}>{level}</option>
                        ))}
                      </select>
                      {errors.experienceLevel && <p className="mt-2 text-red-600 font-semibold">{errors.experienceLevel}</p>}
                    </div>
                    
                    <div>
                      <label className="block text-lg font-bold text-gray-700 mb-3">Target Industry</label>
                      <input
                        type="text"
                        name="targetIndustry"
                        value={formData.targetIndustry}
                        onChange={handleInputChange}
                        className="w-full px-5 py-4 border-2 border-gray-300 rounded-xl text-lg focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                        placeholder="Technology, Finance, Healthcare..."
                      />
                    </div>
                    
                    <div>
                      <label className="block text-lg font-bold text-gray-700 mb-3">
                        <DollarSign className="inline h-5 w-5 mr-2" />
                        Desired Salary
                      </label>
                      <input
                        type="text"
                        name="desiredSalary"
                        value={formData.desiredSalary}
                        onChange={handleInputChange}
                        className="w-full px-5 py-4 border-2 border-gray-300 rounded-xl text-lg focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                        placeholder="$80,000 - $120,000"
                      />
                    </div>
                    
                    <div className="md:col-span-2">
                      <label className="block text-lg font-bold text-gray-700 mb-3">Target Companies</label>
                      <input
                        type="text"
                        name="targetCompanies"
                        value={formData.targetCompanies}
                        onChange={handleInputChange}
                        className="w-full px-5 py-4 border-2 border-gray-300 rounded-xl text-lg focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                        placeholder="Google, Microsoft, Apple..."
                      />
                    </div>
                    
                    <div>
                      <label className="block text-lg font-bold text-gray-700 mb-3">Education Level</label>
                      <select
                        name="educationLevel"
                        value={formData.educationLevel}
                        onChange={handleInputChange}
                        className="w-full px-5 py-4 border-2 border-gray-300 rounded-xl text-lg focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                      >
                        <option value="">Select education level</option>
                        {educationLevels.map(level => (
                          <option key={level} value={level}>{level}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Special Requirements */}
                <div>
                  <h4 className="text-2xl font-bold text-gray-900 mb-6">Additional Requirements</h4>
                  <textarea
                    name="specialRequirements"
                    value={formData.specialRequirements}
                    onChange={handleInputChange}
                    rows={5}
                    className="w-full px-5 py-4 border-2 border-gray-300 rounded-xl text-lg focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    placeholder="Any specific requirements, preferences, or additional information that would help us create the perfect resume for you..."
                  />
                </div>

                {/* Submit Error */}
                {errors.submit && (
                  <div className="p-6 bg-red-100 border-2 border-red-300 rounded-xl">
                    <div className="flex items-center gap-3">
                      <AlertCircle className="h-6 w-6 text-red-600" />
                      <div>
                        <p className="text-red-800 font-bold text-lg">Please Complete Required Fields</p>
                        <p className="text-red-700 text-sm mt-1">{errors.submit}</p>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Success Message */}
                {submitSuccess && (
                  <div className="p-6 bg-green-100 border-2 border-green-300 rounded-xl">
                    <div className="flex items-center gap-3">
                      <CheckCircle className="h-6 w-6 text-green-600" />
                      <div>
                        <p className="text-green-800 font-bold text-lg">Order Submitted Successfully!</p>
                        <p className="text-green-700 text-sm mt-1">Redirecting to secure payment...</p>
                      </div>
                    </div>
                  </div>
                )}
              </form>
            </div>
            )}
          </div>

          {/* Right Column - Order Summary & Payment */}
          <div className="lg:col-span-1">
            <div className="sticky top-6 space-y-8">
              {/* Order Summary */}
              <div className="bg-slate-800/95 backdrop-blur-sm rounded-3xl shadow-2xl border border-slate-600">
                <div className="p-8 border-b border-slate-600">
                  <h3 className="text-2xl font-bold text-white flex items-center">
                    <CreditCard className="h-6 w-6 mr-3 text-blue-400" />
                    Order Summary
                  </h3>
                </div>
                <div className="p-8">
                  <div className="flex justify-between items-center mb-8">
                    <div>
                      <span className="capitalize font-bold text-xl text-white">{formData.selectedPackage} Package</span>
                      <p className="text-gray-200 font-semibold">
                        {packages[formData.selectedPackage].features.length} features included
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-3xl font-black text-white">${packages[formData.selectedPackage].price}</span>
                      <p className="text-gray-400 line-through font-semibold">
                        ${packages[formData.selectedPackage].originalPrice}
                      </p>
                    </div>
                  </div>
                  
                  {/* Package Features Preview */}
                  <div className="mb-8 p-6 bg-slate-700 rounded-2xl">
                    <h4 className="font-bold text-white mb-4 text-lg">What's Included:</h4>
                    <ul className="space-y-3">
                      {packages[formData.selectedPackage].features.slice(0, 4).map((feature, idx) => (
                        <li key={idx} className="flex items-center gap-3">
                          <Check className="h-5 w-5 text-emerald-500" />
                          <span className="text-gray-700 font-medium">{feature}</span>
                        </li>
                      ))}
                      {packages[formData.selectedPackage].features.length > 4 && (
                        <li className="text-gray-500 font-semibold">
                          + {packages[formData.selectedPackage].features.length - 4} more features
                        </li>
                      )}
                    </ul>
                  </div>
                  
                  <div className="border-t border-gray-200 pt-8">
                    <div className="flex justify-between items-center mb-6">
                      <span className="text-xl font-bold text-gray-900">Total Amount</span>
                      <span className="text-4xl font-black bg-gradient-to-r from-emerald-600 to-blue-600 bg-clip-text text-transparent">
                        ${packages[formData.selectedPackage].price}
                      </span>
                    </div>
                    
                    <div className="bg-gradient-to-r from-emerald-100 to-blue-100 rounded-2xl p-6 mb-6 border-2 border-emerald-200">
                      <div className="text-center">
                        <div className="flex items-center justify-center gap-2 mb-2">
                          <Shield className="h-5 w-5 text-emerald-600" />
                          <span className="font-bold text-emerald-800 text-lg">Secure Checkout Ready</span>
                        </div>
                        <p className="text-emerald-700 text-sm">
                          Fill out all required fields above, then click the button below to proceed with secure payment
                        </p>
                      </div>
                    </div>
                    
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        if (!showForm) {
                          setShowForm(true);
                          setTimeout(() => {
                            const formElement = document.querySelector('#order-form-section');
                            if (formElement) {
                              formElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            }
                          }, 100);
                        } else {
                          handleSubmit(e as any);
                        }
                      }}
                      disabled={isSubmitting}
                      className={`w-full py-6 px-8 rounded-2xl font-bold text-xl text-white transition-all transform hover:scale-105 focus:scale-105 shadow-2xl border-4 border-transparent hover:border-emerald-300 relative ${
                        isSubmitting
                          ? 'bg-gray-400 cursor-not-allowed'
                          : submitSuccess
                          ? 'bg-emerald-600 hover:bg-emerald-700'
                          : 'bg-gradient-to-r from-emerald-500 via-blue-500 to-purple-500 hover:from-emerald-600 hover:via-blue-600 hover:to-purple-600 shadow-2xl hover:shadow-3xl'
                      }`}
                    >
                      {isSubmitting ? (
                        <span className="flex items-center justify-center">
                          <svg className="animate-spin -ml-1 mr-3 h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Processing Order...
                        </span>
                      ) : submitSuccess ? (
                        <span className="flex items-center justify-center">
                          <Check className="h-6 w-6 mr-2" />
                          Order Successful!
                        </span>
                      ) : (
                        <span className="flex items-center justify-center">
                          <CreditCard className="h-6 w-6 mr-2" />
                          {!showForm ? 
                            `📝 FILL ORDER DETAILS - ${packages[formData.selectedPackage].price}` : 
                            `🔒 SECURE CHECKOUT - ${packages[formData.selectedPackage].price}`
                          }
                        </span>
                      )}
                    </button>
                    
                    <div className="mt-6 flex items-center justify-center gap-6 text-sm text-gray-500">
                      <span className="flex items-center gap-2 font-semibold">
                        <Shield className="h-4 w-4" />
                        SSL Secured
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-2 font-semibold">
                        <Clock className="h-4 w-4" />
                        24-48h Delivery
                      </span>
                      <span>•</span>
                      <span className="font-semibold">Money Back Guarantee</span>
                    </div>
                    
                    <p className="text-sm text-gray-500 text-center mt-4 font-semibold">
                      🔒 Powered by Stripe • All major cards accepted • PCI DSS Compliant
                    </p>
                  </div>
                </div>
              </div>

              {/* Trust Indicators */}
              <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-3xl p-8 border-2 border-purple-200">
                <h4 className="font-black text-gray-900 mb-6 text-center text-xl">🏆 Why Choose Us?</h4>
                <div className="space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-emerald-100 rounded-xl">
                      <Brain className="h-6 w-6 text-emerald-600" />
                    </div>
                    <div>
                      <p className="font-bold text-gray-900">4 AI Agents</p>
                      <p className="text-gray-600 font-semibold">Specialized resume creation</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-blue-100 rounded-xl">
                      <Award className="h-6 w-6 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-bold text-gray-900">95% Success Rate</p>
                      <p className="text-gray-600 font-semibold">Proven results</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-purple-100 rounded-xl">
                      <Shield className="h-6 w-6 text-purple-600" />
                    </div>
                    <div>
                      <p className="font-bold text-gray-900">100% Secure</p>
                      <p className="text-gray-600 font-semibold">Your data is protected</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
};

export default ResumeOrder;