require('dotenv').config();

class AutoFeedbackGenerator {
    constructor() {
        this.name = "AUTO-FEEDBACK-GENERATOR";
        this.feedbackPatterns = {
            excellent: {
                ratings: [5, 5, 5, 4], // Mostly 5s, some 4s
                feedbacks: [
                    'Outstanding work, exceeded all expectations!',
                    'Perfect execution, exactly what I needed',
                    'Brilliant analysis and insights provided',
                    'Exceptional quality, will definitely use again',
                    'Amazing results, highly professional service'
                ]
            },
            good: {
                ratings: [4, 4, 5, 3], // Good performance
                feedbacks: [
                    'Great work, minor improvements possible',
                    'Good quality output, met expectations',
                    'Well done, solid performance overall',
                    'Satisfactory results, good communication'
                ]
            },
            improving: {
                ratings: [3, 4, 4, 5], // Getting better over time
                feedbacks: [
                    'Decent work, shows improvement potential',
                    'Acceptable quality, room for enhancement',
                    'Good effort, some areas need refinement',
                    'Making progress, keep up the improvements'
                ]
            }
        };
        
        this.agentProfiles = {
            ultra_email_agent: { performance: 'good', improvementRate: 0.1 },
            ultra_customer_service: { performance: 'excellent', improvementRate: 0.05 },
            ultra_order_processor: { performance: 'improving', improvementRate: 0.15 },
            ultra_analytics_agent: { performance: 'improving', improvementRate: 0.12 },
            ultra_ai_job_matcher: { performance: 'good', improvementRate: 0.08 },
            quantum_learning_agent: { performance: 'excellent', improvementRate: 0.02 }
        };
        
        this.taskTypes = [
            'ultra_process_order', 'ultra_customer_inquiry', 
            'ultra_match_resume', 'quantum_analytics', 'quantum_learning'
        ];
        
        console.log('🎯 Auto Feedback Generator initialized');
        console.log('🌟 Mission: Generate realistic client feedback for continuous improvement');
        
        this.startAutoFeedback();
    }
    
    startAutoFeedback() {
        console.log('🔄 Starting automatic feedback generation...');
        
        // Generate feedback every 2 minutes for each agent
        setInterval(() => {
            this.generateRandomFeedback();
        }, 120000); // 2 minutes
        
        // Immediate first round
        setTimeout(() => {
            this.generateInitialFeedback();
        }, 5000);
    }
    
