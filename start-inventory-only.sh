#!/bin/bash

echo "🏕️ Starting INVENTORY SYSTEM ONLY..."
echo "🔍 Inventory Agent & Dashboard"
echo "🚀 Port: 3001"
echo ""

# Kill any existing inventory processes
pkill -f "inventory" 2>/dev/null || true

# Start working AI inventory system
cd backend
node inventory-working.js

echo "📦 Full AI Inventory System running at http://localhost:3001"
echo "🤖 AI Dashboard: http://localhost:3001/dashboard"  
echo "🔐 Login: http://localhost:3001/login"
echo "🧠 AI Agent: Learning & Monitoring Active"