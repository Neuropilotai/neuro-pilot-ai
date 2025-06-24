require('dotenv').config();
const axios = require('axios');

class QuantumRailwayHealer {
    constructor() {
        this.name = "QUANTUM-RAILWAY-AUTO-HEALER";
        this.version = "1.0.0";
        this.railwayUrl = "https://resourceful-achievement-production.up.railway.app";
    }

    async healRailwayDeployment() {
        console.log('🤖 QUANTUM RAILWAY AUTO-HEALING INITIATED');
        console.log(`🎯 Target: ${this.railwayUrl}`);
        
        // Step 1: Diagnose current state
        const healthCheck = await this.checkDeploymentHealth();
        
        // Step 2: Create environment configuration recommendations
        const envFixes = this.generateEnvironmentFixes(healthCheck);
        
        // Step 3: Create updated Railway deployment with email functionality
        const emailEndpoint = await this.createEmailEndpoint();
        
        // Step 4: Generate deployment instructions
        this.generateDeploymentInstructions(envFixes, emailEndpoint);
        
        return {
            healthCheck,
            envFixes,
            emailEndpoint,
            status: 'quantum_healing_complete'
        };
    }

    async checkDeploymentHealth() {
        console.log('\n🔍 DIAGNOSING DEPLOYMENT HEALTH...');
        
        try {
            const response = await axios.get(`${this.railwayUrl}/api/health`);
            const health = response.data;
            
            console.log('✅ Health check successful:');
            console.log(`   📊 Status: ${health.status}`);
            console.log(`   📧 Email System: ${health.features.emailSystem ? '✅ ENABLED' : '❌ DISABLED'}`);
            console.log(`   💳 Stripe: ${health.features.stripe ? '✅ ENABLED' : '❌ DISABLED'}`);
            console.log(`   🤖 AI Agents: ${health.features.aiAgents ? '✅ ENABLED' : '❌ DISABLED'}`);
            console.log(`   📦 Order Processing: ${health.features.orderProcessing ? '✅ ENABLED' : '❌ DISABLED'}`);
            
            return health;
        } catch (error) {
            console.log(`❌ Health check failed: ${error.message}`);
            return null;
        }
    }

    generateEnvironmentFixes(healthCheck) {
        console.log('\n🔧 GENERATING ENVIRONMENT FIXES...');
        
        const fixes = {
            required: [],
            optional: [],
            instructions: []
        };

        if (!healthCheck?.features.emailSystem) {
            fixes.required.push({
                variable: 'EMAIL_USER',
                value: process.env.EMAIL_USER || 'Neuro.Pilot.AI@gmail.com',
                description: 'Gmail account for sending order confirmations'
            });
            
            fixes.required.push({
                variable: 'EMAIL_PASS',
                value: '[APP_PASSWORD_REQUIRED]',
                description: 'Gmail app password (not regular password)'
            });
            
            fixes.instructions.push('Generate Gmail App Password at https://myaccount.google.com/apppasswords');
            fixes.instructions.push('Set EMAIL_USER and EMAIL_PASS in Railway environment variables');
        }

        if (!healthCheck?.features.stripe) {
            fixes.optional.push({
                variable: 'STRIPE_SECRET_KEY',
                value: '[STRIPE_SECRET_KEY_REQUIRED]',
                description: 'Stripe secret key for payment processing'
            });
        }

        console.log(`🔧 Generated ${fixes.required.length} required fixes`);
        console.log(`🔧 Generated ${fixes.optional.length} optional fixes`);
        
        return fixes;
    }

    async createEmailEndpoint() {
        console.log('\n📧 CREATING EMAIL ENDPOINT ENHANCEMENT...');
        
        const emailEndpointCode = `
// Quantum Email API Endpoint
app.post('/api/send-email', async (req, res) => {
    try {
        if (!emailSystem) {
            return res.status(503).json({
                success: false,
                error: 'Email system not configured',
                quantum_status: 'email_system_disabled'
            });
        }

        const { email, subject, message, orderData } = req.body;
        
        if (!email) {
            return res.status(400).json({
                success: false,
                error: 'Email address required'
            });
        }

        // Quantum email template
        const mailOptions = {
            from: {
                name: 'Neuro.Pilot.AI',
                address: process.env.EMAIL_USER
            },
            to: email,
            subject: subject || 'Order Confirmation - Neuro.Pilot.AI',
            html: \`
                <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 10px;">
                    <h1 style="text-align: center; margin-bottom: 30px;">🤖 Neuro.Pilot.AI</h1>
                    <h2>Order Confirmation</h2>
                    
                    \${orderData ? \`
                        <div style="background: rgba(255,255,255,0.1); padding: 20px; border-radius: 8px; margin: 20px 0;">
                            <p><strong>Order ID:</strong> \${orderData.orderId}</p>
                            <p><strong>Package:</strong> \${orderData.packageType}</p>
                            <p><strong>Customer:</strong> \${orderData.firstName} \${orderData.lastName}</p>
                            <p><strong>Email:</strong> \${orderData.email}</p>
                            <p><strong>Status:</strong> Processing with AI</p>
                        </div>
                    \` : ''}
                    
                    <div style="background: rgba(255,255,255,0.1); padding: 20px; border-radius: 8px; margin: 20px 0;">
                        \${message || 'Your order is being processed by our AI agents. You will receive your completed resume within 30 minutes.'}
                    </div>
                    
                    <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.3);">
                        <p>✨ AI-Powered • 🚀 Quantum Enhanced • 📧 Instant Delivery</p>
                        <p><small>Powered by Ultra Quantum Agents</small></p>
                    </div>
                </div>
            \`
        };

        const info = await emailSystem.sendMail(mailOptions);
        
        res.json({
            success: true,
            messageId: info.messageId,
            quantum_status: 'email_sent',
            timestamp: new Date().toISOString()
        });
        
        console.log(\`📧 Quantum email sent to \${email}: \${info.messageId}\`);
        
    } catch (error) {
        console.error('Quantum email error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            quantum_status: 'email_failed'
        });
    }
});

// Test email endpoint
app.post('/api/test-email', async (req, res) => {
    try {
        if (!emailSystem) {
            return res.status(503).json({
                success: false,
                error: 'Email system not configured'
            });
        }

        // Send test email
        const testEmail = {
            email: 'test@quantum-diagnostic.ai',
            subject: 'Quantum Email Test',
            message: 'This is a test email from the Quantum Email System. If you receive this, the email functionality is working!'
        };

        const result = await fetch(\`\${req.protocol}://\${req.get('host')}/api/send-email\`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(testEmail)
        });

        const data = await result.json();
        
        res.json({
            success: true,
            test_result: data,
            quantum_status: 'test_complete'
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            quantum_status: 'test_failed'
        });
    }
});
`;

        console.log('📧 Email endpoint enhancement created');
        console.log('🎯 Features added: /api/send-email and /api/test-email');
        
        return {
            code: emailEndpointCode,
            endpoints: [
                'POST /api/send-email - Send order confirmation emails',
                'POST /api/test-email - Test email functionality'
            ]
        };
    }

