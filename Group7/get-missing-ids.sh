#!/bin/bash
# ==================================================
# Helper Script: Get Missing Configuration IDs
# ==================================================
# This script helps you fetch the remaining IDs needed
# for your .env file
# ==================================================

set -e

echo "🔍 Group7 AI Video Factory - Configuration Helper"
echo "===================================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Load .env if exists
if [ -f ".env" ]; then
    export $(grep -v '^#' .env | xargs 2>/dev/null)
fi

echo -e "${BLUE}This script will help you get the following IDs:${NC}"
echo "  1. Metricool Social Account IDs"
echo "  2. Google Drive Folder IDs"
echo "  3. Notion Database IDs"
echo ""
echo "Make sure you have:"
echo "  ✓ Metricool token ready"
echo "  ✓ Google Drive folders created"
echo "  ✓ Notion databases created"
echo ""
read -p "Press ENTER to continue..."
echo ""

# ==================================================
# 1. Metricool Account IDs
# ==================================================

echo -e "${YELLOW}1. Fetching Metricool Account IDs...${NC}"
echo "----------------------------------------"

if [ -z "$METRICOOL_TOKEN" ]; then
    echo "Enter your Metricool API token:"
    read METRICOOL_TOKEN
fi

echo "Fetching accounts from Metricool..."
METRICOOL_RESPONSE=$(curl -s -X GET "https://api.metricool.com/v1/accounts" \
  -H "Authorization: Bearer $METRICOOL_TOKEN" 2>/dev/null || echo "{}")

if echo "$METRICOOL_RESPONSE" | jq empty 2>/dev/null; then
    echo ""
    echo -e "${GREEN}✓ Found accounts:${NC}"
    echo "$METRICOOL_RESPONSE" | jq -r '.data[] | "  \(.platform): \(.id)"' 2>/dev/null || echo "No accounts found"
    echo ""
    echo "Add these to your .env:"
    echo "$METRICOOL_RESPONSE" | jq -r '.data[] |
        if .platform == "tiktok" then "TIKTOK_ACCOUNT_ID=\(.id)"
        elif .platform == "instagram" then "INSTAGRAM_ACCOUNT_ID=\(.id)"
        elif .platform == "youtube" then "YOUTUBE_ACCOUNT_ID=\(.id)"
        else empty end' 2>/dev/null || echo "# No accounts configured yet"
    echo ""
else
    echo -e "${YELLOW}⚠ Could not fetch Metricool accounts. Check your token.${NC}"
    echo "Manual method:"
    echo "  1. Go to https://app.metricool.com/settings/social-networks"
    echo "  2. Connect TikTok, Instagram, YouTube"
    echo "  3. Run: curl -H 'Authorization: Bearer YOUR_TOKEN' https://api.metricool.com/v1/accounts"
fi

read -p "Press ENTER to continue..."
echo ""

# ==================================================
# 2. Google Drive Folders
# ==================================================

echo -e "${YELLOW}2. Google Drive Folder Setup${NC}"
echo "----------------------------------------"
echo ""
echo "Create these folders in Google Drive:"
echo "  /Group7/"
echo "  /Group7/Scripts/"
echo "  /Group7/Voice/"
echo "  /Group7/Production/"
echo "  /Group7/Production/Videos/"
echo "  /Group7/Analytics/"
echo ""
echo "For each folder:"
echo "  1. Create the folder"
echo "  2. Right-click → Share → Anyone with link can view"
echo "  3. Copy URL: https://drive.google.com/drive/folders/FOLDER_ID"
echo "  4. Extract the FOLDER_ID (32 characters after /folders/)"
echo ""
echo "Example:"
echo "  URL: https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz123456"
echo "  ID:  1AbCdEfGhIjKlMnOpQrStUvWxYz123456"
echo ""
echo "Add to .env:"
echo "  DRIVE_ROOT_FOLDER_ID=1AbCdEfGhIjKlMnOpQrStUvWxYz123456"
echo "  DRIVE_SCRIPTS_FOLDER_ID=..."
echo "  DRIVE_VOICE_FOLDER_ID=..."
echo "  DRIVE_VIDEOS_FOLDER_ID=..."
echo "  DRIVE_ANALYTICS_FOLDER_ID=..."
echo ""

