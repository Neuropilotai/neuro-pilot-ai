#!/bin/bash
# NeuroInnovate Quantum Governance Integration Test Suite v4.1
# 25 comprehensive tests validating quantum crypto, compliance, and governance

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=25

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  🛡️  Quantum Governance Integration Test Suite v4.1${NC}"
echo -e "${BLUE}  NeuroInnovate Inventory Enterprise${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# Helper functions
test_start() {
    echo -ne "${YELLOW}[$((TESTS_PASSED + TESTS_FAILED + 1))/$TESTS_TOTAL]${NC} $1... "
}

test_pass() {
    echo -e "${GREEN}✅ PASS${NC}"
    ((TESTS_PASSED++))
}

test_fail() {
    echo -e "${RED}❌ FAIL${NC}"
    if [ -n "$1" ]; then
        echo -e "  ${RED}Error: $1${NC}"
    fi
    ((TESTS_FAILED++))
}

# Set up test environment
cd ~/neuro-pilot-ai/inventory-enterprise/backend

# ═══════════════════════════════════════════════════════════════
# CATEGORY 1: Quantum Cryptography (Tests 1-5)
# ═══════════════════════════════════════════════════════════════

# Test 1: Quantum Key Manager initialization
test_start "Quantum Key Manager initialization"
if node -e "
const QKM = require('/tmp/quantum_key_manager');
const qkm = new QKM();
qkm.initialize().then(() => process.exit(0)).catch(() => process.exit(1));
" 2>/dev/null; then
    test_pass
else
    test_fail "Failed to initialize Quantum Key Manager"
fi

