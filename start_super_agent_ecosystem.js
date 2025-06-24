#!/usr/bin/env node

require('dotenv').config();
const { spawn } = require('child_process');
const path = require('path');

class SuperAgentEcosystem {
    constructor() {
        this.processes = new Map();
        this.startupOrder = [
            {
                name: 'Enhanced Super Agent',
                file: 'enhanced_super_agent.js',
                port: 9000,
                description: 'Core orchestrator for task assignment and agent management'
            },
            {
                name: 'Platform Integration Super Agent',
                file: 'platform_integration_super_agent.js',
                port: 9001,
                description: 'Auto-deployment to Railway, Stripe, and platform sync'
            },
            {
                name: 'Real Business Dashboard',
                file: 'real_business_dashboard.js',
                port: 3010,
                description: 'Business operations dashboard with auto-deployment triggers'
            }
        ];
        
        this.isShuttingDown = false;
        this.setupSignalHandlers();
    }
    
    async start() {
        console.log('🚀 Starting Super Agent Ecosystem...\n');
        
        // Check environment
        await this.checkEnvironment();
        
        // Start all agents in order
        for (const agent of this.startupOrder) {
            await this.startAgent(agent);
            await this.delay(2000); // Wait 2 seconds between starts
        }
        
        // Show ecosystem status
        this.showEcosystemStatus();
        
        // Start monitoring
        this.startMonitoring();
        
        console.log('\n✅ Super Agent Ecosystem fully operational!');
        console.log('🎯 Ready for automated gig deployment across all platforms\n');
    }
    
    async startAgent(agent) {
        return new Promise((resolve, reject) => {
            console.log(`🤖 Starting ${agent.name}...`);
            
            const agentPath = path.join(__dirname, 'backend', agent.file);
            const childProcess = spawn('node', [agentPath], {
                stdio: ['pipe', 'pipe', 'pipe'],
                cwd: __dirname,
                env: { ...process.env, NODE_ENV: 'production' }
            });
            
            let startupComplete = false;
            
            // Handle process output
            childProcess.stdout.on('data', (data) => {
                const output = data.toString();
                
                // Log with agent prefix
                output.split('\n').forEach(line => {
                    if (line.trim()) {
                        console.log(`   [${agent.name}] ${line}`);
                    }
                });
                
                // Check for startup completion
                if (output.includes(`running on port ${agent.port}`) || output.includes('API running on port')) {
                    if (!startupComplete) {
                        startupComplete = true;
                        console.log(`   ✅ ${agent.name} started successfully on port ${agent.port}\n`);
                        resolve();
                    }
                }
            });
            
            childProcess.stderr.on('data', (data) => {
                console.log(`   [${agent.name} ERROR] ${data.toString()}`);
            });
            
            childProcess.on('close', (code) => {
                console.log(`   ❌ ${agent.name} exited with code ${code}`);
                this.processes.delete(agent.name);
                
                if (!this.isShuttingDown) {
                    console.log(`   🔄 Restarting ${agent.name}...`);
                    setTimeout(() => this.startAgent(agent), 5000);
                }
            });
            
            childProcess.on('error', (error) => {
                console.error(`   ❌ ${agent.name} startup error:`, error.message);
                reject(error);
            });
            
            // Store process reference
            this.processes.set(agent.name, {
                process: childProcess,
                config: agent,
                startTime: new Date(),
                restarts: 0
            });
            
            // Timeout if startup takes too long
            setTimeout(() => {
                if (!startupComplete) {
                    console.log(`   ⚠️ ${agent.name} startup timeout (assuming started)`);
                    resolve();
                }
            }, 10000);
        });
    }
    
    async checkEnvironment() {
        console.log('🔍 Checking environment...\n');
        
        // Check Node.js version
        const nodeVersion = process.version;
        console.log(`   Node.js: ${nodeVersion}`);
        
        // Check required dependencies
        const requiredPackages = [
            'express', 'dotenv', 'node-fetch', 'stripe'
        ];
        
        for (const pkg of requiredPackages) {
            try {
                require.resolve(pkg);
                console.log(`   ✅ ${pkg} installed`);
            } catch (error) {
                console.log(`   ❌ ${pkg} missing - run: npm install ${pkg}`);
            }
        }
        
        // Check environment variables
        const envVars = {
            'STRIPE_SECRET_KEY': process.env.STRIPE_SECRET_KEY ? '✅ Set' : '⚠️ Not set (Stripe features disabled)',
            'EMAIL_USER': process.env.EMAIL_USER ? '✅ Set' : '⚠️ Not set (Email features disabled)',
            'EMAIL_PASS': process.env.EMAIL_PASS ? '✅ Set' : '⚠️ Not set (Email features disabled)'
        };
        
        for (const [key, status] of Object.entries(envVars)) {
            console.log(`   ${key}: ${status}`);
        }
        
        console.log('');
    }
    
