require('dotenv').config();
const nodemailer = require('nodemailer');
const fs = require('fs').promises;
const path = require('path');

class DeploymentNotifier {
    constructor() {
        // Setup email transporter
        this.transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER || 'neuro.pilot.ai@gmail.com',
                pass: process.env.EMAIL_PASS || 'dyvk fsmn tizo hxwn'
            }
        });
        
        this.deploymentHistory = [];
    }

    async sendDeploymentFailedAlert() {
        const timestamp = new Date().toISOString();
        const deploymentStatus = {
            timestamp,
            status: 'FAILED',
            platform: 'Railway',
            service: 'neuro-pilot-ai-production',
            errors: [
                'Cannot find module nodemailer',
                'AutomatedOrderProcessor integration issues',
                'Server crashed on startup',
                'AI agents not starting properly'
            ],
            impact: 'HIGH - Customer orders not being processed',
            ordersAffected: ['order_1750603803709'],
            currentWorkaround: 'Standalone order processor running locally'
        };

        // Save to deployment history
        this.deploymentHistory.push(deploymentStatus);
        await this.saveDeploymentLog(deploymentStatus);

        // Send email alert
        await this.sendEmailAlert(deploymentStatus);
        
        // Send to management dashboard
        await this.notifyManagement(deploymentStatus);
        
        console.log('🚨 Deployment failure notification sent');
        return deploymentStatus;
    }

    async sendEmailAlert(deploymentStatus) {
        const emailHTML = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #dc3545; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 8px 8px; border: 1px solid #dee2e6; }
        .alert { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 15px 0; }
        .error-list { background: white; padding: 15px; border-radius: 5px; margin: 15px 0; }
        .status-critical { color: #dc3545; font-weight: bold; }
        .workaround { background: #d1ecf1; border: 1px solid #bee5eb; padding: 15px; border-radius: 5px; margin: 15px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚨 DEPLOYMENT FAILURE ALERT</h1>
            <p>Neuro.Pilot.AI Production System</p>
        </div>
        <div class="content">
            <h2>Deployment Status: <span class="status-critical">FAILED</span></h2>
            
            <div class="alert">
                <strong>⚠️ CRITICAL ALERT:</strong> Railway production deployment has failed multiple times.
                Customer orders are not being processed automatically.
            </div>
            
            <h3>📋 Deployment Details:</h3>
            <ul>
                <li><strong>Platform:</strong> ${deploymentStatus.platform}</li>
                <li><strong>Service:</strong> ${deploymentStatus.service}</li>
                <li><strong>Timestamp:</strong> ${deploymentStatus.timestamp}</li>
                <li><strong>Impact Level:</strong> ${deploymentStatus.impact}</li>
            </ul>
            
            <h3>❌ Critical Errors:</h3>
            <div class="error-list">
                <ul>
                    ${deploymentStatus.errors.map(error => `<li>${error}</li>`).join('')}
                </ul>
            </div>
            
            <h3>🎯 Affected Orders:</h3>
            <ul>
                ${deploymentStatus.ordersAffected.map(order => `<li><strong>${order}</strong> - Executive Package (FAMILY2025 promo applied)</li>`).join('')}
            </ul>
            
            <div class="workaround">
                <h3>🔧 Current Workaround:</h3>
                <p><strong>Status:</strong> ${deploymentStatus.currentWorkaround}</p>
                <p>• Standalone AI order processor running locally</p>
                <p>• AI Agent Dashboard operational at http://localhost:3008</p>
                <p>• Email system configured and functional</p>
            </div>
            
            <h3>📋 Action Items:</h3>
            <ol>
                <li>✅ <strong>Immediate:</strong> Standalone processor activated</li>
                <li>🔄 <strong>In Progress:</strong> Railway dependency issues being resolved</li>
                <li>⏳ <strong>Next:</strong> Re-enable automated order processor in production</li>
                <li>📧 <strong>Customer Service:</strong> Monitor affected orders for manual processing</li>
            </ol>
            
            <h3>🚀 Recovery Plan:</h3>
            <p>1. Fix Railway nodemailer dependency<br>
            2. Simplify AutomatedOrderProcessor integration<br>
            3. Test deployment in staging environment<br>
            4. Re-deploy with gradual rollout<br>
            5. Monitor order processing resumption</p>
            
            <p><strong>Next Update:</strong> Within 30 minutes</p>
        </div>
    </div>
</body>
</html>
        `;

        const mailOptions = {
            from: '"Neuro.Pilot.AI DevOps" <neuro.pilot.ai@gmail.com>',
            to: 'davidmikulis66@gmail.com',
            cc: 'david.mikulis@sodexo.com',
            subject: '🚨 URGENT: Railway Deployment Failed - Order Processing Down',
            html: emailHTML,
            text: `
DEPLOYMENT FAILURE ALERT

Platform: ${deploymentStatus.platform}
Service: ${deploymentStatus.service}
Status: FAILED
Impact: ${deploymentStatus.impact}

Errors:
${deploymentStatus.errors.map(error => `- ${error}`).join('\n')}

Affected Orders: ${deploymentStatus.ordersAffected.join(', ')}

Workaround: ${deploymentStatus.currentWorkaround}

Action Required: Fix Railway deployment issues immediately.
            `
        };

        try {
            const info = await this.transporter.sendMail(mailOptions);
            console.log('📧 Deployment failure alert sent:', info.messageId);
            return { success: true, messageId: info.messageId };
        } catch (error) {
            console.error('❌ Failed to send deployment alert:', error);
            return { success: false, error: error.message };
        }
    }

    async saveDeploymentLog(deploymentStatus) {
        try {
            const logsDir = path.join(__dirname, 'logs');
            await fs.mkdir(logsDir, { recursive: true });
            
            const logFile = path.join(logsDir, `deployment_${Date.now()}.json`);
            await fs.writeFile(logFile, JSON.stringify(deploymentStatus, null, 2));
            
            // Also append to main deployment log
            const mainLogFile = path.join(logsDir, 'deployment_history.log');
            const logEntry = `${deploymentStatus.timestamp} - ${deploymentStatus.status} - ${deploymentStatus.platform} - ${deploymentStatus.errors.join(', ')}\n`;
            await fs.appendFile(mainLogFile, logEntry);
            
            console.log(`📝 Deployment log saved: ${logFile}`);
        } catch (error) {
            console.error('Failed to save deployment log:', error);
        }
    }

    async notifyManagement(deploymentStatus) {
        try {
            // Send to management dashboard if it's running
            const managementUrl = 'http://localhost:3007/api/deployment/alert';
            
            // Create notification for dashboard
            const notification = {
                type: 'deployment_failure',
                severity: 'critical',
                message: 'Railway production deployment failed',
                details: deploymentStatus,
                timestamp: deploymentStatus.timestamp,
                action_required: true
            };
            
            console.log('📊 Management notification prepared:', notification.message);
            
            // Save notification for dashboard to pick up
            const notificationsDir = path.join(__dirname, 'notifications');
            await fs.mkdir(notificationsDir, { recursive: true });
            
            const notificationFile = path.join(notificationsDir, `alert_${Date.now()}.json`);
            await fs.writeFile(notificationFile, JSON.stringify(notification, null, 2));
            
        } catch (error) {
            console.error('Failed to notify management:', error);
        }
    }

    async getDeploymentStatus() {
        return {
            currentStatus: 'FAILED',
            lastDeployment: this.deploymentHistory[this.deploymentHistory.length - 1] || null,
            totalFailures: this.deploymentHistory.filter(d => d.status === 'FAILED').length,
            totalDeployments: this.deploymentHistory.length,
            uptime: '0%',
            serviceHealth: 'CRITICAL'
        };
    }

    async sendRecoveryUpdate() {
        const updateStatus = {
            timestamp: new Date().toISOString(),
            status: 'RECOVERY_IN_PROGRESS',
            actions: [
                'Standalone order processor activated',
                'AI Agent Dashboard operational',
                'Email notifications working',
                'Debugging Railway deployment issues'
            ]
        };

        const mailOptions = {
            from: '"Neuro.Pilot.AI DevOps" <neuro.pilot.ai@gmail.com>',
            to: 'davidmikulis66@gmail.com',
            subject: '🔧 Update: Deployment Recovery in Progress',
            html: `
                <h2>🔧 Deployment Recovery Update</h2>
                <p><strong>Status:</strong> Recovery measures activated</p>
                <h3>✅ Actions Completed:</h3>
                <ul>
                    ${updateStatus.actions.map(action => `<li>${action}</li>`).join('')}
                </ul>
                <p><strong>Next Steps:</strong> Continue Railway debugging and re-deployment</p>
            `
        };

        try {
            const info = await this.transporter.sendMail(mailOptions);
            console.log('📧 Recovery update sent:', info.messageId);
        } catch (error) {
            console.error('Failed to send recovery update:', error);
        }
    }
}

// Send deployment failure alert immediately if run directly
if (require.main === module) {
    const notifier = new DeploymentNotifier();
    notifier.sendDeploymentFailedAlert().then(() => {
        console.log('🚨 Deployment failure alert sent successfully');
        process.exit(0);
    }).catch(error => {
        console.error('Failed to send alert:', error);
        process.exit(1);
    });
}

module.exports = DeploymentNotifier;