#!/bin/bash

###############################################################################
# Financial Accuracy Verification Suite v15.7.0
#
# Comprehensive testing of financial data accuracy across all fiscal periods
# Validates against known correct totals from PDF sources
#
# Usage:
#   ./verify_financial_accuracy_v2.sh [fiscal-period]
#
# Examples:
#   ./verify_financial_accuracy_v2.sh FY26-P01    # Test September 2025
#   ./verify_financial_accuracy_v2.sh --all       # Test all periods
#
# Exit codes:
#   0 - All tests passed (score >= 95)
#   1 - Tests failed (score < 95)
#   2 - Critical errors found
#
# @version 15.7.0
# @author NeuroPilot Financial Systems Team
###############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DB_PATH="./db/inventory_enterprise.db"
REPORT_DIR="./reports/financial_accuracy"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
REPORT_FILE="${REPORT_DIR}/financial_accuracy_${TIMESTAMP}.json"

# Create reports directory if it doesn't exist
mkdir -p "$REPORT_DIR"

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Financial Accuracy Verification Suite v15.7.0"
echo "  NeuroPilot Enterprise"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Check if database exists
if [ ! -f "$DB_PATH" ]; then
    echo -e "${RED}✗ Database not found: $DB_PATH${NC}"
    exit 2
fi

# Function to run Node.js validation script
validate_period() {
    local period=$1
    echo -e "${BLUE}Testing fiscal period: $period${NC}"

    # Create temporary Node.js script to run validation
    cat > /tmp/validate_financial.js <<'NODESCRIPT'
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// Promise wrapper for database
class Database {
  constructor(dbPath) {
    this.db = new sqlite3.Database(dbPath);
  }

  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  close() {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

async function main() {
    const fiscalPeriod = process.argv[2] || 'FY26-P01';
    const dbPath = process.argv[3] || './db/inventory_enterprise.db';

    const FinancialAccuracyEngine = require('./src/finance/FinancialAccuracyEngine');

    const db = new Database(dbPath);
    const engine = new FinancialAccuracyEngine(db);

    try {
        const report = await engine.validateFiscalPeriod(fiscalPeriod);

        // Output JSON report
        console.log(JSON.stringify(report, null, 2));

        await db.close();

        // Exit with appropriate code
        if (report.verification_score >= 95) {
            process.exit(0);
        } else if (report.verification_score >= 50) {
            process.exit(1);
        } else {
            process.exit(2);
        }

    } catch (error) {
        console.error('Validation error:', error.message);
        await db.close();
        process.exit(2);
    }
}

main();
NODESCRIPT

    # Run validation
    node /tmp/validate_financial.js "$period" "$DB_PATH" > /tmp/validation_result_${period}.json
    local exit_code=$?

    # Parse results
    local score=$(cat /tmp/validation_result_${period}.json | grep -o '"verification_score":[0-9]*' | cut -d: -f2)
    local status=$(cat /tmp/validation_result_${period}.json | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
    local total=$(cat /tmp/validation_result_${period}.json | grep -o '"total_amount":[0-9.]*' | cut -d: -f2)
    local issues=$(cat /tmp/validation_result_${period}.json | grep -o '"issues":\[[^]]*\]' | grep -o '{' | wc -l)

    # Display results
    echo "  Score: $score/100"
    echo "  Status: $status"
    echo "  Total Amount: \$$total"
    echo "  Issues Found: $issues"

    if [ "$score" -ge 95 ]; then
        echo -e "${GREEN}✓ PASSED${NC}"
    elif [ "$score" -ge 70 ]; then
        echo -e "${YELLOW}⚠ NEEDS REVIEW${NC}"
    else
        echo -e "${RED}✗ FAILED${NC}"
    fi

    echo ""

    # Save report
    cat /tmp/validation_result_${period}.json > "${REPORT_DIR}/${period}_${TIMESTAMP}.json"

    return $exit_code
}

# Function to test all periods
test_all_periods() {
    echo "Testing all fiscal periods..."
    echo ""

    local periods=("FY26-P01" "FY25-P12" "FY25-P11" "FY25-P10")
    local total_score=0
    local period_count=0
    local failed_count=0

    for period in "${periods[@]}"; do
        if validate_period "$period"; then
            period_count=$((period_count + 1))
        else
            failed_count=$((failed_count + 1))
            period_count=$((period_count + 1))
        fi
    done

    echo "═══════════════════════════════════════════════════════════════"
    echo "  Test Summary"
    echo "═══════════════════════════════════════════════════════════════"
    echo "  Total Periods Tested: $period_count"
    echo "  Failed: $failed_count"
    echo "  Passed: $((period_count - failed_count))"
    echo ""

    if [ $failed_count -eq 0 ]; then
        echo -e "${GREEN}✓ All tests passed!${NC}"
        echo ""
        return 0
    else
        echo -e "${RED}✗ $failed_count period(s) failed validation${NC}"
        echo ""
        return 1
    fi
}

# Parse command line arguments
FISCAL_PERIOD="${1:-FY26-P01}"

if [ "$FISCAL_PERIOD" = "--all" ]; then
    test_all_periods
    exit_code=$?
else
    validate_period "$FISCAL_PERIOD"
    exit_code=$?
fi

# Generate summary report
echo "═══════════════════════════════════════════════════════════════"
echo "  Reports saved to: $REPORT_DIR"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Cleanup
rm -f /tmp/validate_financial.js /tmp/validation_result_*.json

exit $exit_code
