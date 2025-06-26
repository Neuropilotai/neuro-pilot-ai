// Super Agent Connectivity Test - Check all super agents and their capabilities
// Tests connections and functionality of all super agent systems

const axios = require('axios');
const fs = require('fs').promises;

class SuperAgentConnectivityTest {
    constructor() {
        this.superAgents = new Map();
        this.testResults = new Map();
        
        // Define expected super agents based on your system
        this.expectedAgents = [
            {
                name: 'Ultra Enhanced Super Agent',
                expectedPort: 9000,
                endpoints: ['/api/orchestrator/status', '/api/orchestrator/agents', '/'],
                file: 'backend/ultra_enhanced_super_agent.js'
            },
            {
                name: 'Ultra Platform Integration Super Agent',
                expectedPort: 9001,
                endpoints: ['/api/platform/status', '/api/platform/deploy', '/'],
                file: 'backend/ultra_platform_integration_super_agent.js'
            },
            {
                name: 'Ultra Business Dashboard',
                expectedPort: 3010,
                endpoints: ['/api/business/status', '/dashboard', '/'],
                file: 'backend/ultra_business_dashboard.js'
            },
            {
                name: 'Super Trading Agent',
                expectedPort: 8000,
                endpoints: ['/api/trading/status', '/api/signals', '/'],
                file: 'backend/super_trading_agent.js'
            },
            {
                name: 'Super Customer Service Agent',
                expectedPort: 7000,
                endpoints: ['/api/support/status', '/api/chat', '/'],
                file: 'backend/super_customer_service_agent.js'
            },
            {
                name: 'Super Learning AI Agent',
                expectedPort: 6000,
                endpoints: ['/api/learning/status', '/api/train', '/'],
                file: 'backend/super_learning_ai_agent.js'
            }
        ];
    }

    async runFullConnectivityTest() {
        console.log('🔗 Super Agent Connectivity Test Starting...');
        console.log('═'.repeat(60));
        
        // Test each expected agent
        for (const agent of this.expectedAgents) {
            console.log(`\n🤖 Testing ${agent.name}...`);
            await this.testAgent(agent);
        }
        
        // Scan for any other running agents on unexpected ports
        await this.scanForUnknownAgents();
        
        // Generate comprehensive report
        this.generateConnectivityReport();
        
        console.log('\n✅ Super Agent Connectivity Test Complete!');
    }

    async testAgent(agentConfig) {
        const result = {
            name: agentConfig.name,
            file: agentConfig.file,
            expectedPort: agentConfig.expectedPort,
            actualPort: null,
            status: 'unknown',
            endpoints: {},
            capabilities: [],
            errors: [],
            performance: null
        };

        try {
            // Check if file exists
            try {
                await fs.access(`/Users/davidmikulis/neuro-pilot-ai/${agentConfig.file}`);
                result.fileExists = true;
            } catch {
                result.fileExists = false;
                result.errors.push('Agent file not found');
            }

            // Test expected port
            const portResult = await this.testPort(agentConfig.expectedPort, agentConfig.endpoints);
            
            if (portResult.accessible) {
                result.actualPort = agentConfig.expectedPort;
                result.status = 'running';
                result.endpoints = portResult.endpoints;
                result.capabilities = portResult.capabilities;
                result.performance = portResult.performance;
            } else {
                result.status = 'not_running';
                result.errors.push(`Port ${agentConfig.expectedPort} not accessible`);
                
                // Try to find if it's running on a different port
                const alternativePort = await this.findAlternativePort(agentConfig.name);
                if (alternativePort) {
                    result.actualPort = alternativePort;
                    result.status = 'running_different_port';
                    const altResult = await this.testPort(alternativePort, agentConfig.endpoints);
                    result.endpoints = altResult.endpoints;
                    result.capabilities = altResult.capabilities;
                }
            }

        } catch (error) {
            result.status = 'error';
            result.errors.push(error.message);
        }

        this.testResults.set(agentConfig.name, result);
        
        // Display immediate results
        this.displayAgentResult(result);
    }

