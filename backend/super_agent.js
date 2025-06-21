require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const FileOrganizerModule = require('./file_organizer_module');

class SuperAgent {
    constructor() {
        this.name = "NEURO-SUPER-AGENT";
        this.version = "1.0.0";
        this.knowledge = new Map();
        this.systemState = {};
        this.issues = [];
        this.fixes = [];
        this.learningLog = [];
        this.isRunning = false;
        this.logFile = './super_agent.log';
        this.knowledgeFile = './super_agent_knowledge.json';
        this.configFile = './super_agent_config.json';
        
        this.config = {
            monitoringInterval: 30000, // 30 seconds
            healthCheckInterval: 60000, // 1 minute
            autoFixEnabled: true,
            learningEnabled: true,
            fileOrganizationEnabled: true,
            alertThreshold: 3,
            maxMemoryUsage: 90,
            maxCpuUsage: 85
        };
        
        // Initialize File Organizer Module
        this.fileOrganizer = new FileOrganizerModule(this);
        
        this.services = [
            { name: 'Email Agent', process: 'simple_email_agent.js', port: null, critical: true },
            { name: 'Backend API', process: 'server.js', port: 8080, critical: true },
            { name: 'Admin Server', process: 'admin_server.js', port: 8081, critical: false },
            { name: 'Fiverr Pro', process: 'fiverr_pro_enhanced.js', port: 8082, critical: false },
            { name: 'Dashboard', process: 'agent_dashboard.js', port: 3005, critical: false },
            { name: 'Enhanced Dashboard', process: 'enhanced_dashboard.js', port: 3006, critical: false },
            { name: 'Ngrok Manager', process: 'ngrok_manager.js', port: null, critical: true }
        ];
        
        this.init();
    }

    async init() {
        await this.loadKnowledge();
        await this.loadConfig();
        console.log(`🤖 ${this.name} v${this.version} Initializing...`);
        console.log(`🧠 Loaded ${this.knowledge.size} knowledge entries`);
        console.log(`⚙️ Auto-fix: ${this.config.autoFixEnabled ? 'ENABLED' : 'DISABLED'}`);
        console.log(`📚 Learning: ${this.config.learningEnabled ? 'ENABLED' : 'DISABLED'}`);
        console.log(`🗂️ File Organization: ${this.config.fileOrganizationEnabled ? 'ENABLED' : 'DISABLED'}`);
    }

    async start() {
        if (this.isRunning) {
            console.log('🔄 Super Agent already running');
            return;
        }

        this.isRunning = true;
        console.log(`\n🚀 ${this.name} STARTING...\n`);
        
        await this.log('SYSTEM_START', '🚀 Super Agent starting up');
        
        // Initial system scan
        await this.performSystemScan();
        
        // Start monitoring loops
        this.startMonitoring();
        this.startHealthChecks();
        this.startLearning();
        
        // Start file organization
        if (this.config.fileOrganizationEnabled) {
            await this.fileOrganizer.start();
        }
        
        console.log(`✅ ${this.name} is now ACTIVE and monitoring your system`);
        console.log(`📊 Dashboard: http://localhost:3007/super-agent`);
    }

    startMonitoring() {
        setInterval(async () => {
            if (!this.isRunning) return;
            
            try {
                await this.monitorServices();
                await this.monitorResources();
                await this.checkSystemHealth();
                
            } catch (error) {
                await this.handleError('MONITORING_ERROR', error);
            }
        }, this.config.monitoringInterval);
    }

    startHealthChecks() {
        setInterval(async () => {
            if (!this.isRunning) return;
            
            try {
                await this.performHealthChecks();
                await this.analyzeSystemPerformance();
                
            } catch (error) {
                await this.handleError('HEALTH_CHECK_ERROR', error);
            }
        }, this.config.healthCheckInterval);
    }

    startLearning() {
        setInterval(async () => {
            if (!this.isRunning || !this.config.learningEnabled) return;
            
            try {
                await this.analyzePatterns();
                await this.optimizeSystem();
                await this.updateKnowledge();
                
            } catch (error) {
                await this.handleError('LEARNING_ERROR', error);
            }
        }, 300000); // 5 minutes
    }

    async performSystemScan() {
        console.log('🔍 Performing initial system scan...');
        
        // Check all services
        for (const service of this.services) {
            const status = await this.checkServiceStatus(service);
            this.systemState[service.name] = status;
            
            if (!status.running && service.critical) {
                await this.handleCriticalServiceDown(service);
            }
        }
        
        // Check system resources
        const resources = await this.getSystemResources();
        this.systemState.resources = resources;
        
        // Check network connectivity
        const network = await this.checkNetworkHealth();
        this.systemState.network = network;
        
        console.log('✅ Initial system scan completed');
    }

