// Universal Gig Management Server - All AI Services in One Platform
// Manages resume services, trading agents, content creation, e-commerce, and analytics

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

// Import systems
const UniversalGigOrchestrator = require('./universal-gig-orchestrator');
const RailwayDatabase = require('./railway-database');

const app = express();
const PORT = process.env.PORT || 8080;

// Initialize systems
const orchestrator = new UniversalGigOrchestrator();
const database = new RailwayDatabase();

// Middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public'));

// =============================================================================
// UNIVERSAL GIG ENDPOINTS
// =============================================================================

// System status
app.get('/api/universal/status', async (req, res) => {
    try {
        const status = await orchestrator.getSystemStatus();
        const notionStats = await orchestrator.notion.getNotionStats();
        const systemSummary = orchestrator.systemMap ? orchestrator.systemDiscovery.getSystemSummary() : null;
        
        res.json({
            status: 'operational',
            ...status,
            universal_platform: true,
            notion_integration: notionStats,
            system_discovery: systemSummary
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            error: error.message
        });
    }
});

// System discovery and file mapping
app.get('/api/universal/system-map', async (req, res) => {
    try {
        if (!orchestrator.systemMap) {
            return res.json({
                status: 'not_discovered',
                message: 'System discovery not yet completed'
            });
        }

        const systemSummary = orchestrator.systemDiscovery.getSystemSummary();
        const detailedMap = Object.fromEntries(orchestrator.systemMap);
        
        res.json({
            status: 'mapped',
            summary: systemSummary,
            detailed_map: detailedMap,
            file_monitoring: {
                agent_files: detailedMap.agents?.files || [],
                service_files: detailedMap.services?.files || [],
                dashboard_files: detailedMap.dashboards?.files || [],
                deployment_files: detailedMap.deployments?.files || []
            }
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            error: error.message
        });
    }
});

