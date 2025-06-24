#!/usr/bin/env node

/**
 * Automated Resume Workflow for Neuro-Pilot-AI
 * Orchestrates the complete resume generation process
 */

const NotionAgentIntegration = require('./notion-agent-integration');
const StripePaymentIntegration = require('./stripe-payment-integration');
const express = require('express');
const path = require('path');
require('dotenv').config();

class AutomatedResumeWorkflow {
    constructor() {
        this.app = express();
        this.notionAgent = new NotionAgentIntegration();
        this.stripeIntegration = new StripePaymentIntegration();
        
        this.setupMiddleware();
        this.setupRoutes();
        this.startAutomatedProcessing();
    }

    setupMiddleware() {
        this.app.use(express.json());
        this.app.use(express.static('public'));
        this.app.use('/api', this.stripeIntegration.app);
    }

    setupRoutes() {
        // Landing page for resume service
        this.app.get('/', (req, res) => {
            res.send(this.generateLandingPage());
        });

        // Order form page
        this.app.get('/order', (req, res) => {
            res.send(this.generateOrderForm());
        });

        // Process order submission
        this.app.post('/submit-order', async (req, res) => {
            try {
                const orderData = req.body;
                const result = await this.processOrderSubmission(orderData);
                res.json(result);
            } catch (error) {
                console.error('Error processing order submission:', error);
                res.status(500).json({ error: 'Failed to process order' });
            }
        });

        // Check order status
        this.app.get('/status/:orderId', async (req, res) => {
            try {
                const { orderId } = req.params;
                const status = await this.notionAgent.notion.databases.query({
                    database_id: this.notionAgent.resumeDatabaseId,
                    filter: {
                        property: 'Order ID',
                        title: {
                            equals: orderId,
                        },
                    },
                });

                if (status.results.length > 0) {
                    const order = status.results[0];
                    const orderStatus = {
                        orderId: orderId,
                        status: order.properties['Status'].select?.name,
                        paymentStatus: order.properties['Payment Status'].select?.name,
                        serviceType: order.properties['Service Type'].select?.name,
                        resumeReady: order.properties['Status'].select?.name === 'Completed',
                        downloadUrl: order.properties['Status'].select?.name === 'Completed' 
                            ? `/download/${orderId}` : null,
                    };
                    res.json(orderStatus);
                } else {
                    res.status(404).json({ error: 'Order not found' });
                }
            } catch (error) {
                console.error('Error checking order status:', error);
                res.status(500).json({ error: 'Failed to check order status' });
            }
        });

        // Download resume
        this.app.get('/download/:orderId', async (req, res) => {
            try {
                const { orderId } = req.params;
                const response = await this.notionAgent.notion.databases.query({
                    database_id: this.notionAgent.resumeDatabaseId,
                    filter: {
                        property: 'Order ID',
                        title: {
                            equals: orderId,
                        },
                    },
                });

                if (response.results.length > 0) {
                    const order = response.results[0];
                    const resumeContent = order.properties['Resume Content'].rich_text[0]?.text?.content;
                    
                    if (resumeContent && order.properties['Status'].select?.name === 'Completed') {
                        res.setHeader('Content-Type', 'text/markdown');
                        res.setHeader('Content-Disposition', `attachment; filename="resume-${orderId}.md"`);
                        res.send(resumeContent);
                        
                        // Mark as delivered
                        await this.notionAgent.updateOrderStatus(orderId, 'Delivered');
                    } else {
                        res.status(404).json({ error: 'Resume not ready yet' });
                    }
                } else {
                    res.status(404).json({ error: 'Order not found' });
                }
            } catch (error) {
                console.error('Error downloading resume:', error);
                res.status(500).json({ error: 'Failed to download resume' });
            }
        });

        // Health check
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                services: {
                    notion: !!process.env.NOTION_TOKEN,
                    openai: !!process.env.OPENAI_API_KEY,
                    stripe: !!process.env.STRIPE_SECRET_KEY,
                },
            });
        });
    }

    async processOrderSubmission(orderData) {
        const orderId = `order_${Date.now()}`;
        
        // Create order in Notion
        const orderRecord = {
            orderId: orderId,
            customerEmail: orderData.email,
            serviceType: orderData.serviceType,
            paymentStatus: 'Pending',
            amount: this.getServicePrice(orderData.serviceType),
            customerInfo: {
                name: orderData.name,
                email: orderData.email,
                phone: orderData.phone,
                industry: orderData.industry,
                experienceLevel: orderData.experienceLevel,
                currentRole: orderData.currentRole,
                targetRole: orderData.targetRole,
                keySkills: orderData.keySkills,
                achievements: orderData.achievements,
                education: orderData.education,
                certifications: orderData.certifications,
                additionalInfo: orderData.additionalInfo,
            },
        };

        await this.notionAgent.createResumeOrder(orderRecord);
        
        return {
            success: true,
            orderId: orderId,
            message: 'Order created successfully. Please proceed to payment.',
            paymentUrl: `/payment/${orderId}`,
        };
    }

    getServicePrice(serviceType) {
        const prices = {
            'Professional Resume': 49,
            'Executive Resume': 99,
            'ATS Optimized': 69,
            'Cover Letter': 29,
        };
        return prices[serviceType] || 49;
    }

    async startAutomatedProcessing() {
        console.log('🤖 Starting automated resume processing workflow...');
        
        // Process pending orders every 30 seconds
        setInterval(async () => {
            try {
                const pendingOrders = await this.notionAgent.getPendingOrders();
                
                for (const order of pendingOrders) {
                    console.log(`🔄 Processing order: ${order.orderId}`);
                    await this.notionAgent.processResumeOrder(order.orderId);
                    
                    // Send completion notification
                    await this.sendCompletionNotification(order);
                    
                    // Add delay between orders
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }
            } catch (error) {
                console.error('❌ Error in automated processing:', error);
            }
        }, 30000);
    }

    async sendCompletionNotification(order) {
        console.log(`📧 Sending completion notification to: ${order.customerEmail}`);
        console.log(`Resume ready for download: /download/${order.orderId}`);
        
        // TODO: Implement actual email notification
        // This would integrate with your email service (SendGrid, AWS SES, etc.)
    }

    generateLandingPage() {
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Neuro-Pilot-AI | Professional Resume Services</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 1200px; margin: 0 auto; padding: 0 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-align: center; padding: 80px 0; }
        .header h1 { font-size: 3em; margin-bottom: 20px; }
        .header p { font-size: 1.2em; margin-bottom: 30px; }
        .cta-button { display: inline-block; background: #ff6b6b; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 1.1em; transition: background 0.3s; }
        .cta-button:hover { background: #ff5252; }
        .services { padding: 80px 0; background: #f8f9fa; }
        .services h2 { text-align: center; font-size: 2.5em; margin-bottom: 50px; }
        .service-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 30px; }
        .service-card { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 5px 15px rgba(0,0,0,0.1); text-align: center; }
        .service-card h3 { font-size: 1.5em; margin-bottom: 15px; color: #667eea; }
        .service-card .price { font-size: 2em; font-weight: bold; color: #ff6b6b; margin: 20px 0; }
        .features { padding: 80px 0; }
        .features h2 { text-align: center; font-size: 2.5em; margin-bottom: 50px; }
        .feature-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 30px; }
        .feature { text-align: center; padding: 20px; }
        .feature h3 { font-size: 1.3em; margin-bottom: 15px; color: #667eea; }
        .footer { background: #333; color: white; text-align: center; padding: 40px 0; }
    </style>
</head>
<body>
    <header class="header">
        <div class="container">
            <h1>Neuro-Pilot-AI</h1>
            <p>AI-Powered Professional Resume Services</p>
            <p>Get your ATS-optimized resume in under 30 minutes</p>
            <a href="/order" class="cta-button">Order Your Resume Now</a>
        </div>
    </header>

    <section class="services">
        <div class="container">
            <h2>Our Services</h2>
            <div class="service-grid">
                <div class="service-card">
                    <h3>Professional Resume</h3>
                    <div class="price">$49</div>
                    <p>ATS-optimized professional resume tailored to your industry with AI-powered content generation.</p>
                </div>
                <div class="service-card">
                    <h3>Executive Resume</h3>
                    <div class="price">$99</div>
                    <p>Premium executive resume with cover letter and LinkedIn optimization for senior-level positions.</p>
                </div>
                <div class="service-card">
                    <h3>ATS Optimized</h3>
                    <div class="price">$69</div>
                    <p>Resume specifically optimized for Applicant Tracking Systems with keyword optimization.</p>
                </div>
                <div class="service-card">
                    <h3>Cover Letter</h3>
                    <div class="price">$29</div>
                    <p>Professional cover letter tailored to your target role and company.</p>
                </div>
            </div>
        </div>
    </section>

    <section class="features">
        <div class="container">
            <h2>Why Choose Neuro-Pilot-AI?</h2>
            <div class="feature-grid">
                <div class="feature">
                    <h3>🤖 AI-Powered</h3>
                    <p>Advanced AI algorithms create personalized, professional resumes</p>
                </div>
                <div class="feature">
                    <h3>⚡ Fast Delivery</h3>
                    <p>Get your completed resume in under 30 minutes</p>
                </div>
                <div class="feature">
                    <h3>🎯 ATS Optimized</h3>
                    <p>All resumes are optimized for Applicant Tracking Systems</p>
                </div>
                <div class="feature">
                    <h3>💼 Industry Specific</h3>
                    <p>Tailored content for your specific industry and role</p>
                </div>
                <div class="feature">
                    <h3>📈 Proven Results</h3>
                    <p>Higher interview rates with our optimized resumes</p>
                </div>
                <div class="feature">
                    <h3>💯 Satisfaction Guaranteed</h3>
                    <p>Full refund if you're not completely satisfied</p>
                </div>
            </div>
        </div>
    </section>

    <footer class="footer">
        <div class="container">
            <p>&copy; 2024 Neuro-Pilot-AI. All rights reserved.</p>
            <p>Automated Resume Generation Service</p>
        </div>
    </footer>
</body>
</html>
        `;
    }

    generateOrderForm() {
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Order Your Resume | Neuro-Pilot-AI</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; background: #f8f9fa; }
        .container { max-width: 800px; margin: 0 auto; padding: 40px 20px; }
        .form-container { background: white; padding: 40px; border-radius: 10px; box-shadow: 0 5px 15px rgba(0,0,0,0.1); }
        h1 { text-align: center; color: #667eea; margin-bottom: 30px; }
        .form-group { margin-bottom: 20px; }
        label { display: block; margin-bottom: 5px; font-weight: bold; color: #555; }
        input, select, textarea { width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 5px; font-size: 16px; }
        textarea { height: 100px; resize: vertical; }
        .submit-btn { background: #667eea; color: white; padding: 15px 30px; border: none; border-radius: 5px; font-size: 18px; font-weight: bold; cursor: pointer; width: 100%; transition: background 0.3s; }
        .submit-btn:hover { background: #5a6fd8; }
        .price-display { background: #e8f4f8; padding: 20px; border-radius: 5px; margin: 20px 0; text-align: center; }
        .price { font-size: 2em; font-weight: bold; color: #667eea; }
    </style>
</head>
<body>
    <div class="container">
        <div class="form-container">
            <h1>Order Your Professional Resume</h1>
            <form id="orderForm">
                <div class="form-group">
                    <label for="serviceType">Service Type:</label>
                    <select id="serviceType" name="serviceType" required>
                        <option value="">Select a service</option>
                        <option value="Professional Resume">Professional Resume - $49</option>
                        <option value="Executive Resume">Executive Resume - $99</option>
                        <option value="ATS Optimized">ATS Optimized Resume - $69</option>
                        <option value="Cover Letter">Cover Letter - $29</option>
                    </select>
                </div>

                <div class="price-display" id="priceDisplay" style="display: none;">
                    <div class="price" id="priceAmount">$0</div>
                </div>

                <div class="form-group">
                    <label for="name">Full Name:</label>
                    <input type="text" id="name" name="name" required>
                </div>

                <div class="form-group">
                    <label for="email">Email Address:</label>
                    <input type="email" id="email" name="email" required>
                </div>

                <div class="form-group">
                    <label for="phone">Phone Number:</label>
                    <input type="tel" id="phone" name="phone">
                </div>

                <div class="form-group">
                    <label for="industry">Industry:</label>
                    <select id="industry" name="industry" required>
                        <option value="">Select your industry</option>
                        <option value="Technology">Technology</option>
                        <option value="Healthcare">Healthcare</option>
                        <option value="Finance">Finance</option>
                        <option value="Marketing">Marketing</option>
                        <option value="Education">Education</option>
                        <option value="General">Other</option>
                    </select>
                </div>

                <div class="form-group">
                    <label for="experienceLevel">Experience Level:</label>
                    <select id="experienceLevel" name="experienceLevel" required>
                        <option value="">Select experience level</option>
                        <option value="Entry Level">Entry Level (0-2 years)</option>
                        <option value="Mid Level">Mid Level (3-7 years)</option>
                        <option value="Senior Level">Senior Level (8-15 years)</option>
                        <option value="Executive">Executive (15+ years)</option>
                    </select>
                </div>

                <div class="form-group">
                    <label for="currentRole">Current/Recent Role:</label>
                    <input type="text" id="currentRole" name="currentRole" placeholder="e.g., Software Engineer, Marketing Manager">
                </div>

                <div class="form-group">
                    <label for="targetRole">Target Role:</label>
                    <input type="text" id="targetRole" name="targetRole" placeholder="e.g., Senior Software Engineer, Director of Marketing">
                </div>

                <div class="form-group">
                    <label for="keySkills">Key Skills (comma-separated):</label>
                    <textarea id="keySkills" name="keySkills" placeholder="e.g., JavaScript, React, Project Management, Team Leadership"></textarea>
                </div>

                <div class="form-group">
                    <label for="achievements">Key Achievements:</label>
                    <textarea id="achievements" name="achievements" placeholder="List your top 3-5 professional achievements with quantifiable results"></textarea>
                </div>

                <div class="form-group">
                    <label for="education">Education:</label>
                    <textarea id="education" name="education" placeholder="Degree, Institution, Year, GPA (if relevant)"></textarea>
                </div>

                <div class="form-group">
                    <label for="certifications">Certifications:</label>
                    <textarea id="certifications" name="certifications" placeholder="List relevant certifications and dates"></textarea>
                </div>

                <div class="form-group">
                    <label for="additionalInfo">Additional Information:</label>
                    <textarea id="additionalInfo" name="additionalInfo" placeholder="Any additional information you'd like to include"></textarea>
                </div>

                <button type="submit" class="submit-btn">Order Now</button>
            </form>
        </div>
    </div>

    <script>
        const serviceSelect = document.getElementById('serviceType');
        const priceDisplay = document.getElementById('priceDisplay');
        const priceAmount = document.getElementById('priceAmount');
        const orderForm = document.getElementById('orderForm');

        const prices = {
            'Professional Resume': 49,
            'Executive Resume': 99,
            'ATS Optimized': 69,
            'Cover Letter': 29
        };

        serviceSelect.addEventListener('change', function() {
            const selectedService = this.value;
            if (selectedService && prices[selectedService]) {
                priceAmount.textContent = '$' + prices[selectedService];
                priceDisplay.style.display = 'block';
            } else {
                priceDisplay.style.display = 'none';
            }
        });

        orderForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const formData = new FormData(this);
            const orderData = Object.fromEntries(formData.entries());
            
            try {
                const response = await fetch('/submit-order', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(orderData)
                });
                
                const result = await response.json();
                
                if (result.success) {
                    alert('Order submitted successfully! Order ID: ' + result.orderId);
                    window.location.href = '/status/' + result.orderId;
                } else {
                    alert('Error: ' + result.message);
                }
            } catch (error) {
                alert('Error submitting order. Please try again.');
                console.error('Error:', error);
            }
        });
    </script>
</body>
</html>
        `;
    }

    start(port = 3001) {
        this.app.listen(port, () => {
            console.log(`🚀 Automated Resume Workflow running on port ${port}`);
            console.log(`🌐 Access the service at: http://localhost:${port}`);
            console.log(`📋 Order form: http://localhost:${port}/order`);
            console.log(`💚 Health check: http://localhost:${port}/health`);
        });
    }
}

// Export for use in other modules
module.exports = AutomatedResumeWorkflow;

// Run workflow if called directly
if (require.main === module) {
    const workflow = new AutomatedResumeWorkflow();
    workflow.start();
}