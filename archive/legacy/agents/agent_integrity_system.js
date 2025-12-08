require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const express = require('express');
const cors = require('cors');

class AgentIntegritySystem {
    constructor() {
        this.name = "AGENT-INTEGRITY-TRUTH-SYSTEM";
        this.version = "1.0.0";
        
        // Performance tracking data structures
        this.performanceLog = new Map(); // agentId -> performance history
        this.feedbackQueue = new Map(); // taskId -> pending feedback
        this.integrityScores = new Map(); // agentId -> truth scores
        this.learningTriggers = new Map(); // agentId -> learning sessions
        
        // Integrity rules and thresholds
        this.config = {
            minRatingForGood: 4.0,
            learningTriggerRating: 3.0,
            truthScoreThreshold: 0.2, // Max difference between self-rating and actual
            requiredFeedbackSamples: 5,
            integrityCheckInterval: 300000, // 5 minutes
        };
        
        // Load existing data
        this.loadPerformanceData();
        
        // Start integrity monitoring
        this.startIntegrityMonitoring();
        
        console.log('🔍 Agent Integrity System initialized');
        console.log('🎯 Mission: No BS Performance - Earn Every Star');
    }
    
    async loadPerformanceData() {
        try {
            const data = await fs.readFile('./agent_performance_log.json', 'utf8');
            const parsed = JSON.parse(data);
            
            // Restore Maps from saved data
            if (parsed.performanceLog) {
                this.performanceLog = new Map(Object.entries(parsed.performanceLog));
            }
            if (parsed.integrityScores) {
                this.integrityScores = new Map(Object.entries(parsed.integrityScores));
            }
            
            console.log(`📚 Loaded performance data for ${this.performanceLog.size} agents`);
        } catch (error) {
            console.log('📚 No previous performance data found, starting fresh');
            this.initializeDefaultAgents();
        }
    }
    
    initializeDefaultAgents() {
        const defaultAgents = [
            'ultra_email_agent',
            'ultra_customer_service', 
            'ultra_order_processor',
            'ultra_analytics_agent',
            'ultra_ai_job_matcher',
            'quantum_learning_agent'
        ];
        
        defaultAgents.forEach(agentId => {
            this.performanceLog.set(agentId, {
                tasks: [],
                averageRating: 0,
                totalTasks: 0,
                errorCount: 0,
                improvementCount: 0,
                lastUpdated: new Date()
            });
            
            this.integrityScores.set(agentId, {
                truthScore: 1.0, // Start optimistic
                selfRatingAccuracy: 0,
                overconfidenceCount: 0,
                underconfidenceCount: 0,
                totalEvaluations: 0
            });
        });
    }
    
    // Record task performance with honest evaluation
    async recordTaskPerformance(taskData) {
        const { agentId, taskId, taskType, clientRating, clientFeedback, agentSelfRating, executionTime, errors } = taskData;
        
        console.log(`📊 Recording performance: ${agentId} - Task ${taskId}`);
        
        // Get or create agent performance record
        if (!this.performanceLog.has(agentId)) {
            this.performanceLog.set(agentId, {
                tasks: [],
                averageRating: 0,
                totalTasks: 0,
                errorCount: 0,
                improvementCount: 0,
                lastUpdated: new Date()
            });
        }
        
        const agentPerf = this.performanceLog.get(agentId);
        
        // Create detailed task record
        const taskRecord = {
            taskId,
            taskType,
            timestamp: new Date(),
            clientRating: clientRating || null,
            clientFeedback: clientFeedback || null,
            agentSelfRating: agentSelfRating || null,
            executionTime,
            errors: errors || [],
            actualOutcome: this.determineActualOutcome(clientRating, clientFeedback),
            improvementNeeded: clientRating ? clientRating <= this.config.learningTriggerRating : false
        };
        
        // Add to agent's task history
        agentPerf.tasks.push(taskRecord);
        agentPerf.totalTasks++;
        agentPerf.lastUpdated = new Date();
        
        // Count errors
        if (errors && errors.length > 0) {
            agentPerf.errorCount += errors.length;
        }
        
        // Calculate new average rating (only from tasks with client ratings)
        const ratedTasks = agentPerf.tasks.filter(t => t.clientRating !== null);
        if (ratedTasks.length > 0) {
            agentPerf.averageRating = ratedTasks.reduce((sum, t) => sum + t.clientRating, 0) / ratedTasks.length;
        }
        
        // Update integrity scoring
        if (clientRating && agentSelfRating) {
            this.updateIntegrityScore(agentId, clientRating, agentSelfRating);
        }
        
        // Trigger learning if performance is poor
        if (clientRating && clientRating <= this.config.learningTriggerRating) {
            await this.triggerLearningSession(agentId, taskRecord);
        }
        
        // Save updated data
        await this.savePerformanceData();
        
        return taskRecord;
    }
    
