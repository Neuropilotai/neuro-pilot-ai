console.log('🔍 RAILWAY DIAGNOSTIC SCRIPT');
console.log('Node version:', process.version);
console.log('Working directory:', process.cwd());
console.log('Environment:', process.env.NODE_ENV);
console.log('PORT:', process.env.PORT);

try {
  console.log('Starting railway-server.js...');
  require('./railway-server.js');
} catch (error) {
  console.error('❌ RAILWAY STARTUP ERROR:', error);
  console.error('Stack:', error.stack);
  process.exit(1);
}