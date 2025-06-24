#!/usr/bin/env node

/**
 * Stripe Payment Integration for Neuro-Pilot-AI Resume Service
 * Handles automated payment processing and webhook management
 */

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const express = require('express');
const NotionAgentIntegration = require('./notion-agent-integration');
require('dotenv').config();

class StripePaymentIntegration {
    constructor() {
        this.app = express();
        this.notionAgent = new NotionAgentIntegration();
        this.webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
        
        this.setupMiddleware();
        this.setupRoutes();
        this.setupProducts();
    }

    setupMiddleware() {
        // Raw body for webhook verification
        this.app.use('/webhook', express.raw({ type: 'application/json' }));
        // JSON parsing for other routes
        this.app.use(express.json());
        this.app.use(express.static('public'));
    }

    async setupProducts() {
        this.products = {
            'professional-resume': {
                name: 'Professional Resume',
                price: 4900, // $49.00
                description: 'ATS-optimized professional resume tailored to your industry',
            },
            'executive-resume': {
                name: 'Executive Resume',
                price: 9900, // $99.00
                description: 'Premium executive resume with cover letter and LinkedIn optimization',
            },
            'ats-resume': {
                name: 'ATS Optimized Resume',
                price: 6900, // $69.00
                description: 'Resume specifically optimized for Applicant Tracking Systems',
            },
            'cover-letter': {
                name: 'Cover Letter',
                price: 2900, // $29.00
                description: 'Professional cover letter tailored to your target role',
            },
        };
    }

    setupRoutes() {
        // Create payment intent
        this.app.post('/create-payment-intent', async (req, res) => {
            try {
                const { serviceType, customerInfo } = req.body;
                
                if (!this.products[serviceType]) {
                    return res.status(400).json({ error: 'Invalid service type' });
                }

                const product = this.products[serviceType];
                
                const paymentIntent = await stripe.paymentIntents.create({
                    amount: product.price,
                    currency: 'usd',
                    metadata: {
                        serviceType: serviceType,
                        customerEmail: customerInfo.email,
                        customerName: customerInfo.name,
                        orderId: `order_${Date.now()}`,
                    },
                });

                res.json({
                    clientSecret: paymentIntent.client_secret,
                    orderId: paymentIntent.metadata.orderId,
                });
            } catch (error) {
                console.error('Error creating payment intent:', error);
                res.status(500).json({ error: 'Failed to create payment intent' });
            }
        });

        // Get product prices
        this.app.get('/products', (req, res) => {
            res.json(this.products);
        });

        // Stripe webhook handler
        this.app.post('/webhook', async (req, res) => {
            const sig = req.headers['stripe-signature'];
            let event;

            try {
                event = stripe.webhooks.constructEvent(req.body, sig, this.webhookSecret);
            } catch (err) {
                console.error('Webhook signature verification failed:', err.message);
                return res.status(400).send(`Webhook Error: ${err.message}`);
            }

            await this.handleWebhookEvent(event);
            res.json({ received: true });
        });

        // Order status endpoint
        this.app.get('/order-status/:orderId', async (req, res) => {
            try {
                const { orderId } = req.params;
                const status = await this.getOrderStatus(orderId);
                res.json({ orderId, status });
            } catch (error) {
                console.error('Error getting order status:', error);
                res.status(500).json({ error: 'Failed to get order status' });
            }
        });

        // Resume download endpoint
        this.app.get('/download-resume/:orderId', async (req, res) => {
            try {
                const { orderId } = req.params;
                const resumeContent = await this.getResumeContent(orderId);
                
                if (!resumeContent) {
                    return res.status(404).json({ error: 'Resume not ready yet' });
                }

                res.setHeader('Content-Type', 'application/octet-stream');
                res.setHeader('Content-Disposition', `attachment; filename="resume-${orderId}.md"`);
                res.send(resumeContent);
            } catch (error) {
                console.error('Error downloading resume:', error);
                res.status(500).json({ error: 'Failed to download resume' });
            }
        });
    }

