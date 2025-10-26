#!/bin/bash
# ================================================================
# NeuroPilot v17.4 - Deployment Verification Script
# ================================================================
# Quick "is it alive?" checks for Sentient Cloud Mode
#
# Usage:
#   ./scripts/verify_deployment.sh [--verbose]
#
# Returns: 0 if all checks pass, 1 if any fail
# ================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

VERBOSE=false
if [[ "$1" == "--verbose" ]]; then
    VERBOSE=true
fi

CHECKS_PASSED=0
CHECKS_FAILED=0

echo -e "${BLUE}================================================================${NC}"
echo -e "${BLUE}🧪 NeuroPilot v17.4 - Deployment Verification${NC}"
echo -e "${BLUE}================================================================${NC}"
echo ""

# ================================================================
# Helper Functions
# ================================================================

check_pass() {
    echo -e "${GREEN}✓${NC} $1"
    ((CHECKS_PASSED++))
}

check_fail() {
    echo -e "${RED}✗${NC} $1"
    ((CHECKS_FAILED++))
}

check_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

section() {
    echo ""
    echo -e "${BLUE}━━━ $1 ━━━${NC}"
}

# ================================================================
# Check 1: Python Environment
# ================================================================

section "1. Python Environment"

if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version | awk '{print $2}')
    if [[ "${PYTHON_VERSION}" > "3.11" ]] || [[ "${PYTHON_VERSION}" == "3.11"* ]]; then
        check_pass "Python ${PYTHON_VERSION} (>= 3.11 required)"
    else
        check_fail "Python ${PYTHON_VERSION} (need >= 3.11)"
    fi
else
    check_fail "Python 3 not found"
fi

# ================================================================
# Check 2: Dependencies
# ================================================================

section "2. Python Dependencies"

REQUIRED_PACKAGES=(
    "numpy"
    "pandas"
    "tensorflow"
    "prophet"
    "xgboost"
    "scikit-learn"
    "requests"
    "pyyaml"
)

for pkg in "${REQUIRED_PACKAGES[@]}"; do
    if python3 -c "import ${pkg}" 2>/dev/null; then
        check_pass "${pkg} installed"
    else
        check_fail "${pkg} NOT installed"
    fi
done

# ================================================================
# Check 3: Environment Variables
# ================================================================

section "3. Environment Variables"

REQUIRED_ENV_VARS=(
    "PROMETHEUS_URL"
    "GRAFANA_URL"
    "GRAFANA_API_KEY"
    "SLACK_WEBHOOK_URL"
    "RAILWAY_API_TOKEN"
    "NEON_API_KEY"
    "CLOUDFLARE_API_TOKEN"
)

OPTIONAL_ENV_VARS=(
    "NOTION_API_KEY"
    "NOTION_DB_ID"
    "SENTRY_AUTH_TOKEN"
)

# Load .env if exists
if [ -f "../.env" ]; then
    export $(grep -v '^#' ../.env | xargs)
    check_pass ".env file found and loaded"
elif [ -f ".env" ]; then
    export $(grep -v '^#' .env | xargs)
    check_pass ".env file found and loaded"
else
    check_warn ".env file not found (using system environment)"
fi

for var in "${REQUIRED_ENV_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        check_fail "${var} not set (required)"
    else
        check_pass "${var} set"
    fi
done

for var in "${OPTIONAL_ENV_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        check_warn "${var} not set (optional)"
    else
        check_pass "${var} set"
    fi
done

# ================================================================
# Check 4: File Structure
# ================================================================

section "4. File Structure"

REQUIRED_FILES=(
    "master_controller.py"
    "predictive/forecast_engine.py"
    "agents/remediator.py"
    "scripts/self_audit.py"
    "config/sentient_config.yaml"
    "playbooks/restart.yaml"
    "playbooks/scale_up.yaml"
    "playbooks/optimize.yaml"
    "requirements.txt"
)

for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "$file" ]; then
        check_pass "$file exists"
    else
        check_fail "$file missing"
    fi
done

# ================================================================
# Check 5: Directory Structure
# ================================================================

section "5. Directory Structure"

REQUIRED_DIRS=(
    "agents"
    "predictive"
    "playbooks"
    "scripts"
    "config"
    "models"
    "../logs"
    "../logs/sentient"
    "../logs/remediation"
    "../logs/audit"
)

