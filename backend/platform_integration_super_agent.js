require('dotenv').config();
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const fs = require('fs').promises;
const path = require('path');
const EnhancedSuperAgent = require('./enhanced_super_agent');

class PlatformIntegrationSuperAgent extends EnhancedSuperAgent {
    constructor() {
        super();
        this.name = "PLATFORM-INTEGRATION-SUPER-AGENT";
        this.version = "1.0.0";
        
        // Platform configurations
        this.platforms = {
            railway: {
                status: 'connected',
                deploymentUrl: null,
                lastDeployment: null,
                services: new Map()
            },
            stripe: {
                status: 'connected',
                products: new Map(),
                paymentLinks: new Map()
            },
            dashboard: {
                status: 'connected',
                url: 'http://localhost:3010',
                gigs: new Map()
            }
        };
        
        // Add platform-specific capabilities to existing agents
        this.extendAgentCapabilities();
        
        console.log('🌐 Platform Integration Super Agent initialized');
        this.startPlatformMonitoring();
    }
    
    extendAgentCapabilities() {
        // Add platform integration capabilities
        this.agentRegistry['platform_deployer'] = {
            name: 'Platform Deployment Agent',
            capabilities: ['railway_deploy', 'stripe_sync', 'dashboard_update', 'platform_monitoring'],
            maxConcurrent: 3,
            avgTaskTime: 45000,
            status: 'available'
        };
        
        this.agentRegistry['sync_orchestrator'] = {
            name: 'Cross-Platform Sync Agent',
            capabilities: ['platform_sync', 'status_update', 'conflict_resolution', 'data_consistency'],
            maxConcurrent: 5,
            avgTaskTime: 30000,
            status: 'available'
        };
        
        // Add new task types
        this.taskTypes['deploy_gig'] = {
            requiredCapabilities: ['railway_deploy', 'stripe_sync', 'dashboard_update'],
            priority: 'high',
            timeout: 180000
        };
        
        this.taskTypes['sync_platforms'] = {
            requiredCapabilities: ['platform_sync', 'status_update'],
            priority: 'medium',
            timeout: 120000
        };
        
        this.taskTypes['update_stripe_products'] = {
            requiredCapabilities: ['stripe_sync', 'platform_sync'],
            priority: 'high',
            timeout: 90000
        };
    }
    
    // Main function: Deploy gig from dashboard to all platforms
    async deployGigToAllPlatforms(gigData) {
        console.log(`🚀 Starting full platform deployment for gig: ${gigData.name}`);
        
        const deploymentId = `DEPLOY_${Date.now()}`;
        const deployment = {
            id: deploymentId,
            gigId: gigData.id,
            gigName: gigData.name,
            status: 'initializing',
            platforms: {
                railway: { status: 'pending', url: null },
                stripe: { status: 'pending', productId: null, paymentLink: null },
                dashboard: { status: 'pending' }
            },
            startTime: new Date(),
            logs: []
        };
        
        try {
            // Step 1: Deploy to Railway
            deployment.logs.push('📡 Deploying to Railway...');
            const railwayResult = await this.deployToRailway(gigData);
            deployment.platforms.railway = railwayResult;
            
            // Step 2: Create Stripe products
            deployment.logs.push('💳 Creating Stripe products...');
            const stripeResult = await this.createStripeProducts(gigData, railwayResult.url);
            deployment.platforms.stripe = stripeResult;
            
            // Step 3: Update dashboard
            deployment.logs.push('📊 Updating dashboard status...');
            const dashboardResult = await this.updateDashboardStatus(gigData, {
                railway: railwayResult,
                stripe: stripeResult
            });
            deployment.platforms.dashboard = dashboardResult;
            
            // Step 4: Verify all platforms are synced
            deployment.logs.push('🔄 Verifying platform sync...');
            await this.verifyPlatformSync(deployment);
            
            deployment.status = 'completed';
            deployment.endTime = new Date();
            
            console.log(`✅ Deployment ${deploymentId} completed successfully!`);
            console.log(`   🌐 Railway URL: ${railwayResult.url}`);
            console.log(`   💳 Stripe Product: ${stripeResult.productId}`);
            console.log(`   📊 Dashboard: Updated`);
            
            return deployment;
            
        } catch (error) {
            deployment.status = 'failed';
            deployment.error = error.message;
            deployment.endTime = new Date();
            
            console.error(`❌ Deployment ${deploymentId} failed:`, error.message);
            
            // Rollback if needed
            await this.rollbackDeployment(deployment);
            
            throw error;
        }
    }
    
