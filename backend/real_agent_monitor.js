const express = require("express");
const fs = require("fs").promises;
const path = require("path");

class RealAgentMonitor {
  constructor() {
    this.app = express();
    this.port = 3012;
    this.agents = new Map();
    this.pendingApprovals = new Map();
    this.workHistory = [];

    this.setupRoutes();
    this.loadRealAgentData();
  }

  setupRoutes() {
    this.app.use(express.json());
    this.app.use(express.static("public"));

    // Main dashboard
    this.app.get("/", (req, res) => {
      res.send(this.getRealMonitorHTML());
    });

    // API endpoints for real data
    this.app.get("/api/agents", async (req, res) => {
      const realData = await this.getRealAgentStatus();
      res.json(realData);
    });

    this.app.get("/api/logs", async (req, res) => {
      const logs = await this.getRecentLogs();
      res.json(logs);
    });

    this.app.get("/api/files", async (req, res) => {
      const files = await this.getRecentFiles();
      res.json(files);
    });
  }

  async loadRealAgentData() {
    // Check which agents are actually running by looking for their files
    const agentFiles = [
      "super_agent.js",
      "enhanced_super_agent.js",
      "customer_service_agent.js",
      "email_agent.js",
      "real_trading_agent.js",
      "super_trading_agent.js",
      "inventory_super_agent.js",
    ];

    for (const file of agentFiles) {
      try {
        const filePath = path.join(__dirname, file);
        const stats = await fs.stat(filePath);
        const agentName = this.getAgentNameFromFile(file);

        this.agents.set(file, {
          id: file,
          name: agentName,
          file: file,
          lastModified: stats.mtime,
          size: stats.size,
          status: await this.checkAgentStatus(file),
          realMetrics: await this.extractRealMetrics(file),
        });
      } catch (error) {
        // File doesn't exist, skip
      }
    }
  }

  getAgentNameFromFile(filename) {
    const names = {
      "super_agent.js": "Super Agent",
      "enhanced_super_agent.js": "Enhanced Super Agent",
      "customer_service_agent.js": "Customer Service Agent",
      "email_agent.js": "Email Agent",
      "real_trading_agent.js": "Trading Agent",
      "super_trading_agent.js": "Super Trading Agent",
      "inventory_super_agent.js": "Inventory Super Agent",
    };
    return names[filename] || filename.replace(".js", "");
  }

  async checkAgentStatus(filename) {
    // Check if process is running by looking for log files or recent activity
    try {
      const logFile = filename.replace(".js", ".log");
      const logPath = path.join(__dirname, logFile);
      const stats = await fs.stat(logPath);

      // If log was modified in last 5 minutes, consider agent active
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      return stats.mtime > fiveMinutesAgo ? "online" : "idle";
    } catch (error) {
      return "offline";
    }
  }

  async extractRealMetrics(filename) {
    try {
      const content = await fs.readFile(path.join(__dirname, filename), "utf8");
      const lines = content.split("\n");

      return {
        linesOfCode: lines.length,
        functions: (content.match(/function\s+\w+/g) || []).length,
        classes: (content.match(/class\s+\w+/g) || []).length,
        lastUpdate: new Date().toISOString(),
      };
    } catch (error) {
      return {
        linesOfCode: 0,
        functions: 0,
        classes: 0,
        lastUpdate: "Unknown",
      };
    }
  }

  async getRealAgentStatus() {
    const realStatus = [];

    for (const [id, agent] of this.agents) {
      // Get real file stats
      try {
        const stats = await fs.stat(path.join(__dirname, agent.file));
        const isRecent = new Date() - stats.mtime < 24 * 60 * 60 * 1000; // 24 hours

        realStatus.push({
          id: agent.id,
          name: agent.name,
          status: isRecent ? "recently_active" : "dormant",
          fileSize: Math.round(stats.size / 1024) + " KB",
          lastModified: stats.mtime.toLocaleString(),
          linesOfCode: agent.realMetrics.linesOfCode,
          functions: agent.realMetrics.functions,
          classes: agent.realMetrics.classes,
        });
      } catch (error) {
        realStatus.push({
          id: agent.id,
          name: agent.name,
          status: "file_missing",
          error: "File not found",
        });
      }
    }

    return realStatus;
  }

