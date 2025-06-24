#!/usr/bin/env node

/**
 * NEURO-PILOT-AI COMPLETE DEPLOYMENT CONTROL SYSTEM LAUNCHER
 * Starts all deployment control components and tests the complete system
 */

const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const http = require('http');

class CompleteDeploymentSystemLauncher {
    constructor() {
        this.processes = new Map();
        this.config = {
            ports: {
                deployment_control: 3008,
                webhook_integration: 3009,
                main_backend: 3007
            },
            startup_delay: 3000, // 3 seconds between service starts
            health_check_interval: 5000, // 5 seconds
            max_startup_time: 60000 // 60 seconds max startup time
        };
        this.services = [
            {
                name: 'Deployment Control System',
                script: 'start_deployment_control.js',
                port: this.config.ports.deployment_control,
                health_endpoint: '/health'
            },
            {
                name: 'Webhook Integration Server',
                script: 'webhook_integration_server.js', 
                port: this.config.ports.webhook_integration,
                health_endpoint: '/health'
            }
        ];
    }

    log(message, type = 'info') {
        const colors = {
            info: '\x1b[36m',    // cyan
            success: '\x1b[32m', // green
            warning: '\x1b[33m', // yellow
            error: '\x1b[31m',   // red
            reset: '\x1b[0m'
        };
        
        const timestamp = new Date().toLocaleTimeString();
        console.log(`${colors[type]}[${timestamp}] ${message}${colors.reset}`);
    }

    // HTTP request helper to replace fetch
    httpRequest(url, options = {}) {
        return new Promise((resolve, reject) => {
            const parsedUrl = new URL(url);
            const requestOptions = {
                hostname: parsedUrl.hostname,
                port: parsedUrl.port,
                path: parsedUrl.pathname + parsedUrl.search,
                method: options.method || 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    ...(options.headers || {})
                }
            };

            const req = http.request(requestOptions, (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    try {
                        const jsonData = JSON.parse(data);
                        resolve({ ok: res.statusCode === 200, json: () => jsonData, statusCode: res.statusCode });
                    } catch (error) {
                        resolve({ ok: false, json: () => data, statusCode: res.statusCode });
                    }
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            if (options.body) {
                req.write(options.body);
            }

            req.end();
        });
    }

    async startService(service) {
        return new Promise((resolve, reject) => {
            this.log(`Starting ${service.name}...`, 'info');
            
            const child = spawn('node', [service.script], {
                cwd: __dirname,
                stdio: 'pipe',
                env: { ...process.env, PORT: service.port }
            });

            // Store process reference
            this.processes.set(service.name, child);

            // Handle output
            child.stdout.on('data', (data) => {
                const output = data.toString().trim();
                if (output) {
                    this.log(`[${service.name}] ${output}`, 'info');
                }
            });

            child.stderr.on('data', (data) => {
                const output = data.toString().trim();
                if (output) {
                    this.log(`[${service.name}] ERROR: ${output}`, 'error');
                }
            });

            child.on('error', (error) => {
                this.log(`Failed to start ${service.name}: ${error.message}`, 'error');
                reject(error);
            });

            child.on('exit', (code, signal) => {
                this.log(`${service.name} exited with code ${code} (signal: ${signal})`, 'warning');
                this.processes.delete(service.name);
            });

            // Wait a bit for the service to start
            setTimeout(() => {
                resolve(child);
            }, this.config.startup_delay);
        });
    }

    async checkServiceHealth(service, maxRetries = 12) {
        const url = `http://localhost:${service.port}${service.health_endpoint}`;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await this.httpRequest(url);
                
                if (response.ok) {
                    const health = await response.json();
                    this.log(`✅ ${service.name} is healthy (${health.status})`, 'success');
                    return true;
                }
                
            } catch (error) {
                if (attempt === maxRetries) {
                    this.log(`❌ ${service.name} health check failed after ${maxRetries} attempts`, 'error');
                    return false;
                }
                
                this.log(`Health check attempt ${attempt}/${maxRetries} for ${service.name}...`, 'info');
                await new Promise(resolve => setTimeout(resolve, this.config.health_check_interval));
            }
        }
        
