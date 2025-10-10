#!/bin/bash

# Stop Auto-Sync Daemon

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PID_FILE="$SCRIPT_DIR/.auto_sync.pid"

echo ""
echo "🛑 Stopping OneDrive Auto-Sync Daemon"
echo "======================================"
echo ""

if [ ! -f "$PID_FILE" ]; then
    echo "⚠️  Auto-sync is not running (no PID file found)"
    echo ""
    exit 1
fi

PID=$(cat "$PID_FILE")

if ps -p "$PID" > /dev/null 2>&1; then
    kill "$PID"
    rm "$PID_FILE"
    echo "✅ Auto-sync stopped (PID: $PID)"
else
    echo "⚠️  Process not found (PID: $PID)"
    echo "   Removing stale PID file..."
    rm "$PID_FILE"
fi

echo ""
