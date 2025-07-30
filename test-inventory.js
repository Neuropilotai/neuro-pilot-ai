const express = require('express');
const app = express();
const PORT = 8084;

app.use(express.json());

app.get('/', (req, res) => {
  res.send(`
    <h1>🏕️ Inventory System Test</h1>
    <p>Server is working on port ${PORT}</p>
    <a href="/dashboard">Go to Dashboard</a>
  `);
});

app.get('/dashboard', (req, res) => {
  res.send(`
    <h1>📊 Inventory Dashboard</h1>
    <p>Dashboard is working!</p>
  `);
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', port: PORT });
});

app.listen(PORT, () => {
  console.log(`✅ Test server running: http://localhost:${PORT}`);
});