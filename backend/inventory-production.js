#!/usr/bin/env node
/**
 * Production Inventory Management System
 * © 2025 David Mikulis - All Rights Reserved
 * Optimized for Render/Fly.io deployment
 */

const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Environment configuration
const CONFIG = {
  JWT_SECRET: process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex'),
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'admin@inventory.local',
  ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH || '$2b$12$8K1p2V3B.nQ7mF9xJ6tY8eGH2pQ5rT9xM4nL6vZ8wC1yS3dF7gH9i',
  DATA_PATH: process.env.DATA_PATH || './data',
  RATE_LIMIT_WINDOW: parseInt(process.env.RATE_LIMIT_WINDOW) || 900000,
  RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  SESSION_TIMEOUT: parseInt(process.env.SESSION_TIMEOUT) || 86400000,
  NODE_ENV: process.env.NODE_ENV || 'production'
};

// Minimal middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data: https:;");
  next();
});

// Rate limiting
const rateLimitStore = new Map();
const rateLimit = (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  const windowStart = now - CONFIG.RATE_LIMIT_WINDOW;
  
  if (!rateLimitStore.has(ip)) {
    rateLimitStore.set(ip, []);
  }
  
  const requests = rateLimitStore.get(ip).filter(time => time > windowStart);
  requests.push(now);
  rateLimitStore.set(ip, requests);
  
  if (requests.length > CONFIG.RATE_LIMIT_MAX) {
    return res.status(429).json({ error: 'Too many requests' });
  }
  
  next();
};

// Clean up old rate limit entries periodically
setInterval(() => {
  const now = Date.now();
  const windowStart = now - CONFIG.RATE_LIMIT_WINDOW;
  for (const [ip, requests] of rateLimitStore) {
    const filtered = requests.filter(time => time > windowStart);
    if (filtered.length === 0) {
      rateLimitStore.delete(ip);
    } else {
      rateLimitStore.set(ip, filtered);
    }
  }
}, 60000);

// Simple JWT implementation
const generateToken = (payload) => {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', CONFIG.JWT_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${signature}`;
};

const verifyToken = (token) => {
  try {
    const [header, body, signature] = token.split('.');
    const expectedSignature = crypto
      .createHmac('sha256', CONFIG.JWT_SECRET)
      .update(`${header}.${body}`)
      .digest('base64url');
    
    if (signature !== expectedSignature) return null;
    
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (payload.exp && payload.exp < Date.now()) return null;
    
    return payload;
  } catch {
    return null;
  }
};

// Authentication middleware
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(403).json({ error: 'Invalid token' });
  }
  
  req.user = payload;
  next();
};

// Data storage
let inventory = [];
let locations = {};
let aiState = { language: 'english' };

// Initialize data directory
const initDataDir = async () => {
  try {
    await fs.mkdir(CONFIG.DATA_PATH, { recursive: true });
    await fs.mkdir(path.join(CONFIG.DATA_PATH, 'backups'), { recursive: true });
  } catch (error) {
    console.error('Failed to create data directories:', error);
  }
};

// Load data
const loadData = async () => {
  try {
    const inventoryPath = path.join(CONFIG.DATA_PATH, 'inventory.json');
    const locationsPath = path.join(CONFIG.DATA_PATH, 'locations.json');
    
    try {
      const invData = await fs.readFile(inventoryPath, 'utf8');
      inventory = JSON.parse(invData);
    } catch {
      // Initialize with sample data
      inventory = [
        { id: 1, name: { en: 'Ground Beef', fr: 'Bœuf Haché' }, quantity: 75, min: 50, max: 200, category: 'Meat', unit: 'LB', supplier: 'Sysco', price: 4.99, location: 'Freezer A1' },
        { id: 2, name: { en: 'Milk', fr: 'Lait' }, quantity: 35, min: 20, max: 100, category: 'Dairy', unit: 'GAL', supplier: 'GFS', price: 3.99, location: 'Cooler B2' },
        { id: 3, name: { en: 'Bread', fr: 'Pain' }, quantity: 15, min: 25, max: 120, category: 'Bakery', unit: 'LOAF', supplier: 'Local', price: 2.99, location: 'Dry Storage' }
      ];
    }
    
    try {
      const locData = await fs.readFile(locationsPath, 'utf8');
      locations = JSON.parse(locData);
    } catch {
      locations = {
        'Freezer A1': { type: 'Freezer', temp: '-10°F', capacity: 500 },
        'Cooler B2': { type: 'Cooler', temp: '38°F', capacity: 300 },
        'Dry Storage': { type: 'Dry', temp: 'Room', capacity: 1000 }
      };
    }
  } catch (error) {
    console.error('Data load error:', error);
  }
};

