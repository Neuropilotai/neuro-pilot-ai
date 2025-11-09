#!/usr/bin/env node
/**
 * Environment Validation for Group7 Shotstack Integration
 * Checks all required API keys and credentials
 */

import 'dotenv/config';

const REQUIRED_VARS = [
  'SHOTSTACK_API_KEY',
  'OPENAI_API_KEY',
  'ELEVENLABS_API_KEY',
  'GDRIVE_OUTPUT_FOLDER_ID',
  'GDRIVE_SERVICE_EMAIL',
  'GDRIVE_PRIVATE_KEY_BASE64'
];

const OPTIONAL_VARS = [
  'SHOTSTACK_REGION',
  'SHOTSTACK_WEBHOOK_URL',
  'NOTION_TOKEN',
  'NOTION_VIDEO_DB_ID',
  'METRICOOL_API_KEY',
  'METRICOOL_PROFILE_ID'
];

const results = {
  passed: [],
  failed: [],
  warnings: []
};

console.log('\n🔍 Group7 Environment Check (Shotstack Integration)\n');

// Check required variables
console.log('📋 Required Variables:');
for (const varName of REQUIRED_VARS) {
  const value = process.env[varName];
  if (value) {
    results.passed.push(varName);
    console.log(`   ✅ ${varName}`);
  } else {
    results.failed.push(varName);
    console.log(`   ❌ ${varName} - MISSING`);
  }
}

// Check optional variables
console.log('\n📋 Optional Variables:');
for (const varName of OPTIONAL_VARS) {
  const value = process.env[varName];
  if (value) {
    results.passed.push(varName);
    console.log(`   ✅ ${varName}`);
  } else {
    results.warnings.push(varName);
    console.log(`   ⚠️  ${varName} - Not set (optional)`);
  }
}

// API Health Checks
console.log('\n🏥 API Health Checks:\n');

const checks = [];

// Shotstack
checks.push(async () => {
  const region = process.env.SHOTSTACK_REGION || 'us';
  const apiKey = process.env.SHOTSTACK_API_KEY;

  if (!apiKey) {
    console.log('   ❌ Shotstack - No API key');
    return false;
  }

  try {
    const response = await fetch(`https://api.shotstack.io/${region}/v1/render`, {
      method: 'GET',
      headers: { 'x-api-key': apiKey }
    });

    // 200 or 404 both indicate valid auth (404 is expected for GET)
    if (response.status === 200 || response.status === 404) {
      console.log('   ✅ Shotstack API - Valid credentials');
      return true;
    } else if (response.status === 401) {
      console.log('   ❌ Shotstack API - Invalid credentials');
      return false;
    } else {
      console.log(`   ⚠️  Shotstack API - Unexpected status: ${response.status}`);
      return false;
    }
  } catch (error) {
    console.log(`   ❌ Shotstack API - Connection failed: ${error.message}`);
    return false;
  }
});

// ElevenLabs
checks.push(async () => {
  const apiKey = process.env.ELEVENLABS_API_KEY;

  if (!apiKey) {
    console.log('   ❌ ElevenLabs - No API key');
    return false;
  }

  try {
    const response = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': apiKey }
    });

    if (response.ok) {
      console.log('   ✅ ElevenLabs API - Valid credentials');
      return true;
    } else {
      console.log(`   ❌ ElevenLabs API - Invalid credentials (${response.status})`);
      return false;
    }
  } catch (error) {
    console.log(`   ❌ ElevenLabs API - Connection failed: ${error.message}`);
    return false;
  }
});

// OpenAI
checks.push(async () => {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.log('   ❌ OpenAI - No API key');
    return false;
  }

  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    if (response.ok) {
      console.log('   ✅ OpenAI API - Valid credentials');
      return true;
    } else {
      console.log(`   ❌ OpenAI API - Invalid credentials (${response.status})`);
      return false;
    }
  } catch (error) {
    console.log(`   ❌ OpenAI API - Connection failed: ${error.message}`);
    return false;
  }
});

// Notion (optional)
checks.push(async () => {
  const token = process.env.NOTION_TOKEN;
  const dbId = process.env.NOTION_VIDEO_DB_ID;

  if (!token || !dbId) {
    console.log('   ⚠️  Notion - Not configured (optional)');
    return null; // null = optional check
  }

  try {
    const response = await fetch(`https://api.notion.com/v1/databases/${dbId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Notion-Version': '2022-06-28'
      }
    });

    if (response.ok) {
      console.log('   ✅ Notion API - Valid credentials');
      return true;
    } else {
      console.log(`   ❌ Notion API - Invalid credentials (${response.status})`);
      return false;
    }
  } catch (error) {
    console.log(`   ❌ Notion API - Connection failed: ${error.message}`);
    return false;
  }
});

// Run all checks
let allPassed = true;
for (const check of checks) {
  const result = await check();
  if (result === false) {
    allPassed = false;
  }
}

// Summary
console.log('\n📊 Summary:\n');
console.log(`   ✅ Passed: ${results.passed.length}`);
console.log(`   ❌ Failed: ${results.failed.length}`);
console.log(`   ⚠️  Warnings: ${results.warnings.length}`);

if (results.failed.length > 0) {
  console.log('\n❌ CRITICAL: Missing required environment variables!');
  console.log('\nMissing:');
  results.failed.forEach(v => console.log(`   - ${v}`));
  console.log('\nAdd these to your .env file before running Group7.\n');
  process.exit(1);
}

if (!allPassed) {
  console.log('\n❌ CRITICAL: Some API credentials are invalid!');
  console.log('Check the API health checks above for details.\n');
  process.exit(1);
}

if (results.warnings.length > 0) {
  console.log('\n⚠️  Some optional features are not configured:');
  results.warnings.forEach(v => console.log(`   - ${v}`));
  console.log('\nOptional features will be disabled. Add these to .env to enable.\n');
}

console.log('✅ All checks passed! Group7 is ready to run.\n');
process.exit(0);
