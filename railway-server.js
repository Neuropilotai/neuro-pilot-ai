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
    
    // Validate promo code if provided
    let finalPrice = parseInt(req.body.price) || 45;
    let promoInfo = null;
    
    if (req.body.promoCode) {
      const validPromoCodes = {
        'FAMILY2025': { discount: 100, type: 'percentage', description: 'Family Test - 100% OFF' },
        'TEST50': { discount: 50, type: 'percentage', description: '50% OFF Test Code' },
        'FIRST10': { discount: 10, type: 'fixed', description: '$10 OFF Your First Order' }
      };
      
      const promo = validPromoCodes[req.body.promoCode.toUpperCase()];
      if (promo) {
        promoInfo = {
          code: req.body.promoCode.toUpperCase(),
          ...promo,
          originalPrice: req.body.originalPrice || finalPrice,
          discountAmount: req.body.discountAmount || 0
        };
        finalPrice = Math.max(0, finalPrice);
        console.log(`🎟️ Promo code applied: ${promoInfo.code} - ${promoInfo.description}`);
      }
    }
    
    const orderData = {
      ...req.body,
      orderId: `order_${Date.now()}`,
      timestamp: new Date().toISOString(),
      status: 'received',
      packageType: req.body.packageType || 'professional',
      finalPrice: finalPrice,
      promoCode: promoInfo,
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
        <div style="position: absolute; top: 20px; right: 30px; z-index: 1000;">
          <select id="languageSelect" style="background: rgba(255,255,255,0.9); border: 2px solid rgba(102,126,234,0.2); border-radius: 20px; padding: 8px 16px; font-weight: 600; cursor: pointer;">
            <option value="en">🇺🇸 English</option>
            <option value="fr">🇨🇦 Français</option>
          </select>
        </div>
        <div class="container">
          <div class="logo">
            <div class="logo-icon">N.P</div>
            <div class="logo-text">
              <h2 class="logo-title">NEURO.PILOT.AI</h2>
              <p class="logo-subtitle" data-translate="home-subtitle">Professional Resume Service</p>
            </div>
          </div>
          
          <h1 data-translate="home-title">🚀 AI-Powered Resume Generation</h1>
          <p class="status" data-translate="home-status">✅ Service is Online</p>
          
          <div class="stats">
            <div class="stat">
              <div class="stat-number">AI</div>
              <div class="stat-label" data-translate="stat-powered">Powered</div>
            </div>
            <div class="stat">
              <div class="stat-number">ATS</div>
              <div class="stat-label" data-translate="stat-optimized">Optimized</div>
            </div>
            <div class="stat">
              <div class="stat-number">24h</div>
              <div class="stat-label" data-translate="stat-delivery">Delivery</div>
            </div>
          </div>
          
          <div class="features">
            <div class="feature">
              <div class="feature-icon">🤖</div>
              <div class="feature-text" data-translate="feat-ai">AI-Optimized</div>
            </div>
            <div class="feature">
              <div class="feature-icon">✅</div>
              <div class="feature-text" data-translate="feat-ats">ATS-Friendly</div>
            </div>
            <div class="feature">
              <div class="feature-icon">💼</div>
              <div class="feature-text" data-translate="feat-professional">Professional</div>
            </div>
            <div class="feature">
              <div class="feature-icon">⚡</div>
              <div class="feature-text" data-translate="feat-fast">Fast Delivery</div>
            </div>
          </div>
          
          <div class="buttons">
            <a href="/order" class="btn" data-translate="btn-order">📝 Order Your Resume</a>
            <a href="https://pro.fiverr.com/users/neuropilot" class="btn secondary" target="_blank" data-translate="btn-fiverr">💼 View on Fiverr</a>
          </div>
          
          <p style="color: #666; font-size: 14px;" data-translate="home-description">Professional AI resume optimization service</p>
        </div>
        
        <script>
          // Bilingual Translation System - English/French for North America (Homepage)
          const translations = {
            'en': {
              'home-subtitle': 'Professional Resume Service',
              'home-title': '🚀 AI-Powered Resume Generation',
              'home-status': '✅ Service is Online',
              'stat-powered': 'Powered',
              'stat-optimized': 'Optimized',
              'stat-delivery': 'Delivery',
              'feat-ai': 'AI-Optimized',
              'feat-ats': 'ATS-Friendly',
              'feat-professional': 'Professional',
              'feat-fast': 'Fast Delivery',
              'btn-order': '📝 Order Your Resume',
              'btn-fiverr': '💼 View on Fiverr',
              'home-description': 'Professional AI resume optimization service'
            },
            'fr': {
              'home-subtitle': 'Service de CV Professionnel',
              'home-title': '🚀 Génération de CV assistée par IA',
              'home-status': '✅ Service en ligne',
              'stat-powered': 'Assisté',
              'stat-optimized': 'Optimisé',
              'stat-delivery': 'Livraison',
              'feat-ai': 'Optimisé IA',
              'feat-ats': 'Compatible ATS',
              'feat-professional': 'Professionnel',
              'feat-fast': 'Livraison rapide',
              'btn-order': '📝 Commandez votre CV',
              'btn-fiverr': '💼 Voir sur Fiverr',
              'home-description': 'Service d'optimisation de CV professionnel assisté par IA'
            }
          };
          
          let currentLanguage = 'en';
        </script>
      </body>
    </html>
  `);
});

// Order page with full form and payment
// Test route for translation
app.get('/test-translation', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Translation Test</title>
      </head>
      <body>
        <h1>Translation Test Page</h1>
        <p>If you can see this page and click the button below, basic JavaScript is working.</p>
        <button onclick="alert('JavaScript works!')">Test JavaScript</button>
        <br><br>
        <button onclick="testTranslation()">Test Translation System</button>
        <script>
          function testTranslation() {
            if (typeof switchLanguage === 'function') {
              alert('switchLanguage function exists!');
            } else {
              alert('switchLanguage function NOT found');
            }
            if (typeof translations !== 'undefined') {
              alert('translations object exists with ' + Object.keys(translations).length + ' languages');
            } else {
              alert('translations object NOT found');
            }
          }
        </script>
      </body>
    </html>
  `);
});

