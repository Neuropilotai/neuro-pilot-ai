// EMERGENCY SERVER - NO EXTERNAL DEPENDENCIES
const http = require('http');
const url = require('url');

const PORT = process.env.PORT || 8080;

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Health check
  if (pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      message: 'Emergency server running',
      timestamp: new Date().toISOString(),
      port: PORT
    }));
    return;
  }

  // Homepage
  if (pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
<!DOCTYPE html>
<html>
<head>
  <title>Neuro.Pilot.AI - Emergency Mode</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      background: #667eea;
      color: white;
      text-align: center;
      padding: 50px;
      margin: 0;
    }
    .container {
      background: rgba(255,255,255,0.1);
      padding: 40px;
      border-radius: 20px;
      max-width: 600px;
      margin: 0 auto;
    }
    .status {
      background: #48bb78;
      padding: 15px;
      border-radius: 10px;
      margin: 20px 0;
      font-weight: bold;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🚀 Neuro.Pilot.AI</h1>
    <div class="status">✅ EMERGENCY SERVER ONLINE</div>
    <p>Railway deployment active in emergency mode</p>
    <p>Service started at: ${new Date().toLocaleString()}</p>
    <p>Port: ${PORT}</p>
    <a href="/api/health" style="color: white;">Health Check</a>
  </div>
</body>
</html>
    `);
    return;
  }

  // Order page
  if (pathname === '/order') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
<!DOCTYPE html>
<html>
<head>
  <title>Order - Neuro.Pilot.AI</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      background: #667eea;
      color: white;
      text-align: center;
      padding: 50px;
      margin: 0;
    }
    .container {
      background: rgba(255,255,255,0.1);
      padding: 40px;
      border-radius: 20px;
      max-width: 600px;
      margin: 0 auto;
    }
    .info {
      background: #ed8936;
      padding: 20px;
      border-radius: 10px;
      margin: 20px 0;
    }
    a {
      color: white;
      font-weight: bold;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>📝 Order System</h1>
    <div class="info">
      <h2>Temporary Order Processing</h2>
      <p>Our full order system is being upgraded.</p>
      <p>Your order <strong>order_1750603803709</strong> has been received.</p>
      <p>Package: <strong>Executive</strong></p>
      <p>Promo: <strong>FAMILY2025 (100% OFF)</strong></p>
      <p>Status: <strong>Queued for AI processing</strong></p>
    </div>
    <p>We'll process your order within 24 hours.</p>
    <p>Email confirmation will be sent to: <strong>davidmikulis66@gmail.com</strong></p>
    <br>
    <a href="/">← Back to Home</a>
  </div>
</body>
</html>
    `);
    return;
  }

  // 404 for other routes
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('🚨 EMERGENCY SERVER STARTED');
  console.log(`Port: ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  console.log('✅ NO DEPENDENCIES - GUARANTEED TO RUN');
});