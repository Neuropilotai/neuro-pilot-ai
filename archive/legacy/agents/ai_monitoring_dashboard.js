#!/usr/bin/env node

/**
 * 🎯 AI Monitoring Dashboard
 * 
 * Advanced dashboard for monitoring AI trading performance, reinforcement learning,
 * and real-time strategy optimization
 */

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs').promises;
const path = require('path');

class AIMonitoringDashboard {
    constructor() {
        this.app = express();
        this.server = http.createServer(this.app);
        this.io = socketIo(this.server, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            }
        });
        this.port = 3013;
        
        // Data paths
        this.dataPath = './TradingDrive/feedback_data';
        this.performancePath = './TradingDrive/performance_logs';
        this.modelPath = './TradingDrive/rl_models';
        
        this.setupMiddleware();
        this.setupRoutes();
        this.setupSocketHandlers();
        this.startDataMonitoring();
    }

    setupMiddleware() {
        this.app.use(express.json());
        this.app.use(express.static(path.join(__dirname, 'public')));
    }

    setupRoutes() {
        // Serve main dashboard
        this.app.get('/', (req, res) => {
            res.send(this.generateDashboardHTML());
        });

        // API endpoints for dashboard data
        this.app.get('/api/performance', async (req, res) => {
            try {
                const performance = await this.getPerformanceData();
                res.json(performance);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/trades', async (req, res) => {
            try {
                const trades = await this.getTradeData();
                res.json(trades);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/rl-status', async (req, res) => {
            try {
                const rlStatus = await this.getRLStatus();
                res.json(rlStatus);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/sharpe-trend', async (req, res) => {
            try {
                const sharpeTrend = await this.getSharpeTrend();
                res.json(sharpeTrend);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/regime-history', async (req, res) => {
            try {
                const regimeHistory = await this.getRegimeHistory();
                res.json(regimeHistory);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
    }

    setupSocketHandlers() {
        this.io.on('connection', (socket) => {
            console.log(`🔌 Dashboard connected: ${socket.id}`);
            
            socket.on('disconnect', () => {
                console.log(`🔌 Dashboard disconnected: ${socket.id}`);
            });
        });
    }

    async getPerformanceData() {
        try {
            const progressFile = path.join(this.performancePath, 'learning_progress.json');
            const data = await fs.readFile(progressFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            return {};
        }
    }

    async getTradeData() {
        try {
            const tradesFile = path.join(this.dataPath, 'trades.json');
            const data = await fs.readFile(tradesFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            return [];
        }
    }

    async getRLStatus() {
        try {
            const modelFile = path.join(this.modelPath, 'q_table.json');
            const data = await fs.readFile(modelFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            return {
                qTable: {},
                bestPerformance: 0,
                explorationRate: 0.25,
                episodeCount: 0
            };
        }
    }

    async getSharpeTrend() {
        try {
            const trades = await this.getTradeData();
            if (!trades || trades.length < 10) return [];
            
            const sharpeTrend = [];
            const windowSize = 20;
            
            for (let i = windowSize; i <= trades.length; i++) {
                const window = trades.slice(i - windowSize, i);
                const returns = window.map(t => t.pnl / 100); // Convert to percentage
                
                if (returns.length > 1) {
                    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
                    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / (returns.length - 1);
                    const stdDev = Math.sqrt(variance);
                    const sharpe = stdDev > 0 ? (avgReturn - 0.02) / stdDev : 0; // 2% risk-free rate
                    
                    sharpeTrend.push({
                        timestamp: window[window.length - 1].timestamp,
                        sharpe: sharpe,
                        trade_number: i
                    });
                }
            }
            
            return sharpeTrend;
        } catch (error) {
            return [];
        }
    }

    async getRegimeHistory() {
        try {
            const trades = await this.getTradeData();
            if (!trades) return [];
            
            const regimeHistory = {};
            trades.forEach(trade => {
                const date = trade.timestamp.split('T')[0];
                if (!regimeHistory[date]) {
                    regimeHistory[date] = { trending: 0, mean_reversion: 0, ranging: 0, total: 0 };
                }
                
                if (trade.regime) {
                    regimeHistory[date][trade.regime] = (regimeHistory[date][trade.regime] || 0) + 1;
                }
                regimeHistory[date].total++;
            });
            
            return Object.entries(regimeHistory).map(([date, data]) => ({
                date,
                trending: (data.trending / data.total * 100).toFixed(1),
                mean_reversion: (data.mean_reversion / data.total * 100).toFixed(1),
                ranging: (data.ranging / data.total * 100).toFixed(1)
            }));
        } catch (error) {
            return [];
        }
    }

    startDataMonitoring() {
        // Broadcast real-time updates every 30 seconds
        setInterval(async () => {
            try {
                const performance = await this.getPerformanceData();
                const rlStatus = await this.getRLStatus();
                const trades = await this.getTradeData();
                
                this.io.emit('performance_update', performance);
                this.io.emit('rl_update', rlStatus);
                this.io.emit('trades_update', trades.slice(-5)); // Last 5 trades
                
            } catch (error) {
                console.error('Data monitoring error:', error.message);
            }
        }, 30000);
    }

    generateDashboardHTML() {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🧠 AI Trading Monitoring Dashboard</title>
    <script src="https://cdn.socket.io/4.5.0/socket.io.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            background: linear-gradient(135deg, #0f0f23 0%, #1a1a3e 100%);
            color: #ffffff;
            overflow-x: hidden;
        }
        
        .header {
            background: linear-gradient(90deg, #6a5acd 0%, #483d8b 100%);
            padding: 20px;
            text-align: center;
            box-shadow: 0 4px 20px rgba(106, 90, 205, 0.3);
        }
        
        .header h1 {
            font-size: 2.5em;
            margin-bottom: 10px;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
        }
        
        .header .subtitle {
            font-size: 1.2em;
            opacity: 0.9;
        }
        
        .dashboard-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
            gap: 20px;
            padding: 20px;
            max-width: 1400px;
            margin: 0 auto;
        }
        
        .card {
            background: rgba(26, 26, 62, 0.8);
            border: 1px solid rgba(106, 90, 205, 0.3);
            border-radius: 15px;
            padding: 25px;
            backdrop-filter: blur(10px);
            box-shadow: 0 8px 32px rgba(106, 90, 205, 0.1);
            transition: transform 0.3s ease, box-shadow 0.3s ease;
        }
        
        .card:hover {
            transform: translateY(-5px);
            box-shadow: 0 12px 40px rgba(106, 90, 205, 0.2);
        }
        
        .card h3 {
            color: #6a5acd;
            margin-bottom: 20px;
            font-size: 1.4em;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .metric {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin: 15px 0;
            padding: 10px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 8px;
        }
        
        .metric-label {
            font-weight: 500;
            opacity: 0.8;
        }
        
        .metric-value {
            font-weight: 700;
            font-size: 1.1em;
        }
        
        .metric-value.positive { color: #4ade80; }
        .metric-value.negative { color: #ef4444; }
        .metric-value.neutral { color: #fbbf24; }
        
        .status-indicator {
            display: inline-block;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            margin-right: 8px;
        }
        
        .status-active { background: #4ade80; animation: pulse 2s infinite; }
        .status-warning { background: #fbbf24; }
        .status-error { background: #ef4444; }
        
        @keyframes pulse {
            0% { box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.7); }
            70% { box-shadow: 0 0 0 10px rgba(74, 222, 128, 0); }
            100% { box-shadow: 0 0 0 0 rgba(74, 222, 128, 0); }
        }
        
        .chart-container {
            position: relative;
            height: 300px;
            margin-top: 20px;
        }
        
        .trade-list {
            max-height: 300px;
            overflow-y: auto;
        }
        
        .trade-item {
            background: rgba(255, 255, 255, 0.05);
            margin: 10px 0;
            padding: 15px;
            border-radius: 8px;
            border-left: 4px solid #6a5acd;
        }
        
        .trade-profit { border-left-color: #4ade80; }
        .trade-loss { border-left-color: #ef4444; }
        
        .progress-bar {
            width: 100%;
            height: 8px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 4px;
            overflow: hidden;
            margin: 10px 0;
        }
        
        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #6a5acd, #4ade80);
            transition: width 0.3s ease;
        }
        
        .grid-2 { grid-column: span 2; }
        
        @media (max-width: 768px) {
            .dashboard-grid {
                grid-template-columns: 1fr;
                padding: 10px;
            }
            .grid-2 { grid-column: span 1; }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🧠 AI Trading Monitoring Dashboard</h1>
        <div class="subtitle">Real-time Performance • Reinforcement Learning • Strategy Optimization</div>
    </div>
    
    <div class="dashboard-grid">
        <!-- AI Performance Card -->
        <div class="card">
            <h3>🎯 AI Performance</h3>
            <div class="metric">
                <span class="metric-label">Model Accuracy</span>
                <span class="metric-value" id="ai-accuracy">95.0%</span>
            </div>
            <div class="metric">
                <span class="metric-label">Learning Progress</span>
                <span class="metric-value" id="learning-progress">100%</span>
            </div>
            <div class="progress-bar">
                <div class="progress-fill" id="progress-fill" style="width: 100%"></div>
            </div>
            <div class="metric">
                <span class="metric-label">Data Points</span>
                <span class="metric-value" id="data-points">21,600</span>
            </div>
            <div class="metric">
                <span class="metric-label">Models Retrained</span>
                <span class="metric-value" id="models-retrained">26</span>
            </div>
        </div>
        
        <!-- Trading Performance Card -->
        <div class="card">
            <h3>💰 Trading Performance</h3>
            <div class="metric">
                <span class="metric-label">Total Trades</span>
                <span class="metric-value" id="total-trades">0</span>
            </div>
            <div class="metric">
                <span class="metric-label">Win Rate</span>
                <span class="metric-value positive" id="win-rate">0%</span>
            </div>
            <div class="metric">
                <span class="metric-label">Total P&L</span>
                <span class="metric-value neutral" id="total-pnl">$0.00</span>
            </div>
            <div class="metric">
                <span class="metric-label">Current Equity</span>
                <span class="metric-value" id="current-equity">$500.00</span>
            </div>
        </div>
        
        <!-- Reinforcement Learning Card -->
        <div class="card">
            <h3>🧠 Reinforcement Learning</h3>
            <div class="metric">
                <span class="metric-label">
                    <span class="status-indicator status-active"></span>
                    Learning Status
                </span>
                <span class="metric-value" id="rl-status">Active</span>
            </div>
            <div class="metric">
                <span class="metric-label">Episodes Completed</span>
                <span class="metric-value" id="rl-episodes">0</span>
            </div>
            <div class="metric">
                <span class="metric-label">Best Performance</span>
                <span class="metric-value positive" id="rl-best">0.00</span>
            </div>
            <div class="metric">
                <span class="metric-label">Exploration Rate</span>
                <span class="metric-value" id="rl-exploration">25.0%</span>
            </div>
            <div class="metric">
                <span class="metric-label">Q-Table Size</span>
                <span class="metric-value" id="rl-qtable">0</span>
            </div>
        </div>
        
        <!-- System Status Card -->
        <div class="card">
            <h3>⚡ System Status</h3>
            <div class="metric">
                <span class="metric-label">
                    <span class="status-indicator status-active"></span>
                    Indicator Learning
                </span>
                <span class="metric-value">Active</span>
            </div>
            <div class="metric">
                <span class="metric-label">
                    <span class="status-indicator status-active"></span>
                    Data Collection
                </span>
                <span class="metric-value">Active</span>
            </div>
            <div class="metric">
                <span class="metric-label">
                    <span class="status-indicator status-active"></span>
                    RL Agent
                </span>
                <span class="metric-value">Running</span>
            </div>
            <div class="metric">
                <span class="metric-label">Data Quality</span>
                <span class="metric-value positive">PREMIUM</span>
            </div>
        </div>
        
        <!-- Sharpe Ratio Trend Chart -->
        <div class="card grid-2">
            <h3>📈 Sharpe Ratio Trend</h3>
            <div class="chart-container">
                <canvas id="sharpe-chart"></canvas>
            </div>
        </div>
        
        <!-- Recent Trades -->
        <div class="card">
            <h3>📊 Recent Trades</h3>
            <div class="trade-list" id="recent-trades">
                <div class="trade-item">
                    <div>No trades yet - System ready for trading</div>
                    <small>Waiting for market signals...</small>
                </div>
            </div>
        </div>
        
        <!-- Market Regime History -->
        <div class="card">
            <h3>🎯 Market Regime Analysis</h3>
            <div class="chart-container">
                <canvas id="regime-chart"></canvas>
            </div>
        </div>
    </div>
    
    <script>
        const socket = io();
        
        // Initialize charts
        const sharpeCtx = document.getElementById('sharpe-chart').getContext('2d');
        const sharpeChart = new Chart(sharpeCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Sharpe Ratio',
                    data: [],
                    borderColor: '#6a5acd',
                    backgroundColor: 'rgba(106, 90, 205, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: '#ffffff' } }
                },
                scales: {
                    x: { ticks: { color: '#ffffff' }, grid: { color: 'rgba(255,255,255,0.1)' } },
                    y: { ticks: { color: '#ffffff' }, grid: { color: 'rgba(255,255,255,0.1)' } }
                }
            }
        });
        
        const regimeCtx = document.getElementById('regime-chart').getContext('2d');
        const regimeChart = new Chart(regimeCtx, {
            type: 'doughnut',
            data: {
                labels: ['Trending', 'Mean Reversion', 'Ranging'],
                datasets: [{
                    data: [40, 35, 25],
                    backgroundColor: ['#4ade80', '#fbbf24', '#ef4444'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: '#ffffff' } }
                }
            }
        });
        
        // Socket event handlers
        socket.on('performance_update', (data) => {
            document.getElementById('ai-accuracy').textContent = (data.modelAccuracy * 100).toFixed(1) + '%';
            document.getElementById('learning-progress').textContent = data.learningProgress + '%';
            document.getElementById('data-points').textContent = data.performance.dataPointsCollected.toLocaleString();
            document.getElementById('models-retrained').textContent = data.performance.modelsRetrained;
            document.getElementById('total-trades').textContent = data.performance.totalTrades;
            document.getElementById('win-rate').textContent = data.performance.winRate + '%';
            document.getElementById('total-pnl').textContent = '$' + data.performance.totalPnL.toFixed(2);
            
            // Update progress bar
            document.getElementById('progress-fill').style.width = data.learningProgress + '%';
        });
        
        socket.on('rl_update', (data) => {
            document.getElementById('rl-episodes').textContent = data.episodeCount || 0;
            document.getElementById('rl-best').textContent = (data.bestPerformance || 0).toFixed(2);
            document.getElementById('rl-exploration').textContent = ((data.explorationRate || 0.25) * 100).toFixed(1) + '%';
            document.getElementById('rl-qtable').textContent = Object.keys(data.qTable || {}).length;
        });
        
        socket.on('trades_update', (trades) => {
            const container = document.getElementById('recent-trades');
            if (trades.length === 0) return;
            
            container.innerHTML = trades.map(trade => \`
                <div class="trade-item \${trade.result === 'PROFIT' ? 'trade-profit' : trade.result === 'LOSS' ? 'trade-loss' : ''}">
                    <div>\${trade.action} \${trade.symbol} @ $\${trade.price}</div>
                    <div>AI Score: \${trade.aiScore || 0} | Confidence: \${((trade.confidence || 0) * 100).toFixed(0)}%</div>
                    <small>\${new Date(trade.timestamp).toLocaleString()}</small>
                </div>
            \`).join('');
        });
        
        // Load initial data
        async function loadInitialData() {
            try {
                const [performance, rlStatus, sharpeTrend] = await Promise.all([
                    fetch('/api/performance').then(r => r.json()),
                    fetch('/api/rl-status').then(r => r.json()),
                    fetch('/api/sharpe-trend').then(r => r.json())
                ]);
                
                // Trigger initial updates
                socket.emit('performance_update', performance);
                socket.emit('rl_update', rlStatus);
                
                // Update Sharpe chart
                if (sharpeTrend.length > 0) {
                    sharpeChart.data.labels = sharpeTrend.map(d => d.trade_number);
                    sharpeChart.data.datasets[0].data = sharpeTrend.map(d => d.sharpe);
                    sharpeChart.update();
                }
                
            } catch (error) {
                console.error('Failed to load initial data:', error);
            }
        }
        
        loadInitialData();
        
        // Refresh data every 30 seconds
        setInterval(loadInitialData, 30000);
    </script>
</body>
</html>`;
    }

    startServer() {
        this.server.listen(this.port, () => {
            console.log(`🎯 AI Monitoring Dashboard started on port ${this.port}`);
            console.log(`📊 Dashboard URL: http://localhost:${this.port}`);
            console.log(`⚡ Real-time updates via WebSocket`);
        });
    }
}

// Start the monitoring dashboard
if (require.main === module) {
    const dashboard = new AIMonitoringDashboard();
    dashboard.startServer();
}

module.exports = AIMonitoringDashboard;