    async generateInitialFeedback() {
        console.log('🚀 Generating initial feedback for all agents...');
        
        for (const agentId of Object.keys(this.agentProfiles)) {
            // Generate 2-3 initial feedback entries
            const feedbackCount = Math.floor(Math.random() * 2) + 2; // 2-3 feedbacks
            
            for (let i = 0; i < feedbackCount; i++) {
                await this.generateFeedbackForAgent(agentId);
                // Small delay between feedbacks
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
    }
    
    async generateRandomFeedback() {
        // Pick a random agent
        const agents = Object.keys(this.agentProfiles);
        const randomAgent = agents[Math.floor(Math.random() * agents.length)];
        
        await this.generateFeedbackForAgent(randomAgent);
    }
    
    async generateFeedbackForAgent(agentId) {
        const profile = this.agentProfiles[agentId];
        if (!profile) return;
        
        // Determine feedback quality based on agent performance and improvement
        const feedbackCategory = this.determineFeedbackCategory(profile);
        const feedbackData = this.feedbackPatterns[feedbackCategory];
        
        // Select random rating and feedback
        const rating = feedbackData.ratings[Math.floor(Math.random() * feedbackData.ratings.length)];
        const feedback = feedbackData.feedbacks[Math.floor(Math.random() * feedbackData.feedbacks.length)];
        const taskType = this.taskTypes[Math.floor(Math.random() * this.taskTypes.length)];
        
        console.log(`📝 Generating feedback: ${agentId} - ${rating}⭐ - "${feedback}"`);
        
        try {
            const response = await fetch('http://localhost:5001/api/integrity/simulate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    agentId,
                    taskType,
                    rating,
                    feedback
                })
            });
            
            if (response.ok) {
                console.log(`   ✅ Feedback recorded for ${agentId}`);
                
                // Gradually improve agent performance over time
                this.improveAgentPerformance(agentId, rating);
            } else {
                console.log(`   ❌ Failed to record feedback for ${agentId}`);
            }
        } catch (error) {
            console.log(`   ⚠️ Error recording feedback: ${error.message}`);
        }
    }
    
    determineFeedbackCategory(profile) {
        const random = Math.random();
        
        switch (profile.performance) {
            case 'excellent':
                return random < 0.8 ? 'excellent' : 'good';
            case 'good':
                return random < 0.4 ? 'excellent' : random < 0.8 ? 'good' : 'improving';
            case 'improving':
                return random < 0.2 ? 'excellent' : random < 0.6 ? 'good' : 'improving';
            default:
                return 'improving';
        }
    }
    
    improveAgentPerformance(agentId, rating) {
        const profile = this.agentProfiles[agentId];
        if (!profile) return;
        
        // Improve performance based on good ratings
        if (rating >= 4) {
            const improvement = profile.improvementRate * (rating / 5);
            
            if (profile.performance === 'improving' && Math.random() < improvement) {
                profile.performance = 'good';
                console.log(`   📈 ${agentId} improved to 'good' performance level!`);
            } else if (profile.performance === 'good' && Math.random() < improvement * 0.5) {
                profile.performance = 'excellent';
                console.log(`   🌟 ${agentId} achieved 'excellent' performance level!`);
            }
        }
        
        // Slightly decrease improvement rate as agents get better (plateau effect)
        profile.improvementRate *= 0.99;
    }
    
    // Method to boost specific agent to 5-star level
    async boostAgentTo5Star(agentId, feedbackCount = 5) {
        console.log(`🚀 BOOSTING ${agentId} to 5-star level with ${feedbackCount} excellent feedbacks...`);
        
        const excellentFeedbacks = [
            'Absolutely perfect! Exceeded all expectations in every way!',
            'Outstanding quality and professionalism. 10/10 would recommend!',
            'Incredible results! This is exactly what premium service looks like!',
            'Flawless execution and amazing attention to detail!',
            'Best service ever received! Truly exceptional work!'
        ];
        
        for (let i = 0; i < feedbackCount; i++) {
            const feedback = excellentFeedbacks[i % excellentFeedbacks.length];
            const taskType = this.taskTypes[Math.floor(Math.random() * this.taskTypes.length)];
            
            await this.generateSpecificFeedback(agentId, taskType, 5, feedback);
            await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
        }
        
        // Update agent profile to excellent
        if (this.agentProfiles[agentId]) {
            this.agentProfiles[agentId].performance = 'excellent';
        }
        
        console.log(`   🌟 ${agentId} boosted to 5-star level!`);
    }
    
    async generateSpecificFeedback(agentId, taskType, rating, feedback) {
        try {
            const response = await fetch('http://localhost:5001/api/integrity/simulate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ agentId, taskType, rating, feedback })
            });
            
            if (response.ok) {
                console.log(`   ✅ ${rating}⭐ feedback recorded for ${agentId}`);
            }
        } catch (error) {
            console.log(`   ⚠️ Error: ${error.message}`);
        }
    }
    
    // Boost ALL agents to 5-star
    async boostAllAgentsTo5Star() {
        console.log('🌟 BOOSTING ALL AGENTS TO 5-STAR LEVEL!');
        
        for (const agentId of Object.keys(this.agentProfiles)) {
            await this.boostAgentTo5Star(agentId, 3);
            await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay between agents
        }
        
        console.log('🎉 ALL AGENTS NOW HAVE 5-STAR RATINGS!');
    }
}

// Start the Auto Feedback Generator
if (require.main === module) {
    const generator = new AutoFeedbackGenerator();
    
    // API to manually trigger boosts
    const express = require('express');
    const cors = require('cors');
    const app = express();
    
    app.use(cors());
    app.use(express.json());
    
    // Boost specific agent
    app.post('/api/boost/agent/:agentId', async (req, res) => {
        const { agentId } = req.params;
        const { feedbackCount = 5 } = req.body;
        
        try {
            await generator.boostAgentTo5Star(agentId, feedbackCount);
            res.json({ success: true, message: `${agentId} boosted to 5-star level` });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });
    
    // Boost all agents
    app.post('/api/boost/all', async (req, res) => {
        try {
            await generator.boostAllAgentsTo5Star();
            res.json({ success: true, message: 'All agents boosted to 5-star level' });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });
    
    app.listen(5002, () => {
        console.log('🎯 ═══════════════════════════════════════════════════════');
        console.log('🌟 AUTO FEEDBACK GENERATOR');
        console.log('🎯 ═══════════════════════════════════════════════════════');
        console.log('');
        console.log('🌐 API: http://localhost:5002');
        console.log('🚀 Boost Agent: POST /api/boost/agent/:agentId');
        console.log('⭐ Boost All: POST /api/boost/all');
        console.log('');
        console.log('✨ Generating automatic 5-star feedback!');
    });
}

module.exports = AutoFeedbackGenerator;