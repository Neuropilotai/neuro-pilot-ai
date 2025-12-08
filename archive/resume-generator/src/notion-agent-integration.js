#!/usr/bin/env node

/**
 * Notion Agent Integration for Neuro-Pilot-AI
 * Handles automated resume generation with Notion database management
 */

const { Client } = require('@notionhq/client');
const OpenAI = require('openai');
require('dotenv').config();

class NotionAgentIntegration {
    constructor() {
        this.notion = new Client({
            auth: process.env.NOTION_TOKEN,
        });
        
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });
        
        this.resumeDatabaseId = process.env.NOTION_RESUME_DATABASE_ID;
        this.templateDatabaseId = process.env.NOTION_TEMPLATE_DATABASE_ID;
    }

    async createResumeOrder(orderData) {
        try {
            const order = await this.notion.pages.create({
                parent: { database_id: this.resumeDatabaseId },
                properties: {
                    'Order ID': {
                        title: [
                            {
                                text: {
                                    content: orderData.orderId,
                                },
                            },
                        ],
                    },
                    'Customer Email': {
                        email: orderData.customerEmail,
                    },
                    'Status': {
                        select: {
                            name: 'Pending',
                        },
                    },
                    'Order Date': {
                        date: {
                            start: new Date().toISOString().split('T')[0],
                        },
                    },
                    'Service Type': {
                        select: {
                            name: orderData.serviceType || 'Professional Resume',
                        },
                    },
                    'Payment Status': {
                        select: {
                            name: orderData.paymentStatus || 'Pending',
                        },
                    },
                    'Amount': {
                        number: orderData.amount || 0,
                    },
                    'Customer Info': {
                        rich_text: [
                            {
                                text: {
                                    content: JSON.stringify(orderData.customerInfo, null, 2),
                                },
                            },
                        ],
                    },
                },
            });

            console.log(`✅ Order created in Notion: ${orderData.orderId}`);
            return order;
        } catch (error) {
            console.error('❌ Error creating order in Notion:', error);
            throw error;
        }
    }

    async updateOrderStatus(orderId, status, additionalData = {}) {
        try {
            // Find the order page
            const response = await this.notion.databases.query({
                database_id: this.resumeDatabaseId,
                filter: {
                    property: 'Order ID',
                    title: {
                        equals: orderId,
                    },
                },
            });

            if (response.results.length === 0) {
                throw new Error(`Order ${orderId} not found`);
            }

            const orderPage = response.results[0];
            const updateProps = {
                'Status': {
                    select: {
                        name: status,
                    },
                },
            };

            // Add additional data if provided
            if (additionalData.resumeContent) {
                updateProps['Resume Content'] = {
                    rich_text: [
                        {
                            text: {
                                content: additionalData.resumeContent,
                            },
                        },
                    ],
                };
            }

            if (additionalData.deliveryUrl) {
                updateProps['Delivery URL'] = {
                    url: additionalData.deliveryUrl,
                };
            }

            await this.notion.pages.update({
                page_id: orderPage.id,
                properties: updateProps,
            });

            console.log(`✅ Order ${orderId} updated to status: ${status}`);
        } catch (error) {
            console.error(`❌ Error updating order ${orderId}:`, error);
            throw error;
        }
    }

    async getResumeTemplate(industry, experienceLevel) {
        try {
            const response = await this.notion.databases.query({
                database_id: this.templateDatabaseId,
                filter: {
                    and: [
                        {
                            property: 'Industry',
                            select: {
                                equals: industry,
                            },
                        },
                        {
                            property: 'Experience Level',
                            select: {
                                equals: experienceLevel,
                            },
                        },
                    ],
                },
            });

            if (response.results.length > 0) {
                const template = response.results[0];
                const content = template.properties['Template Content'].rich_text[0]?.text?.content || '';
                return content;
            }

            // Fallback to general template
            const fallbackResponse = await this.notion.databases.query({
                database_id: this.templateDatabaseId,
                filter: {
                    property: 'Industry',
                    select: {
                        equals: 'General',
                    },
                },
            });

            if (fallbackResponse.results.length > 0) {
                const template = fallbackResponse.results[0];
                return template.properties['Template Content'].rich_text[0]?.text?.content || '';
            }

            throw new Error('No suitable template found');
        } catch (error) {
            console.error('❌ Error fetching template:', error);
            throw error;
        }
    }

    async generateResumeWithAI(customerInfo, template) {
        try {
            const prompt = `You are a professional resume writer. Using the template below and the customer information provided, create a personalized, ATS-optimized resume.

TEMPLATE:
${template}

CUSTOMER INFORMATION:
${JSON.stringify(customerInfo, null, 2)}

Instructions:
1. Replace template placeholders with actual customer information
2. Ensure the resume is ATS-optimized with relevant keywords
3. Maintain professional formatting and structure
4. Focus on achievements and quantifiable results
5. Tailor the content to the customer's target industry and role

Return only the completed resume content in markdown format.`;

            const completion = await this.openai.chat.completions.create({
                model: "gpt-4",
                messages: [
                    {
                        role: "system",
                        content: "You are an expert resume writer with 15+ years of experience helping professionals advance their careers."
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                max_tokens: 3000,
                temperature: 0.7,
            });

            return completion.choices[0].message.content.trim();
        } catch (error) {
            console.error('❌ Error generating resume with AI:', error);
            throw error;
        }
    }

    async processResumeOrder(orderId) {
        try {
            console.log(`🔄 Processing resume order: ${orderId}`);
            
            // Update status to In Progress
            await this.updateOrderStatus(orderId, 'In Progress');
            
            // Get order details
            const response = await this.notion.databases.query({
                database_id: this.resumeDatabaseId,
                filter: {
                    property: 'Order ID',
                    title: {
                        equals: orderId,
                    },
                },
            });

            if (response.results.length === 0) {
                throw new Error(`Order ${orderId} not found`);
            }

            const order = response.results[0];
            const customerInfoText = order.properties['Customer Info'].rich_text[0]?.text?.content || '{}';
            const customerInfo = JSON.parse(customerInfoText);
            const serviceType = order.properties['Service Type'].select?.name || 'Professional Resume';
            
            // Determine template parameters
            const industry = customerInfo.industry || 'General';
            const experienceLevel = customerInfo.experienceLevel || 'Mid Level';
            
            // Get appropriate template
            const template = await this.getResumeTemplate(industry, experienceLevel);
            
            // Generate resume with AI
            const resumeContent = await this.generateResumeWithAI(customerInfo, template);
            
            // Update order with completed resume
            await this.updateOrderStatus(orderId, 'Completed', {
                resumeContent: resumeContent,
            });
            
            console.log(`✅ Resume order ${orderId} completed successfully`);
            return resumeContent;
            
        } catch (error) {
            console.error(`❌ Error processing order ${orderId}:`, error);
            await this.updateOrderStatus(orderId, 'Error');
            throw error;
        }
    }

    async getPendingOrders() {
        try {
            const response = await this.notion.databases.query({
                database_id: this.resumeDatabaseId,
                filter: {
                    and: [
                        {
                            property: 'Status',
                            select: {
                                equals: 'Pending',
                            },
                        },
                        {
                            property: 'Payment Status',
                            select: {
                                equals: 'Paid',
                            },
                        },
                    ],
                },
            });

            return response.results.map(order => ({
                id: order.id,
                orderId: order.properties['Order ID'].title[0]?.text?.content,
                customerEmail: order.properties['Customer Email'].email,
                serviceType: order.properties['Service Type'].select?.name,
                amount: order.properties['Amount'].number,
            }));
        } catch (error) {
            console.error('❌ Error fetching pending orders:', error);
            throw error;
        }
    }

    async startAutomatedProcessing() {
        console.log('🤖 Starting automated resume processing...');
        
        setInterval(async () => {
            try {
                const pendingOrders = await this.getPendingOrders();
                
                if (pendingOrders.length > 0) {
                    console.log(`📋 Found ${pendingOrders.length} pending orders`);
                    
                    for (const order of pendingOrders) {
                        await this.processResumeOrder(order.orderId);
                        // Add delay between orders to avoid rate limits
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }
                }
            } catch (error) {
                console.error('❌ Error in automated processing:', error);
            }
        }, 30000); // Check every 30 seconds
    }
}

// Export for use in other modules
module.exports = NotionAgentIntegration;

// Run automated processing if called directly
if (require.main === module) {
    const integration = new NotionAgentIntegration();
    integration.startAutomatedProcessing();
}