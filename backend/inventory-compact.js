#!/usr/bin/env node

/**
 * 🏕️ COMPACT INVENTORY SYSTEM
 * Streamlined version with essential features
 * © 2025 David Mikulis - All Rights Reserved
 */

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const jwt = require("jsonwebtoken");
const helmet = require("helmet");

const app = express();
const PORT = 8084;
const JWT_SECRET = "camp-inventory-secret-2025";
const upload = multer({ dest: "uploads/" });

// Security
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        scriptSrcAttr: ["'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
  }),
);

app.use(cors());
app.use(express.json());

// Auth middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// Data storage
let inventory = [
  {
    id: 1,
    name: "Ground Beef",
    quantity: 75,
    min: 50,
    location: "Freezer A1",
    category: "Meat",
    supplier: "Sysco",
    dailyUsage: 8,
    lastOrderDate: "2025-01-20",
  },
  {
    id: 2,
    name: "Milk",
    quantity: 35,
    min: 20,
    location: "Cooler B2",
    category: "Dairy",
    supplier: "GFS",
    dailyUsage: 12,
    lastOrderDate: "2025-01-18",
  },
  {
    id: 3,
    name: "Bread",
    quantity: 15,
    min: 25,
    location: "Dry Storage",
    category: "Bakery",
    supplier: "Local",
    dailyUsage: 15,
    lastOrderDate: "2025-01-15",
  },
  {
    id: 4,
    name: "Chicken Breast",
    quantity: 120,
    min: 80,
    location: "Freezer A2",
    category: "Meat",
    supplier: "Sysco",
    dailyUsage: 10,
    lastOrderDate: "2025-01-22",
  },
  {
    id: 5,
    name: "Eggs",
    quantity: 48,
    min: 60,
    location: "Cooler B1",
    category: "Dairy",
    supplier: "GFS",
    dailyUsage: 18,
    lastOrderDate: "2025-01-19",
  },
];

const locations = [
  "Freezer A1",
  "Freezer A2",
  "Cooler B1",
  "Cooler B2",
  "Dry Storage",
];

// AI Agent Class
class InventoryAIAgent {
  constructor() {
    this.name = "Camp Inventory AI Assistant";
    this.version = "2.0";
    this.capabilities = [
      "predictions",
      "recommendations",
      "analysis",
      "alerts",
    ];
    this.learningData = [];
  }

  // Analyze inventory and provide insights
  analyzeInventory() {
    const analysis = {
      timestamp: new Date().toISOString(),
      criticalItems: [],
      predictions: [],
      recommendations: [],
      alerts: [],
      insights: {},
    };

    inventory.forEach((item) => {
      // Critical stock analysis
      const daysLeft = Math.floor(item.quantity / (item.dailyUsage || 1));

      if (item.quantity <= item.min) {
        analysis.criticalItems.push({
          ...item,
          severity: item.quantity === 0 ? "critical" : "low",
          daysLeft,
          action: "immediate_reorder",
        });
      }

      // Predict when item will run out
      if (daysLeft <= 7 && daysLeft > 0) {
        analysis.predictions.push({
          item: item.name,
          daysLeft,
          predictedStockout: new Date(
            Date.now() + daysLeft * 24 * 60 * 60 * 1000,
          )
            .toISOString()
            .split("T")[0],
          confidence: 0.85,
        });
      }

      // Generate recommendations
      if (daysLeft <= 3) {
        const recommendedQuantity = Math.ceil(item.dailyUsage * 14); // 2 weeks supply
        analysis.recommendations.push({
          item: item.name,
          action: "order_now",
          quantity: recommendedQuantity,
          supplier: item.supplier,
          priority: daysLeft <= 1 ? "urgent" : "high",
          reasoning: `Current stock will last ${daysLeft} days. Recommend ${recommendedQuantity} units for 2-week supply.`,
        });
      }
    });

    // Generate alerts
    if (analysis.criticalItems.length > 0) {
      analysis.alerts.push({
        type: "stock_alert",
        message: `${analysis.criticalItems.length} items need immediate attention`,
        severity: "high",
        items: analysis.criticalItems.map((i) => i.name),
      });
    }

    // Insights
    analysis.insights = {
      totalValue: inventory.reduce((sum, item) => sum + item.quantity * 10, 0),
      fastestMoving: inventory.sort(
        (a, b) => (b.dailyUsage || 0) - (a.dailyUsage || 0),
      )[0]?.name,
      slowestMoving: inventory.sort(
        (a, b) => (a.dailyUsage || 0) - (b.dailyUsage || 0),
      )[0]?.name,
      averageDaysLeft: Math.round(
        inventory.reduce(
          (sum, item) =>
            sum + Math.floor(item.quantity / (item.dailyUsage || 1)),
          0,
        ) / inventory.length,
      ),
    };

    return analysis;
  }

