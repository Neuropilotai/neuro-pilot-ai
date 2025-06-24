#!/usr/bin/env node

/**
 * Test Pipeline for Neuro-Pilot-AI Resume Service
 * Tests the complete end-to-end automated workflow
 */

const NotionAgentIntegration = require('./notion-agent-integration');
const AutomatedResumeWorkflow = require('./automated-resume-workflow');
require('dotenv').config();

class TestPipeline {
    constructor() {
        this.notionAgent = new NotionAgentIntegration();
        this.testOrderId = `test_order_${Date.now()}`;
        this.testResults = [];
    }

    async runTests() {
        console.log('🧪 Starting Neuro-Pilot-AI Pipeline Tests...\n');

        const tests = [
            { name: 'Environment Variables', fn: this.testEnvironmentVariables },
            { name: 'Notion Connection', fn: this.testNotionConnection },
            { name: 'OpenAI Connection', fn: this.testOpenAIConnection },
            { name: 'Database Creation', fn: this.testDatabaseCreation },
            { name: 'Template Retrieval', fn: this.testTemplateRetrieval },
            { name: 'Order Creation', fn: this.testOrderCreation },
            { name: 'Resume Generation', fn: this.testResumeGeneration },
            { name: 'Order Status Updates', fn: this.testOrderStatusUpdates },
            { name: 'Complete Workflow', fn: this.testCompleteWorkflow },
        ];

        for (const test of tests) {
            await this.runTest(test.name, test.fn.bind(this));
        }

        this.printResults();
    }

    async runTest(testName, testFn) {
        try {
            console.log(`🔍 Testing: ${testName}...`);
            await testFn();
            console.log(`✅ ${testName}: PASSED\n`);
            this.testResults.push({ name: testName, status: 'PASSED' });
        } catch (error) {
            console.log(`❌ ${testName}: FAILED`);
            console.log(`   Error: ${error.message}\n`);
            this.testResults.push({ name: testName, status: 'FAILED', error: error.message });
        }
    }

    async testEnvironmentVariables() {
        const requiredVars = [
            'NOTION_TOKEN',
            'OPENAI_API_KEY',
            'STRIPE_SECRET_KEY',
        ];

        for (const varName of requiredVars) {
            if (!process.env[varName]) {
                throw new Error(`Missing required environment variable: ${varName}`);
            }
        }

        console.log('   ✓ All required environment variables are set');
    }

    async testNotionConnection() {
        try {
            const response = await this.notionAgent.notion.users.me();
            console.log(`   ✓ Connected to Notion as: ${response.name || 'Unknown'}`);
        } catch (error) {
            throw new Error(`Notion connection failed: ${error.message}`);
        }
    }

    async testOpenAIConnection() {
        try {
            const response = await this.notionAgent.openai.models.list();
            console.log(`   ✓ OpenAI connection successful, ${response.data.length} models available`);
        } catch (error) {
            throw new Error(`OpenAI connection failed: ${error.message}`);
        }
    }

    async testDatabaseCreation() {
        // Test if we can query the databases (they should exist)
        try {
            if (!process.env.NOTION_RESUME_DATABASE_ID) {
                throw new Error('NOTION_RESUME_DATABASE_ID not set');
            }

            const response = await this.notionAgent.notion.databases.query({
                database_id: process.env.NOTION_RESUME_DATABASE_ID,
                page_size: 1,
            });

            console.log('   ✓ Resume database accessible');
        } catch (error) {
            throw new Error(`Database access failed: ${error.message}`);
        }
    }

    async testTemplateRetrieval() {
        try {
            const template = await this.notionAgent.getResumeTemplate('Technology', 'Mid Level');
            
            if (!template || template.length < 100) {
                throw new Error('Template content seems insufficient');
            }

            console.log(`   ✓ Template retrieved successfully (${template.length} characters)`);
        } catch (error) {
            throw new Error(`Template retrieval failed: ${error.message}`);
        }
    }

    async testOrderCreation() {
        const testOrderData = {
            orderId: this.testOrderId,
            customerEmail: 'test@example.com',
            serviceType: 'Professional Resume',
            paymentStatus: 'Paid',
            amount: 49,
            customerInfo: {
                name: 'John Doe',
                email: 'test@example.com',
                industry: 'Technology',
                experienceLevel: 'Mid Level',
                currentRole: 'Software Engineer',
                targetRole: 'Senior Software Engineer',
                keySkills: 'JavaScript, React, Node.js, Python',
                achievements: 'Led team of 5 developers, increased performance by 40%',
                education: 'BS Computer Science, State University, 2020',
                certifications: 'AWS Certified Developer',
            },
        };

        try {
            await this.notionAgent.createResumeOrder(testOrderData);
            console.log(`   ✓ Test order created: ${this.testOrderId}`);
        } catch (error) {
            throw new Error(`Order creation failed: ${error.message}`);
        }
    }

