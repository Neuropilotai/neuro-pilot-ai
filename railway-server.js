require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createServer } = require('http');
const fs = require('fs');
const path = require('path');
const stripe = process.env.STRIPE_SECRET_KEY ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null;

const app = express();
const server = createServer(app);

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? true : ["http://localhost:3000"],
  credentials: true
}));
app.use(express.json());
app.use(express.static('public'));

// Serve frontend build files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, './frontend/build')));
}

// Multer for file uploads
const multer = require('multer');
const upload = multer({ 
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.doc', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF and Word documents are allowed.'));
    }
  }
});

// Create necessary directories
const requiredDirs = ['uploads', 'generated_resumes', 'public'];
requiredDirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`📁 Created directory: ${dir}`);
  }
});

// Basic resume generation endpoint (simplified for Railway)
app.post('/api/resume/generate', upload.single('resumeFile'), async (req, res) => {
  try {
    console.log('📝 Resume generation request received');
    
    const orderData = {
      ...req.body,
      orderId: `order_${Date.now()}`,
      timestamp: new Date().toISOString(),
      status: 'received',
      packageType: req.body.packageType || 'professional',
      revisions: {
        total: req.body.packageType === 'executive' ? 5 : req.body.packageType === 'professional' ? 3 : 1,
        used: 0,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() // 1 year from now
      },
      resumeFiles: []
    };
    
    // Create directories for orders and resumes
    const orderPath = path.join(__dirname, 'orders', `${orderData.orderId}.json`);
    const resumeDir = path.join(__dirname, 'sent_resumes', orderData.orderId);
    
    if (!fs.existsSync(path.dirname(orderPath))) {
      fs.mkdirSync(path.dirname(orderPath), { recursive: true });
    }
    if (!fs.existsSync(resumeDir)) {
      fs.mkdirSync(resumeDir, { recursive: true });
    }
    
    // Save uploaded file if provided
    if (req.file) {
      const uploadedPath = path.join(resumeDir, `original_${req.file.originalname}`);
      fs.renameSync(req.file.path, uploadedPath);
      orderData.originalResume = uploadedPath;
    }
    
    fs.writeFileSync(orderPath, JSON.stringify(orderData, null, 2));
    
    console.log(`✅ Order ${orderData.orderId} stored successfully`);
    console.log(`📊 Package: ${orderData.packageType} | Revisions: ${orderData.revisions.total}`);
    
    res.json({
      status: 'success',
      orderId: orderData.orderId,
      message: 'Resume generation request received',
      revisions: orderData.revisions
    });
    
  } catch (error) {
    console.error('❌ Error processing resume order:', error);
    res.status(500).json({ error: 'Failed to process resume order' });
  }
});