app.get('/order', (req, res) => {
  res.set({
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  res.sendFile(path.join(__dirname, 'public', 'order.html'));
});

// Order confirmation page
app.get('/order-confirmation', (req, res) => {
  const { session, package: packageType, price, promo } = req.query;
  const isPromo = promo === 'true';
  const finalPrice = price || '45';
  
  res.send(`
    <html>
      <head>
        <title>Order Confirmed - Neuro.Pilot.AI</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
          body { 
            font-family: 'Inter', sans-serif; 
            padding: 0; 
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .container { 
            max-width: 600px; 
            margin: 20px; 
            background: rgba(255,255,255,0.98); 
            padding: 50px 40px; 
            border-radius: 24px; 
            box-shadow: 0 20px 40px rgba(0,0,0,0.15); 
            text-align: center;
            backdrop-filter: blur(20px);
            border: 1px solid rgba(255,255,255,0.2);
          }
          h1 { 
            color: #1a202c;
            font-size: 36px;
            font-weight: 800;
            margin-bottom: 16px;
          }
          .order-details { 
            background: linear-gradient(135deg, #f0f8ff 0%, #e6f3ff 100%); 
            padding: 30px; 
            border-radius: 16px; 
            margin: 30px 0;
            border: 2px solid rgba(102,126,234,0.1);
          }
          .next-steps { text-align: left; margin: 30px 0; }
          .next-steps li { margin: 12px 0; font-weight: 500; }
          .promo-badge {
            background: linear-gradient(135deg, #48bb78, #38a169);
            color: white;
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 14px;
            font-weight: 600;
            display: inline-block;
            margin: 10px 0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🎉 Order Confirmed!</h1>
          ${isPromo ? '<div class="promo-badge">🎟️ PROMO CODE APPLIED</div>' : ''}
          <p style="font-size: 18px; color: #4a5568; margin: 20px 0;">
            ${isPromo ? 'Your FREE test order has been confirmed!' : 'Thank you for your order. We have received your payment and will start working on your resume immediately.'}
          </p>
          
          <div class="order-details">
            <h3 style="color: #2d3748; margin-bottom: 20px;">Order Details</h3>
            <p><strong>Package:</strong> ${packageType ? packageType.charAt(0).toUpperCase() + packageType.slice(1) : 'Professional'}</p>
            <p><strong>Order ID:</strong> ${session || 'Processing'}</p>
            <p><strong>Amount Paid:</strong> ${finalPrice === '0' ? 'FREE' : '$' + finalPrice}</p>
            <p><strong>Delivery Time:</strong> Within ${packageType === 'executive' ? '6' : packageType === 'professional' ? '12' : '24'} hours</p>
          </div>
          
          <div class="next-steps">
            <h3 style="color: #2d3748;">What Happens Next?</h3>
            <ol style="color: #4a5568;">
              <li>Our AI will analyze your information and the job description</li>
              <li>A professional resume will be created and ATS-optimized</li>
              <li>You'll receive your resume via email within the promised timeframe</li>
              <li>If you need any revisions, just reply to the email</li>
              ${isPromo ? '<li><strong>As a test order, please provide honest feedback to help us improve!</strong></li>' : ''}
            </ol>
          </div>
          
          <p style="color: #4a5568;">Check your email for order confirmation and updates.</p>
          <p style="color: #4a5568;">Questions? Email us at support@neuro-pilot.ai</p>
          
          ${isPromo ? '<p style="color: #48bb78; font-weight: 600; margin-top: 30px;">🌟 Thank you for testing our service!</p>' : ''}
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
  console.log(`🚀 Neuro.Pilot.AI Railway Server (Bilingual 🇺🇸🇨🇦) running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
  console.log(`💳 Payment processing ready`);
  console.log(`📝 Resume orders ready`);
  console.log(`🌐 Homepage: http://localhost:${PORT}/`);
});