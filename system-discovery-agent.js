// System Discovery Agent - Maps all existing systems and files
// Provides the Universal Orchestrator with real system knowledge

const fs = require('fs').promises;
const path = require('path');

class SystemDiscoveryAgent {
    constructor() {
        this.systemMap = new Map();
        this.agentFiles = new Map();
        this.serviceFiles = new Map();
        this.deploymentFiles = new Map();
        this.dashboardFiles = new Map();
        
        this.basePath = '/Users/davidmikulis/neuro-pilot-ai';
    }

    async discoverFullSystem() {
        console.log('🔍 System Discovery Agent scanning your neuro-pilot-ai system...');
        
        try {
            await this.scanAgentFiles();
            await this.scanServiceFiles();
            await this.scanDeploymentFiles();
            await this.scanDashboardFiles();
            await this.scanConfigFiles();
            await this.generateSystemMap();
            
            console.log('✅ System discovery complete!');
            return this.systemMap;
            
        } catch (error) {
            console.error('❌ System discovery error:', error);
            return null;
        }
    }

    async scanAgentFiles() {
        console.log('🤖 Scanning agent files...');
        
        const agentPaths = [
            'backend/agents/',
            'backend/',
            './'
        ];

        const agentPatterns = [
            '*agent*.js',
            '*orchestrator*.js',
            '*trading*.js',
            '*linkedin*.js'
        ];

        for (const agentPath of agentPaths) {
            const fullPath = path.join(this.basePath, agentPath);
            
            try {
                const files = await fs.readdir(fullPath);
                
                for (const file of files) {
                    if (file.endsWith('.js') && (
                        file.includes('agent') || 
                        file.includes('orchestrator') ||
                        file.includes('trading') ||
                        file.includes('linkedin')
                    )) {
                        const filePath = path.join(fullPath, file);
                        const stats = await fs.stat(filePath);
                        
                        this.agentFiles.set(file, {
                            path: filePath,
                            relativePath: path.relative(this.basePath, filePath),
                            size: stats.size,
                            modified: stats.mtime,
                            type: this.classifyAgent(file)
                        });
                    }
                }
            } catch (error) {
                // Directory doesn't exist, skip
            }
        }

        console.log(`   Found ${this.agentFiles.size} agent files`);
    }

    async scanServiceFiles() {
        console.log('🌐 Scanning service files...');
        
        const servicePatterns = [
            'universal-*.js',
            'railway-*.js',
            '*server*.js',
            '*dashboard*.js',
            '*integration*.js'
        ];

        try {
            const files = await fs.readdir(this.basePath);
            
            for (const file of files) {
                if (file.endsWith('.js') && (
                    file.startsWith('universal-') ||
                    file.startsWith('railway-') ||
                    file.includes('server') ||
                    file.includes('dashboard') ||
                    file.includes('integration')
                )) {
                    const filePath = path.join(this.basePath, file);
                    const stats = await fs.stat(filePath);
                    
                    this.serviceFiles.set(file, {
                        path: filePath,
                        relativePath: file,
                        size: stats.size,
                        modified: stats.mtime,
                        type: this.classifyService(file),
                        status: await this.checkServiceStatus(file)
                    });
                }
            }
        } catch (error) {
            console.error('Error scanning service files:', error);
        }

        console.log(`   Found ${this.serviceFiles.size} service files`);
    }

    async scanDeploymentFiles() {
        console.log('🚀 Scanning deployment files...');
        
        const deploymentPatterns = [
            'start-*.js',
            'start-*.sh',
            'deploy*.js',
            'railway.json',
            'package.json',
            '.env*',
            'Dockerfile',
            'nixpacks.toml'
        ];

        try {
            const files = await fs.readdir(this.basePath);
            
            for (const file of files) {
                if (file.startsWith('start-') ||
                    file.startsWith('deploy') ||
                    file === 'railway.json' ||
                    file === 'package.json' ||
                    file.startsWith('.env') ||
                    file === 'Dockerfile' ||
                    file === 'nixpacks.toml') {
                    
                    const filePath = path.join(this.basePath, file);
                    const stats = await fs.stat(filePath);
                    
                    this.deploymentFiles.set(file, {
                        path: filePath,
                        relativePath: file,
                        size: stats.size,
                        modified: stats.mtime,
                        type: this.classifyDeployment(file)
                    });
                }
            }
        } catch (error) {
            console.error('Error scanning deployment files:', error);
        }

        console.log(`   Found ${this.deploymentFiles.size} deployment files`);
    }

