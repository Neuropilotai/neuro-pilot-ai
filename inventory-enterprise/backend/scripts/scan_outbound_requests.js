#!/usr/bin/env node
/**
 * Outbound Request Scanner for NeuroInnovate Inventory Enterprise
 * Scans codebase for unauthorized outbound network calls and data leaks
 *
 * Version: 1.0.0
 * Date: 2025-10-09
 *
 * Usage:
 *   cd ~/neuro-pilot-ai/inventory-enterprise/backend
 *   node /tmp/scan_outbound_requests.js
 *
 * Exit Codes:
 *   0 - No unauthorized calls found
 *   1 - Unauthorized calls detected
 *   2 - Critical leaks detected
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
  bold: '\x1b[1m'
};

// Configuration
const BACKEND_DIR = process.cwd();
const WHITELIST = {
  // Authorized external calls with justification
  'aiops/InsightGenerator.js': {
    patterns: ['api.openai.com', 'api.anthropic.com'],
    reason: 'LLM APIs for executive summaries (aggregated metrics only)'
  },
  'services/webhookDispatcher_2025-10-07.js': {
    patterns: ['axios.post'],
    reason: 'User-configured webhook endpoints'
  }
};

const DANGER_PATTERNS = {
  // Network calls
  network: [
    /axios\.(get|post|put|delete|patch)\s*\(/g,
    /fetch\s*\(/g,
    /http\.request\s*\(/g,
    /https\.request\s*\(/g,
    /WebSocket\s*\(/g,
    /socket\.io-client/g,
    /ws\.send\s*\(/g
  ],

  // Cloud SDKs
  cloud: [
    /require\s*\(\s*['"]aws-sdk['"]\s*\)/g,
    /require\s*\(\s*['"]@aws-sdk/g,
    /require\s*\(\s*['"]azure-storage['"]\s*\)/g,
    /require\s*\(\s*['"]@azure/g,
    /require\s*\(\s*['"]@google-cloud/g,
    /from\s+['"]aws-sdk['"]/g,
    /from\s+['"]@aws-sdk/g
  ],

  // File writes (outside authorized directories)
  fileWrites: [
    /fs\.writeFile\s*\(/g,
    /fs\.writeFileSync\s*\(/g,
    /fs\.appendFile\s*\(/g,
    /fs\.createWriteStream\s*\(/g,
    /fs\.promises\.writeFile\s*\(/g
  ],

  // Dangerous functions
  dangerous: [
    /eval\s*\(/g,
    /Function\s*\(/g,
    /vm\.runInNewContext/g,
    /child_process\.exec\(/g,
    /execSync\(/g
  ],

  // Credentials/secrets
  secrets: [
    /API_KEY\s*=\s*['"][^'"]+['"]/g,
    /SECRET\s*=\s*['"][^'"]+['"]/g,
    /PASSWORD\s*=\s*['"][^'"]+['"]/g,
    /aws_access_key_id/g,
    /private_key/g
  ]
};

const AUTHORIZED_WRITE_DIRS = [
  'data/docs',      // PDF storage
  'data/models',    // AI model artifacts
  'logs',           // Log files
  'db'              // SQLite database files
];

// Statistics
const stats = {
  filesScanned: 0,
  totalLines: 0,
  warnings: [],
  criticalIssues: [],
  info: []
};

/**
 * Main scan function
 */
async function scan() {
  console.log(`${colors.bold}${colors.blue}═══════════════════════════════════════════════════════`);
  console.log(`🔍 Outbound Request Scanner v1.0.0`);
  console.log(`═══════════════════════════════════════════════════════${colors.reset}\n`);

  console.log(`${colors.gray}Scanning: ${BACKEND_DIR}${colors.reset}\n`);

  // Find all JavaScript files
  const jsFiles = findJavaScriptFiles(BACKEND_DIR);

  console.log(`Found ${jsFiles.length} JavaScript files\n`);

  // Scan each file
  for (const file of jsFiles) {
    scanFile(file);
  }

  // Print results
  printResults();

  // Exit with appropriate code
  if (stats.criticalIssues.length > 0) {
    process.exit(2);
  } else if (stats.warnings.length > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

/**
 * Find all JavaScript files in directory
 */
function findJavaScriptFiles(dir) {
  const excludeDirs = ['node_modules', 'coverage', '.git', 'dist', 'build'];
  const files = [];

  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (!excludeDirs.includes(entry.name)) {
          walk(fullPath);
        }
      } else if (entry.isFile() && entry.name.endsWith('.js')) {
        files.push(fullPath);
      }
    }
  }

  walk(dir);
  return files;
}

