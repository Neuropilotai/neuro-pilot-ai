#!/usr/bin/env node
/**
 * NeuroInnovate Enterprise v19.0 - Environment Variable Validator
 *
 * Validates that all critical environment variables are set before deployment.
 * Fails fast with clear error messages if any required variables are missing.
 *
 * Usage:
 *   node scripts/validate-env.mjs
 *
 * Exit codes:
 *   0 - All required variables present
 *   1 - One or more critical variables missing
 */

import process from 'process';

// ANSI color codes for terminal output
const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
};

// Define critical environment variables with descriptions
const CRITICAL_VARS = [
  {
    name: 'NODE_ENV',
    description: 'Node.js environment (production, development, test)',
    example: 'production',
    required: true,
  },
  {
    name: 'JWT_SECRET',
    description: 'JWT signing secret (min 32 characters)',
    example: '[64-char random hex string]',
    required: true,
    minLength: 32,
  },
  {
    name: 'JWT_REFRESH_SECRET',
    description: 'JWT refresh token secret (min 32 characters)',
    example: '[64-char random hex string]',
    required: true,
    minLength: 32,
  },
  {
    name: 'DATABASE_URL',
    description: 'Database connection string',
    example: 'sqlite://backend/database.db',
    required: true,
  },
  {
    name: 'ML_URL',
    description: 'ML service internal URL',
    example: 'http://ml-service.railway.internal:8000',
    required: true,
  },
];

const IMPORTANT_VARS = [
  {
    name: 'SCHEDULER_ENABLED',
    description: 'Enable autonomous scheduler (true/false)',
    example: 'true',
    required: false,
  },
  {
    name: 'SVC_JWT',
    description: 'Service JWT for scheduler authentication',
    example: 'eyJhbGciOiJIUzI1NiIs...',
    required: false,
    requiredIf: 'SCHEDULER_ENABLED',
  },
  {
    name: 'ADMIN_EMAIL',
    description: 'Admin email for notifications',
    example: 'admin@example.com',
    required: false,
    requiredIf: 'SCHEDULER_ENABLED',
  },
  {
    name: 'SMTP_HOST',
    description: 'SMTP server hostname',
    example: 'smtp.gmail.com',
    required: false,
    requiredIf: 'SCHEDULER_ENABLED',
  },
  {
    name: 'SMTP_PORT',
    description: 'SMTP server port',
    example: '587',
    required: false,
  },
  {
    name: 'SMTP_USER',
    description: 'SMTP username',
    example: 'noreply@example.com',
    required: false,
    requiredIf: 'SCHEDULER_ENABLED',
  },
  {
    name: 'SMTP_PASS',
    description: 'SMTP password (app-specific password for Gmail)',
    example: '[Gmail app password]',
    required: false,
    requiredIf: 'SCHEDULER_ENABLED',
  },
];

const OPTIONAL_VARS = [
  {
    name: 'PORT',
    description: 'Server port (Railway sets this automatically)',
    example: '3001',
    default: '3001',
  },
  {
    name: 'LOG_LEVEL',
    description: 'Logging verbosity',
    example: 'info',
    default: 'info',
  },
  {
    name: 'AUTO_RETRAIN_ENABLED',
    description: 'Enable automatic weekly model retraining',
    example: 'true',
    default: 'true',
  },
  {
    name: 'AUTO_ROLLBACK_ENABLED',
    description: 'Enable automatic rollback on health failures',
    example: 'true',
    default: 'true',
  },
  {
    name: 'MAX_HEALTH_FAILURES',
    description: 'Max consecutive health check failures before rollback',
    example: '3',
    default: '3',
  },
  {
    name: 'MAPE_THRESHOLD',
    description: 'Model accuracy threshold (MAPE %) for auto-rollback',
    example: '30',
    default: '30',
  },
  {
    name: 'FORECAST_TIMEOUT_MS',
    description: 'ML service timeout in milliseconds',
    example: '600000',
    default: '600000',
  },
];

/**
 * Print section header
 */
function printHeader(title) {
  console.log('');
  console.log(`${COLORS.blue}${COLORS.bright}${'='.repeat(60)}${COLORS.reset}`);
  console.log(`${COLORS.blue}${COLORS.bright}  ${title}${COLORS.reset}`);
  console.log(`${COLORS.blue}${COLORS.bright}${'='.repeat(60)}${COLORS.reset}`);
  console.log('');
}

/**
 * Validate a single environment variable
 */