    async scanDashboardFiles() {
        console.log('📊 Scanning dashboard files...');
        
        try {
            const files = await fs.readdir(this.basePath);
            
            for (const file of files) {
                if (file.includes('dashboard') && file.endsWith('.js')) {
                    const filePath = path.join(this.basePath, file);
                    const stats = await fs.stat(filePath);
                    
                    this.dashboardFiles.set(file, {
                        path: filePath,
                        relativePath: file,
                        size: stats.size,
                        modified: stats.mtime,
                        type: this.classifyDashboard(file),
                        port: await this.extractPort(filePath)
                    });
                }
            }
        } catch (error) {
            console.error('Error scanning dashboard files:', error);
        }

        console.log(`   Found ${this.dashboardFiles.size} dashboard files`);
    }

    async scanConfigFiles() {
        console.log('⚙️ Scanning configuration files...');
        
        const configFiles = ['.env.deployment', 'railway.json', 'package.json', 'CLAUDE.md'];
        
        for (const file of configFiles) {
            try {
                const filePath = path.join(this.basePath, file);
                const stats = await fs.stat(filePath);
                
                this.deploymentFiles.set(file, {
                    path: filePath,
                    relativePath: file,
                    size: stats.size,
                    modified: stats.mtime,
                    type: 'configuration'
                });
            } catch (error) {
                // File doesn't exist
            }
        }
    }

    classifyAgent(filename) {
        if (filename.includes('sales') || filename.includes('marketing')) return 'sales_marketing';
        if (filename.includes('product') || filename.includes('generator')) return 'product_generator';
        if (filename.includes('billing') || filename.includes('order')) return 'billing_order';
        if (filename.includes('compliance') || filename.includes('moderation')) return 'compliance_moderation';
        if (filename.includes('customer') || filename.includes('service')) return 'customer_service';
        if (filename.includes('analytics') || filename.includes('optimization')) return 'analytics_optimization';
        if (filename.includes('orchestrator') || filename.includes('master')) return 'master_orchestrator';
        if (filename.includes('trading')) return 'trading_agent';
        if (filename.includes('linkedin')) return 'linkedin_agent';
        if (filename.includes('opportunity') || filename.includes('scout')) return 'opportunity_scout';
        return 'unknown_agent';
    }

    classifyService(filename) {
        if (filename.includes('universal')) return 'universal_platform';
        if (filename.includes('railway')) return 'railway_service';
        if (filename.includes('server')) return 'web_server';
        if (filename.includes('dashboard')) return 'dashboard_service';
        if (filename.includes('integration')) return 'integration_service';
        if (filename.includes('notion')) return 'notion_service';
        return 'general_service';
    }

    classifyDeployment(filename) {
        if (filename.startsWith('start-')) return 'launcher';
        if (filename.includes('deploy')) return 'deployer';
        if (filename === 'railway.json') return 'railway_config';
        if (filename === 'package.json') return 'npm_config';
        if (filename.startsWith('.env')) return 'environment';
        if (filename === 'Dockerfile') return 'docker_config';
        return 'config_file';
    }

    classifyDashboard(filename) {
        if (filename.includes('super')) return 'super_dashboard';
        if (filename.includes('universal')) return 'universal_dashboard';
        if (filename.includes('opportunity')) return 'opportunity_dashboard';
        if (filename.includes('business')) return 'business_dashboard';
        if (filename.includes('ultra')) return 'ultra_dashboard';
        return 'general_dashboard';
    }

    async checkServiceStatus(filename) {
        // Check if service is currently running by looking for processes
        try {
            const { exec } = require('child_process');
            return new Promise((resolve) => {
                exec(`ps aux | grep "${filename}" | grep -v grep`, (error, stdout) => {
                    resolve(stdout.trim() ? 'running' : 'stopped');
                });
            });
        } catch (error) {
            return 'unknown';
        }
    }

