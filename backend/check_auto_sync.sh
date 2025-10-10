#!/bin/bash

# Check Auto-Sync Status

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PID_FILE="$SCRIPT_DIR/.auto_sync.pid"
LOG_FILE="$SCRIPT_DIR/auto_sync.log"

echo ""
echo "📊 OneDrive Auto-Sync Status"
echo "======================================"
echo ""

if [ ! -f "$PID_FILE" ]; then
    echo "Status: ❌ NOT RUNNING"
    echo ""
    echo "To start auto-sync:"
    echo "   ./start_auto_sync.sh"
    echo ""
    exit 1
fi

PID=$(cat "$PID_FILE")

if ps -p "$PID" > /dev/null 2>&1; then
    echo "Status: ✅ RUNNING"
    echo "PID: $PID"
    echo ""

    # Show process details
    echo "Process Details:"
    ps -p "$PID" -o pid,etime,cmd | tail -n +2
    echo ""

    # Show last 10 log lines
    if [ -f "$LOG_FILE" ]; then
        echo "Recent Activity (last 10 lines):"
        echo "------------------------------------"
        tail -n 10 "$LOG_FILE"
        echo ""
        echo "Full logs: tail -f $LOG_FILE"
    fi
else
    echo "Status: ❌ NOT RUNNING (stale PID file)"
    echo ""
    rm "$PID_FILE"
    echo "Removed stale PID file. Start again with:"
    echo "   ./start_auto_sync.sh"
fi

echo ""
