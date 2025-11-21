// Minimal test server to identify crash
const express = require('express');
const app = express();
const PORT = process.env.PORT || 8080;

console.log('=== STARTING TEST SERVER ===');

app.get('/health', (req, res) => {
  res.json({ success: true, test: true });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('=== TEST SERVER LISTENING ON PORT', PORT, '===');
});

process.on('uncaughtException', (error) => {
  console.error('UNCAUGHT EXCEPTION:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason);
});
