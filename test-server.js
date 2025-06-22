const express = require('express');
const app = express();
const PORT = process.env.PORT || 8000;

console.log('🚀 SIMPLE TEST SERVER STARTING...');
console.log('PORT:', PORT);
console.log('NODE_ENV:', process.env.NODE_ENV);

app.get('/', (req, res) => {
  res.send(`
    <h1>🚀 Railway Test Server Works!</h1>
    <p>Port: ${PORT}</p>
    <p>Time: ${new Date()}</p>
    <p><a href="/order">Go to Order Page</a></p>
  `);
});

app.get('/order', (req, res) => {
  res.send(`
    <h1>📝 Order Page Test</h1>
    <p>This is the order page test</p>
    <p>Server is running correctly on Railway</p>
    <p><a href="/">Back to Home</a></p>
  `);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Test server running on port ${PORT}`);
  console.log('Server started successfully!');
});