    showEcosystemStatus() {
        console.log('\n📊 === SUPER AGENT ECOSYSTEM STATUS ===\n');
        
        for (const [name, info] of this.processes) {
            const uptime = Math.floor((Date.now() - info.startTime) / 1000);
            console.log(`🤖 ${name}:`);
            console.log(`   📍 Port: ${info.config.port}`);
            console.log(`   ⏱️ Uptime: ${uptime}s`);
            console.log(`   📝 Description: ${info.config.description}`);
            console.log('');
        }
        
        console.log('🌐 Ecosystem URLs:');
        console.log('   📊 Business Dashboard: http://localhost:3010');
        console.log('   🧠 Orchestrator API: http://localhost:9000/api/orchestrator/status');
        console.log('   🌐 Platform Agent API: http://localhost:9001/api/platform/status');
        console.log('');
        
        console.log('🎯 Automation Features:');
        console.log('   ✅ Auto-deployment from dashboard to Railway');
        console.log('   ✅ Auto-creation of Stripe products and payment links');
        console.log('   ✅ Cross-platform synchronization');
        console.log('   ✅ Real-time monitoring and health checks');
        console.log('   ✅ Intelligent task assignment and load balancing');
    }
    
    startMonitoring() {
        // Health check every 30 seconds
        setInterval(() => {
            this.performHealthChecks();
        }, 30000);
        
        // Status report every 5 minutes
        setInterval(() => {
            this.generateStatusReport();
        }, 300000);
    }
    
    async performHealthChecks() {
        for (const [name, info] of this.processes) {
            try {
                // Simple health check - check if process is running
                if (info.process.killed) {
                    console.log(`⚠️ ${name} process is not running`);
                }
            } catch (error) {
                console.log(`❌ Health check failed for ${name}:`, error.message);
            }
        }
    }
    
    generateStatusReport() {
        console.log('\n📈 === ECOSYSTEM STATUS REPORT ===');
        console.log(`   🕐 Timestamp: ${new Date().toLocaleString()}`);
        console.log(`   🤖 Active Agents: ${this.processes.size}/${this.startupOrder.length}`);
        
        let totalUptime = 0;
        for (const [name, info] of this.processes) {
            const uptime = Math.floor((Date.now() - info.startTime) / 1000);
            totalUptime += uptime;
            console.log(`   ${name}: ${uptime}s uptime`);
        }
        
        console.log(`   📊 Average uptime: ${Math.floor(totalUptime / this.processes.size)}s`);
        console.log('=======================================\n');
    }
    
    setupSignalHandlers() {
        // Graceful shutdown
        process.on('SIGINT', () => this.shutdown('SIGINT'));
        process.on('SIGTERM', () => this.shutdown('SIGTERM'));
        
        // Handle uncaught exceptions
        process.on('uncaughtException', (error) => {
            console.error('❌ Uncaught Exception:', error);
            this.shutdown('EXCEPTION');
        });
        
        process.on('unhandledRejection', (reason, promise) => {
            console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
        });
    }
    
    async shutdown(signal) {
        if (this.isShuttingDown) return;
        
        this.isShuttingDown = true;
        console.log(`\n🛑 Received ${signal} - shutting down ecosystem gracefully...`);
        
        // Stop all agents
        for (const [name, info] of this.processes) {
            console.log(`   🔴 Stopping ${name}...`);
            try {
                info.process.kill('SIGTERM');
            } catch (error) {
                console.log(`   ⚠️ Error stopping ${name}:`, error.message);
            }
        }
        
        // Wait for processes to exit
        await this.delay(3000);
        
        console.log('✅ Super Agent Ecosystem shutdown complete');
        process.exit(0);
    }
    
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// CLI interface
if (require.main === module) {
    const ecosystem = new SuperAgentEcosystem();
    
    console.log(`
🧠 NEURO.PILOT.AI SUPER AGENT ECOSYSTEM
=====================================

🎯 Mission: Automated business operations across all platforms
🤖 Agents: Enhanced orchestrator, platform integration, business dashboard
🌐 Platforms: Railway, Stripe, Dashboard sync
⚡ Features: Auto-deployment, intelligent task assignment, real-time monitoring

`);
    
    ecosystem.start().catch(error => {
        console.error('❌ Ecosystem startup failed:', error);
        process.exit(1);
    });
}

module.exports = SuperAgentEcosystem;