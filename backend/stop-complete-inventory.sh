#!/bin/bash

# Stop Complete Inventory System

echo ""
echo "🛑 STOPPING COMPLETE INVENTORY SYSTEM"
echo "================================================================================"
echo ""

# Read PIDs if available
if [ -f ".inventory_pids" ]; then
    source .inventory_pids

    echo "Stopping services..."

    if [ ! -z "$API_PID" ]; then
        kill $API_PID 2>/dev/null && echo "✅ Stopped Inventory API (PID: $API_PID)"
    fi

    if [ ! -z "$MONITOR_PID" ]; then
        kill $MONITOR_PID 2>/dev/null && echo "✅ Stopped AI Monitor (PID: $MONITOR_PID)"
    fi

    if [ ! -z "$PDF_PID" ]; then
        kill $PDF_PID 2>/dev/null && echo "✅ Stopped OneDrive Monitor (PID: $PDF_PID)"
    fi

    rm .inventory_pids
fi

# Cleanup any remaining processes
echo ""
echo "Cleaning up remaining processes..."
pkill -f "node.*server.js" 2>/dev/null
pkill -f "node.*ai_monitor" 2>/dev/null
pkill -f "node.*monitor_onedrive" 2>/dev/null

sleep 2

echo ""
echo "✅ All inventory services stopped"
echo ""
