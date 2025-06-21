require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_51234567890abcdef'); // Use test key for now
const express = require('express');

class PaymentService {
    constructor() {
        this.stripe = stripe;
        this.app = express();
        this.port = 3012;
        this.setupMiddleware();
        this.setupRoutes();
        
        // Service pricing
        this.pricing = {
            basic_resume: {
                price: 4900, // $49.00 in cents
                name: 'Basic Resume',
                description: 'AI-optimized professional resume'
            },
            professional_resume: {
                price: 9900, // $99.00 in cents
                name: 'Professional Resume',
                description: 'Premium AI resume with cover letter'
            },
            executive_resume: {
                price: 19900, // $199.00 in cents
                name: 'Executive Resume',
                description: 'C-level executive resume package'
            },
            linkedin_optimization: {
                price: 7900, // $79.00 in cents
                name: 'LinkedIn Optimization',
                description: 'Complete LinkedIn profile makeover'
            },
            career_package: {
                price: 29900, // $299.00 in cents
                name: 'Complete Career Package',
                description: 'Resume + LinkedIn + Cover Letter + Interview Prep'
            }
        };
    }

    setupMiddleware() {
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));
        
        // CORS for frontend
        this.app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
            res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
            next();
        });
    }

    setupRoutes() {
        // Health check
        this.app.get('/', (req, res) => {
            res.json({ 
                status: 'Payment Service Active',
                port: this.port,
                services: Object.keys(this.pricing)
            });
        });

        // Get pricing
        this.app.get('/api/pricing', (req, res) => {
            res.json(this.pricing);
        });

        // Create payment intent
        this.app.post('/api/create-payment-intent', async (req, res) => {
            try {
                const { service_type, customer_email, customer_name } = req.body;
                
                if (!this.pricing[service_type]) {
                    return res.status(400).json({ error: 'Invalid service type' });
                }

                const service = this.pricing[service_type];
                
                const paymentIntent = await this.stripe.paymentIntents.create({
                    amount: service.price,
                    currency: 'usd',
                    metadata: {
                        service_type,
                        customer_email,
                        customer_name,
                        order_id: `order_${Date.now()}`
                    },
                    description: `${service.name} - ${service.description}`
                });

                console.log(`💳 Payment intent created: ${paymentIntent.id} for ${customer_email}`);
                console.log(`📦 Service: ${service.name} - $${(service.price / 100).toFixed(2)}`);

                res.json({
                    client_secret: paymentIntent.client_secret,
                    amount: service.price,
                    service: service,
                    order_id: paymentIntent.metadata.order_id
                });

            } catch (error) {
                console.error('Payment intent error:', error);
                res.status(500).json({ error: error.message });
            }
        });

        // Confirm payment and process order
        this.app.post('/api/confirm-payment', async (req, res) => {
            try {
                const { payment_intent_id, order_details } = req.body;
                
                // Retrieve payment intent to verify payment
                const paymentIntent = await this.stripe.paymentIntents.retrieve(payment_intent_id);
                
                if (paymentIntent.status === 'succeeded') {
                    console.log(`✅ Payment confirmed: ${payment_intent_id}`);
                    console.log(`👤 Customer: ${paymentIntent.metadata.customer_name}`);
                    
                    // Create order for email agent
                    const order = {
                        orderId: paymentIntent.metadata.order_id,
                        paymentId: payment_intent_id,
                        customerName: paymentIntent.metadata.customer_name,
                        customerEmail: paymentIntent.metadata.customer_email,
                        serviceType: paymentIntent.metadata.service_type,
                        amount: paymentIntent.amount,
                        status: 'paid',
                        createdAt: new Date().toISOString(),
                        orderDetails
                    };

                    // Save order and trigger resume generation
                    await this.processOrder(order);
                    
                    res.json({
                        success: true,
                        order_id: order.orderId,
                        message: 'Payment successful! Your order is being processed.'
                    });
                } else {
                    res.status(400).json({ error: 'Payment not completed' });
                }

            } catch (error) {
                console.error('Payment confirmation error:', error);
                res.status(500).json({ error: error.message });
            }
        });

        // Webhook for Stripe events
        this.app.post('/api/webhook', express.raw({type: 'application/json'}), (req, res) => {
            const sig = req.headers['stripe-signature'];
            
            try {
                const event = this.stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
                
                if (event.type === 'payment_intent.succeeded') {
                    console.log('🔔 Webhook: Payment succeeded', event.data.object.id);
                }
                
                res.json({received: true});
            } catch (err) {
                console.log('⚠️ Webhook signature verification failed.');
                res.status(400).send(`Webhook Error: ${err.message}`);
            }
        });
    }

    async processOrder(order) {
        try {
            // Save order to file for email agent to pick up
            const fs = require('fs').promises;
            const orderFile = `./email_inbox/paid_order_${order.orderId}.json`;
            
            await fs.writeFile(orderFile, JSON.stringify(order, null, 2));
            console.log(`📁 Order saved for processing: ${orderFile}`);
            
            // Log successful payment
            await this.logPayment(order);
            
        } catch (error) {
            console.error('Order processing error:', error);
        }
    }

    async logPayment(order) {
        const fs = require('fs').promises;
        const logEntry = {
            timestamp: new Date().toISOString(),
            orderId: order.orderId,
            paymentId: order.paymentId,
            customer: order.customerName,
            email: order.customerEmail,
            service: order.serviceType,
            amount: `$${(order.amount / 100).toFixed(2)}`,
            status: 'completed'
        };

        try {
            await fs.appendFile('./payment_logs.json', JSON.stringify(logEntry) + '\n');
        } catch (error) {
            console.log('Logging error:', error);
        }
    }

    start() {
        this.app.listen(this.port, () => {
            console.log(`💳 Payment Service running on port ${this.port}`);
            console.log(`🔗 http://localhost:${this.port}`);
            console.log('💰 Ready to process payments!\n');
            
            console.log('📋 Available Services:');
            Object.entries(this.pricing).forEach(([key, service]) => {
                console.log(`   ${service.name}: $${(service.price / 100).toFixed(2)}`);
            });
            console.log('');
        });
    }
}

// Start payment service
if (require.main === module) {
    const paymentService = new PaymentService();
    paymentService.start();
}

module.exports = PaymentService;