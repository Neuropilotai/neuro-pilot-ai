#!/usr/bin/env node

/**
 * 🚀 AI Trading Ecosystem Launcher
 * 
 * Master launcher for the complete self-optimizing trading ecosystem:
 * - Indicator Learning System
 * - Webhook Data Collector  
 * - Reinforcement Learning Agent
 * - AI Monitoring Dashboard
 * - Strategy Version Control
 */

const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

class AIEcosystemLauncher {
    constructor() {
        this.processes = new Map();
        this.ecosystem = {
            'Indicator Learning System': {
                script: './indicator_learning_system.js',
                port: null,
                status: 'stopped'
            },
            'Webhook Data Collector': {
                script: './webhook_data_collector.js',
                port: 3012,
                status: 'stopped'
            },
            'Reinforcement Learning Agent': {
                script: './reinforcement_learning_agent.js',
                port: null,
                status: 'stopped'
            },
            'AI Monitoring Dashboard': {
                script: './ai_monitoring_dashboard.js',
                port: 3013,
                status: 'stopped'
            },
            'Strategy Version Control': {
                script: './strategy_version_control.js',
                port: null,
                status: 'stopped'
            }
        };
        
        this.startupOrder = [
            'Indicator Learning System',
            'Webhook Data Collector', 
            'Reinforcement Learning Agent',
            'Strategy Version Control',
            'AI Monitoring Dashboard'
        ];
    }

    async ensureDirectories() {
        const directories = [
            './TradingDrive/feedback_data',
            './TradingDrive/rl_models',
            './TradingDrive/strategy_versions',
            './TradingDrive/performance_logs'
        ];
        
        for (const dir of directories) {
            try {
                await fs.mkdir(dir, { recursive: true });
                console.log(`📁 Directory ready: ${dir}`);
            } catch (error) {
                console.error(`Directory error ${dir}:`, error.message);
            }
        }
    }

    startProcess(serviceName) {
        const service = this.ecosystem[serviceName];
        if (!service) {
            console.error(`❌ Unknown service: ${serviceName}`);
            return;
        }
        
        console.log(`🚀 Starting ${serviceName}...`);
        
        const process = spawn('node', [service.script], {
            stdio: ['ignore', 'pipe', 'pipe'],
            detached: false
        });
        
        process.stdout.on('data', (data) => {
            console.log(`[${serviceName}] ${data.toString().trim()}`);
        });
        
        process.stderr.on('data', (data) => {
            console.error(`[${serviceName}] ERROR: ${data.toString().trim()}`);
        });
        
        process.on('close', (code) => {
            console.log(`[${serviceName}] Process exited with code ${code}`);
            this.ecosystem[serviceName].status = 'stopped';
            this.processes.delete(serviceName);
        });
        
        process.on('error', (error) => {
            console.error(`[${serviceName}] Failed to start:`, error.message);
            this.ecosystem[serviceName].status = 'error';
        });
        
        this.processes.set(serviceName, process);
        this.ecosystem[serviceName].status = 'running';
        
        console.log(`✅ ${serviceName} started (PID: ${process.pid})`);
        if (service.port) {
            console.log(`🌐 ${serviceName} available at: http://localhost:${service.port}`);
        }
    }

    async stopProcess(serviceName) {
        const process = this.processes.get(serviceName);
        if (process) {
            console.log(`🛑 Stopping ${serviceName}...`);
            process.kill('SIGTERM');
            this.processes.delete(serviceName);
            this.ecosystem[serviceName].status = 'stopped';
        }
    }