    determineActualOutcome(clientRating, clientFeedback) {
        if (!clientRating && !clientFeedback) return 'no_feedback';
        
        if (clientRating >= 4.5) return 'excellent';
        if (clientRating >= 4.0) return 'good';
        if (clientRating >= 3.0) return 'acceptable';
        if (clientRating >= 2.0) return 'poor';
        return 'failed';
    }
    
    updateIntegrityScore(agentId, clientRating, agentSelfRating) {
        if (!this.integrityScores.has(agentId)) {
            this.integrityScores.set(agentId, {
                truthScore: 1.0,
                selfRatingAccuracy: 0,
                overconfidenceCount: 0,
                underconfidenceCount: 0,
                totalEvaluations: 0
            });
        }
        
        const integrity = this.integrityScores.get(agentId);
        const difference = Math.abs(clientRating - agentSelfRating);
        
        integrity.totalEvaluations++;
        
        // Track overconfidence (agent rates itself higher than client)
        if (agentSelfRating > clientRating + 0.5) {
            integrity.overconfidenceCount++;
        }
        
        // Track underconfidence (agent rates itself much lower than client)
        if (agentSelfRating < clientRating - 0.5) {
            integrity.underconfidenceCount++;
        }
        
        // Calculate accuracy (how close self-rating is to actual)
        integrity.selfRatingAccuracy = 1 - Math.min(difference / 5, 1); // Normalize to 0-1
        
        // Calculate truth score (penalize large differences)
        const accuracyPenalty = difference > this.config.truthScoreThreshold ? difference * 0.1 : 0;
        integrity.truthScore = Math.max(0, 1 - accuracyPenalty);
        
        console.log(`🔍 Integrity update for ${agentId}: Truth Score ${integrity.truthScore.toFixed(2)}, Accuracy ${integrity.selfRatingAccuracy.toFixed(2)}`);
    }
    
    async triggerLearningSession(agentId, taskRecord) {
        console.log(`🧠 LEARNING TRIGGERED: ${agentId} scored ${taskRecord.clientRating} stars`);
        
        if (!this.learningTriggers.has(agentId)) {
            this.learningTriggers.set(agentId, []);
        }
        
        const learningSession = {
            triggeredAt: new Date(),
            triggerTask: taskRecord,
            reason: this.analyzeLearningReason(taskRecord),
            improvementPlan: this.generateImprovementPlan(taskRecord),
            status: 'active'
        };
        
        this.learningTriggers.get(agentId).push(learningSession);
        
        // Increment improvement count
        const agentPerf = this.performanceLog.get(agentId);
        agentPerf.improvementCount++;
        
        // Send learning signal to the actual agent
        await this.sendLearningSignal(agentId, learningSession);
        
        console.log(`   📋 Improvement plan: ${learningSession.improvementPlan}`);
        console.log(`   🎯 Reason: ${learningSession.reason}`);
    }
    
    analyzeLearningReason(taskRecord) {
        const { clientFeedback, clientRating, errors } = taskRecord;
        
        if (errors && errors.length > 0) {
            return `Technical errors detected: ${errors.join(', ')}`;
        }
        
        if (clientFeedback) {
            if (clientFeedback.toLowerCase().includes('generic')) {
                return 'Output too generic - needs personalization';
            }
            if (clientFeedback.toLowerCase().includes('slow')) {
                return 'Performance speed issue';
            }
            if (clientFeedback.toLowerCase().includes('inaccurate')) {
                return 'Accuracy problem detected';
            }
            return `Client feedback: ${clientFeedback}`;
        }
        
        if (clientRating <= 2) {
            return 'Severely low rating - major improvement needed';
        }
        
        return 'Performance below acceptable threshold';
    }
    
    generateImprovementPlan(taskRecord) {
        const { taskType, clientFeedback, errors } = taskRecord;
        
        const plans = {
            'ultra_process_order': 'Review order processing workflow, validate all fields',
            'ultra_customer_inquiry': 'Improve empathy modeling, personalize responses',
            'ultra_match_resume': 'Enhance job-specific matching, reduce generic outputs',
            'quantum_analytics': 'Validate data accuracy, improve insight quality',
            'quantum_learning': 'Review learning algorithms, increase pattern recognition'
        };
        
        let basePlan = plans[taskType] || 'Review task execution process';
        
        // Customize based on feedback
        if (clientFeedback && clientFeedback.includes('generic')) {
            basePlan += ', focus on personalization';
        }
        if (errors && errors.length > 0) {
            basePlan += ', fix technical issues';
        }
        
        return basePlan;
    }
    