    async extractPort(filePath) {
        try {
            const content = await fs.readFile(filePath, 'utf8');
            const portMatch = content.match(/port.*?(\d{4,5})/i);
            return portMatch ? parseInt(portMatch[1]) : null;
        } catch (error) {
            return null;
        }
    }

    async generateSystemMap() {
        console.log('🗺️ Generating complete system map...');
        
        this.systemMap.set('agents', {
            count: this.agentFiles.size,
            files: Array.from(this.agentFiles.entries()).map(([name, info]) => ({
                name,
                ...info
            })),
            types: this.getTypeCounts(this.agentFiles, 'type')
        });

        this.systemMap.set('services', {
            count: this.serviceFiles.size,
            files: Array.from(this.serviceFiles.entries()).map(([name, info]) => ({
                name,
                ...info
            })),
            types: this.getTypeCounts(this.serviceFiles, 'type')
        });

        this.systemMap.set('deployments', {
            count: this.deploymentFiles.size,
            files: Array.from(this.deploymentFiles.entries()).map(([name, info]) => ({
                name,
                ...info
            })),
            types: this.getTypeCounts(this.deploymentFiles, 'type')
        });

        this.systemMap.set('dashboards', {
            count: this.dashboardFiles.size,
            files: Array.from(this.dashboardFiles.entries()).map(([name, info]) => ({
                name,
                ...info
            })),
            types: this.getTypeCounts(this.dashboardFiles, 'type'),
            ports: Array.from(this.dashboardFiles.values())
                .map(f => f.port)
                .filter(p => p)
        });

        // Add system overview
        this.systemMap.set('overview', {
            totalFiles: this.agentFiles.size + this.serviceFiles.size + this.deploymentFiles.size + this.dashboardFiles.size,
            agentSystem: this.analyzeAgentSystem(),
            serviceArchitecture: this.analyzeServiceArchitecture(),
            deploymentReadiness: this.analyzeDeploymentReadiness(),
            lastScanned: new Date().toISOString()
        });
    }

    getTypeCounts(fileMap, property) {
        const counts = {};
        for (const [name, info] of fileMap.entries()) {
            const type = info[property];
            counts[type] = (counts[type] || 0) + 1;
        }
        return counts;
    }

    analyzeAgentSystem() {
        const agentTypes = this.getTypeCounts(this.agentFiles, 'type');
        
        return {
            totalAgents: this.agentFiles.size,
            agentTypes,
            hasOrchestrator: agentTypes.master_orchestrator > 0,
            hasTradingAgents: agentTypes.trading_agent > 0,
            hasLinkedInAgents: agentTypes.linkedin_agent > 0,
            completeness: this.calculateAgentCompleteness(agentTypes)
        };
    }

    analyzeServiceArchitecture() {
        const serviceTypes = this.getTypeCounts(this.serviceFiles, 'type');
        
        return {
            totalServices: this.serviceFiles.size,
            serviceTypes,
            hasUniversalPlatform: serviceTypes.universal_platform > 0,
            hasRailwayServices: serviceTypes.railway_service > 0,
            hasWebServers: serviceTypes.web_server > 0,
            hasIntegrations: serviceTypes.integration_service > 0
        };
    }

    analyzeDeploymentReadiness() {
        const deploymentTypes = this.getTypeCounts(this.deploymentFiles, 'type');
        
        return {
            totalDeploymentFiles: this.deploymentFiles.size,
            deploymentTypes,
            hasRailwayConfig: deploymentTypes.railway_config > 0,
            hasEnvironmentFiles: deploymentTypes.environment > 0,
            hasLaunchers: deploymentTypes.launcher > 0,
            hasDockerConfig: deploymentTypes.docker_config > 0,
            readiness: this.calculateDeploymentReadiness(deploymentTypes)
        };
    }

    calculateAgentCompleteness(agentTypes) {
        const requiredAgents = [
            'sales_marketing', 'product_generator', 'billing_order',
            'compliance_moderation', 'customer_service', 'analytics_optimization',
            'master_orchestrator'
        ];
        
        const presentAgents = requiredAgents.filter(type => agentTypes[type] > 0);
        return Math.round((presentAgents.length / requiredAgents.length) * 100);
    }

