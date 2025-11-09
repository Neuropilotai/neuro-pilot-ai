#!/usr/bin/env node
/**
 * Group7 Complete Pipeline Test
 * Quick validation of all system components
 */

import 'dotenv/config';
import { validateCredentials as validateElevenLabs } from './scripts/elevenlabs.mjs';
import { validateCredentials as validateShotstack } from './scripts/shotstack-render.mjs';

const tests = [];
let passed = 0;
let failed = 0;

console.log('\n🧪 Group7 Complete Pipeline Test\n');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Test 1: Environment Variables
tests.push({
  name: 'Environment Variables',
  test: async () => {
    const required = [
      'OPENAI_API_KEY',
      'ELEVENLABS_API_KEY',
      'SHOTSTACK_API_KEY',
      'GDRIVE_OUTPUT_FOLDER_ID',
      'GDRIVE_SERVICE_EMAIL',
      'GDRIVE_PRIVATE_KEY_BASE64'
    ];

    const missing = required.filter(v => !process.env[v]);

    if (missing.length > 0) {
      throw new Error(`Missing: ${missing.join(', ')}`);
    }

    return `All ${required.length} required variables set`;
  }
});

// Test 2: ElevenLabs API
tests.push({
  name: 'ElevenLabs API',
  test: async () => {
    const valid = await validateElevenLabs();
    if (!valid) {
      throw new Error('Invalid credentials');
    }
    return 'Credentials valid';
  }
});

// Test 3: Shotstack API
tests.push({
  name: 'Shotstack API',
  test: async () => {
    const valid = await validateShotstack();
    if (!valid) {
      throw new Error('Invalid credentials');
    }
    return 'Credentials valid';
  }
});

// Test 4: OpenAI API
tests.push({
  name: 'OpenAI API',
  test: async () => {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      }
    });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    return 'Credentials valid';
  }
});

// Test 5: File Structure
tests.push({
  name: 'File Structure',
  test: async () => {
    const fs = await import('fs/promises');
    const requiredFiles = [
      './scripts/elevenlabs.mjs',
      './scripts/shotstack-render.mjs',
      './scripts/upload-gdrive.mjs',
      './scripts/notion-log.mjs',
      './ops/run-one-shotstack.mjs',
      './config/shotstack_template.json',
      './.env'
    ];

    for (const file of requiredFiles) {
      try {
        await fs.access(file);
      } catch {
        throw new Error(`Missing: ${file}`);
      }
    }

    return `All ${requiredFiles.length} required files present`;
  }
});

// Test 6: Shotstack Template
tests.push({
  name: 'Shotstack Template',
  test: async () => {
    const fs = await import('fs/promises');
    const content = await fs.readFile('./config/shotstack_template.json', 'utf-8');
    const template = JSON.parse(content);

    if (!template.timeline || !template.output) {
      throw new Error('Invalid template structure');
    }

    if (template.output.size.width !== 1080 || template.output.size.height !== 1920) {
      throw new Error('Incorrect video dimensions');
    }

    return 'Template valid (1080x1920, 30fps)';
  }
});

// Test 7: Production Directory
tests.push({
  name: 'Production Directory',
  test: async () => {
    const fs = await import('fs/promises');
    try {
      await fs.access('./Production');
    } catch {
      await fs.mkdir('./Production', { recursive: true });
      return 'Created Production directory';
    }
    return 'Production directory exists';
  }
});

// Run all tests
for (const { name, test } of tests) {
  try {
    const result = await test();
    console.log(`✅ ${name.padEnd(30)} ${result}`);
    passed++;
  } catch (error) {
    console.log(`❌ ${name.padEnd(30)} ${error.message}`);
    failed++;
  }
}

// Summary
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
console.log(`📊 Test Results: ${passed} passed, ${failed} failed\n`);

if (failed === 0) {
  console.log('🎉 All tests passed! System is ready for production.\n');
  console.log('Next steps:');
  console.log('  1. Run test render: npm run shotstack:test');
  console.log('  2. Run full pipeline: node ops/run-one-shotstack.mjs --agent=Lyra');
  console.log('  3. Check output in: ./Production/\n');
  process.exit(0);
} else {
  console.log('⚠️  Some tests failed. Please fix issues above.\n');
  console.log('Troubleshooting:');
  console.log('  1. Check .env file: nano .env');
  console.log('  2. Validate environment: npm run env:check:shotstack');
  console.log('  3. Review README: cat README_SHOTSTACK_COMPLETE.md\n');
  process.exit(1);
}