        return false;
    }

    async startAllServices() {
        this.log('🚀 Starting Complete Deployment Control System...', 'info');
        this.log('═'.repeat(60), 'info');

        const startupResults = [];

        for (const service of this.services) {
            try {
                // Start service
                await this.startService(service);
                
                // Check health
                const isHealthy = await this.checkServiceHealth(service);
                
                startupResults.push({
                    service: service.name,
                    status: isHealthy ? 'healthy' : 'unhealthy',
                    port: service.port
                });

            } catch (error) {
                this.log(`Failed to start ${service.name}: ${error.message}`, 'error');
                startupResults.push({
                    service: service.name,
                    status: 'failed',
                    error: error.message
                });
            }
        }

        return startupResults;
    }

    async testSystemIntegration() {
        this.log('\n🧪 Testing System Integration...', 'info');
        this.log('═'.repeat(50), 'info');

        const tests = [
            {
                name: 'Deployment Control API',
                test: () => this.testDeploymentControlAPI()
            },
            {
                name: 'Webhook Integration',
                test: () => this.testWebhookIntegration()
            },
            {
                name: 'Gig Approval Workflow',
                test: () => this.testGigApprovalWorkflow()
            },
            {
                name: 'Notification System',
                test: () => this.testNotificationSystem()
            },
            {
                name: 'CLI Integration',
                test: () => this.testCLIIntegration()
            }
        ];

        const testResults = [];

        for (const test of tests) {
            try {
                this.log(`Testing ${test.name}...`, 'info');
                const result = await test.test();
                
                if (result.success) {
                    this.log(`✅ ${test.name}: PASSED`, 'success');
                } else {
                    this.log(`❌ ${test.name}: FAILED - ${result.error}`, 'error');
                }
                
                testResults.push({
                    name: test.name,
                    ...result
                });

            } catch (error) {
                this.log(`❌ ${test.name}: ERROR - ${error.message}`, 'error');
                testResults.push({
                    name: test.name,
                    success: false,
                    error: error.message
                });
            }
        }

        return testResults;
    }

    async testDeploymentControlAPI() {
        try {
            // Test health endpoint
            const healthResponse = await this.httpRequest(`http://localhost:${this.config.ports.deployment_control}/health`);
            if (!healthResponse.ok) {
                return { success: false, error: 'Health endpoint not responding' };
            }

            // Test status endpoint
            const statusResponse = await this.httpRequest(`http://localhost:${this.config.ports.deployment_control}/api/status`);
            if (!statusResponse.ok) {
                return { success: false, error: 'Status endpoint not responding' };
            }

            const status = await statusResponse.json();
            
            // Test pending gigs endpoint
            const gigsResponse = await this.httpRequest(`http://localhost:${this.config.ports.deployment_control}/api/gigs/pending`);
            if (!gigsResponse.ok) {
                return { success: false, error: 'Pending gigs endpoint not responding' };
            }

            return { 
                success: true, 
                message: 'All API endpoints responding correctly',
                data: { status: status.deployment_control?.status }
            };

        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async testWebhookIntegration() {
        try {
            // Test webhook health
            const healthResponse = await this.httpRequest(`http://localhost:${this.config.ports.webhook_integration}/health`);
            if (!healthResponse.ok) {
                return { success: false, error: 'Webhook server not responding' };
            }

            // Test webhook endpoints list
            const listResponse = await this.httpRequest(
                `http://localhost:${this.config.ports.webhook_integration}/webhook/list?api_key=neuro-pilot-webhook-key`
            );
            if (!listResponse.ok) {
                return { success: false, error: 'Webhook list endpoint not responding' };
            }

            // Test webhook functionality
            const testResponse = await this.httpRequest(
                `http://localhost:${this.config.ports.webhook_integration}/webhook/test`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-API-Key': 'neuro-pilot-webhook-key'
                    },
                    body: JSON.stringify({
                        test_type: 'integration_test',
                        timestamp: new Date().toISOString()
                    })
                }
            );

            if (!testResponse.ok) {
                return { success: false, error: 'Test webhook failed' };
            }

            return { 
                success: true, 
                message: 'Webhook integration working correctly'
            };

        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async testGigApprovalWorkflow() {
        try {
            // Simulate gig creation
            const testGig = {
                id: `test_gig_${Date.now()}`,
                title: 'Test AI Service',
                description: 'Integration test gig',
                price: 99,
                agent: 'Product Generator Agent',
                risk_score: 'LOW'
            };

            // Test gig submission via webhook
            const submitResponse = await this.httpRequest(
                `http://localhost:${this.config.ports.webhook_integration}/webhook/internal/gig-created`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-API-Key': 'neuro-pilot-webhook-key'
                    },
                    body: JSON.stringify(testGig)
                }
            );

            if (!submitResponse.ok) {
                return { success: false, error: 'Failed to submit test gig' };
            }

            return { 
                success: true, 
                message: 'Gig approval workflow functioning',
                data: { test_gig_id: testGig.id }
            };

        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async testNotificationSystem() {
        try {
            // Test notification via webhook
            const notificationResponse = await this.httpRequest(
                `http://localhost:${this.config.ports.webhook_integration}/webhook/external/notification`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-API-Key': 'neuro-pilot-webhook-key'
                    },
                    body: JSON.stringify({
                        type: 'integration_test',
                        message: '🧪 Testing notification system integration',
                        urgency: 'low'
                    })
                }
            );

            if (!notificationResponse.ok) {
                return { success: false, error: 'Notification endpoint not responding' };
            }

            return { 
                success: true, 
                message: 'Notification system responsive'
            };

        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async testCLIIntegration() {
        try {
            // Check if CLI tool exists and is executable
            const cliPath = path.join(__dirname, 'gig-control');
            
            try {
                await fs.access(cliPath, fs.constants.F_OK | fs.constants.X_OK);
            } catch (error) {
                return { success: false, error: 'CLI tool not found or not executable' };
            }

            return { 
                success: true, 
                message: 'CLI tool available and executable'
            };

        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async generateSystemReport(startupResults, testResults) {
        const report = {
            timestamp: new Date().toISOString(),
            system: 'Neuro-Pilot-AI Deployment Control System',
            version: '1.0.0',
            startup_results: startupResults,
            integration_tests: testResults,
            summary: {
                services_started: startupResults.filter(r => r.status === 'healthy').length,
                total_services: startupResults.length,
                tests_passed: testResults.filter(r => r.success).length,
                total_tests: testResults.length,
                overall_status: this.calculateOverallStatus(startupResults, testResults)
            },
            endpoints: {
                deployment_dashboard: `http://localhost:${this.config.ports.deployment_control}/dashboard`,
                deployment_api: `http://localhost:${this.config.ports.deployment_control}/api/status`,
                webhook_integration: `http://localhost:${this.config.ports.webhook_integration}/webhook/list`,
                cli_tool: './gig-control --help'
            },
            next_steps: this.generateNextSteps(startupResults, testResults)
        };

        // Save report
        const reportsDir = path.join(__dirname, 'reports');
        await fs.mkdir(reportsDir, { recursive: true });
        
        const reportPath = path.join(reportsDir, `deployment_system_test_${Date.now()}.json`);
        await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

        return { report, reportPath };
    }

    calculateOverallStatus(startupResults, testResults) {
        const healthyServices = startupResults.filter(r => r.status === 'healthy').length;
        const passedTests = testResults.filter(r => r.success).length;
        
        if (healthyServices === startupResults.length && passedTests === testResults.length) {
            return 'FULLY_OPERATIONAL';
        } else if (healthyServices >= startupResults.length * 0.8 && passedTests >= testResults.length * 0.8) {
            return 'MOSTLY_OPERATIONAL';
        } else if (healthyServices >= startupResults.length * 0.5) {
            return 'PARTIALLY_OPERATIONAL';
        } else {
            return 'CRITICAL_ISSUES';
        }
    }

    generateNextSteps(startupResults, testResults) {
        const steps = [];
        
        // Check for failed services
        const failedServices = startupResults.filter(r => r.status !== 'healthy');
        if (failedServices.length > 0) {
            steps.push(`Fix ${failedServices.length} failed service(s): ${failedServices.map(s => s.service).join(', ')}`);
        }

        // Check for failed tests
        const failedTests = testResults.filter(r => !r.success);
        if (failedTests.length > 0) {
            steps.push(`Address ${failedTests.length} failed test(s): ${failedTests.map(t => t.name).join(', ')}`);
        }

        // Add standard next steps
        if (steps.length === 0) {
            steps.push('✅ All systems operational - Ready for production use');
            steps.push('🔗 Connect Notion workspace for gig approval workflow');
            steps.push('📧 Configure email/Slack notifications in environment variables');
            steps.push('🔗 Set up Zapier/n8n integrations using webhook endpoints');
        }

        return steps;
    }

    displayResults(startupResults, testResults, report) {
        this.log('\n📊 DEPLOYMENT SYSTEM TEST RESULTS', 'info');
        this.log('═'.repeat(60), 'info');

        // Service status
        this.log('\n🖥️  SERVICE STATUS:', 'info');
        startupResults.forEach(result => {
            const status = result.status === 'healthy' ? '✅' : '❌';
            const color = result.status === 'healthy' ? 'success' : 'error';
            this.log(`   ${status} ${result.service} (port ${result.port})`, color);
        });

        // Test results
        this.log('\n🧪 INTEGRATION TESTS:', 'info');
        testResults.forEach(result => {
            const status = result.success ? '✅' : '❌';
            const color = result.success ? 'success' : 'error';
            this.log(`   ${status} ${result.name}`, color);
        });

        // Summary
        this.log(`\n📈 SUMMARY:`, 'info');
        this.log(`   Services: ${report.summary.services_started}/${report.summary.total_services} healthy`, 'info');
        this.log(`   Tests: ${report.summary.tests_passed}/${report.summary.total_tests} passed`, 'info');
        this.log(`   Status: ${report.summary.overall_status}`, 
                 report.summary.overall_status === 'FULLY_OPERATIONAL' ? 'success' : 'warning');

        // Endpoints
        this.log('\n🌐 AVAILABLE ENDPOINTS:', 'info');
        Object.entries(report.endpoints).forEach(([name, url]) => {
            this.log(`   ${name}: ${url}`, 'info');
        });

        // Next steps
        this.log('\n🎯 NEXT STEPS:', 'info');
        report.next_steps.forEach((step, index) => {
            this.log(`   ${index + 1}. ${step}`, 'info');
        });

        this.log('\n═'.repeat(60), 'info');
        this.log('🚀 Neuro-Pilot-AI Deployment Control System Ready!', 'success');
    }

    async shutdown() {
        this.log('\n🛑 Shutting down all services...', 'warning');
        
        for (const [name, process] of this.processes) {
            this.log(`Stopping ${name}...`, 'info');
            process.kill('SIGTERM');
        }

        // Wait a bit for graceful shutdown
        setTimeout(() => {
            process.exit(0);
        }, 3000);
    }

    async start() {
        try {
            // Start all services
            const startupResults = await this.startAllServices();
            
            // Run integration tests
            const testResults = await this.testSystemIntegration();
            
            // Generate and display report
            const { report, reportPath } = await this.generateSystemReport(startupResults, testResults);
            this.displayResults(startupResults, testResults, report);
            
            this.log(`\n📄 Full report saved to: ${reportPath}`, 'info');

            // Keep the system running
            this.log('\n⏱️  System will continue running. Press Ctrl+C to shutdown.', 'info');

            // Setup graceful shutdown
            process.on('SIGINT', () => this.shutdown());
            process.on('SIGTERM', () => this.shutdown());

        } catch (error) {
            this.log(`❌ System startup failed: ${error.message}`, 'error');
            process.exit(1);
        }
    }
}

// Start the complete system if run directly
if (require.main === module) {
    const launcher = new CompleteDeploymentSystemLauncher();
    launcher.start();
}

module.exports = CompleteDeploymentSystemLauncher;