    calculateDeploymentReadiness(deploymentTypes) {
        const requiredFiles = ['railway_config', 'environment', 'launcher', 'npm_config'];
        const presentFiles = requiredFiles.filter(type => deploymentTypes[type] > 0);
        return Math.round((presentFiles.length / requiredFiles.length) * 100);
    }

    getSystemSummary() {
        const overview = this.systemMap.get('overview');
        const agents = this.systemMap.get('agents');
        const services = this.systemMap.get('services');
        const deployments = this.systemMap.get('deployments');
        const dashboards = this.systemMap.get('dashboards');

        return {
            systemHealth: {
                agentCompleteness: overview.agentSystem.completeness,
                deploymentReadiness: overview.deploymentReadiness.readiness,
                serviceCount: services.count,
                dashboardCount: dashboards.count
            },
            fileCounts: {
                totalFiles: overview.totalFiles,
                agents: agents.count,
                services: services.count,
                deployments: deployments.count,
                dashboards: dashboards.count
            },
            capabilities: {
                hasUniversalPlatform: overview.serviceArchitecture.hasUniversalPlatform,
                hasAgentOrchestrator: overview.agentSystem.hasOrchestrator,
                hasTradingSystem: overview.agentSystem.hasTradingAgents,
                hasLinkedInIntegration: overview.agentSystem.hasLinkedInAgents,
                hasRailwayDeployment: overview.deploymentReadiness.hasRailwayConfig
            },
            activePorts: dashboards.ports.filter(p => p),
            lastScanned: overview.lastScanned
        };
    }

    async exportSystemMap(filename = 'system-map.json') {
        try {
            const mapObject = Object.fromEntries(this.systemMap);
            await fs.writeFile(
                path.join(this.basePath, filename),
                JSON.stringify(mapObject, null, 2)
            );
            console.log(`✅ System map exported to ${filename}`);
        } catch (error) {
            console.error('❌ Error exporting system map:', error);
        }
    }
}

// Export for use by Universal Orchestrator
module.exports = SystemDiscoveryAgent;

// Run discovery if called directly
if (require.main === module) {
    async function runDiscovery() {
        const discovery = new SystemDiscoveryAgent();
        await discovery.discoverFullSystem();
        
        console.log('\n📊 SYSTEM DISCOVERY SUMMARY:');
        console.log('═'.repeat(50));
        
        const summary = discovery.getSystemSummary();
        
        console.log(`🎯 System Health:`);
        console.log(`   Agent Completeness: ${summary.systemHealth.agentCompleteness}%`);
        console.log(`   Deployment Readiness: ${summary.systemHealth.deploymentReadiness}%`);
        console.log(`   Active Services: ${summary.systemHealth.serviceCount}`);
        console.log(`   Dashboards: ${summary.systemHealth.dashboardCount}`);
        
        console.log(`\n📁 File Inventory:`);
        console.log(`   Total Files: ${summary.fileCounts.totalFiles}`);
        console.log(`   Agent Files: ${summary.fileCounts.agents}`);
        console.log(`   Service Files: ${summary.fileCounts.services}`);
        console.log(`   Deployment Files: ${summary.fileCounts.deployments}`);
        console.log(`   Dashboard Files: ${summary.fileCounts.dashboards}`);
        
        console.log(`\n🚀 Capabilities:`);
        console.log(`   Universal Platform: ${summary.capabilities.hasUniversalPlatform ? '✅' : '❌'}`);
        console.log(`   Agent Orchestrator: ${summary.capabilities.hasAgentOrchestrator ? '✅' : '❌'}`);
        console.log(`   Trading System: ${summary.capabilities.hasTradingSystem ? '✅' : '❌'}`);
        console.log(`   LinkedIn Integration: ${summary.capabilities.hasLinkedInIntegration ? '✅' : '❌'}`);
        console.log(`   Railway Deployment: ${summary.capabilities.hasRailwayDeployment ? '✅' : '❌'}`);
        
        if (summary.activePorts.length > 0) {
            console.log(`\n🌐 Active Ports: ${summary.activePorts.join(', ')}`);
        }
        
        await discovery.exportSystemMap();
        console.log('\n✅ System discovery complete!');
    }
    
    runDiscovery().catch(console.error);
}