    async monitorServices() {
        for (const service of this.services) {
            const currentStatus = await this.checkServiceStatus(service);
            const previousStatus = this.systemState[service.name];
            
            if (previousStatus && previousStatus.running && !currentStatus.running) {
                // Service went down
                await this.handleServiceDown(service, currentStatus);
            } else if (previousStatus && !previousStatus.running && currentStatus.running) {
                // Service came back up
                await this.handleServiceUp(service, currentStatus);
            }
            
            this.systemState[service.name] = currentStatus;
        }
    }

    async checkServiceStatus(service) {
        try {
            // Check if process is running
            const { stdout } = await execAsync(`ps aux | grep "${service.process}" | grep -v grep`);
            const running = stdout.trim().length > 0;
            
            let portCheck = true;
            if (service.port) {
                try {
                    const { stdout: portOutput } = await execAsync(`lsof -ti :${service.port}`);
                    portCheck = portOutput.trim().length > 0;
                } catch (error) {
                    portCheck = false;
                }
            }
            
            return {
                running,
                portActive: portCheck,
                lastCheck: new Date().toISOString(),
                healthy: running && (service.port ? portCheck : true)
            };
            
        } catch (error) {
            return {
                running: false,
                portActive: false,
                lastCheck: new Date().toISOString(),
                healthy: false,
                error: error.message
            };
        }
    }

    async handleServiceDown(service, status) {
        const issue = {
            id: `SERVICE_DOWN_${Date.now()}`,
            type: 'SERVICE_DOWN',
            service: service.name,
            timestamp: new Date().toISOString(),
            critical: service.critical,
            status
        };
        
        this.issues.push(issue);
        await this.log('SERVICE_DOWN', `❌ ${service.name} is down`, issue);
        
        if (this.config.autoFixEnabled) {
            await this.attemptServiceRestart(service, issue);
        }
    }

    async handleServiceUp(service, status) {
        await this.log('SERVICE_UP', `✅ ${service.name} is back online`, { service: service.name, status });
        
        // Remove related issues
        this.issues = this.issues.filter(issue => 
            issue.type !== 'SERVICE_DOWN' || issue.service !== service.name
        );
    }

    async attemptServiceRestart(service, issue) {
        console.log(`🔧 Attempting to restart ${service.name}...`);
        
        try {
            const restartCommand = this.getRestartCommand(service);
            await execAsync(restartCommand);
            
            // Wait and check if service started
            await new Promise(resolve => setTimeout(resolve, 5000));
            const newStatus = await this.checkServiceStatus(service);
            
            if (newStatus.running) {
                const fix = {
                    id: `FIX_${Date.now()}`,
                    issueId: issue.id,
                    type: 'SERVICE_RESTART',
                    service: service.name,
                    timestamp: new Date().toISOString(),
                    success: true,
                    command: restartCommand
                };
                
                this.fixes.push(fix);
                await this.log('AUTO_FIX_SUCCESS', `✅ Successfully restarted ${service.name}`, fix);
                
                // Learn from successful fix
                if (this.config.learningEnabled) {
                    await this.learnFromFix(issue, fix);
                }
                
            } else {
                await this.log('AUTO_FIX_FAILED', `❌ Failed to restart ${service.name}`, { service: service.name });
            }
            
        } catch (error) {
            await this.log('AUTO_FIX_ERROR', `❌ Error restarting ${service.name}: ${error.message}`, { service: service.name, error: error.message });
        }
    }

    getRestartCommand(service) {
        const commands = {
            'simple_email_agent.js': 'nohup node simple_email_agent.js > email_agent.log 2>&1 &',
            'server.js': 'PORT=8080 nohup node server.js > server_8080.log 2>&1 &',
            'admin_server.js': 'PORT=8081 nohup node admin_server.js > admin_8081.log 2>&1 &',
            'fiverr_pro_enhanced.js': 'PORT=8082 nohup node fiverr_pro_enhanced.js > fiverr_pro.log 2>&1 &',
            'agent_dashboard.js': 'PORT=3005 nohup node agent_dashboard.js > dashboard.log 2>&1 &',
            'enhanced_dashboard.js': 'PORT=3006 nohup node enhanced_dashboard.js > enhanced_dashboard.log 2>&1 &',
            'ngrok_manager.js': 'nohup node ngrok_manager.js > ngrok_manager.log 2>&1 &'
        };
        
        return commands[service.process] || `nohup node ${service.process} > ${service.process}.log 2>&1 &`;
    }

