#!/bin/bash

# Start the cloud folder watcher

echo "🔍 Starting Cloud Folder Watcher..."

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies first..."
    npm install chokidar
fi

# Start the watcher
echo "🚀 Launching watcher..."
echo "💡 Drop files into watched folders to generate reports automatically"
echo ""

node cloud-folder-watcher.js