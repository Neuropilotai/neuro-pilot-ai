const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const { EventEmitter } = require('events');

class LiveAgentDashboard extends EventEmitter {
    constructor() {
        super();
        this.app = express();
        this.port = 3013;
        
        // Real-time data storage
        this.agentActivities = new Map();
        this.tradingResults = {
            startingBalance: 100000,
            currentBalance: 100000,
            trades: [],
            dailyPnL: 0,
            totalPnL: 0,
            winRate: 0,
            totalTrades: 0
        };
        this.pendingResearch = new Map();
        this.approvedResearch = new Map();
        
        this.setupMiddleware();
        this.setupRoutes();
        this.startMonitoring();
    }
    
    setupMiddleware() {
        this.app.use(express.json());
        this.app.use(express.static('public'));
    }
    
    setupRoutes() {
        // Dashboard homepage
        this.app.get('/', (req, res) => {
            res.send(this.getDashboardHTML());
        });
        
        // API endpoints
        this.app.get('/api/live/activities', async (req, res) => {
            const activities = await this.getCurrentActivities();
            res.json(activities);
        });
        
        this.app.get('/api/live/trading', async (req, res) => {
            const trading = await this.getTradingResults();
            res.json(trading);
        });
        
        this.app.get('/api/live/research', (req, res) => {
            res.json({
                pending: Array.from(this.pendingResearch.values()),
                approved: Array.from(this.approvedResearch.values()).slice(-10)
            });
        });
        
        this.app.post('/api/approve/research/:id', (req, res) => {
            const { id } = req.params;
            const { approved, feedback } = req.body;
            
            const research = this.pendingResearch.get(id);
            if (research) {
                research.status = approved ? 'approved' : 'rejected';
                research.feedback = feedback;
                research.reviewedAt = new Date();
                
                this.pendingResearch.delete(id);
                this.approvedResearch.set(id, research);
                
                res.json({ success: true, research });
            } else {
                res.status(404).json({ error: 'Research not found' });
            }
        });
    }
    
    async getCurrentActivities() {
        const activities = [];
        
        // Monitor running processes
        try {
            // Check for agent log files modified in last 5 minutes
            const logFiles = await fs.readdir(__dirname);
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
            
            for (const file of logFiles) {
                if (file.endsWith('.log')) {
                    try {
                        const stats = await fs.stat(path.join(__dirname, file));
                        if (stats.mtime > fiveMinutesAgo) {
                            const content = await fs.readFile(path.join(__dirname, file), 'utf8');
                            const lastLines = content.split('\n').slice(-10).filter(line => line.trim());
                            
                            activities.push({
                                agent: file.replace('.log', ''),
                                status: 'active',
                                lastActivity: stats.mtime,
                                recentLogs: lastLines,
                                currentWork: this.extractWorkFromLogs(lastLines)
                            });
                        }
                    } catch (error) {
                        // Skip if can't read
                    }
                }
            }
            
            // Check for trading activity
            const tradingLogPath = path.join(__dirname, 'trading_results.json');
            try {
                const tradingData = await fs.readFile(tradingLogPath, 'utf8');
                const results = JSON.parse(tradingData);
                activities.push({
                    agent: 'trading_agent',
                    status: 'active',
                    lastActivity: new Date(),
                    currentWork: `Paper trading with $${results.currentBalance.toLocaleString()}`,
                    metrics: results
                });
            } catch (error) {
                // No trading results yet
            }
            
        } catch (error) {
            console.error('Error getting activities:', error);
        }
        
        return activities;
    }
    
    extractWorkFromLogs(logs) {
        // Extract meaningful work from log lines
        for (const log of logs) {
            if (log.includes('Processing') || log.includes('Analyzing') || log.includes('Working on')) {
                return log;
            }
            if (log.includes('email') || log.includes('Email')) {
                return 'Processing emails';
            }
            if (log.includes('order') || log.includes('Order')) {
                return 'Processing orders';
            }
            if (log.includes('trade') || log.includes('Trade')) {
                return 'Executing trades';
            }
        }
        return 'Active';
    }
    
