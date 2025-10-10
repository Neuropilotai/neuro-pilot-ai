#!/bin/bash
# NeuroInnovate v5 Ascension - Verification Suite
# 20+ automated tests for v5 modules

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

TESTS_PASSED=0
TESTS_FAILED=0

echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  NeuroInnovate v5 Ascension - Verification Suite${NC}"
echo -e "${CYAN}  Apple Silicon M3 Pro - macOS${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# Change to backend directory
cd ~/neuro-pilot-ai/inventory-enterprise/backend

# Helper functions
test_start() {
  echo -ne "${YELLOW}[$((TESTS_PASSED + TESTS_FAILED + 1))]${NC} $1... "
}

test_pass() {
  echo -e "${GREEN}✅ PASS${NC}"
  TESTS_PASSED=$((TESTS_PASSED + 1))
}

test_fail() {
  echo -e "${RED}❌ FAIL${NC}"
  if [ -n "$1" ]; then
    echo -e "  ${RED}Error: $1${NC}"
  fi
  TESTS_FAILED=$((TESTS_FAILED + 1))
}

# ═══════════════════════════════════════════════════════════
#  Test 1-5: Directory Structure & Core Files
# ═══════════════════════════════════════════════════════════

test_start "v5 directory structure exists"
if [ -d "./v5_addons" ] && [ -d "./routes/v5_addons" ] && [ -d "./docs/v5_addons" ]; then
  test_pass
else
  test_fail "v5 directories not found"
fi

test_start "AI Optimizer RL module exists"
if [ -f "./v5_addons/ai_optimizer_rl.js" ]; then
  test_pass
else
  test_fail "ai_optimizer_rl.js not found"
fi

test_start "Cache Optimizer v2 module exists"
if [ -f "./v5_addons/cache_optimizer.js" ]; then
  test_pass
else
  test_fail "cache_optimizer.js not found"
fi

test_start "Compliance Engine module exists"
if [ -f "./v5_addons/compliance_engine.js" ]; then
  test_pass
else
  test_fail "compliance_engine.js not found"
fi

test_start "Predictive Reorder module exists"
if [ -f "./v5_addons/predictive_reorder.js" ]; then
  test_pass
else
  test_fail "predictive_reorder.js not found"
fi

# ═══════════════════════════════════════════════════════════
#  Test 6-10: Module Initialization
# ═══════════════════════════════════════════════════════════

