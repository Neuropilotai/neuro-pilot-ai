require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const EventEmitter = require('events');

class EnhancedSuperAgent extends EventEmitter {
    constructor() {
        super();
        this.name = "NEURO-MASTER-ORCHESTRATOR";
        this.version = "2.0.0";
        this.agents = new Map();
        this.tasks = new Map();
        this.taskQueue = [];
        this.activeAssignments = new Map();
        this.agentCapabilities = new Map();
        this.learningData = [];
        this.performanceMetrics = new Map();
        
        // Agent Registry with Capabilities
        this.agentRegistry = {
            'email_agent': {
                name: 'Email Processing Agent',
                capabilities: ['email_processing', 'order_intake', 'pdf_generation', 'email_delivery'],
                maxConcurrent: 5,
                avgTaskTime: 30000, // 30 seconds
                status: 'available'
            },
            'customer_service': {
                name: 'Customer Service Agent',
                capabilities: ['customer_support', 'inquiry_response', 'complaint_handling', 'email_classification'],
                maxConcurrent: 10,
                avgTaskTime: 15000, // 15 seconds
                status: 'available'
            },
            'order_processor': {
                name: 'Order Processor',
                capabilities: ['order_processing', 'payment_verification', 'fulfillment', 'status_tracking'],
                maxConcurrent: 20,
                avgTaskTime: 45000, // 45 seconds
                status: 'available'
            },
            'analytics_agent': {
                name: 'Analytics Agent',
                capabilities: ['data_analysis', 'report_generation', 'metrics_tracking', 'forecasting'],
                maxConcurrent: 3,
                avgTaskTime: 60000, // 1 minute
                status: 'available'
            },
            'ai_job_matcher': {
                name: 'AI Job Matching Agent',
                capabilities: ['resume_matching', 'job_analysis', 'skill_matching', 'recommendation'],
                maxConcurrent: 15,
                avgTaskTime: 20000, // 20 seconds
                status: 'available'
            }
        };
        
        // Task Types and Required Capabilities
        this.taskTypes = {
            'process_order': {
                requiredCapabilities: ['email_processing', 'order_processing', 'pdf_generation'],
                priority: 'high',
                timeout: 120000
            },
            'customer_inquiry': {
                requiredCapabilities: ['customer_support', 'email_classification'],
                priority: 'medium',
                timeout: 60000
            },
            'generate_report': {
                requiredCapabilities: ['data_analysis', 'report_generation'],
                priority: 'low',
                timeout: 300000
            },
            'match_resume': {
                requiredCapabilities: ['resume_matching', 'job_analysis'],
                priority: 'high',
                timeout: 90000
            }
        };
        
        this.init();
    }
    
    async init() {
        console.log(`🧠 ${this.name} v${this.version} initializing...`);
        
        // Load previous learning data
        await this.loadLearningData();
        
        // Initialize agent connections
        await this.initializeAgents();
        
        // Start task dispatcher
        this.startTaskDispatcher();
        
        // Start performance monitor
        this.startPerformanceMonitor();
        
        // Start learning system
        this.startLearningSystem();
        
        console.log('✅ Master Orchestrator ready!');
        console.log('🎯 Capabilities: Task Assignment, Load Balancing, Performance Optimization, Self-Learning');
    }
    