    async monitorResources() {
        try {
            const resources = await this.getSystemResources();
            const previousResources = this.systemState.resources;
            
            // Check for resource issues
            if (resources.memoryUsage > this.config.maxMemoryUsage) {
                await this.handleHighMemoryUsage(resources);
            }
            
            if (resources.cpuUsage > this.config.maxCpuUsage) {
                await this.handleHighCpuUsage(resources);
            }
            
            this.systemState.resources = resources;
            
        } catch (error) {
            await this.handleError('RESOURCE_MONITORING_ERROR', error);
        }
    }

    async getSystemResources() {
        try {
            // Get memory usage
            const { stdout: memOutput } = await execAsync("ps -A -o %mem | awk '{s+=$1} END {print s}'");
            const memoryUsage = parseFloat(memOutput.trim()) || 0;
            
            // Get CPU usage
            const { stdout: cpuOutput } = await execAsync("ps -A -o %cpu | awk '{s+=$1} END {print s}'");
            const cpuUsage = parseFloat(cpuOutput.trim()) || 0;
            
            // Get disk usage
            const { stdout: diskOutput } = await execAsync("df -h / | awk 'NR==2 {print $5}' | sed 's/%//'");
            const diskUsage = parseFloat(diskOutput.trim()) || 0;
            
            return {
                memoryUsage,
                cpuUsage,
                diskUsage,
                timestamp: new Date().toISOString()
            };
            
        } catch (error) {
            return {
                memoryUsage: 0,
                cpuUsage: 0,
                diskUsage: 0,
                timestamp: new Date().toISOString(),
                error: error.message
            };
        }
    }

    async handleHighMemoryUsage(resources) {
        const issue = {
            id: `HIGH_MEMORY_${Date.now()}`,
            type: 'HIGH_MEMORY_USAGE',
            usage: resources.memoryUsage,
            threshold: this.config.maxMemoryUsage,
            timestamp: new Date().toISOString()
        };
        
        await this.log('HIGH_MEMORY', `⚠️ High memory usage: ${resources.memoryUsage}%`, issue);
        
        if (this.config.autoFixEnabled) {
            await this.optimizeMemoryUsage();
        }
    }

    async optimizeMemoryUsage() {
        try {
            // Clear system caches
            await execAsync('sync && sudo purge');
            await this.log('MEMORY_OPTIMIZATION', '🧹 Cleared system caches');
            
            // Restart non-critical services
            const nonCriticalServices = this.services.filter(s => !s.critical);
            for (const service of nonCriticalServices) {
                const status = await this.checkServiceStatus(service);
                if (status.running) {
                    await execAsync(`pkill -f ${service.process}`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    await execAsync(this.getRestartCommand(service));
                    await this.log('SERVICE_RESTART', `🔄 Restarted ${service.name} for memory optimization`);
                }
            }
            
        } catch (error) {
            await this.log('OPTIMIZATION_ERROR', `❌ Memory optimization failed: ${error.message}`);
        }
    }

    async performHealthChecks() {
        // Check ngrok tunnel
        await this.checkNgrokHealth();
        
        // Check email system
        await this.checkEmailHealth();
        
        // Check database connections (if any)
        await this.checkDatabaseHealth();
        
        // Check file system
        await this.checkFileSystemHealth();
    }

    async checkNgrokHealth() {
        try {
            const { stdout } = await execAsync('curl -s http://localhost:4040/api/tunnels');
            const tunnels = JSON.parse(stdout);
            
            if (!tunnels.tunnels || tunnels.tunnels.length === 0) {
                await this.handleNgrokDown();
            } else {
                const httpsUrl = tunnels.tunnels.find(t => t.public_url.startsWith('https://'));
                if (httpsUrl) {
                    // Update URL files if changed
                    await this.updateNgrokUrl(httpsUrl.public_url);
                }
            }
            
        } catch (error) {
            await this.handleNgrokDown();
        }
    }

    async handleNgrokDown() {
        await this.log('NGROK_DOWN', '⚠️ Ngrok tunnel is down');
        
        if (this.config.autoFixEnabled) {
            try {
                await execAsync('pkill -f ngrok');
                await new Promise(resolve => setTimeout(resolve, 3000));
                await execAsync('nohup ngrok http 3000 > ngrok_tunnel.log 2>&1 &');
                await this.log('NGROK_RESTART', '🔄 Restarted ngrok tunnel');
            } catch (error) {
                await this.log('NGROK_RESTART_FAILED', `❌ Failed to restart ngrok: ${error.message}`);
            }
        }
    }

    async updateNgrokUrl(newUrl) {
        try {
            const currentUrlFile = './current_ngrok_url.txt';
            const currentUrl = await fs.readFile(currentUrlFile, 'utf8').catch(() => '');
            
            if (currentUrl.trim() !== newUrl) {
                await fs.writeFile(currentUrlFile, newUrl);
                
                // Auto-update all files with new URL
                const URLUpdater = require('./url_updater');
                const updater = new URLUpdater();
                await updater.updateAllURLs();
                
                await this.log('URL_UPDATED', `🔗 Updated ngrok URL: ${newUrl}`);
            }
            
        } catch (error) {
            await this.log('URL_UPDATE_ERROR', `❌ Failed to update URL: ${error.message}`);
        }
    }

    async learnFromFix(issue, fix) {
        const pattern = {
            issueType: issue.type,
            service: issue.service,
            fixType: fix.type,
            command: fix.command,
            success: fix.success,
            timestamp: new Date().toISOString()
        };
        
        this.learningLog.push(pattern);
        
        // Update knowledge base
        const key = `${issue.type}_${issue.service}`;
        if (this.knowledge.has(key)) {
            const existing = this.knowledge.get(key);
            existing.count++;
            existing.lastUsed = new Date().toISOString();
            existing.successRate = (existing.successRate + (fix.success ? 1 : 0)) / 2;
        } else {
            this.knowledge.set(key, {
                pattern,
                count: 1,
                successRate: fix.success ? 1 : 0,
                lastUsed: new Date().toISOString()
            });
        }
        
        await this.saveKnowledge();
    }

    async log(type, message, data = {}) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            type,
            message,
            data,
            agent: this.name
        };
        
