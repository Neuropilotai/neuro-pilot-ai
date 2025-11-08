// Minimal server test to isolate the issue
console.log('=== MINIMAL SERVER TEST ===');

process.on('uncaughtException', (error) => {
  console.error('❌ UNCAUGHT EXCEPTION:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ UNHANDLED REJECTION:', reason);
  process.exit(1);
});

try {
  console.log('1. Loading dotenv...');
  require('dotenv').config();

  console.log('2. Loading express...');
  const express = require('express');
  const http = require('http');

  console.log('3. Creating app...');
  const app = express();

  console.log('4. Creating HTTP server...');
  const httpServer = http.createServer(app);

  const PORT = process.env.PORT || 3001;
  console.log(`5. Starting server on port ${PORT}...`);

  httpServer.listen(PORT, '0.0.0.0', async () => {
    try {
      console.log('✅ Server started successfully!');
      console.log(`📡 Listening on http://0.0.0.0:${PORT}`);

      console.log('\n6. Loading database...');
      const db = require('./config/database');
      console.log('✅ Database loaded');

      console.log('\n7. Testing database query...');
      const result = db.prepare('SELECT COUNT(*) as count FROM users').get();
      console.log(`✅ Database query successful: ${result.count} users found`);

      console.log('\n✅ ALL TESTS PASSED - Server is fully functional!');
    } catch (error) {
      console.error('\n❌ Error in server callback:', error);
      process.exit(1);
    }
  });

  httpServer.on('error', (error) => {
    console.error('❌ Server error:', error);
    process.exit(1);
  });

} catch (error) {
  console.error('❌ Startup error:', error);
  process.exit(1);
}
