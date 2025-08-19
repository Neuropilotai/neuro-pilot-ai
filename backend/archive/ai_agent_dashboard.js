require("dotenv").config();
const express = require("express");
const fs = require("fs").promises;
const path = require("path");

class AIAgentDashboard {
  constructor() {
    this.app = express();
    this.port = 3008;
    this.setupMiddleware();
    this.setupRoutes();

    // Agent learning data
    this.agentLearningData = {
      agent1_analyzer: {
        name: "Market Analyzer Agent",
        stage: "Advanced Learning",
        progress: 87,
        status: "active",
        capabilities: [
          "Job Market Analysis",
          "Industry Trends",
          "Salary Benchmarking",
        ],
        currentTask: "Analyzing Executive Package Requirements",
        learnedSkills: 234,
        totalSkills: 300,
        lastActive: new Date(),
      },
      agent2_optimizer: {
        name: "ATS Optimizer Agent",
        stage: "Expert Level",
        progress: 94,
        status: "active",
        capabilities: [
          "ATS Optimization",
          "Keyword Extraction",
          "Format Compliance",
        ],
        currentTask: "Optimizing Resume Keywords",
        learnedSkills: 187,
        totalSkills: 200,
        lastActive: new Date(),
      },
      agent3_content: {
        name: "Content Creator Agent",
        stage: "Professional Level",
        progress: 78,
        status: "learning",
        capabilities: [
          "Professional Writing",
          "Achievement Crafting",
          "Industry Adaptation",
        ],
        currentTask: "Learning French Professional Writing",
        learnedSkills: 156,
        totalSkills: 250,
        lastActive: new Date(),
      },
      agent4_formatter: {
        name: "Design & Format Agent",
        stage: "Advanced Learning",
        progress: 82,
        status: "active",
        capabilities: [
          "Visual Design",
          "Template Optimization",
          "Multi-format Export",
        ],
        currentTask: "Preparing Executive Template",
        learnedSkills: 164,
        totalSkills: 220,
        lastActive: new Date(),
      },
    };

    // Coming soon features
    this.comingSoonFeatures = [
      {
        name: "AI Video Resume Generator",
        description: "Create personalized video resumes with AI avatars",
        eta: "Q2 2025",
        priority: "high",
        progress: 15,
      },
      {
        name: "Real-time Job Matching",
        description: "AI agents scan job boards and match with user profiles",
        eta: "Q1 2025",
        priority: "high",
        progress: 45,
      },
      {
        name: "LinkedIn Auto-Optimizer",
        description:
          "Automatically optimize LinkedIn profiles using AI insights",
        eta: "March 2025",
        priority: "medium",
        progress: 30,
      },
      {
        name: "Interview Preparation AI",
        description: "AI-powered mock interviews with real-time feedback",
        eta: "Q2 2025",
        priority: "high",
        progress: 8,
      },
      {
        name: "Salary Negotiation Assistant",
        description: "AI coach for salary negotiations with market data",
        eta: "Q3 2025",
        priority: "medium",
        progress: 5,
      },
      {
        name: "Multi-language Support",
        description:
          "Support for 10+ languages including Spanish, German, Italian",
        eta: "April 2025",
        priority: "medium",
        progress: 25,
      },
    ];
  }

  setupMiddleware() {
    this.app.use(express.json());
    this.app.use(express.static("public"));
  }

