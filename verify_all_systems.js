#!/usr/bin/env node

/**
 * Comprehensive System Verification Script
 * Checks all components of the Neuro.Pilot.AI system
 */

require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');

// Terminal color codes
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

const log = {
    success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
    error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
    warning: (msg) => console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`),
    info: (msg) => console.log(`${colors.cyan}ℹ️  ${msg}${colors.reset}`),
    section: (msg) => console.log(`\n${colors.bright}${colors.blue}=== ${msg} ===${colors.reset}\n`)
};

async function checkFile(filePath, description) {
    try {
        await fs.access(filePath);
        log.success(`${description}: ${filePath}`);
        return true;
    } catch {
        log.error(`${description} not found: ${filePath}`);
        return false;
    }
}

async function checkDirectory(dirPath, description) {
    try {
        const stats = await fs.stat(dirPath);
        if (stats.isDirectory()) {
            log.success(`${description}: ${dirPath}`);
            return true;
        } else {
            log.error(`${description} is not a directory: ${dirPath}`);
            return false;
        }
    } catch {
        log.error(`${description} not found: ${dirPath}`);
        return false;
    }
}

async function checkEnvVariable(varName, description, sensitive = true) {
    const value = process.env[varName];
    if (value) {
        const displayValue = sensitive ? '***' + value.slice(-4) : value;
        log.success(`${description}: ${varName}=${displayValue}`);
        return true;
    } else {
        log.error(`${description} not set: ${varName}`);
        return false;
    }
}

async function checkPackageJson(filePath) {
    try {
        const content = await fs.readFile(filePath, 'utf8');
        const pkg = JSON.parse(content);
        log.success(`Package.json found: ${pkg.name} v${pkg.version}`);
        return pkg;
    } catch (error) {
        log.error(`Failed to read package.json: ${error.message}`);
        return null;
    }
}

async function checkQuantumLearningData() {
    try {
        const content = await fs.readFile('./quantum_learning_data.json', 'utf8');
        const data = JSON.parse(content);
        const recentEntries = data.slice(0, 5);
        log.success(`Quantum learning data: ${data.length} entries found`);
        
        if (recentEntries.length > 0) {
            log.info('Recent quantum learning entries:');
            recentEntries.forEach((entry, i) => {
                console.log(`  ${i + 1}. ${entry.taskType} by ${entry.agentId} - ${entry.success ? 'Success' : 'Failed'}`);
            });
        }
        return true;
    } catch (error) {
        log.error(`Failed to read quantum learning data: ${error.message}`);
        return false;
    }
}

async function verifyAllSystems() {
    console.log(`\n${colors.bright}${colors.cyan}🚀 NEURO.PILOT.AI SYSTEM VERIFICATION${colors.reset}`);
    console.log(`${colors.cyan}=====================================\n${colors.reset}`);

    let totalChecks = 0;
    let passedChecks = 0;

    // Project Information
    log.section('PROJECT INFORMATION');
    const pkg = await checkPackageJson('./package.json');
    if (pkg) {
        totalChecks++;
        passedChecks++;
        log.info(`Description: ${pkg.description}`);
    }

    // Core Files
    log.section('CORE FILES');
    const coreFiles = [
        ['./README.md', 'README documentation'],
        ['./package.json', 'Root package.json'],
        ['./backend/package.json', 'Backend package.json'],
        ['./frontend/package.json', 'Frontend package.json'],
        ['./.env', 'Environment configuration'],
        ['./railway.json', 'Railway deployment config']
    ];

    for (const [file, desc] of coreFiles) {
        totalChecks++;
        if (await checkFile(file, desc)) passedChecks++;
    }

    // Project Directories
    log.section('PROJECT DIRECTORIES');
    const directories = [
        ['./backend', 'Backend directory'],
        ['./frontend', 'Frontend directory'],
        ['./data', 'Data directory'],
        ['./config', 'Configuration directory'],
        ['./uploads', 'Uploads directory'],
        ['./generated_resumes', 'Generated resumes directory'],
        ['./completed_orders', 'Completed orders directory'],
        ['./orders', 'Orders directory']
    ];

    for (const [dir, desc] of directories) {
        totalChecks++;
        if (await checkDirectory(dir, desc)) passedChecks++;
    }

    // Environment Variables
    log.section('ENVIRONMENT VARIABLES');
    const envVars = [
        ['NODE_ENV', 'Node environment', false],
        ['PORT', 'Server port', false],
        ['OPENAI_API_KEY', 'OpenAI API key'],
        ['STRIPE_SECRET_KEY', 'Stripe secret key'],
        ['STRIPE_PUBLISHABLE_KEY', 'Stripe publishable key'],
        ['EMAIL_USER', 'Email username', false],
        ['EMAIL_PASS', 'Email password']
    ];

    for (const [varName, desc, sensitive] of envVars) {
        totalChecks++;
        if (await checkEnvVariable(varName, desc, sensitive !== false)) passedChecks++;
    }

    // Core Server Files
    log.section('CORE SERVER FILES');
    const serverFiles = [
        ['./backend/server.js', 'Main backend server'],
        ['./backend/ai_resume_generator.js', 'AI Resume generator'],
        ['./backend/real_trading_agent.js', 'Trading agent'],
        ['./backend/payment_processor.js', 'Payment processor'],
        ['./backend/customer_service_agent.js', 'Customer service agent'],
        ['./railway-server-production.js', 'Railway production server']
    ];

    for (const [file, desc] of serverFiles) {
        totalChecks++;
        if (await checkFile(file, desc)) passedChecks++;
    }

    // Test Files
    log.section('TEST FILES');
    const testFiles = [
        ['./backend/test_all_systems.js', 'All systems test'],
        ['./backend/test_complete_system.js', 'Complete system test'],
        ['./backend/test_payments.js', 'Payment test'],
        ['./backend/test_resume_system.js', 'Resume system test'],
        ['./test-all-apis.js', 'API configuration test']
    ];

    for (const [file, desc] of testFiles) {
        totalChecks++;
        if (await checkFile(file, desc)) passedChecks++;
    }

    // Quantum Learning System
    log.section('QUANTUM LEARNING SYSTEM');
    totalChecks++;
    if (await checkQuantumLearningData()) passedChecks++;

    // Check Recent Modifications
    log.section('RECENT MODIFICATIONS');
    try {
        const stats = await fs.stat('./quantum_learning_data.json');
        log.info(`Quantum learning data last modified: ${stats.mtime.toLocaleString()}`);
        
        // Check if modified recently (within last hour)
        const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
        if (stats.mtime > hourAgo) {
            log.success('Quantum learning data was recently updated (within last hour)');
        } else {
            log.warning('Quantum learning data has not been updated recently');
        }
    } catch (error) {
        log.error(`Failed to check modification time: ${error.message}`);
    }

    // Summary
    log.section('VERIFICATION SUMMARY');
    const percentage = Math.round((passedChecks / totalChecks) * 100);
    
    console.log(`\n${colors.bright}Total Checks: ${totalChecks}${colors.reset}`);
    console.log(`${colors.green}Passed: ${passedChecks}${colors.reset}`);
    console.log(`${colors.red}Failed: ${totalChecks - passedChecks}${colors.reset}`);
    console.log(`${colors.bright}Success Rate: ${percentage}%${colors.reset}\n`);

    if (percentage === 100) {
        console.log(`${colors.bright}${colors.green}🎉 ALL SYSTEMS VERIFIED SUCCESSFULLY!${colors.reset}`);
        console.log(`${colors.green}The Neuro.Pilot.AI system is fully configured and ready.${colors.reset}`);
    } else if (percentage >= 80) {
        console.log(`${colors.bright}${colors.green}✅ SYSTEM MOSTLY OPERATIONAL${colors.reset}`);
        console.log(`${colors.yellow}Some components need attention, but core functionality should work.${colors.reset}`);
    } else if (percentage >= 60) {
        console.log(`${colors.bright}${colors.yellow}⚠️  SYSTEM PARTIALLY CONFIGURED${colors.reset}`);
        console.log(`${colors.yellow}Several components are missing. Please complete setup.${colors.reset}`);
    } else {
        console.log(`${colors.bright}${colors.red}❌ SYSTEM NOT READY${colors.reset}`);
        console.log(`${colors.red}Critical components are missing. Please follow the setup guide.${colors.reset}`);
    }

    // Recommendations
    if (percentage < 100) {
        log.section('RECOMMENDATIONS');
        
        if (!process.env.OPENAI_API_KEY) {
            log.warning('Set up OpenAI API key for AI resume generation');
        }
        if (!process.env.STRIPE_SECRET_KEY) {
            log.warning('Set up Stripe keys for payment processing');
        }
        if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
            log.warning('Configure email credentials for notifications');
        }
        
        console.log(`\n${colors.cyan}Run the following commands to complete setup:${colors.reset}`);
        console.log('1. cp .env.example .env');
        console.log('2. Edit .env with your API keys');
        console.log('3. npm install');
        console.log('4. cd backend && npm install');
        console.log('5. cd ../frontend && npm install');
        console.log('6. npm run dev (to start development servers)');
    }

    // Available Commands
    log.section('AVAILABLE COMMANDS');
    console.log('npm run dev              - Start development servers');
    console.log('npm run start:railway    - Start Railway production server');
    console.log('npm run test:railway     - Test Railway configuration');
    console.log('node test-all-apis.js    - Test API configurations');
    console.log('npm run build            - Build for production');
    
    console.log(`\n${colors.cyan}For more information, see README.md${colors.reset}\n`);
}

// Run verification
verifyAllSystems().catch(error => {
    console.error(`\n${colors.red}Verification failed: ${error.message}${colors.reset}`);
    process.exit(1);
});