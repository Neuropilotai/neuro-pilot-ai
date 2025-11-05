#!/bin/bash
set -e  # Exit on error

echo "==================================================================="
echo "Railway Deployment Start Script"
echo "==================================================================="
echo ""
echo "Current directory: $(pwd)"
echo "User: $(whoami)"
echo "Node version: $(node --version)"
echo "NPM version: $(npm --version)"
echo ""
echo "Files in current directory:"
ls -lah | head -20
echo ""
echo "==================================================================="
echo "Step 1: Database Initialization"
echo "==================================================================="

if [ -f "scripts/init-database.js" ]; then
    echo "Running database initialization..."
    node scripts/init-database.js
    INIT_EXIT=$?
    echo "Database init exit code: $INIT_EXIT"
    if [ $INIT_EXIT -ne 0 ]; then
        echo "WARNING: Database initialization failed, continuing anyway..."
    fi
else
    echo "WARNING: scripts/init-database.js not found, skipping..."
fi

echo ""
echo "==================================================================="
echo "Step 2: Starting Server"
echo "==================================================================="

if [ -f "server.js" ]; then
    echo "Starting server.js..."
    exec node server.js
else
    echo "ERROR: server.js not found!"
    ls -la
    exit 1
fi