    async testPort(port, endpoints) {
        const result = {
            accessible: false,
            endpoints: {},
            capabilities: [],
            performance: null
        };

        try {
            // Test basic connectivity
            const response = await axios.get(`http://localhost:${port}`, { 
                timeout: 3000,
                validateStatus: () => true // Accept any status code
            });
            
            result.accessible = true;
            result.endpoints['/'] = {
                status: response.status,
                accessible: response.status < 500
            };

            // Test specific endpoints
            for (const endpoint of endpoints) {
                if (endpoint === '/') continue; // Already tested
                
                try {
                    const endpointResponse = await axios.get(`http://localhost:${port}${endpoint}`, {
                        timeout: 2000,
                        validateStatus: () => true
                    });
                    
                    result.endpoints[endpoint] = {
                        status: endpointResponse.status,
                        accessible: endpointResponse.status < 500,
                        data: endpointResponse.status === 200 ? this.parseResponseData(endpointResponse.data) : null
                    };

                    // Extract capabilities from successful responses
                    if (endpointResponse.status === 200 && endpointResponse.data) {
                        const capabilities = this.extractCapabilities(endpointResponse.data);
                        result.capabilities.push(...capabilities);
                    }

                } catch (error) {
                    result.endpoints[endpoint] = {
                        status: 'error',
                        accessible: false,
                        error: error.message
                    };
                }
            }

            // Calculate performance metrics
            result.performance = this.calculatePerformanceMetrics(result.endpoints);

        } catch (error) {
            result.accessible = false;
            result.error = error.message;
        }

        return result;
    }

    parseResponseData(data) {
        try {
            if (typeof data === 'string') {
                // Try to parse JSON
                if (data.trim().startsWith('{')) {
                    return JSON.parse(data);
                }
                // Return truncated HTML/text
                return data.length > 200 ? data.substring(0, 200) + '...' : data;
            }
            return data;
        } catch {
            return 'Unable to parse response data';
        }
    }

    extractCapabilities(data) {
        const capabilities = [];
        
        if (typeof data === 'object') {
            // Look for capability indicators in JSON responses
            if (data.agents) capabilities.push('agent_management');
            if (data.orchestrator) capabilities.push('orchestration');
            if (data.platform) capabilities.push('platform_integration');
            if (data.trading) capabilities.push('trading_signals');
            if (data.learning) capabilities.push('machine_learning');
            if (data.support || data.chat) capabilities.push('customer_support');
            if (data.status === 'operational') capabilities.push('operational');
        } else if (typeof data === 'string') {
            // Look for capability indicators in HTML/text
            if (data.includes('agent')) capabilities.push('agent_system');
            if (data.includes('dashboard')) capabilities.push('dashboard_interface');
            if (data.includes('trading')) capabilities.push('trading_features');
            if (data.includes('learning')) capabilities.push('learning_features');
        }
        
        return capabilities;
    }

    calculatePerformanceMetrics(endpoints) {
        const totalEndpoints = Object.keys(endpoints).length;
        const accessibleEndpoints = Object.values(endpoints).filter(e => e.accessible).length;
        
        return {
            accessibility: totalEndpoints > 0 ? Math.round((accessibleEndpoints / totalEndpoints) * 100) : 0,
            endpointCount: totalEndpoints,
            accessibleCount: accessibleEndpoints,
            healthScore: accessibleEndpoints > 0 ? 'healthy' : 'unhealthy'
        };
    }

    async findAlternativePort(agentName) {
        // Check common alternative ports
        const commonPorts = [3000, 3001, 3008, 3010, 3011, 3012, 3013, 6000, 7000, 8000, 9000, 9001, 9002];
        
        for (const port of commonPorts) {
            try {
                const response = await axios.get(`http://localhost:${port}`, { 
                    timeout: 1000,
                    validateStatus: () => true
                });
                
                // Check if response indicates this might be the agent we're looking for
                const data = response.data.toString().toLowerCase();
                const nameWords = agentName.toLowerCase().split(' ');
                
                if (nameWords.some(word => data.includes(word))) {
                    return port;
                }
            } catch {
                // Port not accessible, continue
            }
        }
        
        return null;
    }

    async scanForUnknownAgents() {
        console.log('\n🔍 Scanning for unknown super agents...');
        
        const portsToScan = [3000, 3001, 3008, 3010, 3011, 3012, 3013, 6000, 7000, 8000, 9000, 9001, 9002];
        const knownPorts = new Set(this.expectedAgents.map(a => a.expectedPort));
        
        for (const port of portsToScan) {
            if (knownPorts.has(port)) continue; // Skip known agents
            
            try {
                const response = await axios.get(`http://localhost:${port}`, { 
                    timeout: 1000,
                    validateStatus: () => true
                });
                
                if (response.status < 500) {
                    console.log(`   🔍 Found unknown service on port ${port}`);
                    const data = response.data.toString();
                    
                    // Try to identify what it is
                    let serviceType = 'unknown';
                    if (data.includes('super') || data.includes('agent')) serviceType = 'possible_super_agent';
                    if (data.includes('dashboard')) serviceType = 'dashboard';
                    if (data.includes('trading')) serviceType = 'trading_service';
                    if (data.includes('universal')) serviceType = 'universal_platform';
                    
                    this.testResults.set(`Unknown Service (Port ${port})`, {
                        name: `Unknown Service (Port ${port})`,
                        actualPort: port,
                        status: 'running',
                        serviceType,
                        endpoints: { '/': { status: response.status, accessible: true } },
                        capabilities: this.extractCapabilities(data)
                    });
                }
            } catch {
                // Port not accessible
            }
        }
    }

