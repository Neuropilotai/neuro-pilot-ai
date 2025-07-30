#!/bin/bash

echo "🔒 Starting PROTECTED Inventory System..."
echo "© 2025 David Mikulis. All Rights Reserved."
echo "⚠️  Code protection active - Same as yesterday!"
echo ""

# Stop any existing inventory systems
echo "🛑 Stopping any existing systems..."
pkill -f "inventory" 2>/dev/null || true

sleep 2

echo "✅ Previous systems stopped"
echo ""

# Start the PROTECTED inventory system
echo "🚀 Starting PROTECTED Inventory System..."
cd /Users/davidmikulis/neuro-pilot-ai/backend
node inventory-system-protected.js