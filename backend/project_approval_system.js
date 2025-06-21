require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');

class ProjectApprovalSystem {
    constructor() {
        this.approvedProjects = new Map();
        this.researchTasks = new Map();
        this.projectDatabase = './project_database.json';
        this.researchDatabase = './research_database.json';
        this.initializeSystem();
    }

    async initializeSystem() {
        await this.loadExistingData();
        this.setupDefaultProjects();
    }

    async loadExistingData() {
        try {
            // Load approved projects
            const projectData = await fs.readFile(this.projectDatabase, 'utf8');
            const projects = JSON.parse(projectData);
            projects.forEach(project => {
                this.approvedProjects.set(project.id, project);
            });
        } catch (error) {
            // Initialize with empty database
            await this.saveProjectDatabase();
        }

        try {
            // Load research tasks
            const researchData = await fs.readFile(this.researchDatabase, 'utf8');
            const research = JSON.parse(researchData);
            research.forEach(task => {
                this.researchTasks.set(task.id, task);
            });
        } catch (error) {
            // Initialize with empty database
            await this.saveResearchDatabase();
        }
    }

    setupDefaultProjects() {
        // Add some initial approved projects if none exist
        if (this.approvedProjects.size === 0) {
            this.approveProject({
                title: 'Super Customer Service Agent',
                description: 'AI-powered email customer service automation',
                status: 'completed',
                priority: 'high',
                approvedBy: 'System Admin',
                revenueImpact: '+$15K/month',
                completionDate: new Date().toISOString(),
                category: 'automation'
            });

            this.approveProject({
                title: 'Intelligent Recommendation Engine',
                description: 'Market trend analysis and upgrade suggestions',
                status: 'completed',
                priority: 'high',
                approvedBy: 'System Admin',
                revenueImpact: 'Strategy Enhancement',
                completionDate: new Date().toISOString(),
                category: 'ai_enhancement'
            });
        }

        // Add some research tasks if none exist
        if (this.researchTasks.size === 0) {
            this.addResearchTask({
                title: 'AI Job Matching Feasibility Study',
                description: 'Research technical requirements and market positioning for AI-powered job matching',
                priority: 'super_high',
                assignedTo: 'AI Research Team',
                estimatedDuration: '1-2 weeks',
                expectedOutcome: 'Technical specification and implementation roadmap',
                marketPotential: '+$25K/month',
                category: 'market_research'
            });

            this.addResearchTask({
                title: 'Video Interview Platform Integration',
                description: 'Investigate video processing libraries and interview coaching algorithms',
                priority: 'high',
                assignedTo: 'Development Team',
                estimatedDuration: '1 week',
                expectedOutcome: 'Technical feasibility report and cost analysis',
                marketPotential: '+$18K/month',
                category: 'technical_research'
            });

            this.addResearchTask({
                title: 'Multi-Language Resume Market Analysis',
                description: 'Research international markets and localization requirements',
                priority: 'medium',
                assignedTo: 'Business Intelligence',
                estimatedDuration: '2-3 weeks',
                expectedOutcome: 'Market entry strategy and revenue projections',
                marketPotential: '+$20K/month',
                category: 'market_research'
            });
        }
    }

    async approveProject(projectData) {
        const project = {
            id: `PROJ_${Date.now()}`,
            ...projectData,
            approvedAt: new Date().toISOString(),
            status: projectData.status || 'approved',
            timeline: projectData.timeline || 'TBD',
            milestones: projectData.milestones || [],
            team: projectData.team || 'Unassigned',
            budget: projectData.budget || 'TBD',
            risks: projectData.risks || [],
            dependencies: projectData.dependencies || []
        };

        this.approvedProjects.set(project.id, project);
        await this.saveProjectDatabase();
        
        console.log(`✅ Project approved: ${project.title}`);
        return project;
    }

    async addResearchTask(taskData) {
        const task = {
            id: `RESEARCH_${Date.now()}`,
            ...taskData,
            createdAt: new Date().toISOString(),
            status: taskData.status || 'pending',
            progress: taskData.progress || 0,
            findings: taskData.findings || [],
            resources: taskData.resources || [],
            nextSteps: taskData.nextSteps || []
        };

        this.researchTasks.set(task.id, task);
        await this.saveResearchDatabase();
        
        console.log(`🔬 Research task added: ${task.title}`);
        return task;
    }

    async updateProjectStatus(projectId, status, notes = '') {
        const project = this.approvedProjects.get(projectId);
        if (!project) {
            throw new Error(`Project ${projectId} not found`);
        }

        project.status = status;
        project.lastUpdated = new Date().toISOString();
        if (notes) {
            project.statusNotes = notes;
        }

        if (status === 'completed') {
            project.completedAt = new Date().toISOString();
        }

        await this.saveProjectDatabase();
        console.log(`📊 Project ${project.title} status updated to: ${status}`);
        return project;
    }