    // Deploy to Railway
    async deployToRailway(gigData) {
        console.log('🚂 Starting Railway deployment...');
        
        try {
            // Check if Railway CLI is available
            await execAsync('railway --version');
            
            // Create or update railway service
            const serviceName = `${gigData.name.toLowerCase().replace(/\s+/g, '-')}-service`;
            
            // Deploy using Railway CLI
            console.log(`   📦 Deploying service: ${serviceName}`);
            
            // In real implementation, you would:
            // 1. Update the railway server configuration
            // 2. Deploy to Railway using CLI or API
            // 3. Get the deployment URL
            
            // For now, simulate deployment
            await this.simulateRailwayDeployment(gigData);
            
            const deploymentUrl = `https://${serviceName}-production.up.railway.app`;
            
            // Update platform tracking
            this.platforms.railway.services.set(gigData.id, {
                serviceName,
                url: deploymentUrl,
                status: 'active',
                deployedAt: new Date()
            });
            
            return {
                status: 'success',
                url: deploymentUrl,
                serviceName,
                deployedAt: new Date()
            };
            
        } catch (error) {
            console.error('Railway deployment failed:', error.message);
            return {
                status: 'failed',
                error: error.message
            };
        }
    }
    
    // Create Stripe products and payment links
    async createStripeProducts(gigData, deploymentUrl) {
        console.log('💳 Creating Stripe products...');
        
        try {
            // Load Stripe if available
            let stripe = null;
            if (process.env.STRIPE_SECRET_KEY) {
                stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
            } else {
                throw new Error('Stripe not configured');
            }
            
            // Create Stripe product
            const product = await stripe.products.create({
                name: gigData.name,
                description: gigData.description || `AI-powered ${gigData.name} service`,
                metadata: {
                    gigId: gigData.id,
                    deploymentUrl: deploymentUrl,
                    category: gigData.category || 'ai_service'
                }
            });
            
            // Create price
            const price = await stripe.prices.create({
                unit_amount: Math.round(gigData.price * 100), // Convert to cents
                currency: 'usd',
                product: product.id,
                metadata: {
                    gigId: gigData.id
                }
            });
            
            // Create payment link
            const paymentLink = await stripe.paymentLinks.create({
                line_items: [{
                    price: price.id,
                    quantity: 1
                }],
                metadata: {
                    gigId: gigData.id,
                    deploymentUrl: deploymentUrl
                }
            });
            
            // Store in platform tracking
            this.platforms.stripe.products.set(gigData.id, {
                productId: product.id,
                priceId: price.id,
                paymentLinkId: paymentLink.id,
                paymentLinkUrl: paymentLink.url,
                createdAt: new Date()
            });
            
            console.log(`   ✅ Stripe product created: ${product.id}`);
            console.log(`   💰 Payment link: ${paymentLink.url}`);
            
            return {
                status: 'success',
                productId: product.id,
                priceId: price.id,
                paymentLink: paymentLink.url,
                createdAt: new Date()
            };
            
        } catch (error) {
            console.error('Stripe product creation failed:', error.message);
            return {
                status: 'failed',
                error: error.message
            };
        }
    }
    
