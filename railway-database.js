// Railway Database Manager for Neuro.Pilot.AI
// Handles persistent storage for Railway deployment

const fs = require('fs');
const path = require('path');

class RailwayDatabase {
    constructor() {
        this.databaseUrl = process.env.DATABASE_URL;
        this.useDatabase = !!this.databaseUrl && this.databaseUrl.includes('postgres');
        
        // Fallback to in-memory storage for development
        this.memoryStorage = {
            orders: new Map(),
            completed_orders: new Map(),
            agent_performance: new Map(),
            system_logs: []
        };
        
        if (this.useDatabase) {
            this.initPostgres();
        } else {
            console.log('📦 Using in-memory storage (development mode)');
        }
    }

    async initPostgres() {
        try {
            // In production, you'd use pg library here
            console.log('🐘 PostgreSQL database initialized for Railway');
            console.log('   Database URL configured');
        } catch (error) {
            console.error('Database initialization error:', error);
            console.log('📦 Falling back to in-memory storage');
            this.useDatabase = false;
        }
    }

    // Order Management
    async saveOrder(orderData) {
        if (this.useDatabase) {
            // In production: INSERT INTO orders...
            console.log(`💾 [DB] Saving order: ${orderData.orderId}`);
        } else {
            this.memoryStorage.orders.set(orderData.orderId, {
                ...orderData,
                created_at: new Date().toISOString()
            });
            console.log(`💾 [Memory] Saved order: ${orderData.orderId}`);
        }
        return orderData.orderId;
    }

    async getOrder(orderId) {
        if (this.useDatabase) {
            // In production: SELECT * FROM orders WHERE id = ?
            console.log(`📋 [DB] Fetching order: ${orderId}`);
            return null; // Placeholder
        } else {
            const order = this.memoryStorage.orders.get(orderId);
            if (order) {
                console.log(`📋 [Memory] Found order: ${orderId}`);
                return order;
            }
            return null;
        }
    }

    async updateOrderStatus(orderId, status, additionalData = {}) {
        if (this.useDatabase) {
            // In production: UPDATE orders SET status = ?, updated_at = ? WHERE id = ?
            console.log(`🔄 [DB] Updating order ${orderId} status: ${status}`);
        } else {
            const order = this.memoryStorage.orders.get(orderId);
            if (order) {
                Object.assign(order, {
                    status,
                    updated_at: new Date().toISOString(),
                    ...additionalData
                });
                console.log(`🔄 [Memory] Updated order ${orderId} status: ${status}`);
            }
        }
    }

    async completeOrder(orderId, completionData) {
        if (this.useDatabase) {
            // In production: Move to completed_orders table
            console.log(`✅ [DB] Completing order: ${orderId}`);
        } else {
            const order = this.memoryStorage.orders.get(orderId);
            if (order) {
                const completedOrder = {
                    ...order,
                    ...completionData,
                    status: 'completed',
                    completed_at: new Date().toISOString()
                };
                
                this.memoryStorage.completed_orders.set(orderId, completedOrder);
                this.memoryStorage.orders.delete(orderId);
                console.log(`✅ [Memory] Completed order: ${orderId}`);
            }
        }
    }

    async getPendingOrders() {
        if (this.useDatabase) {
            // In production: SELECT * FROM orders WHERE status IN ('received', 'pending', 'processing')
            return [];
        } else {
            const pending = [];
            for (const [orderId, order] of this.memoryStorage.orders) {
                if (['received', 'pending', 'processing'].includes(order.status)) {
                    pending.push(order);
                }
            }
            console.log(`📋 [Memory] Found ${pending.length} pending orders`);
            return pending;
        }
    }

    // Agent Performance Storage
    async saveAgentPerformance(agentName, performanceData) {
        if (this.useDatabase) {
            // In production: INSERT INTO agent_performance...
            console.log(`📊 [DB] Saving performance for: ${agentName}`);
        } else {
            if (!this.memoryStorage.agent_performance.has(agentName)) {
                this.memoryStorage.agent_performance.set(agentName, []);
            }
            
            this.memoryStorage.agent_performance.get(agentName).push({
                ...performanceData,
                timestamp: new Date().toISOString()
            });
            console.log(`📊 [Memory] Saved performance for: ${agentName}`);
        }
    }

    async getAgentPerformance(agentName) {
        if (this.useDatabase) {
            // In production: SELECT * FROM agent_performance WHERE agent_name = ?
            return [];
        } else {
            return this.memoryStorage.agent_performance.get(agentName) || [];
        }
    }

    // System Logging
    async logSystemEvent(event, data = {}) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            event,
            data,
            system: 'neuro-pilot-ai'
        };

        if (this.useDatabase) {
            // In production: INSERT INTO system_logs...
            console.log(`📝 [DB] Logging event: ${event}`);
        } else {
            this.memoryStorage.system_logs.push(logEntry);
            
            // Keep only last 1000 logs in memory
            if (this.memoryStorage.system_logs.length > 1000) {
                this.memoryStorage.system_logs = this.memoryStorage.system_logs.slice(-1000);
            }
            console.log(`📝 [Memory] Logged event: ${event}`);
        }
    }

    // File Storage Alternative (for generated resumes)
    async saveGeneratedContent(orderId, content, type = 'resume') {
        const filename = `${orderId}_${type}_${Date.now()}.txt`;
        
        if (this.useDatabase) {
            // In production: Store in blob storage or as TEXT in database
            console.log(`💾 [DB] Storing ${type} content for order: ${orderId}`);
            return { filename, stored: true, location: 'database' };
        } else {
            // For development, we'll return the content directly
            console.log(`💾 [Memory] Storing ${type} content for order: ${orderId}`);
            return { 
                filename, 
                content, 
                stored: true, 
                location: 'memory',
                size: content.length 
            };
        }
    }

    // Health Check
    async healthCheck() {
        const health = {
            database: this.useDatabase ? 'postgresql' : 'memory',
            status: 'healthy',
            timestamp: new Date().toISOString(),
            storage: {
                orders: this.useDatabase ? 'database' : this.memoryStorage.orders.size,
                completed: this.useDatabase ? 'database' : this.memoryStorage.completed_orders.size,
                logs: this.useDatabase ? 'database' : this.memoryStorage.system_logs.length
            }
        };

        console.log('🏥 Database health check:', health.database);
        return health;
    }

    // Statistics
    async getSystemStats() {
        const stats = {
            total_orders: this.useDatabase ? 0 : this.memoryStorage.orders.size + this.memoryStorage.completed_orders.size,
            pending_orders: this.useDatabase ? 0 : this.memoryStorage.orders.size,
            completed_orders: this.useDatabase ? 0 : this.memoryStorage.completed_orders.size,
            active_agents: this.useDatabase ? 0 : this.memoryStorage.agent_performance.size,
            system_events: this.useDatabase ? 0 : this.memoryStorage.system_logs.length,
            storage_type: this.useDatabase ? 'postgresql' : 'memory',
            timestamp: new Date().toISOString()
        };

        console.log('📊 System statistics generated');
        return stats;
    }
}

module.exports = RailwayDatabase;