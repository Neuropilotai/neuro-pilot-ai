const express = require("express");
const fs = require("fs").promises;
const path = require("path");

class AgentDashboard {
  constructor() {
    this.app = express();
    this.port = 3005;
    this.setupRoutes();
  }

  setupRoutes() {
    // Serve static files
    this.app.use(express.static("public"));

    // Dashboard home page
    this.app.get("/", (req, res) => {
      res.send(this.getDashboardHTML());
    });

    // API endpoints
    this.app.get("/api/agents/status", async (req, res) => {
      try {
        const status = await this.getAgentStatus();
        res.json(status);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get("/api/logs/:agent", async (req, res) => {
      try {
        const logs = await this.getAgentLogs(req.params.agent);
        res.json(logs);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get("/api/orders/processed", async (req, res) => {
      try {
        const orders = await this.getProcessedOrders();
        res.json(orders);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  }

  async getAgentStatus() {
    const agents = [
      {
        name: "Email Agent",
        logFile: "email_agent.log",
        port: null,
        status: "active",
      },
      {
        name: "Backend API",
        logFile: "server_8080.log",
        port: 8080,
        status: "active",
      },
      {
        name: "Admin Server",
        logFile: "admin_8081.log",
        port: 8081,
        status: "active",
      },
      {
        name: "Fiverr Pro",
        logFile: "fiverr_pro.log",
        port: 8082,
        status: "active",
      },
    ];

    const statusData = [];

    for (const agent of agents) {
      try {
        const logPath = path.join(__dirname, agent.logFile);
        const logContent = await fs.readFile(logPath, "utf8");
        const lines = logContent.split("\n").filter((line) => line.trim());
        const lastLine = lines[lines.length - 1] || "";

        statusData.push({
          name: agent.name,
          status: lastLine.includes("✅") ? "online" : "unknown",
          lastActivity: this.extractTimestamp(lastLine) || "Unknown",
          port: agent.port,
          totalLines: lines.length,
          lastLog:
            lastLine.substring(0, 100) + (lastLine.length > 100 ? "..." : ""),
        });
      } catch (error) {
        statusData.push({
          name: agent.name,
          status: "offline",
          lastActivity: "No log file",
          port: agent.port,
          totalLines: 0,
          lastLog: "Agent not responding",
        });
      }
    }

    return statusData;
  }

  async getAgentLogs(agentName) {
    const logFiles = {
      email: "email_agent.log",
      backend: "server_8080.log",
      admin: "admin_8081.log",
      fiverr: "fiverr_pro.log",
    };

    const logFile = logFiles[agentName];
    if (!logFile) {
      throw new Error("Agent not found");
    }

    try {
      const logPath = path.join(__dirname, logFile);
      const content = await fs.readFile(logPath, "utf8");
      const lines = content.split("\n").slice(-50); // Last 50 lines
      return { lines, total: content.split("\n").length };
    } catch (error) {
      return { lines: ["Log file not found"], total: 0 };
    }
  }

  async getProcessedOrders() {
    try {
      const ordersPath = path.join(__dirname, "processed_orders_log.json");
      const content = await fs.readFile(ordersPath, "utf8");
      return JSON.parse(content);
    } catch (error) {
      return [];
    }
  }

  extractTimestamp(line) {
    const timeMatch = line.match(/\[(\d+:\d+:\d+\s+[AP]M)\]/);
    return timeMatch ? timeMatch[1] : null;
  }

  getDashboardHTML() {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Neuro.Pilot.AI - Agent Dashboard</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            color: #333;
        }
        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        .header { 
            background: rgba(255,255,255,0.95); 
            padding: 30px; 
            border-radius: 15px; 
            margin-bottom: 30px; 
            text-align: center;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
        }
        .header h1 { color: #4a5568; font-size: 2.5rem; margin-bottom: 10px; }
        .header p { color: #718096; font-size: 1.2rem; }
        .refresh-btn { 
            background: linear-gradient(135deg, #4299e1 0%, #3182ce 100%); 
            color: white; 
            border: none; 
            padding: 12px 25px; 
            border-radius: 8px; 
            cursor: pointer; 
            font-size: 16px;
            margin: 20px 0;
            transition: transform 0.2s;
        }
        .refresh-btn:hover { transform: translateY(-2px); }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 25px; }
        .card { 
            background: rgba(255,255,255,0.95); 
            border-radius: 15px; 
            padding: 25px; 
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
            transition: transform 0.3s ease;
        }
        .card:hover { transform: translateY(-5px); }
        .card h3 { color: #4a5568; margin-bottom: 15px; font-size: 1.4rem; }
        .status-online { color: #38a169; font-weight: bold; }
        .status-offline { color: #e53e3e; font-weight: bold; }
        .status-unknown { color: #d69e2e; font-weight: bold; }
        .agent-item { 
            background: #f7fafc; 
            padding: 15px; 
            border-radius: 10px; 
            margin: 10px 0;
            border-left: 5px solid #4299e1;
        }
        .agent-item.online { border-left-color: #38a169; }
        .agent-item.offline { border-left-color: #e53e3e; }
        .log-container { 
            background: #1a202c; 
            color: #e2e8f0; 
            padding: 15px; 
            border-radius: 8px; 
            font-family: 'Courier New', monospace; 
            font-size: 12px;
            max-height: 300px;
            overflow-y: auto;
            margin: 15px 0;
        }
        .metric { 
            display: flex; 
            justify-content: space-between; 
            padding: 8px 0; 
            border-bottom: 1px solid #e2e8f0;
        }
        .metric:last-child { border-bottom: none; }
        .metric-value { font-weight: bold; color: #4299e1; }
        .orders-table { width: 100%; border-collapse: collapse; margin: 15px 0; }
        .orders-table th, .orders-table td { 
            padding: 12px; 
            text-align: left; 
            border-bottom: 1px solid #e2e8f0;
        }
        .orders-table th { background: #f7fafc; font-weight: bold; }
        .timestamp { color: #718096; font-size: 0.9rem; }
        .loading { text-align: center; padding: 20px; color: #718096; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🤖 Neuro.Pilot.AI</h1>
            <p>Agent Monitoring Dashboard</p>
            <button class="refresh-btn" onclick="refreshDashboard()">🔄 Refresh Data</button>
            <div class="timestamp">Last updated: <span id="lastUpdate">Loading...</span></div>
        </div>

        <div class="grid">
            <div class="card">
                <h3>🚀 Agent Status</h3>
                <div id="agentStatus" class="loading">Loading agent status...</div>
            </div>

            <div class="card">
                <h3>📊 System Metrics</h3>
                <div id="systemMetrics">
                    <div class="metric">
                        <span>Total Agents:</span>
                        <span class="metric-value" id="totalAgents">-</span>
                    </div>
                    <div class="metric">
                        <span>Online Agents:</span>
                        <span class="metric-value" id="onlineAgents">-</span>
                    </div>
                    <div class="metric">
                        <span>Processed Orders:</span>
                        <span class="metric-value" id="processedOrders">-</span>
                    </div>
                    <div class="metric">
                        <span>System Uptime:</span>
                        <span class="metric-value" id="systemUptime">-</span>
                    </div>
                </div>
            </div>

            <div class="card">
                <h3>📧 Recent Email Activity</h3>
                <div id="emailLogs" class="log-container">Loading email logs...</div>
            </div>

            <div class="card">
                <h3>📋 Processed Orders</h3>
                <div id="processedOrdersList">Loading orders...</div>
            </div>
        </div>
    </div>

    <script>
        let startTime = Date.now();

        async function fetchAgentStatus() {
            try {
                const response = await fetch('/api/agents/status');
                const agents = await response.json();
                
                const statusHTML = agents.map(agent => \`
                    <div class="agent-item \${agent.status}">
                        <strong>\${agent.name}</strong>
                        <div class="status-\${agent.status}">\${agent.status.toUpperCase()}</div>
                        <div>Last Activity: \${agent.lastActivity}</div>
                        \${agent.port ? \`<div>Port: \${agent.port}</div>\` : ''}
                        <div style="font-size: 0.9rem; color: #718096; margin-top: 8px;">
                            \${agent.lastLog}
                        </div>
                    </div>
                \`).join('');
                
                document.getElementById('agentStatus').innerHTML = statusHTML;
                
                // Update metrics
                document.getElementById('totalAgents').textContent = agents.length;
                document.getElementById('onlineAgents').textContent = agents.filter(a => a.status === 'online').length;
                
            } catch (error) {
                document.getElementById('agentStatus').innerHTML = '<div style="color: #e53e3e;">Error loading agent status</div>';
            }
        }

        async function fetchEmailLogs() {
            try {
                const response = await fetch('/api/logs/email');
                const data = await response.json();
                
                const logsHTML = data.lines.slice(-10).map(line => 
                    \`<div>\${line}</div>\`
                ).join('');
                
                document.getElementById('emailLogs').innerHTML = logsHTML || '<div>No recent activity</div>';
                
            } catch (error) {
                document.getElementById('emailLogs').innerHTML = '<div style="color: #e53e3e;">Error loading logs</div>';
            }
        }

        async function fetchProcessedOrders() {
            try {
                const response = await fetch('/api/orders/processed');
                const orders = await response.json();
                
                document.getElementById('processedOrders').textContent = orders.length;
                
                if (orders.length > 0) {
                    const ordersHTML = \`
                        <table class="orders-table">
                            <thead>
                                <tr>
                                    <th>Customer</th>
                                    <th>Role</th>
                                    <th>Industry</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                \${orders.slice(-5).map(order => \`
                                    <tr>
                                        <td>\${order.customer}</td>
                                        <td>\${order.targetRole}</td>
                                        <td>\${order.industry}</td>
                                        <td style="color: #38a169;">\${order.status}</td>
                                    </tr>
                                \`).join('')}
                            </tbody>
                        </table>
                    \`;
                    document.getElementById('processedOrdersList').innerHTML = ordersHTML;
                } else {
                    document.getElementById('processedOrdersList').innerHTML = '<div>No orders processed yet</div>';
                }
                
            } catch (error) {
                document.getElementById('processedOrdersList').innerHTML = '<div style="color: #e53e3e;">Error loading orders</div>';
            }
        }

        function updateSystemUptime() {
            const uptime = Math.floor((Date.now() - startTime) / 1000);
            const hours = Math.floor(uptime / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);
            const seconds = uptime % 60;
            
            document.getElementById('systemUptime').textContent = \`\${hours}h \${minutes}m \${seconds}s\`;
        }

        function refreshDashboard() {
            document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString();
            fetchAgentStatus();
            fetchEmailLogs();
            fetchProcessedOrders();
        }

        // Initial load
        refreshDashboard();
        
        // Auto-refresh every 30 seconds
        setInterval(refreshDashboard, 30000);
        
        // Update uptime every second
        setInterval(updateSystemUptime, 1000);
    </script>
</body>
</html>
        `;
  }

  start() {
    this.app.listen(this.port, () => {
      console.log(`🎛️ Agent Dashboard started on port ${this.port}`);
      console.log(`📊 Dashboard URL: http://localhost:${this.port}`);
      console.log(
        `🌐 Make sure to expose this port via ngrok for external access`,
      );
    });
  }
}

if (require.main === module) {
  const dashboard = new AgentDashboard();
  dashboard.start();
}

module.exports = AgentDashboard;
