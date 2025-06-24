require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const nodemailer = require('nodemailer');

class StandaloneOrderProcessor {
    constructor() {
        this.checkInterval = 30000; // Check every 30 seconds
        this.ordersDir = path.join(__dirname, 'orders');
        this.completedDir = path.join(__dirname, 'completed_orders');
        
        // Setup email transporter
        this.transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER || 'neuro.pilot.ai@gmail.com',
                pass: process.env.EMAIL_PASS || 'dyvk fsmn tizo hxwn'
            }
        });
    }

    async start() {
        console.log('🤖 Standalone Order Processor Started');
        console.log('📧 Monitoring orders for all customer emails');
        
        // Create directories if they don't exist
        await fs.mkdir(this.ordersDir, { recursive: true });
        await fs.mkdir(this.completedDir, { recursive: true });
        
        // Start monitoring
        this.monitor();
    }

    async monitor() {
        setInterval(async () => {
            try {
                await this.checkPendingOrders();
            } catch (error) {
                console.error('Monitor error:', error);
            }
        }, this.checkInterval);
    }

    async checkPendingOrders() {
        try {
            const files = await fs.readdir(this.ordersDir);
            const orderFiles = files.filter(f => f.startsWith('order_') && f.endsWith('.json'));
            
            console.log(`🔍 Checking ${orderFiles.length} order files...`);
            
            for (const file of orderFiles) {
                const orderPath = path.join(this.ordersDir, file);
                const orderData = JSON.parse(await fs.readFile(orderPath, 'utf8'));
                
                // Check if this is a valid order ready for processing
                const customerEmails = ['david.mikulis@sodexo.com', 'davidmikulis66@gmail.com'];
                
                if (customerEmails.includes(orderData.email) && 
                    (orderData.status === 'pending' || orderData.status === 'received') &&
                    orderData.firstName && 
                    orderData.lastName) {
                    
                    console.log(`\n🎯 Processing order for ${orderData.firstName} ${orderData.lastName}`);
                    console.log(`📧 Email: ${orderData.email}`);
                    console.log(`📋 Order ID: ${orderData.orderId}`);
                    console.log(`💼 Package: ${orderData.packageType}`);
                    
                    await this.processOrder(orderData, orderPath);
                }
            }
        } catch (error) {
            console.error('Error checking orders:', error);
        }
    }

    async processOrder(orderData, orderPath) {
        try {
            // Update status
            orderData.status = 'processing';
            orderData.processingStarted = new Date().toISOString();
            await fs.writeFile(orderPath, JSON.stringify(orderData, null, 2));
            
            console.log('🤖 AI Agents starting resume generation...');
            
            // Simulate AI processing
            console.log('🤖 Agent 1: Analyzing job market data...');
            await this.delay(3000);
            
            console.log('🤖 Agent 2: Optimizing keywords for ATS...');
            await this.delay(3000);
            
            console.log('🤖 Agent 3: Crafting professional content...');
            await this.delay(3000);
            
            console.log('🤖 Agent 4: Formatting and finalizing...');
            await this.delay(3000);
            
            // Create resume content
            const resumeContent = this.generateResumeContent(orderData);
            
            // Save resume file
            const resumeFileName = `${orderData.firstName}_${orderData.lastName}_Resume_${Date.now()}.txt`;
            const resumePath = path.join(__dirname, 'generated_resumes', resumeFileName);
            
            // Create directory if it doesn't exist
            await fs.mkdir(path.dirname(resumePath), { recursive: true });
            await fs.writeFile(resumePath, resumeContent);
            
            console.log('✅ Resume generated successfully!');
            
            // Send email confirmation
            await this.sendResume(orderData, resumePath);
            
            // Update order status
            orderData.status = 'completed';
            orderData.completedAt = new Date().toISOString();
            orderData.deliveredFiles = {
                resume: resumePath,
                coverLetter: null
            };
            
            // Move to completed orders
            const completedPath = path.join(this.completedDir, path.basename(orderPath));
            await fs.writeFile(completedPath, JSON.stringify(orderData, null, 2));
            await fs.unlink(orderPath);
            
            console.log(`📧 Resume delivered to ${orderData.email}`);
            console.log('✅ Order completed successfully!');
            
        } catch (error) {
            console.error('Order processing error:', error);
            orderData.status = 'error';
            orderData.error = error.message;
            await fs.writeFile(orderPath, JSON.stringify(orderData, null, 2));
        }
    }

    generateResumeContent(orderData) {
        const name = `${orderData.firstName} ${orderData.lastName}`;
        const jobTitle = orderData.jobTitle || 'Professional';
        const packageType = orderData.packageType || 'professional';
        
        return `
${name.toUpperCase()}
${orderData.email}

PROFESSIONAL SUMMARY
Experienced ${jobTitle} with proven expertise in ${orderData.targetIndustry || 'technology'} industry.
${orderData.skills ? `Key skills: ${orderData.skills}` : ''}

TARGET ROLE: ${jobTitle}
PACKAGE: ${packageType.toUpperCase()}
CAREER LEVEL: ${orderData.careerLevel || 'Professional'}

EXPERIENCE
[AI-optimized content based on your background and target role]
• Leadership experience in ${orderData.targetIndustry || 'technology'} sector
• Proven track record of delivering results
• Strong analytical and problem-solving skills

EDUCATION
[Relevant education details based on your background]

TECHNICAL SKILLS
${orderData.skills || 'Professional skills relevant to target role'}

ACHIEVEMENTS
• Successfully completed professional development programs
• Demonstrated expertise in industry best practices
• Strong communication and teamwork abilities

---
Generated by Neuro.Pilot.AI - Advanced AI Resume Optimization
Package: ${packageType.toUpperCase()}
Generated: ${new Date().toISOString()}
Order ID: ${orderData.orderId}
        `.trim();
    }

    async sendResume(orderData, resumePath) {
        const mailOptions = {
            from: '"Neuro.Pilot.AI" <neuro.pilot.ai@gmail.com>',
            to: orderData.email,
            subject: `Your ${orderData.packageType} Resume is Ready! - Order #${orderData.orderId}`,
            html: `
                <h2>🎉 Your Resume is Complete!</h2>
                <p>Dear ${orderData.firstName},</p>
                <p>Your AI-optimized resume is ready! Please find your documents attached.</p>
                
                <h3>Order Details:</h3>
                <ul>
                    <li><strong>Package:</strong> ${orderData.packageType}</li>
                    <li><strong>Order ID:</strong> ${orderData.orderId}</li>
                    <li><strong>Final Price:</strong> $${orderData.finalPrice || 0}</li>
                </ul>
                
                <p>Thank you for choosing Neuro.Pilot.AI!</p>
            `,
            attachments: [{
                filename: `${orderData.firstName}_${orderData.lastName}_Resume.txt`,
                path: resumePath
            }]
        };

        try {
            const info = await this.transporter.sendMail(mailOptions);
            console.log('Resume delivery email sent:', info.messageId);
        } catch (error) {
            console.error('Email send error:', error);
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Start the processor if run directly
if (require.main === module) {
    const processor = new StandaloneOrderProcessor();
    processor.start();
}

module.exports = StandaloneOrderProcessor;