#!/bin/bash

echo "📄 Starting RESUME SYSTEM ONLY..."
echo "✍️ AI Resume Generator & Templates"
echo "🚀 Port: 8085"
echo ""

# Kill any existing resume processes
pkill -f "resume" 2>/dev/null || true

# Start only resume system
cd backend
node -e "
const express = require('express');
const app = express();
const PORT = 8085;

app.use(express.json());
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.send('<h1>📄 Resume Generation System</h1><p>Resume builder would be here</p>');
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'Resume Generation System' });
});

app.listen(PORT, () => {
  console.log('📄 Resume System: http://localhost:' + PORT);
});
"