// Save data
const saveData = async () => {
  try {
    await fs.writeFile(
      path.join(CONFIG.DATA_PATH, 'inventory.json'),
      JSON.stringify(inventory, null, 2)
    );
    await fs.writeFile(
      path.join(CONFIG.DATA_PATH, 'locations.json'),
      JSON.stringify(locations, null, 2)
    );
    
    // Create backup
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    await fs.writeFile(
      path.join(CONFIG.DATA_PATH, 'backups', `backup-${timestamp}.json`),
      JSON.stringify({ inventory, locations }, null, 2)
    );
  } catch (error) {
    console.error('Save error:', error);
  }
};

// Simple bcrypt comparison (for production, use actual bcrypt library)
const comparePassword = (password, hash) => {
  // In production, use: return bcrypt.compare(password, hash);
  // For this minimal version, we'll use a simple check
  return hash === '$2b$12$8K1p2V3B.nQ7mF9xJ6tY8eGH2pQ5rT9xM4nL6vZ8wC1yS3dF7gH9i' && password === 'inventory2025';
};

// AI Agent
class AIAgent {
  analyze() {
    const critical = inventory.filter(item => item.quantity <= item.min);
    const predictions = inventory.map(item => ({
      name: item.name[aiState.language === 'french' ? 'fr' : 'en'],
      daysLeft: Math.floor(item.quantity / 5), // Simple estimation
      needsReorder: item.quantity <= item.min
    }));
    
    return {
      critical: critical.length,
      predictions: predictions.filter(p => p.daysLeft <= 7),
      health: Math.round((1 - critical.length / inventory.length) * 100)
    };
  }
  
  suggest() {
    const suggestions = [];
    const suppliers = {};
    
    inventory.forEach(item => {
      if (item.quantity <= item.min) {
        if (!suppliers[item.supplier]) suppliers[item.supplier] = [];
        suppliers[item.supplier].push(item);
      }
    });
    
    Object.entries(suppliers).forEach(([supplier, items]) => {
      if (items.length > 1) {
        suggestions.push({
          type: 'bulk',
          supplier,
          items: items.length,
          message: aiState.language === 'french' 
            ? `Combiner ${items.length} articles de ${supplier}`
            : `Combine ${items.length} items from ${supplier}`
        });
      }
    });
    
    return suggestions;
  }
}

const ai = new AIAgent();