    displayAgentResult(result) {
        const statusIcon = result.status === 'running' ? '✅' : 
                          result.status === 'not_running' ? '❌' : 
                          result.status === 'running_different_port' ? '⚠️' : '❓';
        
        console.log(`   ${statusIcon} Status: ${result.status}`);
        console.log(`   📁 File exists: ${result.fileExists ? '✅' : '❌'}`);
        
        if (result.actualPort) {
            console.log(`   🌐 Port: ${result.actualPort}${result.actualPort !== result.expectedPort ? ` (expected ${result.expectedPort})` : ''}`);
        }
        
        if (result.capabilities.length > 0) {
            console.log(`   🎯 Capabilities: ${result.capabilities.join(', ')}`);
        }
        
        if (result.performance) {
            console.log(`   📊 Health: ${result.performance.healthScore} (${result.performance.accessibility}% endpoints accessible)`);
        }
        
        if (result.errors.length > 0) {
            console.log(`   ⚠️ Issues: ${result.errors.join(', ')}`);
        }
    }

    generateConnectivityReport() {
        console.log('\n📊 SUPER AGENT CONNECTIVITY REPORT');
        console.log('═'.repeat(60));
        
        const results = Array.from(this.testResults.values());
        const runningAgents = results.filter(r => r.status === 'running' || r.status === 'running_different_port');
        const notRunningAgents = results.filter(r => r.status === 'not_running');
        const errorAgents = results.filter(r => r.status === 'error');
        
        console.log(`📈 Summary:`);
        console.log(`   ✅ Running: ${runningAgents.length}`);
        console.log(`   ❌ Not Running: ${notRunningAgents.length}`);
        console.log(`   ❓ Errors: ${errorAgents.length}`);
        console.log(`   🔍 Total Discovered: ${results.length}`);
        
        if (runningAgents.length > 0) {
            console.log(`\n🚀 Active Super Agents:`);
            runningAgents.forEach(agent => {
                console.log(`   • ${agent.name} (Port ${agent.actualPort})`);
                if (agent.capabilities.length > 0) {
                    console.log(`     Capabilities: ${agent.capabilities.join(', ')}`);
                }
            });
        }
        
        if (notRunningAgents.length > 0) {
            console.log(`\n⚠️ Inactive Super Agents:`);
            notRunningAgents.forEach(agent => {
                console.log(`   • ${agent.name} - ${agent.errors.join(', ')}`);
            });
        }
        
        // Calculate overall system health
        const systemHealth = this.calculateSystemHealth(results);
        console.log(`\n🎯 Overall System Health: ${systemHealth.score}% (${systemHealth.status})`);
        
        // Provide recommendations
        this.generateRecommendations(results);
    }

    calculateSystemHealth(results) {
        const totalAgents = results.length;
        const healthyAgents = results.filter(r => 
            r.status === 'running' && 
            r.performance && 
            r.performance.healthScore === 'healthy'
        ).length;
        
        const score = totalAgents > 0 ? Math.round((healthyAgents / totalAgents) * 100) : 0;
        
        let status = 'Critical';
        if (score >= 80) status = 'Excellent';
        else if (score >= 60) status = 'Good';
        else if (score >= 40) status = 'Fair';
        else if (score >= 20) status = 'Poor';
        
        return { score, status };
    }

    generateRecommendations(results) {
        console.log(`\n💡 Recommendations:`);
        
        const notRunning = results.filter(r => r.status === 'not_running');
        if (notRunning.length > 0) {
            console.log(`   🔧 Start inactive agents:`);
            notRunning.forEach(agent => {
                if (agent.fileExists) {
                    console.log(`     node ${agent.file}`);
                }
            });
        }
        
        const runningAgents = results.filter(r => r.status === 'running' || r.status === 'running_different_port');
        if (runningAgents.length > 0) {
            console.log(`   🌐 Access running agents:`);
            runningAgents.forEach(agent => {
                if (agent.actualPort) {
                    console.log(`     ${agent.name}: http://localhost:${agent.actualPort}`);
                }
            });
        }
        
        console.log(`   🔗 Integrate with Universal Orchestrator for centralized management`);
    }
}

// Run the connectivity test
if (require.main === module) {
    const tester = new SuperAgentConnectivityTest();
    tester.runFullConnectivityTest().catch(console.error);
}

module.exports = SuperAgentConnectivityTest;