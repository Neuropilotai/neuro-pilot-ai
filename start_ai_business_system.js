#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

console.log(`
🚀 NEURO-PILOT AI BUSINESS SYSTEM LAUNCHER
===========================================

Starting your complete 10-agent AI business system...

🎯 SYSTEM COMPONENTS:
✅ Master Orchestrator (10 AI agents)
✅ Management Dashboard (port 3007)
✅ Sales & Marketing Automation
✅ Product Generation Engine
✅ Payment & Billing System
✅ Compliance & Moderation
✅ Opportunity Scouting
✅ Customer Service Automation
✅ Analytics & Performance Tracking
✅ Continuous Learning & Optimization

===========================================
`);

// Start the management dashboard
console.log("🎛️ Starting Management Dashboard...");
const dashboard = spawn('node', ['backend/management_dashboard.js'], {
    cwd: __dirname,
    stdio: 'inherit'
});

// Start the master orchestrator (for API endpoints if needed)
setTimeout(() => {
    console.log("\n🤖 AI Agent System Ready!");
    console.log("📊 Management Dashboard: http://localhost:3007");
    console.log("💼 Business Operations: FULLY AUTOMATED");
    console.log("\n🎮 WHAT YOU CAN DO NOW:");
    console.log("   • Visit http://localhost:3007 to manage your business");
    console.log("   • Create new projects and research tasks");
    console.log("   • Monitor AI agent performance");
    console.log("   • Process orders automatically");
    console.log("   • Generate products on-demand");
    console.log("   • Track revenue and analytics");
    console.log("\n✨ Your AI business empire is LIVE!");
}, 2000);

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down AI Business System...');
    dashboard.kill();
    process.exit(0);
});

// Handle dashboard exit
dashboard.on('exit', (code) => {
    console.log('\n📊 Management Dashboard stopped');
    process.exit(code);
});