// API Routes
app.post('/api/auth/login', rateLimit, async (req, res) => {
  const { email, password } = req.body;
  
  if (email === CONFIG.ADMIN_EMAIL && comparePassword(password, CONFIG.ADMIN_PASSWORD_HASH)) {
    const token = generateToken({
      id: 1,
      email,
      exp: Date.now() + CONFIG.SESSION_TIMEOUT
    });
    res.json({ success: true, token });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

app.get('/api/inventory', authenticate, (req, res) => {
  res.json({
    items: inventory,
    stats: {
      total: inventory.length,
      low: inventory.filter(i => i.quantity <= i.min).length,
      value: inventory.reduce((sum, i) => sum + (i.quantity * i.price), 0)
    }
  });
});

app.put('/api/inventory/:id', authenticate, async (req, res) => {
  const id = parseInt(req.params.id);
  const { quantity } = req.body;
  
  const item = inventory.find(i => i.id === id);
  if (item) {
    item.quantity = parseInt(quantity);
    await saveData();
    res.json({ success: true, item });
  } else {
    res.status(404).json({ error: 'Item not found' });
  }
});

app.get('/api/locations', authenticate, (req, res) => {
  res.json({ locations });
});

app.post('/api/locations', authenticate, async (req, res) => {
  const { name, type, temp, capacity } = req.body;
  locations[name] = { type, temp, capacity: parseInt(capacity) };
  await saveData();
  res.json({ success: true });
});

app.get('/api/ai/analysis', authenticate, (req, res) => {
  aiState.language = req.query.lang || 'english';
  res.json(ai.analyze());
});

app.get('/api/ai/suggestions', authenticate, (req, res) => {
  aiState.language = req.query.lang || 'english';
  res.json(ai.suggest());
});

app.get('/api/export', authenticate, (req, res) => {
  res.json({ inventory, locations, exported: new Date().toISOString() });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve frontend
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Inventory System</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f5;color:#333}
.header{background:#2c3e50;color:white;padding:1rem;display:flex;justify-content:space-between;align-items:center}
.container{max-width:1200px;margin:0 auto;padding:2rem}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:1rem;margin-bottom:2rem}
.stat{background:white;padding:1.5rem;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1)}
.stat-value{font-size:2rem;font-weight:bold;color:#2c3e50}
.btn{padding:0.5rem 1rem;border:none;border-radius:4px;cursor:pointer;background:#3498db;color:white;transition:all 0.3s}
.btn:hover{background:#2980b9}
.btn-ai{background:#9b59b6}
.btn-ai:hover{background:#8e44ad}
.table{width:100%;background:white;border-radius:8px;overflow:hidden;box-shadow:0 2px 4px rgba(0,0,0,0.1)}
table{width:100%;border-collapse:collapse}
th,td{padding:1rem;text-align:left;border-bottom:1px solid #eee}
th{background:#ecf0f1;font-weight:600}
.status-low{color:#e74c3c;font-weight:bold}
.login-container{min-height:100vh;display:flex;align-items:center;justify-content:center}
.login-box{background:white;padding:2rem;border-radius:8px;box-shadow:0 4px 6px rgba(0,0,0,0.1);width:100%;max-width:400px}
.login-box input{width:100%;padding:0.75rem;margin:0.5rem 0;border:1px solid #ddd;border-radius:4px}
.ai-panel{position:fixed;top:0;right:-400px;width:400px;height:100vh;background:white;box-shadow:-2px 0 5px rgba(0,0,0,0.1);transition:right 0.3s;z-index:1000}
.ai-panel.open{right:0}
.ai-messages{height:calc(100vh - 200px);overflow-y:auto;padding:1rem}
.ai-message{margin:0.5rem 0;padding:0.75rem;border-radius:8px;background:#ecf0f1}
.ai-message.user{background:#3498db;color:white;text-align:right}
.hidden{display:none}
@media(max-width:768px){.stats{grid-template-columns:1fr}}
</style>
</head>
<body>
<div id="app">
<div id="loginScreen" class="login-container">
<div class="login-box">
<h2>Inventory System</h2>
<form id="loginForm">
<input type="email" id="email" placeholder="Email" required>
<input type="password" id="password" placeholder="Password" required>
<button type="submit" class="btn" style="width:100%;margin-top:1rem">Login</button>
</form>
</div>
</div>

<div id="mainApp" class="hidden">
<div class="header">
<h1>Inventory Management</h1>
<div style="display:flex;gap:1rem;align-items:center">
<button class="btn btn-ai" onclick="toggleAI()">🤖 AI Assistant</button>
<button class="btn" onclick="exportData()">📥 Export</button>
<button class="btn" onclick="toggleLang()">🌐 FR/EN</button>
<button class="btn" onclick="logout()">Logout</button>
</div>
</div>

<div class="container">
<div class="stats">
<div class="stat">
<div class="stat-value" id="totalItems">0</div>
<div>Total Items</div>
</div>
<div class="stat">
<div class="stat-value" id="lowStock" style="color:#e74c3c">0</div>
<div>Low Stock</div>
</div>
<div class="stat">
<div class="stat-value" id="totalValue">$0</div>
<div>Total Value</div>
</div>
<div class="stat">
<div class="stat-value" id="aiHealth">0%</div>
<div>Health Score</div>
</div>
</div>

<div class="table">
<table>
<thead>
<tr>
<th>Item</th>
<th>Quantity</th>
<th>Min/Max</th>
<th>Location</th>
<th>Status</th>
<th>Action</th>
</tr>
</thead>
<tbody id="inventoryTable"></tbody>
</table>
</div>
</div>

<div id="aiPanel" class="ai-panel">
<div style="padding:1rem;background:#9b59b6;color:white;display:flex;justify-content:space-between;align-items:center">
<h3>AI Assistant</h3>
<button onclick="toggleAI()" style="background:none;border:none;color:white;font-size:1.5rem;cursor:pointer">&times;</button>
</div>
<div class="ai-messages" id="aiMessages"></div>
<div style="position:absolute;bottom:0;left:0;right:0;padding:1rem;background:#f8f9fa">
<button class="btn btn-ai" onclick="getAnalysis()" style="width:48%">Analysis</button>
<button class="btn btn-ai" onclick="getSuggestions()" style="width:48%;float:right">Suggestions</button>
</div>
</div>
</div>
</div>

<script>
let token = localStorage.getItem('token');
let lang = localStorage.getItem('lang') || 'english';
let inventory = [];

const tr = {
  english: {
    item: 'Item',
    quantity: 'Quantity',
    low: 'LOW',
    normal: 'Normal',
    analysis: 'Analysis Complete',
    suggestions: 'Suggestions Generated'
  },
  french: {
    item: 'Article',
    quantity: 'Quantité',
    low: 'BAS',
    normal: 'Normal',
    analysis: 'Analyse Complète',
    suggestions: 'Suggestions Générées'
  }
};

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      email: document.getElementById('email').value,
      password: document.getElementById('password').value
    })
  });
  
  if (response.ok) {
    const data = await response.json();
    token = data.token;
    localStorage.setItem('token', token);
    showApp();
  } else {
    alert('Invalid credentials');
  }
});

function showApp() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('mainApp').classList.remove('hidden');
  loadInventory();
}

async function loadInventory() {
  const response = await fetch('/api/inventory', {
    headers: {'Authorization': 'Bearer ' + token}
  });
  
  if (response.ok) {
    const data = await response.json();
    inventory = data.items;
    document.getElementById('totalItems').textContent = data.stats.total;
    document.getElementById('lowStock').textContent = data.stats.low;
    document.getElementById('totalValue').textContent = '$' + data.stats.value.toFixed(2);
    displayInventory();
    checkAIHealth();
  }
}

function displayInventory() {
  const tbody = document.getElementById('inventoryTable');
  tbody.innerHTML = inventory.map(item => \`
    <tr>
      <td>\${item.name[lang === 'french' ? 'fr' : 'en']}</td>
      <td>\${item.quantity} \${item.unit}</td>
      <td>\${item.min}/\${item.max}</td>
      <td>\${item.location}</td>
      <td class="\${item.quantity <= item.min ? 'status-low' : ''}">\${item.quantity <= item.min ? tr[lang].low : tr[lang].normal}</td>
      <td>
        <input type="number" value="\${item.quantity}" min="0" style="width:60px" onchange="updateQuantity(\${item.id}, this.value)">
      </td>
    </tr>
  \`).join('');
}

async function updateQuantity(id, quantity) {
  await fetch(\`/api/inventory/\${id}\`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
    body: JSON.stringify({quantity: parseInt(quantity)})
  });
  loadInventory();
}

async function checkAIHealth() {
  const response = await fetch(\`/api/ai/analysis?lang=\${lang}\`, {
    headers: {'Authorization': 'Bearer ' + token}
  });
  if (response.ok) {
    const data = await response.json();
    document.getElementById('aiHealth').textContent = data.health + '%';
  }
}

function toggleAI() {
  const panel = document.getElementById('aiPanel');
  panel.classList.toggle('open');
}

async function getAnalysis() {
  const response = await fetch(\`/api/ai/analysis?lang=\${lang}\`, {
    headers: {'Authorization': 'Bearer ' + token}
  });
  if (response.ok) {
    const data = await response.json();
    addAIMessage(\`\${tr[lang].analysis}: \${data.critical} critical items, \${data.health}% health score\`);
  }
}

async function getSuggestions() {
  const response = await fetch(\`/api/ai/suggestions?lang=\${lang}\`, {
    headers: {'Authorization': 'Bearer ' + token}
  });
  if (response.ok) {
    const data = await response.json();
    const msg = data.map(s => s.message).join(', ') || 'No suggestions';
    addAIMessage(tr[lang].suggestions + ': ' + msg);
  }
}

function addAIMessage(text) {
  const div = document.createElement('div');
  div.className = 'ai-message';
  div.textContent = text;
  document.getElementById('aiMessages').appendChild(div);
}

async function exportData() {
  const response = await fetch('/api/export', {
    headers: {'Authorization': 'Bearer ' + token}
  });
  if (response.ok) {
    const data = await response.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'inventory-export.json';
    a.click();
  }
}

function toggleLang() {
  lang = lang === 'english' ? 'french' : 'english';
  localStorage.setItem('lang', lang);
  displayInventory();
  checkAIHealth();
}

function logout() {
  localStorage.removeItem('token');
  location.reload();
}

if (token) {
  showApp();
}
</script>
</body>
</html>`);
});

// Initialize
(async () => {
  await initDataDir();
  await loadData();
  
  app.listen(PORT, () => {
    console.log(`Inventory system running on port ${PORT}`);
    console.log(`Environment: ${CONFIG.NODE_ENV}`);
  });
})();