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
      status: 'received'
    };
    
    // Store order data (in production, this would go to database)
    const orderPath = path.join(__dirname, 'orders', `${orderData.orderId}.json`);
    if (!fs.existsSync(path.dirname(orderPath))) {
      fs.mkdirSync(path.dirname(orderPath), { recursive: true });
    }
    fs.writeFileSync(orderPath, JSON.stringify(orderData, null, 2));
    
    console.log(`✅ Order ${orderData.orderId} stored successfully`);
    
    res.json({
      status: 'success',
      orderId: orderData.orderId,
      message: 'Resume generation request received'
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
          body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            margin: 0;
            padding: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .container {
            text-align: center;
            padding: 40px;
            background: rgba(255,255,255,0.95);
            border-radius: 20px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.2);
            max-width: 600px;
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
              <div class="stat-number">10K+</div>
              <div class="stat-label">Happy Customers</div>
            </div>
            <div class="stat">
              <div class="stat-number">98%</div>
              <div class="stat-label">Success Rate</div>
            </div>
            <div class="stat">
              <div class="stat-number">24h</div>
              <div class="stat-label">Fast Delivery</div>
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
          
          <p style="color: #666; font-size: 14px;">Trusted by professionals at Google, Amazon, Microsoft, and more</p>
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
          * { box-sizing: border-box; }
          body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            padding: 0; 
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
          }
          .header {
            background: rgba(255,255,255,0.1);
            backdrop-filter: blur(10px);
            padding: 20px 0;
            text-align: center;
            border-bottom: 1px solid rgba(255,255,255,0.2);
          }
          .logo {
            display: inline-flex;
            align-items: center;
            gap: 15px;
            text-decoration: none;
          }
          .logo-icon {
            width: 50px;
            height: 50px;
            background: linear-gradient(45deg, #667eea, #764ba2);
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
            color: white;
            font-weight: bold;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
          }
          .logo-text {
            color: white;
            font-size: 24px;
            font-weight: bold;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.2);
          }
          .logo-subtitle {
            color: rgba(255,255,255,0.9);
            font-size: 14px;
            font-weight: normal;
          }
          .container { 
            max-width: 800px; 
            margin: 30px auto; 
            background: white; 
            padding: 40px; 
            border-radius: 20px; 
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
          }
          h1 { 
            color: #333; 
            text-align: center; 
            margin-bottom: 10px;
            font-size: 32px;
          }
          h2 {
            color: #667eea;
            border-bottom: 2px solid #f0f0f0;
            padding-bottom: 10px;
            margin-top: 30px;
          }
          .subtitle { 
            text-align: center; 
            color: #666; 
            margin-bottom: 30px;
            font-size: 18px;
          }
          .package-selector { 
            display: flex; 
            gap: 15px; 
            margin: 20px 0;
            flex-wrap: wrap;
          }
          .package { 
            flex: 1; 
            padding: 25px; 
            border: 3px solid #e0e0e0; 
            border-radius: 15px; 
            cursor: pointer; 
            text-align: center; 
            transition: all 0.3s;
            background: #fafafa;
            position: relative;
            overflow: hidden;
            min-width: 220px;
          }
          .package:hover { 
            border-color: #667eea; 
            transform: translateY(-5px);
            box-shadow: 0 10px 25px rgba(102, 126, 234, 0.2);
          }
          .package.selected { 
            border-color: #667eea; 
            background: linear-gradient(to bottom, #f0f4ff, #ffffff);
            box-shadow: 0 10px 25px rgba(102, 126, 234, 0.2);
          }
          .package.selected::before {
            content: '✓';
            position: absolute;
            top: 10px;
            right: 10px;
            background: #667eea;
            color: white;
            width: 25px;
            height: 25px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 16px;
          }
          .package h3 { 
            margin: 0 0 10px 0; 
            color: #333;
            font-size: 22px;
          }
          .package .price { 
            font-size: 36px; 
            font-weight: bold; 
            color: #667eea;
            margin: 10px 0;
          }
          .package ul { 
            text-align: left; 
            padding-left: 0; 
            margin: 15px 0; 
            font-size: 14px;
            list-style: none;
          }
          .package ul li {
            padding: 5px 0;
            padding-left: 25px;
            position: relative;
          }
          .package ul li::before {
            content: '✓';
            position: absolute;
            left: 0;
            color: #28a745;
            font-weight: bold;
          }
          .form-grid { 
            display: grid; 
            grid-template-columns: 1fr 1fr; 
            gap: 20px; 
            margin: 20px 0;
          }
          @media (max-width: 600px) {
            .form-grid {
              grid-template-columns: 1fr;
            }
            .package-selector {
              flex-direction: column;
            }
          }
          .form-group { margin-bottom: 15px; }
          .form-group.full { grid-column: 1 / -1; }
          label { 
            display: block; 
            margin-bottom: 8px; 
            font-weight: 600; 
            color: #444;
            font-size: 14px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .required { color: #e74c3c; }
          input, select, textarea { 
            width: 100%; 
            padding: 12px 15px; 
            border: 2px solid #e0e0e0; 
            border-radius: 8px; 
            font-size: 16px;
            transition: all 0.3s;
            background: #fafafa;
          }
          input:focus, select:focus, textarea:focus {
            outline: none;
            border-color: #667eea;
            background: white;
            box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
          }
          textarea { resize: vertical; min-height: 100px; }
          .file-upload { 
            border: 3px dashed #667eea; 
            padding: 30px; 
            text-align: center; 
            border-radius: 10px; 
            background: #f8f9ff;
            transition: all 0.3s;
          }
          .file-upload:hover {
            background: #f0f4ff;
            border-color: #764ba2;
          }
          button { 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white; 
            padding: 18px 40px; 
            border: none; 
            border-radius: 50px; 
            font-size: 18px; 
            cursor: pointer; 
            width: 100%; 
            margin-top: 20px;
            font-weight: 600;
            letter-spacing: 1px;
            transition: all 0.3s;
            box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
          }
          button:hover { 
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
          }
          button:disabled {
            background: #ccc;
            cursor: not-allowed;
            transform: none;
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
            display: flex;
            justify-content: space-around;
            margin: 30px 0;
            flex-wrap: wrap;
            gap: 20px;
          }
          .feature {
            text-align: center;
            flex: 1;
            min-width: 150px;
          }
          .feature-icon {
            width: 60px;
            height: 60px;
            background: linear-gradient(135deg, #667eea, #764ba2);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 10px;
            font-size: 24px;
            color: white;
          }
          .feature h4 {
            margin: 10px 0 5px;
            color: #333;
          }
          .feature p {
            color: #666;
            font-size: 14px;
            margin: 0;
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
          <p class="subtitle">Join 10,000+ professionals who landed their dream jobs</p>
          
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
          
          <div class="guarantee">
            🌟 <strong>100% Satisfaction Guarantee</strong> - Unlimited revisions until you land your dream job!
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
                  <li>1 revision</li>
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
                  <li>3 revisions</li>
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
                  <li>Unlimited revisions</li>
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
      'POST /api/resume/generate',
      'POST /api/payments/resume-checkout'
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