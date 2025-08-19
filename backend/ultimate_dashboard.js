require("dotenv").config();
const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const { UserModel, getDb } = require("./db/database");
const os = require("os");

class UltimateDashboard {
  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.io = new Server(this.server, {
      cors: { origin: "*", methods: ["GET", "POST"] },
    });
    this.port = 3010;
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
    this.startMonitoring();
  }

  setupMiddleware() {
    this.app.use(express.json());
    this.app.use(express.static("public"));
  }

  setupRoutes() {
    this.app.get("/", (req, res) => {
      res.send(this.getUltimateDashboardHTML());
    });

    this.app.get("/api/ultimate/everything", async (req, res) => {
      try {
        const data = await this.getAllData();
        res.json(data);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get("/api/ultimate/health", async (req, res) => {
      try {
        const health = await this.getSystemHealth();
        res.json(health);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  }

  setupWebSocket() {
    this.io.on("connection", (socket) => {
      console.log("🎯 Ultimate Dashboard connected:", socket.id);

      // Send initial data immediately
      this.getAllData().then((data) => {
        socket.emit("dashboard_init", data);
      });

      socket.on("disconnect", () => {
        console.log("🎯 Ultimate Dashboard disconnected:", socket.id);
      });
    });
  }

  async startMonitoring() {
    // Ultra-fast updates every 1 second
    setInterval(async () => {
      try {
        const data = await this.getAllData();
        this.io.emit("live_update", data);
      } catch (error) {
        console.error("Monitor error:", error);
      }
    }, 1000);

    // Health check every 5 seconds
    setInterval(async () => {
      try {
        const health = await this.getSystemHealth();
        this.io.emit("health_update", health);
      } catch (error) {
        console.error("Health check error:", error);
      }
    }, 5000);
  }

  async getAllData() {
    const [stats, users, orders, agents, system, activity] = await Promise.all([
      this.getQuickStats(),
      this.getRecentUsers(),
      this.getRecentOrders(),
      this.getAgentStatus(),
      this.getSystemInfo(),
      this.getRecentActivity(),
    ]);

    return {
      timestamp: new Date().toISOString(),
      stats,
      users,
      orders,
      agents,
      system,
      activity,
    };
  }

  async getQuickStats() {
    const db = getDb();
    if (!db) return { users: 0, orders: 0, revenue: 0, sessions: 0 };

    const [users, orders, revenue, sessions] = await Promise.all([
      db.get("SELECT COUNT(*) as count FROM users"),
      db.get("SELECT COUNT(*) as count FROM resume_orders"),
      db.get(
        'SELECT SUM(price) as total FROM resume_orders WHERE status = "completed"',
      ),
      db.get(
        'SELECT COUNT(*) as count FROM user_sessions WHERE datetime(expiresAt) > datetime("now")',
      ),
    ]);

    return {
      users: users?.count || 0,
      orders: orders?.count || 0,
      revenue: revenue?.total || 0,
      sessions: sessions?.count || 0,
    };
  }

  async getRecentUsers() {
    const db = getDb();
    if (!db) return [];

    return await db.all(`
            SELECT id, email, firstName, lastName, createdAt
            FROM users 
            ORDER BY createdAt DESC 
            LIMIT 10
        `);
  }

  async getRecentOrders() {
    const db = getDb();
    if (!db) return [];

    return await db.all(`
            SELECT ro.*, u.email as userEmail
            FROM resume_orders ro
            LEFT JOIN users u ON ro.userId = u.id
            ORDER BY ro.createdAt DESC
            LIMIT 10
        `);
  }

  async getAgentStatus() {
    try {
      const response = await fetch("http://localhost:8000/api/agents/status");
      if (response.ok) {
        const data = await response.json();
        return Object.keys(data).map((key) => ({
          name: key,
          status: data[key]?.status || "unknown",
          isRunning: data[key]?.is_running || false,
          performance: data[key]?.performance || {},
        }));
      }
      return [];
    } catch (error) {
      return [];
    }
  }

  async getSystemInfo() {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    return {
      uptime: Math.floor(process.uptime()),
      memory: {
        used: Math.round(memUsage.heapUsed / 1024 / 1024),
        total: Math.round(memUsage.heapTotal / 1024 / 1024),
        rss: Math.round(memUsage.rss / 1024 / 1024),
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system,
      },
      loadAverage: os.loadavg(),
      platform: os.platform(),
      arch: os.arch(),
      nodeVersion: process.version,
    };
  }

  async getRecentActivity() {
    const db = getDb();
    if (!db) return [];

    const activities = [];

    // Recent users
    const recentUsers = await db.all(`
            SELECT 'user' as type, email as description, createdAt as timestamp
            FROM users 
            WHERE datetime(createdAt) > datetime('now', '-1 hour')
            ORDER BY createdAt DESC 
            LIMIT 5
        `);

    // Recent orders
    const recentOrders = await db.all(`
            SELECT 'order' as type, 
                   (package || ' package - $' || price) as description, 
                   createdAt as timestamp
            FROM resume_orders 
            WHERE datetime(createdAt) > datetime('now', '-1 hour')
            ORDER BY createdAt DESC 
            LIMIT 5
        `);

    return [...recentUsers, ...recentOrders]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 10);
  }

  async getSystemHealth() {
    const memUsage = process.memoryUsage();
    const loadAvg = os.loadavg();

    const health = {
      status: "healthy",
      score: 100,
      issues: [],
      components: {
        database: "healthy",
        backend: "unknown",
        memory: "healthy",
        cpu: "healthy",
      },
    };

    // Check memory
    const memPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
    if (memPercent > 85) {
      health.issues.push("High memory usage");
      health.components.memory = "warning";
      health.score -= 15;
    }

    // Check CPU load
    if (loadAvg[0] > os.cpus().length) {
      health.issues.push("High CPU load");
      health.components.cpu = "critical";
      health.score -= 20;
    }

    // Check backend
    try {
      const response = await fetch("http://localhost:8000/api/agents/status");
      if (response.ok) {
        health.components.backend = "healthy";
      } else {
        health.components.backend = "error";
        health.issues.push("Backend not responding");
        health.score -= 25;
      }
    } catch (error) {
      health.components.backend = "offline";
      health.issues.push("Backend offline");
      health.score -= 30;
    }

    // Check database
    try {
      const db = getDb();
      if (db) {
        await db.get("SELECT 1");
        health.components.database = "healthy";
      } else {
        health.components.database = "error";
        health.issues.push("Database connection failed");
        health.score -= 25;
      }
    } catch (error) {
      health.components.database = "error";
      health.issues.push("Database error");
      health.score -= 25;
    }

    // Set overall status
    if (health.score < 70) {
      health.status = "critical";
    } else if (health.score < 85) {
      health.status = "warning";
    }

    return health;
  }

  getUltimateDashboardHTML() {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🚀 Ultimate Dashboard - Neuro.Pilot.AI</title>
    <script src="/socket.io/socket.io.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: #fff;
            min-height: 100vh;
            overflow-x: hidden;
        }

        .header {
            background: rgba(0, 0, 0, 0.3);
            backdrop-filter: blur(20px);
            padding: 20px;
            text-align: center;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .header h1 {
            font-size: 2.5rem;
            font-weight: 700;
            margin-bottom: 10px;
            background: linear-gradient(45deg, #ff6b6b, #4ecdc4, #45b7d1);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            animation: gradient 3s ease-in-out infinite;
            background-size: 300% 300%;
        }

        @keyframes gradient {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
        }

        .status-bar {
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 20px;
            margin-top: 15px;
            flex-wrap: wrap;
        }

        .status-item {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 16px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 20px;
            backdrop-filter: blur(10px);
        }

        .status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            animation: pulse 2s infinite;
        }

        .status-dot.online { background: #00ff88; }
        .status-dot.offline { background: #ff4757; }
        .status-dot.warning { background: #ffa502; }

        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.6; }
        }

        .main-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            padding: 20px;
            max-width: 1400px;
            margin: 0 auto;
        }

        .card {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(20px);
            border-radius: 20px;
            padding: 25px;
            border: 1px solid rgba(255, 255, 255, 0.2);
            transition: all 0.3s ease;
            position: relative;
            overflow: hidden;
        }

        .card::before {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 2px;
            background: linear-gradient(90deg, transparent, #00ff88, transparent);
            animation: scan 3s infinite;
        }

        @keyframes scan {
            0% { left: -100%; }
            100% { left: 100%; }
        }

        .card:hover {
            transform: translateY(-5px);
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
        }

        .card-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
        }

        .card-title {
            font-size: 1.2rem;
            font-weight: 600;
            color: #fff;
        }

        .card-badge {
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 0.8rem;
            font-weight: 600;
            background: rgba(0, 255, 136, 0.2);
            color: #00ff88;
        }

        .big-metric {
            text-align: center;
            margin: 20px 0;
        }

        .big-number {
            font-size: 3rem;
            font-weight: 700;
            color: #00ff88;
            margin-bottom: 5px;
            font-family: 'SF Mono', monospace;
        }

        .big-label {
            font-size: 0.9rem;
            color: rgba(255, 255, 255, 0.7);
            text-transform: uppercase;
            letter-spacing: 1px;
        }

        .metric-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 15px;
        }

        .metric-item {
            text-align: center;
            padding: 15px;
            background: rgba(0, 0, 0, 0.2);
            border-radius: 12px;
        }

        .metric-value {
            font-size: 1.5rem;
            font-weight: 600;
            color: #4ecdc4;
            margin-bottom: 5px;
        }

        .metric-label {
            font-size: 0.8rem;
            color: rgba(255, 255, 255, 0.6);
        }

        .list-container {
            max-height: 300px;
            overflow-y: auto;
        }

        .list-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px;
            margin: 8px 0;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 10px;
            border-left: 3px solid #4ecdc4;
            transition: all 0.2s ease;
        }

        .list-item:hover {
            background: rgba(255, 255, 255, 0.1);
            transform: translateX(5px);
        }

        .item-main {
            flex: 1;
        }

        .item-title {
            font-weight: 600;
            color: #fff;
            margin-bottom: 2px;
        }

        .item-subtitle {
            font-size: 0.8rem;
            color: rgba(255, 255, 255, 0.6);
        }

        .item-meta {
            text-align: right;
            font-size: 0.8rem;
            color: rgba(255, 255, 255, 0.5);
        }

        .agent-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
        }

        .agent-card {
            padding: 15px;
            background: rgba(0, 0, 0, 0.2);
            border-radius: 12px;
            text-align: center;
            border: 2px solid transparent;
            transition: all 0.3s ease;
        }

        .agent-card.online {
            border-color: #00ff88;
            box-shadow: 0 0 20px rgba(0, 255, 136, 0.3);
        }

        .agent-card.offline {
            border-color: #ff4757;
            box-shadow: 0 0 20px rgba(255, 71, 87, 0.3);
        }

        .agent-name {
            font-weight: 600;
            margin-bottom: 8px;
            text-transform: capitalize;
        }

        .agent-status {
            font-size: 0.8rem;
            padding: 4px 8px;
            border-radius: 8px;
            font-weight: 600;
        }

        .agent-status.online {
            background: rgba(0, 255, 136, 0.2);
            color: #00ff88;
        }

        .agent-status.offline {
            background: rgba(255, 71, 87, 0.2);
            color: #ff4757;
        }

        .activity-item {
            display: flex;
            align-items: center;
            padding: 10px;
            margin: 6px 0;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 8px;
            border-left: 3px solid #ffa502;
        }

        .activity-icon {
            width: 32px;
            height: 32px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-right: 12px;
            font-size: 14px;
        }

        .activity-icon.user { background: #4ecdc4; }
        .activity-icon.order { background: #ffa502; }

        .activity-content {
            flex: 1;
        }

        .activity-desc {
            font-size: 0.9rem;
            color: #fff;
            margin-bottom: 2px;
        }

        .activity-time {
            font-size: 0.7rem;
            color: rgba(255, 255, 255, 0.5);
        }

        .system-health {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 10px;
        }

        .health-item {
            text-align: center;
            padding: 12px;
            background: rgba(0, 0, 0, 0.2);
            border-radius: 10px;
            border: 2px solid transparent;
        }

        .health-item.healthy { border-color: #00ff88; }
        .health-item.warning { border-color: #ffa502; }
        .health-item.critical { border-color: #ff4757; }

        .health-value {
            font-size: 1.2rem;
            font-weight: 600;
            margin-bottom: 4px;
        }

        .health-label {
            font-size: 0.8rem;
            color: rgba(255, 255, 255, 0.6);
        }

        .full-width { grid-column: 1 / -1; }

        .timestamp {
            position: fixed;
            top: 20px;
            right: 20px;
            font-family: 'SF Mono', monospace;
            font-size: 0.9rem;
            color: rgba(255, 255, 255, 0.7);
            background: rgba(0, 0, 0, 0.3);
            padding: 8px 12px;
            border-radius: 20px;
            backdrop-filter: blur(10px);
        }

        @media (max-width: 768px) {
            .main-grid {
                grid-template-columns: 1fr;
                padding: 15px;
            }
            
            .header h1 {
                font-size: 2rem;
            }
            
            .status-bar {
                flex-direction: column;
                gap: 10px;
            }
        }
    </style>
</head>
<body>
    <div class="timestamp" id="timestamp">Loading...</div>

    <div class="header">
        <h1>🚀 Ultimate Dashboard</h1>
        <p>Real-time monitoring and control for Neuro.Pilot.AI</p>
        <div class="status-bar" id="statusBar">
            <div class="status-item">
                <div class="status-dot online"></div>
                <span>System Online</span>
            </div>
            <div class="status-item">
                <div class="status-dot" id="dbStatus"></div>
                <span>Database</span>
            </div>
            <div class="status-item">
                <div class="status-dot" id="backendStatus"></div>
                <span>Backend</span>
            </div>
            <div class="status-item">
                <div class="status-dot online"></div>
                <span>Live Updates</span>
            </div>
        </div>
    </div>

    <div class="main-grid">
        <!-- Quick Stats -->
        <div class="card">
            <div class="card-header">
                <div class="card-title">👥 Users</div>
                <div class="card-badge">LIVE</div>
            </div>
            <div class="big-metric">
                <div class="big-number" id="totalUsers">0</div>
                <div class="big-label">Total Users</div>
            </div>
            <div class="metric-grid">
                <div class="metric-item">
                    <div class="metric-value" id="activeUsers">0</div>
                    <div class="metric-label">Active</div>
                </div>
                <div class="metric-item">
                    <div class="metric-value" id="newUsers">+0</div>
                    <div class="metric-label">Today</div>
                </div>
            </div>
        </div>

        <div class="card">
            <div class="card-header">
                <div class="card-title">📦 Orders</div>
                <div class="card-badge">LIVE</div>
            </div>
            <div class="big-metric">
                <div class="big-number" id="totalOrders">0</div>
                <div class="big-label">Total Orders</div>
            </div>
            <div class="metric-grid">
                <div class="metric-item">
                    <div class="metric-value" id="todayOrders">0</div>
                    <div class="metric-label">Today</div>
                </div>
                <div class="metric-item">
                    <div class="metric-value" id="conversionRate">0%</div>
                    <div class="metric-label">Conversion</div>
                </div>
            </div>
        </div>

        <div class="card">
            <div class="card-header">
                <div class="card-title">💰 Revenue</div>
                <div class="card-badge">LIVE</div>
            </div>
            <div class="big-metric">
                <div class="big-number" id="totalRevenue">$0</div>
                <div class="big-label">Total Revenue</div>
            </div>
            <div class="metric-grid">
                <div class="metric-item">
                    <div class="metric-value" id="avgOrder">$0</div>
                    <div class="metric-label">Avg Order</div>
                </div>
                <div class="metric-item">
                    <div class="metric-value" id="todayRevenue">$0</div>
                    <div class="metric-label">Today</div>
                </div>
            </div>
        </div>

        <div class="card">
            <div class="card-header">
                <div class="card-title">⚡ System</div>
                <div class="card-badge">LIVE</div>
            </div>
            <div class="system-health" id="systemHealth">
                <div class="health-item healthy">
                    <div class="health-value" id="memoryUsage">0MB</div>
                    <div class="health-label">Memory</div>
                </div>
                <div class="health-item healthy">
                    <div class="health-value" id="uptime">0m</div>
                    <div class="health-label">Uptime</div>
                </div>
                <div class="health-item healthy">
                    <div class="health-value" id="cpuLoad">0.0</div>
                    <div class="health-label">CPU Load</div>
                </div>
                <div class="health-item healthy">
                    <div class="health-value" id="activeSessions">0</div>
                    <div class="health-label">Sessions</div>
                </div>
            </div>
        </div>

        <!-- AI Agents -->
        <div class="card">
            <div class="card-header">
                <div class="card-title">🤖 AI Agents</div>
                <div class="card-badge">LIVE</div>
            </div>
            <div class="agent-grid" id="agentGrid">
                <div class="agent-card">
                    <div class="agent-name">Loading...</div>
                    <div class="agent-status">Checking...</div>
                </div>
            </div>
        </div>

        <!-- Recent Users -->
        <div class="card">
            <div class="card-header">
                <div class="card-title">👥 Recent Users</div>
                <div class="card-badge">LIVE</div>
            </div>
            <div class="list-container" id="usersList">
                <div class="list-item">
                    <div class="item-main">
                        <div class="item-title">Loading users...</div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Recent Orders -->
        <div class="card">
            <div class="card-header">
                <div class="card-title">📦 Recent Orders</div>
                <div class="card-badge">LIVE</div>
            </div>
            <div class="list-container" id="ordersList">
                <div class="list-item">
                    <div class="item-main">
                        <div class="item-title">Loading orders...</div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Activity Feed -->
        <div class="card full-width">
            <div class="card-header">
                <div class="card-title">📊 Live Activity Feed</div>
                <div class="card-badge">LIVE</div>
            </div>
            <div class="list-container" id="activityFeed">
                <div class="activity-item">
                    <div class="activity-icon user">👤</div>
                    <div class="activity-content">
                        <div class="activity-desc">Dashboard initialized</div>
                        <div class="activity-time">Just now</div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script>
        const socket = io();
        let isConnected = false;

        // Update timestamp
        function updateTimestamp() {
            document.getElementById('timestamp').textContent = new Date().toLocaleString();
        }
        setInterval(updateTimestamp, 1000);
        updateTimestamp();

        // Socket events
        socket.on('connect', () => {
            console.log('🚀 Connected to Ultimate Dashboard');
            isConnected = true;
            updateConnectionStatus();
        });

        socket.on('disconnect', () => {
            console.log('❌ Disconnected from Ultimate Dashboard');
            isConnected = false;
            updateConnectionStatus();
        });

        socket.on('dashboard_init', (data) => {
            console.log('📊 Initial data received');
            updateDashboard(data);
        });

        socket.on('live_update', (data) => {
            updateDashboard(data);
        });

        socket.on('health_update', (health) => {
            updateHealthStatus(health);
        });

        function updateConnectionStatus() {
            const statusBar = document.getElementById('statusBar');
            if (isConnected) {
                statusBar.style.borderColor = '#00ff88';
            } else {
                statusBar.style.borderColor = '#ff4757';
            }
        }

        function updateDashboard(data) {
            if (!data) return;

            // Update stats
            document.getElementById('totalUsers').textContent = data.stats.users || 0;
            document.getElementById('totalOrders').textContent = data.stats.orders || 0;
            document.getElementById('totalRevenue').textContent = '$' + (data.stats.revenue || 0).toLocaleString();
            document.getElementById('activeSessions').textContent = data.stats.sessions || 0;

            // Calculate additional metrics
            const avgOrder = data.stats.orders > 0 ? (data.stats.revenue / data.stats.orders) : 0;
            document.getElementById('avgOrder').textContent = '$' + avgOrder.toFixed(0);

            // Update system info
            if (data.system) {
                document.getElementById('memoryUsage').textContent = data.system.memory.used + 'MB';
                document.getElementById('uptime').textContent = Math.floor(data.system.uptime / 60) + 'm';
                document.getElementById('cpuLoad').textContent = data.system.loadAverage[0].toFixed(1);
            }

            // Update agents
            updateAgents(data.agents || []);

            // Update lists
            updateUsersList(data.users || []);
            updateOrdersList(data.orders || []);
            updateActivityFeed(data.activity || []);
        }

        function updateAgents(agents) {
            const grid = document.getElementById('agentGrid');
            if (!agents.length) {
                grid.innerHTML = '<div class="agent-card"><div class="agent-name">No agents</div></div>';
                return;
            }

            const html = agents.map(agent => \`
                <div class="agent-card \${agent.status}">
                    <div class="agent-name">\${agent.name}</div>
                    <div class="agent-status \${agent.status}">\${agent.status.toUpperCase()}</div>
                </div>
            \`).join('');
            
            grid.innerHTML = html;
        }

        function updateUsersList(users) {
            const list = document.getElementById('usersList');
            if (!users.length) {
                list.innerHTML = '<div class="list-item"><div class="item-main"><div class="item-title">No users yet</div></div></div>';
                return;
            }

            const html = users.slice(0, 5).map(user => \`
                <div class="list-item">
                    <div class="item-main">
                        <div class="item-title">\${user.firstName || 'Unknown'} \${user.lastName || ''}</div>
                        <div class="item-subtitle">\${user.email}</div>
                    </div>
                    <div class="item-meta">\${new Date(user.createdAt).toLocaleDateString()}</div>
                </div>
            \`).join('');
            
            list.innerHTML = html;
        }

        function updateOrdersList(orders) {
            const list = document.getElementById('ordersList');
            if (!orders.length) {
                list.innerHTML = '<div class="list-item"><div class="item-main"><div class="item-title">No orders yet</div></div></div>';
                return;
            }

            const html = orders.slice(0, 5).map(order => \`
                <div class="list-item">
                    <div class="item-main">
                        <div class="item-title">\${order.package} Package</div>
                        <div class="item-subtitle">\${order.userEmail || 'Guest'}</div>
                    </div>
                    <div class="item-meta">
                        $\${order.price}<br>
                        \${new Date(order.createdAt).toLocaleDateString()}
                    </div>
                </div>
            \`).join('');
            
            list.innerHTML = html;
        }

        function updateActivityFeed(activities) {
            const feed = document.getElementById('activityFeed');
            if (!activities.length) {
                feed.innerHTML = '<div class="activity-item"><div class="activity-icon user">📊</div><div class="activity-content"><div class="activity-desc">No recent activity</div><div class="activity-time">-</div></div></div>';
                return;
            }

            const html = activities.map(activity => \`
                <div class="activity-item">
                    <div class="activity-icon \${activity.type}">
                        \${activity.type === 'user' ? '👤' : '📦'}
                    </div>
                    <div class="activity-content">
                        <div class="activity-desc">\${activity.description}</div>
                        <div class="activity-time">\${new Date(activity.timestamp).toLocaleTimeString()}</div>
                    </div>
                </div>
            \`).join('');
            
            feed.innerHTML = html;
        }

        function updateHealthStatus(health) {
            const dbStatus = document.getElementById('dbStatus');
            const backendStatus = document.getElementById('backendStatus');
            
            // Update database status
            dbStatus.className = 'status-dot ' + (health.components.database === 'healthy' ? 'online' : 'offline');
            
            // Update backend status
            backendStatus.className = 'status-dot ' + (health.components.backend === 'healthy' ? 'online' : 'offline');
        }

        // Load initial data
        fetch('/api/ultimate/everything')
            .then(r => r.json())
            .then(data => {
                updateDashboard(data);
                console.log('✅ Initial data loaded');
            })
            .catch(error => {
                console.error('❌ Error loading data:', error);
            });
    </script>
</body>
</html>
        `;
  }

  start() {
    this.server.listen(this.port, () => {
      console.log(`🚀 Ultimate Dashboard started on port ${this.port}`);
      console.log(`📊 Ultimate Dashboard URL: http://localhost:${this.port}`);
      console.log(`🎯 The best dashboard with everything you need!`);
    });
  }
}

// Start the ultimate dashboard
if (require.main === module) {
  const dashboard = new UltimateDashboard();
  dashboard.start();
}

module.exports = UltimateDashboard;
