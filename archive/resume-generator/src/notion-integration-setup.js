#!/usr/bin/env node

/**
 * Notion Integration Setup for Neuro-Pilot-AI Resume Service
 * Sets up Notion database structure and API configuration
 */

const { Client } = require('@notionhq/client');
require('dotenv').config();

class NotionSetup {
    constructor() {
        this.notion = new Client({
            auth: process.env.NOTION_TOKEN,
        });
        this.databaseId = null;
    }

    async createResumeDatabase() {
        try {
            const database = await this.notion.databases.create({
                parent: {
                    type: 'page_id',
                    page_id: process.env.NOTION_PARENT_PAGE_ID,
                },
                title: [
                    {
                        type: 'text',
                        text: {
                            content: 'Resume Orders Database',
                        },
                    },
                ],
                properties: {
                    'Order ID': {
                        title: {},
                    },
                    'Customer Email': {
                        email: {},
                    },
                    'Status': {
                        select: {
                            options: [
                                { name: 'Pending', color: 'yellow' },
                                { name: 'In Progress', color: 'blue' },
                                { name: 'Completed', color: 'green' },
                                { name: 'Delivered', color: 'purple' },
                            ],
                        },
                    },
                    'Order Date': {
                        date: {},
                    },
                    'Service Type': {
                        select: {
                            options: [
                                { name: 'Professional Resume', color: 'blue' },
                                { name: 'Executive Resume', color: 'purple' },
                                { name: 'ATS Optimized', color: 'green' },
                                { name: 'Cover Letter', color: 'orange' },
                            ],
                        },
                    },
                    'Payment Status': {
                        select: {
                            options: [
                                { name: 'Pending', color: 'yellow' },
                                { name: 'Paid', color: 'green' },
                                { name: 'Refunded', color: 'red' },
                            ],
                        },
                    },
                    'Amount': {
                        number: {
                            format: 'dollar',
                        },
                    },
                    'Customer Info': {
                        rich_text: {},
                    },
                    'Resume Content': {
                        rich_text: {},
                    },
                    'Delivery URL': {
                        url: {},
                    },
                },
            });

            this.databaseId = database.id;
            console.log('✅ Resume database created successfully!');
            console.log('Database ID:', this.databaseId);
            return database;
        } catch (error) {
            console.error('❌ Error creating database:', error);
            throw error;
        }
    }

    async createTemplateDatabase() {
        try {
            const database = await this.notion.databases.create({
                parent: {
                    type: 'page_id',
                    page_id: process.env.NOTION_PARENT_PAGE_ID,
                },
                title: [
                    {
                        type: 'text',
                        text: {
                            content: 'Resume Templates',
                        },
                    },
                ],
                properties: {
                    'Template Name': {
                        title: {},
                    },
                    'Industry': {
                        select: {
                            options: [
                                { name: 'Technology', color: 'blue' },
                                { name: 'Healthcare', color: 'green' },
                                { name: 'Finance', color: 'yellow' },
                                { name: 'Marketing', color: 'purple' },
                                { name: 'Education', color: 'orange' },
                                { name: 'General', color: 'gray' },
                            ],
                        },
                    },
                    'Experience Level': {
                        select: {
                            options: [
                                { name: 'Entry Level', color: 'green' },
                                { name: 'Mid Level', color: 'blue' },
                                { name: 'Senior Level', color: 'purple' },
                                { name: 'Executive', color: 'red' },
                            ],
                        },
                    },
                    'Template Content': {
                        rich_text: {},
                    },
                    'ATS Optimized': {
                        checkbox: {},
                    },
                    'Created Date': {
                        created_time: {},
                    },
                    'Last Modified': {
                        last_edited_time: {},
                    },
                },
            });

            console.log('✅ Template database created successfully!');
            console.log('Template Database ID:', database.id);
            return database;
        } catch (error) {
            console.error('❌ Error creating template database:', error);
            throw error;
        }
    }

    async addSampleTemplates(templateDatabaseId) {
        const sampleTemplates = [
            {
                name: 'Tech Professional Resume',
                industry: 'Technology',
                level: 'Mid Level',
                content: `# Professional Summary
Experienced software developer with 3+ years of experience in full-stack development, specializing in React, Node.js, and cloud technologies.

# Technical Skills
- Programming Languages: JavaScript, Python, Java
- Frameworks: React, Node.js, Express
- Databases: MongoDB, PostgreSQL
- Cloud: AWS, Azure

# Professional Experience
## Software Developer | Tech Company (2021-Present)
- Developed and maintained web applications using React and Node.js
- Collaborated with cross-functional teams to deliver high-quality software solutions
- Implemented automated testing and CI/CD pipelines`,
                atsOptimized: true,
            },
            {
                name: 'Executive Leadership Resume',
                industry: 'General',
                level: 'Executive',
                content: `# Executive Summary
Visionary C-level executive with 15+ years of experience driving organizational transformation and revenue growth across multiple industries.

# Core Competencies
- Strategic Planning & Execution
- P&L Management
- Team Leadership & Development
- Digital Transformation
- Stakeholder Management

# Professional Experience
## Chief Executive Officer | Fortune 500 Company (2018-Present)
- Led company through successful digital transformation initiative
- Increased revenue by 40% over 3-year period
- Built and managed high-performing executive team`,
                atsOptimized: true,
            },
        ];

        for (const template of sampleTemplates) {
            try {
                await this.notion.pages.create({
                    parent: { database_id: templateDatabaseId },
                    properties: {
                        'Template Name': {
                            title: [
                                {
                                    text: {
                                        content: template.name,
                                    },
                                },
                            ],
                        },
                        'Industry': {
                            select: {
                                name: template.industry,
                            },
                        },
                        'Experience Level': {
                            select: {
                                name: template.level,
                            },
                        },
                        'Template Content': {
                            rich_text: [
                                {
                                    text: {
                                        content: template.content,
                                    },
                                },
                            ],
                        },
                        'ATS Optimized': {
                            checkbox: template.atsOptimized,
                        },
                    },
                });
                console.log(`✅ Added template: ${template.name}`);
            } catch (error) {
                console.error(`❌ Error adding template ${template.name}:`, error);
            }
        }
    }

    async setupIntegration() {
        console.log('🚀 Starting Notion integration setup...');
        
        try {
            // Create main databases
            const resumeDb = await this.createResumeDatabase();
            const templateDb = await this.createTemplateDatabase();
            
            // Add sample templates
            await this.addSampleTemplates(templateDb.id);
            
            // Update environment variables reference
            console.log('\n📝 Add these to your .env file:');
            console.log(`NOTION_RESUME_DATABASE_ID=${resumeDb.id}`);
            console.log(`NOTION_TEMPLATE_DATABASE_ID=${templateDb.id}`);
            
            console.log('\n✅ Notion integration setup complete!');
            console.log('🎯 Next steps:');
            console.log('1. Update your .env file with the database IDs above');
            console.log('2. Test the integration with the agent system');
            console.log('3. Configure webhook endpoints for order processing');
            
        } catch (error) {
            console.error('❌ Setup failed:', error);
            process.exit(1);
        }
    }
}

// Run setup if called directly
if (require.main === module) {
    const setup = new NotionSetup();
    setup.setupIntegration();
}

module.exports = NotionSetup;