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
        <title>Neuro.Pilot.AI - Resume Service</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 40px; text-align: center; }
          h1 { color: #333; }
          .status { color: green; font-weight: bold; }
          .endpoint { background: #f0f0f0; padding: 10px; margin: 10px; border-radius: 5px; }
          .btn { background: #007bff; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 10px; }
          .btn:hover { background: #0056b3; }
        </style>
      </head>
      <body>
        <h1>🚀 Neuro.Pilot.AI Resume Service</h1>
        <p class="status">✅ Service is Online</p>
        <div class="endpoint">
          <a href="/order" class="btn">📝 Order a Resume</a>
          <a href="https://pro.fiverr.com/users/neuropilot" class="btn" target="_blank">💼 View on Fiverr</a>
        </div>
        <p>Professional AI-Powered Resume Generation</p>
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
          body { font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5; margin: 0; }
          .container { max-width: 800px; margin: auto; background: white; padding: 40px; border-radius: 10px; box-shadow: 0 0 20px rgba(0,0,0,0.1); }
          h1 { color: #333; text-align: center; margin-bottom: 10px; }
          .subtitle { text-align: center; color: #666; margin-bottom: 30px; }
          .package-selector { display: flex; gap: 15px; margin: 20px 0; }
          .package { flex: 1; padding: 20px; border: 2px solid #ddd; border-radius: 8px; cursor: pointer; text-align: center; transition: all 0.3s; }
          .package:hover { border-color: #007bff; }
          .package.selected { border-color: #28a745; background: #f0f8ff; }
          .package h3 { margin: 0 0 10px 0; color: #333; }
          .package .price { font-size: 24px; font-weight: bold; color: #28a745; }
          .package ul { text-align: left; padding-left: 20px; margin: 10px 0; font-size: 14px; }
          .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 20px 0; }
          .form-group { margin-bottom: 15px; }
          .form-group.full { grid-column: 1 / -1; }
          label { display: block; margin-bottom: 5px; font-weight: bold; color: #555; }
          .required { color: red; }
          input, select, textarea { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 5px; font-size: 16px; }
          textarea { resize: vertical; min-height: 100px; }
          .file-upload { border: 2px dashed #ddd; padding: 20px; text-align: center; border-radius: 5px; background: #fafafa; }
          button { background: #28a745; color: white; padding: 15px 30px; border: none; border-radius: 5px; font-size: 18px; cursor: pointer; width: 100%; margin-top: 20px; }
          button:hover { background: #218838; }
          .security { text-align: center; color: #666; font-size: 14px; margin-top: 20px; }
          .guarantee { background: #f0f8ff; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center; }
          .error { color: red; font-size: 14px; margin-top: 5px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🚀 Get Your Professional AI Resume</h1>
          <p class="subtitle">Stand out from the competition with an ATS-optimized resume</p>
          
          <div class="guarantee">
            ✅ <strong>100% Satisfaction Guarantee</strong> - Unlimited revisions until you're happy!
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