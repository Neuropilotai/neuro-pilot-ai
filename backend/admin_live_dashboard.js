require("dotenv").config();
const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const { UserModel, getDb } = require("./db/database");
const fs = require("fs").promises;
const os = require("os");

class AdminLiveDashboard {
  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.io = new Server(this.server, {
      cors: { origin: "*", methods: ["GET", "POST"] },
    });
    this.port = 3009;
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
      res.send(this.getAdminDashboardHTML());
    });

    this.app.get("/api/admin/everything", async (req, res) => {
      try {
        const data = await this.getAllData();
        res.json(data);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  }

  setupWebSocket() {
    this.io.on("connection", (socket) => {
      console.log("🔴 Admin Dashboard connected:", socket.id);

      socket.on("disconnect", () => {
        console.log("🔴 Admin Dashboard disconnected:", socket.id);
      });
    });
  }

  async startMonitoring() {
    // Comprehensive monitoring every 1 second
    setInterval(async () => {
      try {
        const allData = await this.getAllData();
        this.io.emit("live_update", allData);
      } catch (error) {
        console.error("Monitor error:", error);
      }
    }, 1000);
  }

  async getAllData() {
    const [
      userStats,
      orderStats,
      revenueStats,
      systemStats,
      recentActivity,
      backendStatus,
    ] = await Promise.all([
      this.getUserStats(),
      this.getOrderStats(),
      this.getRevenueStats(),
      this.getSystemStats(),
      this.getRecentActivity(),
      this.getBackendStatus(),
    ]);

    return {
      timestamp: new Date().toISOString(),
      users: userStats,
      orders: orderStats,
      revenue: revenueStats,
      system: systemStats,
      activity: recentActivity,
      backend: backendStatus,
    };
  }

  async getUserStats() {
    const db = getDb();
    if (!db) return { total: 0, today: 0, active: 0 };

    const total = await db.get("SELECT COUNT(*) as count FROM users");
    const today = await db.get(
      `SELECT COUNT(*) as count FROM users WHERE date(createdAt) = date('now')`,
    );
    const active = await db.get(
      `SELECT COUNT(*) as count FROM user_sessions WHERE datetime(expiresAt) > datetime('now')`,
    );

    return {
      total: total?.count || 0,
      today: today?.count || 0,
      active: active?.count || 0,
    };
  }

  async getOrderStats() {
    const db = getDb();
    if (!db) return { total: 0, completed: 0, pending: 0, today: 0 };

    const total = await db.get("SELECT COUNT(*) as count FROM resume_orders");
    const completed = await db.get(
      'SELECT COUNT(*) as count FROM resume_orders WHERE status = "completed"',
    );
    const pending = await db.get(
      'SELECT COUNT(*) as count FROM resume_orders WHERE status = "pending"',
    );
    const today = await db.get(
      `SELECT COUNT(*) as count FROM resume_orders WHERE date(createdAt) = date('now')`,
    );

    return {
      total: total?.count || 0,
      completed: completed?.count || 0,
      pending: pending?.count || 0,
      today: today?.count || 0,
      conversionRate:
        total?.count > 0
          ? ((completed?.count / total?.count) * 100).toFixed(1)
          : 0,
    };
  }

  async getRevenueStats() {
    const db = getDb();
    if (!db) return { total: 0, today: 0, thisWeek: 0, thisMonth: 0 };

    const total = await db.get(
      'SELECT SUM(price) as total FROM resume_orders WHERE status = "completed"',
    );
    const today = await db.get(
      `SELECT SUM(price) as total FROM resume_orders WHERE status = "completed" AND date(createdAt) = date('now')`,
    );
    const thisWeek = await db.get(
      `SELECT SUM(price) as total FROM resume_orders WHERE status = "completed" AND date(createdAt) >= date('now', '-7 days')`,
    );
    const thisMonth = await db.get(
      `SELECT SUM(price) as total FROM resume_orders WHERE status = "completed" AND date(createdAt) >= date('now', '-30 days')`,
    );

    return {
      total: total?.total || 0,
      today: today?.total || 0,
      thisWeek: thisWeek?.total || 0,
      thisMonth: thisMonth?.total || 0,
    };
  }

  async getSystemStats() {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    return {
      uptime: process.uptime(),
      memory: {
        used: Math.round(memUsage.heapUsed / 1024 / 1024),
        total: Math.round(memUsage.heapTotal / 1024 / 1024),
        rss: Math.round(memUsage.rss / 1024 / 1024),
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system,
      },
      platform: os.platform(),
      arch: os.arch(),
      loadAverage: os.loadavg(),
      totalMemory: Math.round(os.totalmem() / 1024 / 1024 / 1024),
      freeMemory: Math.round(os.freemem() / 1024 / 1024 / 1024),
    };
  }

  async getRecentActivity() {
    const db = getDb();
    if (!db) return [];

    const recentUsers = await db.all(`
            SELECT 'user_registration' as type, email as description, createdAt as timestamp
            FROM users 
            ORDER BY createdAt DESC 
            LIMIT 5
        `);

    const recentOrders = await db.all(`
            SELECT 'order' as type, 
                   ('Order ' || package || ' - $' || price) as description, 
                   createdAt as timestamp
            FROM resume_orders 
            ORDER BY createdAt DESC 
            LIMIT 5
        `);

    return [...recentUsers, ...recentOrders]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 10);
  }

  async getBackendStatus() {
    try {
      const response = await fetch("http://localhost:8000/api/agents/status");
      if (response.ok) {
        const data = await response.json();
        // The agents data is directly in the response, not nested under 'agents'
        const agents = {};
        Object.keys(data).forEach((key) => {
          if (data[key] && data[key].status) {
            agents[key] = data[key].status;
          }
        });

        return {
          status: "online",
          agents: agents,
          lastCheck: new Date().toISOString(),
        };
      }
      return { status: "offline", lastCheck: new Date().toISOString() };
    } catch (error) {
      return {
        status: "error",
        error: error.message,
        lastCheck: new Date().toISOString(),
      };
    }
  }

  getAdminDashboardHTML() {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🔴 ADMIN LIVE CONTROL PANEL</title>
    <script src="/socket.io/socket.io.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body {
            font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif;
            background: #000;
            color: #fff;
            overflow-x: hidden;
        }

        .top-bar {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            height: 60px;
            background: linear-gradient(90deg, #ff0000, #ff4500, #ff0000);
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 30px;
            z-index: 1000;
            animation: glow 2s ease-in-out infinite alternate;
        }

        @keyframes glow {
            from { box-shadow: 0 0 10px #ff0000; }
            to { box-shadow: 0 0 30px #ff0000, 0 0 50px #ff0000; }
        }

        .live-status {
            display: flex;
            align-items: center;
            gap: 15px;
            font-weight: bold;
            font-size: 1.2rem;
        }

        .live-dot {
            width: 12px;
            height: 12px;
            background: #fff;
            border-radius: 50%;
            animation: pulse 1s infinite;
        }

        @keyframes pulse {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.5); opacity: 0.7; }
        }

        .timestamp {
            font-family: 'Monaco', monospace;
            font-size: 0.9rem;
        }

        .main-grid {
            margin-top: 60px;
            padding: 20px;
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 15px;
            min-height: calc(100vh - 60px);
        }

        .panel {
            background: linear-gradient(135deg, #1a1a1a, #2a2a2a);
            border: 1px solid #333;
            border-radius: 10px;
            padding: 20px;
            position: relative;
            overflow: hidden;
        }

        .panel::before {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 2px;
            background: linear-gradient(90deg, transparent, #00ff00, transparent);
            animation: scan 3s infinite;
        }

        @keyframes scan {
            0% { left: -100%; }
            100% { left: 100%; }
        }

        .panel-title {
            font-size: 1.1rem;
            font-weight: bold;
            margin-bottom: 15px;
            color: #00ff00;
            text-transform: uppercase;
            letter-spacing: 1px;
        }

        .metric {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin: 10px 0;
            padding: 8px 0;
            border-bottom: 1px solid #333;
        }

        .metric-label {
            color: #ccc;
            font-size: 0.9rem;
        }

        .metric-value {
            font-weight: bold;
            font-size: 1.1rem;
            color: #00ff00;
            font-family: 'Monaco', monospace;
        }

        .big-number {
            font-size: 2.5rem;
            font-weight: bold;
            text-align: center;
            margin: 10px 0;
            color: #ff4500;
            text-shadow: 0 0 10px currentColor;
            font-family: 'Monaco', monospace;
        }

        .activity-feed {
            max-height: 300px;
            overflow-y: auto;
        }

        .activity-item {
            display: flex;
            align-items: center;
            padding: 8px;
            margin: 5px 0;
            background: rgba(0, 255, 0, 0.1);
            border-left: 3px solid #00ff00;
            border-radius: 5px;
            font-size: 0.85rem;
        }

        .activity-type {
            width: 60px;
            font-weight: bold;
            text-transform: uppercase;
            font-size: 0.7rem;
        }

        .activity-desc {
            flex: 1;
            margin: 0 10px;
        }

        .activity-time {
            color: #888;
            font-family: 'Monaco', monospace;
            font-size: 0.7rem;
        }

        .status-online { color: #00ff00; }
        .status-offline { color: #ff0000; }
        .status-warning { color: #ff4500; }

        .chart-area {
            height: 200px;
            background: #111;
            border: 1px solid #333;
            border-radius: 5px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #666;
            margin-top: 10px;
        }

        .full-width { grid-column: 1 / -1; }
        .half-width { grid-column: span 2; }

        .system-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 10px;
        }

        .system-item {
            background: #1a1a1a;
            padding: 10px;
            border-radius: 5px;
            text-align: center;
            border: 1px solid #333;
        }

        .system-value {
            font-size: 1.2rem;
            font-weight: bold;
            color: #00ff00;
            margin-bottom: 5px;
        }

        .system-label {
            font-size: 0.8rem;
            color: #888;
        }

        .agents-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 10px;
        }

        .agent-item {
            background: #1a1a1a;
            padding: 15px;
            border-radius: 5px;
            border: 1px solid #333;
        }

        .agent-name {
            font-weight: bold;
            margin-bottom: 5px;
            color: #00ff00;
        }

        .agent-status {
            font-size: 0.8rem;
            padding: 2px 6px;
            border-radius: 10px;
            font-weight: bold;
        }

        .terminal {
            background: #000;
            color: #00ff00;
            font-family: 'Monaco', monospace;
            padding: 15px;
            border-radius: 5px;
            height: 200px;
            overflow-y: auto;
            border: 1px solid #333;
        }

        .terminal-line {
            margin: 2px 0;
            word-break: break-all;
        }

        .terminal-prompt {
            color: #ff4500;
        }

        @media (max-width: 1200px) {
            .main-grid { grid-template-columns: repeat(2, 1fr); }
        }

        @media (max-width: 768px) {
            .main-grid { grid-template-columns: 1fr; }
        }
    </style>
</head>
<body>
    <div class="top-bar">
        <div class="live-status">
            <div class="live-dot"></div>
            🔴 ADMIN LIVE CONTROL
        </div>
        <div class="timestamp" id="currentTime">--:--:--</div>
    </div>

    <div class="main-grid">
        <!-- Key Metrics -->
        <div class="panel">
            <div class="panel-title">👥 Users</div>
            <div class="big-number" id="totalUsers">0</div>
            <div class="metric">
                <span class="metric-label">Today</span>
                <span class="metric-value" id="todayUsers">0</span>
            </div>
            <div class="metric">
                <span class="metric-label">Active</span>
                <span class="metric-value" id="activeUsers">0</span>
            </div>
        </div>

        <div class="panel">
            <div class="panel-title">📦 Orders</div>
            <div class="big-number" id="totalOrders">0</div>
            <div class="metric">
                <span class="metric-label">Today</span>
                <span class="metric-value" id="todayOrders">0</span>
            </div>
            <div class="metric">
                <span class="metric-label">Conversion</span>
                <span class="metric-value" id="conversionRate">0%</span>
            </div>
        </div>

        <div class="panel">
            <div class="panel-title">💰 Revenue</div>
            <div class="big-number" id="totalRevenue">$0</div>
            <div class="metric">
                <span class="metric-label">Today</span>
                <span class="metric-value" id="todayRevenue">$0</span>
            </div>
            <div class="metric">
                <span class="metric-label">This Week</span>
                <span class="metric-value" id="weekRevenue">$0</span>
            </div>
        </div>

        <div class="panel">
            <div class="panel-title">⚡ Backend Status</div>
            <div class="metric">
                <span class="metric-label">Main Server</span>
                <span class="metric-value" id="backendStatus">Checking...</span>
            </div>
            <div class="metric">
                <span class="metric-label">Database</span>
                <span class="metric-value status-online">ONLINE</span>
            </div>
            <div class="metric">
                <span class="metric-label">Auth System</span>
                <span class="metric-value status-online">ONLINE</span>
            </div>
        </div>

        <!-- System Info -->
        <div class="panel half-width">
            <div class="panel-title">🖥️ System Performance</div>
            <div class="system-grid" id="systemGrid">
                <div class="system-item">
                    <div class="system-value" id="memoryUsed">0MB</div>
                    <div class="system-label">Memory</div>
                </div>
                <div class="system-item">
                    <div class="system-value" id="cpuLoad">0%</div>
                    <div class="system-label">CPU Load</div>
                </div>
                <div class="system-item">
                    <div class="system-value" id="uptime">0m</div>
                    <div class="system-label">Uptime</div>
                </div>
            </div>
        </div>

        <!-- AI Agents -->
        <div class="panel half-width">
            <div class="panel-title">🤖 AI Agents</div>
            <div class="agents-grid" id="agentsGrid">
                <div class="agent-item">
                    <div class="agent-name">Loading...</div>
                    <div class="agent-status">Checking status...</div>
                </div>
            </div>
        </div>

        <!-- Activity Feed -->
        <div class="panel full-width">
            <div class="panel-title">📊 Live Activity Feed</div>
            <div class="activity-feed" id="activityFeed">
                <div class="activity-item">
                    <span class="activity-type">SYS</span>
                    <span class="activity-desc">Monitoring started</span>
                    <span class="activity-time">now</span>
                </div>
            </div>
        </div>

        <!-- Live Terminal -->
        <div class="panel full-width">
            <div class="panel-title">💻 Live System Terminal</div>
            <div class="terminal" id="terminal">
                <div class="terminal-line">
                    <span class="terminal-prompt">admin@neuro-pilot-ai:~$</span> live monitoring started
                </div>
                <div class="terminal-line">System ready for real-time updates...</div>
            </div>
        </div>
    </div>

    <script>
        const socket = io();
        let lastData = null;

        // Update time
        function updateTime() {
            document.getElementById('currentTime').textContent = new Date().toLocaleTimeString();
        }
        setInterval(updateTime, 1000);
        updateTime();

        // Socket connection
        socket.on('connect', () => {
            addTerminalLine('🔗 Connected to live data stream');
        });

        socket.on('live_update', (data) => {
            updateDashboard(data);
            lastData = data;
        });

        socket.on('disconnect', () => {
            addTerminalLine('❌ Disconnected from live stream');
        });

        function updateDashboard(data) {
            // Users
            document.getElementById('totalUsers').textContent = data.users.total;
            document.getElementById('todayUsers').textContent = data.users.today;
            document.getElementById('activeUsers').textContent = data.users.active;

            // Orders
            document.getElementById('totalOrders').textContent = data.orders.total;
            document.getElementById('todayOrders').textContent = data.orders.today;
            document.getElementById('conversionRate').textContent = data.orders.conversionRate + '%';

            // Revenue
            document.getElementById('totalRevenue').textContent = '$' + data.revenue.total.toLocaleString();
            document.getElementById('todayRevenue').textContent = '$' + data.revenue.today.toLocaleString();
            document.getElementById('weekRevenue').textContent = '$' + data.revenue.thisWeek.toLocaleString();

            // Backend Status
            const statusEl = document.getElementById('backendStatus');
            if (data.backend.status === 'online') {
                statusEl.textContent = 'ONLINE';
                statusEl.className = 'metric-value status-online';
            } else {
                statusEl.textContent = 'OFFLINE';
                statusEl.className = 'metric-value status-offline';
            }

            // System Performance
            document.getElementById('memoryUsed').textContent = data.system.memory.used + 'MB';
            document.getElementById('cpuLoad').textContent = data.system.loadAverage[0].toFixed(1);
            document.getElementById('uptime').textContent = Math.floor(data.system.uptime / 60) + 'm';

            // AI Agents
            updateAgents(data.backend.agents || {});

            // Activity Feed
            updateActivityFeed(data.activity);

            // Check for changes
            if (lastData) {
                checkForChanges(lastData, data);
            }
        }

        function updateAgents(agents) {
            const grid = document.getElementById('agentsGrid');
            if (!agents || Object.keys(agents).length === 0) {
                grid.innerHTML = '<div class="agent-item"><div class="agent-name">No agents found</div></div>';
                return;
            }

            const html = Object.entries(agents).map(([name, status]) => \`
                <div class="agent-item">
                    <div class="agent-name">\${name}</div>
                    <div class="agent-status \${status === 'online' ? 'status-online' : 'status-offline'}">
                        \${status.toUpperCase()}
                    </div>
                </div>
            \`).join('');
            
            grid.innerHTML = html;
        }

        function updateActivityFeed(activities) {
            if (!activities || activities.length === 0) return;

            const feed = document.getElementById('activityFeed');
            const html = activities.map(activity => \`
                <div class="activity-item">
                    <span class="activity-type">\${activity.type.substring(0, 4).toUpperCase()}</span>
                    <span class="activity-desc">\${activity.description}</span>
                    <span class="activity-time">\${new Date(activity.timestamp).toLocaleTimeString()}</span>
                </div>
            \`).join('');
            
            feed.innerHTML = html;
        }

        function checkForChanges(oldData, newData) {
            // Check for new users
            if (newData.users.total > oldData.users.total) {
                addTerminalLine(\`🆕 New user registered! Total: \${newData.users.total}\`);
            }

            // Check for new orders
            if (newData.orders.total > oldData.orders.total) {
                addTerminalLine(\`💰 New order received! Total: \${newData.orders.total}\`);
            }

            // Check for revenue changes
            if (newData.revenue.total > oldData.revenue.total) {
                const increase = newData.revenue.total - oldData.revenue.total;
                addTerminalLine(\`📈 Revenue increased by $\${increase}! Total: $\${newData.revenue.total}\`);
            }

            // Check backend status changes
            if (newData.backend.status !== oldData.backend.status) {
                addTerminalLine(\`⚠️ Backend status changed: \${oldData.backend.status} → \${newData.backend.status}\`);
            }
        }

        function addTerminalLine(text) {
            const terminal = document.getElementById('terminal');
            const line = document.createElement('div');
            line.className = 'terminal-line';
            line.innerHTML = \`<span class="terminal-prompt">[\${new Date().toLocaleTimeString()}]</span> \${text}\`;
            terminal.appendChild(line);
            terminal.scrollTop = terminal.scrollHeight;

            // Keep only last 50 lines
            while (terminal.children.length > 50) {
                terminal.removeChild(terminal.firstChild);
            }
        }

        // Load initial data
        fetch('/api/admin/everything')
            .then(r => r.json())
            .then(data => {
                updateDashboard(data);
                addTerminalLine('✅ Initial data loaded successfully');
            })
            .catch(error => {
                addTerminalLine(\`❌ Error loading initial data: \${error.message}\`);
            });
    </script>
</body>
</html>
        `;
  }

  start() {
    this.server.listen(this.port, () => {
      console.log(`🔴 Admin Live Dashboard started on port ${this.port}`);
      console.log(`📊 Admin URL: http://localhost:${this.port}`);
      console.log(`🎮 Full control panel with real-time monitoring`);
    });
  }
}

// Start the admin dashboard
if (require.main === module) {
  const dashboard = new AdminLiveDashboard();
  dashboard.start();
}

module.exports = AdminLiveDashboard;
