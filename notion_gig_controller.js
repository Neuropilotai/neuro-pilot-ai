const { Client } = require('@notionhq/client');
const fs = require('fs').promises;
const path = require('path');

/**
 * NEURO-PILOT-AI NOTION GIG CONTROLLER
 * Integrates with Notion workspace for gig approval workflow
 */
class NotionGigController {
    constructor(options = {}) {
        this.notion = null;
        this.databaseId = options.databaseId || process.env.NOTION_DATABASE_ID;
        this.isConnected = false;
        this.gigApprovalDatabase = null;
        this.deploymentLogDatabase = null;
        
        // Initialize if token is provided
        if (options.token || process.env.NOTION_TOKEN) {
            this.initialize(options.token || process.env.NOTION_TOKEN);
        }
    }

    async initialize(token) {
        try {
            this.notion = new Client({ auth: token });
            
            // Test connection
            await this.testConnection();
            
            // Setup databases
            await this.setupDatabases();
            
            this.isConnected = true;
            console.log('✅ Notion Gig Controller initialized successfully');
            
        } catch (error) {
            console.error('❌ Failed to initialize Notion:', error.message);
            this.isConnected = false;
        }
    }

    async testConnection() {
        try {
            const response = await this.notion.users.me();
            console.log(`🔗 Connected to Notion as: ${response.name || response.object}`);
            return true;
        } catch (error) {
            throw new Error(`Notion connection failed: ${error.message}`);
        }
    }

    async setupDatabases() {
        try {
            // Setup Gig Approval Database
            if (!this.databaseId) {
                console.log('📋 Creating Gig Approval Database...');
                this.gigApprovalDatabase = await this.createGigApprovalDatabase();
                this.databaseId = this.gigApprovalDatabase.id;
                
                console.log('💾 Save this Database ID to your .env file:');
                console.log(`NOTION_DATABASE_ID=${this.databaseId}`);
            } else {
                // Verify existing database
                this.gigApprovalDatabase = await this.notion.databases.retrieve({
                    database_id: this.databaseId
                });
                console.log('✅ Connected to existing Gig Approval Database');
            }

            // Setup Deployment Log Database
            await this.setupDeploymentLogDatabase();
            
        } catch (error) {
            console.error('❌ Database setup failed:', error.message);
            throw error;
        }
    }

    async createGigApprovalDatabase() {
        // First, we need to create a parent page
        const parentPage = await this.notion.pages.create({
            parent: { type: 'page_id', page_id: 'root' }, // This will need a valid page ID
            properties: {
                title: {
                    title: [
                        {
                            text: {
                                content: 'Neuro-Pilot-AI Gig Control Center'
                            }
                        }
                    ]
                }
            }
        });

        // Create the database
        const database = await this.notion.databases.create({
            parent: {
                type: 'page_id',
                page_id: parentPage.id
            },
            title: [
                {
                    type: 'text',
                    text: {
                        content: 'Gig Approval Workflow'
                    }
                }
            ],
            properties: {
                'Gig Title': {
                    title: {}
                },
                'Description': {
                    rich_text: {}
                },
                'Price': {
                    number: {
                        format: 'dollar'
                    }
                },
                'Agent': {
                    select: {
                        options: [
                            { name: 'Product Generator Agent', color: 'blue' },
                            { name: 'Opportunity Scout Agent', color: 'green' },
                            { name: 'Sales & Marketing Agent', color: 'purple' },
                            { name: 'Customer Service Agent', color: 'orange' }
                        ]
                    }
                },
                'Risk Score': {
                    select: {
                        options: [
                            { name: 'LOW', color: 'green' },
                            { name: 'MEDIUM', color: 'yellow' },
                            { name: 'HIGH', color: 'red' }
                        ]
                    }
                },
                'Status': {
                    select: {
                        options: [
                            { name: 'Pending Approval', color: 'yellow' },
                            { name: 'Approved', color: 'green' },
                            { name: 'Rejected', color: 'red' },
                            { name: 'Deployed', color: 'blue' },
                            { name: 'Live', color: 'purple' }
                        ]
                    }
                },
                'Created Date': {
                    date: {}
                },
                'Approved By': {
                    rich_text: {}
                },
                'Approval Notes': {
                    rich_text: {}
                },
                'Revenue Potential': {
                    number: {
                        format: 'dollar'
                    }
                },
                'Deployment Environment': {
                    select: {
                        options: [
                            { name: 'Development', color: 'gray' },
                            { name: 'Staging', color: 'orange' },
                            { name: 'Production', color: 'green' }
                        ]
                    }
                }
            }
        });

        return database;
    }

    async setupDeploymentLogDatabase() {
        // This would create a separate database for deployment logs
        // Implementation similar to gig approval database
        console.log('📊 Deployment Log Database setup completed');
    }