    async startEcosystem() {
        console.log('🚀 LAUNCHING AI TRADING ECOSYSTEM');
        console.log('=====================================');
        
        await this.ensureDirectories();
        
        console.log('\n📋 Services to start:');
        this.startupOrder.forEach((service, index) => {
            const port = this.ecosystem[service].port;
            console.log(`   ${index + 1}. ${service}${port ? ` (port ${port})` : ''}`);
        });
        
        console.log('\n🔄 Starting services in sequence...\n');
        
        for (const serviceName of this.startupOrder) {
            this.startProcess(serviceName);
            
            // Wait 3 seconds between service starts
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
        
        console.log('\n🎉 AI TRADING ECOSYSTEM FULLY LAUNCHED!');
        console.log('========================================');
        this.displayStatus();
        this.displayQuickStart();
    }

    displayStatus() {
        console.log('\n📊 ECOSYSTEM STATUS:');
        console.log('---------------------');
        
        Object.entries(this.ecosystem).forEach(([name, service]) => {
            const statusIcon = service.status === 'running' ? '🟢' : 
                              service.status === 'error' ? '🔴' : '⚪';
            const portInfo = service.port ? ` (port ${service.port})` : '';
            console.log(`   ${statusIcon} ${name}${portInfo}: ${service.status.toUpperCase()}`);
        });
    }

    displayQuickStart() {
        console.log('\n🎯 QUICK START GUIDE:');
        console.log('----------------------');
        console.log('1. 📊 AI Dashboard: http://localhost:3013');
        console.log('2. 🎯 Webhook Endpoint: http://localhost:3012/webhook/tradingview');
        console.log('3. 📈 Configure TradingView alerts to send to webhook endpoint');
        console.log('4. 🧠 AI will continuously learn and optimize strategies');
        console.log('5. 🔄 Version control tracks all improvements');
        
        console.log('\n📡 WEBHOOK JSON FORMAT:');
        console.log(`{
    "symbol": "BTCUSD",
    "action": "BUY",
    "price": 45000,
    "ai_score": 78.5,
    "confidence": 0.85,
    "regime": "trending",
    "risk_mode": "Aggressive",
    "quantity": 0.001,
    "result": "PROFIT",
    "pnl": 150.75
}`);
        
        console.log('\n🎛️ SYSTEM CONTROLS:');
        console.log('   Ctrl+C: Graceful shutdown');
        console.log('   SIGTERM: Stop all processes');
    }

    async stopEcosystem() {
        console.log('\n🛑 STOPPING AI TRADING ECOSYSTEM...');
        
        const stopPromises = [];
        for (const serviceName of [...this.startupOrder].reverse()) {
            if (this.processes.has(serviceName)) {
                stopPromises.push(this.stopProcess(serviceName));
            }
        }
        
        await Promise.all(stopPromises);
        
        // Wait for processes to terminate
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        console.log('✅ AI Trading Ecosystem stopped gracefully');
        process.exit(0);
    }

    async monitorHealth() {
        setInterval(() => {
            let runningServices = 0;
            Object.values(this.ecosystem).forEach(service => {
                if (service.status === 'running') runningServices++;
            });
            
            console.log(`\n💓 Health Check: ${runningServices}/${Object.keys(this.ecosystem).length} services running`);
            
            // Auto-restart failed services
            Object.entries(this.ecosystem).forEach(([name, service]) => {
                if (service.status === 'stopped' && this.startupOrder.includes(name)) {
                    console.log(`🔄 Auto-restarting ${name}...`);
                    this.startProcess(name);
                }
            });
        }, 60000); // Every minute
    }

    setupSignalHandlers() {
        process.on('SIGINT', async () => {
            console.log('\n\n⚠️ Received SIGINT (Ctrl+C)');
            await this.stopEcosystem();
        });
        
        process.on('SIGTERM', async () => {
            console.log('\n\n⚠️ Received SIGTERM');
            await this.stopEcosystem();
        });
        
        process.on('uncaughtException', (error) => {
            console.error('💥 Uncaught Exception:', error);
            this.stopEcosystem();
        });
        
        process.on('unhandledRejection', (reason, promise) => {
            console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
            this.stopEcosystem();
        });
    }
}

// Main execution
async function main() {
    const launcher = new AIEcosystemLauncher();
    
    launcher.setupSignalHandlers();
    await launcher.startEcosystem();
    
    // Start health monitoring
    await launcher.monitorHealth();
    
    // Keep the process alive
    process.stdin.resume();
}

// Execute if run directly
if (require.main === module) {
    main().catch(error => {
        console.error('💥 Ecosystem launcher error:', error);
        process.exit(1);
    });
}

module.exports = AIEcosystemLauncher;