for dir in "${REQUIRED_DIRS[@]}"; do
    if [ -d "$dir" ]; then
        check_pass "$dir/ exists"
    else
        mkdir -p "$dir"
        check_warn "$dir/ created"
    fi
done

# ================================================================
# Check 6: Forecast Engine (Dry Run)
# ================================================================

section "6. Forecast Engine Validation"

echo "Running forecast engine in dry-run mode..."

if $VERBOSE; then
    python3 -c "
import sys
sys.path.insert(0, '.')
from predictive.forecast_engine import ForecastEngine

try:
    engine = ForecastEngine()
    print('✓ Forecast engine initialized')
except Exception as e:
    print(f'✗ Forecast engine failed: {e}')
    sys.exit(1)
" 2>&1
    EXIT_CODE=$?
else
    python3 -c "
import sys
sys.path.insert(0, '.')
from predictive.forecast_engine import ForecastEngine
engine = ForecastEngine()
" 2>/dev/null
    EXIT_CODE=$?
fi

if [ $EXIT_CODE -eq 0 ]; then
    check_pass "Forecast engine initialized"
else
    check_fail "Forecast engine initialization failed"
fi

# ================================================================
# Check 7: Remediation Agent (Dry Run)
# ================================================================

section "7. Remediation Agent Validation"

echo "Running remediation agent in dry-run mode..."

if $VERBOSE; then
    python3 -c "
import sys
sys.path.insert(0, '.')
from agents.remediator import Remediator

try:
    agent = Remediator()
    print('✓ Remediation agent initialized')
except Exception as e:
    print(f'✗ Remediation agent failed: {e}')
    sys.exit(1)
" 2>&1
    EXIT_CODE=$?
else
    python3 -c "
import sys
sys.path.insert(0, '.')
from agents.remediator import Remediator
agent = Remediator()
" 2>/dev/null
    EXIT_CODE=$?
fi

if [ $EXIT_CODE -eq 0 ]; then
    check_pass "Remediation agent initialized"
else
    check_fail "Remediation agent initialization failed"
fi

# ================================================================
# Check 8: Self-Audit Scanner
# ================================================================

section "8. Self-Audit Scanner Validation"

echo "Running compliance scanner..."

if $VERBOSE; then
    python3 -c "
import sys
sys.path.insert(0, '.')
from scripts.self_audit import ComplianceScanner

try:
    scanner = ComplianceScanner()
    print('✓ Compliance scanner initialized')
except Exception as e:
    print(f'✗ Compliance scanner failed: {e}')
    sys.exit(1)
" 2>&1
    EXIT_CODE=$?
else
    python3 -c "
import sys
sys.path.insert(0, '.')
from scripts.self_audit import ComplianceScanner
scanner = ComplianceScanner()
" 2>/dev/null
    EXIT_CODE=$?
fi

if [ $EXIT_CODE -eq 0 ]; then
    check_pass "Compliance scanner initialized"
else
    check_fail "Compliance scanner initialization failed"
fi

# ================================================================
# Check 9: Master Controller
# ================================================================

section "9. Master Controller Validation"

echo "Running master controller validation..."

if $VERBOSE; then
    python3 -c "
import sys
sys.path.insert(0, '.')
from master_controller import MasterController

try:
    controller = MasterController()
    print('✓ Master controller initialized')
except Exception as e:
    print(f'✗ Master controller failed: {e}')
    sys.exit(1)
" 2>&1
    EXIT_CODE=$?
else
    python3 -c "
import sys
sys.path.insert(0, '.')
from master_controller import MasterController
controller = MasterController()
" 2>/dev/null
    EXIT_CODE=$?
fi

if [ $EXIT_CODE -eq 0 ]; then
    check_pass "Master controller initialized"
else
    check_fail "Master controller initialization failed"
fi

# ================================================================
# Check 10: Configuration Validity
# ================================================================

section "10. Configuration File Validation"

if [ -f "config/sentient_config.yaml" ]; then
    python3 -c "
import yaml
import sys

try:
    with open('config/sentient_config.yaml', 'r') as f:
        config = yaml.safe_load(f)

    # Check required sections
    required_sections = ['sentient', 'forecasting', 'remediation', 'compliance', 'sla', 'cost']
    for section in required_sections:
        if section not in config:
            print(f'✗ Missing section: {section}')
            sys.exit(1)

    print('✓ Configuration valid')