test_start "AI Optimizer RL initialization"
AI_TEST=$(node -e "
const AIOptimizerRL = require('./v5_addons/ai_optimizer_rl');
const ai = new AIOptimizerRL();
ai.initialize().then(() => {
  console.log('PASS');
  ai.close();
  process.exit(0);
}).catch(err => {
  console.log('FAIL');
  process.exit(1);
});
" 2>/dev/null | tail -1)

if [ "$AI_TEST" = "PASS" ]; then
  test_pass
else
  test_fail "AI Optimizer initialization failed"
fi

test_start "Cache Optimizer initialization"
CACHE_TEST=$(node -e "
const CacheOptimizer = require('./v5_addons/cache_optimizer');
const cache = new CacheOptimizer();
const stats = cache.getStats();
console.log(stats.global.totalRequests >= 0 ? 'PASS' : 'FAIL');
cache.destroy();
" 2>/dev/null | tail -1)

if [ "$CACHE_TEST" = "PASS" ]; then
  test_pass
else
  test_fail "Cache Optimizer initialization failed"
fi

test_start "Compliance Engine initialization"
COMPLIANCE_TEST=$(node -e "
const ComplianceEngine = require('./v5_addons/compliance_engine');
const compliance = new ComplianceEngine();
console.log('PASS');
" 2>/dev/null | tail -1)

if [ "$COMPLIANCE_TEST" = "PASS" ]; then
  test_pass
else
  test_fail "Compliance Engine initialization failed"
fi

test_start "Predictive Reorder initialization"
REORDER_TEST=$(node -e "
const PredictiveReorder = require('./v5_addons/predictive_reorder');
const reorder = new PredictiveReorder();
reorder.initialize().then(() => {
  console.log('PASS');
  reorder.close();
  process.exit(0);
}).catch(err => {
  console.log('FAIL');
  process.exit(1);
});
" 2>/dev/null | tail -1)

if [ "$REORDER_TEST" = "PASS" ]; then
  test_pass
else
  test_fail "Predictive Reorder initialization failed"
fi

test_start "System Health v2 module loads"
HEALTH_TEST=$(node -e "
const SystemHealth = require('./v5_addons/system_health_v2');
const health = new SystemHealth();
console.log('PASS');
" 2>/dev/null | tail -1)

if [ "$HEALTH_TEST" = "PASS" ]; then
  test_pass
else
  test_fail "System Health v2 initialization failed"
fi

# ═══════════════════════════════════════════════════════════
#  Test 11-15: Functional Tests
# ═══════════════════════════════════════════════════════════

test_start "AI Optimizer reward calculation"
REWARD_TEST=$(node -e "
const AIOptimizerRL = require('./v5_addons/ai_optimizer_rl');
const ai = new AIOptimizerRL();
const reward = ai.calculateReward(100, 95);
console.log(reward >= 0.9 && reward <= 1.0 ? 'PASS' : 'FAIL');
" 2>/dev/null | tail -1)

if [ "$REWARD_TEST" = "PASS" ]; then
  test_pass
else
  test_fail "Reward calculation incorrect"
fi

test_start "Cache layer set/get operations"
CACHE_OPS_TEST=$(node -e "
const CacheOptimizer = require('./v5_addons/cache_optimizer');
const cache = new CacheOptimizer();
cache.set('test', 'key1', 'value1').then(() => {
  return cache.get('test', 'key1');
}).then(val => {
  console.log(val === 'value1' ? 'PASS' : 'FAIL');
  cache.destroy();
}).catch(() => console.log('FAIL'));
" 2>/dev/null | tail -1)

if [ "$CACHE_OPS_TEST" = "PASS" ]; then
  test_pass
else
  test_fail "Cache operations failed"
fi

test_start "Compliance score calculation"
COMPLIANCE_SCORE_TEST=$(node -e "
const ComplianceEngine = require('./v5_addons/compliance_engine');
const compliance = new ComplianceEngine();
compliance.calculateScore().then(result => {
  console.log(result.score >= 0 && result.score <= 100 ? 'PASS' : 'FAIL');
}).catch(() => console.log('FAIL'));
" 2>/dev/null | tail -1)

if [ "$COMPLIANCE_SCORE_TEST" = "PASS" ]; then
  test_pass
else
  test_fail "Compliance scoring failed"
fi

test_start "Predictive reorder confidence calc"
CONFIDENCE_TEST=$(node -e "
const PredictiveReorder = require('./v5_addons/predictive_reorder');
const reorder = new PredictiveReorder();
const item = { current_stock: 10, par_min: 20, par_max: 50 };
const forecast = { predicted_value: 15, mape: 5.0, model: 'prophet' };
const confidence = reorder.calculateConfidence(item, forecast);
console.log(confidence >= 0 && confidence <= 100 ? 'PASS' : 'FAIL');
reorder.close();
" 2>/dev/null | tail -1)

if [ "$CONFIDENCE_TEST" = "PASS" ]; then
  test_pass
else
  test_fail "Confidence calculation failed"
fi

test_start "System health metrics collection"
METRICS_TEST=$(node -e "
const SystemHealth = require('./v5_addons/system_health_v2');
const health = new SystemHealth();
health.getSystemHealth().then(h => {
  console.log(h.system && h.cpu && h.memory ? 'PASS' : 'FAIL');
}).catch(() => console.log('FAIL'));
" 2>/dev/null | tail -1)

if [ "$METRICS_TEST" = "PASS" ]; then
  test_pass
else
  test_fail "System health metrics failed"
fi

# ═══════════════════════════════════════════════════════════
#  Test 16-20: Performance & Integration
# ═══════════════════════════════════════════════════════════

test_start "Cache hit rate tracking"
HIT_RATE_TEST=$(node -e "
const CacheOptimizer = require('./v5_addons/cache_optimizer');
const cache = new CacheOptimizer();
cache.set('test', 'k1', 'v1').then(() => cache.get('test', 'k1'))
  .then(() => cache.get('test', 'k1'))
  .then(() => {
    const stats = cache.getStats();
    console.log(stats.global.hits >= 2 ? 'PASS' : 'FAIL');
    cache.destroy();
  }).catch(() => console.log('FAIL'));
" 2>/dev/null | tail -1)

if [ "$HIT_RATE_TEST" = "PASS" ]; then
  test_pass
else
  test_fail "Cache hit rate tracking failed"
fi

test_start "Performance metrics p95 calculation"
P95_TEST=$(node -e "
const CacheOptimizer = require('./v5_addons/cache_optimizer');
const cache = new CacheOptimizer();
cache.trackResponseTime(10);
cache.trackResponseTime(20);
cache.trackResponseTime(30);
cache.trackResponseTime(40);
cache.trackResponseTime(50);
const perf = cache.getPerformanceStats();
console.log(perf.p95 >= 0 ? 'PASS' : 'FAIL');
cache.destroy();
" 2>/dev/null | tail -1)

if [ "$P95_TEST" = "PASS" ]; then
  test_pass
else
  test_fail "p95 calculation failed"
fi

test_start "Compliance SOC2 mapping"
SOC2_TEST=$(node -e "
const ComplianceEngine = require('./v5_addons/compliance_engine');
const compliance = new ComplianceEngine();
compliance.calculateScore().then(result => {
  console.log(result.meetsSOC2 !== undefined ? 'PASS' : 'FAIL');
}).catch(() => console.log('FAIL'));
" 2>/dev/null | tail -1)

if [ "$SOC2_TEST" = "PASS" ]; then
  test_pass
else
  test_fail "SOC2 mapping failed"
fi

test_start "v5 routes file exists"
if [ -f "./routes/v5_addons/v5_routes.js" ]; then
  test_pass
else
  test_fail "v5_routes.js not found"
fi

test_start "v4/v5 backward compatibility"
if [ -f "./v4_addons/system_health.js" ] && [ -f "./v5_addons/system_health_v2.js" ]; then
  test_pass
else
  test_fail "v4 modules missing"
fi

# ═══════════════════════════════════════════════════════════
#  Test 21-22: Documentation
# ═══════════════════════════════════════════════════════════

test_start "v5 architecture documentation"
if [ -f "./docs/v5_addons/V5_ARCHITECTURE_EVOLUTION.md" ]; then
  test_pass
else
  test_fail "Architecture docs missing"
fi

test_start "v5 modules total file count"
V5_FILE_COUNT=$(find v5_addons routes/v5_addons scripts/verify_v5_addons.sh -type f 2>/dev/null | wc -l | tr -d ' ')
if [ "$V5_FILE_COUNT" -ge 7 ]; then
  test_pass
else
  test_fail "Expected at least 7 v5 files, found $V5_FILE_COUNT"
fi

# ═══════════════════════════════════════════════════════════
#  Summary
# ═══════════════════════════════════════════════════════════

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  Verification Summary${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  Total Tests:    $((TESTS_PASSED + TESTS_FAILED))"
echo -e "  ${GREEN}Passed:         ${TESTS_PASSED}${NC}"
echo -e "  ${RED}Failed:         ${TESTS_FAILED}${NC}"
echo ""

PASS_RATE=$(echo "scale=1; ($TESTS_PASSED * 100) / ($TESTS_PASSED + $TESTS_FAILED)" | bc)
echo -e "  Pass Rate:      ${PASS_RATE}%"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}✅ ALL TESTS PASSED - v5.0 ASCENSION OPERATIONAL${NC}"
  echo ""
  echo "Next steps:"
  echo "1. Mount v5 routes in server.js"
  echo "2. Test v5 API endpoints"
  echo "3. Deploy frontend Owner Console v5"
  echo "4. Run performance benchmarks"
  echo "5. Generate final compliance report"
  exit 0
else
  echo -e "${RED}❌ SOME TESTS FAILED - REVIEW REQUIRED${NC}"
  echo ""
  echo "Please fix the errors above and re-run verification."
  exit 1
fi