  setupRoutes() {
    // Main dashboard
    this.app.get("/", (req, res) => {
      res.send(this.getDashboardHTML());
    });

    // API endpoints
    this.app.get("/api/agents/status", (req, res) => {
      res.json(this.agentLearningData);
    });

    this.app.get("/api/coming-soon", (req, res) => {
      res.json(this.comingSoonFeatures);
    });

    this.app.get("/api/orders/active", async (req, res) => {
      try {
        const activeOrders = await this.getActiveOrders();
        res.json(activeOrders);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get("/api/system/stats", (req, res) => {
      res.json({
        totalOrders: 47,
        ordersToday: 3,
        activeAgents: 4,
        learningProgress: 85.25,
        uptime: "2h 34m",
        systemHealth: "excellent",
      });
    });
  }

  async getActiveOrders() {
    try {
      const ordersDir = path.join(__dirname, "orders");
      const files = await fs.readdir(ordersDir).catch(() => []);

      const activeOrders = [];
      for (const file of files) {
        if (file.startsWith("order_") && file.endsWith(".json")) {
          try {
            const orderPath = path.join(ordersDir, file);
            const orderData = JSON.parse(await fs.readFile(orderPath, "utf8"));

            if (
              orderData.status === "received" ||
              orderData.status === "processing"
            ) {
              activeOrders.push({
                orderId: orderData.orderId,
                email: orderData.email,
                packageType: orderData.packageType,
                status: orderData.status,
                timestamp: orderData.timestamp,
                processingStage: this.getProcessingStage(orderData),
              });
            }
          } catch (error) {
            console.error(`Error reading order file ${file}:`, error);
          }
        }
      }

      return activeOrders;
    } catch (error) {
      console.error("Error getting active orders:", error);
      return [];
    }
  }

  getProcessingStage(orderData) {
    const stages = [
      "Order Received",
      "Market Analysis",
      "Keyword Optimization",
      "Content Creation",
      "Design & Formatting",
      "Quality Review",
      "Email Delivery",
    ];

    // Simulate processing stage based on order age
    const orderAge = Date.now() - new Date(orderData.timestamp).getTime();
    const stageIndex = Math.min(
      Math.floor(orderAge / (30 * 1000)),
      stages.length - 1,
    );
    return stages[stageIndex];
  }

  getDashboardHTML() {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Agent Dashboard - Neuro.Pilot.AI</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Inter', sans-serif;
            background: linear-gradient(135deg, #0f1419 0%, #1a202c  50%, #2d3748 100%);
            color: white;
            min-height: 100vh;
        }
        
        .container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 20px;
        }
        
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 30px;
            padding: 20px;
            background: rgba(255,255,255,0.05);
            border-radius: 16px;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255,255,255,0.1);
        }
        
        .logo {
            display: flex;
            align-items: center;
            gap: 15px;
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
            font-weight: bold;
        }
        
        .title {
            font-size: 28px;
            font-weight: 800;
            background: linear-gradient(45deg, #667eea, #764ba2, #f093fb);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        
        .system-status {
            display: flex;
            gap: 20px;
            align-items: center;
        }
        
        .status-item {
            text-align: center;
        }
        
        .status-value {
            font-size: 20px;
            font-weight: 700;
            color: #48bb78;
        }
        
        .status-label {
            font-size: 12px;
            opacity: 0.7;
        }
        
        .grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 30px;
            margin-bottom: 30px;
        }
        
        .card {
            background: rgba(255,255,255,0.05);
            border-radius: 16px;
            padding: 25px;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255,255,255,0.1);
        }
        
        .card h3 {
            font-size: 20px;
            font-weight: 600;
            margin-bottom: 20px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .agent-card {
            margin-bottom: 20px;
            padding: 20px;
            background: rgba(255,255,255,0.03);
            border-radius: 12px;
            border: 1px solid rgba(255,255,255,0.05);
        }
        
        .agent-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
        }
        
        .agent-name {
            font-weight: 600;
            font-size: 16px;
        }
        
        .agent-status {
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 500;
        }
        
        .status-active {
            background: rgba(72, 187, 120, 0.2);
            color: #48bb78;
        }
        
        .status-learning {
            background: rgba(237, 137, 54, 0.2);
            color: #ed8936;
        }
        
        .progress-bar {
            width: 100%;
            height: 8px;
            background: rgba(255,255,255,0.1);
            border-radius: 4px;
            overflow: hidden;
            margin: 10px 0;
        }
        
        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #667eea, #764ba2);
            border-radius: 4px;
            transition: width 0.3s ease;
        }
        
        .agent-details {
            font-size: 14px;
            opacity: 0.8;
            margin-top: 10px;
        }
        