  // Generate smart suggestions based on patterns
  generateSuggestions() {
    const suggestions = [];
    const analysis = this.analyzeInventory();

    // Suggest optimal reorder quantities
    analysis.criticalItems.forEach((item) => {
      const optimalQuantity = Math.ceil(item.dailyUsage * 21); // 3 weeks supply
      suggestions.push({
        type: "reorder",
        item: item.name,
        suggestion: `Order ${optimalQuantity} units of ${item.name} from ${item.supplier}`,
        priority: item.severity === "critical" ? "urgent" : "high",
        reasoning: `Based on daily usage of ${item.dailyUsage}, this provides 3 weeks of inventory`,
      });
    });

    // Suggest menu adjustments for overstock
    const overstockItems = inventory.filter(
      (item) => item.quantity > item.min * 3,
    );
    overstockItems.forEach((item) => {
      suggestions.push({
        type: "menu_optimization",
        item: item.name,
        suggestion: `Consider featuring ${item.name} in upcoming menus`,
        priority: "medium",
        reasoning: `High stock levels (${item.quantity} units) - use before expiration`,
      });
    });

    return suggestions;
  }

  // Chat interface for AI assistant
  processQuery(query) {
    const lowerQuery = query.toLowerCase();

    if (lowerQuery.includes("analysis") || lowerQuery.includes("report")) {
      return this.analyzeInventory();
    }

    if (lowerQuery.includes("suggestion") || lowerQuery.includes("recommend")) {
      return this.generateSuggestions();
    }

    if (lowerQuery.includes("low stock") || lowerQuery.includes("critical")) {
      const critical = inventory.filter((item) => item.quantity <= item.min);
      return {
        type: "query_response",
        items: critical,
        message: `Found ${critical.length} items with low stock: ${critical.map((i) => i.name).join(", ")}`,
      };
    }

    if (lowerQuery.includes("predict") || lowerQuery.includes("forecast")) {
      const predictions = inventory.map((item) => ({
        name: item.name,
        daysLeft: Math.floor(item.quantity / (item.dailyUsage || 1)),
        stockoutDate: new Date(
          Date.now() +
            Math.floor(item.quantity / (item.dailyUsage || 1)) *
              24 *
              60 *
              60 *
              1000,
        )
          .toISOString()
          .split("T")[0],
      }));
      return { type: "predictions", predictions };
    }

    return {
      type: "general_response",
      message:
        "I can help with inventory analysis, predictions, recommendations, and stock alerts. Try asking: 'Show analysis', 'Give suggestions', or 'Check low stock'",
    };
  }
}

const aiAgent = new InventoryAIAgent();

// Routes
app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body;

  if (email === "admin@camp.com" && password === "camp2025") {
    const token = jwt.sign({ id: 1, email, role: "admin" }, JWT_SECRET);
    res.json({ success: true, token, user: { name: "Admin", email } });
  } else {
    res.status(401).json({ error: "Invalid credentials" });
  }
});

app.get("/api/inventory", authenticateToken, (req, res) => {
  const itemsWithStatus = inventory.map((item) => ({
    ...item,
    status: item.quantity <= item.min ? "low" : "normal",
    needsReorder: item.quantity <= item.min,
  }));

  res.json({
    items: itemsWithStatus,
    stats: {
      total: inventory.length,
      lowStock: inventory.filter((i) => i.quantity <= i.min).length,
      totalValue: inventory.reduce((sum, i) => sum + i.quantity * 10, 0),
    },
  });
});

app.put("/api/inventory/:id", authenticateToken, (req, res) => {
  const { id } = req.params;
  const { quantity } = req.body;

  const item = inventory.find((i) => i.id === parseInt(id));
  if (item) {
    item.quantity = quantity;
    res.json({ success: true, item });
  } else {
    res.status(404).json({ error: "Item not found" });
  }
});

app.post("/api/inventory", authenticateToken, (req, res) => {
  const newItem = {
    id: Math.max(...inventory.map((i) => i.id)) + 1,
    ...req.body,
  };
  inventory.push(newItem);
  res.json({ success: true, item: newItem });
});