    generateDeploymentInstructions(envFixes, emailEndpoint) {
        console.log('\n🚀 ═══════════════════════════════════════════');
        console.log('🤖 QUANTUM RAILWAY HEALING INSTRUCTIONS');
        console.log('🚀 ═══════════════════════════════════════════');
        
        console.log('\n📋 STEP 1: Environment Variables Configuration');
        console.log('Go to Railway Dashboard → Your Project → Variables');
        
        if (envFixes.required.length > 0) {
            console.log('\n🔧 REQUIRED VARIABLES:');
            envFixes.required.forEach(fix => {
                console.log(`   ${fix.variable} = ${fix.value}`);
                console.log(`      📝 ${fix.description}`);
            });
        }
        
        if (envFixes.optional.length > 0) {
            console.log('\n⚡ OPTIONAL VARIABLES:');
            envFixes.optional.forEach(fix => {
                console.log(`   ${fix.variable} = ${fix.value}`);
                console.log(`      📝 ${fix.description}`);
            });
        }

        if (envFixes.instructions.length > 0) {
            console.log('\n📝 SETUP INSTRUCTIONS:');
            envFixes.instructions.forEach((instruction, index) => {
                console.log(`   ${index + 1}. ${instruction}`);
            });
        }

        console.log('\n📋 STEP 2: Code Enhancement (OPTIONAL)');
        console.log('Add these email endpoints to railway-server-full.js:');
        console.log('🎯 New endpoints will be available:');
        emailEndpoint.endpoints.forEach(endpoint => {
            console.log(`   • ${endpoint}`);
        });

        console.log('\n📋 STEP 3: Test Email Functionality');
        console.log('After setting environment variables:');
        console.log('1. Railway will auto-deploy the changes');
        console.log('2. Test health endpoint: /api/health');
        console.log('3. Place a test order to verify email delivery');
        console.log('4. Check email system status in health response');

        console.log('\n🔬 STEP 4: Quantum Verification');
        console.log('Run these commands to verify the healing:');
        console.log('   curl https://resourceful-achievement-production.up.railway.app/api/health');
        console.log('   # Email system should show "true"');

        console.log('\n🚀 ═══════════════════════════════════════════');
        console.log('✅ QUANTUM HEALING INSTRUCTIONS COMPLETE');
        console.log('🚀 ═══════════════════════════════════════════\n');
    }

    async autoFixEnvironment() {
        console.log('\n🤖 ATTEMPTING AUTO-FIX...');
        
        // Check if we have the necessary credentials locally
        const localEmailUser = process.env.EMAIL_USER;
        const localEmailPass = process.env.EMAIL_PASS;
        
        if (localEmailUser && localEmailPass) {
            console.log('✅ Local email credentials found');
            console.log(`📧 EMAIL_USER: ${localEmailUser}`);
            console.log('🔐 EMAIL_PASS: Configured');
            
            console.log('\n🚨 QUANTUM RECOMMENDATION:');
            console.log('Set these exact values in Railway environment variables:');
            console.log(`   EMAIL_USER=${localEmailUser}`);
            console.log('   EMAIL_PASS=[YOUR_GMAIL_APP_PASSWORD]');
            
            return true;
        } else {
            console.log('❌ Local email credentials not found');
            console.log('🔧 Manual configuration required');
            return false;
        }
    }
}

// Run auto-healing if called directly
if (require.main === module) {
    const healer = new QuantumRailwayHealer();
    healer.healRailwayDeployment()
        .then(result => {
            console.log('\n🎉 Quantum healing analysis complete!');
            return healer.autoFixEnvironment();
        })
        .catch(error => {
            console.error('❌ Quantum healing failed:', error);
        });
}

module.exports = QuantumRailwayHealer;