read -p "Press ENTER to continue..."
echo ""

# ==================================================
# 3. Notion Databases
# ==================================================

echo -e "${YELLOW}3. Notion Database Setup${NC}"
echo "----------------------------------------"
echo ""
echo "Create 4 databases in Notion:"
echo ""
echo "  1. 📹 Video Production Log"
echo "     - Use schema from NOTION_DATABASE_SCHEMAS.json"
echo ""
echo "  2. 📊 Analytics & Insights"
echo "     - Use schema from NOTION_DATABASE_SCHEMAS.json"
echo ""
echo "  3. ⚠️ Error & Retry Log"
echo "     - Use schema from NOTION_DATABASE_SCHEMAS.json"
echo ""
echo "  4. ⚙️ Config Changelog"
echo "     - Use schema from NOTION_DATABASE_SCHEMAS.json"
echo ""
echo "For each database:"
echo "  1. Create database in Notion"
echo "  2. Share with your integration (Group7 Video Factory)"
echo "  3. Copy database URL"
echo "  4. Extract 32-character database ID"
echo ""
echo "Example:"
echo "  URL: https://notion.so/workspace/abc123def456?v=..."
echo "  ID:  abc123def456abc123def456abc123de (32 chars, no dashes)"
echo ""

if [ -n "$NOTION_TOKEN" ]; then
    echo "Testing Notion API access..."
    NOTION_TEST=$(curl -s -X GET "https://api.notion.com/v1/users/me" \
      -H "Authorization: Bearer $NOTION_TOKEN" \
      -H "Notion-Version: 2022-06-28" 2>/dev/null || echo "{}")

    if echo "$NOTION_TEST" | jq -e '.object == "user"' >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Notion API token is valid${NC}"
        USER_NAME=$(echo "$NOTION_TEST" | jq -r '.name // "User"')
        echo "  Authenticated as: $USER_NAME"
    else
        echo -e "${YELLOW}⚠ Could not verify Notion token${NC}"
    fi
fi

echo ""
echo "Add to .env:"
echo "  VIDEO_PRODUCTION_LOG_DB_ID=abc123def456abc123def456abc123de"
echo "  ANALYTICS_INSIGHTS_DB_ID=..."
echo "  ERROR_LOG_DB_ID=..."
echo "  CONFIG_CHANGELOG_DB_ID=..."
echo ""

read -p "Press ENTER to continue..."
echo ""

# ==================================================
# 4. Canva Template
# ==================================================

echo -e "${YELLOW}4. Canva Template Setup${NC}"
echo "----------------------------------------"
echo ""
echo "Create your video template:"
echo "  1. Go to Canva → Create Design → Custom Size: 1080 x 1920 px"
echo "  2. Add text elements with EXACT names:"
echo "     - hook_text (large, top)"
echo "     - insight_text (medium, middle)"
echo "     - cta_text (bottom)"
echo "     - agent_name (small, branding)"
echo "  3. Design with your brand colors:"
echo "     - Primary: #0B1220"
echo "     - Accent: #0EA5E9"
echo "     - Light: #F8FAFC"
echo "  4. Set duration: 25-30 seconds"
echo "  5. Save as template"
echo "  6. Copy Template ID from URL"
echo ""
echo "Add to .env:"
echo "  CANVA_TEMPLATE_ID=DAGxxxxxxxxxx"
echo ""

read -p "Press ENTER to continue..."
echo ""

# ==================================================
# Summary
# ==================================================

echo "===================================================="
echo -e "${GREEN}Configuration Helper Complete${NC}"
echo "===================================================="
echo ""
echo "Next steps:"
echo "  1. Update your .env file with the IDs above"
echo "  2. Run validation: ./validate-deployment.sh"
echo "  3. Start Canva service: npm run dev"
echo "  4. Follow QUICKSTART.md for testing"
echo ""
echo "Resources:"
echo "  • QUICKSTART.md - 60-minute setup guide"
echo "  • DEPLOYMENT_GUIDE.md - Detailed instructions"
echo "  • NOTION_DATABASE_SCHEMAS.json - Database structures"
echo ""
echo "Need help? Check the docs in this folder!"
echo ""