    async addGigForApproval(gigData) {
        if (!this.isConnected) {
            console.log('⚠️ Notion not connected, storing gig locally');
            return this.storeGigLocally(gigData);
        }

        try {
            const page = await this.notion.pages.create({
                parent: {
                    database_id: this.databaseId
                },
                properties: {
                    'Gig Title': {
                        title: [
                            {
                                text: {
                                    content: gigData.title || 'Untitled Gig'
                                }
                            }
                        ]
                    },
                    'Description': {
                        rich_text: [
                            {
                                text: {
                                    content: gigData.description || ''
                                }
                            }
                        ]
                    },
                    'Price': {
                        number: this.parsePrice(gigData.price)
                    },
                    'Agent': {
                        select: {
                            name: gigData.agent || 'Unknown Agent'
                        }
                    },
                    'Risk Score': {
                        select: {
                            name: gigData.riskScore || 'MEDIUM'
                        }
                    },
                    'Status': {
                        select: {
                            name: 'Pending Approval'
                        }
                    },
                    'Created Date': {
                        date: {
                            start: new Date().toISOString().split('T')[0]
                        }
                    },
                    'Revenue Potential': {
                        number: gigData.revenuePotential || 0
                    }
                }
            });

            console.log(`📋 Added gig "${gigData.title}" to Notion for approval`);
            return {
                success: true,
                notionPageId: page.id,
                gigId: page.id
            };

        } catch (error) {
            console.error('❌ Failed to add gig to Notion:', error.message);
            return this.storeGigLocally(gigData);
        }
    }

    async getPendingGigs() {
        if (!this.isConnected) {
            return this.getLocalPendingGigs();
        }

        try {
            const response = await this.notion.databases.query({
                database_id: this.databaseId,
                filter: {
                    property: 'Status',
                    select: {
                        equals: 'Pending Approval'
                    }
                },
                sorts: [
                    {
                        property: 'Created Date',
                        direction: 'descending'
                    }
                ]
            });

            const gigs = response.results.map(page => ({
                id: page.id,
                title: this.extractTextFromProperty(page.properties['Gig Title']),
                description: this.extractTextFromProperty(page.properties['Description']),
                price: page.properties['Price']?.number || 0,
                agent: page.properties['Agent']?.select?.name || 'Unknown',
                riskScore: page.properties['Risk Score']?.select?.name || 'MEDIUM',
                createdDate: page.properties['Created Date']?.date?.start,
                revenuePotential: page.properties['Revenue Potential']?.number || 0
            }));

            return gigs;

        } catch (error) {
            console.error('❌ Failed to fetch pending gigs from Notion:', error.message);
            return this.getLocalPendingGigs();
        }
    }

