#!/usr/bin/env node

const SuperAgentMonitor = require('./super_agent_monitor');
const MonitoredSalesAgent = require('./agents/monitored_agent_example');

console.log('🚀 Starting Super Agent Monitor System...\n');

// Start the monitor dashboard
const monitor = new SuperAgentMonitor();
monitor.start();

// Give the monitor time to start
setTimeout(() => {
    console.log('\n📡 Starting monitored agents...\n');
    
    // Start example sales agent
    const salesAgent = new MonitoredSalesAgent();
    
    // You can add more agents here
    // const tradingAgent = new MonitoredTradingAgent();
    // const customerServiceAgent = new MonitoredCustomerServiceAgent();
    
    console.log('\n✅ All systems operational!');
    console.log('\n📊 Access the Super Agent Monitor at: http://localhost:3009');
    console.log('📱 The dashboard will show real-time agent status and pending approvals\n');
    
}, 2000);

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n\n🛑 Shutting down Super Agent Monitor...');
    process.exit(0);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});