except Exception as e:
    print(f'✗ Configuration error: {e}')
    sys.exit(1)
"
    EXIT_CODE=$?

    if [ $EXIT_CODE -eq 0 ]; then
        check_pass "sentient_config.yaml is valid"
    else
        check_fail "sentient_config.yaml has errors"
    fi
else
    check_fail "sentient_config.yaml missing"
fi

# ================================================================
# Check 11: API Connectivity
# ================================================================

section "11. API Connectivity (Optional)"

# Prometheus
if [ -n "$PROMETHEUS_URL" ]; then
    if curl -s -o /dev/null -w "%{http_code}" "$PROMETHEUS_URL/api/v1/query?query=up" | grep -q "200\|401"; then
        check_pass "Prometheus API reachable"
    else
        check_warn "Prometheus API not reachable (may need auth)"
    fi
else
    check_warn "PROMETHEUS_URL not set, skipping connectivity check"
fi

# Grafana
if [ -n "$GRAFANA_URL" ] && [ -n "$GRAFANA_API_KEY" ]; then
    if curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $GRAFANA_API_KEY" "$GRAFANA_URL/api/health" | grep -q "200"; then
        check_pass "Grafana API reachable and authenticated"
    else
        check_warn "Grafana API not reachable or auth failed"
    fi
else
    check_warn "Grafana credentials not set, skipping connectivity check"
fi

# Slack
if [ -n "$SLACK_WEBHOOK_URL" ]; then
    if curl -s -o /dev/null -w "%{http_code}" -X POST "$SLACK_WEBHOOK_URL" -d '{"text":"NeuroPilot v17.4 verification test"}' | grep -q "200"; then
        check_pass "Slack webhook reachable"
    else
        check_warn "Slack webhook not reachable or invalid"
    fi
else
    check_warn "SLACK_WEBHOOK_URL not set, skipping connectivity check"
fi

# ================================================================
# Check 12: GitHub Actions Workflow
# ================================================================

section "12. GitHub Actions Workflow"

if [ -f "../.github/workflows/sentient-cycle.yml" ]; then
    check_pass "sentient-cycle.yml exists"

    # Check if workflow has required jobs
    if grep -q "sentient-cycle:" "../.github/workflows/sentient-cycle.yml"; then
        check_pass "sentient-cycle job found"
    else
        check_fail "sentient-cycle job missing"
    fi

    if grep -q "compliance-audit:" "../.github/workflows/sentient-cycle.yml"; then
        check_pass "compliance-audit job found"
    else
        check_fail "compliance-audit job missing"
    fi

    if grep -q "train-models:" "../.github/workflows/sentient-cycle.yml"; then
        check_pass "train-models job found"
    else
        check_fail "train-models job missing"
    fi
else
    check_fail ".github/workflows/sentient-cycle.yml missing"
fi

# ================================================================
# Summary
# ================================================================

echo ""
echo -e "${BLUE}================================================================${NC}"
echo -e "${BLUE}📊 Verification Summary${NC}"
echo -e "${BLUE}================================================================${NC}"
echo ""

TOTAL_CHECKS=$((CHECKS_PASSED + CHECKS_FAILED))

echo -e "Total Checks: ${TOTAL_CHECKS}"
echo -e "${GREEN}Passed: ${CHECKS_PASSED}${NC}"

if [ $CHECKS_FAILED -gt 0 ]; then
    echo -e "${RED}Failed: ${CHECKS_FAILED}${NC}"
    echo ""
    echo -e "${RED}❌ Deployment verification FAILED${NC}"
    echo ""
    echo "Please fix the failed checks and run again."
    echo ""
    exit 1
else
    echo -e "${RED}Failed: 0${NC}"
    echo ""
    echo -e "${GREEN}✅ Deployment verification PASSED${NC}"
    echo ""
    echo "NeuroPilot v17.4 is ready for production!"
    echo ""
    echo "Next steps:"
    echo "  1. Run first manual cycle:"
    echo "     python3 master_controller.py"
    echo ""
    echo "  2. Run compliance audit:"
    echo "     python3 scripts/self_audit.py"
    echo ""
    echo "  3. Enable GitHub Actions:"
    echo "     Add secrets to GitHub repository settings"
    echo ""
    exit 0
fi
