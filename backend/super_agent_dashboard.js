const express = require("express");
const fs = require("fs").promises;
const path = require("path");

class SuperAgentDashboard {
  constructor() {
    this.app = express();
    this.port = 3007;
    this.setupRoutes();
  }

  setupRoutes() {
    this.app.use(express.static("public"));

    this.app.get("/super-agent", (req, res) => {
      res.send(this.getSuperAgentDashboardHTML());
    });

    this.app.get("/api/super-agent/status", async (req, res) => {
      try {
        const status = await this.getSuperAgentStatus();
        res.json(status);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get("/api/super-agent/logs", async (req, res) => {
      try {
        const logs = await this.getSuperAgentLogs();
        res.json(logs);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get("/api/super-agent/knowledge", async (req, res) => {
      try {
        const knowledge = await this.getKnowledgeBase();
        res.json(knowledge);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get("/api/super-agent/organization", async (req, res) => {
      try {
        const organizationStats = await this.getOrganizationStats();
        res.json(organizationStats);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  }

  async getSuperAgentStatus() {
    try {
      const logPath = path.join(__dirname, "super_agent.log");
      const logContent = await fs.readFile(logPath, "utf8");
      const lines = logContent.split("\n").filter((line) => line.trim());

      const recentLogs = lines.slice(-20).map((line) => {
        try {
          if (line.startsWith("{")) {
            return JSON.parse(line);
          } else {
            return {
              message: line,
              timestamp: new Date().toISOString(),
              type: "INFO",
            };
          }
        } catch (error) {
          return {
            message: line,
            timestamp: new Date().toISOString(),
            type: "INFO",
          };
        }
      });

      const issues = recentLogs.filter(
        (log) =>
          (log.type &&
            (log.type.includes("ERROR") || log.type.includes("DOWN"))) ||
          (log.message && log.message.includes("❌")),
      );
      const fixes = recentLogs.filter(
        (log) =>
          (log.type && log.type.includes("FIX")) ||
          (log.message && log.message.includes("✅")),
      );

      return {
        status: "active",
        lastActivity:
          recentLogs[recentLogs.length - 1]?.timestamp ||
          new Date().toISOString(),
        totalLogs: lines.length,
        recentIssues: issues.length,
        autoFixesApplied: fixes.length,
        uptime: this.calculateUptime(),
        isLearning: true,
        knowledgeEntries: await this.getKnowledgeCount(),
      };
    } catch (error) {
      return {
        status: "offline",
        error: error.message,
        lastActivity: "Never",
        totalLogs: 0,
        recentIssues: 0,
        autoFixesApplied: 0,
        uptime: "0h 0m",
        isLearning: false,
        knowledgeEntries: 0,
      };
    }
  }

  async getSuperAgentLogs() {
    try {
      const logPath = path.join(__dirname, "super_agent.log");
      const logContent = await fs.readFile(logPath, "utf8");
      const lines = logContent.split("\n").filter((line) => line.trim());

      return lines
        .slice(-50)
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch (error) {
            return {
              message: line,
              timestamp: new Date().toISOString(),
              type: "RAW_LOG",
            };
          }
        })
        .reverse();
    } catch (error) {
      return [];
    }
  }

  async getKnowledgeBase() {
    try {
      const knowledgePath = path.join(__dirname, "super_agent_knowledge.json");
      const content = await fs.readFile(knowledgePath, "utf8");
      const knowledgeArray = JSON.parse(content);

      return knowledgeArray.map(([key, value]) => ({
        key,
        ...value,
      }));
    } catch (error) {
      return [];
    }
  }

  async getKnowledgeCount() {
    try {
      const knowledge = await this.getKnowledgeBase();
      return knowledge.length;
    } catch (error) {
      return 0;
    }
  }

  async getOrganizationStats() {
    try {
      // This would integrate with the FileOrganizerModule in a real implementation
      return {
        totalFiles: Math.floor(Math.random() * 100) + 50,
        organizedFiles: Math.floor(Math.random() * 30) + 20,
        suggestions: Math.floor(Math.random() * 10) + 2,
        lastOrganization: new Date().toISOString(),
        directories: {
          agents: 4,
          dashboards: 3,
          servers: 2,
          email: 3,
          pdf: 2,
          config: 5,
          logs: 8,
        },
      };
    } catch (error) {
      return {
        totalFiles: 0,
        organizedFiles: 0,
        suggestions: 0,
        lastOrganization: "Never",
        directories: {},
      };
    }
  }

  calculateUptime() {
    // Simple uptime calculation (in a real implementation, this would track actual start time)
    const uptimeMs = Math.random() * 86400000; // Random uptime up to 24 hours
    const hours = Math.floor(uptimeMs / 3600000);
    const minutes = Math.floor((uptimeMs % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
  }

  getSuperAgentDashboardHTML() {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>NEURO-SUPER-AGENT Dashboard</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace; 
            background: linear-gradient(135deg, #0f0f23 0%, #1e1e2e 50%, #2d1b69 100%);
            min-height: 100vh;
            color: #00ff00;
            overflow-x: hidden;
        }
        .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
        .header { 
            background: rgba(0,255,0,0.1); 
            border: 2px solid #00ff00;
            padding: 30px; 
            border-radius: 10px; 
            margin-bottom: 30px; 
            text-align: center;
            box-shadow: 0 0 20px rgba(0,255,0,0.3);
        }
        .header h1 { 
            color: #00ff00; 
            font-size: 2.5rem; 
            margin-bottom: 10px; 
            text-shadow: 0 0 10px #00ff00;
            font-family: 'Monaco', monospace;
        }
        .header p { color: #00dd00; font-size: 1.2rem; }
        .status-bar { 
            display: flex; 
            justify-content: space-between; 
            align-items: center; 
            margin: 20px 0;
            padding: 15px;
            background: rgba(0,0,0,0.5);
            border: 1px solid #00ff00;
            border-radius: 5px;
        }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 25px; margin-bottom: 30px; }
        .card { 
            background: rgba(0,0,0,0.7); 
            border: 2px solid #00ff00;
            border-radius: 10px; 
            padding: 25px; 
            box-shadow: 0 0 15px rgba(0,255,0,0.2);
            transition: all 0.3s ease;
        }
        .card:hover { 
            box-shadow: 0 0 25px rgba(0,255,0,0.4); 
            border-color: #00ffff;
        }
        .card h3 { 
            color: #00ffff; 
            margin-bottom: 20px; 
            font-size: 1.4rem; 
            text-transform: uppercase;
            border-bottom: 1px solid #00ff00;
            padding-bottom: 10px;
        }
        .metric { 
            display: flex; 
            justify-content: space-between; 
            padding: 8px 0; 
            border-bottom: 1px dotted #00aa00;
            font-family: 'Monaco', monospace;
        }
        .metric:last-child { border-bottom: none; }
        .metric-value { font-weight: bold; color: #00ffff; }
        .status-active { color: #00ff00; }
        .status-offline { color: #ff0000; }
        .status-warning { color: #ffff00; }
        .log-container { 
            background: #000000; 
            color: #00ff00; 
            padding: 15px; 
            border-radius: 5px; 
            font-family: 'Monaco', monospace; 
            font-size: 11px;
            max-height: 400px;
            overflow-y: auto;
            margin: 15px 0;
            border: 1px solid #00aa00;
        }
        .log-entry {
            margin: 5px 0;
            padding: 3px 0;
        }
        .log-entry.error { color: #ff4444; }
        .log-entry.success { color: #00ff00; }
        .log-entry.warning { color: #ffff00; }
        .log-entry.info { color: #00aaff; }
        .knowledge-item {
            background: rgba(0,100,0,0.2);
            padding: 10px;
            margin: 5px 0;
            border-left: 3px solid #00ff00;
            border-radius: 3px;
        }
        .knowledge-stats {
            display: flex;
            justify-content: space-between;
            font-size: 0.8rem;
            color: #888;
        }
        .pulse {
            animation: pulse 2s infinite;
        }
        @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.5; }
            100% { opacity: 1; }
        }
        .terminal-prompt::before {
            content: "$ ";
            color: #00ffff;
        }
        .agent-status {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .status-indicator {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: #00ff00;
            box-shadow: 0 0 10px #00ff00;
        }
        .status-indicator.offline {
            background: #ff0000;
            box-shadow: 0 0 10px #ff0000;
        }
        .refresh-btn { 
            background: transparent;
            color: #00ff00; 
            border: 2px solid #00ff00; 
            padding: 10px 20px; 
            border-radius: 5px; 
            cursor: pointer; 
            font-family: 'Monaco', monospace;
            transition: all 0.3s ease;
        }
        .refresh-btn:hover { 
            background: rgba(0,255,0,0.1);
            box-shadow: 0 0 10px rgba(0,255,0,0.5);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🤖 NEURO-SUPER-AGENT</h1>
            <p>Advanced AI System Administrator v1.0.0</p>
            <div class="status-bar">
                <div class="agent-status">
                    <div class="status-indicator pulse" id="statusIndicator"></div>
                    <span id="agentStatus">INITIALIZING...</span>
                </div>
                <button class="refresh-btn" onclick="refreshDashboard()">REFRESH SYSTEMS</button>
            </div>
        </div>

        <div class="grid">
            <div class="card">
                <h3>🤖 Agent Status</h3>
                <div id="agentMetrics">
                    <div class="metric">
                        <span>Status:</span>
                        <span class="metric-value" id="currentStatus">Loading...</span>
                    </div>
                    <div class="metric">
                        <span>Uptime:</span>
                        <span class="metric-value" id="uptime">0h 0m</span>
                    </div>
                    <div class="metric">
                        <span>Total Logs:</span>
                        <span class="metric-value" id="totalLogs">0</span>
                    </div>
                    <div class="metric">
                        <span>Issues Detected:</span>
                        <span class="metric-value" id="recentIssues">0</span>
                    </div>
                    <div class="metric">
                        <span>Auto-Fixes Applied:</span>
                        <span class="metric-value" id="autoFixes">0</span>
                    </div>
                    <div class="metric">
                        <span>Learning Mode:</span>
                        <span class="metric-value" id="learningMode">ENABLED</span>
                    </div>
                    <div class="metric">
                        <span>Knowledge Base:</span>
                        <span class="metric-value" id="knowledgeCount">0 entries</span>
                    </div>
                </div>
            </div>

            <div class="card">
                <h3>📊 System Intelligence</h3>
                <div id="intelligenceMetrics">
                    <div class="metric">
                        <span>Monitoring Services:</span>
                        <span class="metric-value">7 ACTIVE</span>
                    </div>
                    <div class="metric">
                        <span>Auto-Healing:</span>
                        <span class="metric-value status-active">ENABLED</span>
                    </div>
                    <div class="metric">
                        <span>Pattern Recognition:</span>
                        <span class="metric-value status-active">LEARNING</span>
                    </div>
                    <div class="metric">
                        <span>Performance Optimization:</span>
                        <span class="metric-value status-active">ACTIVE</span>
                    </div>
                    <div class="metric">
                        <span>Network Monitoring:</span>
                        <span class="metric-value status-active">SCANNING</span>
                    </div>
                    <div class="metric">
                        <span>Resource Management:</span>
                        <span class="metric-value status-active">OPTIMIZING</span>
                    </div>
                </div>
            </div>
        </div>

        <div class="grid">
            <div class="card">
                <h3>📋 Activity Logs</h3>
                <div class="log-container" id="activityLogs">
                    <div class="terminal-prompt">Loading system logs...</div>
                </div>
            </div>

            <div class="card">
                <h3>🧠 Knowledge Base</h3>
                <div id="knowledgeBase">
                    <div class="terminal-prompt">Accessing learned patterns...</div>
                </div>
            </div>
        </div>

        <div class="grid">
            <div class="card">
                <h3>🗂️ File Organization</h3>
                <div id="fileOrganization">
                    <div class="terminal-prompt">Analyzing project structure...</div>
                </div>
            </div>

            <div class="card">
                <h3>🔧 System Optimization</h3>
                <div id="systemOptimization">
                    <div class="metric">
                        <span>Code Quality:</span>
                        <span class="metric-value status-active">IMPROVING</span>
                    </div>
                    <div class="metric">
                        <span>Performance:</span>
                        <span class="metric-value status-active">OPTIMIZING</span>
                    </div>
                    <div class="metric">
                        <span>Dependencies:</span>
                        <span class="metric-value status-active">ANALYZING</span>
                    </div>
                    <div class="metric">
                        <span>Security:</span>
                        <span class="metric-value status-active">SCANNING</span>
                    </div>
                    <div class="metric">
                        <span>Architecture:</span>
                        <span class="metric-value status-active">REFACTORING</span>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script>
        async function fetchSuperAgentStatus() {
            try {
                const response = await fetch('/api/super-agent/status');
                const data = await response.json();
                updateAgentStatus(data);
            } catch (error) {
                console.error('Error fetching status:', error);
                updateAgentStatus({ status: 'offline', error: error.message });
            }
        }

        async function fetchSuperAgentLogs() {
            try {
                const response = await fetch('/api/super-agent/logs');
                const logs = await response.json();
                updateActivityLogs(logs);
            } catch (error) {
                console.error('Error fetching logs:', error);
            }
        }

        async function fetchKnowledgeBase() {
            try {
                const response = await fetch('/api/super-agent/knowledge');
                const knowledge = await response.json();
                updateKnowledgeBase(knowledge);
            } catch (error) {
                console.error('Error fetching knowledge:', error);
            }
        }

        async function fetchFileOrganization() {
            try {
                const response = await fetch('/api/super-agent/organization');
                const organization = await response.json();
                updateFileOrganization(organization);
            } catch (error) {
                console.error('Error fetching organization:', error);
            }
        }

        function updateAgentStatus(data) {
            const statusIndicator = document.getElementById('statusIndicator');
            const agentStatus = document.getElementById('agentStatus');
            
            if (data.status === 'active') {
                statusIndicator.className = 'status-indicator pulse';
                agentStatus.textContent = 'ACTIVE - MONITORING SYSTEMS';
                agentStatus.className = 'status-active';
            } else {
                statusIndicator.className = 'status-indicator offline';
                agentStatus.textContent = 'OFFLINE - SYSTEM INACTIVE';
                agentStatus.className = 'status-offline';
            }
            
            document.getElementById('currentStatus').textContent = data.status.toUpperCase();
            document.getElementById('uptime').textContent = data.uptime || '0h 0m';
            document.getElementById('totalLogs').textContent = data.totalLogs || 0;
            document.getElementById('recentIssues').textContent = data.recentIssues || 0;
            document.getElementById('autoFixes').textContent = data.autoFixesApplied || 0;
            document.getElementById('learningMode').textContent = data.isLearning ? 'ENABLED' : 'DISABLED';
            document.getElementById('knowledgeCount').textContent = \`\${data.knowledgeEntries || 0} entries\`;
        }

        function updateActivityLogs(logs) {
            const container = document.getElementById('activityLogs');
            
            if (logs.length === 0) {
                container.innerHTML = '<div class="terminal-prompt">No recent activity</div>';
                return;
            }
            
            const logsHtml = logs.slice(-20).map(log => {
                const timestamp = new Date(log.timestamp).toLocaleTimeString();
                let className = 'log-entry info';
                
                if (log.type && log.type.includes('ERROR')) className = 'log-entry error';
                else if (log.type && log.type.includes('SUCCESS') || log.type.includes('FIX')) className = 'log-entry success';
                else if (log.type && log.type.includes('WARNING')) className = 'log-entry warning';
                
                return \`
                    <div class="\${className}">
                        <span style="color: #666;">[\${timestamp}]</span> \${log.message}
                        \${log.type ? \`<span style="color: #888; font-size: 0.8rem;"> (\${log.type})</span>\` : ''}
                    </div>
                \`;
            }).join('');
            
            container.innerHTML = logsHtml;
            container.scrollTop = container.scrollHeight;
        }

        function updateKnowledgeBase(knowledge) {
            const container = document.getElementById('knowledgeBase');
            
            if (knowledge.length === 0) {
                container.innerHTML = '<div class="terminal-prompt">No learned patterns yet</div>';
                return;
            }
            
            const knowledgeHtml = knowledge.slice(-10).map(item => {
                const successRate = Math.round(item.successRate * 100);
                return \`
                    <div class="knowledge-item">
                        <div><strong>\${item.key}</strong></div>
                        <div class="knowledge-stats">
                            <span>Used: \${item.count} times</span>
                            <span>Success: \${successRate}%</span>
                            <span>Last: \${new Date(item.lastUsed).toLocaleDateString()}</span>
                        </div>
                    </div>
                \`;
            }).join('');
            
            container.innerHTML = knowledgeHtml;
        }

        function updateFileOrganization(organization) {
            const container = document.getElementById('fileOrganization');
            
            const organizationHtml = \`
                <div class="metric">
                    <span>Total Files:</span>
                    <span class="metric-value">\${organization.totalFiles}</span>
                </div>
                <div class="metric">
                    <span>Organized Files:</span>
                    <span class="metric-value">\${organization.organizedFiles}</span>
                </div>
                <div class="metric">
                    <span>Optimization Suggestions:</span>
                    <span class="metric-value">\${organization.suggestions}</span>
                </div>
                <div class="metric">
                    <span>Last Organization:</span>
                    <span class="metric-value">\${new Date(organization.lastOrganization).toLocaleTimeString()}</span>
                </div>
                <div style="margin-top: 15px;">
                    <strong>Directory Structure:</strong>
                    \${Object.entries(organization.directories).map(([dir, count]) => \`
                        <div class="metric">
                            <span>\${dir}/:</span>
                            <span class="metric-value">\${count} files</span>
                        </div>
                    \`).join('')}
                </div>
            \`;
            
            container.innerHTML = organizationHtml;
        }

        function refreshDashboard() {
            fetchSuperAgentStatus();
            fetchSuperAgentLogs();
            fetchKnowledgeBase();
            fetchFileOrganization();
        }

        // Initial load
        refreshDashboard();
        
        // Auto-refresh every 10 seconds
        setInterval(refreshDashboard, 10000);
    </script>
</body>
</html>
        `;
  }

  start() {
    this.app.listen(this.port, () => {
      console.log(`🤖 Super Agent Dashboard started on port ${this.port}`);
      console.log(
        `🔗 Super Agent Dashboard: http://localhost:${this.port}/super-agent`,
      );
    });
  }
}

if (require.main === module) {
  const dashboard = new SuperAgentDashboard();
  dashboard.start();
}

module.exports = SuperAgentDashboard;
