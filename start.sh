#!/bin/bash
# Railway startup script to ensure production server is used

echo "🚀 Starting Neuro.Pilot.AI Production System..."
echo "Node version: $(node --version)"
echo "NPM version: $(npm --version)"
echo "Current directory: $(pwd)"
echo "Files present:"
ls -la *.js | head -10

echo ""
echo "🔍 Checking for production server..."
if [ -f "railway-server-production.js" ]; then
    echo "✅ Found railway-server-production.js - starting production system"
    node railway-server-production.js
else
    echo "⚠️ Production server not found, checking alternatives..."
    if [ -f "railway-server-full.js" ]; then
        echo "📦 Using railway-server-full.js as fallback"
        node railway-server-full.js
    else
        echo "❌ No suitable server found"
        exit 1
    fi
fi