// Create new gig
app.post('/api/universal/gig/create', async (req, res) => {
    try {
        const { serviceType, gigData } = req.body;
        
        if (!serviceType) {
            return res.status(400).json({
                success: false,
                error: 'Service type is required',
                available_services: [
                    'resume_services',
                    'trading_services', 
                    'content_services',
                    'ecommerce_services',
                    'analytics_services',
                    'linkedin_services'
                ]
            });
        }

        const result = await orchestrator.createGig(serviceType, gigData);
        
        if (result.success) {
            res.json({
                success: true,
                message: `${serviceType} gig created successfully`,
                gig: result.gig,
                gigId: result.gigId,
                estimatedCompletion: result.gig.progress.estimatedTime + ' minutes'
            });
        } else {
            res.status(400).json(result);
        }

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Process gig
app.post('/api/universal/gig/:gigId/process', async (req, res) => {
    try {
        const { gigId } = req.params;
        
        console.log(`🎯 Processing universal gig: ${gigId}`);
        const result = await orchestrator.processGig(gigId);
        
        if (result.success) {
            res.json({
                success: true,
                message: 'Gig processed successfully',
                gigId,
                result: result.result
            });
        } else {
            res.status(400).json(result);
        }

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get gig status
app.get('/api/universal/gig/:gigId', async (req, res) => {
    try {
        const { gigId } = req.params;
        
        const gig = orchestrator.activeGigs.get(gigId);
        if (!gig) {
            return res.status(404).json({
                success: false,
                error: 'Gig not found'
            });
        }

        res.json({
            success: true,
            gig,
            universal_platform: true
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// List all active gigs
app.get('/api/universal/gigs', async (req, res) => {
    try {
        const { serviceType } = req.query;
        
        let gigs = Array.from(orchestrator.activeGigs.values());
        
        if (serviceType) {
            gigs = gigs.filter(gig => gig.serviceType === serviceType);
        }

        res.json({
            success: true,
            total: gigs.length,
            gigs,
            available_services: Array.from(orchestrator.services.keys())
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// =============================================================================
// SERVICE-SPECIFIC ENDPOINTS
// =============================================================================

// Resume services (existing functionality)
app.post('/api/resume/generate', async (req, res) => {
    try {
        const result = await orchestrator.createGig('resume_services', req.body);
        
        if (result.success) {
            // Automatically process the resume gig
            const processResult = await orchestrator.processGig(result.gigId);
            
            res.json({
                status: 'success',
                orderId: result.gigId,
                message: 'Resume generated successfully',
                gig: result.gig,
                result: processResult.result,
                universal_platform: true
            });
        } else {
            res.status(400).json(result);
        }

    } catch (error) {
        res.status(500).json({
            status: 'error',
            error: error.message
        });
    }
});

// Trading services
app.post('/api/trading/create-strategy', async (req, res) => {
    try {
        const result = await orchestrator.createGig('trading_services', req.body);
        
        res.json({
            success: true,
            message: 'Trading strategy gig created',
            gigId: result.gigId,
            estimatedTime: result.gig.progress.estimatedTime + ' minutes'
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Content creation services
app.post('/api/content/create', async (req, res) => {
    try {
        const result = await orchestrator.createGig('content_services', req.body);
        
        res.json({
            success: true,
            message: 'Content creation gig created',
            gigId: result.gigId,
            estimatedTime: result.gig.progress.estimatedTime + ' minutes'
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// E-commerce services
app.post('/api/ecommerce/optimize', async (req, res) => {
    try {
        const result = await orchestrator.createGig('ecommerce_services', req.body);
        
        res.json({
            success: true,
            message: 'E-commerce optimization gig created',
            gigId: result.gigId,
            estimatedTime: result.gig.progress.estimatedTime + ' minutes'
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Analytics services
app.post('/api/analytics/analyze', async (req, res) => {
    try {
        const result = await orchestrator.createGig('analytics_services', req.body);
        
        res.json({
            success: true,
            message: 'Analytics gig created',
            gigId: result.gigId,
            estimatedTime: result.gig.progress.estimatedTime + ' minutes'
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// LinkedIn career intelligence services
app.post('/api/linkedin/career-intelligence', async (req, res) => {
    try {
        const result = await orchestrator.createGig('linkedin_services', req.body);
        
        res.json({
            success: true,
            message: 'LinkedIn career intelligence gig created',
            gigId: result.gigId,
            estimatedTime: result.gig.progress.estimatedTime + ' minutes',
            services: [
                'Profile optimization',
                'Job market analysis', 
                'Salary intelligence',
                'Career matching',
                'Market insights'
            ]
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// =============================================================================
// FRONTEND ROUTES
// =============================================================================

// Universal dashboard homepage
app.get('/', (req, res) => {
    const currentTime = new Date().toLocaleString();
    
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Universal Gig Platform - All AI Services</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body {
            font-family: 'Inter', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
            color: white;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .container {
            text-align: center;
            padding: 60px 40px;
            background: rgba(255,255,255,0.1);
            border-radius: 24px;
            backdrop-filter: blur(20px);
            border: 1px solid rgba(255,255,255,0.2);
            max-width: 1200px;
            margin: 20px;
        }
        
        .logo { font-size: 64px; margin-bottom: 20px; }
        
        h1 {
            font-size: 48px;
            font-weight: 800;
            margin-bottom: 15px;
            background: linear-gradient(45deg, #fff, #f0f8ff);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        
        .subtitle {
            font-size: 24px;
            margin-bottom: 10px;
            opacity: 0.9;
            font-weight: 600;
        }
        
        .services {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 25px;
            margin: 40px 0;
        }
        
        .service {
            background: rgba(255,255,255,0.1);
            padding: 30px;
            border-radius: 16px;
            border: 1px solid rgba(255,255,255,0.2);
            transition: transform 0.3s ease;
        }
        
        .service:hover {
            transform: translateY(-5px);
            background: rgba(255,255,255,0.15);
        }
        
        .service h3 {
            font-size: 20px;
            margin-bottom: 15px;
            color: #48bb78;
        }
        
        .service-status {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            margin-bottom: 10px;
        }
        
        .status-active { background: rgba(72, 187, 120, 0.3); color: #48bb78; }
        .status-development { background: rgba(255, 165, 0, 0.3); color: #ffa500; }
        .status-planned { background: rgba(128, 128, 128, 0.3); color: #999; }
        
        .btn {
            background: linear-gradient(45deg, #667eea, #764ba2);
            color: white;
            padding: 15px 30px;
            text-decoration: none;
            border-radius: 12px;
            font-weight: 600;
            font-size: 16px;
            display: inline-block;
            margin: 10px;
            transition: transform 0.3s ease;
        }
        
        .btn:hover { transform: translateY(-2px); }
        
        .stats {
            display: flex;
            justify-content: center;
            gap: 40px;
            margin: 30px 0;
            flex-wrap: wrap;
        }
        
        .stat {
            text-align: center;
        }
        
        .stat-number {
            font-size: 36px;
            font-weight: 800;
            color: #48bb78;
        }
        
        .stat-label {
            font-size: 14px;
            opacity: 0.8;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">🌐</div>
        <h1>Universal Gig Platform</h1>
        <div class="subtitle">All AI Services • One Platform • Infinite Possibilities</div>
        <p style="margin-bottom: 30px; opacity: 0.8;">Orchestrating AI agents across all business domains</p>
        
        <div class="services">
            <div class="service">
                <div class="service-status status-active">ACTIVE</div>
                <h3>📝 Resume & Business Services</h3>
                <p>AI-powered resume generation, business plans, and professional document creation</p>
                <p><strong>Agents:</strong> 7 specialized AI agents</p>
            </div>
            
            <div class="service">
                <div class="service-status status-development">DEVELOPMENT</div>
                <h3>📈 Trading & Investment</h3>
                <p>Algorithmic trading strategies, market analysis, and portfolio optimization</p>
                <p><strong>Agents:</strong> 6 financial AI agents</p>
            </div>
            
            <div class="service">
                <div class="service-status status-planned">PLANNED</div>
                <h3>✍️ Content Creation</h3>
                <p>Blog posts, social media, SEO content, and creative writing automation</p>
                <p><strong>Agents:</strong> 5 creative AI agents</p>
            </div>
            
            <div class="service">
                <div class="service-status status-planned">PLANNED</div>
                <h3>🛒 E-commerce Automation</h3>
                <p>Product listings, inventory management, and customer service automation</p>
                <p><strong>Agents:</strong> 5 commerce AI agents</p>
            </div>
            
            <div class="service">
                <div class="service-status status-planned">PLANNED</div>
                <h3>📊 Data Analytics</h3>
                <p>Data collection, analysis, predictions, and automated reporting</p>
                <p><strong>Agents:</strong> 5 analytics AI agents</p>
            </div>
            
            <div class="service">
                <div class="service-status status-active">ACTIVE</div>
                <h3>🔗 LinkedIn Career Intelligence</h3>
                <p>Job scraping, profile optimization, salary intelligence, and career matching</p>
                <p><strong>Agents:</strong> 6 career AI agents</p>
            </div>
        </div>
        
        <div class="stats">
            <div class="stat">
                <div class="stat-number">6</div>
                <div class="stat-label">Service Types</div>
            </div>
            <div class="stat">
                <div class="stat-number">34</div>
                <div class="stat-label">Total AI Agents</div>
            </div>
            <div class="stat">
                <div class="stat-number">24/7</div>
                <div class="stat-label">Availability</div>
            </div>
            <div class="stat">
                <div class="stat-number">∞</div>
                <div class="stat-label">Scalable</div>
            </div>
        </div>
        
        <a href="/api/universal/status" class="btn">🔍 System Status</a>
        <a href="/api/universal/gigs" class="btn">🎯 View All Gigs</a>
        <a href="/order" class="btn">📝 Create Resume Gig</a>
        
        <p style="margin-top: 30px; opacity: 0.7;">
            Universal Platform • Version 1.0.0 • ${currentTime}
        </p>
    </div>
</body>
</html>
    `);
});

// =============================================================================
// SYSTEM INITIALIZATION
// =============================================================================

// Initialize and start the system
async function initializeUniversalSystem() {
    try {
        console.log('🌐 Initializing Universal Gig Platform...');
        console.log('═'.repeat(60));
        
        // Start orchestrator
        await orchestrator.startSystem();
        console.log('🎯 Universal orchestrator started');
        
        // Log startup
        await database.logSystemEvent('universal_platform_startup', {
            version: '1.0.0',
            port: PORT,
            services: Array.from(orchestrator.services.keys())
        });
        
        console.log('✅ Universal system initialization complete');
        console.log('═'.repeat(60));
        
        return true;
    } catch (error) {
        console.error('❌ Universal system initialization failed:', error);
        return false;
    }
}

// Start the server
app.listen(PORT, '0.0.0.0', async () => {
    console.log('🌐 Universal Gig Platform Started');
    console.log(`📊 System status: http://localhost:${PORT}/api/universal/status`);
    console.log(`🌐 Homepage: http://localhost:${PORT}/`);
    console.log(`🎯 All gigs: http://localhost:${PORT}/api/universal/gigs`);
    console.log('');
    console.log('🔧 Available Services:');
    console.log('   📝 Resume & Business (/api/resume/generate)');
    console.log('   📈 Trading Services (/api/trading/create-strategy)');
    console.log('   ✍️ Content Creation (/api/content/create)');
    console.log('   🛒 E-commerce (/api/ecommerce/optimize)');
    console.log('   📊 Analytics (/api/analytics/analyze)');
    console.log('   🔗 LinkedIn Career Intelligence (/api/linkedin/career-intelligence)');
    console.log('');
    console.log('✅ UNIVERSAL PLATFORM OPERATIONAL');
    
    // Initialize the complete system
    const initSuccess = await initializeUniversalSystem();
    
    if (initSuccess) {
        console.log('🎯 Universal Gig Platform fully operational!');
        console.log('🌐 All AI services ready for orchestration');
    } else {
        console.log('⚠️ System started with some limitations');
    }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('🛑 Received SIGTERM, shutting down gracefully...');
    
    if (orchestrator) {
        await orchestrator.stopSystem();
    }
    
    process.exit(0);
});

module.exports = app;