/**
 * Scan a single file
 */
function scanFile(filePath) {
  stats.filesScanned++;

  const relativePath = path.relative(BACKEND_DIR, filePath);
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  stats.totalLines += lines.length;

  // Check if file is whitelisted
  const whitelisted = isWhitelisted(relativePath);

  // Scan for patterns
  scanNetworkCalls(relativePath, content, whitelisted);
  scanCloudSDKs(relativePath, content);
  scanFileWrites(relativePath, content, lines);
  scanDangerousFunctions(relativePath, content, lines);
  scanSecrets(relativePath, content, lines);
}

/**
 * Check if file is whitelisted
 */
function isWhitelisted(filePath) {
  for (const [whitelistPath, config] of Object.entries(WHITELIST)) {
    if (filePath.includes(whitelistPath)) {
      return config;
    }
  }
  return null;
}

/**
 * Scan for network calls
 */
function scanNetworkCalls(filePath, content, whitelisted) {
  for (const pattern of DANGER_PATTERNS.network) {
    const matches = content.matchAll(pattern);

    for (const match of matches) {
      if (whitelisted) {
        stats.info.push({
          file: filePath,
          line: getLineNumber(content, match.index),
          pattern: match[0],
          severity: 'INFO',
          message: `Authorized network call: ${whitelisted.reason}`
        });
      } else {
        stats.warnings.push({
          file: filePath,
          line: getLineNumber(content, match.index),
          pattern: match[0],
          severity: 'WARNING',
          message: 'Unauthorized outbound network call detected'
        });
      }
    }
  }
}

/**
 * Scan for cloud SDKs
 */
function scanCloudSDKs(filePath, content) {
  for (const pattern of DANGER_PATTERNS.cloud) {
    const matches = content.matchAll(pattern);

    for (const match of matches) {
      stats.criticalIssues.push({
        file: filePath,
        line: getLineNumber(content, match.index),
        pattern: match[0],
        severity: 'CRITICAL',
        message: 'Cloud SDK detected - potential data upload vector'
      });
    }
  }
}

/**
 * Scan for file writes
 */
function scanFileWrites(filePath, content, lines) {
  for (const pattern of DANGER_PATTERNS.fileWrites) {
    const matches = content.matchAll(pattern);

    for (const match of matches) {
      const lineNum = getLineNumber(content, match.index);
      const line = lines[lineNum - 1];

      // Check if write is to authorized directory
      const isAuthorized = AUTHORIZED_WRITE_DIRS.some(dir =>
        line.includes(dir) || line.includes(`'${dir}`) || line.includes(`"${dir}`)
      );

      if (!isAuthorized) {
        // Check if it's writing to code directories
        const isDangerous = line.includes('backend/') ||
                           line.includes('.js') ||
                           line.includes('routes/') ||
                           line.includes('middleware/');

        if (isDangerous) {
          stats.criticalIssues.push({
            file: filePath,
            line: lineNum,
            pattern: match[0],
            severity: 'CRITICAL',
            message: 'File write to code directory - self-modification risk'
          });
        } else {
          stats.warnings.push({
            file: filePath,
            line: lineNum,
            pattern: match[0],
            severity: 'WARNING',
            message: 'File write to non-authorized directory'
          });
        }
      }
    }
  }
}

/**
 * Scan for dangerous functions
 */
function scanDangerousFunctions(filePath, content, lines) {
  for (const pattern of DANGER_PATTERNS.dangerous) {
    const matches = content.matchAll(pattern);

    for (const match of matches) {
      const lineNum = getLineNumber(content, match.index);

      // Check if it's in a comment
      const line = lines[lineNum - 1];
      if (line.trim().startsWith('//') || line.trim().startsWith('*')) {
        continue;
      }

      stats.criticalIssues.push({
        file: filePath,
        line: lineNum,
        pattern: match[0],
        severity: 'CRITICAL',
        message: 'Dangerous function detected - code execution risk'
      });
    }
  }
}