    // Intelligent Task Assignment
    async assignTask(taskData) {
        const taskId = `TASK_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const task = {
            id: taskId,
            type: taskData.type,
            data: taskData.data,
            priority: taskData.priority || 'medium',
            createdAt: new Date(),
            status: 'pending',
            attempts: 0,
            assignedAgent: null
        };
        
        this.tasks.set(taskId, task);
        this.taskQueue.push(task);
        
        console.log(`📋 New task created: ${taskId} (${task.type})`);
        
        // Trigger immediate assignment attempt
        await this.processTaskQueue();
        
        return taskId;
    }
    
    // Find Best Agent for Task
    findBestAgent(task) {
        const taskType = this.taskTypes[task.type];
        if (!taskType) {
            console.error(`❌ Unknown task type: ${task.type}`);
            return null;
        }
        
        const requiredCapabilities = taskType.requiredCapabilities;
        const eligibleAgents = [];
        
        // Find agents with required capabilities
        for (const [agentId, agentInfo] of Object.entries(this.agentRegistry)) {
            const hasAllCapabilities = requiredCapabilities.every(cap => 
                agentInfo.capabilities.includes(cap)
            );
            
            if (hasAllCapabilities && agentInfo.status === 'available') {
                const currentLoad = this.getAgentLoad(agentId);
                const loadPercentage = (currentLoad / agentInfo.maxConcurrent) * 100;
                
                eligibleAgents.push({
                    agentId,
                    agentInfo,
                    currentLoad,
                    loadPercentage,
                    performance: this.getAgentPerformance(agentId)
                });
            }
        }
        
        if (eligibleAgents.length === 0) {
            console.log('⚠️ No available agents for task');
            return null;
        }
        
        // Sort by best fit (lowest load and best performance)
        eligibleAgents.sort((a, b) => {
            // Prioritize by load percentage
            if (a.loadPercentage !== b.loadPercentage) {
                return a.loadPercentage - b.loadPercentage;
            }
            // Then by performance score
            return b.performance - a.performance;
        });
        
        return eligibleAgents[0];
    }
    
    // Process Task Queue
    async processTaskQueue() {
        if (this.taskQueue.length === 0) return;
        
        // Sort queue by priority
        this.taskQueue.sort((a, b) => {
            const priorityOrder = { high: 3, medium: 2, low: 1 };
            return priorityOrder[b.priority] - priorityOrder[a.priority];
        });
        
        const pendingTasks = [...this.taskQueue];
        this.taskQueue = [];
        
        for (const task of pendingTasks) {
            const bestAgent = this.findBestAgent(task);
            
            if (bestAgent) {
                await this.assignToAgent(task, bestAgent);
            } else {
                // Re-queue the task
                this.taskQueue.push(task);
            }
        }
    }
    
    // Assign Task to Specific Agent
    async assignToAgent(task, agent) {
        task.assignedAgent = agent.agentId;
        task.status = 'assigned';
        task.assignedAt = new Date();
        
        // Track assignment
        if (!this.activeAssignments.has(agent.agentId)) {
            this.activeAssignments.set(agent.agentId, []);
        }
        this.activeAssignments.get(agent.agentId).push(task.id);
        
        console.log(`✅ Task ${task.id} assigned to ${agent.agentInfo.name}`);
        console.log(`   📊 Agent load: ${agent.currentLoad}/${agent.agentInfo.maxConcurrent} (${agent.loadPercentage.toFixed(1)}%)`);
        
        // Simulate task execution (in real implementation, this would communicate with actual agents)
        this.executeTask(task, agent);
    }
    
    // Execute Task (Simulate agent communication)
    async executeTask(task, agent) {
        const taskType = this.taskTypes[task.type];
        const startTime = Date.now();
        
        try {
            // Update task status
            task.status = 'executing';
            task.startedAt = new Date();
            
            // Simulate task execution with timeout
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Task timeout'));
                }, taskType.timeout);
                
                // Simulate varying execution time based on agent performance
                const executionTime = agent.agentInfo.avgTaskTime * (0.8 + Math.random() * 0.4);
                
                setTimeout(() => {
                    clearTimeout(timeout);
                    resolve();
                }, executionTime);
            });
            
            // Task completed successfully
            task.status = 'completed';
            task.completedAt = new Date();
            task.executionTime = Date.now() - startTime;
            
            console.log(`✨ Task ${task.id} completed by ${agent.agentInfo.name} in ${task.executionTime}ms`);
            
            // Update performance metrics
            this.updatePerformanceMetrics(agent.agentId, task);
            
            // Remove from active assignments
            const assignments = this.activeAssignments.get(agent.agentId) || [];
            this.activeAssignments.set(
                agent.agentId,
                assignments.filter(id => id !== task.id)
            );
            
            // Learn from this execution
            this.recordLearning(task, agent, true);
            
        } catch (error) {
            // Task failed
            task.status = 'failed';
            task.error = error.message;
            task.failedAt = new Date();
            
            console.error(`❌ Task ${task.id} failed: ${error.message}`);
            
            // Remove from active assignments
            const assignments = this.activeAssignments.get(agent.agentId) || [];
            this.activeAssignments.set(
                agent.agentId,
                assignments.filter(id => id !== task.id)
            );
            
            // Learn from failure
            this.recordLearning(task, agent, false);
            
            // Retry logic
            if (task.attempts < 3) {
                task.attempts++;
                task.status = 'pending';
                this.taskQueue.push(task);
                console.log(`🔄 Retrying task ${task.id} (attempt ${task.attempts})`);
            }
        }
    }
    
    // Get Agent Load
    getAgentLoad(agentId) {
        const assignments = this.activeAssignments.get(agentId) || [];
        return assignments.length;
    }
    
    // Get Agent Performance Score
    getAgentPerformance(agentId) {
        const metrics = this.performanceMetrics.get(agentId);
        if (!metrics) return 100; // Default score for new agents
        
        // Calculate performance score based on success rate and average execution time
        const successRate = (metrics.successCount / metrics.totalTasks) * 100;
        const speedScore = Math.max(0, 100 - (metrics.avgExecutionTime / 1000)); // Penalty for slow execution
        
        return (successRate * 0.7 + speedScore * 0.3); // 70% weight on success, 30% on speed
    }
    
    // Update Performance Metrics
    updatePerformanceMetrics(agentId, task) {
        if (!this.performanceMetrics.has(agentId)) {
            this.performanceMetrics.set(agentId, {
                totalTasks: 0,
                successCount: 0,
                failureCount: 0,
                totalExecutionTime: 0,
                avgExecutionTime: 0
            });
        }
        
        const metrics = this.performanceMetrics.get(agentId);
        metrics.totalTasks++;
        
        if (task.status === 'completed') {
            metrics.successCount++;
            metrics.totalExecutionTime += task.executionTime;
            metrics.avgExecutionTime = metrics.totalExecutionTime / metrics.successCount;
        } else {
            metrics.failureCount++;
        }
    }
    
    // Learning System
    recordLearning(task, agent, success) {
        const learningEntry = {
            timestamp: new Date(),
            taskType: task.type,
            agentId: agent.agentId,
            success,
            executionTime: task.executionTime || null,
            agentLoad: agent.currentLoad,
            priority: task.priority
        };
        
        this.learningData.push(learningEntry);
        
        // Persist learning data
        this.saveLearningData();
    }
    
    // Start Task Dispatcher
    startTaskDispatcher() {
        setInterval(() => {
            this.processTaskQueue();
        }, 5000); // Check every 5 seconds
    }
    
    // Start Performance Monitor
    startPerformanceMonitor() {
        setInterval(() => {
            console.log('\n📊 === PERFORMANCE REPORT ===');
            for (const [agentId, metrics] of this.performanceMetrics) {
                const agent = this.agentRegistry[agentId];
                const performance = this.getAgentPerformance(agentId);
                const load = this.getAgentLoad(agentId);
                
                console.log(`\n🤖 ${agent.name}:`);
                console.log(`   📈 Performance Score: ${performance.toFixed(1)}/100`);
                console.log(`   ✅ Success Rate: ${((metrics.successCount / metrics.totalTasks) * 100).toFixed(1)}%`);
                console.log(`   ⚡ Avg Execution Time: ${(metrics.avgExecutionTime / 1000).toFixed(1)}s`);
                console.log(`   📦 Current Load: ${load}/${agent.maxConcurrent}`);
            }
            console.log('\n========================\n');
        }, 60000); // Every minute
    }
    
    // Start Learning System
    startLearningSystem() {
        setInterval(() => {
            this.optimizeAgentCapabilities();
        }, 300000); // Every 5 minutes
    }
    
    // Optimize Agent Capabilities Based on Learning
    optimizeAgentCapabilities() {
        console.log('🧠 Optimizing agent capabilities based on learning data...');
        
        // Analyze recent performance
        const recentData = this.learningData.filter(entry => {
            const hourAgo = new Date(Date.now() - 3600000);
            return entry.timestamp > hourAgo;
        });
        
        // Identify patterns and adjust agent parameters
        for (const [agentId, agent] of Object.entries(this.agentRegistry)) {
            const agentData = recentData.filter(d => d.agentId === agentId);
            
            if (agentData.length > 10) {
                // Calculate optimal concurrent tasks
                const successfulHighLoad = agentData.filter(d => 
                    d.success && d.agentLoad > agent.maxConcurrent * 0.8
                ).length;
                
                const failedHighLoad = agentData.filter(d => 
                    !d.success && d.agentLoad > agent.maxConcurrent * 0.8
                ).length;
                
                // Adjust max concurrent if needed
                if (successfulHighLoad > failedHighLoad * 2) {
                    agent.maxConcurrent = Math.min(agent.maxConcurrent + 1, 30);
                    console.log(`📈 Increased ${agent.name} capacity to ${agent.maxConcurrent}`);
                } else if (failedHighLoad > successfulHighLoad) {
                    agent.maxConcurrent = Math.max(agent.maxConcurrent - 1, 3);
                    console.log(`📉 Decreased ${agent.name} capacity to ${agent.maxConcurrent}`);
                }
            }
        }
    }
    
    // Initialize Agent Connections
    async initializeAgents() {
        // In real implementation, this would establish actual connections to agents
        console.log('🔗 Initializing agent connections...');
        for (const agentId of Object.keys(this.agentRegistry)) {
            console.log(`   ✅ Connected to ${this.agentRegistry[agentId].name}`);
        }
    }
    
    // Load Learning Data
    async loadLearningData() {
        try {
            const data = await fs.readFile('./super_agent_learning.json', 'utf8');
            this.learningData = JSON.parse(data);
            console.log(`📚 Loaded ${this.learningData.length} learning entries`);
        } catch (error) {
            console.log('📚 No previous learning data found, starting fresh');
            this.learningData = [];
        }
    }
    
    // Save Learning Data
    async saveLearningData() {
        try {
            await fs.writeFile(
                './super_agent_learning.json',
                JSON.stringify(this.learningData, null, 2)
            );
        } catch (error) {
            console.error('Error saving learning data:', error);
        }
    }
    
    // Public API for Management Dashboard
    getStatus() {
        const status = {
            orchestrator: {
                name: this.name,
                version: this.version,
                uptime: process.uptime(),
                taskQueue: this.taskQueue.length,
                activeTasks: Array.from(this.tasks.values()).filter(t => t.status === 'executing').length
            },
            agents: []
        };
        
        for (const [agentId, agent] of Object.entries(this.agentRegistry)) {
            const load = this.getAgentLoad(agentId);
            const performance = this.getAgentPerformance(agentId);
            
            status.agents.push({
                id: agentId,
                name: agent.name,
                status: agent.status,
                capabilities: agent.capabilities,
                currentLoad: load,
                maxConcurrent: agent.maxConcurrent,
                loadPercentage: (load / agent.maxConcurrent) * 100,
                performanceScore: performance
            });
        }
        
        return status;
    }
}

// Start the Enhanced Super Agent
if (require.main === module) {
    const orchestrator = new EnhancedSuperAgent();
    
    // API Server for Management Dashboard
    const express = require('express');
    const app = express();
    app.use(express.json());
    
    // Status endpoint
    app.get('/api/orchestrator/status', (req, res) => {
        res.json(orchestrator.getStatus());
    });
    
    // Assign task endpoint
    app.post('/api/orchestrator/assign', async (req, res) => {
        try {
            const taskId = await orchestrator.assignTask(req.body);
            res.json({ success: true, taskId });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });
    
    // Get task status
    app.get('/api/orchestrator/task/:taskId', (req, res) => {
        const task = orchestrator.tasks.get(req.params.taskId);
        if (task) {
            res.json(task);
        } else {
            res.status(404).json({ error: 'Task not found' });
        }
    });
    
    app.listen(9000, () => {
        console.log('🌐 Orchestrator API running on port 9000');
    });
    
    // Example: Simulate incoming tasks
    setInterval(() => {
        const taskTypes = ['process_order', 'customer_inquiry', 'generate_report', 'match_resume'];
        const randomType = taskTypes[Math.floor(Math.random() * taskTypes.length)];
        
        orchestrator.assignTask({
            type: randomType,
            data: { test: true, timestamp: new Date() },
            priority: ['high', 'medium', 'low'][Math.floor(Math.random() * 3)]
        });
    }, 30000); // Generate a test task every 30 seconds
}

module.exports = EnhancedSuperAgent;