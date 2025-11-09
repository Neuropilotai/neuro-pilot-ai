#!/bin/bash
# ==================================================
# Group7 AI Video Factory - Deployment Validator
# ==================================================
# Checks that all systems are configured correctly
# before first production run
# ==================================================

set -e

echo "🔍 Group7 AI Video Factory - Deployment Validation"
echo "===================================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ERRORS=0
WARNINGS=0

# ==================================================
# Helper Functions
# ==================================================

check_pass() {
    echo -e "${GREEN}✓${NC} $1"
}

check_fail() {
    echo -e "${RED}✗${NC} $1"
    ((ERRORS++))
}

check_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
    ((WARNINGS++))
}

check_env_var() {
    if [ -z "${!1}" ]; then
        check_fail "$1 is not set in .env"
        return 1
    else
        check_pass "$1 is set"
        return 0
    fi
}

test_api_endpoint() {
    local name=$1
    local url=$2
    local expected_status=$3

    if command -v curl &> /dev/null; then
        status=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")
        if [ "$status" = "$expected_status" ]; then
            check_pass "$name endpoint reachable (HTTP $status)"
        else
            check_warn "$name endpoint returned HTTP $status (expected $expected_status)"
        fi
    else
        check_warn "curl not found, skipping $name endpoint test"
    fi
}

# ==================================================
# 1. Environment File Check
# ==================================================

echo "1. Checking Environment Configuration..."
echo "----------------------------------------"

if [ ! -f ".env" ]; then
    check_fail ".env file not found! Copy GROUP7_ENV_TEMPLATE.env to .env"
    echo ""
    echo "Run: cp GROUP7_ENV_TEMPLATE.env .env"
    exit 1
else
    check_pass ".env file exists"
fi

# Source .env file
export $(grep -v '^#' .env | xargs)

# Check critical API keys
check_env_var "OPENAI_API_KEY"
check_env_var "ELEVENLABS_API_KEY"
check_env_var "CANVA_APP_ID"
check_env_var "CANVA_APP_SECRET"
check_env_var "GOOGLE_DRIVE_TOKEN"
check_env_var "METRICOOL_TOKEN"
check_env_var "NOTION_TOKEN"
check_env_var "CLOUDCONVERT_TOKEN"

echo ""

# ==================================================
# 2. Node.js Dependencies
# ==================================================

echo "2. Checking Node.js Environment..."
echo "----------------------------------------"

