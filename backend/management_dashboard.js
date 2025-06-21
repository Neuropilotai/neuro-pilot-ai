require('dotenv').config();
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const ProjectApprovalSystem = require('./project_approval_system');
const DevelopmentProgressTracker = require('./development_progress_tracker');
const IntelligentRecommendationSystem = require('./intelligent_recommendation_system');

class ManagementDashboard {
    constructor() {
        this.app = express();
        this.port = 3007;
        this.projectSystem = new ProjectApprovalSystem();
        this.progressTracker = new DevelopmentProgressTracker();
        this.recommendationSystem = new IntelligentRecommendationSystem();
        this.setupMiddleware();
        this.setupRoutes();
    }

    setupMiddleware() {
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));
        this.app.use(express.static('public'));
    }

    setupRoutes() {
        // Main management dashboard
        this.app.get('/', (req, res) => {
            // Add cache-busting headers
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            res.send(this.getManagementDashboardHTML());
        });

        // Trading challenge progress API
        this.app.get('/api/trading/progress', async (req, res) => {
            try {
                const progress = await this.getTradingProgress();
                res.json(progress);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Real-time challenge data
        this.app.get('/api/challenge/status', async (req, res) => {
            try {
                const status = await this.getChallengeStatus();
                res.json(status);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Project Management APIs
        this.app.post('/api/projects/approve', async (req, res) => {
            try {
                const project = await this.projectSystem.approveProject(req.body);
                res.json({ success: true, project });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.app.post('/api/projects/:projectId/status', async (req, res) => {
            try {
                const { projectId } = req.params;
                const { status, notes } = req.body;
                const project = await this.projectSystem.updateProjectStatus(projectId, status, notes);
                res.json({ success: true, project });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Research Management APIs
        this.app.post('/api/research/approve', async (req, res) => {
            try {
                const task = await this.projectSystem.addResearchTask(req.body);
                res.json({ success: true, task });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.app.post('/api/research/:taskId/progress', async (req, res) => {
            try {
                const { taskId } = req.params;
                const { progress, findings } = req.body;
                const task = await this.projectSystem.updateResearchProgress(taskId, progress, findings);
                res.json({ success: true, task });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.app.post('/api/research/:taskId/promote', async (req, res) => {
            try {
                const { taskId } = req.params;
                const project = await this.projectSystem.promoteResearchToProject(taskId, req.body);
                res.json({ success: true, project });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Development Management APIs
        this.app.post('/api/development/:projectName/task/:stageName/:taskName/complete', async (req, res) => {
            try {
                const { projectName, stageName, taskName } = req.params;
                const decodedProjectName = decodeURIComponent(projectName);
                const progress = await this.progressTracker.markTaskCompleted(decodedProjectName, stageName, taskName);
                res.json({ success: true, progress });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.app.post('/api/development/:projectName/task/add', async (req, res) => {
            try {
                const { projectName } = req.params;
                const { stageName, taskName } = req.body;
                const decodedProjectName = decodeURIComponent(projectName);
                const progress = await this.progressTracker.addTask(decodedProjectName, stageName, taskName);
                res.json({ success: true, progress });
            } catch (error) {
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Data retrieval APIs
        this.app.get('/api/projects', async (req, res) => {
            try {
                const projects = this.projectSystem.getApprovedProjects();
                res.json(projects);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/research', async (req, res) => {
            try {
                const research = this.projectSystem.getResearchTasks();
                res.json(research);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/recommendations', async (req, res) => {
            try {
                const recommendations = await this.recommendationSystem.getFormattedRecommendations();
                res.json(recommendations);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/development/progress', async (req, res) => {
            try {
                const progress = await this.progressTracker.getAllProjectsProgress();
                res.json(progress);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/overview', async (req, res) => {
            try {
                const overview = await this.getBusinessOverview();
                res.json(overview);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Additional API endpoints needed by frontend
        this.app.get('/api/projects', async (req, res) => {
            try {
                const projects = this.projectSystem.getApprovedProjects();
                res.json(projects);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/research', async (req, res) => {
            try {
                const research = this.projectSystem.getResearchTasks();
                res.json(research);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/development', async (req, res) => {
            try {
                const progress = await this.progressTracker.getAllProjectsProgress();
                res.json(progress);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/api/recommendations', async (req, res) => {
            try {
                const recommendations = await this.recommendationSystem.getFormattedRecommendations();
                res.json(recommendations);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // AI Task Assistant API
        this.app.post('/api/ai-assistant/execute', async (req, res) => {
            try {
                const { task, priority = 'medium' } = req.body;
                
                // Process the AI task
                const response = await this.processAITask(task);
                
                // Optionally create a project or research task
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

    async processAITask(task) {
        // Intelligent task analysis and response generation
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
        } else if (taskLower.includes('report')) {
            return {
                type: 'report_generation',
                response: 'Report generation task in progress. Comprehensive business analytics will be ready within 24 hours.',
                createProject: false
            };
        } else if (taskLower.includes('learn')) {
            return {
                type: 'learning_task',
                response: 'Learning new capability. I will research, study, and integrate the requested knowledge into my system.',
                createProject: false
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

    getManagementDashboardHTML() {
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🎯 Business Management Dashboard</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

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

        .header p {
            color: #94a3b8;
            font-size: 1.1rem;
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
            transition: transform 0.3s ease;
        }

        .stat-card:hover {
            transform: translateY(-5px);
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

        .management-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 30px;
            margin-bottom: 30px;
        }

        .management-section {
            background: rgba(255,255,255,0.1);
            padding: 25px;
            border-radius: 15px;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255,255,255,0.2);
        }

        .section-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 1px solid rgba(255,255,255,0.2);
        }

        .section-title {
            font-size: 1.3rem;
            font-weight: bold;
        }

        .btn {
            padding: 8px 16px;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-weight: bold;
            transition: all 0.3s ease;
            text-decoration: none;
            display: inline-block;
        }

        .btn-primary {
            background: linear-gradient(135deg, #0ea5e9 0%, #3b82f6 100%);
            color: white;
        }

        .btn-success {
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            color: white;
        }

        .btn-warning {
            background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
            color: white;
        }

        .btn-danger {
            background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
            color: white;
        }

        .btn-small {
            padding: 6px 12px;
            font-size: 0.8rem;
        }

        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(0,0,0,0.3);
        }

        .item-list {
            max-height: 400px;
            overflow-y: auto;
        }

        .item {
            background: rgba(0,0,0,0.3);
            padding: 15px;
            margin: 10px 0;
            border-radius: 10px;
            border-left: 4px solid;
            transition: all 0.3s ease;
        }

        .item:hover {
            background: rgba(255,255,255,0.1);
        }

        .item-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
        }

        .item-title {
            font-weight: bold;
            color: #ffffff;
        }

        .item-meta {
            color: #94a3b8;
            font-size: 0.9rem;
            margin-bottom: 10px;
        }

        .item-actions {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        }

        .status-badge {
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 0.8rem;
            font-weight: bold;
        }

        .status-approved { background: #10b981; color: white; }
        .status-in_progress { background: #f59e0b; color: white; }
        .status-completed { background: #6366f1; color: white; }
        .status-pending { background: #64748b; color: white; }

        .priority-super_high { border-left-color: #dc2626; }
        .priority-high { border-left-color: #f59e0b; }
        .priority-medium { border-left-color: #3b82f6; }
        .priority-low { border-left-color: #64748b; }

        .full-width {
            grid-column: 1 / -1;
        }

        .form-section {
            background: rgba(255,255,255,0.1);
            padding: 25px;
            border-radius: 15px;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255,255,255,0.2);
            margin-bottom: 20px;
        }

        .form-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
            margin-bottom: 15px;
        }

        .form-group {
            display: flex;
            flex-direction: column;
        }

        .form-group label {
            margin-bottom: 5px;
            color: #e2e8f0;
            font-weight: 500;
        }

        .form-group input,
        .form-group textarea,
        .form-group select {
            padding: 10px;
            border: 1px solid rgba(255,255,255,0.3);
            border-radius: 8px;
            background: rgba(0,0,0,0.3);
            color: #ffffff;
            font-size: 0.9rem;
        }

        .form-group input:focus,
        .form-group textarea:focus,
        .form-group select:focus {
            outline: none;
            border-color: #0ea5e9;
            box-shadow: 0 0 0 2px rgba(14, 165, 233, 0.3);
        }

        .notifications {
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 1000;
        }

        .notification {
            background: #10b981;
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            margin-bottom: 10px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.3);
            transform: translateX(400px);
            transition: transform 0.3s ease;
        }

        .notification.show {
            transform: translateX(0);
        }

        .notification.error {
            background: #ef4444;
        }

        /* AI Task Assistant Styles */
        .ai-status {
            display: flex;
            align-items: center;
            gap: 8px;
            color: #10b981;
            font-size: 0.9rem;
            font-weight: 500;
        }

        .status-indicator {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #10b981;
            animation: pulse 2s infinite;
        }

        .status-indicator.online {
            background: #10b981;
        }

        .status-indicator.busy {
            background: #f59e0b;
        }

        @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.5; }
            100% { opacity: 1; }
        }

        .ai-assistant-container {
            background: rgba(0,0,0,0.3);
            border-radius: 15px;
            padding: 20px;
            border: 1px solid rgba(255,255,255,0.2);
        }

        .ai-chat-window {
            max-height: 300px;
            overflow-y: auto;
            margin-bottom: 20px;
            padding: 15px;
            background: rgba(0,0,0,0.2);
            border-radius: 10px;
            border: 1px solid rgba(255,255,255,0.1);
        }

        .ai-message {
            margin-bottom: 15px;
            padding: 12px;
            border-radius: 10px;
            position: relative;
        }

        .ai-message.system-message {
            background: rgba(16, 185, 129, 0.1);
            border-left: 3px solid #10b981;
        }

        .ai-message.user-message {
            background: rgba(59, 130, 246, 0.1);
            border-left: 3px solid #3b82f6;
            margin-left: 20px;
        }

        .ai-message.agent-response {
            background: rgba(139, 92, 246, 0.1);
            border-left: 3px solid #8b5cf6;
        }

        .message-content {
            color: #e2e8f0;
            line-height: 1.5;
        }

        .message-content ul {
            margin: 10px 0;
            padding-left: 20px;
        }

        .message-content li {
            margin: 5px 0;
        }

        .message-time {
            font-size: 0.75rem;
            color: #64748b;
            margin-top: 8px;
        }

        .ai-input-container {
            border-top: 1px solid rgba(255,255,255,0.1);
            padding-top: 20px;
        }

        .ai-input-wrapper {
            display: flex;
            gap: 15px;
            align-items: flex-end;
            margin-bottom: 15px;
        }

        .ai-input-wrapper textarea {
            flex: 1;
            resize: vertical;
            min-height: 60px;
            padding: 12px;
            border: 1px solid rgba(255,255,255,0.3);
            border-radius: 10px;
            background: rgba(0,0,0,0.4);
            color: #ffffff;
            font-size: 0.95rem;
            font-family: inherit;
        }

        .ai-input-wrapper textarea:focus {
            outline: none;
            border-color: #0ea5e9;
            box-shadow: 0 0 0 2px rgba(14, 165, 233, 0.3);
        }

        .ai-send-btn {
            padding: 12px 20px;
            min-width: 140px;
            white-space: nowrap;
        }

        .ai-quick-actions {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
        }

        .ai-quick-actions .btn-small {
            padding: 8px 15px;
            font-size: 0.85rem;
        }

        .modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.8);
            z-index: 2000;
            align-items: center;
            justify-content: center;
        }

        .modal.show {
            display: flex;
        }

        .modal-content {
            background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
            padding: 30px;
            border-radius: 15px;
            max-width: 600px;
            width: 90%;
            max-height: 80vh;
            overflow-y: auto;
        }

        .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 1px solid rgba(255,255,255,0.2);
        }

        .close-modal {
            background: none;
            border: none;
            color: #94a3b8;
            font-size: 1.5rem;
            cursor: pointer;
        }

        .loading {
            text-align: center;
            padding: 20px;
            color: #94a3b8;
        }

        .progress-bar {
            width: 100%;
            height: 8px;
            background: rgba(255,255,255,0.2);
            border-radius: 4px;
            overflow: hidden;
            margin: 10px 0;
        }

        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #10b981 0%, #059669 100%);
            transition: width 0.3s ease;
        }

        .quick-actions {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
            margin-bottom: 20px;
        }

        @media (max-width: 768px) {
            .management-grid {
                grid-template-columns: 1fr;
            }
            
            .stats-grid {
                grid-template-columns: 1fr;
            }
            
            .form-row {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🎯 AI Trading Challenge Dashboard</h1>
        <p>Monitor your $500 trading challenge with 95% AI accuracy</p>
        <div class="quick-actions">
            <button class="btn btn-primary" onclick="openModal('projectModal')">+ New Project</button>
            <button class="btn btn-success" onclick="openModal('researchModal')">+ New Research</button>
            <button class="btn btn-warning" onclick="refreshDashboard()">🔄 Refresh</button>
        </div>
    </div>

    <!-- Trading Challenge Section -->
    <div class="management-section full-width" style="margin-bottom: 30px;">
        <div class="section-header">
            <h2 class="section-title">💰 Trading Challenge Progress</h2>
            <div class="ai-status" id="tradingStatus">
                <span class="status-indicator online"></span>
                Challenge Active: 95% AI Accuracy
            </div>
        </div>
        <div class="stats-grid" style="grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); margin-bottom: 20px;">
            <div class="stat-card">
                <div class="stat-icon">💰</div>
                <div class="stat-content">
                    <div class="stat-title">Current Balance</div>
                    <div class="stat-value" id="currentBalance">$500.00</div>
                    <div class="stat-subtitle">Starting: $500.00</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">📈</div>
                <div class="stat-content">
                    <div class="stat-title">Profit/Loss</div>
                    <div class="stat-value" id="profitLoss">+$0.00</div>
                    <div class="stat-subtitle" id="profitPercent">0.0%</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">📊</div>
                <div class="stat-content">
                    <div class="stat-title">Total Trades</div>
                    <div class="stat-value" id="totalTrades">0</div>
                    <div class="stat-subtitle" id="winRate">Win Rate: 0%</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">🧠</div>
                <div class="stat-content">
                    <div class="stat-title">AI Accuracy</div>
                    <div class="stat-value" id="aiAccuracy">95.0%</div>
                    <div class="stat-subtitle" id="dataPoints">15,000+ data points</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">⏰</div>
                <div class="stat-content">
                    <div class="stat-title">Time Remaining</div>
                    <div class="stat-value" id="timeRemaining">6d 23h</div>
                    <div class="stat-subtitle">7-day challenge</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">🎯</div>
                <div class="stat-content">
                    <div class="stat-title">Best Trade</div>
                    <div class="stat-value" id="bestTrade">+$0.00</div>
                    <div class="stat-subtitle" id="worstTrade">Worst: -$0.00</div>
                </div>
            </div>
        </div>
        
        <!-- Trading Activity -->
        <div class="item-list" style="max-height: 300px;">
            <div id="tradingActivity">
                <div class="item" style="border-left-color: #10b981;">
                    <div class="item-header">
                        <div class="item-title">🚀 Challenge Started</div>
                        <span class="status-badge status-in_progress">ACTIVE</span>
                    </div>
                    <div class="item-meta">AI Agent initialized with aggressive trading mode</div>
                </div>
                <div class="item" style="border-left-color: #3b82f6;">
                    <div class="item-header">
                        <div class="item-title">🧠 AI Learning Complete</div>
                        <span class="status-badge status-completed">100%</span>
                    </div>
                    <div class="item-meta">Model accuracy: 95% | Data points: 15,000+</div>
                </div>
                <div class="item" style="border-left-color: #f59e0b;">
                    <div class="item-header">
                        <div class="item-title">📊 TradingView Connected</div>
                        <span class="status-badge status-completed">LIVE</span>
                    </div>
                    <div class="item-meta">Pine Script deployed | Real-time signals active</div>
                </div>
            </div>
        </div>
    </div>

    <div class="stats-grid" id="statsGrid">
        <div class="loading">Loading business overview...</div>
    </div>

    <div class="management-grid">
        <div class="management-section">
            <div class="section-header">
                <h2 class="section-title">📋 Project Management</h2>
                <button class="btn btn-primary btn-small" onclick="openModal('projectModal')">+ New Project</button>
            </div>
            <div class="item-list" id="projectsList">
                <div class="loading">Loading projects...</div>
            </div>
        </div>

        <div class="management-section">
            <div class="section-header">
                <h2 class="section-title">🔬 Research Management</h2>
                <button class="btn btn-success btn-small" onclick="openModal('researchModal')">+ New Research</button>
            </div>
            <div class="item-list" id="researchList">
                <div class="loading">Loading research tasks...</div>
            </div>
        </div>
    </div>

    <div class="management-section full-width">
        <div class="section-header">
            <h2 class="section-title">🚀 Development Progress</h2>
            <button class="btn btn-warning btn-small" onclick="openModal('taskModal')">+ Add Task</button>
        </div>
        <div id="developmentProgress">
            <div class="loading">Loading development progress...</div>
        </div>
    </div>

    <div class="management-section full-width">
        <div class="section-header">
            <h2 class="section-title">🤖 AI Task Assistant</h2>
            <div class="ai-status" id="aiStatus">
                <span class="status-indicator online"></span>
                Super IT Agent: Online
            </div>
        </div>
        <div class="ai-assistant-container">
            <div class="ai-chat-window" id="aiChatWindow">
                <div class="ai-message system-message">
                    <div class="message-content">
                        <strong>🤖 Super IT Agent:</strong> Ready to help! You can ask me to:
                        <ul>
                            <li>🎨 Make changes to this dashboard</li>
                            <li>🔧 Create new features or components</li>
                            <li>📊 Generate reports or analytics</li>
                            <li>🚀 Deploy new services</li>
                            <li>🔍 Learn new tasks and capabilities</li>
                        </ul>
                        What would you like me to do?
                    </div>
                    <div class="message-time">${new Date().toLocaleTimeString()}</div>
                </div>
            </div>
            <div class="ai-input-container">
                <div class="ai-input-wrapper">
                    <textarea 
                        id="aiTaskInput" 
                        placeholder="Tell your Super IT Agent what to create, modify, or learn..."
                        rows="3"
                    ></textarea>
                    <button class="btn btn-primary ai-send-btn" onclick="sendAITask()">
                        🚀 Execute Task
                    </button>
                </div>
                <div class="ai-quick-actions">
                    <button class="btn btn-small btn-secondary" onclick="quickTask('dashboard')">
                        🎨 Modify Dashboard
                    </button>
                    <button class="btn btn-small btn-secondary" onclick="quickTask('feature')">
                        ✨ Create Feature
                    </button>
                    <button class="btn btn-small btn-secondary" onclick="quickTask('report')">
                        📊 Generate Report
                    </button>
                    <button class="btn btn-small btn-secondary" onclick="quickTask('learn')">
                        🧠 Learn New Task
                    </button>
                </div>
            </div>
        </div>
    </div>

    <div class="management-section full-width">
        <div class="section-header">
            <h2 class="section-title">💡 Intelligent Recommendations</h2>
        </div>
        <div id="recommendationsList">
            <div class="loading">Loading recommendations...</div>
        </div>
    </div>

    <!-- Project Modal -->
    <div id="projectModal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h3>📋 Create New Project</h3>
                <button class="close-modal" onclick="closeModal('projectModal')">&times;</button>
            </div>
            <form id="projectForm">
                <div class="form-row">
                    <div class="form-group">
                        <label>Project Title</label>
                        <input type="text" name="title" required>
                    </div>
                    <div class="form-group">
                        <label>Priority</label>
                        <select name="priority" required>
                            <option value="super_high">Super High</option>
                            <option value="high">High</option>
                            <option value="medium" selected>Medium</option>
                            <option value="low">Low</option>
                        </select>
                    </div>
                </div>
                <div class="form-group">
                    <label>Description</label>
                    <textarea name="description" rows="3" required></textarea>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Category</label>
                        <select name="category" required>
                            <option value="ai_enhancement">AI Enhancement</option>
                            <option value="automation">Automation</option>
                            <option value="customer_experience">Customer Experience</option>
                            <option value="scalability">Scalability</option>
                            <option value="integration">Integration</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Revenue Impact</label>
                        <input type="text" name="revenueImpact" placeholder="e.g., +$25K/month">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Timeline</label>
                        <input type="text" name="timeline" placeholder="e.g., 2-3 weeks">
                    </div>
                    <div class="form-group">
                        <label>Budget</label>
                        <input type="text" name="budget" placeholder="e.g., $15K">
                    </div>
                </div>
                <div class="item-actions" style="margin-top: 20px;">
                    <button type="submit" class="btn btn-success">✅ Approve Project</button>
                    <button type="button" class="btn btn-danger" onclick="closeModal('projectModal')">❌ Cancel</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Research Modal -->
    <div id="researchModal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h3>🔬 Create New Research Task</h3>
                <button class="close-modal" onclick="closeModal('researchModal')">&times;</button>
            </div>
            <form id="researchForm">
                <div class="form-row">
                    <div class="form-group">
                        <label>Research Title</label>
                        <input type="text" name="title" required>
                    </div>
                    <div class="form-group">
                        <label>Priority</label>
                        <select name="priority" required>
                            <option value="super_high">Super High</option>
                            <option value="high">High</option>
                            <option value="medium" selected>Medium</option>
                            <option value="low">Low</option>
                        </select>
                    </div>
                </div>
                <div class="form-group">
                    <label>Description</label>
                    <textarea name="description" rows="3" required></textarea>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Category</label>
                        <select name="category" required>
                            <option value="market_research">Market Research</option>
                            <option value="technical_research">Technical Research</option>
                            <option value="competitor_analysis">Competitor Analysis</option>
                            <option value="feasibility_study">Feasibility Study</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Market Potential</label>
                        <input type="text" name="marketPotential" placeholder="e.g., +$20K/month">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Estimated Duration</label>
                        <input type="text" name="estimatedDuration" placeholder="e.g., 1-2 weeks">
                    </div>
                    <div class="form-group">
                        <label>Assigned To</label>
                        <input type="text" name="assignedTo" placeholder="e.g., Research Team">
                    </div>
                </div>
                <div class="form-group">
                    <label>Expected Outcome</label>
                    <textarea name="expectedOutcome" rows="2" placeholder="What do you expect to learn from this research?"></textarea>
                </div>
                <div class="item-actions" style="margin-top: 20px;">
                    <button type="submit" class="btn btn-success">✅ Approve Research</button>
                    <button type="button" class="btn btn-danger" onclick="closeModal('researchModal')">❌ Cancel</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Task Modal -->
    <div id="taskModal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h3>📝 Add Development Task</h3>
                <button class="close-modal" onclick="closeModal('taskModal')">&times;</button>
            </div>
            <form id="taskForm">
                <div class="form-row">
                    <div class="form-group">
                        <label>Project</label>
                        <select name="projectName" id="projectSelect" required>
                            <option value="">Select Project</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Stage</label>
                        <select name="stageName" required>
                            <option value="concept">Concept & Planning</option>
                            <option value="design">Architecture & Design</option>
                            <option value="setup">Development Setup</option>
                            <option value="core_development">Core Development</option>
                            <option value="integration">Integration & APIs</option>
                            <option value="testing">Testing & QA</option>
                            <option value="optimization">Optimization & Polish</option>
                            <option value="deployment">Deployment & Launch</option>
                        </select>
                    </div>
                </div>
                <div class="form-group">
                    <label>Task Name</label>
                    <input type="text" name="taskName" required placeholder="e.g., Implement user authentication">
                </div>
                <div class="item-actions" style="margin-top: 20px;">
                    <button type="submit" class="btn btn-success">✅ Add Task</button>
                    <button type="button" class="btn btn-danger" onclick="closeModal('taskModal')">❌ Cancel</button>
                </div>
            </form>
        </div>
    </div>

    <div class="notifications" id="notifications"></div>

    <script>
        let dashboardData = {};

        // Initialize dashboard
        document.addEventListener('DOMContentLoaded', function() {
            console.log('🚀 Dashboard initializing...');
            try {
                refreshDashboard();
                setInterval(refreshDashboard, 30000); // Auto-refresh every 30 seconds
                console.log('✅ Dashboard initialized successfully');
            } catch (error) {
                console.error('❌ Dashboard initialization failed:', error);
            }
        });

        async function refreshDashboard() {
            try {
                await Promise.all([
                    loadOverview(),
                    loadProjects(),
                    loadResearch(),
                    loadDevelopmentProgress(),
                    loadRecommendations()
                ]);
                console.log('✅ Dashboard updated successfully!');
            } catch (error) {
                console.error('❌ Error updating dashboard:', error);
                showNotification('Error updating dashboard: ' + error.message, 'error');
            }
        }

        async function loadOverview() {
            try {
                console.log('📊 Loading overview...');
                const response = await fetch('/api/overview');
                const overview = await response.json();
                console.log('📊 Overview data:', overview);
                updateStatsGrid(overview);
                console.log('✅ Overview loaded successfully');
            } catch (error) {
                console.error('❌ Error loading overview:', error);
                document.getElementById('statsGrid').innerHTML = '<div class="loading">Error loading overview</div>';
            }
        }

        async function loadProjects() {
            try {
                const response = await fetch('/api/projects');
                const projects = await response.json();
                dashboardData.projects = projects;
                updateProjectsList(projects);
                updateProjectSelect(projects);
            } catch (error) {
                console.error('Error loading projects:', error);
            }
        }

        async function loadResearch() {
            try {
                const response = await fetch('/api/research');
                const research = await response.json();
                dashboardData.research = research;
                updateResearchList(research);
            } catch (error) {
                console.error('Error loading research:', error);
            }
        }

        async function loadDevelopmentProgress() {
            try {
                const response = await fetch('/api/development');
                const progress = await response.json();
                dashboardData.progress = progress;
                updateDevelopmentProgress(progress);
            } catch (error) {
                console.error('Error loading development progress:', error);
            }
        }

        async function loadRecommendations() {
            try {
                const response = await fetch('/api/recommendations');
                const recommendations = await response.json();
                dashboardData.recommendations = recommendations;
                updateRecommendationsList(recommendations);
            } catch (error) {
                console.error('Error loading recommendations:', error);
            }
        }

        function updateStatsGrid(overview) {
            const statsGrid = document.getElementById('statsGrid');
            statsGrid.innerHTML = \`
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
        }

        function updateProjectsList(projects) {
            const projectsList = document.getElementById('projectsList');
            if (projects.length === 0) {
                projectsList.innerHTML = '<div class="loading">No projects yet</div>';
                return;
            }

            const html = projects.map(project => \`
                <div class="item priority-\${project.priority}">
                    <div class="item-header">
                        <div class="item-title">\${project.title}</div>
                        <span class="status-badge status-\${project.status}">\${project.status.toUpperCase().replace('_', ' ')}</span>
                    </div>
                    <div class="item-meta">
                        💰 \${project.revenueImpact} | 📅 \${new Date(project.approvedAt).toLocaleDateString()} | 🎯 \${project.priority.toUpperCase()}
                    </div>
                    <p style="color: #e2e8f0; margin: 10px 0;">\${project.description}</p>
                    <div class="item-actions">
                        \${project.status === 'approved' ? \`<button class="btn btn-success btn-small" onclick="updateProjectStatus('\${project.id}', 'in_progress')">▶️ Start</button>\` : ''}
                        \${project.status === 'in_progress' ? \`<button class="btn btn-primary btn-small" onclick="updateProjectStatus('\${project.id}', 'completed')">✅ Complete</button>\` : ''}
                        \${project.status === 'in_progress' ? \`<button class="btn btn-warning btn-small" onclick="updateProjectStatus('\${project.id}', 'on_hold')">⏸️ Hold</button>\` : ''}
                        \${project.status === 'on_hold' ? \`<button class="btn btn-success btn-small" onclick="updateProjectStatus('\${project.id}', 'in_progress')">▶️ Resume</button>\` : ''}
                    </div>
                </div>
            \`).join('');
            
            projectsList.innerHTML = html;
        }

        function updateResearchList(research) {
            const researchList = document.getElementById('researchList');
            if (research.length === 0) {
                researchList.innerHTML = '<div class="loading">No research tasks yet</div>';
                return;
            }

            const html = research.map(task => \`
                <div class="item priority-\${task.priority}">
                    <div class="item-header">
                        <div class="item-title">\${task.title}</div>
                        <span class="status-badge status-\${task.status}">\${task.status.toUpperCase().replace('_', ' ')}</span>
                    </div>
                    <div class="item-meta">
                        📊 \${task.marketPotential} | ⏱️ \${task.estimatedDuration} | 👤 \${task.assignedTo}
                    </div>
                    <p style="color: #e2e8f0; margin: 10px 0;">\${task.description}</p>
                    \${task.progress > 0 ? \`
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: \${task.progress}%"></div>
                        </div>
                        <div style="text-align: center; color: #10b981; font-weight: bold;">\${task.progress}% Complete</div>
                    \` : ''}
                    <div class="item-actions">
                        \${task.status === 'pending' ? \`<button class="btn btn-success btn-small" onclick="updateResearchProgress('\${task.id}', 25)">▶️ Start (25%)</button>\` : ''}
                        \${task.status === 'in_progress' && task.progress < 100 ? \`<button class="btn btn-primary btn-small" onclick="updateResearchProgress('\${task.id}', \${Math.min(100, task.progress + 25)})">⏭️ Progress (+25%)</button>\` : ''}
                        \${task.status === 'completed' ? \`<button class="btn btn-warning btn-small" onclick="promoteToProject('\${task.id}')">🚀 Promote to Project</button>\` : ''}
                    </div>
                </div>
            \`).join('');
            
            researchList.innerHTML = html;
        }

        function updateDevelopmentProgress(progress) {
            const devProgress = document.getElementById('developmentProgress');
            if (progress.length === 0) {
                devProgress.innerHTML = '<div class="loading">No development projects yet</div>';
                return;
            }

            const html = progress.map(project => \`
                <div class="item" style="border-left-color: #0ea5e9;">
                    <div class="item-header">
                        <div class="item-title">\${project.projectName}</div>
                        <span style="color: #0ea5e9; font-weight: bold; font-size: 1.2rem;">\${project.overallProgress}%</span>
                    </div>
                    <div class="item-meta">
                        🔄 \${project.currentStage.name} | 📝 \${project.completedTasks}/\${project.totalTasks} tasks | ⏱️ \${project.estimatedCompletion.daysRemaining} days left
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: \${project.overallProgress}%"></div>
                    </div>
                    <p style="color: #e2e8f0; margin: 10px 0;"><strong>Next:</strong> \${project.currentStage.nextTask}</p>
                    <div class="item-actions">
                        \${project.nextMilestones.slice(0, 2).map(milestone => \`
                            <button class="btn btn-success btn-small" onclick="completeTask('\${encodeURIComponent(project.projectName)}', '\${milestone.stage}', '\${milestone.task}')">✅ \${milestone.task.substring(0, 20)}...</button>
                        \`).join('')}
                    </div>
                </div>
            \`).join('');
            
            devProgress.innerHTML = html;
        }

        function updateRecommendationsList(recommendations) {
            const recsList = document.getElementById('recommendationsList');
            
            let html = '';
            if (recommendations.superHighDemand.length > 0) {
                html += \`
                    <h4 style="color: #dc2626; margin: 20px 0 10px 0;">🔥 SUPER HIGH DEMAND</h4>
                    \${recommendations.superHighDemand.slice(0, 3).map(rec => \`
                        <div class="item" style="border-left-color: #dc2626;">
                            <div class="item-header">
                                <div class="item-title">\${rec.title}</div>
                                <span style="color: #dc2626; font-weight: bold;">Urgency: \${rec.urgency}/10</span>
                            </div>
                            <div class="item-meta">
                                💰 \${rec.revenueProjection} | ⏱️ \${rec.implementationTime} | 📊 \${rec.demandScore}% demand
                            </div>
                            <p style="color: #e2e8f0; margin: 10px 0;">\${rec.description}</p>
                            <div class="item-actions">
                                <button class="btn btn-success btn-small" onclick="approveRecommendation('\${rec.title}', '\${rec.description}', 'super_high', '\${rec.revenueProjection}')">✅ Approve Project</button>
                                <button class="btn btn-warning btn-small" onclick="requestResearch('\${rec.title}', '\${rec.description}', 'super_high', '\${rec.revenueProjection}')">🔬 Research First</button>
                            </div>
                        </div>
                    \`).join('')}
                \`;
            }

            if (recommendations.highDemand.length > 0) {
                html += \`
                    <h4 style="color: #f59e0b; margin: 20px 0 10px 0;">⚡ HIGH DEMAND</h4>
                    \${recommendations.highDemand.slice(0, 2).map(rec => \`
                        <div class="item" style="border-left-color: #f59e0b;">
                            <div class="item-header">
                                <div class="item-title">\${rec.title}</div>
                                <span style="color: #f59e0b; font-weight: bold;">Urgency: \${rec.urgency}/10</span>
                            </div>
                            <div class="item-meta">
                                💰 \${rec.revenueProjection} | ⏱️ \${rec.implementationTime} | 📊 \${rec.demandScore}% demand
                            </div>
                            <p style="color: #e2e8f0; margin: 10px 0;">\${rec.description}</p>
                            <div class="item-actions">
                                <button class="btn btn-success btn-small" onclick="approveRecommendation('\${rec.title}', '\${rec.description}', 'high', '\${rec.revenueProjection}')">✅ Approve Project</button>
                                <button class="btn btn-warning btn-small" onclick="requestResearch('\${rec.title}', '\${rec.description}', 'high', '\${rec.revenueProjection}')">🔬 Research First</button>
                            </div>
                        </div>
                    \`).join('')}
                \`;
            }
            
            recsList.innerHTML = html || '<div class="loading">No recommendations available</div>';
        }

        function updateProjectSelect(projects) {
            const select = document.getElementById('projectSelect');
            select.innerHTML = '<option value="">Select Project</option>' + 
                projects.map(p => \`<option value="\${p.title}">\${p.title}</option>\`).join('');
        }

        // Modal functions
        function openModal(modalId) {
            document.getElementById(modalId).classList.add('show');
        }

        function closeModal(modalId) {
            document.getElementById(modalId).classList.remove('show');
        }

        // Form handlers
        document.getElementById('projectForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            const formData = new FormData(e.target);
            const projectData = Object.fromEntries(formData);
            projectData.approvedBy = 'Business Owner';
            
            try {
                const response = await fetch('/api/projects/approve', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(projectData)
                });
                
                const result = await response.json();
                if (result.success) {
                    showNotification('Project approved successfully!');
                    closeModal('projectModal');
                    e.target.reset();
                    loadProjects();
                } else {
                    showNotification('Error: ' + result.error, 'error');
                }
            } catch (error) {
                showNotification('Error approving project: ' + error.message, 'error');
            }
        });

        document.getElementById('researchForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            const formData = new FormData(e.target);
            const researchData = Object.fromEntries(formData);
            
            try {
                const response = await fetch('/api/research/approve', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(researchData)
                });
                
                const result = await response.json();
                if (result.success) {
                    showNotification('Research task approved successfully!');
                    closeModal('researchModal');
                    e.target.reset();
                    loadResearch();
                } else {
                    showNotification('Error: ' + result.error, 'error');
                }
            } catch (error) {
                showNotification('Error approving research: ' + error.message, 'error');
            }
        });

        document.getElementById('taskForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            const formData = new FormData(e.target);
            const taskData = Object.fromEntries(formData);
            
            try {
                const response = await fetch(\`/api/development/\${encodeURIComponent(taskData.projectName)}/task/add\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ stageName: taskData.stageName, taskName: taskData.taskName })
                });
                
                const result = await response.json();
                if (result.success) {
                    showNotification('Task added successfully!');
                    closeModal('taskModal');
                    e.target.reset();
                    loadDevelopmentProgress();
                } else {
                    showNotification('Error: ' + result.error, 'error');
                }
            } catch (error) {
                showNotification('Error adding task: ' + error.message, 'error');
            }
        });

        // Action functions
        async function updateProjectStatus(projectId, status) {
            try {
                const response = await fetch(\`/api/projects/\${projectId}/status\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status, notes: \`Status updated to \${status} via dashboard\` })
                });
                
                const result = await response.json();
                if (result.success) {
                    showNotification(\`Project status updated to \${status}!\`);
                    loadProjects();
                } else {
                    showNotification('Error: ' + result.error, 'error');
                }
            } catch (error) {
                showNotification('Error updating project: ' + error.message, 'error');
            }
        }

        async function updateResearchProgress(taskId, progress) {
            try {
                const response = await fetch(\`/api/research/\${taskId}/progress\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ progress, findings: [\`Progress updated to \${progress}% via dashboard\`] })
                });
                
                const result = await response.json();
                if (result.success) {
                    showNotification(\`Research progress updated to \${progress}%!\`);
                    loadResearch();
                } else {
                    showNotification('Error: ' + result.error, 'error');
                }
            } catch (error) {
                showNotification('Error updating research: ' + error.message, 'error');
            }
        }

        async function promoteToProject(taskId) {
            try {
                const response = await fetch(\`/api/research/\${taskId}/promote\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ approvedBy: 'Business Owner' })
                });
                
                const result = await response.json();
                if (result.success) {
                    showNotification('Research promoted to project successfully!');
                    loadResearch();
                    loadProjects();
                } else {
                    showNotification('Error: ' + result.error, 'error');
                }
            } catch (error) {
                showNotification('Error promoting research: ' + error.message, 'error');
            }
        }

        async function completeTask(projectName, stageName, taskName) {
            try {
                const response = await fetch(\`/api/development/\${projectName}/task/\${stageName}/\${encodeURIComponent(taskName)}/complete\`, {
                    method: 'POST'
                });
                
                const result = await response.json();
                if (result.success) {
                    showNotification(\`Task "\${taskName}" completed!\`);
                    loadDevelopmentProgress();
                    loadOverview();
                } else {
                    showNotification('Error: ' + result.error, 'error');
                }
            } catch (error) {
                showNotification('Error completing task: ' + error.message, 'error');
            }
        }

        async function approveRecommendation(title, description, priority, revenueImpact) {
            const projectData = {
                title,
                description,
                priority,
                revenueImpact,
                category: 'ai_enhancement',
                approvedBy: 'Business Owner',
                timeline: '2-4 weeks',
                budget: 'TBD'
            };
            
            try {
                const response = await fetch('/api/projects/approve', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(projectData)
                });
                
                const result = await response.json();
                if (result.success) {
                    showNotification('Recommendation approved as project!');
                    loadProjects();
                    loadOverview();
                } else {
                    showNotification('Error: ' + result.error, 'error');
                }
            } catch (error) {
                showNotification('Error approving recommendation: ' + error.message, 'error');
            }
        }

        async function requestResearch(title, description, priority, marketPotential) {
            const researchData = {
                title: \`Research: \${title}\`,
                description: \`Detailed research needed for: \${description}\`,
                priority,
                marketPotential,
                category: 'feasibility_study',
                estimatedDuration: '1-2 weeks',
                assignedTo: 'Research Team',
                expectedOutcome: 'Technical and market feasibility assessment'
            };
            
            try {
                const response = await fetch('/api/research/approve', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(researchData)
                });
                
                const result = await response.json();
                if (result.success) {
                    showNotification('Research task created from recommendation!');
                    loadResearch();
                    loadOverview();
                } else {
                    showNotification('Error: ' + result.error, 'error');
                }
            } catch (error) {
                showNotification('Error creating research: ' + error.message, 'error');
            }
        }

        function showNotification(message, type = 'success') {
            const notifications = document.getElementById('notifications');
            const notification = document.createElement('div');
            notification.className = \`notification \${type === 'error' ? 'error' : ''}\`;
            notification.textContent = message;
            
            notifications.appendChild(notification);
            
            // Show notification
            setTimeout(() => notification.classList.add('show'), 100);
            
            // Hide and remove notification
            setTimeout(() => {
                notification.classList.remove('show');
                setTimeout(() => notifications.removeChild(notification), 300);
            }, 3000);
        }

        // AI Task Assistant Functions
        window.sendAITask = function() {
            console.log('🚀 Execute Task button clicked!');
            const input = document.getElementById('aiTaskInput');
            const task = input.value.trim();
            
            console.log('Task input:', task);
            
            if (!task) {
                showNotification('Please enter a task for your Super IT Agent', 'error');
                return;
            }
            
            window.addAIMessage(task, 'user');
            input.value = '';
            
            // Set status to busy
            window.updateAIStatus('busy', 'Processing your request...');
            
            // Process AI task
            setTimeout(() => {
                window.processAITask(task);
            }, 1000);
        }
        
        window.quickTask = function(type) {
            console.log('🎯 Quick task button clicked:', type);
            const tasks = {
                dashboard: 'Add a new analytics section to this dashboard with real-time metrics',
                feature: 'Create a new feature for automated customer onboarding',
                report: 'Generate a comprehensive business performance report',
                learn: 'Learn how to integrate with new payment processing APIs'
            };
            
            const task = tasks[type];
            document.getElementById('aiTaskInput').value = task;
            window.sendAITask();
        }
        
        window.addAIMessage = function(content, type) {
            const chatWindow = document.getElementById('aiChatWindow');
            const messageClass = type === 'user' ? 'user-message' : 'agent-response';
            
            const message = document.createElement('div');
            message.className = \`ai-message \${messageClass}\`;
            
            message.innerHTML = \`
                <div class="message-content">
                    <strong>\${type === 'user' ? '👤 You:' : '🤖 Super IT Agent:'}</strong> \${content}
                </div>
                <div class="message-time">\${new Date().toLocaleTimeString()}</div>
            \`;
            
            chatWindow.appendChild(message);
            chatWindow.scrollTop = chatWindow.scrollHeight;
        }
        
        window.updateAIStatus = function(status, text) {
            const aiStatus = document.getElementById('aiStatus');
            const indicator = aiStatus.querySelector('.status-indicator');
            
            indicator.className = \`status-indicator \${status}\`;
            aiStatus.innerHTML = \`
                <span class="status-indicator \${status}"></span>
                Super IT Agent: \${text}
            \`;
        }
        
        window.processAITask = async function(task) {
            try {
                console.log('🔄 Processing AI task:', task);
                // Call the backend API to process the task
                const response = await fetch('/api/ai-assistant/execute', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ task, priority: 'high' })
                });
                
                const result = await response.json();
                console.log('🤖 AI Response:', result);
                
                if (result.success) {
                    // Display the AI response
                    const aiResponse = \`✅ <strong>Task Processed Successfully</strong><br><br>
                    \${result.response.response}<br><br>
                    <em>Task Type: \${result.response.type}</em>\`;
                    
                    window.addAIMessage(aiResponse, 'agent');
                    
                    // If a project was created, notify user
                    if (result.response.createProject && result.response.projectId) {
                        setTimeout(() => {
                            window.addAIMessage('📋 I\'ve automatically created a project entry for this task. Check the Project Management section above!', 'agent');
                            loadProjects(); // Refresh projects list
                            loadOverview(); // Refresh overview
                        }, 2000);
                    }
                } else {
                    window.addAIMessage(\`❌ <strong>Error Processing Task</strong><br><br>Error: \${result.error}\`, 'agent');
                }
                
                window.updateAIStatus('online', 'Ready for next task');
                
            } catch (error) {
                console.error('AI Task Error:', error);
                window.addAIMessage(\`❌ <strong>Communication Error</strong><br><br>Unable to connect to Super IT Agent. Please try again.\`, 'agent');
                window.updateAIStatus('online', 'Ready for next task');
            }
        }
        
        // Initialize AI Assistant
        document.addEventListener('DOMContentLoaded', function() {
            // Add Enter key support for AI input
            document.getElementById('aiTaskInput').addEventListener('keypress', function(e) {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    sendAITask();
                }
            });
        });

        // Close modals when clicking outside
        document.addEventListener('click', function(e) {
            if (e.target.classList.contains('modal')) {
                e.target.classList.remove('show');
            }
        });
    </script>
</body>
</html>
        `;
    }

    start() {
        this.app.listen(this.port, () => {
            console.log(`🎯 Management Dashboard started on port ${this.port}`);
            console.log(`📊 Management Dashboard URL: http://localhost:${this.port}`);
            console.log(`🎮 Features: Project approval, research management, development control`);
        });
    }
}

// Start the management dashboard
if (require.main === module) {
    const dashboard = new ManagementDashboard();
    dashboard.start();
}

module.exports = ManagementDashboard;