// Stripe payment endpoint for resumes
app.post('/api/payments/resume-checkout', async (req, res) => {
  try {
    const { customerEmail, packageType, price, customerName, orderId } = req.body;
    
    if (!customerEmail || !packageType) {
      return res.status(400).json({ error: 'Customer email and package type required' });
    }

    if (!stripe) {
      console.log('⚠️ Stripe not configured - using demo mode');
      return res.json({
        status: 'success',
        checkout_url: `/order-confirmation?session=demo_${Date.now()}&package=${packageType}&price=${price}`,
        session_id: `demo_${Date.now()}`
      });
    }

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `AI Resume - ${packageType.charAt(0).toUpperCase() + packageType.slice(1)} Package`,
              description: 'Professional AI-generated resume with ATS optimization',
            },
            unit_amount: price * 100,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${req.headers.origin}/order-confirmation?session={CHECKOUT_SESSION_ID}&package=${packageType}&price=${price}`,
      cancel_url: `${req.headers.origin}/`,
      customer_email: customerEmail,
      metadata: {
        packageType,
        orderId: orderId || `order_${Date.now()}`,
        customerName: customerName || 'Customer'
      }
    });

    console.log(`💳 Payment session created for ${packageType} package - $${price}`);

    res.json({
      status: 'success',
      checkout_url: session.url,
      session_id: session.id
    });

  } catch (error) {
    console.error('❌ Payment error:', error);
    res.status(500).json({ error: 'Payment processing failed' });
  }
});

// Homepage
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Neuro.Pilot.AI - Professional Resume Service</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
          body { 
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
            margin: 0;
            padding: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            line-height: 1.6;
          }
          .container {
            text-align: center;
            padding: 60px 50px;
            background: rgba(255,255,255,0.98);
            border-radius: 32px;
            box-shadow: 0 32px 64px rgba(0,0,0,0.15);
            backdrop-filter: blur(20px);
            border: 1px solid rgba(255,255,255,0.2);
            max-width: 700px;
            margin: 20px;
          }
          .logo {
            display: inline-flex;
            align-items: center;
            gap: 15px;
            margin-bottom: 30px;
          }
          .logo-icon {
            width: 80px;
            height: 80px;
            background: linear-gradient(45deg, #667eea, #764ba2);
            border-radius: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 36px;
            color: white;
            font-weight: bold;
            box-shadow: 0 8px 20px rgba(0,0,0,0.2);
          }
          .logo-text {
            text-align: left;
          }
          .logo-title {
            font-size: 32px;
            font-weight: bold;
            color: #333;
            margin: 0;
          }
          .logo-subtitle {
            font-size: 16px;
            color: #666;
            margin: 0;
          }
          h1 { 
            color: #333; 
            margin: 20px 0;
            font-size: 28px;
          }
          .status { 
            color: #28a745; 
            font-weight: bold;
            font-size: 20px;
            margin: 20px 0;
          }
          .stats {
            display: flex;
            justify-content: space-around;
            margin: 30px 0;
            padding: 20px 0;
            border-top: 1px solid #eee;
            border-bottom: 1px solid #eee;
          }
          .stat {
            text-align: center;
          }
          .stat-number {
            font-size: 32px;
            font-weight: bold;
            color: #667eea;
          }
          .stat-label {
            color: #666;
            font-size: 14px;
          }
          .buttons {
            margin: 30px 0;
          }
          .btn { 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white; 
            padding: 18px 40px; 
            text-decoration: none; 
            border-radius: 50px; 
            display: inline-block; 
            margin: 10px;
            font-weight: 600;
            font-size: 18px;
            transition: all 0.3s;
            box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
          }
          .btn:hover { 
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
          }
          .btn.secondary {
            background: white;
            color: #667eea;
            border: 2px solid #667eea;
          }
          .btn.secondary:hover {
            background: #f0f4ff;
          }
          .features {
            display: flex;
            justify-content: space-around;
            margin: 30px 0;
            flex-wrap: wrap;
          }
          .feature {
            flex: 1;
            margin: 10px;
            min-width: 120px;
          }
          .feature-icon {
            font-size: 32px;
            margin-bottom: 10px;
          }
          .feature-text {
            color: #666;
            font-size: 14px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo">
            <div class="logo-icon">N.P</div>
            <div class="logo-text">
              <h2 class="logo-title">NEURO.PILOT.AI</h2>
              <p class="logo-subtitle">Professional Resume Service</p>
            </div>
          </div>
          
          <h1>🚀 AI-Powered Resume Generation</h1>
          <p class="status">✅ Service is Online</p>
          
          <div class="stats">
            <div class="stat">
              <div class="stat-number">AI</div>
              <div class="stat-label">Powered</div>
            </div>
            <div class="stat">
              <div class="stat-number">ATS</div>
              <div class="stat-label">Optimized</div>
            </div>
            <div class="stat">
              <div class="stat-number">24h</div>
              <div class="stat-label">Delivery</div>
            </div>
          </div>
          
          <div class="features">
            <div class="feature">
              <div class="feature-icon">🤖</div>
              <div class="feature-text">AI-Optimized</div>
            </div>
            <div class="feature">
              <div class="feature-icon">✅</div>
              <div class="feature-text">ATS-Friendly</div>
            </div>
            <div class="feature">
              <div class="feature-icon">💼</div>
              <div class="feature-text">Professional</div>
            </div>
            <div class="feature">
              <div class="feature-icon">⚡</div>
              <div class="feature-text">Fast Delivery</div>
            </div>
          </div>
          
          <div class="buttons">
            <a href="/order" class="btn">📝 Order Your Resume</a>
            <a href="https://pro.fiverr.com/users/neuropilot" class="btn secondary" target="_blank">💼 View on Fiverr</a>
          </div>
          
          <p style="color: #666; font-size: 14px;">Professional AI resume optimization service</p>
        </div>
      </body>
    </html>
  `);
});

