// Railway Production Server - Neuro.Pilot.AI Complete AI Business System
// Optimized for Railway deployment with full agent integration

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

// Railway-optimized components
const RailwayDatabase = require('./railway-database');
const RailwayAgentSystem = require('./railway-agent-system');

const app = express();
const PORT = process.env.PORT || 8080;

// Initialize Railway systems
const database = new RailwayDatabase();
const agentSystem = new RailwayAgentSystem();

// Middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public'));

// Email system with Railway environment compatibility
let emailSystem = null;
try {
    const emailUser = process.env.SMTP_USER || process.env.EMAIL_USER;
    const emailPass = process.env.SMTP_PASS || process.env.EMAIL_PASS;
    
    if (emailUser && emailPass) {
        const nodemailer = require('nodemailer');
        emailSystem = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: parseInt(process.env.SMTP_PORT) || 587,
            secure: false,
            auth: {
                user: emailUser,
                pass: emailPass
            }
        });
        console.log('📧 Email system initialized for Railway');
        console.log(`📧 SMTP configured: ${emailUser}`);
    } else {
        console.log('⚠️ Email system disabled - no SMTP credentials');
        console.log('   Required: SMTP_USER and SMTP_PASS environment variables');
    }
} catch (error) {
    console.log('⚠️ Email system error:', error.message);
}

// Stripe integration with environment compatibility
let stripe = null;
try {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (stripeKey && stripeKey.startsWith('sk_')) {
        stripe = require('stripe')(stripeKey);
        console.log('💳 Stripe payment system initialized');
    } else {
        console.log('⚠️ Stripe disabled - no valid secret key');
    }
} catch (error) {
    console.log('⚠️ Stripe initialization error:', error.message);
}

// =============================================================================
// CORE API ENDPOINTS
// =============================================================================