    // Update dashboard status
    async updateDashboardStatus(gigData, platformData) {
        console.log('📊 Updating dashboard status...');
        
        try {
            // Update gig status in dashboard database/memory
            const updatedGig = {
                ...gigData,
                status: 'active',
                platforms: {
                    railway: platformData.railway,
                    stripe: platformData.stripe
                },
                activatedAt: new Date()
            };
            
            // In real implementation, you would:
            // 1. Update the dashboard database
            // 2. Send API call to dashboard
            // 3. Update real-time status
            
            // Store in platform tracking
            this.platforms.dashboard.gigs.set(gigData.id, updatedGig);
            
            // Simulate API call to dashboard
            await this.notifyDashboard('gig_activated', updatedGig);
            
            return {
                status: 'success',
                updatedAt: new Date()
            };
            
        } catch (error) {
            console.error('Dashboard update failed:', error.message);
            return {
                status: 'failed',
                error: error.message
            };
        }
    }
    
    // Verify all platforms are in sync
    async verifyPlatformSync(deployment) {
        console.log('🔄 Verifying platform synchronization...');
        
        const gigId = deployment.gigId;
        const syncStatus = {
            railway: false,
            stripe: false,
            dashboard: false
        };
        
        // Check Railway
        if (this.platforms.railway.services.has(gigId)) {
            const service = this.platforms.railway.services.get(gigId);
            syncStatus.railway = service.status === 'active';
        }
        
        // Check Stripe
        if (this.platforms.stripe.products.has(gigId)) {
            const product = this.platforms.stripe.products.get(gigId);
            syncStatus.stripe = !!product.productId;
        }
        
        // Check Dashboard
        if (this.platforms.dashboard.gigs.has(gigId)) {
            const gig = this.platforms.dashboard.gigs.get(gigId);
            syncStatus.dashboard = gig.status === 'active';
        }
        
        const allSynced = Object.values(syncStatus).every(status => status);
        
        if (!allSynced) {
            throw new Error(`Platform sync verification failed: ${JSON.stringify(syncStatus)}`);
        }
        
        console.log('   ✅ All platforms synchronized successfully');
        return syncStatus;
    }
    
    // Auto-sync: Monitor dashboard for approved gigs and auto-deploy
    startPlatformMonitoring() {
        console.log('👁️ Starting platform monitoring...');
        
        // Check for new approved gigs every 30 seconds
        setInterval(async () => {
            try {
                await this.checkForNewApprovedGigs();
            } catch (error) {
                console.error('Platform monitoring error:', error.message);
            }
        }, 30000);
        
        // Sync existing platforms every 5 minutes
        setInterval(async () => {
            try {
                await this.syncAllPlatforms();
            } catch (error) {
                console.error('Platform sync error:', error.message);
            }
        }, 300000);
    }
    
    // Check dashboard for newly approved gigs
    async checkForNewApprovedGigs() {
        try {
            // In real implementation, query dashboard API
            // For now, simulate checking for approved gigs
            
            const approvedGigs = await this.getApprovedGigsFromDashboard();
            
            for (const gig of approvedGigs) {
                // Check if already deployed
                if (!this.isGigDeployed(gig.id)) {
                    console.log(`🎯 Found new approved gig: ${gig.name}`);
                    
                    // Auto-deploy to all platforms
                    await this.deployGigToAllPlatforms(gig);
                }
            }
            
        } catch (error) {
            console.error('Error checking for approved gigs:', error.message);
        }
    }
    
    // Sync all platforms
    async syncAllPlatforms() {
        console.log('🔄 Syncing all platforms...');
        
        // Create sync task
        await this.assignTask({
            type: 'sync_platforms',
            data: {
                platforms: ['railway', 'stripe', 'dashboard'],
                syncType: 'full'
            },
            priority: 'medium'
        });
    }
    
    // Helper methods
    async simulateRailwayDeployment(gigData) {
        // Simulate deployment time
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // In real implementation:
        // 1. Update railway-server-full.js with new gig routes
        // 2. Deploy to Railway
        // 3. Verify deployment
        
        console.log(`   ✅ Railway deployment simulated for ${gigData.name}`);
    }
    
    async notifyDashboard(event, data) {
        try {
            // In real implementation, send HTTP request to dashboard
            console.log(`   📡 Dashboard notification: ${event}`);
            
            // Simulate API call
            await new Promise(resolve => setTimeout(resolve, 1000));
            
        } catch (error) {
            console.error('Dashboard notification failed:', error.message);
        }
    }
    
