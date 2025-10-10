#!/bin/bash

# Enterprise Inventory System - Stop Script
# Usage: ./stop.sh

echo "════════════════════════════════════════════════════════════"
echo "         STOPPING ENTERPRISE INVENTORY SYSTEM"
echo "════════════════════════════════════════════════════════════"
echo ""

# Function to stop a process by name
stop_process() {
    local process_name=$1
    local pids=$(ps aux | grep -v grep | grep "$process_name" | awk '{print $2}')

    if [ -n "$pids" ]; then
        echo "🛑 Stopping $process_name..."
        for pid in $pids; do
            kill -TERM $pid 2>/dev/null
            echo "   Stopped PID: $pid"
        done
    else
        echo "⚪ $process_name is not running"
    fi
}

# Stop all inventory system processes
echo "Shutting down services..."
echo ""

stop_process "enterprise-secure-inventory.js"
stop_process "ai_monitoring_system.js"
stop_process "start-inventory-system.js"
stop_process "financial_audit_analysis.js"
stop_process "unified_system_totals.js"

# Also stop any node processes on port 8083
echo ""
echo "🔍 Checking for processes on port 8083..."
lsof -ti:8083 | xargs kill -9 2>/dev/null && echo "   Port 8083 cleared" || echo "   Port 8083 was already free"

echo ""
echo "✅ All inventory system services have been stopped"
echo "════════════════════════════════════════════════════════════"