        console.log(`[${logEntry.timestamp}] ${message}`);
        
        try {
            const logLine = JSON.stringify(logEntry) + '\n';
            await fs.appendFile(this.logFile, logLine);
        } catch (error) {
            console.error('Failed to write log:', error);
        }
    }

    async loadKnowledge() {
        try {
            const data = await fs.readFile(this.knowledgeFile, 'utf8');
            const knowledgeArray = JSON.parse(data);
            this.knowledge = new Map(knowledgeArray);
        } catch (error) {
            this.knowledge = new Map();
        }
    }

    async saveKnowledge() {
        try {
            const knowledgeArray = Array.from(this.knowledge.entries());
            await fs.writeFile(this.knowledgeFile, JSON.stringify(knowledgeArray, null, 2));
        } catch (error) {
            console.error('Failed to save knowledge:', error);
        }
    }

    async loadConfig() {
        try {
            const data = await fs.readFile(this.configFile, 'utf8');
            this.config = { ...this.config, ...JSON.parse(data) };
        } catch (error) {
            await this.saveConfig();
        }
    }

    async saveConfig() {
        try {
            await fs.writeFile(this.configFile, JSON.stringify(this.config, null, 2));
        } catch (error) {
            console.error('Failed to save config:', error);
        }
    }

    async handleError(type, error) {
        await this.log(type, `❌ ${error.message}`, { error: error.stack });
    }

    async checkEmailHealth() {
        // Implementation for email health checks
    }

    async checkDatabaseHealth() {
        // Implementation for database health checks
    }

    async checkFileSystemHealth() {
        // Implementation for file system health checks
    }

    async analyzePatterns() {
        // Implementation for pattern analysis
    }

    async optimizeSystem() {
        // Implementation for system optimization
    }

    async updateKnowledge() {
        // Implementation for knowledge updates
    }

    async checkSystemHealth() {
        // Implementation for system health checks
    }

    async analyzeSystemPerformance() {
        // Implementation for performance analysis
    }

    async handleCriticalServiceDown(service) {
        // Implementation for critical service handling
    }

    async checkNetworkHealth() {
        // Implementation for network health checks
        return { status: 'healthy', timestamp: new Date().toISOString() };
    }

    async handleHighCpuUsage(resources) {
        // Implementation for high CPU usage handling
    }

    stop() {
        this.isRunning = false;
        console.log(`🛑 ${this.name} stopped`);
    }
}

// Command line usage
if (require.main === module) {
    const superAgent = new SuperAgent();
    superAgent.start();
    
    // Graceful shutdown
    process.on('SIGINT', () => {
        superAgent.stop();
        process.exit(0);
    });
}

module.exports = SuperAgent;