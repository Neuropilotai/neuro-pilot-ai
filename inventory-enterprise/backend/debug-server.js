// Debug script to find what's failing in server.js
console.log('Starting debug...');

try {
  console.log('1. Loading dotenv...');
  require('dotenv').config();
  console.log('✓ dotenv loaded');

  console.log('2. Loading express...');
  const express = require('express');
  console.log('✓ express loaded');

  console.log('3. Loading http...');
  const http = require('http');
  console.log('✓ http loaded');

  console.log('4. Loading helmet...');
  const helmet = require('helmet');
  console.log('✓ helmet loaded');

  console.log('5. Loading cors...');
  const cors = require('cors');
  console.log('✓ cors loaded');

  console.log('6. Loading auth routes...');
  const authRoutes = require('./routes/auth-db');
  console.log('✓ auth routes loaded');

  console.log('7. Loading inventory routes...');
  const inventoryRoutes = require('./routes/inventory');
  console.log('✓ inventory routes loaded');

  console.log('8. Loading logger...');
  const { logger } = require('./config/logger');
  console.log('✓ logger loaded');

  console.log('9. Loading websocket/RealtimeAI...');
  const realtimeAI = require('./server/websocket/RealtimeAI');
  console.log('✓ RealtimeAI loaded');

  console.log('10. Loading streaming/FeedbackStream...');
  const feedbackStream = require('./ai/streaming/FeedbackStream');
  console.log('✓ FeedbackStream loaded');

  console.log('11. Loading workers/ForecastWorker...');
  const forecastWorker = require('./ai/workers/ForecastWorker');
  console.log('✓ ForecastWorker loaded');

  console.log('12. Loading AIOperationsAgent...');
  const AIOperationsAgent = require('./aiops/Agent');
  console.log('✓ AIOperationsAgent loaded');

  console.log('\n✅ All critical modules loaded successfully!');
  process.exit(0);
} catch (error) {
  console.error('\n❌ ERROR:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
}