    async handleWebhookEvent(event) {
        console.log(`🔔 Received webhook: ${event.type}`);

        switch (event.type) {
            case 'payment_intent.succeeded':
                await this.handlePaymentSuccess(event.data.object);
                break;
            case 'payment_intent.payment_failed':
                await this.handlePaymentFailed(event.data.object);
                break;
            default:
                console.log(`Unhandled event type: ${event.type}`);
        }
    }

    async handlePaymentSuccess(paymentIntent) {
        try {
            const { metadata } = paymentIntent;
            const orderData = {
                orderId: metadata.orderId,
                customerEmail: metadata.customerEmail,
                serviceType: this.products[metadata.serviceType]?.name || metadata.serviceType,
                paymentStatus: 'Paid',
                amount: paymentIntent.amount / 100, // Convert from cents
                customerInfo: {
                    name: metadata.customerName,
                    email: metadata.customerEmail,
                    serviceType: metadata.serviceType,
                },
            };

            // Create order in Notion
            await this.notionAgent.createResumeOrder(orderData);
            
            // Send confirmation email
            await this.sendOrderConfirmation(orderData);
            
            console.log(`✅ Payment successful for order: ${metadata.orderId}`);
        } catch (error) {
            console.error('Error handling payment success:', error);
        }
    }

    async handlePaymentFailed(paymentIntent) {
        try {
            const { metadata } = paymentIntent;
            console.log(`❌ Payment failed for order: ${metadata.orderId}`);
            
            // You could implement retry logic or failure notifications here
        } catch (error) {
            console.error('Error handling payment failure:', error);
        }
    }

    async sendOrderConfirmation(orderData) {
        // This would integrate with your email service
        console.log(`📧 Sending confirmation email to: ${orderData.customerEmail}`);
        console.log(`Order ID: ${orderData.orderId}`);
        console.log(`Service: ${orderData.serviceType}`);
        console.log(`Amount: $${orderData.amount}`);
        
        // TODO: Implement actual email sending
        // You could use SendGrid, AWS SES, or similar service
    }

    async getOrderStatus(orderId) {
        try {
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
                return {
                    status: order.properties['Status'].select?.name,
                    paymentStatus: order.properties['Payment Status'].select?.name,
                    serviceType: order.properties['Service Type'].select?.name,
                    hasResume: !!order.properties['Resume Content'].rich_text[0]?.text?.content,
                };
            }

            return null;
        } catch (error) {
            console.error('Error getting order status:', error);
            throw error;
        }
    }

    async getResumeContent(orderId) {
        try {
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
                    return resumeContent;
                }
            }

            return null;
        } catch (error) {
            console.error('Error getting resume content:', error);
            throw error;
        }
    }

    async createPaymentLinks() {
        console.log('🔗 Creating Stripe payment links...');
        
        for (const [key, product] of Object.entries(this.products)) {
            try {
                const stripeProduct = await stripe.products.create({
                    name: product.name,
                    description: product.description,
                });

                const price = await stripe.prices.create({
                    product: stripeProduct.id,
                    unit_amount: product.price,
                    currency: 'usd',
                });

                const paymentLink = await stripe.paymentLinks.create({
                    line_items: [
                        {
                            price: price.id,
                            quantity: 1,
                        },
                    ],
                    metadata: {
                        serviceType: key,
                    },
                });

                console.log(`✅ ${product.name}: ${paymentLink.url}`);
            } catch (error) {
                console.error(`❌ Error creating payment link for ${product.name}:`, error);
            }
        }
    }

    start(port = 3000) {
        this.app.listen(port, () => {
            console.log(`🚀 Stripe payment server running on port ${port}`);
            console.log(`📡 Webhook endpoint: http://localhost:${port}/webhook`);
        });
    }
}

// Export for use in other modules
module.exports = StripePaymentIntegration;

// Run server if called directly
if (require.main === module) {
    const paymentIntegration = new StripePaymentIntegration();
    
    // Create payment links if --create-links flag is passed
    if (process.argv.includes('--create-links')) {
        paymentIntegration.createPaymentLinks();
    } else {
        paymentIntegration.start();
    }
}