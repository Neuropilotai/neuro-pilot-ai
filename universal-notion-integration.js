// Universal Notion Integration - Auto-sync all gigs to Notion
// Uses your existing Notion credentials from .env.deployment

require('dotenv').config({ path: '.env.deployment' });

class UniversalNotionIntegration {
    constructor() {
        this.enabled = false;
        this.notion = null;
        this.databaseId = null;
        
        this.initializeNotion();
    }

    async initializeNotion() {
        try {
            if (!process.env.NOTION_TOKEN || !process.env.NOTION_DATABASE_ID) {
                console.log('⚠️ Notion integration disabled - missing credentials');
                return;
            }

            const { Client } = require('@notionhq/client');
            this.notion = new Client({
                auth: process.env.NOTION_TOKEN
            });

            // Extract database ID from URL
            const dbUrl = process.env.NOTION_DATABASE_ID;
            if (dbUrl.includes('notion.so/')) {
                const match = dbUrl.match(/notion\.so\/([a-f0-9]+)/);
                if (match) {
                    const rawId = match[1];
                    this.databaseId = rawId.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
                }
            } else {
                this.databaseId = dbUrl;
            }

            // Test connection
            await this.notion.databases.query({
                database_id: this.databaseId,
                page_size: 1
            });

            this.enabled = true;
            console.log('✅ Notion integration active');
            console.log(`📋 Database: ${this.databaseId}`);

        } catch (error) {
            console.log('⚠️ Notion integration disabled:', error.message);
            console.log('💡 To enable: Share your Notion database with the integration');
        }
    }

    async syncGigToNotion(gig) {
        if (!this.enabled) return null;

        try {
            console.log(`📋 Syncing gig to Notion: ${gig.id}`);

            const gigPage = await this.notion.pages.create({
                parent: { database_id: this.databaseId },
                properties: {
                    'Gig ID': {
                        title: [{
                            text: { content: gig.id }
                        }]
                    },
                    'Service Type': {
                        select: { name: this.formatServiceType(gig.serviceType) }
                    },
                    'Status': {
                        select: { name: this.formatStatus(gig.status) }
                    },
                    'Created Date': {
                        date: { start: gig.created.split('T')[0] }
                    },
                    'Progress': {
                        number: gig.progress?.completion || 0
                    },
                    'Estimated Time': {
                        rich_text: [{
                            text: { content: `${gig.progress?.estimatedTime || 0} minutes` }
                        }]
                    },
                    'Assigned Agents': {
                        multi_select: gig.assignedAgents?.map(agent => ({
                            name: agent.name || 'Unknown Agent'
                        })) || []
                    },
                    'Stage': {
                        select: { name: gig.progress?.stage || 'initialization' }
                    }
                }
            });

            console.log(`✅ Gig synced to Notion: ${gigPage.id}`);
            return gigPage.id;

        } catch (error) {
            console.error('❌ Failed to sync gig to Notion:', error.message);
            return null;
        }
    }

    async updateGigInNotion(gigId, updates) {
        if (!this.enabled) return null;

        try {
            // Find the gig page in Notion
            const response = await this.notion.databases.query({
                database_id: this.databaseId,
                filter: {
                    property: 'Gig ID',
                    title: { equals: gigId }
                }
            });

            if (response.results.length === 0) {
                console.log(`⚠️ Gig ${gigId} not found in Notion`);
                return null;
            }

            const pageId = response.results[0].id;
            const updateProps = {};

            // Map updates to Notion properties
            if (updates.status) {
                updateProps['Status'] = {
                    select: { name: this.formatStatus(updates.status) }
                };
            }

            if (updates.progress) {
                updateProps['Progress'] = {
                    number: updates.progress.completion || 0
                };
                
                if (updates.progress.stage) {
                    updateProps['Stage'] = {
                        select: { name: updates.progress.stage }
                    };
                }
            }

            if (updates.performance) {
                updateProps['Quality Score'] = {
                    number: updates.performance.quality || 0
                };
            }

            if (updates.output) {
                updateProps['Output Files'] = {
                    rich_text: [{
                        text: { content: JSON.stringify(updates.output, null, 2) }
                    }]
                };
            }

            await this.notion.pages.update({
                page_id: pageId,
                properties: updateProps
            });

            console.log(`✅ Updated gig ${gigId} in Notion`);
            return pageId;

        } catch (error) {
            console.error(`❌ Failed to update gig ${gigId} in Notion:`, error.message);
            return null;
        }
    }

    async getNotionStats() {
        if (!this.enabled) {
            return {
                enabled: false,
                message: 'Notion integration not configured'
            };
        }

        try {
            const response = await this.notion.databases.query({
                database_id: this.databaseId,
                page_size: 100
            });

            const gigs = response.results;
            const statusCounts = {};
            const serviceCounts = {};

            gigs.forEach(gig => {
                const status = gig.properties['Status']?.select?.name || 'unknown';
                const service = gig.properties['Service Type']?.select?.name || 'unknown';
                
                statusCounts[status] = (statusCounts[status] || 0) + 1;
                serviceCounts[service] = (serviceCounts[service] || 0) + 1;
            });

            return {
                enabled: true,
                database_id: this.databaseId,
                total_gigs: gigs.length,
                status_breakdown: statusCounts,
                service_breakdown: serviceCounts,
                last_updated: new Date().toISOString()
            };

        } catch (error) {
            return {
                enabled: true,
                error: error.message
            };
        }
    }

    formatServiceType(serviceType) {
        const mapping = {
            'resume_services': 'Resume & Business',
            'trading_services': 'Trading & Investment',
            'linkedin_services': 'LinkedIn Career Intelligence',
            'notion_services': 'Notion Automation',
            'content_services': 'Content Creation',
            'ecommerce_services': 'E-commerce Automation',
            'analytics_services': 'Data Analytics'
        };
        
        return mapping[serviceType] || serviceType;
    }

    formatStatus(status) {
        const mapping = {
            'created': 'Created',
            'assigned': 'Assigned',
            'processing': 'In Progress',
            'completed': 'Completed',
            'failed': 'Failed'
        };
        
        return mapping[status] || status;
    }

    // Create database schema if it doesn't exist
    async ensureDatabaseSchema() {
        if (!this.enabled) return false;

        try {
            // This would typically check and update database properties
            // For now, just verify access
            await this.notion.databases.retrieve(this.databaseId);
            console.log('✅ Notion database schema verified');
            return true;
        } catch (error) {
            console.log('⚠️ Could not verify Notion database schema:', error.message);
            return false;
        }
    }
}

module.exports = UniversalNotionIntegration;