app.get("/api/export", authenticateToken, (req, res) => {
  const data = {
    exportDate: new Date().toISOString(),
    inventory,
    locations,
  };
  res.json(data);
});

// AI Agent endpoints
app.get("/api/ai/analysis", authenticateToken, (req, res) => {
  const analysis = aiAgent.analyzeInventory();
  res.json(analysis);
});

app.get("/api/ai/suggestions", authenticateToken, (req, res) => {
  const suggestions = aiAgent.generateSuggestions();
  res.json(suggestions);
});

app.post("/api/ai/chat", authenticateToken, (req, res) => {
  const { query } = req.body;
  const response = aiAgent.processQuery(query);
  res.json({
    query,
    response,
    timestamp: new Date().toISOString(),
    agent: aiAgent.name,
  });
});

// Compact UI
app.get("/", (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🏕️ Compact Inventory</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #1a1a1a;
            color: #fff;
            line-height: 1.6;
        }
        
        .header {
            background: #2a2a2a;
            padding: 1rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #444;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 1rem;
        }
        
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1rem;
            margin: 1rem 0;
        }
        
        .stat {
            background: #2a2a2a;
            padding: 1rem;
            border-radius: 8px;
            text-align: center;
        }
        
        .stat-value {
            font-size: 2rem;
            font-weight: bold;
            color: #4CAF50;
        }
        
        .inventory-table {
            width: 100%;
            background: #2a2a2a;
            border-radius: 8px;
            overflow: hidden;
            margin-top: 1rem;
        }
        
        table {
            width: 100%;
            border-collapse: collapse;
        }
        
        th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #444;
        }
        
        th {
            background: #333;
            font-weight: 600;
        }
        
        tr:hover {
            background: #333;
        }
        
        .status-low {
            color: #ff6b6b;
            font-weight: bold;
        }
        
        .status-normal {
            color: #4CAF50;
        }
        
        .btn {
            padding: 8px 16px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.3s;
        }
        
        .btn-primary {
            background: #4CAF50;
            color: white;
        }
        
        .btn-primary:hover {
            background: #45a049;
        }
        
        .btn-export {
            background: #2196F3;
            color: white;
        }
        
        .btn-danger {
            background: #ff6b6b;
            color: white;
        }
        
        .quick-update {
            display: flex;
            gap: 0.5rem;
            align-items: center;
        }
        
        .quick-update input {
            width: 60px;
            padding: 4px;
            border: 1px solid #444;
            border-radius: 4px;
            background: #1a1a1a;
            color: white;
            text-align: center;
        }
        
        .login-container {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .login-box {
            background: #2a2a2a;
            padding: 2rem;
            border-radius: 8px;
            width: 100%;
            max-width: 400px;
        }
        
        .login-box h2 {
            margin-bottom: 1.5rem;
            text-align: center;
        }
        
        .login-box input {
            width: 100%;
            padding: 0.75rem;
            margin-bottom: 1rem;
            border: 1px solid #444;
            border-radius: 4px;
            background: #1a1a1a;
            color: white;
        }
        
        .filters {
            display: flex;
            gap: 1rem;
            margin: 1rem 0;
            flex-wrap: wrap;
        }
        
        .filter-btn {
            padding: 6px 12px;
            border: 1px solid #444;
            background: transparent;
            color: white;
            border-radius: 4px;
            cursor: pointer;
        }
        
        .filter-btn.active {
            background: #4CAF50;
            border-color: #4CAF50;
        }
        
        .ai-panel {
            position: fixed;
            top: 0;
            right: 0;
            width: 400px;
            height: 100vh;
            background: #2a2a2a;
            border-left: 2px solid #444;
            z-index: 1000;
            display: flex;
            flex-direction: column;
        }
        
        .ai-header {
            padding: 1rem;
            background: #333;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid #444;
        }
        
        .ai-header h3 {
            margin: 0;
            color: #4CAF50;
        }
        
        .btn-close {
            background: none;
            border: none;
            color: white;
            font-size: 24px;
            cursor: pointer;
            padding: 0;
            width: 30px;
            height: 30px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .btn-close:hover {
            background: #ff6b6b;
        }
        
        .ai-content {
            flex: 1;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }
        
        .ai-quick-actions {
            padding: 1rem;
            display: flex;
            gap: 0.5rem;
            flex-wrap: wrap;
            border-bottom: 1px solid #444;
        }
        
        .ai-quick-actions .btn {
            flex: 1;
            font-size: 12px;
            padding: 6px 8px;
        }
        
        .ai-chat {
            flex: 1;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }
        
        .ai-messages {
            flex: 1;
            padding: 1rem;
            overflow-y: auto;
            max-height: calc(100vh - 200px);
        }
        
        .ai-message {
            margin-bottom: 1rem;
            padding: 0.75rem;
            border-radius: 8px;
            max-width: 90%;
        }
        
        .ai-message.user {
            background: #4CAF50;
            margin-left: auto;
            text-align: right;
        }
        
        .ai-message.ai {
            background: #333;
            border-left: 3px solid #4CAF50;
        }
        
        .ai-input {
            padding: 1rem;
            display: flex;
            gap: 0.5rem;
            border-top: 1px solid #444;
        }
        
        .ai-input input {
            flex: 1;
            padding: 0.5rem;
            border: 1px solid #444;
            border-radius: 4px;
            background: #1a1a1a;
            color: white;
        }
        
        .ai-recommendation {
            background: #2a4a2a;
            border-left: 3px solid #4CAF50;
            padding: 0.75rem;
            margin: 0.5rem 0;
            border-radius: 4px;
        }
        
        .ai-alert {
            background: #4a2a2a;
            border-left: 3px solid #ff6b6b;
            padding: 0.75rem;
            margin: 0.5rem 0;
            border-radius: 4px;
        }
        
        @media (max-width: 768px) {
            .stats { grid-template-columns: 1fr; }
            .quick-update { flex-direction: column; }
            .quick-update input { width: 100%; }
            
            .ai-panel {
                width: 100%;
                left: 0;
            }
        }
    </style>
</head>
<body>
    <div id="app">
        <!-- Login Screen -->
        <div id="loginScreen" class="login-container">
            <div class="login-box">
                <h2>🏕️ Camp Inventory</h2>
                <form id="loginForm">
                    <input type="email" id="email" placeholder="Email" value="admin@camp.com" required>
                    <input type="password" id="password" placeholder="Password" required>
                    <button type="submit" class="btn btn-primary" style="width: 100%;">Login</button>
                </form>
            </div>
        </div>
        
        <!-- Main Dashboard -->
        <div id="dashboard" style="display: none;">
            <div class="header">
                <h1>🏕️ Inventory System</h1>
                <div>
                    <button class="btn btn-primary" onclick="toggleAI()">🤖 AI Assistant</button>
                    <button class="btn btn-export" onclick="exportData()">📥 Export</button>
                    <button class="btn btn-danger" onclick="logout()">Logout</button>
                </div>
            </div>
            
            <div class="container">
                <!-- AI Assistant Panel -->
                <div id="aiPanel" class="ai-panel" style="display: none;">
                    <div class="ai-header">
                        <h3>🤖 AI Inventory Assistant</h3>
                        <button class="btn-close" onclick="toggleAI()">×</button>
                    </div>
                    <div class="ai-content">
                        <div class="ai-quick-actions">
                            <button class="btn btn-primary" onclick="getAIAnalysis()">📊 Analysis</button>
                            <button class="btn btn-primary" onclick="getAISuggestions()">💡 Suggestions</button>
                            <button class="btn btn-primary" onclick="checkLowStock()">⚠️ Low Stock</button>
                        </div>
                        <div class="ai-chat">
                            <div id="aiMessages" class="ai-messages"></div>
                            <div class="ai-input">
                                <input type="text" id="aiQuery" placeholder="Ask me anything about your inventory..." onkeypress="handleAIKeyPress(event)">
                                <button class="btn btn-primary" onclick="sendAIQuery()">Send</button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Stats -->
                <div class="stats">
                    <div class="stat">
                        <div class="stat-value" id="totalItems">0</div>
                        <div>Total Items</div>
                    </div>
                    <div class="stat">
                        <div class="stat-value" id="lowStock" style="color: #ff6b6b;">0</div>
                        <div>Low Stock</div>
                    </div>
                    <div class="stat">
                        <div class="stat-value" id="totalValue">$0</div>
                        <div>Total Value</div>
                    </div>
                    <div class="stat">
                        <div class="stat-value" id="aiStatus">🟢</div>
                        <div>AI Assistant</div>
                    </div>
                </div>
                
                <!-- Filters -->
                <div class="filters">
                    <button class="filter-btn active" onclick="filterItems('all')">All Items</button>
                    <button class="filter-btn" onclick="filterItems('low')">Low Stock</button>
                    <button class="filter-btn" onclick="filterItems('Meat')">Meat</button>
                    <button class="filter-btn" onclick="filterItems('Dairy')">Dairy</button>
                    <button class="filter-btn" onclick="filterItems('Bakery')">Bakery</button>
                </div>
                
                <!-- Inventory Table -->
                <div class="inventory-table">
                    <table>
                        <thead>
                            <tr>
                                <th>Item</th>
                                <th>Location</th>
                                <th>Quantity</th>
                                <th>Min Level</th>
                                <th>Status</th>
                                <th>Quick Update</th>
                            </tr>
                        </thead>
                        <tbody id="inventoryBody">
                            <!-- Items will be loaded here -->
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>
    
    <script>
        let authToken = null;
        let currentFilter = 'all';
        let allItems = [];
        
        // Login
        document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: document.getElementById('email').value,
                    password: document.getElementById('password').value
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                authToken = data.token;
                localStorage.setItem('token', authToken);
                showDashboard();
            } else {
                alert('Invalid credentials');
            }
        });
        
        // Show dashboard
        function showDashboard() {
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('dashboard').style.display = 'block';
            loadInventory();
        }
        
        // Load inventory
        async function loadInventory() {
            const response = await fetch('/api/inventory', {
                headers: { 'Authorization': 'Bearer ' + authToken }
            });
            
            const data = await response.json();
            allItems = data.items;
            
            // Update stats
            document.getElementById('totalItems').textContent = data.stats.total;
            document.getElementById('lowStock').textContent = data.stats.lowStock;
            document.getElementById('totalValue').textContent = '$' + data.stats.totalValue;
            
            // Show items
            displayItems();
        }
        
        // Display items
        function displayItems() {
            const tbody = document.getElementById('inventoryBody');
            let items = allItems;
            
            if (currentFilter === 'low') {
                items = items.filter(i => i.status === 'low');
            } else if (currentFilter !== 'all') {
                items = items.filter(i => i.category === currentFilter);
            }
            
            tbody.innerHTML = items.map(item => \`
                <tr>
                    <td>\${item.name}</td>
                    <td>\${item.location}</td>
                    <td class="status-\${item.status}">\${item.quantity}</td>
                    <td>\${item.min}</td>
                    <td class="status-\${item.status}">\${item.status.toUpperCase()}</td>
                    <td>
                        <div class="quick-update">
                            <input type="number" id="qty-\${item.id}" value="\${item.quantity}" min="0">
                            <button class="btn btn-primary" onclick="updateQuantity(\${item.id})">Update</button>
                        </div>
                    </td>
                </tr>
            \`).join('');
        }
        
        // Filter items
        function filterItems(filter) {
            currentFilter = filter;
            document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
            event.target.classList.add('active');
            displayItems();
        }
        
        // Update quantity
        async function updateQuantity(id) {
            const quantity = parseInt(document.getElementById('qty-' + id).value);
            
            const response = await fetch('/api/inventory/' + id, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + authToken
                },
                body: JSON.stringify({ quantity })
            });
            
            if (response.ok) {
                loadInventory();
            }
        }
        
        // Export data
        async function exportData() {
            const response = await fetch('/api/export', {
                headers: { 'Authorization': 'Bearer ' + authToken }
            });
            
            const data = await response.json();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'inventory_' + new Date().toISOString().split('T')[0] + '.json';
            a.click();
        }
        
        // Logout
        function logout() {
            authToken = null;
            localStorage.removeItem('token');
            location.reload();
        }
        
        // AI Assistant Functions
        function toggleAI() {
            const panel = document.getElementById('aiPanel');
            const isVisible = panel.style.display !== 'none';
            panel.style.display = isVisible ? 'none' : 'block';
            
            if (!isVisible) {
                addAIMessage('ai', 'Hello! I\\'m your AI inventory assistant. I can help with analysis, predictions, and recommendations. What would you like to know?');
            }
        }
        
        function addAIMessage(type, content) {
            const messagesDiv = document.getElementById('aiMessages');
            const messageDiv = document.createElement('div');
            messageDiv.className = \`ai-message \${type}\`;
            
            if (typeof content === 'object') {
                messageDiv.innerHTML = formatAIResponse(content);
            } else {
                messageDiv.textContent = content;
            }
            
            messagesDiv.appendChild(messageDiv);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }
        
        function formatAIResponse(response) {
            let html = '';
            
            if (response.type === 'query_response') {
                html += \`<strong>\${response.message}</strong><br>\`;
                if (response.items) {
                    response.items.forEach(item => {
                        html += \`<div class="ai-alert">📦 \${item.name}: \${item.quantity} units (Min: \${item.min})</div>\`;
                    });
                }
            } else if (Array.isArray(response)) {
                response.forEach(item => {
                    const className = item.priority === 'urgent' ? 'ai-alert' : 'ai-recommendation';
                    html += \`<div class="\${className}">
                        <strong>\${item.suggestion}</strong><br>
                        <small>\${item.reasoning}</small>
                    </div>\`;
                });
            } else if (response.criticalItems) {
                html += \`<strong>📊 Inventory Analysis</strong><br>\`;
                if (response.alerts.length > 0) {
                    response.alerts.forEach(alert => {
                        html += \`<div class="ai-alert">⚠️ \${alert.message}</div>\`;
                    });
                }
                
                if (response.criticalItems.length > 0) {
                    html += '<br><strong>Critical Items:</strong><br>';
                    response.criticalItems.forEach(item => {
                        html += \`<div class="ai-alert">📦 \${item.name}: \${item.quantity} units (\${item.daysLeft} days left)</div>\`;
                    });
                }
                
                if (response.recommendations.length > 0) {
                    html += '<br><strong>Recommendations:</strong><br>';
                    response.recommendations.forEach(rec => {
                        html += \`<div class="ai-recommendation">💡 \${rec.reasoning}</div>\`;
                    });
                }
            } else if (response.predictions) {
                html += '<strong>📈 Stock Predictions:</strong><br>';
                response.predictions.forEach(pred => {
                    const daysClass = pred.daysLeft <= 3 ? 'ai-alert' : 'ai-recommendation';
                    html += \`<div class="\${daysClass}">📦 \${pred.name}: \${pred.daysLeft} days until stockout</div>\`;
                });
            } else {
                html = response.message || JSON.stringify(response);
            }
            
            return html;
        }
        
        async function sendAIQuery() {
            const input = document.getElementById('aiQuery');
            const query = input.value.trim();
            if (!query) return;
            
            addAIMessage('user', query);
            input.value = '';
            
            try {
                const response = await fetch('/api/ai/chat', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + authToken
                    },
                    body: JSON.stringify({ query })
                });
                
                const data = await response.json();
                addAIMessage('ai', data.response);
            } catch (error) {
                addAIMessage('ai', 'Sorry, I encountered an error processing your request.');
            }
        }
        
        function handleAIKeyPress(event) {
            if (event.key === 'Enter') {
                sendAIQuery();
            }
        }
        
        async function getAIAnalysis() {
            try {
                const response = await fetch('/api/ai/analysis', {
                    headers: { 'Authorization': 'Bearer ' + authToken }
                });
                const analysis = await response.json();
                addAIMessage('ai', analysis);
            } catch (error) {
                addAIMessage('ai', 'Error getting analysis.');
            }
        }
        
        async function getAISuggestions() {
            try {
                const response = await fetch('/api/ai/suggestions', {
                    headers: { 'Authorization': 'Bearer ' + authToken }
                });
                const suggestions = await response.json();
                addAIMessage('ai', suggestions);
            } catch (error) {
                addAIMessage('ai', 'Error getting suggestions.');
            }
        }
        
        async function checkLowStock() {
            try {
                const response = await fetch('/api/ai/chat', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + authToken
                    },
                    body: JSON.stringify({ query: 'check low stock' })
                });
                const data = await response.json();
                addAIMessage('ai', data.response);
            } catch (error) {
                addAIMessage('ai', 'Error checking low stock.');
            }
        }
        
        // Check saved token
        const savedToken = localStorage.getItem('token');
        if (savedToken) {
            authToken = savedToken;
            showDashboard();
        }
    </script>
</body>
</html>`);
});

// Start server
app.listen(PORT, () => {
  console.log(`
🏕️  COMPACT INVENTORY SYSTEM
✅ Server: http://localhost:${PORT}
🔐 Login: admin@camp.com / camp2025
💡 Features: Quick updates, filters, export
  `);
});
