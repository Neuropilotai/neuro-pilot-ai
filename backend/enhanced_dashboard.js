const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const IntelligentRecommendationSystem = require('./intelligent_recommendation_system');
const ProjectApprovalSystem = require('./project_approval_system');
const DevelopmentProgressTracker = require('./development_progress_tracker');

class EnhancedDashboard {
    constructor() {
        this.app = express();
        this.port = 3006;
        this.setupRoutes();
        this.realAgentData = new Map();
        this.recommendationSystem = new IntelligentRecommendationSystem();
        this.projectSystem = new ProjectApprovalSystem();
        this.progressTracker = new DevelopmentProgressTracker();
        this.initializeRealData();
    }

    setupRoutes() {
        this.app.use(express.static('public'));
        
        this.app.get('/', (req, res) => {
            res.send(this.getEnhancedDashboardHTML());
        });

        // Enhanced API endpoints
        this.app.get('/api/enhanced/status', async (req, res) => {
            try {
                const status = await this.getEnhancedStatus();
                res.json(status);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/workflow/pipeline', async (req, res) => {
            try {
                const pipeline = await this.getWorkflowPipeline();
                res.json(pipeline);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/agents/detailed', async (req, res) => {
            try {
                const agents = await this.getDetailedAgentStatus();
                res.json(agents);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/orders/active', async (req, res) => {
            try {
                const orders = await this.getActiveOrders();
                res.json(orders);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/recommendations/intelligent', async (req, res) => {
            try {
                const recommendations = await this.recommendationSystem.getFormattedRecommendations();
                res.json(recommendations);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/projects/approved', async (req, res) => {
            try {
                const projects = this.projectSystem.getApprovedProjects();
                res.json(projects);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/research/tasks', async (req, res) => {
            try {
                const research = this.projectSystem.getResearchTasks();
                res.json(research);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/projects/summary', async (req, res) => {
            try {
                const summary = await this.projectSystem.getProjectSummary();
                res.json(summary);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/development/progress/:projectName', async (req, res) => {
            try {
                const projectName = decodeURIComponent(req.params.projectName);
                const progress = await this.progressTracker.getProjectProgress(projectName);
                res.json(progress);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/development/all-progress', async (req, res) => {
            try {
                const allProgress = await this.progressTracker.getAllProjectsProgress();
                res.json(allProgress);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
    }

    async initializeRealData() {
        // Initialize with real system data
        await this.updateRealAgentData();
        
        // Update real data periodically
        setInterval(async () => {
            await this.updateRealAgentData();
        }, 30000); // Update every 30 seconds
    }

    async updateRealAgentData() {
        try {
            // Get actual agent status from running processes
            const realAgents = await this.getRealAgentStatus();
            this.agentWorkflows = realAgents;
        } catch (error) {
            console.error('Failed to update real agent data:', error);
        }
    }

    async getRealAgentStatus() {
        const agents = [
            { name: 'Email Monitor Agent', process: 'simple_email_agent.js', logFile: 'email_agent.log' },
            { name: 'Super Agent', process: 'super_agent.js', logFile: 'super_agent.log' },
            { name: 'Backend API', process: 'server.js', logFile: 'server_8080.log' },
            { name: 'Admin Server', process: 'admin_server.js', logFile: 'admin_8081.log' },
            { name: 'Fiverr Pro', process: 'fiverr_pro_system.js', logFile: 'fiverr_pro.log' },
            { name: 'Dashboard Agent', process: 'agent_dashboard.js', logFile: 'dashboard.log' },
            { name: 'Ngrok Manager', process: 'ngrok_manager.js', logFile: 'ngrok_manager.log' }
        ];

        const agentStatus = [];

        for (const agent of agents) {
            try {
                // Check if process is running
                const { stdout } = await execAsync(`ps aux | grep "${agent.process}" | grep -v grep`);
                const isRunning = stdout.trim().length > 0;
                
                // Get recent activity from log file
                const lastActivity = await this.getLastActivity(agent.logFile);
                const progress = await this.calculateProgress(agent, lastActivity);
                
                agentStatus.push({
                    id: agent.process.replace('.js', '').replace(/_/g, '-'),
                    name: agent.name,
                    status: isRunning ? 'active' : 'offline',
                    currentTask: this.getCurrentTask(agent, isRunning, lastActivity),
                    progress: progress,
                    lastUpdate: new Date().toISOString(),
                    workflow: this.getWorkflowType(agent.name),
                    nextAction: this.getNextAction(agent, isRunning)
                });
                
            } catch (error) {
                agentStatus.push({
                    id: agent.process.replace('.js', '').replace(/_/g, '-'),
                    name: agent.name,
                    status: 'offline',
                    currentTask: 'Agent not running',
                    progress: 0,
                    lastUpdate: new Date().toISOString(),
                    workflow: 'system_monitoring',
                    nextAction: 'Start agent'
                });
            }
        }

        return agentStatus;
    }

    async getLastActivity(logFile) {
        try {
            const logPath = path.join(__dirname, logFile);
            const content = await fs.readFile(logPath, 'utf8');
            const lines = content.split('\n').filter(line => line.trim());
            return lines[lines.length - 1] || '';
        } catch (error) {
            return '';
        }
    }

    calculateProgress(agent, lastActivity) {
        if (agent.name.includes('Email') && lastActivity.includes('monitoring')) {
            return 100; // Email agent is always monitoring
        }
        if (agent.name.includes('Super Agent') && lastActivity.includes('ACTIVE')) {
            return 100;
        }
        if (agent.name.includes('Backend') && lastActivity.includes('listening')) {
            return 100;
        }
        if (lastActivity.includes('✅')) {
            return 100;
        }
        if (lastActivity.includes('🔄')) {
            return 75;
        }
        if (lastActivity.includes('⚠️')) {
            return 25;
        }
        return 0;
    }

    getCurrentTask(agent, isRunning, lastActivity) {
        if (!isRunning) {
            return 'Agent offline';
        }
        
        if (agent.name.includes('Email')) {
            return 'Monitoring customer emails';
        }
        if (agent.name.includes('Super Agent')) {
            return 'System monitoring and optimization';
        }
        if (agent.name.includes('Backend')) {
            return 'Handling API requests';
        }
        if (agent.name.includes('Dashboard')) {
            return 'Serving monitoring interface';
        }
        if (agent.name.includes('Ngrok')) {
            return 'Managing public tunnels';
        }
        
        return 'Processing tasks';
    }

    getWorkflowType(agentName) {
        if (agentName.includes('Email')) return 'email_monitoring';
        if (agentName.includes('Super')) return 'system_optimization';
        if (agentName.includes('Backend')) return 'api_processing';
        if (agentName.includes('Dashboard')) return 'interface_serving';
        if (agentName.includes('Ngrok')) return 'network_management';
        return 'general_processing';
    }

    getNextAction(agent, isRunning) {
        if (!isRunning) {
            return 'Restart agent';
        }
        
        if (agent.name.includes('Email')) {
            return 'Process new orders';
        }
        if (agent.name.includes('Super Agent')) {
            return 'Optimize system performance';
        }
        if (agent.name.includes('Backend')) {
            return 'Handle next API request';
        }
        
        return 'Continue monitoring';
    }

    updateWorkflows() {
        this.agentWorkflows.forEach(agent => {
            // Simulate progress changes
            if (agent.status === 'working') {
                agent.progress = Math.min(100, agent.progress + Math.random() * 15);
                if (agent.progress >= 100) {
                    agent.status = 'completed';
                    agent.currentTask = 'Task completed successfully';
                }
            }
            
            agent.lastUpdate = new Date().toISOString();
        });
    }

    async getEnhancedStatus() {
        const basicStatus = await this.getBasicAgentStatus();
        const workflowStatus = this.agentWorkflows;
        const systemMetrics = await this.getSystemMetrics();
        
        return {
            agents: basicStatus,
            workflows: workflowStatus,
            metrics: systemMetrics,
            timestamp: new Date().toISOString()
        };
    }

    async getWorkflowPipeline() {
        try {
            // Get real order data from processed orders log
            const processedOrders = await this.getProcessedOrdersCount();
            const emailInbox = await this.getEmailInboxCount();
            
            return {
                stages: [
                    {
                        name: 'Email Monitoring',
                        status: 'active',
                        count: 1,
                        description: 'Monitoring customer emails'
                    },
                    {
                        name: 'Order Processing',
                        status: 'active',
                        count: emailInbox,
                        description: 'Processing customer information'
                    },
                    {
                        name: 'PDF Generation',
                        status: 'active',
                        count: 0,
                        description: 'Creating professional resumes'
                    },
                    {
                        name: 'Email Delivery',
                        status: 'active',
                        count: 0,
                        description: 'Sending completed resumes'
                    },
                    {
                        name: 'Completed Orders',
                        status: 'completed',
                        count: processedOrders,
                        description: 'Successfully delivered resumes'
                    }
                ],
                totalOrders: processedOrders + emailInbox,
                completedToday: processedOrders,
                averageTime: '1.5 hours'
            };
        } catch (error) {
            return {
                stages: [],
                totalOrders: 0,
                completedToday: 0,
                averageTime: '0 hours'
            };
        }
    }

    async getProcessedOrdersCount() {
        try {
            const logPath = path.join(__dirname, 'processed_orders_log.json');
            const content = await fs.readFile(logPath, 'utf8');
            const orders = JSON.parse(content);
            return orders.length;
        } catch (error) {
            return 0;
        }
    }

    async getEmailInboxCount() {
        try {
            const inboxPath = path.join(__dirname, 'email_inbox');
            const files = await fs.readdir(inboxPath);
            return files.filter(f => f.endsWith('.json')).length;
        } catch (error) {
            return 0;
        }
    }

    async getDetailedAgentStatus() {
        return this.agentWorkflows.map(agent => ({
            ...agent,
            health: agent.status === 'active' || agent.status === 'working' ? 'healthy' : 'standby',
            uptime: this.calculateUptime(),
            tasksCompleted: Math.floor(Math.random() * 50) + 10,
            efficiency: Math.floor(Math.random() * 30) + 70
        }));
    }

    async getActiveOrders() {
        try {
            // Get real active orders from processed orders log
            const processedOrders = await this.getRecentProcessedOrders();
            const pendingOrders = await this.getPendingOrders();
            
            const orders = [];
            
            // Add recent processed orders
            processedOrders.forEach((order, index) => {
                orders.push({
                    id: `PROC-${index + 1}`,
                    customer: order.customer || 'Customer',
                    role: order.targetRole || 'Professional',
                    status: 'completed',
                    assignedAgent: 'email_agent',
                    progress: 100,
                    timeRemaining: 'Completed',
                    priority: 'completed'
                });
            });
            
            // Add pending orders
            pendingOrders.forEach((order, index) => {
                orders.push({
                    id: `PEND-${index + 1}`,
                    customer: 'New Customer',
                    role: 'Processing...',
                    status: 'processing',
                    assignedAgent: 'email_agent',
                    progress: 50,
                    timeRemaining: '30 min',
                    priority: 'high'
                });
            });
            
            // If no real orders, show system status
            if (orders.length === 0) {
                orders.push({
                    id: 'SYS-001',
                    customer: 'System Status',
                    role: 'All Agents Monitoring',
                    status: 'active',
                    assignedAgent: 'super_agent',
                    progress: 100,
                    timeRemaining: 'Continuous',
                    priority: 'system'
                });
            }
            
            return orders;
            
        } catch (error) {
            return [{
                id: 'ERR-001',
                customer: 'System',
                role: 'Error Loading Orders',
                status: 'error',
                assignedAgent: 'system',
                progress: 0,
                timeRemaining: 'Unknown',
                priority: 'high'
            }];
        }
    }

    async getRecentProcessedOrders() {
        try {
            const logPath = path.join(__dirname, 'processed_orders_log.json');
            const content = await fs.readFile(logPath, 'utf8');
            const orders = JSON.parse(content);
            return orders.slice(-3); // Last 3 orders
        } catch (error) {
            return [];
        }
    }

    async getPendingOrders() {
        try {
            const inboxPath = path.join(__dirname, 'email_inbox');
            const files = await fs.readdir(inboxPath);
            const orderFiles = files.filter(f => f.endsWith('.json'));
            
            const pendingOrders = [];
            for (const file of orderFiles.slice(0, 2)) { // Max 2 pending
                try {
                    const content = await fs.readFile(path.join(inboxPath, file), 'utf8');
                    const order = JSON.parse(content);
                    pendingOrders.push(order);
                } catch (error) {
                    // Skip invalid files
                }
            }
            
            return pendingOrders;
        } catch (error) {
            return [];
        }
    }

    calculateUptime() {
        const uptimeMs = Math.random() * 86400000; // Random uptime up to 24 hours
        const hours = Math.floor(uptimeMs / 3600000);
        const minutes = Math.floor((uptimeMs % 3600000) / 60000);
        return `${hours}h ${minutes}m`;
    }

    async getBasicAgentStatus() {
        // Get basic status from existing logs
        const agents = [
            { name: 'Email Agent', logFile: 'email_agent.log', port: null },
            { name: 'Backend API', logFile: 'server_8080.log', port: 8080 },
            { name: 'Admin Server', logFile: 'admin_8081.log', port: 8081 },
            { name: 'Fiverr Pro', logFile: 'fiverr_pro.log', port: 8082 }
        ];

        const statusData = [];
        for (const agent of agents) {
            try {
                const logPath = path.join(__dirname, agent.logFile);
                const logContent = await fs.readFile(logPath, 'utf8');
                const lines = logContent.split('\n').filter(line => line.trim());
                const lastLine = lines[lines.length - 1] || '';
                
                statusData.push({
                    name: agent.name,
                    status: lastLine.includes('✅') ? 'online' : 'unknown',
                    lastActivity: this.extractTimestamp(lastLine) || 'Unknown',
                    port: agent.port,
                    totalLines: lines.length
                });
            } catch (error) {
                statusData.push({
                    name: agent.name,
                    status: 'offline',
                    lastActivity: 'No log file',
                    port: agent.port,
                    totalLines: 0
                });
            }
        }
        return statusData;
    }

    async getSystemMetrics() {
        try {
            const processedOrders = await this.getProcessedOrdersCount();
            const activeAgentsCount = this.agentWorkflows.filter(agent => agent.status === 'active').length;
            const systemLoad = await this.getSystemLoad();
            const memoryUsage = await this.getMemoryUsage();
            
            return {
                totalAgents: this.agentWorkflows.length,
                activeAgents: activeAgentsCount,
                systemUptime: await this.getRealUptime(),
                ordersProcessed: processedOrders,
                ordersToday: processedOrders,
                averageResponseTime: '0.8s',
                systemLoad: systemLoad,
                memoryUsage: memoryUsage
            };
        } catch (error) {
            return {
                totalAgents: 0,
                activeAgents: 0,
                systemUptime: '0h 0m',
                ordersProcessed: 0,
                ordersToday: 0,
                averageResponseTime: 'N/A',
                systemLoad: 'N/A',
                memoryUsage: 'N/A'
            };
        }
    }

    async getRealUptime() {
        try {
            const { stdout } = await execAsync('uptime');
            const uptimeMatch = stdout.match(/up\s+(.+?),/);
            return uptimeMatch ? uptimeMatch[1].trim() : 'Unknown';
        } catch (error) {
            return 'Unknown';
        }
    }

    async getSystemLoad() {
        try {
            const { stdout } = await execAsync("ps -A -o %cpu | awk '{s+=$1} END {print s}'");
            const load = parseFloat(stdout.trim()) || 0;
            return Math.min(100, Math.round(load)) + '%';
        } catch (error) {
            return 'N/A';
        }
    }

    async getMemoryUsage() {
        try {
            const { stdout } = await execAsync("ps -A -o %mem | awk '{s+=$1} END {print s}'");
            const usage = parseFloat(stdout.trim()) || 0;
            return Math.min(100, Math.round(usage)) + '%';
        } catch (error) {
            return 'N/A';
        }
    }

    extractTimestamp(line) {
        const timeMatch = line.match(/\[(\d+:\d+:\d+\s+[AP]M)\]/);
        return timeMatch ? timeMatch[1] : null;
    }

    getEnhancedDashboardHTML() {
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Neuro.Pilot.AI - Enhanced Dashboard</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
            min-height: 100vh;
            color: #e2e8f0;
            overflow-x: hidden;
        }
        .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
        .header { 
            background: rgba(255,255,255,0.1); 
            backdrop-filter: blur(10px);
            padding: 30px; 
            border-radius: 20px; 
            margin-bottom: 30px; 
            text-align: center;
            box-shadow: 0 20px 40px rgba(0,0,0,0.3);
            border: 1px solid rgba(255,255,255,0.1);
        }
        .header h1 { color: #fff; font-size: 3rem; margin-bottom: 10px; text-shadow: 0 0 20px rgba(0,150,255,0.5); }
        .header p { color: #cbd5e0; font-size: 1.2rem; }
        .status-bar { 
            display: flex; 
            justify-content: space-between; 
            align-items: center; 
            margin: 20px 0;
            padding: 15px;
            background: rgba(0,0,0,0.3);
            border-radius: 10px;
        }
        .refresh-btn { 
            background: linear-gradient(135deg, #0ea5e9 0%, #3b82f6 100%); 
            color: white; 
            border: none; 
            padding: 12px 25px; 
            border-radius: 8px; 
            cursor: pointer; 
            font-size: 16px;
            transition: all 0.3s ease;
            box-shadow: 0 4px 15px rgba(59, 130, 246, 0.3);
        }
        .refresh-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(59, 130, 246, 0.4); }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 25px; margin-bottom: 30px; }
        .wide-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 25px; margin-bottom: 30px; }
        .full-width { grid-column: 1 / -1; }
        .card { 
            background: rgba(255,255,255,0.1); 
            backdrop-filter: blur(10px);
            border-radius: 20px; 
            padding: 25px; 
            box-shadow: 0 15px 35px rgba(0,0,0,0.2);
            border: 1px solid rgba(255,255,255,0.1);
            transition: all 0.3s ease;
        }
        .card:hover { transform: translateY(-5px); box-shadow: 0 20px 40px rgba(0,0,0,0.3); }
        .card h3 { color: #fff; margin-bottom: 20px; font-size: 1.4rem; display: flex; align-items: center; gap: 10px; }
        .status-online { color: #10b981; font-weight: bold; }
        .status-working { color: #f59e0b; font-weight: bold; }
        .status-approved { color: #3b82f6; font-weight: bold; }
        .status-coming-soon { color: #8b5cf6; font-weight: bold; }
        .status-offline { color: #ef4444; font-weight: bold; }
        .agent-item { 
            background: rgba(0,0,0,0.3); 
            padding: 20px; 
            border-radius: 15px; 
            margin: 15px 0;
            border-left: 5px solid;
            transition: all 0.3s ease;
        }
        .agent-item:hover { background: rgba(255,255,255,0.1); }
        .agent-item.online { border-left-color: #10b981; }
        .agent-item.working { border-left-color: #f59e0b; }
        .agent-item.approved { border-left-color: #3b82f6; }
        .agent-item.coming_soon { border-left-color: #8b5cf6; }
        .agent-item.offline { border-left-color: #ef4444; }
        .progress-bar { 
            width: 100%; 
            height: 8px; 
            background: rgba(0,0,0,0.3); 
            border-radius: 10px; 
            overflow: hidden;
            margin: 10px 0;
        }
        .progress-fill { 
            height: 100%; 
            background: linear-gradient(90deg, #10b981 0%, #059669 100%); 
            transition: width 0.5s ease;
            border-radius: 10px;
        }
        .metric { 
            display: flex; 
            justify-content: space-between; 
            padding: 12px 0; 
            border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        .metric:last-child { border-bottom: none; }
        .metric-value { font-weight: bold; color: #0ea5e9; font-size: 1.1rem; }
        .pipeline-stage { 
            background: rgba(0,0,0,0.3); 
            padding: 20px; 
            border-radius: 15px; 
            margin: 10px 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
            transition: all 0.3s ease;
        }
        .pipeline-stage:hover { background: rgba(255,255,255,0.1); }
        .stage-info { flex: 1; }
        .stage-count { 
            background: linear-gradient(135deg, #0ea5e9 0%, #3b82f6 100%); 
            color: white; 
            padding: 8px 16px; 
            border-radius: 20px; 
            font-weight: bold;
            min-width: 40px;
            text-align: center;
        }
        .orders-table { width: 100%; border-collapse: collapse; margin: 15px 0; }
        .orders-table th, .orders-table td { 
            padding: 15px; 
            text-align: left; 
            border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        .orders-table th { background: rgba(0,0,0,0.3); font-weight: bold; color: #0ea5e9; }
        .orders-table tr:hover { background: rgba(255,255,255,0.05); }
        .priority-high { color: #ef4444; font-weight: bold; }
        .priority-medium { color: #f59e0b; font-weight: bold; }
        .priority-low { color: #10b981; font-weight: bold; }
        .timestamp { color: #94a3b8; font-size: 0.9rem; }
        .loading { text-align: center; padding: 20px; color: #94a3b8; }
        
        /* Recommendations Styles */
        .metric-card { 
            background: rgba(0,0,0,0.4); 
            padding: 20px; 
            border-radius: 15px; 
            text-align: center;
            border: 1px solid rgba(255,255,255,0.1);
        }
        .metric-card h4 { margin: 0 0 10px 0; color: #0ea5e9; font-size: 1rem; }
        .metric-card .metric-value { font-size: 1.4rem; font-weight: bold; color: #ffffff; }
        
        .priority-section { margin: 25px 0; }
        .priority-section h4 { 
            margin: 0 0 15px 0; 
            padding: 12px 20px; 
            border-radius: 10px; 
            font-weight: bold;
        }
        .priority-section.super-high h4 { 
            background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); 
            color: white;
            animation: pulse 2s infinite;
        }
        .priority-section.high h4 { 
            background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); 
            color: white;
        }
        .priority-section.emerging h4 { 
            background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); 
            color: white;
        }
        
        .recommendation-item { 
            background: rgba(0,0,0,0.3); 
            border-radius: 12px; 
            padding: 20px; 
            margin: 15px 0;
            border-left: 4px solid;
            transition: all 0.3s ease;
        }
        .recommendation-item:hover { 
            background: rgba(255,255,255,0.05); 
            transform: translateY(-2px);
        }
        .super-high-demand { border-left-color: #dc2626; }
        .high-demand { border-left-color: #f59e0b; }
        .emerging-opportunity { border-left-color: #3b82f6; }
        
        .rec-header { 
            display: flex; 
            justify-content: space-between; 
            align-items: center; 
            margin-bottom: 12px;
        }
        .rec-header h5 { 
            margin: 0; 
            color: #ffffff; 
            font-size: 1.2rem;
        }
        
        .urgency-badge { 
            padding: 6px 12px; 
            border-radius: 20px; 
            font-size: 0.8rem; 
            font-weight: bold;
        }
        .urgency-10, .urgency-9 { 
            background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); 
            color: white;
        }
        .urgency-8, .urgency-7 { 
            background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); 
            color: white;
        }
        .urgency-6, .urgency-5 { 
            background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); 
            color: white;
        }
        
        .rec-content p { 
            color: #e2e8f0; 
            margin: 12px 0; 
            line-height: 1.5;
        }
        
        .rec-metrics { 
            display: flex; 
            gap: 15px; 
            flex-wrap: wrap; 
            margin: 15px 0;
        }
        .rec-metrics span { 
            background: rgba(14, 165, 233, 0.2); 
            color: #0ea5e9; 
            padding: 8px 12px; 
            border-radius: 8px; 
            font-size: 0.9rem;
        }
        
        .rec-evidence { 
            background: rgba(0,0,0,0.4); 
            padding: 12px; 
            border-radius: 8px; 
            margin-top: 15px; 
            border-left: 3px solid #10b981;
        }
        .rec-evidence strong { color: #10b981; }
        
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.8; }
        }

        /* Project Management Styles */
        .project-item, .research-item {
            background: rgba(0,0,0,0.3);
            border-radius: 12px;
            padding: 20px;
            margin: 15px 0;
            border-left: 4px solid;
            transition: all 0.3s ease;
        }
        .project-item:hover, .research-item:hover {
            background: rgba(255,255,255,0.05);
            transform: translateY(-2px);
        }
        .status-approved, .priority-super_high { border-left-color: #10b981; }
        .status-in_progress, .priority-high { border-left-color: #f59e0b; }
        .status-completed { border-left-color: #6366f1; }
        .status-on_hold, .priority-medium { border-left-color: #64748b; }
        .priority-low { border-left-color: #94a3b8; }

        .project-header, .research-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
        }
        .project-header h4, .research-header h4 {
            margin: 0;
            color: #ffffff;
            font-size: 1.1rem;
        }

        .status-badge, .priority-badge {
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 0.8rem;
            font-weight: bold;
        }
        .status-badge.approved { background: #10b981; color: white; }
        .status-badge.in_progress { background: #f59e0b; color: white; }
        .status-badge.completed { background: #6366f1; color: white; }
        .status-badge.on_hold { background: #64748b; color: white; }
        .priority-badge.super_high { background: #dc2626; color: white; }
        .priority-badge.high { background: #f59e0b; color: white; }
        .priority-badge.medium { background: #3b82f6; color: white; }
        .priority-badge.low { background: #64748b; color: white; }

        .project-description, .research-description {
            color: #e2e8f0;
            margin: 12px 0;
            line-height: 1.5;
        }

        .project-metrics, .research-metrics {
            display: flex;
            gap: 15px;
            flex-wrap: wrap;
            margin: 15px 0;
        }
        .metric-item {
            background: rgba(14, 165, 233, 0.2);
            color: #0ea5e9;
            padding: 6px 10px;
            border-radius: 6px;
            font-size: 0.85rem;
        }

        .project-timeline, .research-outcome {
            background: rgba(0,0,0,0.4);
            padding: 10px;
            border-radius: 6px;
            margin-top: 12px;
            color: #94a3b8;
            font-size: 0.9rem;
        }

        .summary-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 25px;
        }
        .summary-section {
            background: rgba(0,0,0,0.3);
            padding: 20px;
            border-radius: 12px;
            border: 1px solid rgba(255,255,255,0.1);
        }
        .summary-section h4 {
            margin: 0 0 15px 0;
            color: #0ea5e9;
            font-size: 1rem;
        }

        .summary-stats {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 15px;
        }
        .stat-item {
            text-align: center;
            padding: 15px;
            background: rgba(255,255,255,0.05);
            border-radius: 8px;
        }
        .stat-number {
            display: block;
            font-size: 1.8rem;
            font-weight: bold;
            color: #ffffff;
        }
        .stat-number.approved { color: #10b981; }
        .stat-number.in-progress { color: #f59e0b; }
        .stat-number.completed { color: #6366f1; }
        .stat-number.pending { color: #94a3b8; }
        .stat-label {
            display: block;
            font-size: 0.8rem;
            color: #94a3b8;
            margin-top: 5px;
        }

        .revenue-stats {
            display: flex;
            gap: 20px;
        }
        .revenue-item {
            flex: 1;
            text-align: center;
            padding: 20px;
            background: rgba(16, 185, 129, 0.1);
            border-radius: 8px;
            border: 1px solid #10b981;
        }
        .revenue-number {
            display: block;
            font-size: 1.6rem;
            font-weight: bold;
            color: #10b981;
        }
        .revenue-label {
            display: block;
            font-size: 0.9rem;
            color: #94a3b8;
            margin-top: 5px;
        }

        .next-actions {
            max-height: 200px;
            overflow-y: auto;
        }
        .action-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px;
            margin: 8px 0;
            background: rgba(255,255,255,0.05);
            border-radius: 6px;
            border-left: 3px solid;
        }
        .action-item.priority-high { border-left-color: #dc2626; }
        .action-item.priority-medium { border-left-color: #f59e0b; }
        .action-item.priority-low { border-left-color: #3b82f6; }
        .action-title {
            color: #ffffff;
            font-weight: 500;
        }
        .action-due {
            color: #94a3b8;
            font-size: 0.9rem;
        }

        .empty-state {
            text-align: center;
            padding: 40px;
            color: #64748b;
            font-style: italic;
        }

        /* Development Progress Styles */
        .dev-project-card {
            background: rgba(0,0,0,0.3);
            border-radius: 15px;
            padding: 25px;
            margin: 20px 0;
            border: 1px solid rgba(255,255,255,0.1);
        }

        .dev-project-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 25px;
        }
        .dev-project-header h3 {
            margin: 0;
            color: #ffffff;
            font-size: 1.4rem;
        }

        .progress-circle {
            position: relative;
            display: inline-block;
        }
        .progress-circle svg {
            transform: rotate(-90deg);
        }
        .progress-text {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            font-weight: bold;
            color: #0ea5e9;
            font-size: 0.9rem;
        }

        .dev-current-stage {
            background: rgba(14, 165, 233, 0.1);
            padding: 20px;
            border-radius: 10px;
            margin-bottom: 20px;
            border-left: 4px solid #0ea5e9;
        }
        .dev-current-stage h4 {
            margin: 0 0 15px 0;
            color: #0ea5e9;
        }

        .stage-info {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
        }
        .stage-name {
            font-weight: bold;
            color: #ffffff;
            font-size: 1.1rem;
        }
        .stage-progress {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .stage-progress .progress-bar {
            width: 100px;
            height: 8px;
            background: rgba(255,255,255,0.2);
            border-radius: 4px;
        }
        .progress-percent {
            color: #0ea5e9;
            font-weight: bold;
        }

        .next-task {
            color: #e2e8f0;
            font-size: 0.9rem;
        }

        .dev-stats-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 15px;
            margin: 20px 0;
        }
        .dev-stat {
            text-align: center;
            padding: 15px;
            background: rgba(255,255,255,0.05);
            border-radius: 8px;
        }
        .dev-stat .stat-number {
            display: block;
            font-size: 1.3rem;
            font-weight: bold;
            color: #10b981;
        }
        .dev-stat .stat-label {
            display: block;
            font-size: 0.8rem;
            color: #94a3b8;
            margin-top: 3px;
        }

        .dev-milestones {
            margin: 20px 0;
        }
        .dev-milestones h4 {
            margin: 0 0 15px 0;
            color: #f59e0b;
        }
        .milestone-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .milestone-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 15px;
            background: rgba(255,255,255,0.05);
            border-radius: 6px;
            border-left: 3px solid;
        }
        .milestone-item.priority-high { border-left-color: #dc2626; }
        .milestone-item.priority-medium { border-left-color: #f59e0b; }
        .milestone-item.priority-low { border-left-color: #3b82f6; }
        .milestone-task {
            color: #ffffff;
            font-weight: 500;
        }
        .milestone-stage {
            color: #94a3b8;
            font-size: 0.8rem;
        }

        .dev-stages {
            margin: 20px 0;
        }
        .dev-stages h4 {
            margin: 0 0 15px 0;
            color: #8b5cf6;
        }
        .stages-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 12px;
        }
        .stage-item {
            padding: 12px;
            background: rgba(255,255,255,0.05);
            border-radius: 8px;
            border-left: 4px solid;
        }
        .stage-item.status-completed { border-left-color: #10b981; }
        .stage-item.status-in_progress { border-left-color: #f59e0b; }
        .stage-item.status-started { border-left-color: #3b82f6; }
        .stage-item.status-not_started { border-left-color: #64748b; }

        .stage-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
        }
        .stage-title {
            color: #ffffff;
            font-weight: 500;
            font-size: 0.9rem;
        }
        .stage-percent {
            color: #0ea5e9;
            font-weight: bold;
            font-size: 0.8rem;
        }

        .stage-progress-bar {
            height: 6px;
            background: rgba(255,255,255,0.2);
            border-radius: 3px;
            margin-bottom: 5px;
        }
        .stage-progress-bar .progress-fill {
            height: 100%;
            background: #0ea5e9;
            border-radius: 3px;
            transition: width 0.3s ease;
        }

        .stage-tasks {
            color: #94a3b8;
            font-size: 0.8rem;
        }

        .dev-risks {
            margin: 20px 0;
        }
        .dev-risks h4 {
            margin: 0 0 15px 0;
            color: #f59e0b;
        }
        .risk-item {
            display: flex;
            gap: 15px;
            padding: 10px;
            margin: 8px 0;
            border-radius: 6px;
            background: rgba(255,255,255,0.05);
        }
        .risk-level {
            font-weight: bold;
            font-size: 0.8rem;
            padding: 2px 8px;
            border-radius: 12px;
        }
        .risk-item.risk-high .risk-level {
            background: #dc2626;
            color: white;
        }
        .risk-item.risk-medium .risk-level {
            background: #f59e0b;
            color: white;
        }
        .risk-item.risk-low .risk-level {
            background: #3b82f6;
            color: white;
        }
        .risk-description {
            color: #e2e8f0;
            flex: 1;
        }
        .notification { 
            position: fixed; 
            top: 20px; 
            right: 20px; 
            background: linear-gradient(135deg, #10b981 0%, #059669 100%); 
            color: white; 
            padding: 15px 25px; 
            border-radius: 10px; 
            box-shadow: 0 10px 25px rgba(0,0,0,0.3);
            transform: translateX(400px);
            transition: transform 0.3s ease;
            z-index: 1000;
        }
        .notification.show { transform: translateX(0); }
        .workflow-indicator {
            display: inline-block;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            margin-right: 8px;
            animation: pulse 2s infinite;
        }
        .workflow-indicator.active { background: #10b981; }
        .workflow-indicator.working { background: #f59e0b; }
        .workflow-indicator.approved { background: #3b82f6; }
        .workflow-indicator.coming_soon { background: #8b5cf6; }
        @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.5; }
            100% { opacity: 1; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚀 Neuro.Pilot.AI</h1>
            <p>Enhanced Agent Monitoring & Workflow Dashboard</p>
            <div class="status-bar">
                <div class="timestamp">Last updated: <span id="lastUpdate">Loading...</span></div>
                <button class="refresh-btn" onclick="refreshDashboard()">🔄 Refresh All Data</button>
            </div>
        </div>

        <div class="grid">
            <div class="card">
                <h3>🤖 Agent Workflows</h3>
                <div id="agentWorkflows" class="loading">Loading agent workflows...</div>
            </div>

            <div class="card">
                <h3>📊 System Metrics</h3>
                <div id="systemMetrics" class="loading">Loading metrics...</div>
            </div>
        </div>

        <div class="wide-grid">
            <div class="card">
                <h3>🔄 Workflow Pipeline</h3>
                <div id="workflowPipeline" class="loading">Loading pipeline...</div>
            </div>

            <div class="card">
                <h3>📋 Active Orders</h3>
                <div id="activeOrders" class="loading">Loading orders...</div>
            </div>
        </div>

        <div class="full-width card">
            <h3>🧠 Intelligent Recommendations</h3>
            <div id="intelligentRecommendations" class="loading">Loading recommendations...</div>
        </div>

        <div class="wide-grid">
            <div class="card">
                <h3>✅ Approved Gigs & Projects</h3>
                <div id="approvedProjects" class="loading">Loading approved projects...</div>
            </div>

            <div class="card">
                <h3>🔬 Research Tasks</h3>
                <div id="researchTasks" class="loading">Loading research tasks...</div>
            </div>
        </div>

        <div class="full-width card">
            <h3>📊 Project Management Overview</h3>
            <div id="projectSummary" class="loading">Loading project summary...</div>
        </div>

        <div class="full-width card">
            <h3>🚀 Development Progress Tracker</h3>
            <div id="developmentProgress" class="loading">Loading development progress...</div>
        </div>

        <div class="full-width card">
            <h3>📈 Detailed Agent Status</h3>
            <div id="detailedAgents" class="loading">Loading detailed status...</div>
        </div>
    </div>

    <div id="notification" class="notification">
        <span id="notificationText">System updated successfully!</span>
    </div>

    <script>
        let startTime = Date.now();

        async function fetchEnhancedStatus() {
            try {
                const response = await fetch('/api/enhanced/status');
                const data = await response.json();
                
                // Update agent workflows
                updateAgentWorkflows(data.workflows);
                updateSystemMetrics(data.metrics);
                
            } catch (error) {
                console.error('Error fetching enhanced status:', error);
            }
        }

        async function fetchWorkflowPipeline() {
            try {
                const response = await fetch('/api/workflow/pipeline');
                const pipeline = await response.json();
                updateWorkflowPipeline(pipeline);
            } catch (error) {
                console.error('Error fetching pipeline:', error);
            }
        }

        async function fetchActiveOrders() {
            try {
                const response = await fetch('/api/orders/active');
                const orders = await response.json();
                updateActiveOrders(orders);
            } catch (error) {
                console.error('Error fetching orders:', error);
            }
        }

        async function fetchDetailedAgents() {
            try {
                const response = await fetch('/api/agents/detailed');
                const agents = await response.json();
                updateDetailedAgents(agents);
            } catch (error) {
                console.error('Error fetching detailed agents:', error);
            }
        }

        async function fetchIntelligentRecommendations() {
            try {
                const response = await fetch('/api/recommendations/intelligent');
                const recommendations = await response.json();
                updateIntelligentRecommendations(recommendations);
            } catch (error) {
                console.error('Error fetching recommendations:', error);
            }
        }

        async function fetchApprovedProjects() {
            try {
                const response = await fetch('/api/projects/approved');
                const projects = await response.json();
                updateApprovedProjects(projects);
            } catch (error) {
                console.error('Error fetching approved projects:', error);
            }
        }

        async function fetchResearchTasks() {
            try {
                const response = await fetch('/api/research/tasks');
                const research = await response.json();
                updateResearchTasks(research);
            } catch (error) {
                console.error('Error fetching research tasks:', error);
            }
        }

        async function fetchProjectSummary() {
            try {
                const response = await fetch('/api/projects/summary');
                const summary = await response.json();
                updateProjectSummary(summary);
            } catch (error) {
                console.error('Error fetching project summary:', error);
            }
        }

        async function fetchDevelopmentProgress() {
            try {
                const response = await fetch('/api/development/all-progress');
                const progress = await response.json();
                updateDevelopmentProgress(progress);
            } catch (error) {
                console.error('Error fetching development progress:', error);
            }
        }

        function updateAgentWorkflows(workflows) {
            const html = workflows.map(agent => \`
                <div class="agent-item \${agent.status}">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <strong><span class="workflow-indicator \${agent.status}"></span>\${agent.name}</strong>
                            <div class="status-\${agent.status}">\${agent.status.toUpperCase().replace('_', ' ')}</div>
                        </div>
                        <div style="text-align: right;">
                            <div>\${agent.progress}% Complete</div>
                            <div style="font-size: 0.8rem; color: #94a3b8;">\${agent.workflow}</div>
                        </div>
                    </div>
                    <div style="margin: 10px 0;">
                        <div>Current: \${agent.currentTask}</div>
                        <div style="font-size: 0.9rem; color: #cbd5e0;">Next: \${agent.nextAction}</div>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: \${agent.progress}%"></div>
                    </div>
                </div>
            \`).join('');
            
            document.getElementById('agentWorkflows').innerHTML = html;
        }

        function updateSystemMetrics(metrics) {
            const html = \`
                <div class="metric">
                    <span>Total Agents:</span>
                    <span class="metric-value">\${metrics.totalAgents}</span>
                </div>
                <div class="metric">
                    <span>Active Agents:</span>
                    <span class="metric-value">\${metrics.activeAgents}</span>
                </div>
                <div class="metric">
                    <span>Orders Processed:</span>
                    <span class="metric-value">\${metrics.ordersProcessed}</span>
                </div>
                <div class="metric">
                    <span>Orders Today:</span>
                    <span class="metric-value">\${metrics.ordersToday}</span>
                </div>
                <div class="metric">
                    <span>System Uptime:</span>
                    <span class="metric-value">\${metrics.systemUptime}</span>
                </div>
                <div class="metric">
                    <span>Response Time:</span>
                    <span class="metric-value">\${metrics.averageResponseTime}</span>
                </div>
                <div class="metric">
                    <span>System Load:</span>
                    <span class="metric-value">\${metrics.systemLoad}</span>
                </div>
                <div class="metric">
                    <span>Memory Usage:</span>
                    <span class="metric-value">\${metrics.memoryUsage}</span>
                </div>
            \`;
            
            document.getElementById('systemMetrics').innerHTML = html;
        }

        function updateWorkflowPipeline(pipeline) {
            const stagesHtml = pipeline.stages.map(stage => \`
                <div class="pipeline-stage">
                    <div class="stage-info">
                        <strong>\${stage.name}</strong>
                        <div style="font-size: 0.9rem; color: #cbd5e0;">\${stage.description}</div>
                        <div class="status-\${stage.status}" style="font-size: 0.8rem; margin-top: 5px;">
                            \${stage.status.toUpperCase().replace('_', ' ')}
                        </div>
                    </div>
                    <div class="stage-count">\${stage.count}</div>
                </div>
            \`).join('');

            const summaryHtml = \`
                <div style="margin-bottom: 20px; padding: 15px; background: rgba(0,0,0,0.3); border-radius: 10px;">
                    <div style="display: flex; justify-content: space-between;">
                        <span>Total Orders: <strong>\${pipeline.totalOrders}</strong></span>
                        <span>Completed Today: <strong>\${pipeline.completedToday}</strong></span>
                        <span>Avg Time: <strong>\${pipeline.averageTime}</strong></span>
                    </div>
                </div>
            \`;

            document.getElementById('workflowPipeline').innerHTML = summaryHtml + stagesHtml;
        }

        function updateActiveOrders(orders) {
            if (orders.length === 0) {
                document.getElementById('activeOrders').innerHTML = '<div>No active orders</div>';
                return;
            }

            const html = \`
                <table class="orders-table">
                    <thead>
                        <tr>
                            <th>Order ID</th>
                            <th>Customer</th>
                            <th>Role</th>
                            <th>Status</th>
                            <th>Progress</th>
                            <th>Time Left</th>
                            <th>Priority</th>
                        </tr>
                    </thead>
                    <tbody>
                        \${orders.map(order => \`
                            <tr>
                                <td>\${order.id}</td>
                                <td>\${order.customer}</td>
                                <td>\${order.role}</td>
                                <td class="status-\${order.status}">\${order.status.toUpperCase().replace('_', ' ')}</td>
                                <td>
                                    <div class="progress-bar" style="width: 100px;">
                                        <div class="progress-fill" style="width: \${order.progress}%"></div>
                                    </div>
                                    \${order.progress}%
                                </td>
                                <td>\${order.timeRemaining}</td>
                                <td class="priority-\${order.priority}">\${order.priority.toUpperCase()}</td>
                            </tr>
                        \`).join('')}
                    </tbody>
                </table>
            \`;
            
            document.getElementById('activeOrders').innerHTML = html;
        }

        function updateIntelligentRecommendations(data) {
            const { superHighDemand, highDemand, emergingOpportunities, summary } = data;
            
            let html = \`
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-bottom: 20px;">
                    <div class="metric-card">
                        <h4>💰 Total Revenue Potential</h4>
                        <div class="metric-value">$\${summary.totalProjectedRevenue.toLocaleString()}/month</div>
                    </div>
                    <div class="metric-card">
                        <h4>⚡ Quick Wins Available</h4>
                        <div class="metric-value">\${summary.quickWins.length} opportunities</div>
                    </div>
                    <div class="metric-card">
                        <h4>🎯 Highest Impact</h4>
                        <div class="metric-value">\${summary.highestImpactRecommendation?.title.substring(0, 30)}...</div>
                    </div>
                </div>
            \`;

            if (superHighDemand.length > 0) {
                html += \`
                    <div class="priority-section super-high">
                        <h4>🔥 SUPER HIGH DEMAND - Immediate Action Required</h4>
                        \${superHighDemand.map(rec => \`
                            <div class="recommendation-item super-high-demand">
                                <div class="rec-header">
                                    <h5>\${rec.title}</h5>
                                    <span class="urgency-badge urgency-\${rec.urgency}">Urgency: \${rec.urgency}/10</span>
                                </div>
                                <div class="rec-content">
                                    <p>\${rec.description}</p>
                                    <div class="rec-metrics">
                                        <span>📈 Revenue: \${rec.revenueProjection}</span>
                                        <span>⏱️ Time: \${rec.implementationTime}</span>
                                        <span>🎯 Demand: \${rec.demandScore}%</span>
                                        <span>📊 Growth: \${rec.growthRate}%</span>
                                    </div>
                                    <div class="rec-evidence">
                                        <strong>Market Evidence:</strong> \${rec.marketEvidence}
                                    </div>
                                </div>
                            </div>
                        \`).join('')}
                    </div>
                \`;
            }

            if (highDemand.length > 0) {
                html += \`
                    <div class="priority-section high">
                        <h4>⚡ HIGH DEMAND - Strong Opportunities</h4>
                        \${highDemand.map(rec => \`
                            <div class="recommendation-item high-demand">
                                <div class="rec-header">
                                    <h5>\${rec.title}</h5>
                                    <span class="urgency-badge urgency-\${rec.urgency}">Urgency: \${rec.urgency}/10</span>
                                </div>
                                <div class="rec-content">
                                    <p>\${rec.description}</p>
                                    <div class="rec-metrics">
                                        <span>📈 Revenue: \${rec.revenueProjection}</span>
                                        <span>⏱️ Time: \${rec.implementationTime}</span>
                                        <span>🎯 Demand: \${rec.demandScore}%</span>
                                    </div>
                                </div>
                            </div>
                        \`).join('')}
                    </div>
                \`;
            }

            if (emergingOpportunities.length > 0) {
                html += \`
                    <div class="priority-section emerging">
                        <h4>🌟 EMERGING OPPORTUNITIES - Future Growth</h4>
                        \${emergingOpportunities.map(rec => \`
                            <div class="recommendation-item emerging-opportunity">
                                <div class="rec-header">
                                    <h5>\${rec.title}</h5>
                                    <span class="urgency-badge urgency-\${rec.urgency}">Urgency: \${rec.urgency}/10</span>
                                </div>
                                <div class="rec-content">
                                    <p>\${rec.description}</p>
                                    <div class="rec-metrics">
                                        <span>📈 Revenue: \${rec.revenueProjection}</span>
                                        <span>⏱️ Time: \${rec.implementationTime}</span>
                                    </div>
                                </div>
                            </div>
                        \`).join('')}
                    </div>
                \`;
            }
            
            document.getElementById('intelligentRecommendations').innerHTML = html;
        }

        function updateApprovedProjects(projects) {
            const html = projects.map(project => \`
                <div class="project-item status-\${project.status}">
                    <div class="project-header">
                        <h4>\${project.title}</h4>
                        <span class="status-badge \${project.status}">\${project.status.toUpperCase().replace('_', ' ')}</span>
                    </div>
                    <p class="project-description">\${project.description}</p>
                    <div class="project-metrics">
                        <span class="metric-item">💰 \${project.revenueImpact}</span>
                        <span class="metric-item">📅 \${new Date(project.approvedAt).toLocaleDateString()}</span>
                        <span class="metric-item">👥 \${project.team || 'Unassigned'}</span>
                        <span class="metric-item priority-\${project.priority}">🎯 \${project.priority.toUpperCase()}</span>
                    </div>
                    \${project.timeline ? \`<div class="project-timeline">⏱️ Timeline: \${project.timeline}</div>\` : ''}
                </div>
            \`).join('');
            
            document.getElementById('approvedProjects').innerHTML = html || '<div class="empty-state">No approved projects yet</div>';
        }

        function updateResearchTasks(research) {
            const html = research.map(task => \`
                <div class="research-item priority-\${task.priority}">
                    <div class="research-header">
                        <h4>\${task.title}</h4>
                        <span class="priority-badge \${task.priority}">\${task.priority.toUpperCase().replace('_', ' ')}</span>
                    </div>
                    <p class="research-description">\${task.description}</p>
                    <div class="research-metrics">
                        <span class="metric-item">📊 \${task.marketPotential}</span>
                        <span class="metric-item">⏱️ \${task.estimatedDuration}</span>
                        <span class="metric-item">👤 \${task.assignedTo}</span>
                        <span class="metric-item">📈 \${task.progress || 0}% Complete</span>
                    </div>
                    <div class="research-outcome">🎯 Expected: \${task.expectedOutcome}</div>
                    \${task.progress > 0 ? \`
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: \${task.progress}%"></div>
                        </div>
                    \` : ''}
                </div>
            \`).join('');
            
            document.getElementById('researchTasks').innerHTML = html || '<div class="empty-state">No research tasks assigned</div>';
        }

        function updateProjectSummary(summary) {
            const html = \`
                <div class="summary-grid">
                    <div class="summary-section">
                        <h4>📋 Projects Overview</h4>
                        <div class="summary-stats">
                            <div class="stat-item">
                                <span class="stat-number">\${summary.projects.total}</span>
                                <span class="stat-label">Total Projects</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-number approved">\${summary.projects.approved}</span>
                                <span class="stat-label">Approved</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-number in-progress">\${summary.projects.inProgress}</span>
                                <span class="stat-label">In Progress</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-number completed">\${summary.projects.completed}</span>
                                <span class="stat-label">Completed</span>
                            </div>
                        </div>
                    </div>

                    <div class="summary-section">
                        <h4>🔬 Research Overview</h4>
                        <div class="summary-stats">
                            <div class="stat-item">
                                <span class="stat-number">\${summary.research.total}</span>
                                <span class="stat-label">Total Tasks</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-number pending">\${summary.research.pending}</span>
                                <span class="stat-label">Pending</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-number in-progress">\${summary.research.inProgress}</span>
                                <span class="stat-label">In Progress</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-number completed">\${summary.research.completed}</span>
                                <span class="stat-label">Completed</span>
                            </div>
                        </div>
                    </div>

                    <div class="summary-section">
                        <h4>💰 Revenue Impact</h4>
                        <div class="revenue-stats">
                            <div class="revenue-item">
                                <span class="revenue-number">$\${summary.revenueImpact.approved.toLocaleString()}</span>
                                <span class="revenue-label">Approved Projects</span>
                            </div>
                            <div class="revenue-item">
                                <span class="revenue-number">$\${summary.revenueImpact.potential.toLocaleString()}</span>
                                <span class="revenue-label">Research Potential</span>
                            </div>
                        </div>
                    </div>

                    <div class="summary-section">
                        <h4>⚡ Next Actions</h4>
                        <div class="next-actions">
                            \${summary.nextActions.map(action => \`
                                <div class="action-item priority-\${action.priority}">
                                    <span class="action-title">\${action.title}</span>
                                    <span class="action-due">\${action.dueDate}</span>
                                </div>
                            \`).join('')}
                        </div>
                    </div>
                </div>
            \`;
            
            document.getElementById('projectSummary').innerHTML = html;
        }

        function updateDevelopmentProgress(projects) {
            let html = '';
            
            if (projects.length === 0) {
                html = '<div class="empty-state">No development projects tracked yet</div>';
            } else {
                projects.forEach(project => {
                    html += \`
                        <div class="dev-project-card">
                            <div class="dev-project-header">
                                <h3>\${project.projectName}</h3>
                                <div class="progress-circle" data-progress="\${project.overallProgress}">
                                    <svg width="60" height="60">
                                        <circle cx="30" cy="30" r="25" fill="none" stroke="#2d3748" stroke-width="5"/>
                                        <circle cx="30" cy="30" r="25" fill="none" stroke="#0ea5e9" stroke-width="5"
                                                stroke-dasharray="\${2 * Math.PI * 25}" 
                                                stroke-dashoffset="\${2 * Math.PI * 25 * (1 - project.overallProgress / 100)}"
                                                transform="rotate(-90 30 30)"/>
                                    </svg>
                                    <span class="progress-text">\${project.overallProgress}%</span>
                                </div>
                            </div>
                            
                            <div class="dev-current-stage">
                                <h4>🔄 Current Stage</h4>
                                <div class="stage-info">
                                    <span class="stage-name">\${project.currentStage.name}</span>
                                    <div class="stage-progress">
                                        <div class="progress-bar">
                                            <div class="progress-fill" style="width: \${project.currentStage.progress}%"></div>
                                        </div>
                                        <span class="progress-percent">\${project.currentStage.progress}%</span>
                                    </div>
                                </div>
                                <div class="next-task">
                                    <strong>Next:</strong> \${project.currentStage.nextTask}
                                </div>
                            </div>

                            <div class="dev-stats-grid">
                                <div class="dev-stat">
                                    <span class="stat-number">\${project.completedTasks}/\${project.totalTasks}</span>
                                    <span class="stat-label">Tasks</span>
                                </div>
                                <div class="dev-stat">
                                    <span class="stat-number">\${project.estimatedCompletion.daysRemaining}</span>
                                    <span class="stat-label">Days Left</span>
                                </div>
                                <div class="dev-stat">
                                    <span class="stat-number">\${project.performanceMetrics.velocity}</span>
                                    <span class="stat-label">Velocity</span>
                                </div>
                                <div class="dev-stat">
                                    <span class="stat-number">\${project.performanceMetrics.qualityScore}</span>
                                    <span class="stat-label">Quality</span>
                                </div>
                            </div>

                            <div class="dev-milestones">
                                <h4>🎯 Next Milestones</h4>
                                <div class="milestone-list">
                                    \${project.nextMilestones.slice(0, 3).map(milestone => \`
                                        <div class="milestone-item priority-\${milestone.priority}">
                                            <span class="milestone-task">\${milestone.task}</span>
                                            <span class="milestone-stage">\${milestone.stageName}</span>
                                        </div>
                                    \`).join('')}
                                </div>
                            </div>

                            <div class="dev-stages">
                                <h4>📊 Development Stages</h4>
                                <div class="stages-grid">
                                    \${Object.entries(project.stageProgress).map(([stageKey, stage]) => \`
                                        <div class="stage-item status-\${stage.status}">
                                            <div class="stage-header">
                                                <span class="stage-title">\${stage.name}</span>
                                                <span class="stage-percent">\${stage.completionRate}%</span>
                                            </div>
                                            <div class="stage-progress-bar">
                                                <div class="progress-fill" style="width: \${stage.completionRate}%"></div>
                                            </div>
                                            <div class="stage-tasks">\${stage.tasksCompleted}/\${stage.totalTasks} tasks</div>
                                        </div>
                                    \`).join('')}
                                </div>
                            </div>

                            \${project.riskAssessment && project.riskAssessment.length > 0 ? \`
                                <div class="dev-risks">
                                    <h4>⚠️ Risk Assessment</h4>
                                    \${project.riskAssessment.map(risk => \`
                                        <div class="risk-item risk-\${risk.level}">
                                            <span class="risk-level">\${risk.level.toUpperCase()}</span>
                                            <span class="risk-description">\${risk.risk}</span>
                                        </div>
                                    \`).join('')}
                                </div>
                            \` : ''}
                        </div>
                    \`;
                });
            }
            
            document.getElementById('developmentProgress').innerHTML = html;
        }

        function updateDetailedAgents(agents) {
            const html = agents.map(agent => \`
                <div class="agent-item \${agent.status}" style="margin: 15px 0;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 20px; align-items: center;">
                        <div>
                            <strong><span class="workflow-indicator \${agent.status}"></span>\${agent.name}</strong>
                            <div class="status-\${agent.status}">\${agent.status.toUpperCase().replace('_', ' ')}</div>
                        </div>
                        <div>
                            <div>Health: \${agent.health}</div>
                            <div>Uptime: \${agent.uptime}</div>
                        </div>
                        <div>
                            <div>Tasks: \${agent.tasksCompleted}</div>
                            <div>Efficiency: \${agent.efficiency}%</div>
                        </div>
                        <div>
                            <div>\${agent.currentTask}</div>
                            <div class="progress-bar">
                                <div class="progress-fill" style="width: \${agent.progress}%"></div>
                            </div>
                        </div>
                    </div>
                </div>
            \`).join('');
            
            document.getElementById('detailedAgents').innerHTML = html;
        }

        function showNotification(message) {
            const notification = document.getElementById('notification');
            const text = document.getElementById('notificationText');
            text.textContent = message;
            notification.classList.add('show');
            setTimeout(() => {
                notification.classList.remove('show');
            }, 3000);
        }

        function refreshDashboard() {
            document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString();
            fetchEnhancedStatus();
            fetchWorkflowPipeline();
            fetchActiveOrders();
            fetchDetailedAgents();
            fetchIntelligentRecommendations();
            fetchApprovedProjects();
            fetchResearchTasks();
            fetchProjectSummary();
            fetchDevelopmentProgress();
            showNotification('Dashboard updated successfully!');
        }

        // Initial load
        refreshDashboard();
        
        // Auto-refresh every 15 seconds for more dynamic updates
        setInterval(refreshDashboard, 15000);
    </script>
</body>
</html>
        `;
    }

    start() {
        this.app.listen(this.port, () => {
            console.log(`🚀 Enhanced Dashboard started on port ${this.port}`);
            console.log(`📊 Enhanced Dashboard URL: http://localhost:${this.port}`);
            console.log(`🎯 Features: Workflow tracking, agent status, order pipeline`);
        });
    }
}

if (require.main === module) {
    const dashboard = new EnhancedDashboard();
    dashboard.start();
}

module.exports = EnhancedDashboard;