if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    check_pass "Node.js installed: $NODE_VERSION"

    # Check if version >= 18
    MAJOR_VERSION=$(echo $NODE_VERSION | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$MAJOR_VERSION" -ge 18 ]; then
        check_pass "Node.js version >= 18"
    else
        check_warn "Node.js version < 18 (recommend 18+)"
    fi
else
    check_fail "Node.js not installed"
fi

if [ -f "package.json" ]; then
    check_pass "package.json found"

    if [ -d "node_modules" ]; then
        check_pass "node_modules exists (dependencies installed)"
    else
        check_warn "node_modules not found - run: npm install"
    fi
else
    check_fail "package.json not found"
fi

echo ""

# ==================================================
# 3. Required Files
# ==================================================

echo "3. Checking Required Files..."
echo "----------------------------------------"

FILES=(
    "DEPLOYMENT_GUIDE.md"
    "SYSTEM_READY.md"
    "QUICK_REFERENCE.md"
    "GROUP7_ENV_TEMPLATE.env"
    "MAKECOM_VIDEO_FACTORY_SCENARIO.json"
    "canva-render-service.ts"
    "VOICE_SETTINGS_TABLE.json"
    "CANVA_DATA_SCHEMA.csv"
    "OPENAI_PROMPTS.json"
    "METRICOOL_API_PAYLOADS.json"
    "CLOUDCONVERT_TEMPLATES.json"
    "NOTION_DATABASE_SCHEMAS.json"
    "retry-idempotency-module.ts"
    "TESTING_DATASET.json"
)

for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then
        check_pass "$file"
    else
        check_fail "$file missing"
    fi
done

echo ""

# ==================================================
# 4. API Endpoint Tests
# ==================================================

echo "4. Testing API Endpoints..."
echo "----------------------------------------"

# Test OpenAI
if [ -n "$OPENAI_API_KEY" ]; then
    test_api_endpoint "OpenAI" "https://api.openai.com/v1/models" "200"
fi

# Test ElevenLabs
if [ -n "$ELEVENLABS_API_KEY" ]; then
    test_api_endpoint "ElevenLabs" "https://api.elevenlabs.io/v1/voices" "200"
fi

# Test CloudConvert
if [ -n "$CLOUDCONVERT_TOKEN" ]; then
    test_api_endpoint "CloudConvert" "https://api.cloudconvert.com/v2/users/me" "200"
fi

# Test Metricool
if [ -n "$METRICOOL_TOKEN" ]; then
    test_api_endpoint "Metricool" "https://api.metricool.com/v1/accounts" "200"
fi

# Test Notion
if [ -n "$NOTION_TOKEN" ]; then
    test_api_endpoint "Notion" "https://api.notion.com/v1/users/me" "200"
fi

# Test Canva service (if running)
if [ -n "$CANVA_ENDPOINT" ]; then
    test_api_endpoint "Canva Render Service" "${CANVA_ENDPOINT}/health" "200"
else
    check_warn "CANVA_ENDPOINT not set - using default http://localhost:3001"
    test_api_endpoint "Canva Render Service" "http://localhost:3001/health" "200"
fi

echo ""

# ==================================================
# 5. Notion Database IDs
# ==================================================

echo "5. Checking Notion Configuration..."
echo "----------------------------------------"

check_env_var "VIDEO_PRODUCTION_LOG_DB_ID"
check_env_var "ANALYTICS_INSIGHTS_DB_ID"
check_env_var "ERROR_LOG_DB_ID"
check_env_var "CONFIG_CHANGELOG_DB_ID"

echo ""

# ==================================================
# 6. Google Drive Folder IDs
# ==================================================

echo "6. Checking Google Drive Configuration..."
echo "----------------------------------------"

check_env_var "DRIVE_ROOT_FOLDER_ID"
check_env_var "DRIVE_SCRIPTS_FOLDER_ID"
check_env_var "DRIVE_VOICE_FOLDER_ID"
check_env_var "DRIVE_VIDEOS_FOLDER_ID"

echo ""

# ==================================================
# 7. Social Account IDs
# ==================================================

echo "7. Checking Social Media Configuration..."
echo "----------------------------------------"

check_env_var "TIKTOK_ACCOUNT_ID"
check_env_var "INSTAGRAM_ACCOUNT_ID"
check_env_var "YOUTUBE_ACCOUNT_ID"

echo ""

# ==================================================
# 8. Voice IDs
# ==================================================

echo "8. Checking ElevenLabs Voice Configuration..."
echo "----------------------------------------"

check_env_var "VOICE_RACHEL"
check_env_var "VOICE_ADAM"
check_env_var "VOICE_DOMI"
check_env_var "VOICE_BELLA"
check_env_var "VOICE_CALLUM"
check_env_var "VOICE_GEORGE"

echo ""

# ==================================================
# 9. Canva Configuration
# ==================================================

echo "9. Checking Canva Configuration..."
echo "----------------------------------------"

check_env_var "CANVA_TEMPLATE_ID"

if [ -n "$CANVA_ACCESS_TOKEN" ]; then
    check_pass "CANVA_ACCESS_TOKEN is set"
else
    check_warn "CANVA_ACCESS_TOKEN not set (may need OAuth flow)"
fi

echo ""

# ==================================================
# 10. TypeScript Compilation
# ==================================================

echo "10. Checking TypeScript Build..."
echo "----------------------------------------"

if [ -f "tsconfig.json" ] || [ -f "canva-render-service.ts" ]; then
    if command -v tsc &> /dev/null; then
        check_pass "TypeScript compiler available"

        if [ -d "dist" ]; then
            check_pass "dist/ directory exists (compiled)"
        else
            check_warn "dist/ not found - run: npm run build"
        fi
    else
        check_warn "TypeScript compiler not found globally (using node_modules)"
    fi
fi

echo ""

# ==================================================
# Summary
# ==================================================

echo "===================================================="
echo "Validation Summary"
echo "===================================================="
echo ""

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✓ All checks passed!${NC}"
    echo ""
    echo "🎬 Your system is ready for deployment!"
    echo ""
    echo "Next steps:"
    echo "  1. Start Canva render service: npm run dev"
    echo "  2. Import Make.com scenario"
    echo "  3. Run test with 1 agent"
    echo "  4. Deploy full system (7 agents)"
    echo ""
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}⚠ $WARNINGS warning(s) found${NC}"
    echo ""
    echo "System can proceed but review warnings above."
    echo ""
    exit 0
else
    echo -e "${RED}✗ $ERRORS error(s) and $WARNINGS warning(s) found${NC}"
    echo ""
    echo "Please fix errors before deploying to production."
    echo "Refer to DEPLOYMENT_GUIDE.md for setup instructions."
    echo ""
    exit 1
fi