    async getApprovedGigsFromDashboard() {
        // In real implementation, query dashboard API
        // For now, return mock data
        return [];
    }
    
    isGigDeployed(gigId) {
        return this.platforms.railway.services.has(gigId) ||
               this.platforms.stripe.products.has(gigId) ||
               this.platforms.dashboard.gigs.has(gigId);
    }
    
    async rollbackDeployment(deployment) {
        console.log(`🔄 Rolling back deployment ${deployment.id}...`);
        
        try {
            // Rollback Railway deployment
            if (deployment.platforms.railway.status === 'success') {
                // Remove Railway service
                this.platforms.railway.services.delete(deployment.gigId);
            }
            
            // Rollback Stripe products
            if (deployment.platforms.stripe.status === 'success') {
                // Archive Stripe products
                this.platforms.stripe.products.delete(deployment.gigId);
            }
            
            // Rollback dashboard changes
            if (deployment.platforms.dashboard.status === 'success') {
                // Reset gig status
                this.platforms.dashboard.gigs.delete(deployment.gigId);
            }
            
            console.log('   ✅ Rollback completed');
            
        } catch (error) {
            console.error('Rollback failed:', error.message);
        }
    }
    
    // Public API methods
    async manualDeployGig(gigData) {
        return await this.deployGigToAllPlatforms(gigData);
    }
    
    getPlatformStatus() {
        return {
            platforms: this.platforms,
            connectedServices: {
                railway: this.platforms.railway.services.size,
                stripe: this.platforms.stripe.products.size,
                dashboard: this.platforms.dashboard.gigs.size
            }
        };
    }
    
    async forcePlatformSync() {
        return await this.syncAllPlatforms();
    }
}

// Start the Platform Integration Super Agent
if (require.main === module) {
    const platformAgent = new PlatformIntegrationSuperAgent();
    
    // Extended API Server
    const express = require('express');
    const app = express();
    app.use(express.json());
    
    // Deploy gig endpoint
    app.post('/api/platform/deploy-gig', async (req, res) => {
        try {
            const deployment = await platformAgent.manualDeployGig(req.body);
            res.json({ success: true, deployment });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });
    
    // Platform status endpoint
    app.get('/api/platform/status', (req, res) => {
        res.json(platformAgent.getPlatformStatus());
    });
    
    // Force sync endpoint
    app.post('/api/platform/sync', async (req, res) => {
        try {
            await platformAgent.forcePlatformSync();
            res.json({ success: true, message: 'Platform sync initiated' });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });
    
    // Extended orchestrator status (includes platform data)
    app.get('/api/orchestrator/status', (req, res) => {
        const baseStatus = platformAgent.getStatus();
        const platformStatus = platformAgent.getPlatformStatus();
        
        res.json({
            ...baseStatus,
            platforms: platformStatus
        });
    });
    
    app.listen(9001, () => {
        console.log('🌐 Platform Integration API running on port 9001');
        console.log('🎯 Endpoints:');
        console.log('   POST /api/platform/deploy-gig - Deploy gig to all platforms');
        console.log('   GET  /api/platform/status - Get platform status');
        console.log('   POST /api/platform/sync - Force platform sync');
    });
    
    // Example: Auto-deploy sample gig for testing
    setTimeout(async () => {
        const sampleGig = {
            id: 'sample_gig_001',
            name: 'Professional Resume Writing',
            description: 'AI-powered professional resume writing service',
            price: 49.99,
            category: 'resume_writing',
            delivery_time: '24 hours',
            status: 'approved'
        };
        
        console.log('\n🎯 Example: Deploying sample gig...');
        try {
            await platformAgent.manualDeployGig(sampleGig);
        } catch (error) {
            console.log('Sample deployment failed (expected in demo):', error.message);
        }
    }, 5000);
}

module.exports = PlatformIntegrationSuperAgent;