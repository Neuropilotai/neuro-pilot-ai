const fs = require('fs').promises;
const path = require('path');

/**
 * GIG SUBMISSION CONNECTOR
 * Connects all agents to the deployment control system
 */
class GigSubmissionConnector {
    constructor() {
        this.webhookUrl = 'http://localhost:3009/webhook/internal/gig-created';
        this.apiKey = process.env.WEBHOOK_API_KEY || 'neuro-pilot-webhook-key';
        this.gigQueue = [];
        this.isProcessing = false;
    }

    /**
     * Submit a new gig for approval
     * Called by agents when they generate new service offerings
     */
    async submitGigForApproval(gigData) {
        try {
            // Ensure required fields
            const gig = {
                id: gigData.id || `gig_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                title: gigData.title,
                description: gigData.description,
                price: gigData.price,
                agent: gigData.agent,
                category: gigData.category || 'general',
                deliveryTime: gigData.deliveryTime || '24 hours',
                revenuePotential: gigData.revenuePotential || this.calculateRevenuePotential(gigData),
                features: gigData.features || [],
                requirements: gigData.requirements || [],
                created_at: new Date().toISOString(),
                status: 'pending_approval'
            };

            // Add to queue
            this.gigQueue.push(gig);
            
            // Process queue
            await this.processGigQueue();

            return {
                success: true,
                gigId: gig.id,
                message: 'Gig submitted for approval'
            };

        } catch (error) {
            console.error('Error submitting gig:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async processGigQueue() {
        if (this.isProcessing || this.gigQueue.length === 0) return;

        this.isProcessing = true;

        while (this.gigQueue.length > 0) {
            const gig = this.gigQueue.shift();
            
            try {
                // Submit to webhook
                const response = await fetch(this.webhookUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-API-Key': this.apiKey
                    },
                    body: JSON.stringify(gig)
                });

                if (response.ok) {
                    const result = await response.json();
                    console.log(`✅ Gig "${gig.title}" submitted for approval (ID: ${result.gig_id})`);
                    
                    // Log submission
                    await this.logGigSubmission(gig, result);
                } else {
                    console.error(`❌ Failed to submit gig "${gig.title}"`);
                    // Re-queue for retry
                    this.gigQueue.push(gig);
                    break;
                }

            } catch (error) {
                console.error('Error processing gig submission:', error);
                // Re-queue for retry
                this.gigQueue.push(gig);
                break;
            }

            // Rate limiting
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        this.isProcessing = false;
    }

    calculateRevenuePotential(gigData) {
        // Simple revenue calculation
        const basePrice = parseFloat(gigData.price) || 0;
        const estimatedOrdersPerMonth = 10; // Conservative estimate
        return basePrice * estimatedOrdersPerMonth * 12; // Annual revenue
    }

    async logGigSubmission(gig, result) {
        try {
            const logDir = path.join(__dirname, 'logs');
            await fs.mkdir(logDir, { recursive: true });

            const logEntry = {
                timestamp: new Date().toISOString(),
                gig: gig,
                result: result
            };

            const logFile = path.join(logDir, 'gig_submissions.log');
            await fs.appendFile(logFile, JSON.stringify(logEntry) + '\n');

        } catch (error) {
            console.error('Error logging gig submission:', error);
        }
    }

    /**
     * Integration methods for different agents
     */

    // Product Generator Agent Integration
    async submitProductGig(productData) {
        return this.submitGigForApproval({
            title: productData.name,
            description: productData.description,
            price: productData.price,
            agent: 'Product Generator Agent',
            category: productData.category,
            deliveryTime: productData.deliveryTime || '1-2 days',
            features: productData.features,
            requirements: ['Customer requirements', 'Target specifications']
        });
    }

    // Opportunity Scout Agent Integration
    async submitOpportunityGig(opportunityData) {
        return this.submitGigForApproval({
            title: opportunityData.title,
            description: opportunityData.marketAnalysis,
            price: opportunityData.suggestedPrice,
            agent: 'Opportunity Scout Agent',
            category: opportunityData.category,
            deliveryTime: 'Varies',
            features: opportunityData.keyBenefits,
            requirements: opportunityData.requirements,
            revenuePotential: opportunityData.projectedRevenue
        });
    }

    // Sales & Marketing Agent Integration
    async submitMarketingGig(campaignData) {
        return this.submitGigForApproval({
            title: campaignData.campaignName,
            description: campaignData.objective,
            price: campaignData.budget,
            agent: 'Sales & Marketing Agent',
            category: 'marketing',
            deliveryTime: campaignData.duration,
            features: campaignData.deliverables,
            requirements: ['Business information', 'Target audience', 'Brand guidelines']
        });
    }

    // Automated Gig Generation Based on Market Demand
    async generateGigsFromMarketAnalysis(marketData) {
        const gigs = [];

        // AI Resume Services
        if (marketData.resumeDemand > 0.7) {
            gigs.push({
                title: 'AI-Powered Executive Resume Writing',
                description: 'Transform your career with our AI-enhanced executive resume service. ATS-optimized, keyword-rich, and tailored for C-suite positions.',
                price: '299',
                agent: 'Product Generator Agent',
                category: 'resume',
                deliveryTime: '24 hours',
                features: [
                    'ATS optimization',
                    'Executive summary',
                    'Achievement quantification',
                    'Industry-specific keywords',
                    '2 rounds of revisions'
                ]
            });
        }

        // Trading Signal Services
        if (marketData.tradingInterest > 0.6) {
            gigs.push({
                title: 'AI Trading Signal Bot - Crypto & Forex',
                description: 'Get real-time trading signals powered by machine learning. 85% accuracy rate with risk management.',
                price: '197',
                agent: 'Opportunity Scout Agent',
                category: 'trading',
                deliveryTime: 'Instant setup',
                features: [
                    'Real-time signals',
                    'Risk management',
                    'Multi-asset support',
                    'Mobile alerts',
                    'Performance tracking'
                ]
            });
        }

        // Submit all generated gigs
        for (const gig of gigs) {
            await this.submitGigForApproval(gig);
            await new Promise(resolve => setTimeout(resolve, 2000)); // Rate limit
        }

        return gigs;
    }

    // Get connector instance (singleton)
    static getInstance() {
        if (!GigSubmissionConnector.instance) {
            GigSubmissionConnector.instance = new GigSubmissionConnector();
        }
        return GigSubmissionConnector.instance;
    }
}

// Example usage for agents
const gigConnector = GigSubmissionConnector.getInstance();

// Export for use in other agents
module.exports = { GigSubmissionConnector, gigConnector };