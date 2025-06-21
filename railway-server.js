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

// Order page
app.get('/order', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Order Resume - Neuro.Pilot.AI</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 40px; max-width: 600px; margin: auto; }
          h1 { color: #333; text-align: center; }
          form { background: #f9f9f9; padding: 30px; border-radius: 10px; }
          label { display: block; margin-top: 15px; font-weight: bold; }
          input, select, textarea { width: 100%; padding: 10px; margin-top: 5px; border: 1px solid #ddd; border-radius: 5px; }
          button { background: #28a745; color: white; padding: 15px; width: 100%; border: none; border-radius: 5px; font-size: 18px; cursor: pointer; margin-top: 20px; }
          button:hover { background: #218838; }
          .price { color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <h1>📝 Order Your AI Resume</h1>
        <form id="orderForm">
          <label>Your Name</label>
          <input type="text" name="name" required>
          
          <label>Email</label>
          <input type="email" name="email" required>
          
          <label>Package</label>
          <select name="packageType">
            <option value="basic">Basic - $25</option>
            <option value="professional" selected>Professional - $45</option>
            <option value="executive">Executive - $85</option>
          </select>
          
          <label>Job Title You're Applying For</label>
          <input type="text" name="jobTitle" required placeholder="e.g. Customer Service Representative">
          
          <label>Your Experience</label>
          <textarea name="experience" rows="4" required placeholder="Briefly describe your work experience..."></textarea>
          
          <label>Key Skills</label>
          <input type="text" name="skills" required placeholder="e.g. Customer Service, Sales, Microsoft Office">
          
          <button type="submit">🚀 Order Resume</button>
        </form>
        
        <script>
          document.getElementById('orderForm').onsubmit = async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const data = Object.fromEntries(formData);
            
            try {
              const response = await fetch('/api/resume/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
              });
              
              const result = await response.json();
              if (result.status === 'success') {
                alert('✅ Order received! Order ID: ' + result.orderId + '\\n\\nWe will process your resume and send it to your email.');
                e.target.reset();
              } else {
                alert('Error: ' + (result.error || 'Failed to process order'));
              }
            } catch (error) {
              alert('Error submitting order: ' + error.message);
            }
          };
        </script>
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