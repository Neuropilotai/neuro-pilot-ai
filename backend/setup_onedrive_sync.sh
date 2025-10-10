#!/bin/bash

# OneDrive Sync Setup for GFS Invoices
# This script sets up rclone to sync PDFs from OneDrive

echo ""
echo "🔄 OneDrive Sync Setup for GFS Invoices"
echo "========================================"
echo ""

# Check if rclone is installed
if ! command -v rclone &> /dev/null; then
    echo "❌ rclone not found. Installing..."

    # Install rclone based on OS
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        if command -v brew &> /dev/null; then
            brew install rclone
        else
            curl https://rclone.org/install.sh | sudo bash
        fi
    else
        # Linux
        curl https://rclone.org/install.sh | sudo bash
    fi

    echo "✅ rclone installed"
else
    echo "✅ rclone already installed"
fi

echo ""
echo "📋 OneDrive Configuration"
echo "-------------------------"
echo ""
echo "Your OneDrive link: https://1drv.ms/f/c/613dd27101141ec1/EhOahKqtqcVNvx8b5GSOFzkBd1ngJR3DWIWi6wi-AJoztg?e=HOOeqI"
echo ""
echo "To configure OneDrive access, run:"
echo ""
echo "  rclone config"
echo ""
echo "Then follow these steps:"
echo "  1. Choose 'n' for new remote"
echo "  2. Name it: onedrive_gfs"
echo "  3. Choose: Microsoft OneDrive (option 31)"
echo "  4. Leave client_id blank (press Enter)"
echo "  5. Leave client_secret blank (press Enter)"
echo "  6. Choose region: 1 (Microsoft Cloud Global)"
echo "  7. Choose 'n' for advanced config"
echo "  8. Choose 'y' for auto config (will open browser)"
echo "  9. Log in to your Microsoft account"
echo "  10. Choose 'y' to confirm"
echo ""
echo "After configuration, this script will sync PDFs automatically."
echo ""

# Check if OneDrive remote exists
if rclone listremotes | grep -q "onedrive_gfs:"; then
    echo "✅ OneDrive remote 'onedrive_gfs' is configured"
    echo ""

    # Create data/pdfs directory if it doesn't exist
    mkdir -p ./data/pdfs

    echo "🔄 Syncing PDFs from OneDrive..."
    echo ""

    # Sync PDFs from OneDrive shared folder
    # Note: You may need to adjust the path based on your OneDrive structure
    rclone copy "onedrive_gfs:GFS Invoices" ./data/pdfs --include "*.pdf" -P

    # Count PDFs
    PDF_COUNT=$(ls -1 ./data/pdfs/*.pdf 2>/dev/null | wc -l)
    echo ""
    echo "✅ Synced $PDF_COUNT PDF files to ./data/pdfs/"
    echo ""

else
    echo "⚠️  OneDrive remote not configured yet."
    echo ""
    echo "Please run: rclone config"
    echo "and follow the steps above."
    echo ""
fi
