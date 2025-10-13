#!/usr/bin/env node
/**
 * Manual AI Jobs Trigger Script
 * Triggers forecast and learning jobs to boost AI Ops Health score
 * v14.4
 */

const db = require('./config/database');
const { logger } = require('./config/logger');
const Phase3CronScheduler = require('./cron/phase3_cron');
const realtimeBus = require('./utils/realtimeBus');

async function triggerJobs() {
  console.log('\n🚀 v14.4: Triggering AI jobs to boost health score...\n');

  try {
    // Initialize and start Phase3CronScheduler
    console.log('⚙️  Initializing Phase3 Cron Scheduler...');
    const scheduler = new Phase3CronScheduler(db, null, realtimeBus);
    scheduler.start();
    console.log('✅ Scheduler started\n');

    // Wait 1 second for jobs to register
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Trigger AI Forecast
    console.log('📊 Triggering AI Forecast job...');
    const forecastResult = await scheduler.triggerJob('ai_forecast');

    if (forecastResult.success) {
      console.log(`✅ Forecast completed in ${forecastResult.duration}s`);
    } else {
      console.error(`❌ Forecast failed: ${forecastResult.error}`);
    }

    // Wait 2 seconds between jobs
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Trigger AI Learning
    console.log('\n🧠 Triggering AI Learning job...');
    const learningResult = await scheduler.triggerJob('ai_learning');

    if (learningResult.success) {
      console.log(`✅ Learning completed in ${learningResult.duration}s`);
    } else {
      console.error(`❌ Learning failed: ${learningResult.error}`);
    }

    console.log('\n🎉 AI jobs trigger complete!\n');
    console.log('Next steps:');
    console.log('1. Check AI Ops Health: curl http://localhost:8083/api/owner/ops/status | jq .ai_ops_health.score');
    console.log('2. Open Owner Console: http://localhost:8083/owner-super-console.html');
    console.log('3. Verify AI Intelligence Index displays in header\n');

    // Stop scheduler and exit
    console.log('⏹️  Stopping scheduler...');
    scheduler.stop();

    // Wait for cleanup
    await new Promise(resolve => setTimeout(resolve, 1000));

    process.exit(0);

  } catch (error) {
    console.error('❌ Error triggering jobs:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run
triggerJobs();
