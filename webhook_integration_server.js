const express = require('express');
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const fs = require('fs').promises;
const path = require('path');

/**
 * NEURO-PILOT-AI WEBHOOK INTEGRATION & NOTIFICATION SERVER
 * Handles external integrations (Zapier, n8n) and notifications
 */
class WebhookIntegrationServer {
    constructor(options = {}) {
        this.app = express();
        this.port = options.port || process.env.WEBHOOK_PORT || 3009;
        this.notificationConfig = {
            email: {
                enabled: process.env.EMAIL_NOTIFICATIONS === 'true',
                host: process.env.SMTP_HOST,
                port: process.env.SMTP_PORT || 587,
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
                from: process.env.EMAIL_FROM || 'noreply@neuropilot.ai'
            },
            slack: {
                enabled: process.env.SLACK_NOTIFICATIONS === 'true',
                webhook_url: process.env.SLACK_WEBHOOK_URL,
                channel: process.env.SLACK_CHANNEL || '#gig-approvals'
            },
            discord: {
                enabled: process.env.DISCORD_NOTIFICATIONS === 'true',
                webhook_url: process.env.DISCORD_WEBHOOK_URL
            }
        };

        this.pendingNotifications = [];
        this.setupMiddleware();
        this.setupWebhookEndpoints();
        this.setupNotificationSystem();
    }

