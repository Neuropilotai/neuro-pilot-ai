require('dotenv').config();
const EmailOrderSystem = require('./email_order_system');
const PDFResumeGenerator = require('./pdf_resume_generator');
const fs = require('fs').promises;
const path = require('path');

class SimpleEmailAgent {
    constructor() {
        this.emailSystem = new EmailOrderSystem();
        this.pdfGenerator = new PDFResumeGenerator();
        this.isRunning = false;
        this.inboxDir = './email_inbox';
        this.processedDir = './email_processed';
    }

    async start() {
        console.log('📧 Simple Email Agent Starting...');
        console.log('👀 Monitoring: Neuro.Pilot.AI@gmail.com');
        console.log('🎯 Ready to process customer orders\n');

        // Create directories
        await fs.mkdir(this.inboxDir, { recursive: true });
        await fs.mkdir(this.processedDir, { recursive: true });

        this.isRunning = true;
        this.monitorOrders();
        
        // Show example of how to use
        this.showUsageExample();
    }

    async monitorOrders() {
        console.log('🔄 Order monitoring active...');
        
        setInterval(async () => {
            if (!this.isRunning) return;
            
            try {
                await this.checkForNewOrders();
                console.log(`[${new Date().toLocaleTimeString()}] ✅ Email agent monitoring...`);
            } catch (error) {
                console.error('Monitor error:', error.message);
            }
        }, 30000); // Check every 30 seconds
    }

    async checkForNewOrders() {
        try {
            // Check for manual order files in inbox
            const files = await fs.readdir(this.inboxDir);
            const orderFiles = files.filter(f => f.endsWith('.json'));
            
            for (const file of orderFiles) {
                const orderPath = path.join(this.inboxDir, file);
                const orderData = JSON.parse(await fs.readFile(orderPath, 'utf8'));
                
                console.log('\n📨 Processing email order...');
                await this.processEmailOrder(orderData);
                
                // Move to processed
                const processedPath = path.join(this.processedDir, file);
                await fs.rename(orderPath, processedPath);
            }
        } catch (error) {
            // No files to process, continue monitoring
        }
    }

    async processEmailOrder(orderData) {
        try {
            console.log(`👤 Customer: ${orderData.fullName}`);
            console.log(`📧 Email: ${orderData.email}`);
            console.log(`💼 Target Role: ${orderData.targetRole}`);
            console.log(`🏢 Industry: ${orderData.industry}`);
            
            // Check if CV file was uploaded
            if (orderData.cvFile) {
                console.log(`📎 Using uploaded CV: ${orderData.cvFile.originalName || orderData.cvFile.filename}`);
                orderData.hasUploadedCV = true;
            } else {
                console.log('📝 Creating resume from scratch');
                orderData.hasUploadedCV = false;
            }
            
            // Generate resume
            console.log('🤖 Generating AI resume...');
            const resumeResult = await this.pdfGenerator.generateProfessionalResume(orderData);
            
            if (resumeResult.success) {
                console.log('✅ Resume generated successfully!');
                
                // Send to customer
                console.log('📧 Sending resume to customer...');
                const emailResult = await this.emailSystem.sendCompletedResume(
                    orderData.email,
                    orderData.fullName,
                    resumeResult.filePath
                );
                
                if (emailResult.success) {
                    console.log('✅ Resume delivered via email!');
                    console.log(`📁 File: ${resumeResult.filename}`);
                    
                    // Log successful processing
                    await this.logProcessedOrder(orderData, resumeResult);
                } else {
                    console.log('❌ Email delivery failed');
                }
            } else {
                console.log('❌ Resume generation failed');
            }
            
        } catch (error) {
            console.error('❌ Order processing error:', error);
        }
    }

    async logProcessedOrder(orderData, resumeResult) {
        const log = {
            timestamp: new Date().toISOString(),
            customer: orderData.fullName,
            email: orderData.email,
            targetRole: orderData.targetRole,
            industry: orderData.industry,
            resumeFile: resumeResult.filename,
            status: 'completed'
        };
        
        const logPath = './processed_orders_log.json';
        let logs = [];
        
        try {
            const existingLogs = await fs.readFile(logPath, 'utf8');
            logs = JSON.parse(existingLogs);
        } catch (error) {
            // File doesn't exist, start fresh
        }
        
        logs.push(log);
        await fs.writeFile(logPath, JSON.stringify(logs, null, 2));
    }

    showUsageExample() {
        console.log('\n📋 HOW TO USE THE EMAIL AGENT:\n');
        console.log('1️⃣ When you receive a customer email with order details, create a JSON file:');
        console.log('\n   Example: ./email_inbox/customer_order.json');
        console.log('   {');
        console.log('     "fullName": "John Smith",');
        console.log('     "email": "john@example.com",');
        console.log('     "targetRole": "Software Engineer",');
        console.log('     "industry": "Technology",');
        console.log('     "experience": "5-7",');
        console.log('     "keywords": "JavaScript, React, Node.js",');
        console.log('     "package": "professional"');
        console.log('   }');
        console.log('\n2️⃣ The agent will automatically:');
        console.log('   • Detect the new order');
        console.log('   • Generate AI-optimized PDF resume');
        console.log('   • Email the resume to the customer');
        console.log('   • Log the completed order');
        console.log('\n3️⃣ Or use the quick processing method below ↓\n');
    }

    // Quick method to process an order directly
    async quickProcess(orderData) {
        console.log('\n⚡ QUICK PROCESSING ORDER...');
        
        const result = await this.processEmailOrder(orderData);
        
        console.log('\n✅ Quick processing completed!');
        return result;
    }

    stop() {
        this.isRunning = false;
        console.log('📧 Email Agent stopped');
    }
}

// Command line usage
if (require.main === module) {
    const agent = new SimpleEmailAgent();
    agent.start();
    
    // Example: Process a test order after 10 seconds
    setTimeout(async () => {
        console.log('\n🧪 PROCESSING TEST ORDER...');
        
        const testOrder = {
            fullName: 'David Test Customer',
            email: 'neuro.pilot.ai@gmail.com', // Send test to your email
            targetRole: 'Senior DevOps Engineer',
            industry: 'Technology',
            experience: '8-10',
            keywords: 'AWS, Docker, Kubernetes, CI/CD, Python, Terraform',
            package: 'executive',
            phone: '+1 (555) 123-4567'
        };
        
        await agent.quickProcess(testOrder);
        
    }, 10000);
}

module.exports = SimpleEmailAgent;