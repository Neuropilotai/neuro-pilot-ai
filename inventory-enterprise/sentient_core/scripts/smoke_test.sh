#!/bin/bash
# ================================================================
# NeuroPilot v17.4 - Smoke Test
# ================================================================
# Quick smoke test: forecast-only + self-audit
#
# Usage:
#   ./scripts/smoke_test.sh
#
# This runs:
#   1) Forecast engine in dry-run mode
#   2) Self-audit scanner (generates reports)
# ================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}================================================================${NC}"
echo -e "${BLUE}🧪 NeuroPilot v17.4 - Smoke Test${NC}"
echo -e "${BLUE}================================================================${NC}"
echo ""

# ================================================================
# Test 1: Forecast Engine
# ================================================================

echo -e "${BLUE}━━━ Test 1: Forecast Engine (Dry-Run) ━━━${NC}"
echo ""

python3 << 'EOF'
import sys
sys.path.insert(0, '.')

from predictive.forecast_engine import ForecastEngine
from dataclasses import dataclass
from datetime import datetime

@dataclass
class Metrics:
    timestamp: str
    cpu_usage: float
    memory_usage: float
    p95_latency: float
    p99_latency: float
    error_rate: float
    request_rate: float
    database_query_time: float
    active_instances: int
    current_cost: float

print("Initializing forecast engine...")
engine = ForecastEngine()

print("✓ Forecast engine initialized")
print("")

# Create sample metrics
sample_metrics = Metrics(
    timestamp=datetime.utcnow().isoformat(),
    cpu_usage=68.0,
    memory_usage=62.0,
    p95_latency=185.0,
    p99_latency=240.0,
    error_rate=0.8,
    request_rate=125.0,
    database_query_time=45.0,
    active_instances=2,
    current_cost=29.50
)

print("Running predictions (forecast_hours=12)...")
print("Note: May show warnings if models not yet trained - this is normal")
print("")

predictions = engine.predict_incidents(sample_metrics, forecast_hours=12)

print(f"✓ Generated {len(predictions)} predictions")
print("")

if predictions:
    print("Top predictions:")
    for i, pred in enumerate(predictions[:3], 1):
        print(f"  {i}. {pred.incident_type}: {pred.probability:.1%} in {pred.time_to_event_hours:.1f}h ({pred.model_source})")
else:
    print("  (No high-probability predictions - system healthy)")

print("")
print("✅ Forecast engine smoke test PASSED")
EOF

FORECAST_EXIT=$?

if [ $FORECAST_EXIT -ne 0 ]; then
    echo -e "${RED}❌ Forecast engine test FAILED${NC}"
    exit 1
fi

echo ""
echo ""

# ================================================================
# Test 2: Self-Audit Scanner
# ================================================================

echo -e "${BLUE}━━━ Test 2: Self-Audit Scanner ━━━${NC}"
echo ""

python3 << 'EOF'
import sys
sys.path.insert(0, '.')

from scripts.self_audit import ComplianceScanner

print("Initializing compliance scanner...")
scanner = ComplianceScanner()

print("✓ Compliance scanner initialized")
print("")

print("Running compliance audit...")
print("This will check IaC, drift, zero-trust, security, SLA, cost")
print("")

report = scanner.run_full_audit()

print("")
print(f"Audit Status: {report['compliance_status']}")
print(f"Overall Score: {report['overall_score']}/100")
print("")
print(f"Findings:")
print(f"  Critical: {len(report['findings']['critical'])}")
print(f"  High: {len(report['findings']['high'])}")
print(f"  Medium: {len(report['findings']['medium'])}")
print(f"  Low: {len(report['findings']['low'])}")
print("")

# Check if reports were generated
import os
from pathlib import Path

audit_dir = Path("../logs/audit")
if audit_dir.exists():
    reports = list(audit_dir.glob("audit_*.json"))
    md_reports = list(audit_dir.glob("audit_*.md"))

    if reports:
        latest_json = max(reports, key=os.path.getmtime)
        print(f"✓ JSON report: {latest_json}")

    if md_reports:
        latest_md = max(md_reports, key=os.path.getmtime)
        print(f"✓ Markdown report: {latest_md}")

    print("")

print("✅ Self-audit scanner smoke test PASSED")
EOF

AUDIT_EXIT=$?

if [ $AUDIT_EXIT -ne 0 ]; then
    echo -e "${RED}❌ Self-audit test FAILED${NC}"
    exit 1
fi

echo ""
echo ""

# ================================================================
# Summary
# ================================================================

echo -e "${BLUE}================================================================${NC}"
echo -e "${GREEN}✅ Smoke Test PASSED${NC}"
echo -e "${BLUE}================================================================${NC}"
echo ""
echo "Both core components are working:"
echo "  ✓ Forecast engine (predictive mode)"
echo "  ✓ Self-audit scanner (compliance checks)"
echo ""
echo "Next steps:"
echo "  1. Review audit reports in logs/audit/"
echo "  2. Run full cycle: python3 master_controller.py"
echo "  3. Enable GitHub Actions for automation"
echo ""
