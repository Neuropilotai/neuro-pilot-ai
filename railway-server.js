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
              'home-description': 'Service d\\'optimisation de CV professionnel assisté par IA'
            }
          };
          
          let currentLanguage = 'en';
        </script>
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
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
        <meta http-equiv="Pragma" content="no-cache">
        <meta http-equiv="Expires" content="0">
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { 
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 30%, #f093fb 60%, #f5576c 100%);
            background-size: 400% 400%;
            animation: gradientShift 8s ease infinite;
            min-height: 100vh;
            line-height: 1.6;
            position: relative;
            overflow-x: hidden;
          }
          @keyframes gradientShift {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
          }
          body::before {
            content: '';
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: 
              radial-gradient(circle at 20% 80%, rgba(120, 119, 198, 0.3) 0%, transparent 50%),
              radial-gradient(circle at 80% 20%, rgba(255, 119, 198, 0.3) 0%, transparent 50%),
              radial-gradient(circle at 40% 40%, rgba(120, 200, 255, 0.2) 0%, transparent 50%);
            pointer-events: none;
            z-index: -1;
          }
          .header {
            background: linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(248,250,252,0.95) 100%);
            backdrop-filter: blur(25px);
            padding: 30px 0;
            text-align: center;
            border-bottom: 1px solid rgba(255,255,255,0.4);
            box-shadow: 0 12px 40px rgba(0,0,0,0.08);
            position: relative;
          }
          .header::after {
            content: '';
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            height: 3px;
            background: linear-gradient(90deg, #667eea, #764ba2, #f093fb, #f5576c);
          }
          .logo {
            display: inline-flex;
            align-items: center;
            gap: 15px;
            text-decoration: none;
          }
          .logo-icon {
            width: 70px;
            height: 70px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 30%, #f093fb 70%, #f5576c 100%);
            border-radius: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 32px;
            color: white;
            font-weight: 800;
            box-shadow: 0 12px 30px rgba(102,126,234,0.5);
            position: relative;
            overflow: hidden;
            animation: logoGlow 3s ease-in-out infinite alternate;
          }
          @keyframes logoGlow {
            0% { box-shadow: 0 12px 30px rgba(102,126,234,0.5); }
            100% { box-shadow: 0 16px 40px rgba(245,87,108,0.6); }
          }
          .logo-icon::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: linear-gradient(45deg, rgba(255,255,255,0.3), transparent, rgba(255,255,255,0.1));
            animation: shimmer 2s ease-in-out infinite;
          }
          @keyframes shimmer {
            0% { transform: translateX(-100%) rotate(45deg); }
            100% { transform: translateX(200%) rotate(45deg); }
          }
          .logo-text {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            font-size: 32px;
            font-weight: 800;
            letter-spacing: -0.5px;
          }
          .logo-subtitle {
            color: #4a5568;
            font-size: 16px;
            font-weight: 600;
            letter-spacing: 0.5px;
            text-transform: uppercase;
          }
          .container { 
            max-width: 950px; 
            margin: 50px auto; 
            background: linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.98) 100%); 
            padding: 70px 60px; 
            border-radius: 40px; 
            box-shadow: 
              0 40px 80px rgba(0,0,0,0.08),
              0 20px 40px rgba(102,126,234,0.1),
              inset 0 1px 0 rgba(255,255,255,0.6);
            backdrop-filter: blur(25px);
            border: 2px solid rgba(255,255,255,0.3);
            position: relative;
            overflow: hidden;
          }
          .container::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 4px;
            background: linear-gradient(90deg, #667eea, #764ba2, #f093fb, #f5576c);
            border-radius: 40px 40px 0 0;
          }
          h1 { 
            text-align: center; 
            margin-bottom: 20px;
            font-size: 56px;
            font-weight: 900;
            letter-spacing: -1.5px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 30%, #f093fb 70%, #f5576c 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            background-size: 200% 200%;
            animation: textGradient 4s ease infinite;
            line-height: 1.1;
            text-shadow: 0 4px 20px rgba(102,126,234,0.3);
          }
          @keyframes textGradient {
            0%, 100% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
          }
          h2 {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            border-bottom: 4px solid transparent;
            border-image: linear-gradient(90deg, #667eea, #764ba2, #f093fb, #f5576c) 1;
            padding-bottom: 20px;
            margin-top: 56px;
            font-size: 32px;
            font-weight: 800;
            letter-spacing: -0.5px;
            position: relative;
          }
          h2::after {
            content: '';
            position: absolute;
            bottom: -4px;
            left: 0;
            width: 60px;
            height: 4px;
            background: linear-gradient(90deg, #667eea, #f093fb);
            border-radius: 2px;
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
          <div id="languageSelectorContainer" style="position: absolute; top: 20px; right: 30px;">
            <!-- Language selector will be added by JavaScript -->
          </div>
          <a href="/" class="logo">
            <div class="logo-icon">N.P</div>
            <div>
              <div class="logo-text">NEURO.PILOT.AI</div>
              <div class="logo-subtitle" data-translate="header-subtitle">Professional Resume Service</div>
            </div>
          </a>
        </div>
        
        <div class="container">
          <h1 data-translate="main-title">🚀 Get Your Dream Job with AI-Powered Resume</h1>
          <p class="subtitle" data-translate="main-subtitle">Professional AI-powered resume optimization service</p>
          
          <div class="features">
            <div class="feature">
              <div class="feature-icon">🤖</div>
              <h4 data-translate="feature-ai-title">AI-Powered</h4>
              <p data-translate="feature-ai-desc">Advanced AI optimization</p>
            </div>
            <div class="feature">
              <div class="feature-icon">⚡</div>
              <h4 data-translate="feature-fast-title">Fast Delivery</h4>
              <p data-translate="feature-fast-desc">Get your resume in hours</p>
            </div>
            <div class="feature">
              <div class="feature-icon">✅</div>
              <h4 data-translate="feature-ats-title">ATS-Friendly</h4>
              <p data-translate="feature-ats-desc">Pass applicant tracking systems</p>
            </div>
            <div class="feature">
              <div class="feature-icon">💼</div>
              <h4 data-translate="feature-pro-title">Professional</h4>
              <p data-translate="feature-pro-desc">Industry-specific keywords</p>
            </div>
          </div>
          
          
          <form id="orderForm">
            <!-- Package Selection -->
            <h2 data-translate="package-title">Select Your Package</h2>
            <div class="package-selector">
              <div class="package" data-package="basic" data-price="25">
                <h3 data-translate="package-basic-title">Basic</h3>
                <div class="price">$25</div>
                <ul>
                  <li data-translate="package-basic-feat1">Professional formatting</li>
                  <li data-translate="package-basic-feat2">ATS optimization</li>
                  <li data-translate="package-basic-feat3">1 revision (within 1 year)</li>
                  <li data-translate="package-basic-feat4">24-hour delivery</li>
                </ul>
              </div>
              <div class="package selected" data-package="professional" data-price="45">
                <h3 data-translate="package-pro-title">Professional</h3>
                <div class="price">$45</div>
                <ul>
                  <li data-translate="package-pro-feat1">Everything in Basic</li>
                  <li data-translate="package-pro-feat2">Cover letter included</li>
                  <li data-translate="package-pro-feat3">LinkedIn optimization tips</li>
                  <li data-translate="package-pro-feat4">3 revisions (within 1 year)</li>
                  <li data-translate="package-pro-feat5">12-hour delivery</li>
                </ul>
              </div>
              <div class="package" data-package="executive" data-price="85">
                <h3 data-translate="package-exec-title">Executive</h3>
                <div class="price">$85</div>
                <ul>
                  <li data-translate="package-exec-feat1">Everything in Professional</li>
                  <li data-translate="package-exec-feat2">Executive summary</li>
                  <li data-translate="package-exec-feat3">Industry-specific keywords</li>
                  <li data-translate="package-exec-feat4">5 revisions (within 1 year)</li>
                  <li data-translate="package-exec-feat5">6-hour delivery</li>
                </ul>
              </div>
            </div>
            
            <input type="hidden" name="packageType" value="professional">
            <input type="hidden" name="price" value="45">
            
            <!-- Contact Information -->
            <h2 data-translate="contact-title">Contact Information</h2>
            <div class="form-grid">
              <div class="form-group">
                <label data-translate="form-firstname">First Name <span class="required">*</span></label>
                <input type="text" name="firstName" required>
              </div>
              <div class="form-group">
                <label data-translate="form-lastname">Last Name <span class="required">*</span></label>
                <input type="text" name="lastName" required>
              </div>
              <div class="form-group">
                <label data-translate="form-email">Email <span class="required">*</span></label>
                <input type="email" name="customerEmail" required>
              </div>
              <div class="form-group">
                <label data-translate="form-phone">Phone</label>
                <input type="tel" name="phone" placeholder="(555) 123-4567">
              </div>
            </div>
            
            <!-- Job Information -->
            <h2 data-translate="job-title">Job Details</h2>
            <div class="form-grid">
              <div class="form-group full">
                <label data-translate="form-jobtitle">Job Title You're Applying For <span class="required">*</span></label>
                <input type="text" name="targetJobTitle" required data-translate-placeholder="placeholder-jobtitle">
              </div>
              <div class="form-group full">
                <label data-translate="form-jobdesc">Job Description <span class="required">*</span></label>
                <textarea name="jobDescription" required data-translate-placeholder="placeholder-jobdesc"></textarea>
              </div>
              <div class="form-group">
                <label data-translate="form-company">Company Name</label>
                <input type="text" name="companyName" data-translate-placeholder="placeholder-company">
              </div>
              <div class="form-group">
                <label data-translate="form-industry">Industry</label>
                <select name="industry">
                  <option value="" data-translate="select-industry">Select Industry</option>
                  <option value="technology" data-translate="industry-tech">Technology</option>
                  <option value="healthcare" data-translate="industry-health">Healthcare</option>
                  <option value="finance" data-translate="industry-finance">Finance</option>
                  <option value="retail" data-translate="industry-retail">Retail</option>
                  <option value="education" data-translate="industry-education">Education</option>
                  <option value="other" data-translate="industry-other">Other</option>
                </select>
              </div>
            </div>
            
            <!-- Experience Information -->
            <h2 data-translate="background-title">Your Background</h2>
            <div class="form-grid">
              <div class="form-group full">
                <label data-translate="form-experience">Work Experience <span class="required">*</span></label>
                <textarea name="experience" required data-translate-placeholder="placeholder-experience"></textarea>
              </div>
              <div class="form-group full">
                <label data-translate="form-skills">Key Skills <span class="required">*</span></label>
                <input type="text" name="skills" required data-translate-placeholder="placeholder-skills">
              </div>
              <div class="form-group">
                <label data-translate="form-education">Education Level</label>
                <select name="educationLevel">
                  <option value="" data-translate="select-education">Select Education</option>
                  <option value="highschool" data-translate="edu-highschool">High School</option>
                  <option value="bachelors" data-translate="edu-bachelors">Bachelor's Degree</option>
                  <option value="masters" data-translate="edu-masters">Master's Degree</option>
                  <option value="phd" data-translate="edu-phd">PhD</option>
                  <option value="other" data-translate="edu-other">Other</option>
                </select>
              </div>
              <div class="form-group">
                <label data-translate="form-years">Years of Experience</label>
                <select name="yearsExperience">
                  <option value="" data-translate="select-years">Select Years</option>
                  <option value="0-1" data-translate="years-0-1">0-1 years</option>
                  <option value="2-5" data-translate="years-2-5">2-5 years</option>
                  <option value="6-10" data-translate="years-6-10">6-10 years</option>
                  <option value="11-15" data-translate="years-11-15">11-15 years</option>
                  <option value="16+" data-translate="years-16plus">16+ years</option>
                </select>
              </div>
            </div>
            
            <!-- File Upload -->
            <h2 data-translate="upload-title">Current Resume (Optional)</h2>
            <div class="file-upload">
              <p data-translate="upload-desc">📎 Upload your current resume for reference</p>
              <input type="file" name="currentResume" accept=".pdf,.doc,.docx">
              <p style="font-size: 12px; color: #666;" data-translate="upload-formats">Accepted formats: PDF, DOC, DOCX (Max 10MB)</p>
            </div>
            
            <!-- Promo Code Section -->
            <div class="form-group full">
              <label data-translate="form-promo">Promo Code (Optional)</label>
              <div style="display: flex; gap: 12px;">
                <input type="text" id="promoCode" name="promoCode" data-translate-placeholder="placeholder-promo" style="flex: 1;">
                <button type="button" id="applyPromo" style="width: auto; padding: 16px 24px; margin: 0; background: #48bb78; font-size: 14px;" data-translate="btn-apply">Apply</button>
              </div>
              <div id="promoMessage" style="margin-top: 8px; font-size: 14px;"></div>
            </div>
            
            <div id="priceDisplay" style="background: linear-gradient(135deg, #f0f8ff 0%, #e6f3ff 100%); padding: 20px; border-radius: 16px; margin: 20px 0; text-align: center; border: 2px solid rgba(102,126,234,0.1);">
              <div style="font-size: 16px; color: #4a5568; margin-bottom: 8px;" data-translate="price-total">Total Price:</div>
              <div id="finalPrice" style="font-size: 32px; font-weight: 800; background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">$45</div>
              <div id="originalPrice" style="display: none; font-size: 16px; color: #a0aec0; text-decoration: line-through; margin-top: 4px;"></div>
              <div id="discount" style="display: none; font-size: 14px; color: #48bb78; font-weight: 600; margin-top: 4px;"></div>
            </div>

            <button type="submit" data-translate="btn-payment">💳 Proceed to Secure Payment</button>
            
            <div style="background: #f0f8ff; padding: 15px; border-radius: 8px; margin: 20px 0; font-size: 14px; color: #555;">
              <strong data-translate="revision-policy">📋 Revision Policy:</strong><br>
              <span data-translate="revision-limits">• Basic: 1 revision | Professional: 3 revisions | Executive: 5 revisions</span><br>
              <span data-translate="revision-time">• All revisions must be used within 1 year of purchase</span><br>
              <span data-translate="revision-saved">• Your resume will be saved in our system for easy access</span>
            </div>
            
            <p class="security" data-translate="security-notice">🔒 Your information is secure and encrypted</p>
          </form>
        </div>
        
        <script>
          
          let currentPrice = 45;
          let appliedDiscount = 0;
          let promoCodeApplied = false;
          
          // Promo codes configuration
          const promoCodes = {
            'FAMILY2025': { discount: 100, type: 'percentage', description: 'Family Test - 100% OFF' },
            'TEST50': { discount: 50, type: 'percentage', description: '50% OFF Test Code' },
            'FIRST10': { discount: 10, type: 'fixed', description: '$10 OFF Your First Order' }
          };
          
          // Update price display
          function updatePriceDisplay() {
            const finalPrice = Math.max(0, currentPrice - appliedDiscount);
            document.getElementById('finalPrice').textContent = '$' + finalPrice;
            
            if (appliedDiscount > 0) {
              document.getElementById('originalPrice').style.display = 'block';
              document.getElementById('originalPrice').textContent = '$' + currentPrice;
              document.getElementById('discount').style.display = 'block';
              document.getElementById('discount').textContent = appliedDiscount >= currentPrice ? 'FREE!' : '-$' + appliedDiscount;
            } else {
              document.getElementById('originalPrice').style.display = 'none';
              document.getElementById('discount').style.display = 'none';
            }
            
            // Update hidden price field
            document.querySelector('input[name="price"]').value = finalPrice;
          }
          
          // Package selection
          document.querySelectorAll('.package').forEach(pkg => {
            pkg.addEventListener('click', function() {
              document.querySelectorAll('.package').forEach(p => p.classList.remove('selected'));
              this.classList.add('selected');
              document.querySelector('input[name="packageType"]').value = this.dataset.package;
              
              // Update current price
              currentPrice = parseInt(this.dataset.price);
              
              // Recalculate discount if promo code is applied
              if (promoCodeApplied) {
                const promoCode = document.getElementById('promoCode').value.toUpperCase();
                const promo = promoCodes[promoCode];
                if (promo) {
                  appliedDiscount = promo.type === 'percentage' ? 
                    Math.round(currentPrice * promo.discount / 100) : 
                    Math.min(promo.discount, currentPrice);
                }
              }
              
              updatePriceDisplay();
            });
          });
          
          // Promo code application
          document.getElementById('applyPromo').addEventListener('click', function() {
            const promoCode = document.getElementById('promoCode').value.toUpperCase();
            const messageEl = document.getElementById('promoMessage');
            
            if (!promoCode) {
              messageEl.innerHTML = '<span style="color: #e53e3e;">Please enter a promo code</span>';
              return;
            }
            
            const promo = promoCodes[promoCode];
            if (promo) {
              appliedDiscount = promo.type === 'percentage' ? 
                Math.round(currentPrice * promo.discount / 100) : 
                Math.min(promo.discount, currentPrice);
              
              promoCodeApplied = true;
              messageEl.innerHTML = '<span style="color: #48bb78;">✅ ' + promo.description + ' applied!</span>';
              updatePriceDisplay();
              
              // Disable the apply button
              this.disabled = true;
              this.textContent = 'Applied';
              this.style.background = '#a0aec0';
            } else {
              messageEl.innerHTML = '<span style="color: #e53e3e;">❌ Invalid promo code</span>';
              appliedDiscount = 0;
              promoCodeApplied = false;
              updatePriceDisplay();
            }
          });
          
          // Initialize price display
          updatePriceDisplay();
          
          // Form submission
          document.getElementById('orderForm').onsubmit = async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const data = Object.fromEntries(formData);
            
            // Combine names
            data.customerName = data.firstName + ' ' + data.lastName;
            
            // Add promo code info
            if (promoCodeApplied) {
              data.promoCode = document.getElementById('promoCode').value.toUpperCase();
              data.originalPrice = currentPrice;
              data.discountAmount = appliedDiscount;
            }
            
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
                const finalPrice = parseInt(data.price);
                
                // If free order (promo code), skip payment
                if (finalPrice === 0) {
                  alert('🎉 FREE Order Confirmed!\\n\\nOrder ID: ' + orderResult.orderId + '\\n\\nWe will process your resume and send it to your email within the promised timeframe.');
                  window.location.href = '/order-confirmation?session=' + orderResult.orderId + '&package=' + data.packageType + '&price=0&promo=true';
                  return;
                }
                
                // Otherwise proceed to payment
                const paymentResponse = await fetch('/api/payments/resume-checkout', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    customerEmail: data.customerEmail,
                    packageType: data.packageType,
                    price: finalPrice,
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
          
          // Bilingual Translation System - English/French for North America
          const translations = {
            'en': {
              'header-subtitle': 'Professional Resume Service',
              'main-title': '🚀 Get Your Dream Job with AI-Powered Resume',
              'main-subtitle': 'Professional AI-powered resume optimization service',
              'feature-ai-title': 'AI-Powered',
              'feature-ai-desc': 'Advanced AI optimization',
              'feature-fast-title': 'Fast Delivery',
              'feature-fast-desc': 'Get your resume in hours',
              'feature-ats-title': 'ATS-Friendly',
              'feature-ats-desc': 'Pass applicant tracking systems',
              'feature-pro-title': 'Professional',
              'feature-pro-desc': 'Industry-specific keywords',
              'package-title': 'Select Your Package',
              'package-basic-title': 'Basic',
              'package-basic-feat1': 'Professional formatting',
              'package-basic-feat2': 'ATS optimization',
              'package-basic-feat3': '1 revision (within 1 year)',
              'package-basic-feat4': '24-hour delivery',
              'package-pro-title': 'Professional',
              'package-pro-feat1': 'Everything in Basic',
              'package-pro-feat2': 'Cover letter included',
              'package-pro-feat3': 'LinkedIn optimization tips',
              'package-pro-feat4': '3 revisions (within 1 year)',
              'package-pro-feat5': '12-hour delivery',
              'package-exec-title': 'Executive',
              'package-exec-feat1': 'Everything in Professional',
              'package-exec-feat2': 'Executive summary',
              'package-exec-feat3': 'Industry-specific keywords',
              'package-exec-feat4': '5 revisions (within 1 year)',
              'package-exec-feat5': '6-hour delivery',
              'contact-title': 'Contact Information',
              'form-firstname': 'First Name',
              'form-lastname': 'Last Name',
              'form-email': 'Email',
              'form-phone': 'Phone',
              'job-title': 'Job Details',
              'form-jobtitle': 'Job Title You\'re Applying For',
              'form-jobdesc': 'Job Description',
              'form-company': 'Company Name',
              'form-industry': 'Industry',
              'select-industry': 'Select Industry',
              'industry-tech': 'Technology',
              'industry-health': 'Healthcare',
              'industry-finance': 'Finance',
              'industry-retail': 'Retail',
              'industry-education': 'Education',
              'industry-other': 'Other',
              'background-title': 'Your Background',
              'form-experience': 'Work Experience',
              'form-skills': 'Key Skills',
              'form-education': 'Education Level',
              'select-education': 'Select Education',
              'edu-highschool': 'High School',
              'edu-bachelors': 'Bachelor\'s Degree',
              'edu-masters': 'Master\'s Degree',
              'edu-phd': 'PhD',
              'edu-other': 'Other',
              'form-years': 'Years of Experience',
              'select-years': 'Select Years',
              'years-0-1': '0-1 years',
              'years-2-5': '2-5 years',
              'years-6-10': '6-10 years',
              'years-11-15': '11-15 years',
              'years-16plus': '16+ years',
              'upload-title': 'Current Resume (Optional)',
              'upload-desc': '📎 Upload your current resume for reference',
              'upload-formats': 'Accepted formats: PDF, DOC, DOCX (Max 10MB)',
              'form-promo': 'Promo Code (Optional)',
              'btn-apply': 'Apply',
              'price-total': 'Total Price:',
              'btn-payment': '💳 Proceed to Secure Payment',
              'revision-policy': '📋 Revision Policy:',
              'revision-limits': '• Basic: 1 revision | Professional: 3 revisions | Executive: 5 revisions',
              'revision-time': '• All revisions must be used within 1 year of purchase',
              'revision-saved': '• Your resume will be saved in our system for easy access',
              'security-notice': '🔒 Your information is secure and encrypted',
              'placeholder-jobtitle': 'e.g., Senior Software Engineer',
              'placeholder-jobdesc': 'Paste the job description here...',
              'placeholder-company': 'e.g., Google',
              'placeholder-experience': 'Describe your work experience, including job titles, companies, and key achievements...',
              'placeholder-skills': 'e.g., Project Management, Python, Sales, Customer Service',
              'placeholder-promo': 'Enter promo code'
            },
            'fr': {
              'header-subtitle': 'Service de CV Professionnel',
              'main-title': '🚀 Obtenez votre emploi de rêve avec un CV assisté par IA',
              'main-subtitle': 'Service d\\'optimisation de CV professionnel assisté par IA',
              'feature-ai-title': 'Assisté par IA',
              'feature-ai-desc': 'Optimisation IA avancée',
              'feature-fast-title': 'Livraison Rapide',
              'feature-fast-desc': 'Recevez votre CV en quelques heures',
              'feature-ats-title': 'Compatible ATS',
              'feature-ats-desc': 'Passe les systèmes de suivi des candidats',
              'feature-pro-title': 'Professionnel',
              'feature-pro-desc': 'Mots-clés spécifiques à l\'industrie',
              'package-title': 'Sélectionnez votre forfait',
              'package-basic-title': 'Basique',
              'package-basic-feat1': 'Formatage professionnel',
              'package-basic-feat2': 'Optimisation ATS',
              'package-basic-feat3': '1 révision (dans l\'année)',
              'package-basic-feat4': 'Livraison en 24h',
              'package-pro-title': 'Professionnel',
              'package-pro-feat1': 'Tout ce qui est dans Basique',
              'package-pro-feat2': 'Lettre de motivation incluse',
              'package-pro-feat3': 'Conseils d\\'optimisation LinkedIn',
              'package-pro-feat4': '3 révisions (dans l\'année)',
              'package-pro-feat5': 'Livraison en 12h',
              'package-exec-title': 'Exécutif',
              'package-exec-feat1': 'Tout ce qui est dans Professionnel',
              'package-exec-feat2': 'Résumé exécutif',
              'package-exec-feat3': 'Mots-clés spécifiques à l\'industrie',
              'package-exec-feat4': '5 révisions (dans l\'année)',
              'package-exec-feat5': 'Livraison en 6h',
              'contact-title': 'Informations de Contact',
              'form-firstname': 'Prénom',
              'form-lastname': 'Nom de famille',
              'form-email': 'Courriel',
              'form-phone': 'Téléphone',
              'job-title': 'Détails de l\'emploi',
              'form-jobtitle': 'Titre du poste pour lequel vous postulez',
              'form-jobdesc': 'Description de l\'emploi',
              'form-company': 'Nom de l\'entreprise',
              'form-industry': 'Industrie',
              'select-industry': 'Sélectionner une industrie',
              'industry-tech': 'Technologie',
              'industry-health': 'Santé',
              'industry-finance': 'Finance',
              'industry-retail': 'Vente au détail',
              'industry-education': 'Éducation',
              'industry-other': 'Autre',
              'background-title': 'Votre parcours',
              'form-experience': 'Expérience de travail',
              'form-skills': 'Compétences clés',
              'form-education': 'Niveau d\\'éducation',
              'select-education': 'Sélectionner l\'éducation',
              'edu-highschool': 'École secondaire',
              'edu-bachelors': 'Baccalauréat',
              'edu-masters': 'Maîtrise',
              'edu-phd': 'Doctorat',
              'edu-other': 'Autre',
              'form-years': 'Années d\\'expérience',
              'select-years': 'Sélectionner les années',
              'years-0-1': '0-1 années',
              'years-2-5': '2-5 années',
              'years-6-10': '6-10 années',
              'years-11-15': '11-15 années',
              'years-16plus': '16+ années',
              'upload-title': 'CV actuel (Optionnel)',
              'upload-desc': '📎 Téléchargez votre CV actuel pour référence',
              'upload-formats': 'Formats acceptés: PDF, DOC, DOCX (Max 10MB)',
              'form-promo': 'Code promo (Optionnel)',
              'btn-apply': 'Appliquer',
              'price-total': 'Prix total:',
              'btn-payment': '💳 Procéder au paiement sécurisé',
              'revision-policy': '📋 Politique de révision:',
              'revision-limits': '• Basique: 1 révision | Professionnel: 3 révisions | Exécutif: 5 révisions',
              'revision-time': '• Toutes les révisions doivent être utilisées dans l\\'année d\\'achat',
              'revision-saved': '• Votre CV sera sauvegardé dans notre système pour un accès facile',
              'security-notice': '🔒 Vos informations sont sécurisées et cryptées',
              'placeholder-jobtitle': 'ex., Ingénieur logiciel senior',
              'placeholder-jobdesc': 'Collez la description de l\'emploi ici...',
              'placeholder-company': 'ex., Google',
              'placeholder-experience': 'Décrivez votre expérience de travail, y compris les titres de poste, les entreprises et les réalisations clés...',
              'placeholder-skills': 'ex., Gestion de projet, Python, Ventes, Service à la clientèle',
              'placeholder-promo': 'Entrez le code promo'
            }
          };
          
          // Global language switching function - replace the placeholder
          window.switchLanguage = function(lang) {
            try {
              console.log('Switching language to:', lang);
              
              const langData = translations[lang];
              if (!langData) {
                console.error('No translation data for language:', lang);
                return;
              }
              
              // Translate all elements with data-translate attribute
              document.querySelectorAll('[data-translate]').forEach(element => {
                const key = element.getAttribute('data-translate');
                if (langData[key]) {
                  element.textContent = langData[key];
                }
              });
              
              // Translate placeholders
              document.querySelectorAll('[data-translate-placeholder]').forEach(element => {
                const key = element.getAttribute('data-translate-placeholder');
                if (langData[key]) {
                  element.placeholder = langData[key];
                }
              });
              
              // Update dropdown options if they exist
              const selects = document.querySelectorAll('select');
              selects.forEach(select => {
                if (select.id !== 'languageSelect') {
                  select.querySelectorAll('option').forEach(option => {
                    const key = option.getAttribute('data-translate');
                    if (key && langData[key]) {
                      option.textContent = langData[key];
                    }
                  });
                }
              });
              
              alert(lang === 'fr' ? 'Page traduite en français! 🇨🇦' : 'Page switched to English! 🇺🇸');
              console.log('Language switch completed');
            } catch(error) {
              alert('Error in switchLanguage: ' + error.message);
              console.log('Error:', error);
            }
          }
          
          // Create and insert language selector
          const languageSelectorHTML = '<select id="languageSelect" onchange="switchLanguage(this.value)" style="background: rgba(255,255,255,0.9); border: 2px solid rgba(102,126,234,0.2); border-radius: 20px; padding: 8px 16px; font-weight: 600; cursor: pointer;"><option value="en">🇺🇸 English</option><option value="fr">🇨🇦 Français</option></select>';
          document.getElementById('languageSelectorContainer').innerHTML = languageSelectorHTML;
          console.log('Language selector created and switchLanguage function ready');
          console.log('Translation system initialized. Version: 2.0');
        </script>
      </body>
    </html>
  `);
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
            ${isPromo ? 'Your FREE test order has been confirmed!' : 'Thank you for your order. We\'ve received your payment and will start working on your resume immediately.'}
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