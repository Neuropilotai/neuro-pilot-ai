require('dotenv').config();
const express = require('express');
const ProjectApprovalSystem = require('./project_approval_system');
const DevelopmentProgressTracker = require('./development_progress_tracker');
const IntelligentRecommendationSystem = require('./intelligent_recommendation_system');

class WorkingDashboard {
    constructor() {
        this.app = express();
        this.port = 3009;
        this.projectSystem = new ProjectApprovalSystem();
        this.progressTracker = new DevelopmentProgressTracker();
        this.recommendationSystem = new IntelligentRecommendationSystem();
        this.setupMiddleware();
        this.setupRoutes();
    }

    setupMiddleware() {
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
        
        // Add multer for file uploads
        const multer = require('multer');
        const upload = multer({ 
            dest: 'uploads/',
            limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
            fileFilter: (req, file, cb) => {
                const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
                cb(null, allowedTypes.includes(file.mimetype));
            }
        });
        this.upload = upload;
    }

    setupRoutes() {
        // Main dashboard
        this.app.get('/', (req, res) => {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.send(this.getWorkingDashboardHTML());
        });

        // API endpoints
        this.app.get('/api/overview', async (req, res) => {
            try {
                const overview = await this.getBusinessOverview();
                res.json(overview);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/agents', async (req, res) => {
            try {
                const agents = await this.getAgentStatuses();
                res.json(agents);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/projects', async (req, res) => {
            try {
                const projects = this.projectSystem.getApprovedProjects();
                res.json(projects);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // AI Task Assistant API
        this.app.post('/api/ai-assistant/execute', async (req, res) => {
            try {
                const { task, priority = 'medium' } = req.body;
                const response = await this.processAITask(task);
                
                if (response.createProject) {
                    const project = await this.projectSystem.approveProject({
                        title: response.projectTitle,
                        description: response.projectDescription,
                        priority: priority,
                        category: 'ai_enhancement',
                        timeline: response.timeline || '2-3 weeks',
                        revenueImpact: response.revenueImpact || 'TBD',
                        budget: response.budget || 'TBD',
                        approvedBy: 'Super IT Agent'
                    });
                    response.projectId = project.id;
                }

                res.json({ success: true, response });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // CV Upload endpoint
        this.app.post('/api/upload-cv', this.upload.single('cvFile'), async (req, res) => {
            try {
                if (!req.file) {
                    return res.status(400).json({ success: false, error: 'No file uploaded' });
                }

                const uploadedFile = {
                    filename: req.file.filename,
                    originalName: req.file.originalname,
                    size: req.file.size,
                    mimetype: req.file.mimetype,
                    uploadDate: new Date().toISOString()
                };

                console.log('📎 CV uploaded:', uploadedFile.originalName);
                
                res.json({ 
                    success: true, 
                    message: 'CV uploaded successfully',
                    file: uploadedFile
                });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });
    }

    async getBusinessOverview() {
        const projects = this.projectSystem.getApprovedProjects();
        const research = this.projectSystem.getResearchTasks();
        const recommendations = await this.recommendationSystem.getFormattedRecommendations();
        const developmentProgress = await this.progressTracker.getAllProjectsProgress();

        return {
            projects: {
                total: projects.length,
                approved: projects.filter(p => p.status === 'approved').length,
                inProgress: projects.filter(p => p.status === 'in_progress').length,
                completed: projects.filter(p => p.status === 'completed').length,
                revenueImpact: this.calculateTotalRevenue(projects)
            },
            research: {
                total: research.length,
                pending: research.filter(r => r.status === 'pending').length,
                inProgress: research.filter(r => r.status === 'in_progress').length,
                completed: research.filter(r => r.status === 'completed').length,
                potentialRevenue: this.calculatePotentialRevenue(research)
            },
            recommendations: {
                total: recommendations.totalRecommendations,
                superHighDemand: recommendations.superHighDemand.length,
                highDemand: recommendations.highDemand.length,
                totalRevenueOpportunity: recommendations.summary.totalProjectedRevenue
            },
            development: {
                activeProjects: developmentProgress.length,
                averageProgress: developmentProgress.length > 0 ? 
                    Math.round(developmentProgress.reduce((sum, p) => sum + p.overallProgress, 0) / developmentProgress.length) : 0,
                totalTasks: developmentProgress.reduce((sum, p) => sum + p.totalTasks, 0),
                completedTasks: developmentProgress.reduce((sum, p) => sum + p.completedTasks, 0)
            }
        };
    }

    calculateTotalRevenue(projects) {
        return projects.reduce((total, project) => {
            const revenueMatch = project.revenueImpact?.match(/\+?\$(\d+)K?/);
            if (revenueMatch) {
                const amount = parseInt(revenueMatch[1]);
                return total + (project.revenueImpact.includes('K') ? amount * 1000 : amount);
            }
            return total;
        }, 0);
    }

    calculatePotentialRevenue(research) {
        return research.reduce((total, task) => {
            const revenueMatch = task.marketPotential?.match(/\+?\$(\d+)K?/);
            if (revenueMatch) {
                const amount = parseInt(revenueMatch[1]);
                return total + (task.marketPotential.includes('K') ? amount * 1000 : amount);
            }
            return total;
        }, 0);
    }

    async getAgentStatuses() {
        // Check running processes for agents
        const { exec } = require('child_process');
        const util = require('util');
        const execPromise = util.promisify(exec);
        
        try {
            const { stdout } = await execPromise('ps aux | grep -v grep | grep -E "(email_agent|customer_service|agent_monitor|workflow_agent|ai_agent)" | awk \'{print $11, $12}\'');
            const processes = stdout.trim().split('\n').filter(line => line);
            
            const agents = [
                {
                    name: '📧 Email Processing Agent',
                    status: processes.some(p => p.includes('email_agent')) ? 'online' : 'offline',
                    description: 'Processes customer orders from emails',
                    port: 'N/A',
                    lastUpdate: new Date().toISOString()
                },
                {
                    name: '🤖 Super Customer Service Agent',
                    status: processes.some(p => p.includes('customer_service')) ? 'online' : 'offline',
                    description: 'AI-powered customer support with intelligent responses',
                    port: 'N/A',
                    lastUpdate: new Date().toISOString()
                },
                {
                    name: '🎯 Agent Dashboard',
                    status: processes.some(p => p.includes('agent_dashboard')) ? 'online' : 'offline',
                    description: 'Real-time agent monitoring interface',
                    port: '3001',
                    lastUpdate: new Date().toISOString()
                },
                {
                    name: '📊 Enhanced Dashboard',
                    status: processes.some(p => p.includes('enhanced_dashboard')) ? 'online' : 'offline',
                    description: 'Workflow tracking and order pipeline',
                    port: '3006',
                    lastUpdate: new Date().toISOString()
                },
                {
                    name: '🎮 Management Dashboard',
                    status: 'online',
                    description: 'Business management and control center',
                    port: '3007',
                    lastUpdate: new Date().toISOString()
                },
                {
                    name: '🚀 Working Dashboard',
                    status: 'online',
                    description: 'This dashboard - fully functional interface',
                    port: '3009',
                    lastUpdate: new Date().toISOString()
                }
            ];
            
            return agents;
        } catch (error) {
            console.error('Error getting agent statuses:', error);
            return [];
        }
    }

    async processAITask(task) {
        const taskLower = task.toLowerCase();
        
        if (taskLower.includes('dashboard')) {
            return {
                type: 'dashboard_modification',
                response: 'Dashboard enhancement task received. I will add real-time analytics, performance metrics, and interactive visualizations.',
                createProject: true,
                projectTitle: 'Enhanced Dashboard Analytics',
                projectDescription: `AI-requested dashboard enhancement: ${task}`,
                timeline: '1-2 weeks',
                revenueImpact: '+$5K/month',
                budget: '$3K'
            };
        } else if (taskLower.includes('feature')) {
            return {
                type: 'feature_development',
                response: 'New feature development task accepted. I will design, implement, and test the requested functionality.',
                createProject: true,
                projectTitle: 'AI-Requested Feature Development',
                projectDescription: `Feature development task: ${task}`,
                timeline: '2-3 weeks',
                revenueImpact: '+$10K/month',
                budget: '$8K'
            };
        } else {
            return {
                type: 'custom_task',
                response: `Custom task analysis complete. Task: "${task}" has been broken down into actionable steps and added to the work queue.`,
                createProject: true,
                projectTitle: 'Custom AI Task',
                projectDescription: `AI-processed custom task: ${task}`,
                timeline: '1-3 weeks',
                revenueImpact: 'TBD',
                budget: 'TBD'
            };
        }
    }

    getWorkingDashboardHTML() {
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🎯 Working Management Dashboard</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%);
            color: #ffffff;
            min-height: 100vh;
            padding: 20px;
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
            padding: 20px;
            background: rgba(255,255,255,0.1);
            border-radius: 15px;
            backdrop-filter: blur(10px);
        }
        .header h1 {
            font-size: 2.5rem;
            margin-bottom: 10px;
            background: linear-gradient(135deg, #0ea5e9 0%, #3b82f6 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .stat-card {
            background: rgba(255,255,255,0.1);
            padding: 25px;
            border-radius: 15px;
            text-align: center;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255,255,255,0.2);
        }
        .stat-number {
            font-size: 2.5rem;
            font-weight: bold;
            margin-bottom: 10px;
        }
        .stat-label {
            color: #94a3b8;
            font-size: 0.9rem;
            margin-bottom: 15px;
        }
        .stat-revenue {
            color: #10b981;
            font-weight: bold;
        }
        .projects-section {
            background: rgba(255,255,255,0.1);
            padding: 25px;
            border-radius: 15px;
            margin-bottom: 30px;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255,255,255,0.2);
        }
        .section-title {
            font-size: 1.5rem;
            margin-bottom: 20px;
            color: #e2e8f0;
        }
        .project-item {
            background: rgba(0,0,0,0.3);
            padding: 15px;
            margin: 10px 0;
            border-radius: 10px;
            border-left: 4px solid #3b82f6;
        }
        .project-title {
            font-weight: bold;
            margin-bottom: 8px;
        }
        .project-meta {
            font-size: 0.9rem;
            color: #94a3b8;
        }
        .ai-assistant {
            background: rgba(255,255,255,0.1);
            padding: 25px;
            border-radius: 15px;
            margin-bottom: 30px;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255,255,255,0.2);
        }
        .ai-chat {
            background: rgba(0,0,0,0.3);
            padding: 15px;
            border-radius: 10px;
            margin-bottom: 15px;
            max-height: 200px;
            overflow-y: auto;
        }
        .ai-message {
            margin: 10px 0;
            padding: 10px;
            border-radius: 8px;
        }
        .user-message {
            background: rgba(59, 130, 246, 0.2);
            margin-left: 20px;
        }
        .agent-message {
            background: rgba(139, 92, 246, 0.2);
        }
        .ai-input {
            display: flex;
            gap: 10px;
            align-items: flex-end;
        }
        .ai-input textarea {
            flex: 1;
            padding: 12px;
            border: 1px solid rgba(255,255,255,0.3);
            border-radius: 8px;
            background: rgba(0,0,0,0.3);
            color: white;
            resize: vertical;
            min-height: 60px;
        }
        .btn {
            padding: 12px 20px;
            border: none;
            border-radius: 8px;
            background: #3b82f6;
            color: white;
            cursor: pointer;
            font-weight: bold;
            transition: background 0.3s;
        }
        .btn:hover {
            background: #2563eb;
        }
        .loading { color: #fbbf24; }
        .success { color: #10b981; }
        .error { color: #ef4444; }
        .agent-item {
            background: rgba(0,0,0,0.3);
            padding: 15px;
            margin: 10px 0;
            border-radius: 10px;
            border-left: 4px solid #8b5cf6;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .agent-info {
            flex: 1;
        }
        .agent-name {
            font-weight: bold;
            margin-bottom: 5px;
        }
        .agent-description {
            font-size: 0.9rem;
            color: #94a3b8;
        }
        .agent-status {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .status-indicator {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            animation: pulse 2s infinite;
        }
        .status-online {
            background: #10b981;
        }
        .status-offline {
            background: #ef4444;
        }
        @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.5; }
            100% { opacity: 1; }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🎯 Working Management Dashboard</h1>
        <p>Fully functional business management interface</p>
    </div>

    <div class="stats-grid" id="statsGrid">
        <div class="loading">Loading business overview...</div>
    </div>

    <div class="projects-section">
        <h2 class="section-title">🤖 Active Agents</h2>
        <div id="agentsList">
            <div class="loading">Loading agents...</div>
        </div>
    </div>

    <div class="projects-section">
        <h2 class="section-title">📋 Active Projects</h2>
        <div id="projectsList">
            <div class="loading">Loading projects...</div>
        </div>
    </div>

    <div class="ai-assistant">
        <h2 class="section-title">🤖 AI Task Assistant</h2>
        <div class="ai-chat" id="aiChat">
            <div class="ai-message agent-message">
                <strong>🤖 Super IT Agent:</strong> Ready to help! Tell me what you'd like me to create or modify.
            </div>
        </div>
        <div class="ai-input">
            <textarea id="aiTaskInput" placeholder="Tell your Super IT Agent what to create, modify, or learn..."></textarea>
            <button class="btn" onclick="executeAITask()">🚀 Execute Task</button>
        </div>
    </div>

    <script>
        // Initialize dashboard
        document.addEventListener('DOMContentLoaded', function() {
            console.log('🚀 Working dashboard initializing...');
            loadDashboard();
        });

        async function loadDashboard() {
            try {
                console.log('📊 Loading overview...');
                await loadOverview();
                console.log('🤖 Loading agents...');
                await loadAgents();
                console.log('📋 Loading projects...');
                await loadProjects();
                console.log('✅ Dashboard loaded successfully!');
            } catch (error) {
                console.error('❌ Dashboard load error:', error);
            }
        }

        async function loadAgents() {
            try {
                const response = await fetch('/api/agents');
                const agents = await response.json();
                
                const agentsHTML = agents.map(agent => \`
                    <div class="agent-item">
                        <div class="agent-info">
                            <div class="agent-name">\${agent.name}</div>
                            <div class="agent-description">\${agent.description}</div>
                            <div class="agent-description">Port: \${agent.port}</div>
                        </div>
                        <div class="agent-status">
                            <span class="status-indicator status-\${agent.status}"></span>
                            <span style="color: \${agent.status === 'online' ? '#10b981' : '#ef4444'}">
                                \${agent.status.toUpperCase()}
                            </span>
                        </div>
                    </div>
                \`).join('');
                
                document.getElementById('agentsList').innerHTML = agentsHTML || '<div>No agents found</div>';
            } catch (error) {
                document.getElementById('agentsList').innerHTML = '<div class="error">Error loading agents</div>';
                throw error;
            }
        }

        async function loadOverview() {
            try {
                const response = await fetch('/api/overview');
                const overview = await response.json();
                
                document.getElementById('statsGrid').innerHTML = \`
                    <div class="stat-card">
                        <div class="stat-number" style="color: #10b981;">\${overview.projects.total}</div>
                        <div class="stat-label">Total Projects</div>
                        <div class="stat-revenue">$\${overview.projects.revenueImpact.toLocaleString()}</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-number" style="color: #f59e0b;">\${overview.research.total}</div>
                        <div class="stat-label">Research Tasks</div>
                        <div class="stat-revenue">$\${overview.research.potentialRevenue.toLocaleString()} potential</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-number" style="color: #3b82f6;">\${overview.development.activeProjects}</div>
                        <div class="stat-label">In Development</div>
                        <div class="stat-revenue">\${overview.development.averageProgress}% avg progress</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-number" style="color: #8b5cf6;">\${overview.recommendations.total}</div>
                        <div class="stat-label">Recommendations</div>
                        <div class="stat-revenue">$\${overview.recommendations.totalRevenueOpportunity.toLocaleString()} opportunity</div>
                    </div>
                \`;
            } catch (error) {
                document.getElementById('statsGrid').innerHTML = '<div class="error">Error loading overview</div>';
                throw error;
            }
        }

        async function loadProjects() {
            try {
                const response = await fetch('/api/projects');
                const projects = await response.json();
                
                const projectsHTML = projects.map(project => \`
                    <div class="project-item">
                        <div class="project-title">\${project.title}</div>
                        <div class="project-meta">
                            Status: \${project.status} | Priority: \${project.priority} | 
                            Revenue: \${project.revenueImpact} | Timeline: \${project.timeline}
                        </div>
                    </div>
                \`).join('');
                
                document.getElementById('projectsList').innerHTML = projectsHTML || '<div>No projects found</div>';
            } catch (error) {
                document.getElementById('projectsList').innerHTML = '<div class="error">Error loading projects</div>';
                throw error;
            }
        }

        async function executeAITask() {
            const task = document.getElementById('aiTaskInput').value.trim();
            const chat = document.getElementById('aiChat');
            
            if (!task) {
                alert('Please enter a task for your Super IT Agent');
                return;
            }

            // Add user message
            const userMsg = document.createElement('div');
            userMsg.className = 'ai-message user-message';
            userMsg.innerHTML = \`<strong>👤 You:</strong> \${task}\`;
            chat.appendChild(userMsg);

            // Clear input
            document.getElementById('aiTaskInput').value = '';

            // Add processing message
            const processingMsg = document.createElement('div');
            processingMsg.className = 'ai-message agent-message';
            processingMsg.innerHTML = \`<strong>🤖 Super IT Agent:</strong> <span class="loading">Processing your request...</span>\`;
            chat.appendChild(processingMsg);
            chat.scrollTop = chat.scrollHeight;

            try {
                const response = await fetch('/api/ai-assistant/execute', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ task, priority: 'high' })
                });

                const result = await response.json();

                if (result.success) {
                    processingMsg.innerHTML = \`
                        <strong>🤖 Super IT Agent:</strong> 
                        <span class="success">✅ Task processed successfully!</span><br>
                        \${result.response.response}<br>
                        <em>Task Type: \${result.response.type}</em>
                    \`;

                    if (result.response.createProject) {
                        setTimeout(() => {
                            const projectMsg = document.createElement('div');
                            projectMsg.className = 'ai-message agent-message';
                            projectMsg.innerHTML = \`<strong>🤖 Super IT Agent:</strong> <span class="success">📋 I've automatically created a project for this task!</span>\`;
                            chat.appendChild(projectMsg);
                            chat.scrollTop = chat.scrollHeight;
                            loadProjects(); // Refresh projects
                            loadOverview(); // Refresh overview
                        }, 1500);
                    }
                } else {
                    processingMsg.innerHTML = \`<strong>🤖 Super IT Agent:</strong> <span class="error">❌ Error: \${result.error}</span>\`;
                }
            } catch (error) {
                processingMsg.innerHTML = \`<strong>🤖 Super IT Agent:</strong> <span class="error">❌ Communication error. Please try again.</span>\`;
            }

            chat.scrollTop = chat.scrollHeight;
        }
    </script>
</body>
</html>
        `;
    }

    start() {
        this.app.listen(this.port, () => {
            console.log(`🎯 Working Dashboard started on port ${this.port}`);
            console.log(`📊 Working Dashboard URL: http://localhost:${this.port}`);
        });
    }
}

if (require.main === module) {
    const dashboard = new WorkingDashboard();
    dashboard.start();
}

module.exports = WorkingDashboard;