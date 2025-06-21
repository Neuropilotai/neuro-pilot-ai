require('dotenv').config();
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { UserModel, getDb } = require('./db/database');

class LiveDashboard {
    constructor() {
        this.app = express();
        this.server = createServer(this.app);
        this.io = new Server(this.server, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            }
        });
        this.port = 3008;
        this.setupMiddleware();
        this.setupRoutes();
        this.setupWebSocket();
        this.startMonitoring();
    }

    setupMiddleware() {
        this.app.use(express.json());
        this.app.use(express.static('public'));
    }

    setupRoutes() {
        this.app.get('/', (req, res) => {
            res.send(this.getLiveDashboardHTML());
        });

        this.app.get('/api/live/stats', async (req, res) => {
            try {
                const stats = await this.getLiveStats();
                res.json(stats);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/live/users', async (req, res) => {
            try {
                const users = await this.getUsers();
                res.json(users);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/live/orders', async (req, res) => {
            try {
                const orders = await this.getRecentOrders();
                res.json(orders);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/live/system', async (req, res) => {
            try {
                const systemInfo = await this.getSystemInfo();
                res.json(systemInfo);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
    }

    setupWebSocket() {
        this.io.on('connection', (socket) => {
            console.log('📊 Dashboard client connected:', socket.id);
            
            socket.on('disconnect', () => {
                console.log('📊 Dashboard client disconnected:', socket.id);
            });
        });
    }

    async startMonitoring() {
        // Monitor database changes every 2 seconds
        setInterval(async () => {
            try {
                const stats = await this.getLiveStats();
                this.io.emit('stats_update', stats);
            } catch (error) {
                console.error('Error broadcasting stats:', error);
            }
        }, 2000);

        // Monitor system info every 5 seconds
        setInterval(async () => {
            try {
                const systemInfo = await this.getSystemInfo();
                this.io.emit('system_update', systemInfo);
            } catch (error) {
                console.error('Error broadcasting system info:', error);
            }
        }, 5000);

        // Monitor recent activity every 3 seconds
        setInterval(async () => {
            try {
                const recentOrders = await this.getRecentOrders();
                this.io.emit('orders_update', recentOrders);
            } catch (error) {
                console.error('Error broadcasting orders:', error);
            }
        }, 3000);
    }

    async getLiveStats() {
        const db = getDb();
        if (!db) return {};

        const totalUsers = await db.get('SELECT COUNT(*) as count FROM users');
        const totalOrders = await db.get('SELECT COUNT(*) as count FROM resume_orders');
        const completedOrders = await db.get('SELECT COUNT(*) as count FROM resume_orders WHERE status = "completed"');
        const totalRevenue = await db.get('SELECT SUM(price) as total FROM resume_orders WHERE status = "completed"');
        const todayUsers = await db.get(`SELECT COUNT(*) as count FROM users WHERE date(createdAt) = date('now')`);
        const todayOrders = await db.get(`SELECT COUNT(*) as count FROM resume_orders WHERE date(createdAt) = date('now')`);
        const todayRevenue = await db.get(`SELECT SUM(price) as total FROM resume_orders WHERE status = "completed" AND date(createdAt) = date('now')`);
        const activeSessions = await db.get(`SELECT COUNT(*) as count FROM user_sessions WHERE datetime(expiresAt) > datetime('now')`);

        return {
            totalUsers: totalUsers?.count || 0,
            totalOrders: totalOrders?.count || 0,
            completedOrders: completedOrders?.count || 0,
            totalRevenue: totalRevenue?.total || 0,
            todayUsers: todayUsers?.count || 0,
            todayOrders: todayOrders?.count || 0,
            todayRevenue: todayRevenue?.total || 0,
            activeSessions: activeSessions?.count || 0,
            conversionRate: totalOrders?.count > 0 ? (completedOrders?.count / totalOrders?.count * 100).toFixed(1) : 0,
            avgOrderValue: completedOrders?.count > 0 ? (totalRevenue?.total / completedOrders?.count).toFixed(2) : 0
        };
    }

    async getUsers() {
        const db = getDb();
        if (!db) return [];

        return await db.all(`
            SELECT 
                u.id, u.email, u.firstName, u.lastName, u.company, u.role, u.isActive,
                u.createdAt,
                COUNT(ro.id) as orderCount,
                COALESCE(SUM(ro.price), 0) as totalSpent
            FROM users u
            LEFT JOIN resume_orders ro ON u.id = ro.userId
            GROUP BY u.id
            ORDER BY u.createdAt DESC
            LIMIT 50
        `);
    }

    async getRecentOrders() {
        const db = getDb();
        if (!db) return [];

        return await db.all(`
            SELECT 
                ro.*,
                u.email as userEmail,
                u.firstName,
                u.lastName
            FROM resume_orders ro
            LEFT JOIN users u ON ro.userId = u.id
            ORDER BY ro.createdAt DESC
            LIMIT 20
        `);
    }

    async getSystemInfo() {
        const os = require('os');
        const fs = require('fs').promises;
        
        const cpuUsage = process.cpuUsage();
        const memUsage = process.memoryUsage();
        
        // Try to get backend server status
        let backendStatus = 'Unknown';
        try {
            const response = await fetch('http://localhost:8000/api/agents/status');
            backendStatus = response.ok ? 'Online' : 'Offline';
        } catch (error) {
            backendStatus = 'Offline';
        }

        return {
            platform: os.platform(),
            arch: os.arch(),
            nodeVersion: process.version,
            uptime: process.uptime(),
            cpuUsage: {
                user: cpuUsage.user,
                system: cpuUsage.system
            },
            memoryUsage: {
                rss: Math.round(memUsage.rss / 1024 / 1024),
                heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
                heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
                external: Math.round(memUsage.external / 1024 / 1024)
            },
            loadAverage: os.loadavg(),
            totalMemory: Math.round(os.totalmem() / 1024 / 1024 / 1024),
            freeMemory: Math.round(os.freemem() / 1024 / 1024 / 1024),
            backendStatus,
            timestamp: new Date().toISOString()
        };
    }

    getLiveDashboardHTML() {
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🔴 LIVE - Neuro.Pilot.AI Dashboard</title>
    <script src="/socket.io/socket.io.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: #0a0a0f;
            color: #ffffff;
            overflow-x: hidden;
        }

        .live-indicator {
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 1000;
            background: #dc2626;
            color: white;
            padding: 8px 16px;
            border-radius: 20px;
            font-weight: bold;
            animation: pulse 2s infinite;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .live-dot {
            width: 8px;
            height: 8px;
            background: white;
            border-radius: 50%;
            animation: blink 1s infinite;
        }

        @keyframes pulse {
            0% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.7); }
            70% { box-shadow: 0 0 0 10px rgba(220, 38, 38, 0); }
            100% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0); }
        }

        @keyframes blink {
            0%, 50% { opacity: 1; }
            51%, 100% { opacity: 0; }
        }

        .header {
            background: linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e1b4b 100%);
            padding: 30px;
            text-align: center;
            border-bottom: 3px solid #6366f1;
        }

        .header h1 {
            font-size: 3rem;
            margin-bottom: 10px;
            background: linear-gradient(45deg, #f59e0b, #ef4444, #8b5cf6);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            animation: gradient-shift 3s ease-in-out infinite;
        }

        @keyframes gradient-shift {
            0%, 100% { filter: hue-rotate(0deg); }
            50% { filter: hue-rotate(180deg); }
        }

        .header p {
            color: #a5b4fc;
            font-size: 1.2rem;
        }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            padding: 30px;
            background: #111827;
        }

        .stat-card {
            background: linear-gradient(135deg, #1f2937 0%, #374151 100%);
            padding: 25px;
            border-radius: 15px;
            text-align: center;
            border: 1px solid #4b5563;
            position: relative;
            overflow: hidden;
        }

        .stat-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 2px;
            background: linear-gradient(90deg, transparent, #6366f1, transparent);
            animation: slide 2s infinite;
        }

        @keyframes slide {
            0% { left: -100%; }
            100% { left: 100%; }
        }

        .stat-number {
            font-size: 2.5rem;
            font-weight: bold;
            margin-bottom: 10px;
            color: #10b981;
        }

        .stat-label {
            color: #9ca3af;
            font-size: 0.9rem;
            margin-bottom: 10px;
        }

        .stat-change {
            font-size: 0.8rem;
            padding: 4px 8px;
            border-radius: 12px;
            font-weight: bold;
        }

        .stat-change.positive {
            background: #059669;
            color: white;
        }

        .stat-change.negative {
            background: #dc2626;
            color: white;
        }

        .main-content {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 30px;
            padding: 30px;
            background: #0f172a;
        }

        .panel {
            background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
            border-radius: 15px;
            padding: 25px;
            border: 1px solid #475569;
        }

        .panel-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 1px solid #475569;
        }

        .panel-title {
            font-size: 1.3rem;
            font-weight: bold;
            color: #f1f5f9;
        }

        .status-badge {
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 0.8rem;
            font-weight: bold;
        }

        .status-online { background: #10b981; color: white; }
        .status-offline { background: #dc2626; color: white; }
        .status-pending { background: #f59e0b; color: white; }

        .data-table {
            width: 100%;
            border-collapse: collapse;
        }

        .data-table th,
        .data-table td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #374151;
        }

        .data-table th {
            background: #1f2937;
            color: #9ca3af;
            font-weight: 600;
        }

        .data-table td {
            color: #f3f4f6;
        }

        .data-table tr:hover {
            background: #1f2937;
        }

        .full-width {
            grid-column: 1 / -1;
        }

        .chart-container {
            position: relative;
            height: 300px;
            margin-top: 20px;
        }

        .activity-feed {
            max-height: 400px;
            overflow-y: auto;
        }

        .activity-item {
            display: flex;
            align-items: center;
            padding: 12px;
            margin: 8px 0;
            background: #1f2937;
            border-radius: 8px;
            border-left: 4px solid #6366f1;
        }

        .activity-icon {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-right: 15px;
            font-size: 1.2rem;
        }

        .activity-icon.user { background: #10b981; }
        .activity-icon.order { background: #f59e0b; }
        .activity-icon.payment { background: #8b5cf6; }
        .activity-icon.system { background: #6366f1; }

        .activity-content {
            flex: 1;
        }

        .activity-title {
            font-weight: 600;
            color: #f3f4f6;
        }

        .activity-time {
            color: #9ca3af;
            font-size: 0.8rem;
        }

        .system-info {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
        }

        .info-item {
            background: #1f2937;
            padding: 15px;
            border-radius: 8px;
            text-align: center;
        }

        .info-value {
            font-size: 1.5rem;
            font-weight: bold;
            color: #10b981;
        }

        .info-label {
            color: #9ca3af;
            font-size: 0.9rem;
        }

        @media (max-width: 768px) {
            .main-content {
                grid-template-columns: 1fr;
            }
            
            .stats-grid {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="live-indicator">
        <div class="live-dot"></div>
        LIVE
    </div>

    <div class="header">
        <h1>🔴 LIVE DASHBOARD</h1>
        <p>Real-time monitoring of Neuro.Pilot.AI platform</p>
        <p style="color: #64748b; font-size: 0.9rem; margin-top: 10px;">
            Last updated: <span id="lastUpdate">Never</span>
        </p>
    </div>

    <div class="stats-grid" id="statsGrid">
        <div class="stat-card">
            <div class="stat-number" id="totalUsers">0</div>
            <div class="stat-label">Total Users</div>
            <div class="stat-change positive" id="todayUsers">+0 today</div>
        </div>
        <div class="stat-card">
            <div class="stat-number" id="totalOrders">0</div>
            <div class="stat-label">Total Orders</div>
            <div class="stat-change positive" id="todayOrders">+0 today</div>
        </div>
        <div class="stat-card">
            <div class="stat-number" id="totalRevenue">$0</div>
            <div class="stat-label">Total Revenue</div>
            <div class="stat-change positive" id="todayRevenue">+$0 today</div>
        </div>
        <div class="stat-card">
            <div class="stat-number" id="activeSessions">0</div>
            <div class="stat-label">Active Sessions</div>
            <div class="stat-change positive" id="conversionRate">0% conversion</div>
        </div>
    </div>

    <div class="main-content">
        <div class="panel">
            <div class="panel-header">
                <h3 class="panel-title">👥 Recent Users</h3>
                <span class="status-badge status-online">Live</span>
            </div>
            <div class="activity-feed" id="usersList">
                Loading users...
            </div>
        </div>

        <div class="panel">
            <div class="panel-header">
                <h3 class="panel-title">📦 Recent Orders</h3>
                <span class="status-badge status-online">Live</span>
            </div>
            <div class="activity-feed" id="ordersList">
                Loading orders...
            </div>
        </div>

        <div class="panel full-width">
            <div class="panel-header">
                <h3 class="panel-title">💻 System Information</h3>
                <span class="status-badge" id="systemStatus">Loading...</span>
            </div>
            <div class="system-info" id="systemInfo">
                Loading system information...
            </div>
        </div>

        <div class="panel full-width">
            <div class="panel-header">
                <h3 class="panel-title">📊 Revenue Chart</h3>
                <span class="status-badge status-online">Live</span>
            </div>
            <div class="chart-container">
                <canvas id="revenueChart"></canvas>
            </div>
        </div>
    </div>

    <script>
        // WebSocket connection
        const socket = io();
        let revenueChart;

        // Initialize dashboard
        document.addEventListener('DOMContentLoaded', function() {
            console.log('🔴 Live Dashboard initializing...');
            initializeChart();
            loadInitialData();
            
            // Socket event listeners
            socket.on('connect', () => {
                console.log('🔗 Connected to live updates');
                updateLastUpdate();
            });

            socket.on('stats_update', (stats) => {
                updateStats(stats);
                updateLastUpdate();
            });

            socket.on('orders_update', (orders) => {
                updateOrdersList(orders);
            });

            socket.on('system_update', (systemInfo) => {
                updateSystemInfo(systemInfo);
            });

            socket.on('disconnect', () => {
                console.log('❌ Disconnected from live updates');
            });
        });

        async function loadInitialData() {
            try {
                const [stats, users, orders, systemInfo] = await Promise.all([
                    fetch('/api/live/stats').then(r => r.json()),
                    fetch('/api/live/users').then(r => r.json()),
                    fetch('/api/live/orders').then(r => r.json()),
                    fetch('/api/live/system').then(r => r.json())
                ]);

                updateStats(stats);
                updateUsersList(users);
                updateOrdersList(orders);
                updateSystemInfo(systemInfo);
                updateLastUpdate();
            } catch (error) {
                console.error('Error loading initial data:', error);
            }
        }

        function updateStats(stats) {
            document.getElementById('totalUsers').textContent = stats.totalUsers || 0;
            document.getElementById('totalOrders').textContent = stats.totalOrders || 0;
            document.getElementById('totalRevenue').textContent = '$' + (stats.totalRevenue || 0).toLocaleString();
            document.getElementById('activeSessions').textContent = stats.activeSessions || 0;
            document.getElementById('todayUsers').textContent = '+' + (stats.todayUsers || 0) + ' today';
            document.getElementById('todayOrders').textContent = '+' + (stats.todayOrders || 0) + ' today';
            document.getElementById('todayRevenue').textContent = '+$' + (stats.todayRevenue || 0).toLocaleString() + ' today';
            document.getElementById('conversionRate').textContent = (stats.conversionRate || 0) + '% conversion';
        }

        function updateUsersList(users) {
            const container = document.getElementById('usersList');
            if (!users || users.length === 0) {
                container.innerHTML = '<div style="text-align: center; color: #6b7280; padding: 20px;">No users yet</div>';
                return;
            }

            const html = users.slice(0, 10).map(user => \`
                <div class="activity-item">
                    <div class="activity-icon user">👤</div>
                    <div class="activity-content">
                        <div class="activity-title">\${user.firstName || 'Unknown'} \${user.lastName || ''}</div>
                        <div class="activity-time">
                            \${user.email} • \${user.orderCount} orders • $\${user.totalSpent}
                            <br>Joined: \${new Date(user.createdAt).toLocaleDateString()}
                        </div>
                    </div>
                </div>
            \`).join('');
            
            container.innerHTML = html;
        }

        function updateOrdersList(orders) {
            const container = document.getElementById('ordersList');
            if (!orders || orders.length === 0) {
                container.innerHTML = '<div style="text-align: center; color: #6b7280; padding: 20px;">No orders yet</div>';
                return;
            }

            const html = orders.slice(0, 10).map(order => \`
                <div class="activity-item">
                    <div class="activity-icon order">📦</div>
                    <div class="activity-content">
                        <div class="activity-title">
                            \${order.package.charAt(0).toUpperCase() + order.package.slice(1)} Package - $\${order.price}
                        </div>
                        <div class="activity-time">
                            \${order.userEmail || 'Guest'} • \${order.status} • \${new Date(order.createdAt).toLocaleString()}
                        </div>
                    </div>
                </div>
            \`).join('');
            
            container.innerHTML = html;
        }

        function updateSystemInfo(systemInfo) {
            const container = document.getElementById('systemInfo');
            const statusBadge = document.getElementById('systemStatus');
            
            if (systemInfo.backendStatus === 'Online') {
                statusBadge.className = 'status-badge status-online';
                statusBadge.textContent = 'Online';
            } else {
                statusBadge.className = 'status-badge status-offline';
                statusBadge.textContent = 'Offline';
            }

            const html = \`
                <div class="info-item">
                    <div class="info-value">\${systemInfo.memoryUsage?.heapUsed || 0}MB</div>
                    <div class="info-label">Memory Used</div>
                </div>
                <div class="info-item">
                    <div class="info-value">\${Math.floor(systemInfo.uptime / 60) || 0}m</div>
                    <div class="info-label">Uptime</div>
                </div>
                <div class="info-item">
                    <div class="info-value">\${systemInfo.loadAverage?.[0]?.toFixed(2) || '0.00'}</div>
                    <div class="info-label">CPU Load</div>
                </div>
                <div class="info-item">
                    <div class="info-value">\${systemInfo.freeMemory || 0}GB</div>
                    <div class="info-label">Free Memory</div>
                </div>
                <div class="info-item">
                    <div class="info-value">\${systemInfo.platform || 'Unknown'}</div>
                    <div class="info-label">Platform</div>
                </div>
                <div class="info-item">
                    <div class="info-value">\${systemInfo.backendStatus || 'Unknown'}</div>
                    <div class="info-label">Backend Status</div>
                </div>
            \`;
            
            container.innerHTML = html;
        }

        function initializeChart() {
            const ctx = document.getElementById('revenueChart').getContext('2d');
            revenueChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        label: 'Revenue',
                        data: [],
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        tension: 0.4,
                        fill: true
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            labels: {
                                color: '#e5e7eb'
                            }
                        }
                    },
                    scales: {
                        x: {
                            ticks: {
                                color: '#9ca3af'
                            },
                            grid: {
                                color: '#374151'
                            }
                        },
                        y: {
                            ticks: {
                                color: '#9ca3af'
                            },
                            grid: {
                                color: '#374151'
                            }
                        }
                    }
                }
            });

            // Simulate real-time data
            setInterval(() => {
                const now = new Date();
                const timeLabel = now.toLocaleTimeString();
                const value = Math.floor(Math.random() * 1000) + 500;

                if (revenueChart.data.labels.length > 20) {
                    revenueChart.data.labels.shift();
                    revenueChart.data.datasets[0].data.shift();
                }

                revenueChart.data.labels.push(timeLabel);
                revenueChart.data.datasets[0].data.push(value);
                revenueChart.update('none');
            }, 5000);
        }

        function updateLastUpdate() {
            document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString();
        }
    </script>
</body>
</html>
        `;
    }

    start() {
        this.server.listen(this.port, () => {
            console.log(`🔴 Live Dashboard started on port ${this.port}`);
            console.log(`📊 Live Dashboard URL: http://localhost:${this.port}`);
            console.log(`🔗 Real-time monitoring active`);
        });
    }
}

// Start the live dashboard
if (require.main === module) {
    const dashboard = new LiveDashboard();
    dashboard.start();
}

module.exports = LiveDashboard;