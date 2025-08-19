#!/bin/bash

# Setup script for cloud folder watcher

echo "🚀 Setting up Cloud Folder Watcher..."

# Install required npm packages
echo "📦 Installing dependencies..."
npm install chokidar

# Install PDF processing tools
echo "📄 Installing PDF processing tools..."
if ! command -v pdftotext &> /dev/null; then
    echo "Installing poppler-utils for PDF text extraction..."
    if command -v brew &> /dev/null; then
        brew install poppler
    else
        echo "⚠️  Please install poppler-utils manually for PDF processing"
        echo "   On macOS: brew install poppler"
        echo "   On Ubuntu: sudo apt-get install poppler-utils"
    fi
else
    echo "✅ PDF tools already installed"
fi

# Create watch folders
echo "📁 Creating watch folders..."

# Google Drive
GOOGLE_DRIVE_FOLDER="$HOME/Google Drive/My Drive/CampInventory/inbox"
if [ ! -d "$GOOGLE_DRIVE_FOLDER" ]; then
    mkdir -p "$GOOGLE_DRIVE_FOLDER"
    echo "✅ Created Google Drive folder: $GOOGLE_DRIVE_FOLDER"
fi

# Dropbox
DROPBOX_FOLDER="$HOME/Dropbox/CampInventory/inbox"
if [ ! -d "$DROPBOX_FOLDER" ]; then
    mkdir -p "$DROPBOX_FOLDER" 2>/dev/null && echo "✅ Created Dropbox folder: $DROPBOX_FOLDER"
fi

# OneDrive
ONEDRIVE_FOLDER="$HOME/Library/CloudStorage/OneDrive-Personal/CampInventory/inbox"
if [ ! -d "$ONEDRIVE_FOLDER" ]; then
    mkdir -p "$ONEDRIVE_FOLDER" 2>/dev/null && echo "✅ Created OneDrive folder: $ONEDRIVE_FOLDER"
fi

# Local watch folder (always works)
LOCAL_FOLDER="./watch-folder"
mkdir -p "$LOCAL_FOLDER"
echo "✅ Created local watch folder: $LOCAL_FOLDER"

# Create reports folder
mkdir -p "./automated-reports"

# Make the watcher executable
chmod +x cloud-folder-watcher.js

echo ""
echo "✅ Setup complete!"
echo ""
echo "📋 Instructions:"
echo "1. Start the watcher: node cloud-folder-watcher.js"
echo "2. Drop files into any of these folders:"

if [ -d "$GOOGLE_DRIVE_FOLDER" ]; then
    echo "   📁 Google Drive: $GOOGLE_DRIVE_FOLDER"
fi

if [ -d "$DROPBOX_FOLDER" ]; then
    echo "   📁 Dropbox: $DROPBOX_FOLDER"
fi

if [ -d "$ONEDRIVE_FOLDER" ]; then
    echo "   📁 OneDrive: $ONEDRIVE_FOLDER"
fi

echo "   📁 Local: $LOCAL_FOLDER"
echo ""
echo "📊 Reports will be generated in: ./automated-reports"
echo ""
echo "💡 File types supported:"
echo "   - GFS orders (JSON files with 'gfs_order' in name)"
echo "   - Inventory files (JSON files with 'inventory' in name)"
echo "   - CSV files (any .csv file)"
echo "   - Generic JSON files"
echo ""
echo "🔧 To run automatically on startup:"
echo "   Add this to your startup items or create a cron job"