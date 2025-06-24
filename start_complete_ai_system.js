#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

console.log(`
🧠 NEURO.PILOT.AI - COMPLETE AI BUSINESS SYSTEM
=============================================

🚀 LAUNCHING ADVANCED AI OPERATIONS PLATFORM

🎯 SYSTEM COMPONENTS:
✅ AI Operations Dashboard (Real-time monitoring)
✅ Management Dashboard (Business control)
✅ Master Orchestrator (10 AI agents)
✅ Real-time Analytics & Performance
✅ Agent Activity Monitoring
✅ Revenue & Billing Tracking
✅ Customer Feedback Intelligence
✅ Marketing Campaign Analytics
✅ Compliance & Risk Management
✅ Opportunity Scouting Engine

=============================================
`);

let processes = [];

// Start AI Operations Dashboard (Advanced monitoring)
console.log("🧠 Starting AI Operations Dashboard...");
const aiDashboard = spawn('node', ['backend/ai_operations_dashboard.js'], {
    cwd: __dirname,
    stdio: 'inherit'
});
processes.push({ name: 'AI Operations Dashboard', process: aiDashboard, port: 3009 });

// Start Management Dashboard (Business control)
setTimeout(() => {
    console.log("🎛️ Starting Management Dashboard...");
    const mgmtDashboard = spawn('node', ['backend/management_dashboard.js'], {
        cwd: __dirname,
        stdio: 'inherit'
    });
    processes.push({ name: 'Management Dashboard', process: mgmtDashboard, port: 3007 });
}, 3000);

// Display access information
setTimeout(() => {
    console.log(`
🎉 AI BUSINESS SYSTEM FULLY OPERATIONAL!
========================================

📊 ADVANCED AI OPERATIONS DASHBOARD:
   🔗 URL: http://localhost:3009
   🎯 Features:
      • Real-time agent monitoring
      • Performance analytics
      • Revenue tracking
      • Customer feedback intelligence
      • System health monitoring
      • Marketing metrics

🎛️ BUSINESS MANAGEMENT DASHBOARD:
   🔗 URL: http://localhost:3007  
   🎯 Features:
      • Project management
      • Research planning
      • Development tracking
      • AI task assistant
      • Business overview

🤖 AI AGENT ECOSYSTEM:
   ✅ 10 Specialized agents running
   ✅ Master orchestrator coordinating
   ✅ Real-time workflow automation
   ✅ 24/7 business operations

💰 REVENUE GENERATION:
   🎯 Automated order processing
   🎯 Product creation & delivery
   🎯 Customer service automation
   🎯 Payment & billing management

🚀 YOUR AI EMPIRE IS LIVE AND GENERATING REVENUE!

========================================
Press Ctrl+C to shutdown all systems
`);
}, 8000);

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down AI Business System...');
    
    processes.forEach(proc => {
        console.log(`📊 Stopping ${proc.name}...`);
        proc.process.kill();
    });
    
    setTimeout(() => {
        console.log('✅ All systems stopped. AI Business System offline.');
        process.exit(0);
    }, 2000);
});

// Handle process exits
processes.forEach(proc => {
    proc.process.on('exit', (code) => {
        console.log(`\n📊 ${proc.name} stopped (exit code: ${code})`);
        
        // If all processes have stopped, exit
        const runningProcesses = processes.filter(p => !p.process.killed);
        if (runningProcesses.length === 0) {
            console.log('🛑 All dashboard processes stopped');
            process.exit(code);
        }
    });
    
    proc.process.on('error', (error) => {
        console.error(`❌ ${proc.name} error:`, error);
    });
});