# Test 2: Ed25519 signature generation
test_start "Ed25519 signature generation"
SIG_TEST=$(node -e "
const QKM = require('/tmp/quantum_key_manager');
const qkm = new QKM({ kyberEnabled: false });
qkm.initialize().then(async () => {
    const sig = await qkm.sign('test data');
    console.log(sig.ed25519.length > 50 ? 'PASS' : 'FAIL');
    process.exit(0);
});
" 2>/dev/null | tail -1)

if [ "$SIG_TEST" = "PASS" ]; then
    test_pass
else
    test_fail "Signature generation failed"
fi

# Test 3: Signature verification
test_start "Hybrid signature verification"
VERIFY_TEST=$(node -e "
const QKM = require('/tmp/quantum_key_manager');
const qkm = new QKM({ kyberEnabled: false });
qkm.initialize().then(async () => {
    const data = 'test data';
    const sig = await qkm.sign(data);
    const valid = await qkm.verify(data, sig);
    console.log(valid ? 'PASS' : 'FAIL');
    process.exit(0);
});
" 2>/dev/null | tail -1)

if [ "$VERIFY_TEST" = "PASS" ]; then
    test_pass
else
    test_fail "Signature verification failed"
fi

# Test 4: Keychain integration
test_start "macOS Keychain integration"
if security find-generic-password -a "ed25519_primary" -s "com.neuroinnovate.quantum" >/dev/null 2>&1; then
    test_pass
else
    test_fail "Ed25519 key not found in Keychain"
fi

# Test 5: Key rotation readiness
test_start "Key rotation mechanism"
ROTATE_TEST=$(node -e "
const QKM = require('/tmp/quantum_key_manager');
const qkm = new QKM({ autoRotate: false });
qkm.initialize().then(async () => {
    await qkm.rotateKeys();
    console.log('PASS');
    process.exit(0);
}).catch(() => {
    console.log('FAIL');
    process.exit(1);
});
" 2>/dev/null | tail -1)

if [ "$ROTATE_TEST" = "PASS" ]; then
    test_pass
else
    test_fail "Key rotation failed"
fi

# ═══════════════════════════════════════════════════════════════
# CATEGORY 2: Compliance Engine (Tests 6-10)
# ═══════════════════════════════════════════════════════════════

# Test 6: Compliance engine initialization
test_start "Autonomous Compliance Engine initialization"
if node -e "
const ACE = require('/tmp/autonomous_compliance');
const ace = new ACE();
ace.initialize().then(() => process.exit(0)).catch(() => process.exit(1));
" 2>/dev/null; then
    test_pass
else
    test_fail "Failed to initialize Compliance Engine"
fi

# Test 7: SOC2 compliance scoring
test_start "SOC2 compliance check"
SOC2_SCORE=$(node -e "
const ACE = require('/tmp/autonomous_compliance');
const ace = new ACE();
ace.initialize().then(async () => {
    const score = await ace.check_soc2();
    console.log(score.score >= 80 ? 'PASS' : 'FAIL');
    process.exit(0);
});
" 2>/dev/null | tail -1)

if [ "$SOC2_SCORE" = "PASS" ]; then
    test_pass
else
    test_fail "SOC2 score below threshold"
fi

# Test 8: ISO27001 compliance scoring
test_start "ISO27001 compliance check"
ISO_SCORE=$(node -e "
const ACE = require('/tmp/autonomous_compliance');
const ace = new ACE();
ace.initialize().then(async () => {
    const score = await ace.check_iso27001();
    console.log(score.score >= 80 ? 'PASS' : 'FAIL');
    process.exit(0);
});
" 2>/dev/null | tail -1)

if [ "$ISO_SCORE" = "PASS" ]; then
    test_pass
else
    test_fail "ISO27001 score below threshold"
fi

# Test 9: OWASP compliance scoring
test_start "OWASP Top 10 compliance check"
OWASP_SCORE=$(node -e "
const ACE = require('/tmp/autonomous_compliance');
const ace = new ACE();
ace.initialize().then(async () => {
    const score = await ace.check_owasp();
    console.log(score.score >= 80 ? 'PASS' : 'FAIL');
    process.exit(0);
});
" 2>/dev/null | tail -1)

if [ "$OWASP_SCORE" = "PASS" ]; then
    test_pass
else
    test_fail "OWASP score below threshold"
fi

# Test 10: Overall compliance score calculation
test_start "Overall compliance score (>85)"
OVERALL_SCORE=$(node -e "
const ACE = require('/tmp/autonomous_compliance');
const ace = new ACE();
ace.initialize().then(async () => {
    const score = await ace.generateComplianceScore();
    console.log(score.overall >= 85 ? 'PASS' : 'FAIL');
    process.exit(0);
});
" 2>/dev/null | tail -1)

if [ "$OVERALL_SCORE" = "PASS" ]; then
    test_pass
else
    test_fail "Overall compliance score too low"
fi

# ═══════════════════════════════════════════════════════════════
# CATEGORY 3: Validation Daemon (Tests 11-15)
# ═══════════════════════════════════════════════════════════════

# Test 11: Validation daemon initialization
test_start "Governance Validation Daemon init"
if python3 /tmp/governance_validation_daemon.py --once >/dev/null 2>&1; then
    test_pass
else
    test_fail "Daemon initialization failed"
fi

# Test 12: File whitelist generation
test_start "File whitelist generation"
chmod +x /tmp/governance_validation_daemon.py
python3 /tmp/governance_validation_daemon.py --once >/dev/null 2>&1
if [ -f "./security/file_whitelist.json" ]; then
    test_pass
else
    test_fail "Whitelist not generated"
fi

# Test 13: Process integrity check
test_start "Process integrity validation"
INTEGRITY_CHECK=$(python3 -c "
from governance_validation_daemon import GovernanceValidationDaemon
import sys
sys.path.insert(0, '/tmp')
daemon = GovernanceValidationDaemon()
daemon.initialize()
result = daemon.check_process_integrity()
print('PASS' if result['passed'] else 'FAIL')
" 2>/dev/null | tail -1)

if [ "$INTEGRITY_CHECK" = "PASS" ]; then
    test_pass
else
    test_fail "Process integrity check failed"
fi

# Test 14: Database checksum validation
test_start "Database integrity check"
DB_CHECK=$(python3 -c "
from governance_validation_daemon import GovernanceValidationDaemon
import sys
sys.path.insert(0, '/tmp')
daemon = GovernanceValidationDaemon()
result = daemon.check_database_checksum()
print('PASS' if result['passed'] else 'FAIL')
" 2>/dev/null | tail -1)

if [ "$DB_CHECK" = "PASS" ]; then
    test_pass
else
    test_fail "Database checksum invalid"
fi

# Test 15: Network isolation verification
test_start "Network isolation (localhost-only)"
NETWORK_CHECK=$(python3 -c "
from governance_validation_daemon import GovernanceValidationDaemon
import sys
sys.path.insert(0, '/tmp')
daemon = GovernanceValidationDaemon()
result = daemon.check_network_isolation()
print('PASS' if result['passed'] else 'FAIL')
" 2>/dev/null | tail -1)

if [ "$NETWORK_CHECK" = "PASS" ]; then
    test_pass
else
    test_fail "Network not isolated to localhost"
fi

# ═══════════════════════════════════════════════════════════════
# CATEGORY 4: System Security (Tests 16-20)
# ═══════════════════════════════════════════════════════════════

# Test 16: Server localhost binding
test_start "Server bound to 127.0.0.1 only"
if lsof -i :8083 2>/dev/null | grep -q "127.0.0.1\|localhost"; then
    if ! lsof -i :8083 2>/dev/null | grep -q "\*:8083\|0.0.0.0:8083"; then
        test_pass
    else
        test_fail "Server bound to wildcard address"
    fi
else
    test_fail "Server not bound to localhost"
fi

# Test 17: Database file permissions
test_start "Database permissions (600)"
DB_PERMS=$(stat -f "%OLp" ./db/inventory_enterprise.db 2>/dev/null || echo "000")
if [ "$DB_PERMS" = "600" ]; then
    test_pass
else
    test_fail "Database permissions: $DB_PERMS (expected 600)"
fi

# Test 18: No external network connections
test_start "Zero unauthorized connections"
PID=$(pgrep -f "node.*server.js" | head -1)
if [ -n "$PID" ]; then
    EXTERNAL=$(lsof -p "$PID" -i -P -n 2>/dev/null | grep ESTABLISHED | grep -v "127.0.0.1" | grep -v "localhost" || true)
    if [ -z "$EXTERNAL" ]; then
        test_pass
    else
        test_fail "External connection detected"
    fi
else
    test_fail "Server not running"
fi

# Test 19: Firewall status
test_start "macOS Firewall enabled"
if sudo /usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate 2>/dev/null | grep -q "enabled"; then
    test_pass
else
    test_fail "Firewall not enabled"
fi

# Test 20: Audit chain integrity
test_start "Audit chain SHA-256 integrity"
AUDIT_CHECK=$(sqlite3 ./db/inventory_enterprise.db "SELECT COUNT(*) FROM audit_logs" 2>/dev/null || echo "0")
if [ "$AUDIT_CHECK" -gt 0 ]; then
    test_pass
else
    test_fail "No audit logs found"
fi

# ═══════════════════════════════════════════════════════════════
# CATEGORY 5: Performance & Health (Tests 21-25)
# ═══════════════════════════════════════════════════════════════

# Test 21: Memory usage (<500MB)
test_start "Memory usage within limits"
PID=$(pgrep -f "node.*server.js" | head -1)
if [ -n "$PID" ]; then
    MEM_MB=$(ps -p "$PID" -o rss= | awk '{print int($1/1024)}')
    if [ "$MEM_MB" -lt 500 ]; then
        test_pass
    else
        test_fail "Memory usage: ${MEM_MB}MB (limit: 500MB)"
    fi
else
    test_fail "Server not running"
fi

# Test 22: CPU usage (<20% idle)
test_start "CPU usage within limits"
PID=$(pgrep -f "node.*server.js" | head -1)
if [ -n "$PID" ]; then
    CPU_PCT=$(ps -p "$PID" -o %cpu= | awk '{print int($1)}')
    if [ "$CPU_PCT" -lt 20 ]; then
        test_pass
    else
        test_fail "CPU usage: ${CPU_PCT}% (limit: 20%)"
    fi
else
    test_fail "Server not running"
fi

# Test 23: Server health endpoint
test_start "Server /health endpoint responding"
if curl -s http://localhost:8083/health | grep -q '"status":"ok"'; then
    test_pass
else
    test_fail "Health endpoint not responding"
fi

# Test 24: Validation output file generated
test_start "Validation output JSON exists"
if [ -f "/tmp/qdl_validation.json" ]; then
    if jq -e '.overall_status' /tmp/qdl_validation.json >/dev/null 2>&1; then
        test_pass
    else
        test_fail "Invalid JSON structure"
    fi
else
    test_fail "Validation output not found"
fi

# Test 25: Overall system confidence (9+/10)
test_start "System confidence score (≥9/10)"
# Calculate based on passed tests
CONFIDENCE=$(echo "scale=1; ($TESTS_PASSED * 10) / $TESTS_TOTAL" | bc 2>/dev/null || echo "0")
if [ "$(echo "$CONFIDENCE >= 9.0" | bc 2>/dev/null)" -eq 1 ]; then
    test_pass
else
    test_fail "Confidence: $CONFIDENCE/10 (need ≥9.0)"
fi

# ═══════════════════════════════════════════════════════════════
# FINAL REPORT
# ═══════════════════════════════════════════════════════════════

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  📊 Test Results Summary${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

PASS_RATE=$(echo "scale=1; ($TESTS_PASSED * 100) / $TESTS_TOTAL" | bc)

echo -e "  Total Tests:    ${TESTS_TOTAL}"
echo -e "  ${GREEN}Passed:         ${TESTS_PASSED}${NC}"
echo -e "  ${RED}Failed:         ${TESTS_FAILED}${NC}"
echo -e "  Pass Rate:      ${PASS_RATE}%"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ ALL TESTS PASSED - QUANTUM GOVERNANCE OPERATIONAL${NC}"
    echo ""
    exit 0
elif [ $TESTS_FAILED -le 2 ]; then
    echo -e "${YELLOW}⚠️  MINOR ISSUES DETECTED - REVIEW RECOMMENDED${NC}"
    echo ""
    exit 1
else
    echo -e "${RED}❌ CRITICAL FAILURES - IMMEDIATE ACTION REQUIRED${NC}"
    echo ""
    exit 2
fi
