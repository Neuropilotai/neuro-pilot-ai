#!/bin/bash

echo "📈 Starting TRADING SYSTEM ONLY..."
echo "🤖 Trading Agent & Analytics"
echo "🚀 Port: 8084"
echo ""

# Kill any existing trading processes
pkill -f "trading" 2>/dev/null || true

# Start only trading system
cd backend
node -e "
const express = require('express');
const app = express();
const PORT = 8084;

app.use(express.json());
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.send('<h1>📈 Trading System</h1><p>Trading dashboard would be here</p>');
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'Trading System' });
});

app.listen(PORT, () => {
  console.log('📈 Trading System: http://localhost:' + PORT);
});
"