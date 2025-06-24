#!/bin/bash

# NEURO.PILOT.AI Production Startup Script
echo "🚀 Starting NEURO.PILOT.AI Production System..."

# Kill any existing processes
echo "🔄 Stopping existing processes..."
pkill -f "node server.js" 2>/dev/null
pkill -f "npm start" 2>/dev/null

# Wait for processes to stop
sleep 3

# Function to start backend with auto-restart
start_backend() {
    echo "🏭 Starting Backend Server..."
    cd /Users/davidmikulis/neuro-pilot-ai/backend
    
    while true; do
        echo "$(date): Starting backend server..."
        node server.js
        echo "$(date): Backend server stopped. Restarting in 5 seconds..."
        sleep 5
    done &
    
    BACKEND_PID=$!
    echo "📊 Backend started with PID: $BACKEND_PID"
}

# Function to start frontend
start_frontend() {
    echo "🌐 Starting Frontend Dashboard..."
    cd /Users/davidmikulis/neuro-pilot-ai/frontend
    npm start &
    FRONTEND_PID=$!
    echo "📱 Frontend started with PID: $FRONTEND_PID"
}

# Start services
start_backend
sleep 10  # Wait for backend to initialize

start_frontend
sleep 5   # Wait for frontend to start

# Display status
echo ""
echo "✅ NEURO.PILOT.AI System Started Successfully!"
echo "📊 Backend API: http://localhost:8000"
echo "🌐 Frontend Dashboard: http://localhost:3000"
echo "🔗 WebSocket: Real-time updates active"
echo ""
echo "📋 Process IDs:"
echo "   Backend: $BACKEND_PID"
echo "   Frontend: $FRONTEND_PID"
echo ""
echo "🛑 To stop all services, run: pkill -f 'node server.js' && pkill -f 'npm start'"
echo "📝 Logs are displayed in real-time. Press Ctrl+C to stop monitoring."

# Keep script running and show logs
wait