    setupMiddleware() {
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true }));
        
        // CORS for external integrations
        this.app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
            if (req.method === 'OPTIONS') {
                res.sendStatus(200);
            } else {
                next();
            }
        });

        // Request logging
        this.app.use((req, res, next) => {
            console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - ${req.ip}`);
            next();
        });

        // Security middleware
        this.app.use((req, res, next) => {
            const apiKey = req.headers['x-api-key'] || req.query.api_key;
            const validApiKey = process.env.WEBHOOK_API_KEY || 'neuro-pilot-webhook-key';
            
            // Skip auth for health check and some public endpoints
            if (req.path === '/health' || req.path === '/webhook/public/*') {
                return next();
            }

            if (!apiKey || apiKey !== validApiKey) {
                return res.status(401).json({ 
                    error: 'Unauthorized - Valid API key required',
                    hint: 'Add X-API-Key header or ?api_key parameter'
                });
            }
            next();
        });
    }

    setupWebhookEndpoints() {
        // Health check
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'operational',
                service: 'webhook-integration-server',
                timestamp: new Date().toISOString(),
                notifications: {
                    email: this.notificationConfig.email.enabled,
                    slack: this.notificationConfig.slack.enabled,
                    discord: this.notificationConfig.discord.enabled
                }
            });
        });

        // Zapier Integration Endpoints
        this.app.post('/webhook/zapier/gig-approved', this.handleZapierGigApproval.bind(this));
        this.app.post('/webhook/zapier/gig-rejected', this.handleZapierGigRejection.bind(this));
        this.app.post('/webhook/zapier/gig-deployed', this.handleZapierGigDeployment.bind(this));
        this.app.post('/webhook/zapier/new-gig-submitted', this.handleZapierNewGig.bind(this));

        // n8n Integration Endpoints  
        this.app.post('/webhook/n8n/deployment-status', this.handleN8nDeploymentStatus.bind(this));
        this.app.post('/webhook/n8n/agent-performance', this.handleN8nAgentPerformance.bind(this));
        this.app.post('/webhook/n8n/system-alert', this.handleN8nSystemAlert.bind(this));

        // Generic External Integration Endpoints
        this.app.post('/webhook/external/gig-action', (req, res) => this.handleExternalGigAction(req, res));
        this.app.post('/webhook/external/notification', (req, res) => this.handleExternalNotification(req, res));

        // Internal System Webhooks
        this.app.post('/webhook/internal/gig-created', this.handleInternalGigCreated.bind(this));

        // Webhook testing endpoint
        this.app.post('/webhook/test', this.handleTestWebhook.bind(this));

        // List all available webhooks
        this.app.get('/webhook/list', (req, res) => {
            res.json({
                available_webhooks: {
                    zapier: [
                        'POST /webhook/zapier/gig-approved',
                        'POST /webhook/zapier/gig-rejected', 
                        'POST /webhook/zapier/gig-deployed',
                        'POST /webhook/zapier/new-gig-submitted'
                    ],
                    n8n: [
                        'POST /webhook/n8n/deployment-status',
                        'POST /webhook/n8n/agent-performance',
                        'POST /webhook/n8n/system-alert'
                    ],
                    external: [
                        'POST /webhook/external/gig-action',
                        'POST /webhook/external/notification'
                    ],
                    internal: [
                        'POST /webhook/internal/gig-created'
                    ]
                },
                authentication: 'X-API-Key header or ?api_key parameter required',
                documentation: 'Each endpoint accepts JSON payload with specific schema'
            });
        });
    }

    // Zapier webhook handlers
    async handleZapierGigApproval(req, res) {
        try {
            const { gig_id, approved_by, notes, environment } = req.body;
            
            await this.processGigApproval({
                gig_id,
                approved_by,
                notes,
                environment,
                source: 'zapier'
            });

            await this.sendNotification({
                type: 'gig_approved',
                message: `✅ Gig ${gig_id} approved via Zapier`,
                data: req.body,
                urgency: 'normal'
            });

            res.json({ 
                success: true, 
                message: 'Gig approval processed',
                gig_id,
                processed_at: new Date().toISOString()
            });

        } catch (error) {
            console.error('Zapier gig approval error:', error);
            res.status(500).json({ error: error.message });
        }
    }

    async handleZapierGigRejection(req, res) {
        try {
            const { gig_id, rejected_by, reason, feedback } = req.body;
            
            await this.processGigRejection({
                gig_id,
                rejected_by,
                reason,
                feedback,
                source: 'zapier'
            });

            await this.sendNotification({
                type: 'gig_rejected',
                message: `❌ Gig ${gig_id} rejected via Zapier: ${reason}`,
                data: req.body,
                urgency: 'normal'
            });

            res.json({ 
                success: true, 
                message: 'Gig rejection processed',
                gig_id,
                processed_at: new Date().toISOString()
            });

        } catch (error) {
            console.error('Zapier gig rejection error:', error);
            res.status(500).json({ error: error.message });
        }
    }

    async handleZapierGigDeployment(req, res) {
        try {
            const { gig_id, deployment_status, environment, deployment_url } = req.body;
            
            await this.processGigDeployment({
                gig_id,
                deployment_status,
                environment,
                deployment_url,
                source: 'zapier'
            });

            await this.sendNotification({
                type: 'gig_deployed',
                message: `🚀 Gig ${gig_id} deployed to ${environment}`,
                data: req.body,
                urgency: 'high'
            });

            res.json({ 
                success: true, 
                message: 'Deployment status updated',
                gig_id,
                processed_at: new Date().toISOString()
            });

        } catch (error) {
            console.error('Zapier deployment error:', error);
            res.status(500).json({ error: error.message });
        }
    }

    async handleZapierNewGig(req, res) {
        try {
            const { gig_data, auto_evaluate } = req.body;
            
            // Auto-evaluate risk if requested
            if (auto_evaluate) {
                gig_data.risk_score = await this.evaluateGigRisk(gig_data);
            }

            await this.processNewGig({
                ...gig_data,
                source: 'zapier'
            });

            await this.sendNotification({
                type: 'new_gig_submitted',
                message: `📋 New gig submitted via Zapier: ${gig_data.title}`,
                data: gig_data,
                urgency: 'normal'
            });

            res.json({ 
                success: true, 
                message: 'New gig submitted for approval',
                gig_id: gig_data.id,
                risk_score: gig_data.risk_score,
                processed_at: new Date().toISOString()
            });

        } catch (error) {
            console.error('Zapier new gig error:', error);
            res.status(500).json({ error: error.message });
        }
    }

    // n8n webhook handlers
    async handleN8nDeploymentStatus(req, res) {
        try {
            const { workflow_id, status, environment, metrics } = req.body;
            
            await this.updateDeploymentStatus({
                workflow_id,
                status,
                environment,
                metrics,
                source: 'n8n'
            });

            if (status === 'failed') {
                await this.sendNotification({
                    type: 'deployment_failed',
                    message: `🚨 Deployment failed for workflow ${workflow_id}`,
                    data: req.body,
                    urgency: 'high'
                });
            }

            res.json({ 
                success: true, 
                message: 'Deployment status updated via n8n' 
            });

        } catch (error) {
            console.error('n8n deployment status error:', error);
            res.status(500).json({ error: error.message });
        }
    }

    async handleN8nAgentPerformance(req, res) {
        try {
            const { agent_id, performance_data, alerts } = req.body;
            
            await this.updateAgentPerformance({
                agent_id,
                performance_data,
                alerts,
                source: 'n8n'
            });

            // Send alerts if performance is poor
            if (alerts && alerts.length > 0) {
                await this.sendNotification({
                    type: 'agent_performance_alert',
                    message: `⚠️ Performance alerts for agent ${agent_id}`,
                    data: { alerts, performance_data },
                    urgency: 'medium'
                });
            }

            res.json({ 
                success: true, 
                message: 'Agent performance data processed' 
            });

        } catch (error) {
            console.error('n8n agent performance error:', error);
            res.status(500).json({ error: error.message });
        }
    }

    async handleN8nSystemAlert(req, res) {
        try {
            const { alert_type, severity, message, system_component } = req.body;
            
            await this.processSystemAlert({
                alert_type,
                severity,
                message,
                system_component,
                source: 'n8n'
            });

            await this.sendNotification({
                type: 'system_alert',
                message: `🚨 ${severity.toUpperCase()}: ${message}`,
                data: req.body,
                urgency: severity === 'critical' ? 'high' : 'medium'
            });

            res.json({ 
                success: true, 
                message: 'System alert processed' 
            });

        } catch (error) {
            console.error('n8n system alert error:', error);
            res.status(500).json({ error: error.message });
        }
    }

    // External webhook handlers (placeholder implementations)
    async handleExternalGigAction(req, res) {
        try {
            const { action, gig_data } = req.body;
            
            console.log('External gig action received:', action, gig_data);
            
            res.json({ 
                success: true, 
                message: 'External gig action processed',
                action,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('External gig action error:', error);
            res.status(500).json({ error: error.message });
        }
    }

    async handleExternalNotification(req, res) {
        try {
            const { type, message, urgency } = req.body;
            
            await this.sendNotification({
                type: type || 'external',
                message: message || 'External notification',
                data: req.body,
                urgency: urgency || 'normal'
            });
            
            res.json({ 
                success: true, 
                message: 'External notification processed',
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('External notification error:', error);
            res.status(500).json({ error: error.message });
        }
    }

    // Internal webhook handlers
    async handleInternalGigCreated(req, res) {
        try {
            const gigData = req.body;
            
            // Auto-evaluate risk
            gigData.risk_score = await this.evaluateGigRisk(gigData);
            
            // Store for approval
            await this.storeGigForApproval(gigData);
            
            // Notify stakeholders
            await this.sendNotification({
                type: 'gig_pending_approval',
                message: `📋 New gig awaiting approval: ${gigData.title}`,
                data: gigData,
                urgency: gigData.risk_score === 'HIGH' ? 'high' : 'normal'
            });

            res.json({ 
                success: true, 
                gig_id: gigData.id,
                risk_score: gigData.risk_score
            });

        } catch (error) {
            console.error('Internal gig creation error:', error);
            res.status(500).json({ error: error.message });
        }
    }

    async handleTestWebhook(req, res) {
        console.log('🧪 Test webhook received:', req.body);
        
        await this.sendNotification({
            type: 'test',
            message: '🧪 Test webhook received successfully',
            data: req.body,
            urgency: 'low'
        });

        res.json({ 
            success: true, 
            message: 'Test webhook processed successfully',
            received_data: req.body,
            timestamp: new Date().toISOString()
        });
    }

    // Notification system
    setupNotificationSystem() {
        // Setup email transporter if enabled
        if (this.notificationConfig.email.enabled) {
            this.emailTransporter = nodemailer.createTransport({
                host: this.notificationConfig.email.host,
                port: this.notificationConfig.email.port,
                secure: this.notificationConfig.email.port === 465,
                auth: {
                    user: this.notificationConfig.email.user,
                    pass: this.notificationConfig.email.pass
                }
            });
        }

        // Process notification queue every 30 seconds
        cron.schedule('*/30 * * * * *', () => {
            this.processNotificationQueue();
        });

        // Daily summary at 9 AM
        cron.schedule('0 9 * * *', () => {
            this.sendDailySummary();
        });

        console.log('📧 Notification system initialized');
    }

    async sendNotification(notification) {
        // Add to queue for processing
        this.pendingNotifications.push({
            ...notification,
            created_at: new Date().toISOString(),
            attempts: 0
        });
    }

    async processNotificationQueue() {
        if (this.pendingNotifications.length === 0) return;

        const notifications = [...this.pendingNotifications];
        this.pendingNotifications = [];

        for (const notification of notifications) {
            try {
                await this.deliverNotification(notification);
            } catch (error) {
                console.error('Notification delivery failed:', error);
                
                // Retry logic
                if (notification.attempts < 3) {
                    notification.attempts++;
                    this.pendingNotifications.push(notification);
                }
            }
        }
    }

    async deliverNotification(notification) {
        const promises = [];

        // Email notification
        if (this.notificationConfig.email.enabled && this.emailTransporter) {
            promises.push(this.sendEmailNotification(notification));
        }

        // Slack notification  
        if (this.notificationConfig.slack.enabled) {
            promises.push(this.sendSlackNotification(notification));
        }

        // Discord notification
        if (this.notificationConfig.discord.enabled) {
            promises.push(this.sendDiscordNotification(notification));
        }

        await Promise.allSettled(promises);
        console.log(`📧 Notification delivered: ${notification.type}`);
    }

    async sendEmailNotification(notification) {
        const mailOptions = {
            from: this.notificationConfig.email.from,
            to: process.env.NOTIFICATION_EMAIL || 'david@neuropilot.ai',
            subject: `Neuro-Pilot-AI: ${notification.type.replace('_', ' ').toUpperCase()}`,
            html: this.generateEmailHTML(notification)
        };

        await this.emailTransporter.sendMail(mailOptions);
    }

    async sendSlackNotification(notification) {
        const fetch = require('node-fetch');
        
        const payload = {
            channel: this.notificationConfig.slack.channel,
            username: 'Neuro-Pilot-AI',
            icon_emoji: ':robot_face:',
            text: notification.message,
            attachments: [{
                color: this.getNotificationColor(notification.urgency),
                fields: [
                    {
                        title: 'Type',
                        value: notification.type,
                        short: true
                    },
                    {
                        title: 'Urgency',
                        value: notification.urgency,
                        short: true
                    }
                ],
                timestamp: Math.floor(Date.now() / 1000)
            }]
        };

        await fetch(this.notificationConfig.slack.webhook_url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    }

    async sendDiscordNotification(notification) {
        const fetch = require('node-fetch');
        
        const embed = {
            title: `Neuro-Pilot-AI: ${notification.type.replace('_', ' ')}`,
            description: notification.message,
            color: parseInt(this.getNotificationColor(notification.urgency).replace('#', ''), 16),
            timestamp: new Date().toISOString(),
            footer: {
                text: 'Neuro-Pilot-AI Deployment Control'
            }
        };

        await fetch(this.notificationConfig.discord.webhook_url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ embeds: [embed] })
        });
    }

    generateEmailHTML(notification) {
        return `
        <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
                <h1 style="color: white; margin: 0;">🚀 Neuro-Pilot-AI</h1>
                <p style="color: rgba(255,255,255,0.8); margin: 5px 0;">Deployment Control Notification</p>
            </div>
            
            <div style="padding: 20px; background: #f8f9fa;">
                <h2 style="color: #333;">${notification.type.replace('_', ' ').toUpperCase()}</h2>
                <p style="font-size: 16px; color: #555;">${notification.message}</p>
                
                <div style="background: white; padding: 15px; border-radius: 5px; margin: 20px 0;">
                    <strong>Details:</strong>
                    <pre style="background: #f1f1f1; padding: 10px; border-radius: 3px; overflow-x: auto;">
${JSON.stringify(notification.data, null, 2)}
                    </pre>
                </div>
                
                <p style="text-align: center; margin-top: 30px;">
                    <a href="http://localhost:3008/dashboard" 
                       style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
                        Open Dashboard
                    </a>
                </p>
            </div>
            
            <div style="background: #e9ecef; padding: 10px; text-align: center; font-size: 12px; color: #666;">
                Sent at ${new Date().toLocaleString()} | Urgency: ${notification.urgency.toUpperCase()}
            </div>
        </body>
        </html>
        `;
    }

    getNotificationColor(urgency) {
        const colors = {
            low: '#28a745',
            normal: '#007bff', 
            medium: '#ffc107',
            high: '#dc3545'
        };
        return colors[urgency] || colors.normal;
    }

    // Placeholder for daily summary
    async sendDailySummary() {
        console.log('📊 Daily summary would be sent here');
    }

    // Helper methods for webhook processing
    async processGigApproval(data) {
        // Implementation would integrate with main deployment system
        console.log('Processing gig approval:', data);
    }

    async processGigRejection(data) {
        // Implementation would integrate with main deployment system
        console.log('Processing gig rejection:', data);
    }

    async processGigDeployment(data) {
        // Implementation would integrate with main deployment system
        console.log('Processing gig deployment:', data);
    }

    async processNewGig(data) {
        // Implementation would integrate with main deployment system
        console.log('Processing new gig:', data);
    }

    async updateDeploymentStatus(data) {
        console.log('Updating deployment status:', data);
    }

    async updateAgentPerformance(data) {
        console.log('Updating agent performance:', data);
    }

    async processSystemAlert(data) {
        console.log('Processing system alert:', data);
    }

    async evaluateGigRisk(gigData) {
        // Simple risk evaluation logic
        let riskScore = 0;
        
        if (gigData.price && gigData.price > 500) riskScore += 1;
        if (gigData.description && gigData.description.includes('crypto')) riskScore += 2;
        if (gigData.description && gigData.description.includes('investment')) riskScore += 2;
        if (gigData.agent === 'Opportunity Scout Agent') riskScore += 1;
        
        return riskScore >= 3 ? 'HIGH' : riskScore >= 1 ? 'MEDIUM' : 'LOW';
    }

    async storeGigForApproval(gigData) {
        // Store in local database or integrate with main approval system
        console.log('Storing gig for approval:', gigData.title);
    }

    async start() {
        this.app.listen(this.port, () => {
            console.log(`🔗 Webhook Integration Server running on http://localhost:${this.port}`);
            console.log(`📋 Available endpoints: http://localhost:${this.port}/webhook/list`);
            console.log('🎯 Ready to receive webhooks from Zapier, n8n, and external systems');
        });
    }
}

// Start server if run directly
if (require.main === module) {
    const server = new WebhookIntegrationServer();
    server.start();
}

module.exports = WebhookIntegrationServer;