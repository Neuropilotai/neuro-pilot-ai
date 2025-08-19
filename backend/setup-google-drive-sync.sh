#!/bin/bash

# Quick setup script for Google Drive sync

echo "🔧 Setting up Google Drive sync for inventory..."
echo ""

# Check if rclone is installed
if ! command -v rclone &> /dev/null; then
    echo "📦 Installing rclone..."
    brew install rclone
fi

echo "📋 Follow these steps to configure Google Drive:"
echo ""
echo "1. Run: rclone config"
echo "2. Choose 'n' for new remote"
echo "3. Name it: gdrive"
echo "4. Choose '17' for Google Drive"
echo "5. Leave client_id and client_secret blank"
echo "6. Choose '1' for full access"
echo "7. Leave root_folder_id blank"
echo "8. Leave service_account_file blank"
echo "9. Choose 'n' for advanced config"
echo "10. Choose 'y' to use web browser for auth"
echo "11. Login to your Google account"
echo "12. Choose 'y' to confirm"
echo ""
echo "After setup, run: ./sync-to-cloud.sh"

# Create automated sync with launchd
echo ""
echo "Would you like to set up automatic hourly sync? (y/n)"
read -r response

if [[ "$response" =~ ^[Yy]$ ]]; then
    cat > ~/Library/LaunchAgents/com.campinventory.sync.plist << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.campinventory.sync</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>$(pwd)/sync-to-cloud.sh</string>
    </array>
    <key>StartInterval</key>
    <integer>3600</integer>
    <key>WorkingDirectory</key>
    <string>$(pwd)</string>
    <key>StandardOutPath</key>
    <string>$(pwd)/sync.log</string>
    <key>StandardErrorPath</key>
    <string>$(pwd)/sync-error.log</string>
</dict>
</plist>
EOF

    launchctl load ~/Library/LaunchAgents/com.campinventory.sync.plist
    echo "✅ Automatic hourly sync enabled!"
fi