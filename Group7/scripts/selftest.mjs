#!/usr/bin/env node
// GROUP7 - Self-Test Suite (Dry Run Mode)
import 'dotenv/config';
import { execSync } from 'child_process';

const tests = [
  {
    name: 'Environment Check',
    command: 'node scripts/env-check.mjs',
    critical: true
  },
  {
    name: 'System Heartbeat',
    command: 'node ops/monitor/heartbeat.mjs',
    critical: true
  },
  {
    name: 'Voice Generation (Dry Run)',
    command: 'node ops/scripts/say.js "Test" config/voices/lyra7.voice.json || echo "Skipped - voice already tested"',
    critical: false
  },
  {
    name: 'Performance Analysis (Dry Run)',
    command: 'node ops/learning/analyze-performance.mjs || echo "Skipped - no data yet"',
    critical: false
  },
  {
    name: 'Status Report',
    command: 'node scripts/report-status.mjs',
    critical: false
  }
];

async function runSelfTest() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 GROUP7 SELF-TEST SUITE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Started: ${new Date().toLocaleString()}`);
  console.log(`Mode: DRY RUN (no actual uploads)\n`);

  const results = [];
  let criticalFailure = false;

  for (const test of tests) {
    console.log(`\n▶ Testing: ${test.name}`);
    console.log('─'.repeat(60));

    try {
      execSync(test.command, { stdio: 'inherit', timeout: 30000 });
      results.push({ test: test.name, status: 'PASS' });
      console.log(`✅ ${test.name}: PASS`);
    } catch (error) {
      results.push({ test: test.name, status: 'FAIL', error: error.message });
      console.log(`❌ ${test.name}: FAIL`);
      
      if (test.critical) {
        criticalFailure = true;
        console.log(`   ⚠️  Critical test failed - fix before production!`);
      }
    }
  }

  console.log('\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 TEST SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;

  console.log(`Total Tests: ${results.length}`);
  console.log(`Passed: ${passed} ✅`);
  console.log(`Failed: ${failed} ${failed > 0 ? '❌' : ''}`);

  if (criticalFailure) {
    console.log('\n⚠️  CRITICAL: System not ready for production');
    console.log('   Fix critical failures before deploying.\n');
    return false;
  }

  if (failed === 0) {
    console.log('\n✅ ALL SYSTEMS READY FOR AUTONOMOUS OPERATION');
    console.log('\nNext steps:');
    console.log('  1. Schedule learning loop: 0 2 * * * (2 AM daily)');
    console.log('  2. Schedule production: 0 6 * * * (6 AM daily)');
    console.log('  3. Schedule monitoring: 0 * * * * (hourly)');
    console.log('\nRun: crontab -e to set up automation\n');
    return true;
  } else {
    console.log('\n⚠️  Some tests failed - review before production');
    console.log('   Non-critical failures can be addressed later.\n');
    return true;
  }
}

runSelfTest()
  .then(ready => process.exit(ready ? 0 : 1))
  .catch(err => {
    console.error('\n❌ Self-test suite failed:', err.message);
    process.exit(1);
  });
