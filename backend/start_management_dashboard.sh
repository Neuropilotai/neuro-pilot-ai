#!/bin/bash

# Management Dashboard Startup Script
echo "🎯 Starting Management Dashboard..."

# Check if port 3007 is already in use
if lsof -Pi :3007 -sTCP:LISTEN -t >/dev/null ; then
    echo "⚠️  Port 3007 is already in use. Stopping existing process..."
    PID=$(lsof -Pi :3007 -sTCP:LISTEN -t)
    kill $PID
    sleep 2
fi

# Start the management dashboard
echo "🚀 Starting Management Dashboard on port 3007..."
nohup node management_dashboard.js > management_dashboard.log 2>&1 &
PID=$!

# Wait a moment for startup
sleep 3

# Check if it started successfully
if lsof -Pi :3007 -sTCP:LISTEN -t >/dev/null ; then
    echo "✅ Management Dashboard started successfully!"
    echo "📊 Dashboard URL: http://localhost:3007"
    echo "📋 Process ID: $PID"
    echo "📁 Log file: management_dashboard.log"
    echo ""
    echo "Features available:"
    echo "  • Project approval and management"
    echo "  • Research task management"
    echo "  • Development progress tracking"
    echo "  • Intelligent recommendations"
else
    echo "❌ Failed to start Management Dashboard"
    echo "📁 Check management_dashboard.log for errors"
    exit 1
fi