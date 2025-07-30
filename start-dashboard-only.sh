#!/bin/bash

echo "📊 Starting DASHBOARD ONLY..."
echo "📈 Analytics & Monitoring"
echo "🚀 Port: 8086"
echo ""

# Kill any existing dashboard processes
pkill -f "dashboard" 2>/dev/null || true

# Start only dashboard
cd backend
node -e "
const express = require('express');
const app = express();
const PORT = 8086;

app.use(express.json());
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.send('<h1>📊 Analytics Dashboard</h1><p>System monitoring would be here</p>');
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'Analytics Dashboard' });
});

app.listen(PORT, () => {
  console.log('📊 Dashboard: http://localhost:' + PORT);
});
"