    async testResumeGeneration() {
        const testCustomerInfo = {
            name: 'John Doe',
            email: 'test@example.com',
            industry: 'Technology',
            experienceLevel: 'Mid Level',
            currentRole: 'Software Engineer',
            targetRole: 'Senior Software Engineer',
            keySkills: 'JavaScript, React, Node.js, Python',
            achievements: 'Led team of 5 developers, increased performance by 40%',
            education: 'BS Computer Science, State University, 2020',
            certifications: 'AWS Certified Developer',
        };

        try {
            const template = await this.notionAgent.getResumeTemplate('Technology', 'Mid Level');
            const resume = await this.notionAgent.generateResumeWithAI(testCustomerInfo, template);
            
            if (!resume || resume.length < 500) {
                throw new Error('Generated resume seems too short');
            }

            console.log(`   ✓ Resume generated successfully (${resume.length} characters)`);
            console.log(`   ✓ Resume contains key information: ${resume.includes('John Doe') ? 'Yes' : 'No'}`);
        } catch (error) {
            throw new Error(`Resume generation failed: ${error.message}`);
        }
    }

    async testOrderStatusUpdates() {
        try {
            // Update to In Progress
            await this.notionAgent.updateOrderStatus(this.testOrderId, 'In Progress');
            console.log('   ✓ Status updated to In Progress');

            // Update to Completed with resume content
            await this.notionAgent.updateOrderStatus(this.testOrderId, 'Completed', {
                resumeContent: 'Test resume content for pipeline test',
            });
            console.log('   ✓ Status updated to Completed with content');

        } catch (error) {
            throw new Error(`Status update failed: ${error.message}`);
        }
    }

    async testCompleteWorkflow() {
        const workflowTestOrderId = `workflow_test_${Date.now()}`;
        
        try {
            // Create a new test order
            const testOrderData = {
                orderId: workflowTestOrderId,
                customerEmail: 'workflow-test@example.com',
                serviceType: 'Professional Resume',
                paymentStatus: 'Paid',
                amount: 49,
                customerInfo: {
                    name: 'Jane Smith',
                    email: 'workflow-test@example.com',
                    industry: 'Technology',
                    experienceLevel: 'Senior Level',
                    currentRole: 'Senior Software Engineer',
                    targetRole: 'Engineering Manager',
                    keySkills: 'Leadership, JavaScript, System Design, Team Management',
                    achievements: 'Built scalable systems serving 1M+ users, mentored 10+ junior developers',
                    education: 'MS Computer Science, Tech University, 2018',
                    certifications: 'AWS Solutions Architect, PMP',
                },
            };

            await this.notionAgent.createResumeOrder(testOrderData);
            console.log(`   ✓ Workflow test order created: ${workflowTestOrderId}`);

            // Process the order through the complete workflow
            const resumeContent = await this.notionAgent.processResumeOrder(workflowTestOrderId);
            
            if (!resumeContent || resumeContent.length < 500) {
                throw new Error('Workflow did not generate proper resume content');
            }

            console.log(`   ✓ Complete workflow successful (${resumeContent.length} characters)`);
            console.log(`   ✓ Resume contains customer name: ${resumeContent.includes('Jane Smith') ? 'Yes' : 'No'}`);

        } catch (error) {
            throw new Error(`Complete workflow failed: ${error.message}`);
        }
    }

    printResults() {
        console.log('\n📊 Test Results Summary');
        console.log('========================');
        
        const passed = this.testResults.filter(r => r.status === 'PASSED').length;
        const failed = this.testResults.filter(r => r.status === 'FAILED').length;
        
        console.log(`Total Tests: ${this.testResults.length}`);
        console.log(`Passed: ${passed} ✅`);
        console.log(`Failed: ${failed} ❌`);
        
        if (failed > 0) {
            console.log('\nFailed Tests:');
            this.testResults
                .filter(r => r.status === 'FAILED')
                .forEach(r => {
                    console.log(`❌ ${r.name}: ${r.error}`);
                });
        }

        console.log('\n' + (failed === 0 ? 
            '🎉 All tests passed! Your Neuro-Pilot-AI system is ready for production.' :
            '⚠️  Some tests failed. Please fix the issues before deploying.'));

        if (failed === 0) {
            console.log('\n🚀 Next Steps:');
            console.log('1. Set up production environment variables');
            console.log('2. Configure Stripe webhooks for your domain');
            console.log('3. Deploy the service to your hosting platform');
            console.log('4. Launch your first automated resume gig!');
        }
    }

    async cleanup() {
        console.log('\n🧹 Cleaning up test data...');
        
        try {
            // You could add cleanup logic here to remove test orders
            // For now, we'll just log the test order IDs
            console.log(`Test orders created: ${this.testOrderId}, workflow_test_*`);
            console.log('✓ Test data logged for manual cleanup if needed');
        } catch (error) {
            console.log('⚠️  Cleanup warning:', error.message);
        }
    }
}

// Run tests if called directly
if (require.main === module) {
    const testPipeline = new TestPipeline();
    
    testPipeline.runTests()
        .then(() => testPipeline.cleanup())
        .then(() => process.exit(0))
        .catch(error => {
            console.error('❌ Test pipeline failed:', error);
            process.exit(1);
        });
}

module.exports = TestPipeline;