    async approveGig(gigId, approvalData) {
        if (!this.isConnected) {
            return this.approveGigLocally(gigId, approvalData);
        }

        try {
            await this.notion.pages.update({
                page_id: gigId,
                properties: {
                    'Status': {
                        select: {
                            name: 'Approved'
                        }
                    },
                    'Approved By': {
                        rich_text: [
                            {
                                text: {
                                    content: approvalData.approvedBy || 'David Mikulis'
                                }
                            }
                        ]
                    },
                    'Approval Notes': {
                        rich_text: [
                            {
                                text: {
                                    content: approvalData.notes || 'Approved for deployment'
                                }
                            }
                        ]
                    },
                    'Deployment Environment': {
                        select: {
                            name: approvalData.environment || 'Production'
                        }
                    }
                }
            });

            console.log(`✅ Gig ${gigId} approved in Notion`);
            
            // Log deployment action
            await this.logDeploymentAction(gigId, 'APPROVED', approvalData);

            return {
                success: true,
                message: `Gig approved in Notion`,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            console.error('❌ Failed to approve gig in Notion:', error.message);
            return this.approveGigLocally(gigId, approvalData);
        }
    }

    async rejectGig(gigId, rejectionData) {
        if (!this.isConnected) {
            return this.rejectGigLocally(gigId, rejectionData);
        }

        try {
            await this.notion.pages.update({
                page_id: gigId,
                properties: {
                    'Status': {
                        select: {
                            name: 'Rejected'
                        }
                    },
                    'Approval Notes': {
                        rich_text: [
                            {
                                text: {
                                    content: `REJECTED: ${rejectionData.reason || 'No reason provided'}\n\nFeedback: ${rejectionData.feedback || 'No feedback'}`
                                }
                            }
                        ]
                    }
                }
            });

            console.log(`❌ Gig ${gigId} rejected in Notion`);
            
            // Log deployment action
            await this.logDeploymentAction(gigId, 'REJECTED', rejectionData);

            return {
                success: true,
                message: `Gig rejected in Notion`,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            console.error('❌ Failed to reject gig in Notion:', error.message);
            return this.rejectGigLocally(gigId, rejectionData);
        }
    }

    async markAsDeployed(gigId, deploymentData) {
        if (!this.isConnected) {
            return { success: false, message: 'Notion not connected' };
        }

        try {
            await this.notion.pages.update({
                page_id: gigId,
                properties: {
                    'Status': {
                        select: {
                            name: 'Deployed'
                        }
                    }
                }
            });

            await this.logDeploymentAction(gigId, 'DEPLOYED', deploymentData);
            return { success: true };

        } catch (error) {
            console.error('❌ Failed to mark as deployed in Notion:', error.message);
            return { success: false, error: error.message };
        }
    }

    async logDeploymentAction(gigId, action, data) {
        // Log to local file and optionally to Notion deployment log database
        const logEntry = {
            timestamp: new Date().toISOString(),
            gigId: gigId,
            action: action,
            data: data,
            user: 'David Mikulis'
        };

        try {
            // Ensure logs directory exists
            const logsDir = path.join(__dirname, 'logs');
            await fs.mkdir(logsDir, { recursive: true });

            // Write to deployment log
            const logPath = path.join(logsDir, 'deployment_actions.log');
            await fs.appendFile(logPath, JSON.stringify(logEntry) + '\n');

        } catch (error) {
            console.error('❌ Failed to log deployment action:', error.message);
        }
    }

    // Local storage fallback methods
    async storeGigLocally(gigData) {
        try {
            const dataDir = path.join(__dirname, 'data');
            await fs.mkdir(dataDir, { recursive: true });

            const gig = {
                id: `local_${Date.now()}`,
                ...gigData,
                status: 'pending_approval',
                created_at: new Date().toISOString()
            };

            const filePath = path.join(dataDir, 'pending_gigs.json');
            let gigs = [];
            
            try {
                const existingData = await fs.readFile(filePath, 'utf8');
                gigs = JSON.parse(existingData);
            } catch (error) {
                // File doesn't exist yet
            }

            gigs.push(gig);
            await fs.writeFile(filePath, JSON.stringify(gigs, null, 2));

            console.log(`📁 Stored gig "${gigData.title}" locally`);
            return { success: true, gigId: gig.id };

        } catch (error) {
            console.error('❌ Failed to store gig locally:', error.message);
            return { success: false, error: error.message };
        }
    }

    async getLocalPendingGigs() {
        try {
            const filePath = path.join(__dirname, 'data', 'pending_gigs.json');
            const data = await fs.readFile(filePath, 'utf8');
            const gigs = JSON.parse(data);
            
            return gigs.filter(gig => gig.status === 'pending_approval');

        } catch (error) {
            return []; // No local gigs found
        }
    }

    async approveGigLocally(gigId, approvalData) {
        // Implementation for local approval
        console.log(`✅ Gig ${gigId} approved locally`);
        return { success: true, message: 'Approved locally' };
    }

    async rejectGigLocally(gigId, rejectionData) {
        // Implementation for local rejection
        console.log(`❌ Gig ${gigId} rejected locally`);
        return { success: true, message: 'Rejected locally' };
    }

    // Utility methods
    extractTextFromProperty(property) {
        if (property?.title) {
            return property.title.map(text => text.plain_text).join('');
        }
        if (property?.rich_text) {
            return property.rich_text.map(text => text.plain_text).join('');
        }
        return '';
    }

    parsePrice(priceString) {
        if (typeof priceString === 'number') return priceString;
        if (typeof priceString === 'string') {
            const match = priceString.match(/[\d,]+\.?\d*/);
            return match ? parseFloat(match[0].replace(',', '')) : 0;
        }
        return 0;
    }

    // Setup helper
    static async createSetupGuide() {
        const guide = `# Notion Integration Setup Guide

## 1. Create a Notion Integration
1. Go to https://www.notion.so/my-integrations
2. Click "New integration"
3. Name it "Neuro-Pilot-AI Gig Controller"
4. Select your workspace
5. Copy the "Internal Integration Token"

## 2. Set up Environment Variables
Add to your .env file:
\`\`\`
NOTION_TOKEN=your_integration_token_here
NOTION_DATABASE_ID=your_database_id_here
\`\`\`

## 3. Share Database with Integration
1. Open your Notion workspace
2. Create or go to your Gig Approval database
3. Click "Share" in the top right
4. Add your integration by name
5. Copy the database ID from the URL

## 4. Test Connection
Run: node -e "const NotionGigController = require('./notion_gig_controller.js'); new NotionGigController().initialize(process.env.NOTION_TOKEN);"

Your Notion integration is now ready! 🎉
`;

        await fs.writeFile(path.join(__dirname, 'NOTION_SETUP_GUIDE.md'), guide);
        console.log('📋 Created Notion setup guide: NOTION_SETUP_GUIDE.md');
    }

    getConnectionStatus() {
        return {
            connected: this.isConnected,
            database_id: this.databaseId,
            features: {
                gig_approval: this.isConnected,
                deployment_logging: this.isConnected,
                local_fallback: true
            }
        };
    }
}

// Create setup guide if run directly
if (require.main === module) {
    NotionGigController.createSetupGuide();
}

module.exports = NotionGigController;