  async getRecentLogs() {
    const logs = [];
    const logFiles = ["email_agent.log", "server_8080.log", "admin_8081.log"];

    for (const logFile of logFiles) {
      try {
        const logPath = path.join(__dirname, logFile);
        const content = await fs.readFile(logPath, "utf8");
        const lines = content.split("\n").slice(-5); // Last 5 lines

        logs.push({
          file: logFile,
          recentLines: lines.filter((line) => line.trim()),
        });
      } catch (error) {
        // Log file doesn't exist
      }
    }

    return logs;
  }

  async getRecentFiles() {
    try {
      const files = await fs.readdir(__dirname);
      const recentFiles = [];

      for (const file of files) {
        if (
          file.endsWith(".js") ||
          file.endsWith(".json") ||
          file.endsWith(".log")
        ) {
          try {
            const stats = await fs.stat(path.join(__dirname, file));
            const hourAgo = new Date(Date.now() - 60 * 60 * 1000);

            if (stats.mtime > hourAgo) {
              recentFiles.push({
                name: file,
                size: Math.round(stats.size / 1024) + " KB",
                modified: stats.mtime.toLocaleString(),
                type: file.split(".").pop(),
              });
            }
          } catch (error) {
            // Skip files we can't read
          }
        }
      }

      return recentFiles.sort(
        (a, b) => new Date(b.modified) - new Date(a.modified),
      );
    } catch (error) {
      return [];
    }
  }

  getRealMonitorHTML() {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Real Agent Monitor - Neuro.Pilot.AI</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #0a0e27 0%, #1a1f36 100%);
            color: #ffffff;
            min-height: 100vh;
        }
        
        .header {
            background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
            padding: 20px;
            box-shadow: 0 2px 20px rgba(0,0,0,0.3);
        }
        