    async sendLearningSignal(agentId, learningSession) {
        try {
            // Send signal to the quantum orchestrator to adjust agent
            const response = await fetch('http://localhost:9000/api/orchestrator/command', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    agentId, 
                    command: 'learn',
                    learningData: learningSession
                })
            });
            
            if (response.ok) {
                console.log(`   ✅ Learning signal sent to ${agentId}`);
            }
        } catch (error) {
            console.log(`   ⚠️ Could not send learning signal: ${error.message}`);
        }
    }
    
    // Get honest performance dashboard data
    getPerformanceDashboard() {
        const dashboard = {
            agents: [],
            systemIntegrity: this.calculateSystemIntegrity(),
            lastUpdated: new Date()
        };
        
        for (const [agentId, performance] of this.performanceLog) {
            const integrity = this.integrityScores.get(agentId) || {};
            
            const recentTasks = performance.tasks.slice(-10); // Last 10 tasks
            const recentRatedTasks = recentTasks.filter(t => t.clientRating !== null);
            
            dashboard.agents.push({
                id: agentId,
                name: this.getAgentDisplayName(agentId),
                averageRating: performance.averageRating,
                starDisplay: this.generateStarDisplay(performance.averageRating),
                totalTasks: performance.totalTasks,
                errorCount: performance.errorCount,
                improvementSessions: performance.improvementCount,
                truthScore: integrity.truthScore || 1.0,
                selfRatingAccuracy: integrity.selfRatingAccuracy || 0,
                integrityStatus: this.getIntegrityStatus(integrity),
                recentFeedback: recentRatedTasks.map(t => ({
                    rating: t.clientRating,
                    feedback: t.clientFeedback,
                    outcome: t.actualOutcome,
                    timestamp: t.timestamp
                })),
                improvementNeeded: performance.averageRating < this.config.minRatingForGood,
                lastActivity: performance.lastUpdated
            });
        }
        
        // Sort by performance (worst first to highlight problems)
        dashboard.agents.sort((a, b) => a.averageRating - b.averageRating);
        
        return dashboard;
    }
    
    getAgentDisplayName(agentId) {
        const names = {
            'ultra_email_agent': 'Email Processing Agent',
            'ultra_customer_service': 'Customer Service Agent',
            'ultra_order_processor': 'Order Processor',
            'ultra_analytics_agent': 'Analytics Agent',
            'ultra_ai_job_matcher': 'AI Job Matcher',
            'quantum_learning_agent': 'Quantum Learning Agent'
        };
        return names[agentId] || agentId;
    }
    
    generateStarDisplay(rating) {
        if (rating === 0) return '☆☆☆☆☆ (No ratings yet)';
        
        const fullStars = Math.floor(rating);
        const hasHalfStar = rating % 1 >= 0.5;
        const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);
        
        const display = '⭐'.repeat(fullStars) + 
                       (hasHalfStar ? '⚡' : '') + 
                       '☆'.repeat(emptyStars);
        
        return `${display} (${rating.toFixed(1)})`;
    }
    
    getIntegrityStatus(integrity) {
        if (!integrity.truthScore) return 'Unknown';
        
        if (integrity.truthScore >= 0.9) return 'Honest';
        if (integrity.truthScore >= 0.7) return 'Mostly Honest';
        if (integrity.truthScore >= 0.5) return 'Questionable';
        return 'Low Integrity';
    }
    
    calculateSystemIntegrity() {
        const allIntegrityScores = Array.from(this.integrityScores.values());
        if (allIntegrityScores.length === 0) return 1.0;
        
        const avgTruthScore = allIntegrityScores.reduce((sum, i) => sum + (i.truthScore || 1), 0) / allIntegrityScores.length;
        return avgTruthScore;
    }
    
    // Simulate receiving feedback (for testing)
    async simulateFeedback(agentId, taskType, clientRating, clientFeedback) {
        const taskId = `SIM_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const agentSelfRating = Math.min(5, clientRating + (Math.random() - 0.3)); // Slight overconfidence
        
        return await this.recordTaskPerformance({
            agentId,
            taskId,
            taskType,
            clientRating,
            clientFeedback,
            agentSelfRating,
            executionTime: Math.random() * 30000,
            errors: clientRating <= 2 ? ['execution_error'] : []
        });
    }
    
    startIntegrityMonitoring() {
        console.log('👁️ Starting integrity monitoring...');
        
        // Perform integrity checks every 5 minutes
        setInterval(() => {
            this.performIntegrityCheck();
        }, this.config.integrityCheckInterval);
        
        // Generate test feedback for demonstration
        setInterval(() => {
            this.generateTestFeedback();
        }, 45000); // Every 45 seconds
    }
    
    performIntegrityCheck() {
        console.log('🔍 Performing system integrity check...');
        
        for (const [agentId, integrity] of this.integrityScores) {
            if (integrity.truthScore < 0.5) {
                console.log(`⚠️ INTEGRITY ALERT: ${agentId} has low truth score: ${integrity.truthScore.toFixed(2)}`);
            }
            
            if (integrity.overconfidenceCount > integrity.totalEvaluations * 0.7) {
                console.log(`🔺 OVERCONFIDENCE ALERT: ${agentId} consistently overrates itself`);
            }
        }
        
        const systemIntegrity = this.calculateSystemIntegrity();
        console.log(`📊 System Integrity Score: ${(systemIntegrity * 100).toFixed(1)}%`);
    }
    
    async generateTestFeedback() {
        const agents = Array.from(this.performanceLog.keys());
        if (agents.length === 0) return;
        
        const agentId = agents[Math.floor(Math.random() * agents.length)];
        const taskTypes = ['ultra_process_order', 'ultra_customer_inquiry', 'ultra_match_resume', 'quantum_analytics'];
        const taskType = taskTypes[Math.floor(Math.random() * taskTypes.length)];
        
        // Generate realistic feedback distribution
        const scenarios = [
            { rating: 5, feedback: 'Excellent work, exceeded expectations!' },
            { rating: 4, feedback: 'Good job, minor improvements possible' },
            { rating: 3, feedback: 'Acceptable but needs improvement' },
            { rating: 2, feedback: 'Poor quality, significant issues' },
            { rating: 1, feedback: 'Completely unsatisfactory' }
        ];
        
        // Weight toward better performance (realistic distribution)
        const weights = [0.4, 0.3, 0.2, 0.08, 0.02];
        let random = Math.random();
        let scenarioIndex = 0;
        
        for (let i = 0; i < weights.length; i++) {
            random -= weights[i];
            if (random <= 0) {
                scenarioIndex = i;
                break;
            }
        }
        
        const scenario = scenarios[scenarioIndex];
        await this.simulateFeedback(agentId, taskType, scenario.rating, scenario.feedback);
    }
    
    async savePerformanceData() {
        try {
            const data = {
                performanceLog: Object.fromEntries(this.performanceLog),
                integrityScores: Object.fromEntries(this.integrityScores),
                lastUpdated: new Date()
            };
            
            await fs.writeFile('./agent_performance_log.json', JSON.stringify(data, null, 2));
        } catch (error) {
            console.error('Error saving performance data:', error);
        }
    }
}

// Start the Agent Integrity System
if (require.main === module) {
    const integritySystem = new AgentIntegritySystem();
    
    // API Server for integrity dashboard
    const app = express();
    app.use(cors({
        origin: ['http://localhost:4000', 'http://localhost:3000'],
        credentials: true
    }));
    app.use(express.json());
    
    // Performance dashboard endpoint
    app.get('/api/integrity/dashboard', (req, res) => {
        res.json(integritySystem.getPerformanceDashboard());
    });
    
    // Record feedback endpoint
    app.post('/api/integrity/feedback', async (req, res) => {
        try {
            const result = await integritySystem.recordTaskPerformance(req.body);
            res.json({ success: true, taskRecord: result });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });
    
    // Simulate feedback endpoint (for testing)
    app.post('/api/integrity/simulate', async (req, res) => {
        try {
            const { agentId, taskType, rating, feedback } = req.body;
            const result = await integritySystem.simulateFeedback(agentId, taskType, rating, feedback);
            res.json({ success: true, taskRecord: result });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });
    
    // Integrity status endpoint
    app.get('/api/integrity/status', (req, res) => {
        res.json({
            systemIntegrity: integritySystem.calculateSystemIntegrity(),
            totalAgents: integritySystem.performanceLog.size,
            version: integritySystem.version,
            status: 'operational'
        });
    });
    
    app.listen(5001, () => {
        console.log('🔍 ═══════════════════════════════════════════════════════════════');
        console.log('🎯 AGENT INTEGRITY & TRUTH SYSTEM');
        console.log('🔍 ═══════════════════════════════════════════════════════════════');
        console.log('');
        console.log('🌐 Integrity API: http://localhost:5001');
        console.log('📊 Dashboard: /api/integrity/dashboard');
        console.log('📝 Feedback: POST /api/integrity/feedback');
        console.log('🧪 Simulate: POST /api/integrity/simulate');
        console.log('');
        console.log('✨ No BS Performance Tracking - Earn Every Star!');
    });
}

module.exports = AgentIntegritySystem;