/**
 * Scan for hardcoded secrets
 */
function scanSecrets(filePath, content, lines) {
  // Skip .env.example and test files
  if (filePath.includes('.env.example') || filePath.includes('test')) {
    return;
  }

  for (const pattern of DANGER_PATTERNS.secrets) {
    const matches = content.matchAll(pattern);

    for (const match of matches) {
      const lineNum = getLineNumber(content, match.index);
      const line = lines[lineNum - 1];

      // Check if it's reading from process.env (OK) or hardcoded (BAD)
      if (!line.includes('process.env')) {
        stats.criticalIssues.push({
          file: filePath,
          line: lineNum,
          pattern: match[0].substring(0, 30) + '...',
          severity: 'CRITICAL',
          message: 'Hardcoded secret detected - credential leak risk'
        });
      }
    }
  }
}

/**
 * Get line number from string index
 */
function getLineNumber(content, index) {
  return content.substring(0, index).split('\n').length;
}

/**
 * Print scan results
 */
function printResults() {
  console.log(`\n${colors.bold}═══════════════════════════════════════════════════════`);
  console.log(`📊 Scan Results`);
  console.log(`═══════════════════════════════════════════════════════${colors.reset}\n`);

  console.log(`Files scanned:  ${stats.filesScanned}`);
  console.log(`Total lines:    ${stats.totalLines.toLocaleString()}\n`);

  // Critical issues
  if (stats.criticalIssues.length > 0) {
    console.log(`${colors.red}${colors.bold}🚨 CRITICAL ISSUES (${stats.criticalIssues.length}):${colors.reset}\n`);

    for (const issue of stats.criticalIssues) {
      console.log(`${colors.red}[CRITICAL]${colors.reset} ${issue.file}:${issue.line}`);
      console.log(`  Pattern: ${colors.yellow}${issue.pattern}${colors.reset}`);
      console.log(`  Message: ${issue.message}\n`);
    }
  }

  // Warnings
  if (stats.warnings.length > 0) {
    console.log(`${colors.yellow}${colors.bold}⚠️  WARNINGS (${stats.warnings.length}):${colors.reset}\n`);

    for (const warning of stats.warnings) {
      console.log(`${colors.yellow}[WARNING]${colors.reset} ${warning.file}:${warning.line}`);
      console.log(`  Pattern: ${colors.gray}${warning.pattern}${colors.reset}`);
      console.log(`  Message: ${warning.message}\n`);
    }
  }

  // Info (authorized calls)
  if (stats.info.length > 0) {
    console.log(`${colors.blue}${colors.bold}ℹ️  AUTHORIZED CALLS (${stats.info.length}):${colors.reset}\n`);

    for (const info of stats.info) {
      console.log(`${colors.blue}[INFO]${colors.reset} ${info.file}:${info.line}`);
      console.log(`  Pattern: ${colors.gray}${info.pattern}${colors.reset}`);
      console.log(`  Message: ${info.message}\n`);
    }
  }

  // Summary
  console.log(`${colors.bold}═══════════════════════════════════════════════════════${colors.reset}`);

  if (stats.criticalIssues.length > 0) {
    console.log(`${colors.red}${colors.bold}❌ SCAN FAILED - CRITICAL ISSUES DETECTED${colors.reset}`);
    console.log(`${colors.red}Action required: Review and fix critical issues immediately${colors.reset}`);
  } else if (stats.warnings.length > 0) {
    console.log(`${colors.yellow}${colors.bold}⚠️  SCAN PASSED WITH WARNINGS${colors.reset}`);
    console.log(`${colors.yellow}Action recommended: Review warnings for potential issues${colors.reset}`);
  } else {
    console.log(`${colors.green}${colors.bold}✅ SCAN PASSED - NO ISSUES DETECTED${colors.reset}`);
    console.log(`${colors.green}System is secure - no unauthorized outbound calls found${colors.reset}`);
  }

  console.log(`${colors.bold}═══════════════════════════════════════════════════════${colors.reset}\n`);
}

// Run scan
scan().catch(error => {
  console.error(`${colors.red}Error during scan:${colors.reset}`, error);
  process.exit(2);
});