    async getTradingResults() {
        try {
            // Try to read actual trading results
            const resultsPath = path.join(__dirname, 'trading_results.json');
            const data = await fs.readFile(resultsPath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            // Return simulated paper trading data if no real data
            return this.simulatePaperTrading();
        }
    }
    
    simulatePaperTrading() {
        // Simulate some paper trading activity
        const trades = [
            { time: new Date(Date.now() - 3600000), symbol: 'AAPL', side: 'BUY', quantity: 100, price: 185.50, pnl: 250 },
            { time: new Date(Date.now() - 2400000), symbol: 'TSLA', side: 'SELL', quantity: 50, price: 245.80, pnl: -120 },
            { time: new Date(Date.now() - 1200000), symbol: 'NVDA', side: 'BUY', quantity: 75, price: 875.25, pnl: 450 },
            { time: new Date(Date.now() - 600000), symbol: 'SPY', side: 'BUY', quantity: 200, price: 475.90, pnl: 180 }
        ];
        
        const totalPnL = trades.reduce((sum, t) => sum + t.pnl, 0);
        const wins = trades.filter(t => t.pnl > 0).length;
        
        return {
            startingBalance: 100000,
            currentBalance: 100000 + totalPnL,
            trades: trades,
            dailyPnL: totalPnL,
            totalPnL: totalPnL,
            winRate: (wins / trades.length) * 100,
            totalTrades: trades.length,
            lastUpdate: new Date()
        };
    }
    
    startMonitoring() {
        // Monitor for new research/analysis that needs approval
        setInterval(async () => {
            try {
                // Check for files that might contain research
                const researchFiles = ['market_analysis.json', 'ai_insights.json', 'trading_signals.json'];
                
                for (const file of researchFiles) {
                    try {
                        const filePath = path.join(__dirname, file);
                        const stats = await fs.stat(filePath);
                        
                        // If file was modified in last 10 minutes
                        if (new Date() - stats.mtime < 10 * 60 * 1000) {
                            const content = await fs.readFile(filePath, 'utf8');
                            const data = JSON.parse(content);
                            
                            // Create research item for approval
                            const researchId = `research_${Date.now()}`;
                            if (!this.pendingResearch.has(researchId)) {
                                this.pendingResearch.set(researchId, {
                                    id: researchId,
                                    type: file.replace('.json', ''),
                                    agent: 'AI Analysis Agent',
                                    timestamp: stats.mtime,
                                    data: data,
                                    status: 'pending'
                                });
                            }
                        }
                    } catch (error) {
                        // File doesn't exist or can't be parsed
                    }
                }
            } catch (error) {
                console.error('Monitoring error:', error);
            }
        }, 30000); // Check every 30 seconds
    }
    
    getDashboardHTML() {
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Live Agent Dashboard - Neuro.Pilot.AI</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0a0a0a;
            color: #ffffff;
            min-height: 100vh;
        }
        
        .header {
            background: linear-gradient(90deg, #1a1a1a 0%, #2a2a2a 100%);
            padding: 20px;
            border-bottom: 1px solid #333;
        }
        
        .header h1 {
            font-size: 2rem;
            font-weight: 300;
            letter-spacing: -0.5px;
        }
        
        .header p {
            color: #888;
            margin-top: 5px;
        }
        
        .container {
            max-width: 1600px;
            margin: 0 auto;
            padding: 20px;
        }
        
        .grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 20px;
        }
        
        .card {
            background: #111;
            border: 1px solid #222;
            border-radius: 12px;
            padding: 24px;
        }
        
        .card h2 {
            font-size: 1.5rem;
            font-weight: 400;
            margin-bottom: 20px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .status-indicator {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            display: inline-block;
            animation: pulse 2s infinite;
        }
        
        .status-active { background: #00ff00; }
        .status-idle { background: #ffaa00; }
        .status-offline { background: #ff0000; }
        
        @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.5; }
            100% { opacity: 1; }
        }
        
        .activity-item {
            background: #1a1a1a;
            border: 1px solid #2a2a2a;
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 12px;
        }
        
        .activity-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
        }
        
        .agent-name {
            font-weight: 500;
            color: #fff;
            font-size: 1.1rem;
        }
        
        .activity-time {
            color: #666;
            font-size: 0.9rem;
        }
        
        .current-work {
            color: #00ff00;
            font-family: 'SF Mono', monospace;
            font-size: 0.95rem;
            margin-top: 8px;
        }
        
        .trading-card {
            background: #0a1628;
            border: 1px solid #1e3a5f;
        }
        
        .balance {
            font-size: 3rem;
            font-weight: 300;
            color: #fff;
            margin: 20px 0;
        }
        
        .pnl {
            font-size: 1.5rem;
            margin: 10px 0;
        }
        
        .positive { color: #00ff00; }
        .negative { color: #ff4444; }
        
        .metrics {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 20px;
            margin-top: 20px;
        }
        
        .metric {
            text-align: center;
            padding: 15px;
            background: rgba(255,255,255,0.05);
            border-radius: 8px;
        }
        
        .metric-value {
            font-size: 1.8rem;
            font-weight: 300;
            color: #fff;
        }
        
        .metric-label {
            color: #666;
            font-size: 0.9rem;
            margin-top: 5px;
        }
        
        .trades-list {
            margin-top: 20px;
            max-height: 300px;
            overflow-y: auto;
        }
        
        .trade-item {
            display: flex;
            justify-content: space-between;
            padding: 12px;
            background: rgba(255,255,255,0.03);
            border-radius: 6px;
            margin-bottom: 8px;
            font-family: 'SF Mono', monospace;
            font-size: 0.9rem;
        }
        
        .research-item {
            background: #1a1a0a;
            border: 1px solid #3a3a1a;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 15px;
        }
        
        .research-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
        }
        
        .research-type {
            background: #3a3a1a;
            padding: 4px 12px;
            border-radius: 4px;
            font-size: 0.9rem;
        }
        
        .research-data {
            background: #0a0a0a;
            border-radius: 6px;
            padding: 15px;
            font-family: 'SF Mono', monospace;
            font-size: 0.85rem;
            max-height: 200px;
            overflow-y: auto;
            margin-bottom: 15px;
        }
        
        .action-buttons {
            display: flex;
            gap: 10px;
        }
        
        .btn {
            padding: 10px 20px;
            border: none;
            border-radius: 6px;
            font-size: 0.95rem;
            cursor: pointer;
            transition: all 0.2s;
        }
        
        .btn-approve {
            background: #00aa00;
            color: white;
        }
        
        .btn-reject {
            background: #aa0000;
            color: white;
        }
        
        .btn:hover {
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        }
        
        .refresh-indicator {
            position: fixed;
            top: 20px;
            right: 20px;
            background: #222;
            padding: 10px 20px;
            border-radius: 20px;
            font-size: 0.9rem;
            color: #666;
        }
        
        .empty-state {
            text-align: center;
            padding: 40px;
            color: #666;
        }
        
        .log-output {
            background: #0a0a0a;
            border-radius: 6px;
            padding: 10px;
            font-family: 'SF Mono', monospace;
            font-size: 0.8rem;
            color: #888;
            max-height: 100px;
            overflow-y: auto;
            margin-top: 10px;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="container">
            <h1>🎯 Live Agent Dashboard</h1>
            <p>Real-time monitoring of agent activities and paper trading results</p>
        </div>
    </div>
    
    <div class="container">
        <div class="grid">
            <!-- Active Agents -->
            <div class="card">
                <h2><span class="status-indicator status-active"></span> Active Agents</h2>
                <div id="activeAgents">
                    <div class="empty-state">Loading agent activities...</div>
                </div>
            </div>
            
            <!-- Paper Trading Results -->
            <div class="card trading-card">
                <h2>📈 Paper Trading Results</h2>
                <div id="tradingResults">
                    <div class="empty-state">Loading trading data...</div>
                </div>
            </div>
        </div>
        
        <!-- Research Approval Section -->
        <div class="card">
            <h2>🔬 Research & Analysis Approval</h2>
            <div id="researchApproval">
                <div class="empty-state">No pending research items</div>
            </div>
        </div>
    </div>
    
    <div class="refresh-indicator" id="refreshIndicator">
        ⟳ Auto-refresh: <span id="countdown">30</span>s
    </div>
    
    <script>
        let countdownValue = 30;
        
        async function loadDashboardData() {
            try {
                // Load active agents
                const activitiesResponse = await fetch('/api/live/activities');
                const activities = await activitiesResponse.json();
                
                const agentsContainer = document.getElementById('activeAgents');
                if (activities.length === 0) {
                    agentsContainer.innerHTML = '<div class="empty-state">No active agents detected</div>';
                } else {
                    agentsContainer.innerHTML = activities.map(activity => \`
                        <div class="activity-item">
                            <div class="activity-header">
                                <div class="agent-name">\${activity.agent.replace(/_/g, ' ').toUpperCase()}</div>
                                <div class="activity-time">\${new Date(activity.lastActivity).toLocaleTimeString()}</div>
                            </div>
                            <div class="current-work">▶ \${activity.currentWork || 'Processing...'}</div>
                            \${activity.recentLogs ? \`
                                <div class="log-output">
                                    \${activity.recentLogs.slice(-3).join('<br>')}
                                </div>
                            \` : ''}
                        </div>
                    \`).join('');
                }
                
                // Load trading results
                const tradingResponse = await fetch('/api/live/trading');
                const trading = await tradingResponse.json();
                
                const tradingContainer = document.getElementById('tradingResults');
                const pnlClass = trading.dailyPnL >= 0 ? 'positive' : 'negative';
                const pnlSymbol = trading.dailyPnL >= 0 ? '+' : '';
                
                tradingContainer.innerHTML = \`
                    <div class="balance">$\${trading.currentBalance.toLocaleString()}</div>
                    <div class="pnl \${pnlClass}">
                        Daily P&L: \${pnlSymbol}$\${Math.abs(trading.dailyPnL).toLocaleString()}
                    </div>
                    <div class="metrics">
                        <div class="metric">
                            <div class="metric-value">\${trading.winRate.toFixed(1)}%</div>
                            <div class="metric-label">Win Rate</div>
                        </div>
                        <div class="metric">
                            <div class="metric-value">\${trading.totalTrades}</div>
                            <div class="metric-label">Trades Today</div>
                        </div>
                        <div class="metric">
                            <div class="metric-value">\${pnlSymbol}$\${Math.abs(trading.totalPnL).toLocaleString()}</div>
                            <div class="metric-label">Total P&L</div>
                        </div>
                    </div>
                    <div class="trades-list">
                        <h3 style="margin-bottom: 10px; color: #666;">Recent Trades</h3>
                        \${trading.trades.map(trade => \`
                            <div class="trade-item">
                                <span>\${new Date(trade.time).toLocaleTimeString()} \${trade.side} \${trade.quantity} \${trade.symbol} @ $\${trade.price}</span>
                                <span class="\${trade.pnl >= 0 ? 'positive' : 'negative'}">\${trade.pnl >= 0 ? '+' : ''}$\${trade.pnl}</span>
                            </div>
                        \`).join('')}
                    </div>
                \`;
                
                // Load research items
                const researchResponse = await fetch('/api/live/research');
                const research = await researchResponse.json();
                
                const researchContainer = document.getElementById('researchApproval');
                if (research.pending.length === 0) {
                    researchContainer.innerHTML = '<div class="empty-state">No pending research items</div>';
                } else {
                    researchContainer.innerHTML = research.pending.map(item => \`
                        <div class="research-item" id="research-\${item.id}">
                            <div class="research-header">
                                <div>
                                    <div style="font-weight: 500; margin-bottom: 5px;">\${item.agent}</div>
                                    <div style="color: #666; font-size: 0.9rem;">\${new Date(item.timestamp).toLocaleString()}</div>
                                </div>
                                <div class="research-type">\${item.type}</div>
                            </div>
                            <div class="research-data">
                                \${JSON.stringify(item.data, null, 2)}
                            </div>
                            <div class="action-buttons">
                                <button class="btn btn-approve" onclick="approveResearch('\${item.id}', true)">
                                    ✓ Approve
                                </button>
                                <button class="btn btn-reject" onclick="approveResearch('\${item.id}', false)">
                                    ✗ Reject
                                </button>
                            </div>
                        </div>
                    \`).join('');
                }
                
            } catch (error) {
                console.error('Error loading dashboard data:', error);
            }
            
            // Reset countdown
            countdownValue = 30;
        }
        
        async function approveResearch(id, approved) {
            try {
                const response = await fetch(\`/api/approve/research/\${id}\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ approved, feedback: approved ? 'Approved' : 'Rejected' })
                });
                
                if (response.ok) {
                    // Remove the item from UI
                    const element = document.getElementById(\`research-\${id}\`);
                    if (element) {
                        element.style.opacity = '0.5';
                        element.innerHTML = \`<div style="text-align: center; padding: 20px; color: \${approved ? '#00ff00' : '#ff4444'};">\${approved ? '✓ Approved' : '✗ Rejected'}</div>\`;
                        setTimeout(() => element.remove(), 2000);
                    }
                }
            } catch (error) {
                console.error('Error approving research:', error);
            }
        }
        
        // Initial load
        loadDashboardData();
        
        // Auto refresh every 30 seconds
        setInterval(loadDashboardData, 30000);
        
        // Update countdown
        setInterval(() => {
            countdownValue--;
            if (countdownValue < 0) countdownValue = 30;
            document.getElementById('countdown').textContent = countdownValue;
        }, 1000);
    </script>
</body>
</html>
        `;
    }
    
    start() {
        this.app.listen(this.port, () => {
            console.log(`🎯 Live Agent Dashboard running on http://localhost:${this.port}`);
            console.log('📊 Monitoring real agent activities and paper trading results');
        });
    }
}

// Create a helper to save trading results
async function saveTradingResults(results) {
    const resultsPath = path.join(__dirname, 'trading_results.json');
    await fs.writeFile(resultsPath, JSON.stringify(results, null, 2));
}

// Start if run directly
if (require.main === module) {
    const dashboard = new LiveAgentDashboard();
    dashboard.start();
    
    // Example: Simulate some trading activity for demo
    setTimeout(async () => {
        const mockResults = {
            startingBalance: 100000,
            currentBalance: 102450,
            trades: [
                { time: new Date(), symbol: 'AAPL', side: 'BUY', quantity: 100, price: 185.50, pnl: 250 },
                { time: new Date(), symbol: 'MSFT', side: 'SELL', quantity: 50, price: 425.30, pnl: 180 },
                { time: new Date(), symbol: 'GOOGL', side: 'BUY', quantity: 25, price: 155.75, pnl: 320 }
            ],
            dailyPnL: 2450,
            totalPnL: 2450,
            winRate: 100,
            totalTrades: 3,
            lastUpdate: new Date()
        };
        await saveTradingResults(mockResults);
        console.log('💰 Sample trading data saved for demo');
    }, 2000);
}

module.exports = LiveAgentDashboard;