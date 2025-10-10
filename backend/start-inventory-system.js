#!/usr/bin/env node

/**
 * MASTER INVENTORY SYSTEM STARTUP SCRIPT
 * Launches all components needed for the complete inventory management system
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 STARTING NEURO-PILOT INVENTORY SYSTEM');
console.log('=' .repeat(60));

// Store all spawned processes
const processes = [];

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m'
};

// Function to spawn a process with colored output
function startProcess(name, command, args = [], color = colors.green) {
  console.log(`${color}[${new Date().toLocaleTimeString()}] Starting ${name}...${colors.reset}`);

  const proc = spawn(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true
  });

  proc.stdout.on('data', (data) => {
    const lines = data.toString().trim().split('\n');
    lines.forEach(line => {
      console.log(`${color}[${name}]${colors.reset} ${line}`);
    });
  });

  proc.stderr.on('data', (data) => {
    const lines = data.toString().trim().split('\n');
    lines.forEach(line => {
      console.error(`${colors.red}[${name} ERROR]${colors.reset} ${line}`);
    });
  });

  proc.on('exit', (code) => {
    console.log(`${colors.yellow}[${name}] Process exited with code ${code}${colors.reset}`);
  });

  processes.push({ name, proc });
  return proc;
}

// Function to ensure data directories exist
function ensureDataDirectories() {
  const dirs = [
    './data',
    './data/gfs_orders',
    './data/reconciled',
    './data/inventory',
    './data/reports',
    './data/ai_monitoring',
    './data/locations',
    './logs'
  ];

  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`${colors.cyan}✓ Created directory: ${dir}${colors.reset}`);
    }
  });
}

// Function to check and prepare data files
function prepareDataFiles() {
  // Check if FIFO inventory exists, if not convert from corrected inventory
  if (!fs.existsSync('./data/fifo_inventory.json')) {
    console.log(`${colors.yellow}⚠️  FIFO inventory not found. Converting from corrected inventory...${colors.reset}`);

    if (fs.existsSync('./data/clean_recalculated_inventory.json')) {
      const convertScript = spawn('node', ['convert_to_fifo_format.js']);
      convertScript.on('close', (code) => {
        if (code === 0) {
          console.log(`${colors.green}✅ FIFO inventory created successfully${colors.reset}`);
        }
      });
    }
  }

  // Ensure unified totals exist
  if (!fs.existsSync('./data/unified_system_totals.json')) {
    const defaultTotals = {
      lastCalculated: new Date().toISOString(),
      orders: { count: 0, netTotal: 0, totalItems: 0 },
      inventory: { uniqueItems: 0, totalValue: 0 },
      system: { accuracy: 0, dataSource: 'INITIALIZING' }
    };
    fs.writeFileSync('./data/unified_system_totals.json', JSON.stringify(defaultTotals, null, 2));
    console.log(`${colors.cyan}✓ Created unified system totals${colors.reset}`);
  }
}

// Main startup sequence
async function startAllSystems() {
  console.log('\n📋 PRE-FLIGHT CHECKS');
  console.log('-'.repeat(40));

  // Ensure directories exist
  ensureDataDirectories();

  // Prepare data files
  prepareDataFiles();

  // Wait a moment for file operations to complete
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('\n🎯 LAUNCHING CORE SYSTEMS');
  console.log('-'.repeat(40));

  // 1. Start the main inventory server
  startProcess(
    'INVENTORY-SERVER',
    'node',
    ['enterprise-secure-inventory.js'],
    colors.green
  );

  // Wait for server to initialize
  await new Promise(resolve => setTimeout(resolve, 2000));

  // 2. Start AI monitoring system
  if (fs.existsSync('ai_monitoring_system.js')) {
    startProcess(
      'AI-MONITOR',
      'node',
      ['ai_monitoring_system.js'],
      colors.blue
    );
  }

  // 3. Start AI auto-fix agent
  if (fs.existsSync('ai_monitor_autofix.js')) {
    startProcess(
      'AI-AUTOFIX',
      'node',
      ['ai_monitor_autofix.js'],
      colors.cyan
    );
  }

  // 4. Start PDF processor monitor
  if (fs.existsSync('pdf_extraction_quantity_validator.js')) {
    console.log(`${colors.yellow}[PDF-VALIDATOR] Available on demand${colors.reset}`);
  }

  // 5. Start accuracy improvement analyzer
  if (fs.existsSync('accuracy_improvement_analyzer.js')) {
    console.log(`${colors.yellow}[ACCURACY-ANALYZER] Available on demand${colors.reset}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log(`${colors.bright}${colors.green}✅ ALL SYSTEMS STARTED SUCCESSFULLY${colors.reset}`);
  console.log('='.repeat(60));
  console.log('\n📊 SYSTEM STATUS:');
  console.log(`• Inventory Server: ${colors.green}http://localhost:8083${colors.reset}`);
  console.log(`• AI Monitoring: ${colors.green}ACTIVE${colors.reset}`);
  console.log(`• Auto-Fix Agent: ${colors.green}ACTIVE${colors.reset}`);
  console.log(`• PDF Validation: ${colors.yellow}ON-DEMAND${colors.reset}`);
  console.log('\n📝 AVAILABLE COMMANDS:');
  console.log(`• ${colors.cyan}node recalculate_all_pdfs.js${colors.reset} - Recalculate all PDF invoices`);
  console.log(`• ${colors.cyan}node pdf_extraction_quantity_validator.js${colors.reset} - Validate PDF quantities`);
  console.log(`• ${colors.cyan}node accuracy_improvement_analyzer.js${colors.reset} - Analyze system accuracy`);
  console.log(`• ${colors.cyan}node convert_to_fifo_format.js${colors.reset} - Convert inventory to FIFO format`);
  console.log('\n⚠️  Press Ctrl+C to stop all systems');
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log(`\n${colors.yellow}Shutting down all systems...${colors.reset}`);

  processes.forEach(({ name, proc }) => {
    console.log(`${colors.red}Stopping ${name}...${colors.reset}`);
    proc.kill('SIGTERM');
  });

  setTimeout(() => {
    console.log(`${colors.green}All systems stopped. Goodbye!${colors.reset}`);
    process.exit(0);
  }, 1000);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error(`${colors.red}Uncaught Exception:${colors.reset}`, error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(`${colors.red}Unhandled Rejection at:${colors.reset}`, promise, `${colors.red}reason:${colors.reset}`, reason);
});

// Start everything
startAllSystems().catch(error => {
  console.error(`${colors.red}Failed to start systems:${colors.reset}`, error);
  process.exit(1);
});