function validateVar(varConfig, severity = 'CRITICAL') {
  const value = process.env[varConfig.name];
  const isSet = value !== undefined && value !== '';

  // Check if required
  let isRequired = varConfig.required;

  // Check conditional requirement
  if (!isRequired && varConfig.requiredIf) {
    const conditionalValue = process.env[varConfig.requiredIf];
    isRequired = conditionalValue === 'true' || conditionalValue === '1';
  }

  // Print status
  const statusIcon = isSet ? `${COLORS.green}✓${COLORS.reset}` :
                     isRequired ? `${COLORS.red}✗${COLORS.reset}` :
                     `${COLORS.yellow}○${COLORS.reset}`;

  const statusText = isSet ? `${COLORS.green}SET${COLORS.reset}` :
                     isRequired ? `${COLORS.red}MISSING${COLORS.reset}` :
                     `${COLORS.yellow}NOT SET${COLORS.reset}`;

  console.log(`  ${statusIcon} ${varConfig.name.padEnd(25)} ${statusText}`);
  console.log(`     ${COLORS.reset}${varConfig.description}${COLORS.reset}`);

  // Additional validation for set variables
  if (isSet) {
    // Check minimum length
    if (varConfig.minLength && value.length < varConfig.minLength) {
      console.log(`     ${COLORS.red}⚠ WARNING: Value too short (min ${varConfig.minLength} chars)${COLORS.reset}`);
      if (isRequired) {
        return { name: varConfig.name, error: `Too short (min ${varConfig.minLength} chars)` };
      }
    }

    // Mask sensitive values in output (show first 8 chars only)
    if (varConfig.name.includes('SECRET') || varConfig.name.includes('PASS') || varConfig.name.includes('JWT')) {
      const masked = value.substring(0, 8) + '...';
      console.log(`     ${COLORS.reset}Value: ${masked}${COLORS.reset}`);
    }
  } else if (isRequired) {
    console.log(`     ${COLORS.red}Example: ${varConfig.example}${COLORS.reset}`);
    return { name: varConfig.name, error: 'Missing required variable' };
  } else if (varConfig.default) {
    console.log(`     ${COLORS.yellow}Default: ${varConfig.default}${COLORS.reset}`);
  }

  console.log('');

  return null; // No error
}

/**
 * Main validation function
 */
function main() {
  console.log(`${COLORS.bright}NeuroInnovate Enterprise v19.0 - Environment Validator${COLORS.reset}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);

  const errors = [];
  const warnings = [];

  // Validate critical variables
  printHeader('🔴 CRITICAL VARIABLES (Required for deployment)');
  CRITICAL_VARS.forEach(varConfig => {
    const error = validateVar(varConfig, 'CRITICAL');
    if (error) errors.push(error);
  });

  // Validate important variables
  printHeader('🟡 IMPORTANT VARIABLES (Required for key features)');
  IMPORTANT_VARS.forEach(varConfig => {
    const error = validateVar(varConfig, 'IMPORTANT');
    if (error) warnings.push(error);
  });

  // Validate optional variables
  printHeader('🟢 OPTIONAL VARIABLES (Have safe defaults)');
  OPTIONAL_VARS.forEach(varConfig => {
    validateVar(varConfig, 'OPTIONAL');
  });

  // Print summary
  printHeader('VALIDATION SUMMARY');

  console.log(`Total variables checked: ${CRITICAL_VARS.length + IMPORTANT_VARS.length + OPTIONAL_VARS.length}`);
  console.log(`${COLORS.red}Critical errors: ${errors.length}${COLORS.reset}`);
  console.log(`${COLORS.yellow}Warnings: ${warnings.length}${COLORS.reset}`);
  console.log('');

  if (errors.length > 0) {
    console.log(`${COLORS.red}${COLORS.bright}❌ VALIDATION FAILED${COLORS.reset}`);
    console.log(`${COLORS.red}The following critical variables are missing:${COLORS.reset}`);
    errors.forEach(err => {
      console.log(`  • ${err.name}: ${err.error}`);
    });
    console.log('');
    console.log(`${COLORS.yellow}Fix:${COLORS.reset}`);
    console.log(`  1. Set missing variables in Railway Dashboard → Service → Variables`);
    console.log(`  2. Or add to .env file for local development`);
    console.log(`  3. See docs/ENV_VARS_V19.md for details`);
    console.log('');
    process.exit(1);
  }

  if (warnings.length > 0) {
    console.log(`${COLORS.yellow}${COLORS.bright}⚠️  VALIDATION PASSED WITH WARNINGS${COLORS.reset}`);
    console.log(`${COLORS.yellow}The following important variables are missing:${COLORS.reset}`);
    warnings.forEach(warn => {
      console.log(`  • ${warn.name}: ${warn.error}`);
    });
    console.log('');
    console.log(`${COLORS.yellow}Note: Some features may be disabled without these variables.${COLORS.reset}`);
    console.log('');
  } else {
    console.log(`${COLORS.green}${COLORS.bright}✅ ALL VALIDATIONS PASSED${COLORS.reset}`);
    console.log(`${COLORS.green}All critical environment variables are properly configured.${COLORS.reset}`);
    console.log('');
  }

  console.log(`${COLORS.blue}NeuroInnovate Enterprise is ready for deployment!${COLORS.reset}`);
  console.log('');

  process.exit(0);
}

// Run validator
main();