    async updateResearchProgress(taskId, progress, findings = []) {
        const task = this.researchTasks.get(taskId);
        if (!task) {
            throw new Error(`Research task ${taskId} not found`);
        }

        task.progress = progress;
        task.lastUpdated = new Date().toISOString();
        if (findings.length > 0) {
            task.findings.push(...findings);
        }

        if (progress >= 100) {
            task.status = 'completed';
            task.completedAt = new Date().toISOString();
        }

        await this.saveResearchDatabase();
        console.log(`🔬 Research task ${task.title} progress updated to: ${progress}%`);
        return task;
    }

    async promoteResearchToProject(taskId, projectData = {}) {
        const task = this.researchTasks.get(taskId);
        if (!task) {
            throw new Error(`Research task ${taskId} not found`);
        }

        // Create project from research
        const project = await this.approveProject({
            title: projectData.title || task.title.replace('Research:', '').replace('Study:', ''),
            description: projectData.description || `Implementation of ${task.title} findings`,
            priority: task.priority,
            category: task.category,
            revenueImpact: task.marketPotential,
            researchBasis: {
                taskId: task.id,
                findings: task.findings,
                recommendations: task.nextSteps
            },
            ...projectData
        });

        // Mark research as completed and promoted
        await this.updateResearchProgress(taskId, 100, ['Research promoted to approved project']);
        task.promotedToProject = project.id;
        await this.saveResearchDatabase();

        console.log(`🚀 Research task promoted to project: ${project.title}`);
        return project;
    }

    getApprovedProjects() {
        return Array.from(this.approvedProjects.values()).sort((a, b) => 
            new Date(b.approvedAt) - new Date(a.approvedAt)
        );
    }

    getResearchTasks() {
        return Array.from(this.researchTasks.values()).sort((a, b) => {
            const priorityOrder = { 'super_high': 4, 'high': 3, 'medium': 2, 'low': 1 };
            return (priorityOrder[b.priority] || 1) - (priorityOrder[a.priority] || 1);
        });
    }

    getProjectsByStatus(status) {
        return this.getApprovedProjects().filter(project => project.status === status);
    }

    getResearchByCategory(category) {
        return this.getResearchTasks().filter(task => task.category === category);
    }

    async getProjectSummary() {
        const projects = this.getApprovedProjects();
        const research = this.getResearchTasks();

        const summary = {
            projects: {
                total: projects.length,
                approved: projects.filter(p => p.status === 'approved').length,
                inProgress: projects.filter(p => p.status === 'in_progress').length,
                completed: projects.filter(p => p.status === 'completed').length,
                onHold: projects.filter(p => p.status === 'on_hold').length
            },
            research: {
                total: research.length,
                pending: research.filter(r => r.status === 'pending').length,
                inProgress: research.filter(r => r.status === 'in_progress').length,
                completed: research.filter(r => r.status === 'completed').length
            },
            revenueImpact: {
                approved: this.calculateTotalRevenue(projects.filter(p => p.status !== 'completed')),
                completed: this.calculateTotalRevenue(projects.filter(p => p.status === 'completed')),
                potential: this.calculatePotentialRevenue(research)
            },
            nextActions: this.getNextActions(),
            timeline: this.getUpcomingMilestones()
        };

        return summary;
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

    getNextActions() {
        const actions = [];
        
        // High priority research tasks
        const urgentResearch = this.getResearchTasks()
            .filter(task => task.priority === 'super_high' && task.status === 'pending')
            .slice(0, 3);
        
        urgentResearch.forEach(task => {
            actions.push({
                type: 'research',
                title: `Start: ${task.title}`,
                priority: 'high',
                dueDate: 'Immediate'
            });
        });

        // Approved projects waiting to start
        const pendingProjects = this.getApprovedProjects()
            .filter(project => project.status === 'approved')
            .slice(0, 2);
        
        pendingProjects.forEach(project => {
            actions.push({
                type: 'project',
                title: `Begin: ${project.title}`,
                priority: 'medium',
                dueDate: 'This week'
            });
        });

        return actions;
    }

    getUpcomingMilestones() {
        // This would normally integrate with project management tools
        return [
            { project: 'AI Job Matching', milestone: 'Research completion', date: '1 week' },
            { project: 'Video Interview Assistant', milestone: 'Technical feasibility', date: '2 weeks' },
            { project: 'ATS Scanner', milestone: 'MVP development', date: '3 weeks' }
        ];
    }

    async saveProjectDatabase() {
        const projects = Array.from(this.approvedProjects.values());
        await fs.writeFile(this.projectDatabase, JSON.stringify(projects, null, 2));
    }

    async saveResearchDatabase() {
        const research = Array.from(this.researchTasks.values());
        await fs.writeFile(this.researchDatabase, JSON.stringify(research, null, 2));
    }
}

module.exports = ProjectApprovalSystem;