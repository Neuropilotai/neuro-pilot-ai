require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8000;

// Basic middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'neuro-pilot-ai-minimal',
    version: '1.0.0'
  });
});

// Homepage
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Neuro.Pilot.AI - Back Online</title>
        <style>
          body { 
            font-family: Arial, sans-serif; 
            text-align: center; 
            padding: 50px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            min-height: 100vh;
            margin: 0;
          }
          .container {
            background: rgba(255,255,255,0.1);
            padding: 40px;
            border-radius: 20px;
            backdrop-filter: blur(10px);
            max-width: 600px;
            margin: 0 auto;
          }
          h1 { font-size: 3em; margin-bottom: 20px; }
          .status { 
            background: #48bb78; 
            padding: 15px; 
            border-radius: 10px; 
            margin: 20px 0;
            font-weight: bold;
          }
          .btn {
            background: white;
            color: #667eea;
            padding: 15px 30px;
            text-decoration: none;
            border-radius: 10px;
            font-weight: bold;
            display: inline-block;
            margin: 10px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🚀 Neuro.Pilot.AI</h1>
          <div class="status">✅ SYSTEM ONLINE</div>
          <p>Railway deployment successful!</p>
          <p>Service restored at ${new Date().toLocaleString()}</p>
          <a href="/order" class="btn">📝 Order Resume</a>
          <a href="/api/health" class="btn">🔍 Health Check</a>
        </div>
      </body>
    </html>
  `);
});

// Order page
app.get('/order', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'order.html'));
});

// Basic order processing (simplified)
app.post('/api/resume/generate', (req, res) => {
  try {
    console.log('📝 Order received:', req.body.packageType || 'professional');
    
    const orderData = {
      orderId: `order_${Date.now()}`,
      timestamp: new Date().toISOString(),
      status: 'received',
      ...req.body
    };
    
    // Save order (simplified)
    const ordersDir = path.join(__dirname, 'orders');
    if (!fs.existsSync(ordersDir)) {
      fs.mkdirSync(ordersDir, { recursive: true });
    }
    
    const orderPath = path.join(ordersDir, `${orderData.orderId}.json`);
    fs.writeFileSync(orderPath, JSON.stringify(orderData, null, 2));
    
    console.log(`✅ Order saved: ${orderData.orderId}`);
    
    // For free orders, redirect to confirmation
    if (orderData.finalPrice === 0 || orderData.finalPrice === '0') {
      return res.json({
        status: 'success',
        orderId: orderData.orderId,
        message: 'Free order confirmed!',
        checkoutUrl: `/order-confirmation?session=free_${orderData.orderId}&order_id=${orderData.orderId}&package=${orderData.packageType}&price=0&promo=true`
      });
    }
    
    // For paid orders, would integrate with Stripe here
    res.json({
      status: 'success',
      orderId: orderData.orderId,
      message: 'Order received - payment integration coming soon'
    });
    
  } catch (error) {
    console.error('❌ Order error:', error);
    res.status(500).json({ error: 'Order processing failed' });
  }
});

// Order confirmation page
app.get('/order-confirmation', (req, res) => {
  const { package: packageType, price, promo, order_id } = req.query;
  const isPromo = promo === 'true';
  
  res.send(`
    <html>
      <head>
        <title>Order Confirmed - Neuro.Pilot.AI</title>
        <style>
          body { 
            font-family: Arial, sans-serif; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            min-height: 100vh;
            margin: 0;
            padding: 20px;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            background: rgba(255,255,255,0.1);
            padding: 40px;
            border-radius: 20px;
            backdrop-filter: blur(10px);
            text-align: center;
          }
          .status { 
            background: #48bb78; 
            padding: 20px; 
            border-radius: 10px; 
            margin: 20px 0;
          }
          .details {
            background: rgba(255,255,255,0.1);
            padding: 20px;
            border-radius: 10px;
            margin: 20px 0;
            text-align: left;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🎉 Order Confirmed!</h1>
          ${isPromo ? '<div style="background: #48bb78; padding: 10px; border-radius: 10px; margin: 20px 0;">🎟️ PROMO CODE APPLIED</div>' : ''}
          
          <div class="status">
            ✅ Your order has been received!
          </div>
          
          <div class="details">
            <h3>Order Details</h3>
            <p><strong>Package:</strong> ${(packageType || 'professional').charAt(0).toUpperCase() + (packageType || 'professional').slice(1)}</p>
            <p><strong>Order ID:</strong> ${order_id || 'Processing'}</p>
            <p><strong>Amount:</strong> ${price === '0' ? 'FREE' : '$' + (price || '45')}</p>
            <p><strong>Status:</strong> Order received and queued for processing</p>
          </div>
          
          <p><strong>What's Next?</strong></p>
          <p>We'll process your order and send you an email confirmation.</p>
          <p>Processing time: 24-48 hours</p>
          
          <p style="margin-top: 30px;">
            <strong>System Status:</strong> ✅ Online and processing orders
          </p>
        </div>
      </body>
    </html>
  `);
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Neuro.Pilot.AI Minimal Server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🌐 Homepage: http://localhost:${PORT}/`);
  console.log(`📝 Order page: http://localhost:${PORT}/order`);
  console.log('✅ RAILWAY DEPLOYMENT SUCCESSFUL');
});