        .container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 20px;
        }
        
        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
            gap: 20px;
            margin-top: 20px;
        }
        
        .card {
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 15px;
            padding: 20px;
            backdrop-filter: blur(10px);
        }
        
        .card h3 {
            color: #64b5f6;
            margin-bottom: 15px;
            font-size: 1.3rem;
        }
        
        .agent-item {
            background: rgba(255,255,255,0.03);
            border-radius: 10px;
            padding: 15px;
            margin-bottom: 10px;
            border-left: 4px solid;
        }
        
        .status-recently_active { border-left-color: #10b981; }
        .status-dormant { border-left-color: #f59e0b; }
        .status-file_missing { border-left-color: #ef4444; }
        
        .agent-name {
            font-weight: 600;
            color: #ffffff;
            margin-bottom: 8px;
        }
        
        .agent-details {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 10px;
            font-size: 0.9rem;
            color: #a0aec0;
        }
        
        .log-container {
            background: #1a202c;
            border-radius: 8px;
            padding: 15px;
            font-family: 'Courier New', monospace;
            font-size: 0.85rem;
            color: #e2e8f0;
            max-height: 300px;
            overflow-y: auto;
        }
        
        .file-item {
            display: flex;
            justify-content: between;
            align-items: center;
            padding: 10px;
            background: rgba(255,255,255,0.03);
            border-radius: 8px;
            margin-bottom: 8px;
        }
        
        .file-name {
            font-weight: 500;
            color: #93c5fd;
        }
        
        .file-details {
            font-size: 0.8rem;
            color: #64748b;
        }
        
        .status-badge {
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 0.8rem;
            font-weight: 500;
            text-transform: uppercase;
        }
        
        .badge-active { background: #065f46; color: #6ee7b7; }
        .badge-dormant { background: #92400e; color: #fbbf24; }
        .badge-missing { background: #7f1d1d; color: #fca5a5; }
        
        .refresh-btn {
            background: #3b82f6;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 500;
            transition: all 0.2s;
        }
        
        .refresh-btn:hover {
            background: #2563eb;
            transform: translateY(-1px);
        }
        
        .timestamp {
            color: #64748b;
            font-size: 0.9rem;
            margin-top: 10px;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="container">
            <h1>🔍 Real Agent Monitor</h1>
            <p>Actual status of your AI agents and system files</p>
            <button class="refresh-btn" onclick="loadRealData()">🔄 Refresh Real Data</button>
        </div>
    </div>
    
    <div class="container">
        <div class="grid">
            <!-- Real Agent Status -->
            <div class="card">
                <h3>📊 Agent Files Status</h3>
                <div id="agentStatus">Loading real agent data...</div>
            </div>
            
            <!-- Recent Logs -->
            <div class="card">
                <h3>📝 Recent Log Activity</h3>
                <div id="logActivity">Loading log data...</div>
            </div>
            
            <!-- Recent File Changes -->
            <div class="card">
                <h3>📁 Recent File Changes</h3>
                <div id="fileChanges">Loading file data...</div>
            </div>
        </div>
        
        <div class="timestamp" id="lastUpdate">
            Last updated: Never
        </div>
    </div>
    
    <script>
        async function loadRealData() {
            document.getElementById('lastUpdate').textContent = 'Last updated: ' + new Date().toLocaleString();
            
            try {
                // Load real agent status
                const agentResponse = await fetch('/api/agents');
                const agents = await agentResponse.json();
                
                const agentHTML = agents.map(agent => {
                    const statusClass = \`status-\${agent.status}\`;
                    const badgeClass = agent.status === 'recently_active' ? 'badge-active' : 
                                     agent.status === 'dormant' ? 'badge-dormant' : 'badge-missing';
                    
                    return \`
                        <div class="agent-item \${statusClass}">
                            <div class="agent-name">
                                \${agent.name}
                                <span class="status-badge \${badgeClass}">\${agent.status.replace('_', ' ')}</span>
                            </div>
                            <div class="agent-details">
                                <div>File Size: \${agent.fileSize || 'Unknown'}</div>
                                <div>Lines: \${agent.linesOfCode || 0}</div>
                                <div>Functions: \${agent.functions || 0}</div>
                                <div>Classes: \${agent.classes || 0}</div>
                            </div>
                            <div class="file-details">
                                Last Modified: \${agent.lastModified || 'Unknown'}
                            </div>
                        </div>
                    \`;
                }).join('');
                
                document.getElementById('agentStatus').innerHTML = agentHTML;
                
                // Load real logs
                const logResponse = await fetch('/api/logs');
                const logs = await logResponse.json();
                
                if (logs.length === 0) {
                    document.getElementById('logActivity').innerHTML = '<div style="color: #64748b; text-align: center; padding: 20px;">No recent log activity found</div>';
                } else {
                    const logHTML = logs.map(log => \`
                        <div style="margin-bottom: 15px;">
                            <div style="color: #93c5fd; font-weight: 500; margin-bottom: 5px;">\${log.file}</div>
                            <div class="log-container">
                                \${log.recentLines.map(line => \`<div>\${line}</div>\`).join('')}
                            </div>
                        </div>
                    \`).join('');
                    
                    document.getElementById('logActivity').innerHTML = logHTML;
                }
                
                // Load recent files
                const filesResponse = await fetch('/api/files');
                const files = await filesResponse.json();
                
                if (files.length === 0) {
                    document.getElementById('fileChanges').innerHTML = '<div style="color: #64748b; text-align: center; padding: 20px;">No recent file changes in the last hour</div>';
                } else {
                    const filesHTML = files.map(file => \`
                        <div class="file-item">
                            <div>
                                <div class="file-name">\${file.name}</div>
                                <div class="file-details">\${file.size} • \${file.modified}</div>
                            </div>
                        </div>
                    \`).join('');
                    
                    document.getElementById('fileChanges').innerHTML = filesHTML;
                }
                
            } catch (error) {
                console.error('Error loading real data:', error);
                document.getElementById('agentStatus').innerHTML = '<div style="color: #ef4444;">Error loading agent data</div>';
            }
        }
        
        // Load data on page load
        loadRealData();
        
        // Auto-refresh every 30 seconds
        setInterval(loadRealData, 30000);
    </script>
</body>
</html>
        `;
  }

  start() {
    this.app.listen(this.port, () => {
      console.log(
        `🔍 Real Agent Monitor started on http://localhost:${this.port}`,
      );
      console.log("📊 Showing actual agent file status and real system data");
    });
  }
}

// Start if run directly
if (require.main === module) {
  const monitor = new RealAgentMonitor();
  monitor.start();
}

module.exports = RealAgentMonitor;