        .feature-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 15px;
            background: rgba(255,255,255,0.03);
            border-radius: 8px;
            margin-bottom: 10px;
            border-left: 3px solid #667eea;
        }
        
        .feature-info h4 {
            font-weight: 600;
            margin-bottom: 5px;
        }
        
        .feature-description {
            font-size: 14px;
            opacity: 0.7;
        }
        
        .feature-meta {
            text-align: right;
        }
        
        .feature-eta {
            font-weight: 600;
            color: #667eea;
        }
        
        .feature-progress {
            font-size: 12px;
            opacity: 0.7;
        }
        
        .order-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 15px;
            background: rgba(255,255,255,0.03);
            border-radius: 8px;
            margin-bottom: 10px;
        }
        
        .order-info {
            flex: 1;
        }
        
        .order-id {
            font-weight: 600;
            margin-bottom: 5px;
        }
        
        .order-details {
            font-size: 14px;
            opacity: 0.7;
        }
        
        .order-stage {
            text-align: right;
            font-weight: 500;
            color: #48bb78;
        }
        
        .refresh-btn {
            background: linear-gradient(45deg, #667eea, #764ba2);
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 500;
        }
        
        .refresh-btn:hover {
            opacity: 0.9;
        }
        
        .full-width {
            grid-column: 1 / -1;
        }
        
        @media (max-width: 768px) {
            .grid {
                grid-template-columns: 1fr;
            }
            
            .header {
                flex-direction: column;
                gap: 20px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">
                <div class="logo-icon">🤖</div>
                <div class="title">AI Agent Dashboard</div>
            </div>
            <div class="system-status" id="systemStatus">
                <div class="status-item">
                    <div class="status-value">4</div>
                    <div class="status-label">Active Agents</div>
                </div>
                <div class="status-item">
                    <div class="status-value">85%</div>
                    <div class="status-label">Learning Progress</div>
                </div>
                <div class="status-item">
                    <div class="status-value">3</div>
                    <div class="status-label">Orders Today</div>
                </div>
                <button class="refresh-btn" onclick="refreshData()">🔄 Refresh</button>
            </div>
        </div>
        
        <div class="grid">
            <div class="card">
                <h3>🤖 AI Agent Learning Progress</h3>
                <div id="agentList">
                    <!-- Agent cards will be populated here -->
                </div>
            </div>
            
            <div class="card">
                <h3>📋 Active Order Processing</h3>
                <div id="activeOrders">
                    <!-- Active orders will be populated here -->
                </div>
            </div>
        </div>
        
        <div class="grid">
            <div class="card full-width">
                <h3>🚀 Coming Soon Features</h3>
                <div id="comingSoonFeatures">
                    <!-- Coming soon features will be populated here -->
                </div>
            </div>
        </div>
    </div>

    <script>
        async function loadAgentData() {
            try {
                const response = await fetch('/api/agents/status');
                const agents = await response.json();
                
                const agentList = document.getElementById('agentList');
                agentList.innerHTML = '';
                
                Object.entries(agents).forEach(([id, agent]) => {
                    const agentCard = document.createElement('div');
                    agentCard.className = 'agent-card';
                    agentCard.innerHTML = \`
                        <div class="agent-header">
                            <div class="agent-name">\${agent.name}</div>
                            <div class="agent-status status-\${agent.status}">\${agent.status.toUpperCase()}</div>
                        </div>
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: \${agent.progress}%"></div>
                        </div>
                        <div class="agent-details">
                            <strong>Current Task:</strong> \${agent.currentTask}<br>
                            <strong>Learning Stage:</strong> \${agent.stage}<br>
                            <strong>Skills:</strong> \${agent.learnedSkills}/\${agent.totalSkills}
                        </div>
                    \`;
                    agentList.appendChild(agentCard);
                });
            } catch (error) {
                console.error('Error loading agent data:', error);
            }
        }
        
        async function loadActiveOrders() {
            try {
                const response = await fetch('/api/orders/active');
                const orders = await response.json();
                
                const activeOrders = document.getElementById('activeOrders');
                activeOrders.innerHTML = '';
                
                if (orders.length === 0) {
                    activeOrders.innerHTML = '<div style="text-align: center; opacity: 0.5; padding: 20px;">No active orders at the moment</div>';
                    return;
                }
                
                orders.forEach(order => {
                    const orderItem = document.createElement('div');
                    orderItem.className = 'order-item';
                    orderItem.innerHTML = \`
                        <div class="order-info">
                            <div class="order-id">\${order.orderId}</div>
                            <div class="order-details">\${order.packageType} • \${order.email}</div>
                        </div>
                        <div class="order-stage">\${order.processingStage}</div>
                    \`;
                    activeOrders.appendChild(orderItem);
                });
            } catch (error) {
                console.error('Error loading active orders:', error);
            }
        }
        
        async function loadComingSoonFeatures() {
            try {
                const response = await fetch('/api/coming-soon');
                const features = await response.json();
                
                const featuresContainer = document.getElementById('comingSoonFeatures');
                featuresContainer.innerHTML = '';
                
                features.forEach(feature => {
                    const featureItem = document.createElement('div');
                    featureItem.className = 'feature-item';
                    featureItem.innerHTML = \`
                        <div class="feature-info">
                            <h4>\${feature.name}</h4>
                            <div class="feature-description">\${feature.description}</div>
                        </div>
                        <div class="feature-meta">
                            <div class="feature-eta">\${feature.eta}</div>
                            <div class="feature-progress">\${feature.progress}% complete</div>
                        </div>
                    \`;
                    featuresContainer.appendChild(featureItem);
                });
            } catch (error) {
                console.error('Error loading coming soon features:', error);
            }
        }
        
        async function refreshData() {
            await Promise.all([
                loadAgentData(),
                loadActiveOrders(),
                loadComingSoonFeatures()
            ]);
            
            // Update system status
            try {
                const response = await fetch('/api/system/stats');
                const stats = await response.json();
                // You could update the header stats here
            } catch (error) {
                console.error('Error loading system stats:', error);
            }
        }
        
        // Initial load
        refreshData();
        
        // Auto-refresh every 30 seconds
        setInterval(refreshData, 30000);
    </script>
</body>
</html>
        `;
  }

  start() {
    this.app.listen(this.port, () => {
      console.log(
        `🚀 AI Agent Dashboard running at http://localhost:${this.port}`,
      );
      console.log(`📊 Monitor your AI agents and their learning progress`);
      console.log(`🔮 View coming soon features and development roadmap`);
    });
  }
}

// Start the dashboard
const dashboard = new AIAgentDashboard();
dashboard.start();

module.exports = AIAgentDashboard;