// Order page with full form and payment
app.get('/order', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Order Professional AI Resume - Neuro.Pilot.AI</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { 
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
            min-height: 100vh;
            line-height: 1.6;
          }
          .header {
            background: rgba(255,255,255,0.95);
            backdrop-filter: blur(20px);
            padding: 25px 0;
            text-align: center;
            border-bottom: 1px solid rgba(255,255,255,0.3);
            box-shadow: 0 8px 32px rgba(0,0,0,0.1);
          }
          .logo {
            display: inline-flex;
            align-items: center;
            gap: 15px;
            text-decoration: none;
          }
          .logo-icon {
            width: 60px;
            height: 60px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
            border-radius: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 28px;
            color: white;
            font-weight: 800;
            box-shadow: 0 8px 25px rgba(102,126,234,0.4);
            position: relative;
            overflow: hidden;
          }
          .logo-icon::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: linear-gradient(45deg, rgba(255,255,255,0.2), transparent);
          }
          .logo-text {
            color: #333;
            font-size: 28px;
            font-weight: 800;
            letter-spacing: -0.5px;
          }
          .logo-subtitle {
            color: #666;
            font-size: 14px;
            font-weight: 500;
            letter-spacing: 0.5px;
          }
          .container { 
            max-width: 900px; 
            margin: 40px auto; 
            background: rgba(255,255,255,0.98); 
            padding: 60px 50px; 
            border-radius: 32px; 
            box-shadow: 0 32px 64px rgba(0,0,0,0.12);
            backdrop-filter: blur(20px);
            border: 1px solid rgba(255,255,255,0.2);
          }
          h1 { 
            color: #1a1a1a; 
            text-align: center; 
            margin-bottom: 16px;
            font-size: 48px;
            font-weight: 800;
            letter-spacing: -1px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
          }
          h2 {
            color: #2d3748;
            border-bottom: 3px solid transparent;
            border-image: linear-gradient(90deg, #667eea, #764ba2, #f093fb) 1;
            padding-bottom: 16px;
            margin-top: 48px;
            font-size: 28px;
            font-weight: 700;
          }
          .subtitle { 
            text-align: center; 
            color: #4a5568; 
            margin-bottom: 40px;
            font-size: 20px;
            font-weight: 500;
          }
          .package-selector { 
            display: grid; 
            grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
            gap: 24px; 
            margin: 40px 0;
          }
          .package { 
            padding: 32px 24px; 
            border: 2px solid rgba(102,126,234,0.1); 
            border-radius: 24px; 
            cursor: pointer; 
            text-align: center; 
            transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
            background: linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(248,250,252,0.9) 100%);
            position: relative;
            overflow: hidden;
            backdrop-filter: blur(10px);
          }
          .package::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 4px;
            background: linear-gradient(90deg, #667eea, #764ba2, #f093fb);
            opacity: 0;
            transition: opacity 0.3s;
          }
          .package:hover { 
            border-color: rgba(102,126,234,0.3); 
            transform: translateY(-8px) scale(1.02);
            box-shadow: 0 20px 40px rgba(102, 126, 234, 0.15);
            background: linear-gradient(135deg, rgba(255,255,255,1) 0%, rgba(248,250,252,1) 100%);
          }
          .package:hover::before {
            opacity: 1;
          }
          .package.selected { 
            border-color: #667eea; 
            background: linear-gradient(135deg, rgba(102,126,234,0.05) 0%, rgba(255,255,255,0.95) 100%);
            box-shadow: 0 24px 48px rgba(102, 126, 234, 0.2);
            transform: translateY(-4px);
          }
          .package.selected::before {
            opacity: 1;
          }
          .package.selected::after {
            content: '✓';
            position: absolute;
            top: 16px;
            right: 16px;
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
            font-weight: bold;
            box-shadow: 0 4px 12px rgba(102,126,234,0.3);
          }
          .package h3 { 
            margin: 0 0 16px 0; 
            color: #1a202c;
            font-size: 26px;
            font-weight: 700;
            letter-spacing: -0.5px;
          }
          .package .price { 
            font-size: 48px; 
            font-weight: 800; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            margin: 16px 0 24px 0;
            line-height: 1;
          }
          .package ul { 
            text-align: left; 
            padding: 0; 
            margin: 24px 0; 
            font-size: 15px;
            list-style: none;
            space-y: 12px;
          }
          .package ul li {
            padding: 12px 0;
            padding-left: 32px;
            position: relative;
            color: #4a5568;
            font-weight: 500;
            line-height: 1.5;
          }
          .package ul li::before {
            content: '✓';
            position: absolute;
            left: 0;
            top: 12px;
            color: #48bb78;
            font-weight: bold;
            font-size: 16px;
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background: rgba(72,187,120,0.1);
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .form-grid { 
            display: grid; 
            grid-template-columns: 1fr 1fr; 
            gap: 24px; 
            margin: 32px 0;
          }
          @media (max-width: 768px) {
            .form-grid {
              grid-template-columns: 1fr;
            }
            .container {
              padding: 40px 24px;
              margin: 20px;
            }
            h1 {
              font-size: 36px;
            }
          }
          .form-group { margin-bottom: 24px; }
          .form-group.full { grid-column: 1 / -1; }
          label { 
            display: block; 
            margin-bottom: 8px; 
            font-weight: 600; 
            color: #2d3748;
            font-size: 15px;
            letter-spacing: 0.3px;
          }
          .required { color: #e53e3e; }
          input, select, textarea { 
            width: 100%; 
            padding: 16px 20px; 
            border: 2px solid #e2e8f0; 
            border-radius: 12px; 
            font-size: 16px;
            font-weight: 500;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            background: rgba(255,255,255,0.8);
            backdrop-filter: blur(10px);
          }
          input:focus, select:focus, textarea:focus {
            outline: none;
            border-color: #667eea;
            background: white;
            box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.1);
            transform: translateY(-2px);
          }
          input:hover, select:hover, textarea:hover {
            border-color: #cbd5e0;
          }
          textarea { resize: vertical; min-height: 120px; }
          .file-upload { 
            border: 3px dashed rgba(102,126,234,0.3); 
            padding: 40px; 
            text-align: center; 
            border-radius: 16px; 
            background: linear-gradient(135deg, rgba(102,126,234,0.02) 0%, rgba(248,250,252,0.8) 100%);
            transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
            backdrop-filter: blur(10px);
          }
          .file-upload:hover {
            background: linear-gradient(135deg, rgba(102,126,234,0.05) 0%, rgba(248,250,252,1) 100%);
            border-color: rgba(102,126,234,0.5);
            transform: translateY(-2px);
          }
          button { 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
            color: white; 
            padding: 20px 48px; 
            border: none; 
            border-radius: 16px; 
            font-size: 18px; 
            cursor: pointer; 
            width: 100%; 
            margin-top: 32px;
            font-weight: 700;
            letter-spacing: 0.5px;
            transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
            box-shadow: 0 8px 25px rgba(102, 126, 234, 0.25);
            position: relative;
            overflow: hidden;
          }
          button::before {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
            transition: left 0.5s;
          }
          button:hover::before {
            left: 100%;
          }
          button:hover { 
            transform: translateY(-3px);
            box-shadow: 0 12px 35px rgba(102, 126, 234, 0.35);
          }
          button:active {
            transform: translateY(-1px);
          }
          button:disabled {
            background: #a0aec0;
            cursor: not-allowed;
            transform: none;
            box-shadow: none;
          }
          .security { 
            text-align: center; 
            color: #666; 
            font-size: 14px; 
            margin-top: 20px;
          }
          .guarantee { 
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
            color: white;
            padding: 25px; 
            border-radius: 15px; 
            margin: 20px 0; 
            text-align: center;
            font-size: 18px;
            box-shadow: 0 4px 15px rgba(245, 87, 108, 0.3);
          }
          .features {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 32px;
            margin: 48px 0;
          }
          .feature {
            text-align: center;
            padding: 24px;
            border-radius: 20px;
            background: rgba(255,255,255,0.6);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255,255,255,0.2);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          }
          .feature:hover {
            transform: translateY(-4px);
            background: rgba(255,255,255,0.8);
            box-shadow: 0 12px 25px rgba(0,0,0,0.08);
          }
          .feature-icon {
            width: 72px;
            height: 72px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
            border-radius: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 16px;
            font-size: 32px;
            color: white;
            box-shadow: 0 8px 20px rgba(102,126,234,0.3);
          }
          .feature h4 {
            margin: 16px 0 8px;
            color: #1a202c;
            font-size: 18px;
            font-weight: 600;
          }
          .feature p {
            color: #4a5568;
            font-size: 15px;
            margin: 0;
            font-weight: 500;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <a href="/" class="logo">
            <div class="logo-icon">N.P</div>
            <div>
              <div class="logo-text">NEURO.PILOT.AI</div>
              <div class="logo-subtitle">Professional Resume Service</div>
            </div>
          </a>
        </div>
        
        <div class="container">
          <h1>🚀 Get Your Dream Job with AI-Powered Resume</h1>
          <p class="subtitle">Professional AI-powered resume optimization service</p>
          
          <div class="features">
            <div class="feature">
              <div class="feature-icon">🤖</div>
              <h4>AI-Powered</h4>
              <p>Advanced AI optimization</p>
            </div>
            <div class="feature">
              <div class="feature-icon">⚡</div>
              <h4>Fast Delivery</h4>
              <p>Get your resume in hours</p>
            </div>
            <div class="feature">
              <div class="feature-icon">✅</div>
              <h4>ATS-Friendly</h4>
              <p>Pass applicant tracking systems</p>
            </div>
            <div class="feature">
              <div class="feature-icon">💼</div>
              <h4>Professional</h4>
              <p>Industry-specific keywords</p>
            </div>
          </div>
          
          
          <form id="orderForm">
            <!-- Package Selection -->
            <h2>Select Your Package</h2>
            <div class="package-selector">
              <div class="package" data-package="basic" data-price="25">
                <h3>Basic</h3>
                <div class="price">$25</div>
                <ul>
                  <li>Professional formatting</li>
                  <li>ATS optimization</li>
                  <li>1 revision (within 1 year)</li>
                  <li>24-hour delivery</li>
                </ul>
              </div>
              <div class="package selected" data-package="professional" data-price="45">
                <h3>Professional</h3>
                <div class="price">$45</div>
                <ul>
                  <li>Everything in Basic</li>
                  <li>Cover letter included</li>
                  <li>LinkedIn optimization tips</li>
                  <li>3 revisions (within 1 year)</li>
                  <li>12-hour delivery</li>
                </ul>
              </div>
              <div class="package" data-package="executive" data-price="85">
                <h3>Executive</h3>
                <div class="price">$85</div>
                <ul>
                  <li>Everything in Professional</li>
                  <li>Executive summary</li>
                  <li>Industry-specific keywords</li>
                  <li>5 revisions (within 1 year)</li>
                  <li>6-hour delivery</li>
                </ul>
              </div>
            </div>
            
            <input type="hidden" name="packageType" value="professional">
            <input type="hidden" name="price" value="45">
            
            <!-- Contact Information -->
            <h2>Contact Information</h2>
            <div class="form-grid">
              <div class="form-group">
                <label>First Name <span class="required">*</span></label>
                <input type="text" name="firstName" required>
              </div>
              <div class="form-group">
                <label>Last Name <span class="required">*</span></label>
                <input type="text" name="lastName" required>
              </div>
              <div class="form-group">
                <label>Email <span class="required">*</span></label>
                <input type="email" name="customerEmail" required>
              </div>
              <div class="form-group">
                <label>Phone</label>
                <input type="tel" name="phone" placeholder="(555) 123-4567">
              </div>
            </div>
            
            <!-- Job Information -->
            <h2>Job Details</h2>
            <div class="form-grid">
              <div class="form-group full">
                <label>Job Title You're Applying For <span class="required">*</span></label>
                <input type="text" name="targetJobTitle" required placeholder="e.g., Senior Software Engineer">
              </div>
              <div class="form-group full">
                <label>Job Description <span class="required">*</span></label>
                <textarea name="jobDescription" required placeholder="Paste the job description here..."></textarea>
              </div>
              <div class="form-group">
                <label>Company Name</label>
                <input type="text" name="companyName" placeholder="e.g., Google">
              </div>
              <div class="form-group">
                <label>Industry</label>
                <select name="industry">
                  <option value="">Select Industry</option>
                  <option value="technology">Technology</option>
                  <option value="healthcare">Healthcare</option>
                  <option value="finance">Finance</option>
                  <option value="retail">Retail</option>
                  <option value="education">Education</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
            
            <!-- Experience Information -->
            <h2>Your Background</h2>
            <div class="form-grid">
              <div class="form-group full">
                <label>Work Experience <span class="required">*</span></label>
                <textarea name="experience" required placeholder="Describe your work experience, including job titles, companies, and key achievements..."></textarea>
              </div>
              <div class="form-group full">
                <label>Key Skills <span class="required">*</span></label>
                <input type="text" name="skills" required placeholder="e.g., Project Management, Python, Sales, Customer Service">
              </div>
              <div class="form-group">
                <label>Education Level</label>
                <select name="educationLevel">
                  <option value="">Select Education</option>
                  <option value="highschool">High School</option>
                  <option value="bachelors">Bachelor's Degree</option>
                  <option value="masters">Master's Degree</option>
                  <option value="phd">PhD</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div class="form-group">
                <label>Years of Experience</label>
                <select name="yearsExperience">
                  <option value="">Select Years</option>
                  <option value="0-1">0-1 years</option>
                  <option value="2-5">2-5 years</option>
                  <option value="6-10">6-10 years</option>
                  <option value="11-15">11-15 years</option>
                  <option value="16+">16+ years</option>
                </select>
              </div>
            </div>
            
            <!-- File Upload -->
            <h2>Current Resume (Optional)</h2>
            <div class="file-upload">
              <p>📎 Upload your current resume for reference</p>
              <input type="file" name="currentResume" accept=".pdf,.doc,.docx">
              <p style="font-size: 12px; color: #666;">Accepted formats: PDF, DOC, DOCX (Max 10MB)</p>
            </div>
            
            <button type="submit">💳 Proceed to Secure Payment</button>
            
            <div style="background: #f0f8ff; padding: 15px; border-radius: 8px; margin: 20px 0; font-size: 14px; color: #555;">
              <strong>📋 Revision Policy:</strong><br>
              • Basic: 1 revision | Professional: 3 revisions | Executive: 5 revisions<br>
              • All revisions must be used within 1 year of purchase<br>
              • Your resume will be saved in our system for easy access
            </div>
            
            <p class="security">🔒 Your information is secure and encrypted</p>
          </form>
        </div>
        
        <script>
          // Package selection
          document.querySelectorAll('.package').forEach(pkg => {
            pkg.addEventListener('click', function() {
              document.querySelectorAll('.package').forEach(p => p.classList.remove('selected'));
              this.classList.add('selected');
              document.querySelector('input[name="packageType"]').value = this.dataset.package;
              document.querySelector('input[name="price"]').value = this.dataset.price;
            });
          });
          
          // Form submission
          document.getElementById('orderForm').onsubmit = async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const data = Object.fromEntries(formData);
            
            // Combine names
            data.customerName = data.firstName + ' ' + data.lastName;
            
            // Show loading
            const btn = e.target.querySelector('button');
            btn.textContent = '⏳ Processing...';
            btn.disabled = true;
            
            try {
              // First save the order
              const orderResponse = await fetch('/api/resume/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
              });
              
              const orderResult = await orderResponse.json();
              
              if (orderResult.status === 'success') {
                // Then redirect to payment
                const paymentResponse = await fetch('/api/payments/resume-checkout', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    customerEmail: data.customerEmail,
                    packageType: data.packageType,
                    price: parseInt(data.price),
                    customerName: data.customerName,
                    orderId: orderResult.orderId
                  })
                });
                
                const paymentResult = await paymentResponse.json();
                
                if (paymentResult.checkout_url) {
                  window.location.href = paymentResult.checkout_url;
                } else {
                  alert('Payment system unavailable. Your order has been saved. Order ID: ' + orderResult.orderId);
                }
              } else {
                alert('Error: ' + (orderResult.error || 'Failed to process order'));
              }
            } catch (error) {
              alert('Error submitting order: ' + error.message);
            } finally {
              btn.textContent = '💳 Proceed to Secure Payment';
              btn.disabled = false;
            }
          };
        </script>
      </body>
    </html>
  `);
});

// Order confirmation page
app.get('/order-confirmation', (req, res) => {
  const { session, package: packageType, price } = req.query;
  res.send(`
    <html>
      <head>
        <title>Order Confirmed - Neuro.Pilot.AI</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 40px; background: #f5f5f5; margin: 0; }
          .container { max-width: 600px; margin: auto; background: white; padding: 40px; border-radius: 10px; box-shadow: 0 0 20px rgba(0,0,0,0.1); text-align: center; }
          h1 { color: #28a745; }
          .order-details { background: #f0f8ff; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .next-steps { text-align: left; margin: 20px 0; }
          .next-steps li { margin: 10px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>✅ Order Confirmed!</h1>
          <p>Thank you for your order. We've received your payment and will start working on your resume immediately.</p>
          
          <div class="order-details">
            <h3>Order Details</h3>
            <p><strong>Package:</strong> ${packageType ? packageType.charAt(0).toUpperCase() + packageType.slice(1) : 'Professional'}</p>
            <p><strong>Order ID:</strong> ${session || 'Processing'}</p>
            <p><strong>Delivery Time:</strong> Within ${packageType === 'executive' ? '6' : packageType === 'professional' ? '12' : '24'} hours</p>
          </div>
          
          <div class="next-steps">
            <h3>What Happens Next?</h3>
            <ol>
              <li>Our AI will analyze your information and the job description</li>
              <li>A professional resume will be created and ATS-optimized</li>
              <li>You'll receive your resume via email within the promised timeframe</li>
              <li>If you need any revisions, just reply to the email</li>
            </ol>
          </div>
          
          <p>Check your email for order confirmation and updates.</p>
          <p>Questions? Email us at support@neuro-pilot.ai</p>
        </div>
      </body>
    </html>
  `);
});

// Get order status and files
app.get('/api/order/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const orderPath = path.join(__dirname, 'orders', `${orderId}.json`);
    
    if (!fs.existsSync(orderPath)) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    const orderData = JSON.parse(fs.readFileSync(orderPath, 'utf8'));
    res.json(orderData);
    
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// Save sent resume
app.post('/api/order/:orderId/resume', upload.single('resume'), async (req, res) => {
  try {
    const { orderId } = req.params;
    const { version = 'final' } = req.body;
    
    const orderPath = path.join(__dirname, 'orders', `${orderId}.json`);
    const resumeDir = path.join(__dirname, 'sent_resumes', orderId);
    
    if (!fs.existsSync(orderPath)) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    // Read order data
    const orderData = JSON.parse(fs.readFileSync(orderPath, 'utf8'));
    
    // Save resume file
    if (req.file) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const resumePath = path.join(resumeDir, `resume_${version}_${timestamp}.pdf`);
      fs.renameSync(req.file.path, resumePath);
      
      // Update order data
      orderData.resumeFiles.push({
        path: resumePath,
        version,
        timestamp: new Date().toISOString(),
        filename: `resume_${version}_${timestamp}.pdf`
      });
      
      orderData.status = 'delivered';
      fs.writeFileSync(orderPath, JSON.stringify(orderData, null, 2));
      
      console.log(`📄 Resume saved for order ${orderId}`);
      res.json({ status: 'success', message: 'Resume saved', file: resumePath });
    } else {
      res.status(400).json({ error: 'No file provided' });
    }
    
  } catch (error) {
    console.error('Error saving resume:', error);
    res.status(500).json({ error: 'Failed to save resume' });
  }
});

// Track revision usage
app.post('/api/order/:orderId/revision', async (req, res) => {
  try {
    const { orderId } = req.params;
    const orderPath = path.join(__dirname, 'orders', `${orderId}.json`);
    
    if (!fs.existsSync(orderPath)) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    const orderData = JSON.parse(fs.readFileSync(orderPath, 'utf8'));
    
    // Check if revisions are available and not expired
    const now = new Date();
    const expiresAt = new Date(orderData.revisions.expiresAt);
    
    if (now > expiresAt) {
      return res.status(400).json({ error: 'Revisions have expired (1 year limit)' });
    }
    
    if (orderData.revisions.used >= orderData.revisions.total) {
      return res.status(400).json({ 
        error: `No revisions left. Used ${orderData.revisions.used} of ${orderData.revisions.total}` 
      });
    }
    
    // Increment revision count
    orderData.revisions.used++;
    orderData.revisions.lastUsed = new Date().toISOString();
    
    fs.writeFileSync(orderPath, JSON.stringify(orderData, null, 2));
    
    res.json({
      status: 'success',
      revisions: orderData.revisions,
      message: `Revision ${orderData.revisions.used} of ${orderData.revisions.total} used`
    });
    
  } catch (error) {
    console.error('Error tracking revision:', error);
    res.status(500).json({ error: 'Failed to track revision' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'neuro-pilot-ai-railway',
    timestamp: new Date().toISOString()
  });
});

// 404 handler for undefined routes
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Not Found', 
    message: 'The requested endpoint does not exist',
    availableEndpoints: [
      'GET /',
      'GET /order',
      'GET /order-confirmation',
      'GET /api/health',
      'GET /api/order/:orderId',
      'POST /api/resume/generate',
      'POST /api/payments/resume-checkout',
      'POST /api/order/:orderId/resume',
      'POST /api/order/:orderId/revision'
    ]
  });
});

const PORT = process.env.PORT || 8000;
server.listen(PORT, () => {
  console.log(`🚀 Neuro.Pilot.AI Railway Server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
  console.log(`💳 Payment processing ready`);
  console.log(`📝 Resume orders ready`);
  console.log(`🌐 Homepage: http://localhost:${PORT}/`);
});