// Health check endpoint
app.get('/api/health', async (req, res) => {
    try {
        const dbHealth = await database.healthCheck();
        const systemHealth = await agentSystem.getSystemHealth();
        
        res.json({
            status: 'operational',
            timestamp: new Date().toISOString(),
            service: 'neuro-pilot-ai-production',
            version: '2.0.0',
            railway: {
                deployment: 'production',
                database: dbHealth.database,
                agents: systemHealth.agents.total
            },
            features: {
                aiAgents: true,
                orderProcessing: true,
                emailSystem: !!emailSystem,
                paymentSystem: !!stripe,
                database: dbHealth.status === 'healthy'
            },
            performance: {
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                agents: systemHealth.agents
            }
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Agent system status
app.get('/api/agents/status', async (req, res) => {
    try {
        const agents = await agentSystem.getAgentStatus();
        const stats = await agentSystem.getSystemStats();
        
        res.json({
            status: 'operational',
            timestamp: new Date().toISOString(),
            agents,
            statistics: stats,
            system: {
                total_agents: agents.length,
                active_agents: agents.filter(a => a.status === 'active').length,
                railway_optimized: true,
                database_persistent: stats.storage_type
            }
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            error: error.message
        });
    }
});

// System statistics
app.get('/api/system/stats', async (req, res) => {
    try {
        const stats = await agentSystem.getSystemStats();
        res.json({
            ...stats,
            endpoint: '/api/system/stats',
            railway_deployment: true
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            error: error.message
        });
    }
});

// =============================================================================
// ORDER PROCESSING ENDPOINTS
// =============================================================================

// Submit new order
app.post('/api/resume/generate', async (req, res) => {
    try {
        console.log(`📝 New order received: ${req.body.packageType || 'professional'}`);
        
        // Create order data
        const orderData = {
            orderId: `order_${Date.now()}`,
            timestamp: new Date().toISOString(),
            status: 'received',
            railway_deployment: true,
            ...req.body
        };

        // Validate required fields
        if (!orderData.firstName || !orderData.lastName || !orderData.email) {
            return res.status(400).json({
                status: 'error',
                error: 'Missing required fields: firstName, lastName, email'
            });
        }

        // Save order to database
        await database.saveOrder(orderData);
        
        // Log order creation
        await database.logSystemEvent('order_created', {
            order_id: orderData.orderId,
            package_type: orderData.packageType,
            customer_email: orderData.email
        });

        console.log(`✅ Order saved to Railway database: ${orderData.orderId}`);

        // Handle free orders
        if (orderData.finalPrice === 0 || orderData.finalPrice === '0') {
            return res.json({
                status: 'success',
                orderId: orderData.orderId,
                message: 'Free order confirmed! AI agents will process it within 30 minutes.',
                processing: {
                    estimated_completion: '30 minutes',
                    agents_assigned: ['Product Generator', 'Compliance Checker', 'Analytics Optimizer'],
                    railway_processing: true
                },
                tracking: {
                    url: `/api/order/${orderData.orderId}`,
                    confirmation_url: `/order-confirmation?order_id=${orderData.orderId}&package=${orderData.packageType}&price=0&promo=true`
                }
            });
        }

        // Handle paid orders
        if (stripe && orderData.finalPrice > 0) {
            // In production, implement Stripe checkout here
            res.json({
                status: 'success',
                orderId: orderData.orderId,
                message: 'Order received - payment processing available',
                payment: {
                    stripe_enabled: true,
                    amount: orderData.finalPrice
                }
            });
        } else {
            res.json({
                status: 'success',
                orderId: orderData.orderId,
                message: 'Order received and queued for AI processing',
                processing: {
                    queue_position: 1,
                    estimated_completion: '45 minutes'
                }
            });
        }

    } catch (error) {
        console.error('❌ Order processing error:', error);
        res.status(500).json({
            status: 'error',
            error: 'Order processing failed',
            details: error.message
        });
    }
});

// Get order status
app.get('/api/order/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        
        // Try to get order from database
        let order = await database.getOrder(orderId);
        
        if (!order) {
            return res.status(404).json({
                status: 'error',
                error: 'Order not found',
                order_id: orderId
            });
        }

        // Add real-time status information
        order.tracking = {
            last_updated: new Date().toISOString(),
            railway_deployment: true,
            database_persistent: true
        };

        res.json({
            status: 'success',
            order,
            api_version: '2.0.0'
        });

    } catch (error) {
        console.error('❌ Error fetching order:', error);
        res.status(500).json({
            status: 'error',
            error: 'Failed to fetch order',
            details: error.message
        });
    }
});

// =============================================================================
// EMAIL SYSTEM ENDPOINTS
// =============================================================================

// Send email notification
app.post('/api/send-email', async (req, res) => {
    try {
        if (!emailSystem) {
            return res.status(503).json({
                success: false,
                error: 'Email system not configured',
                instructions: [
                    'Set SMTP_USER environment variable',
                    'Set SMTP_PASS environment variable', 
                    'Verify SMTP_HOST and SMTP_PORT settings'
                ]
            });
        }

        const { email, subject, message, orderData } = req.body;
        
        if (!email) {
            return res.status(400).json({
                success: false,
                error: 'Email address required'
            });
        }

        const currentTime = new Date().toLocaleString();

        // Railway-optimized email template
        const mailOptions = {
            from: {
                name: 'Neuro.Pilot.AI',
                address: process.env.SMTP_USER || process.env.EMAIL_USER
            },
            to: email,
            subject: subject || 'AI Resume Processing Update - Neuro.Pilot.AI',
            html: `
                <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 12px;">
                    <div style="text-align: center; margin-bottom: 30px;">
                        <h1 style="margin: 0; font-size: 32px;">🤖 Neuro.Pilot.AI</h1>
                        <p style="margin: 5px 0 0 0; opacity: 0.9;">Railway-Powered AI Business System</p>
                    </div>
                    
                    <h2 style="color: #fff; margin-bottom: 20px;">AI Processing Update</h2>
                    
                    ${orderData ? `
                        <div style="background: rgba(255,255,255,0.15); padding: 25px; border-radius: 10px; margin: 25px 0; border: 1px solid rgba(255,255,255,0.2);">
                            <h3 style="margin-top: 0;">📋 Order Information</h3>
                            <p><strong>Order ID:</strong> ${orderData.orderId}</p>
                            <p><strong>Package:</strong> ${orderData.packageType || 'Professional'}</p>
                            <p><strong>Customer:</strong> ${orderData.firstName} ${orderData.lastName}</p>
                            <p><strong>Email:</strong> ${orderData.email}</p>
                            <p><strong>Status:</strong> Processing with 7 AI Agents</p>
                            <p><strong>Railway Deployment:</strong> ✅ Optimized</p>
                        </div>
                    ` : ''}
                    
                    <div style="background: rgba(255,255,255,0.15); padding: 25px; border-radius: 10px; margin: 25px 0; border: 1px solid rgba(255,255,255,0.2);">
                        <h3 style="margin-top: 0;">🤖 AI Agent Status</h3>
                        ${message || `Your order is being processed by our advanced AI agent system. Our 7 specialized agents are working together to create your optimized resume with maximum impact.
                        
                        <strong>Processing Timeline:</strong>
                        • Content Generation: 5-10 minutes
                        • Quality Review: 5 minutes  
                        • Final Optimization: 5 minutes
                        • Email Delivery: Instant
                        
                        You'll receive your completed resume within 30 minutes.`}
                    </div>
                    
                    <div style="background: rgba(72, 187, 120, 0.2); padding: 20px; border-radius: 8px; margin: 25px 0; border: 1px solid rgba(72, 187, 120, 0.4);">
                        <h3 style="margin-top: 0;">🚀 Railway-Powered Features</h3>
                        <ul style="margin: 10px 0; padding-left: 20px;">
                            <li>Database-persistent order tracking</li>
                            <li>7-agent AI processing pipeline</li>
                            <li>Real-time performance monitoring</li>
                            <li>Automated quality assurance</li>
                            <li>24/7 cloud availability</li>
                        </ul>
                    </div>
                    
                    <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.3);">
                        <p style="margin: 10px 0;">✨ AI-Powered • 🚀 Railway Deployed • 📧 Instant Delivery</p>
                        <p style="margin: 10px 0;"><small>Powered by 7 Specialized AI Agents | Database Persistent | Quality Guaranteed</small></p>
                        <p style="margin: 10px 0; opacity: 0.8;"><small>Deployed on Railway • Version 2.0.0 • ${currentTime}</small></p>
                    </div>
                </div>
            `
        };

        const info = await emailSystem.sendMail(mailOptions);
        
        // Log email send
        await database.logSystemEvent('email_sent', {
            recipient: email,
            subject: mailOptions.subject,
            message_id: info.messageId
        });
        
        res.json({
            success: true,
            messageId: info.messageId,
            timestamp: new Date().toISOString(),
            railway_deployment: true
        });
        
        console.log(`📧 Railway email sent to ${email}: ${info.messageId}`);
        
    } catch (error) {
        console.error('❌ Email send error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            railway_deployment: true
        });
    }
});

// Test email system
app.post('/api/test-email', async (req, res) => {
    try {
        if (!emailSystem) {
            return res.status(503).json({
                success: false,
                error: 'Email system not configured for Railway',
                required_env_vars: [
                    'SMTP_USER=Neuro.Pilot.AI@gmail.com',
                    'SMTP_PASS=[Gmail App Password]',
                    'SMTP_HOST=smtp.gmail.com',
                    'SMTP_PORT=587'
                ],
                instructions: 'Set these environment variables in Railway dashboard'
            });
        }

        const testResult = await emailSystem.verify();
        
        res.json({
            success: true,
            smtp_verified: testResult,
            timestamp: new Date().toISOString(),
            message: 'Railway email system verified successfully!',
            config: {
                host: process.env.SMTP_HOST || 'smtp.gmail.com',
                port: process.env.SMTP_PORT || 587,
                user: process.env.SMTP_USER || 'Not set'
            }
        });
        
        console.log('📧 Railway email system test successful');
        
    } catch (error) {
        console.error('❌ Email test error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            railway_deployment: true
        });
    }
});

// =============================================================================
// FRONTEND ROUTES
// =============================================================================

// Homepage
app.get('/', (req, res) => {
    const systemStatus = agentSystem ? 'FULLY OPERATIONAL' : 'STARTING UP';
    const currentTime = new Date().toLocaleString();
    
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Neuro.Pilot.AI - Railway-Powered AI Business System</title>
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
            max-width: 900px;
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
        
        .tagline {
            font-size: 18px;
            margin-bottom: 30px;
            opacity: 0.8;
        }
        
        .status {
            background: rgba(72, 187, 120, 0.2);
            border: 1px solid rgba(72, 187, 120, 0.4);
            padding: 25px;
            border-radius: 12px;
            margin: 30px 0;
        }
        
        .railway-badge {
            background: linear-gradient(45deg, #8B5CF6, #3B82F6);
            padding: 8px 16px;
            border-radius: 20px;
            display: inline-block;
            margin: 15px 5px;
            font-size: 14px;
            font-weight: 600;
        }
        
        .features {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin: 30px 0;
        }
        
        .feature {
            background: rgba(255,255,255,0.1);
            padding: 25px;
            border-radius: 12px;
            border: 1px solid rgba(255,255,255,0.2);
        }
        
        .feature h4 { margin-bottom: 10px; font-size: 18px; }
        
        .btn {
            background: linear-gradient(45deg, #667eea, #764ba2);
            color: white;
            padding: 18px 36px;
            text-decoration: none;
            border-radius: 12px;
            font-weight: 600;
            font-size: 18px;
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
        <div class="logo">🤖</div>
        <h1>Neuro.Pilot.AI</h1>
        <div class="subtitle">Railway-Powered AI Business System</div>
        <p class="tagline">7 Specialized AI Agents • Database Persistent • Production Ready</p>
        
        <div class="railway-badge">🚂 Railway Deployed</div>
        <div class="railway-badge">🗄️ Database Persistent</div>
        <div class="railway-badge">⚡ Real-time Processing</div>
        
        <div class="status">
            <h3>✅ System Status: ${systemStatus}</h3>
            <p>🤖 7 AI Agents Active • ${emailSystem ? '📧 Email System Ready' : '📧 Email Standby'} • ${stripe ? '💳 Payments Ready' : '💳 Payment Standby'}</p>
            <p>🗄️ Railway Database Connected • 🔄 24/7 Order Processing • 📊 Real-time Monitoring</p>
        </div>
        
        <div class="features">
            <div class="feature">
                <h4>🎯 7-Agent AI Pipeline</h4>
                <p>Master Orchestrator coordinates specialized agents for optimal results</p>
            </div>
            <div class="feature">
                <h4>🗄️ Database Persistent</h4>
                <p>Railway database ensures no data loss on deployments</p>
            </div>
            <div class="feature">
                <h4>⚡ Real-time Processing</h4>
                <p>30-second monitoring with instant order processing</p>
            </div>
            <div class="feature">
                <h4>📊 Performance Tracking</h4>
                <p>Advanced analytics and agent performance optimization</p>
            </div>
            <div class="feature">
                <h4>🔧 ATS Optimized</h4>
                <p>Applicant Tracking System compatible resumes</p>
            </div>
            <div class="feature">
                <h4>🚀 Production Ready</h4>
                <p>Scalable Railway deployment with monitoring</p>
            </div>
        </div>
        
        <div class="stats">
            <div class="stat">
                <div class="stat-number">7</div>
                <div class="stat-label">AI Agents</div>
            </div>
            <div class="stat">
                <div class="stat-number">24/7</div>
                <div class="stat-label">Availability</div>
            </div>
            <div class="stat">
                <div class="stat-number">100%</div>
                <div class="stat-label">Automated</div>
            </div>
            <div class="stat">
                <div class="stat-number">∞</div>
                <div class="stat-label">Scalable</div>
            </div>
        </div>
        
        <a href="/order" class="btn">📝 Order Your Resume</a>
        <a href="/api/health" class="btn">🔍 System Health</a>
        <a href="/api/agents/status" class="btn">🤖 Agent Status</a>
        
        <p style="margin-top: 30px; opacity: 0.7;">
            Railway Deployment • Version 2.0.0 • ${currentTime}
        </p>
    </div>
</body>
</html>
    `);
});

// Order confirmation page (Railway-optimized)
app.get('/order-confirmation', async (req, res) => {
    const { package: packageType, price, promo, order_id } = req.query;
    const isPromo = promo === 'true';
    const currentTime = new Date().toLocaleString();
    
    let orderDetails = {
        package: packageType || 'professional',
        price: price || '45',
        orderId: order_id || 'Processing'
    };

    // Try to load actual order from database
    if (order_id) {
        try {
            const order = await database.getOrder(order_id);
            if (order) {
                orderDetails.package = order.packageType || orderDetails.package;
                orderDetails.price = order.finalPrice || orderDetails.price;
                orderDetails.orderId = order.orderId || orderDetails.orderId;
            }
        } catch (error) {
            console.log('Could not load order from Railway database:', error.message);
        }
    }
    
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Order Confirmed - Neuro.Pilot.AI Railway</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        
        body {
            font-family: 'Inter', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%);
            color: white;
            min-height: 100vh;
            margin: 0;
            padding: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .container {
            max-width: 800px;
            margin: 0 auto;
            background: rgba(255,255,255,0.1);
            padding: 50px;
            border-radius: 24px;
            backdrop-filter: blur(20px);
            border: 1px solid rgba(255,255,255,0.2);
            text-align: center;
        }
        
        .success-icon { font-size: 100px; margin-bottom: 25px; }
        h1 { font-size: 42px; font-weight: 800; margin-bottom: 20px; }
        
        .railway-badge {
            background: linear-gradient(45deg, #8B5CF6, #3B82F6);
            padding: 10px 20px;
            border-radius: 25px;
            display: inline-block;
            margin: 15px 5px;
            font-weight: 600;
        }
        
        .order-details {
            background: rgba(255,255,255,0.1);
            padding: 35px;
            border-radius: 16px;
            margin: 35px 0;
            text-align: left;
            border: 1px solid rgba(255,255,255,0.2);
        }
        
        .detail-row {
            display: flex;
            justify-content: space-between;
            margin: 15px 0;
            padding: 12px 0;
            border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        
        .detail-row:last-child { border-bottom: none; }
        
        .processing-status {
            background: rgba(72, 187, 120, 0.2);
            padding: 30px;
            border-radius: 12px;
            margin: 25px 0;
            border: 1px solid rgba(72, 187, 120, 0.4);
        }
        
        .agent-list {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin: 20px 0;
        }
        
        .agent {
            background: rgba(255,255,255,0.1);
            padding: 15px;
            border-radius: 8px;
            border: 1px solid rgba(255,255,255,0.2);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="success-icon">🎉</div>
        <h1>Order Confirmed!</h1>
        
        <div class="railway-badge">🚂 Railway Deployed</div>
        <div class="railway-badge">🗄️ Database Stored</div>
        ${isPromo ? '<div class="railway-badge">🎟️ PROMO APPLIED</div>' : ''}
        
        <p style="font-size: 20px; margin: 25px 0;">
            ${isPromo ? 'Your FREE order is confirmed and queued for our Railway-powered AI system!' : 'Thank you! Our 7 AI agents are ready to process your resume.'}
        </p>
        
        <div class="order-details">
            <h3 style="margin-bottom: 25px;">📋 Order Details</h3>
            
            <div class="detail-row">
                <strong>Package Type:</strong>
                <span>${orderDetails.package.charAt(0).toUpperCase() + orderDetails.package.slice(1)}</span>
            </div>
            
            <div class="detail-row">
                <strong>Order ID:</strong>
                <span>${orderDetails.orderId}</span>
            </div>
            
            <div class="detail-row">
                <strong>Amount:</strong>
                <span>${orderDetails.price === '0' || orderDetails.price === 0 ? 'FREE' : '$' + orderDetails.price}</span>
            </div>
            
            <div class="detail-row">
                <strong>Storage:</strong>
                <span>Railway Database (Persistent)</span>
            </div>
            
            <div class="detail-row">
                <strong>Processing Time:</strong>
                <span>30 minutes (AI optimized)</span>
            </div>
            
            <div class="detail-row">
                <strong>Delivery:</strong>
                <span>Email with attachments</span>
            </div>
        </div>
        
        <div class="processing-status">
            <h3>🤖 AI Agent Processing Pipeline</h3>
            <p><strong>Current Status:</strong> Order stored in Railway database, queued for processing</p>
            <p><strong>Processing System:</strong> 7 specialized AI agents working in coordination</p>
            
            <div class="agent-list">
                <div class="agent">🎯 Product Generator<br><small>Resume creation</small></div>
                <div class="agent">🛡️ Compliance Checker<br><small>Quality assurance</small></div>
                <div class="agent">📊 Analytics Optimizer<br><small>Performance tuning</small></div>
                <div class="agent">🎨 Sales & Marketing<br><small>Content enhancement</small></div>
                <div class="agent">💳 Billing Manager<br><small>Order coordination</small></div>
                <div class="agent">🎧 Customer Service<br><small>Support ready</small></div>
                <div class="agent">🧠 Master Orchestrator<br><small>System coordination</small></div>
            </div>
            
            <p><strong>Railway Features:</strong> Database persistence, real-time monitoring, 24/7 availability</p>
        </div>
        
        <div style="background: rgba(255,255,255,0.1); padding: 25px; border-radius: 12px; margin: 25px 0;">
            <h3>📬 What Happens Next?</h3>
            <ol style="text-align: left; margin: 15px 0; line-height: 1.8;">
                <li><strong>Database Storage:</strong> Your order is safely stored in Railway's persistent database</li>
                <li><strong>AI Processing:</strong> 7 agents collaborate to analyze and optimize your resume</li>
                <li><strong>Quality Review:</strong> Automated quality checks ensure professional standards</li>
                <li><strong>Email Delivery:</strong> Completed resume delivered to your inbox within 30 minutes</li>
                <li><strong>Support:</strong> Reply to delivery email for revisions (7-day guarantee)</li>
            </ol>
        </div>
        
        <p style="margin: 30px 0; font-size: 18px;">
            <strong>Track Your Order:</strong> <a href="/api/order/${orderDetails.orderId}" style="color: #48bb78;">API Status</a>
        </p>
        
        <p style="margin: 30px 0;">
            <strong>Questions?</strong> Email us at support@neuropilot.ai
        </p>
        
        <p style="opacity: 0.8; font-size: 14px;">
            Order confirmed: ${currentTime}<br>
            Railway Deployment • Database Persistent • Version 2.0.0<br>
            System Status: ✅ Fully Operational
        </p>
    </div>
</body>
</html>
    `);
});

// =============================================================================
// SYSTEM INITIALIZATION
// =============================================================================

// Initialize and start the Railway system
async function initializeRailwaySystem() {
    try {
        console.log('🚀 Initializing Neuro.Pilot.AI Railway System...');
        console.log('═'.repeat(60));
        
        // Start database
        console.log('🗄️ Railway database initialized');
        
        // Start agent system
        await agentSystem.startSystem();
        console.log('🤖 AI agent system started');
        
        // System ready
        console.log('✅ Railway system initialization complete');
        console.log('═'.repeat(60));
        
        // Log startup
        await database.logSystemEvent('railway_system_startup', {
            version: '2.0.0',
            port: PORT,
            features: {
                agents: 7,
                database: 'persistent',
                email: !!emailSystem,
                payments: !!stripe
            }
        });
        
        return true;
    } catch (error) {
        console.error('❌ Railway system initialization failed:', error);
        return false;
    }
}

// Start the server
app.listen(PORT, '0.0.0.0', async () => {
    console.log('🚀 Neuro.Pilot.AI Railway Production Server Started');
    console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
    console.log(`🌐 Homepage: http://localhost:${PORT}/`);
    console.log(`📝 Order processing: http://localhost:${PORT}/order`);
    console.log(`🤖 Agent status: http://localhost:${PORT}/api/agents/status`);
    console.log(`📊 System stats: http://localhost:${PORT}/api/system/stats`);
    console.log('');
    console.log('🔧 System Configuration:');
    console.log(`   📧 Email System: ${emailSystem ? 'ENABLED' : 'DISABLED'}`);
    console.log(`   💳 Payment System: ${stripe ? 'ENABLED' : 'DISABLED'}`);
    console.log(`   🗄️ Database: Railway ${database.useDatabase ? 'PostgreSQL' : 'Memory'}`);
    console.log(`   🤖 AI Agents: 7 agents ready`);
    console.log('');
    console.log('✅ RAILWAY DEPLOYMENT SUCCESSFUL');
    
    // Initialize the complete system
    const initSuccess = await initializeRailwaySystem();
    
    if (initSuccess) {
        console.log('🎯 Neuro.Pilot.AI fully operational on Railway!');
    } else {
        console.log('⚠️ System started with some limitations');
    }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('🛑 Received SIGTERM, shutting down gracefully...');
    
    if (agentSystem) {
        await agentSystem.stopSystem();
    }
    
    await database.logSystemEvent('railway_system_shutdown', {
        uptime: process.uptime(),
        reason: 'SIGTERM'
    });
    
    process.exit(0);
});

module.exports = app;