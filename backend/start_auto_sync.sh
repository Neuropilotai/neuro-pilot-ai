#!/bin/bash

# Start Auto-Sync in Background
# This starts the OneDrive sync daemon and keeps it running

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PID_FILE="$SCRIPT_DIR/.auto_sync.pid"
LOG_FILE="$SCRIPT_DIR/auto_sync.log"

echo ""
echo "🚀 Starting OneDrive Auto-Sync Daemon"
echo "======================================"
echo ""

# Check if already running
if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    if ps -p "$OLD_PID" > /dev/null 2>&1; then
        echo "⚠️  Auto-sync is already running (PID: $OLD_PID)"
        echo ""
        echo "To stop it, run:"
        echo "   ./stop_auto_sync.sh"
        echo ""
        exit 1
    else
        # Stale PID file, remove it
        rm "$PID_FILE"
    fi
fi

# Start the auto-sync in background
nohup "$SCRIPT_DIR/auto_sync_onedrive.sh" > "$LOG_FILE" 2>&1 &
PID=$!

# Save PID
echo $PID > "$PID_FILE"

echo "✅ Auto-sync started successfully!"
echo ""
echo "PID: $PID"
echo "Log file: $LOG_FILE"
echo ""
echo "Commands:"
echo "   View logs:     tail -f $LOG_FILE"
echo "   Stop daemon:   ./stop_auto_sync.sh"
echo "   Check status:  ./check_auto_sync.sh"
echo ""
