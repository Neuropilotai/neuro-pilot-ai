#!/bin/bash
###############################################################################
# NeuroPilot v14 - Production Verification Script (Fly.io)
# Run this inside the Fly.io VM via: fly ssh console -a backend-silent-mountain-3362
###############################################################################

set -e

echo "=================================="
echo "NeuroPilot v14 Production Check"
echo "=================================="
echo ""

# Find database
echo "1. Locating database..."
DB_PATH=$(find . -maxdepth 3 -name "*.db" -o -name "*inventory*.db" 2>/dev/null | head -1)

if [ -z "$DB_PATH" ]; then
    echo "❌ Database not found!"
    exit 1
fi

echo "✓ Found database: $DB_PATH"
echo ""

# Check AI tables
echo "2. Checking AI table structure..."
AI_TABLES=$(sqlite3 "$DB_PATH" "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'ai_%' ORDER BY name;")
echo "$AI_TABLES"
echo ""

# Check learning insights count
echo "3. Learning insights count..."
INSIGHTS_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM ai_learning_insights;")
echo "Total insights: $INSIGHTS_COUNT"

# Check v14 signal insights
SIGNAL_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM ai_learning_insights WHERE insight_type LIKE 'signal_%';")
echo "v14 signal insights: $SIGNAL_COUNT"
echo ""

# Check forecast cache
echo "4. Forecast cache status..."
FORECAST_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM ai_daily_forecast_cache;")
echo "Cached forecast entries: $FORECAST_COUNT"

LATEST_FORECAST=$(sqlite3 "$DB_PATH" "SELECT date, COUNT(*) as items FROM ai_daily_forecast_cache GROUP BY date ORDER BY date DESC LIMIT 1;")
echo "Latest forecast: $LATEST_FORECAST"
echo ""

# Check ai_ops_breadcrumbs with v14 columns
echo "5. AI Ops breadcrumbs (v14 enhanced)..."
BREADCRUMB_SCHEMA=$(sqlite3 "$DB_PATH" "PRAGMA table_info(ai_ops_breadcrumbs);" | grep -E "(duration_ms|metadata|action)" || echo "v14 columns not found")
if echo "$BREADCRUMB_SCHEMA" | grep -q "duration_ms"; then
    echo "✓ v14 enhanced columns present (duration_ms, metadata, action)"

    # Show recent breadcrumbs
    echo ""
    echo "Recent job executions:"
    sqlite3 "$DB_PATH" "SELECT job, datetime(ran_at), duration_ms FROM ai_ops_breadcrumbs ORDER BY ran_at DESC LIMIT 5;" || true
else
    echo "⚠ v14 columns not detected - may need migration"
fi
echo ""

# Check fiscal calendar integration
echo "6. Fiscal calendar integration..."
FISCAL_PERIODS=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM fiscal_periods WHERE fiscal_year IN ('FY25','FY26');" 2>/dev/null || echo "0")
echo "FY25/FY26 periods: $FISCAL_PERIODS (expected: 24)"

if [ "$FISCAL_PERIODS" -ge 24 ]; then
    echo "✓ Fiscal calendar fully integrated"
else
    echo "⚠ Fiscal calendar incomplete"
fi
echo ""

# Check invoice assignments
echo "7. Invoice fiscal period assignments..."
ASSIGNED_INVOICES=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM documents WHERE fiscal_period_id IS NOT NULL;" 2>/dev/null || echo "0")
TOTAL_INVOICES=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM documents;" 2>/dev/null || echo "0")
echo "Invoices with fiscal assignments: $ASSIGNED_INVOICES / $TOTAL_INVOICES"
echo ""

# Check for LearningSignals.js module
echo "8. Checking for v14 code modules..."
if [ -f "src/ai/learning/LearningSignals.js" ] || [ -f "./src/ai/learning/LearningSignals.js" ]; then
    echo "✓ LearningSignals.js module found"
else
    echo "⚠ LearningSignals.js not found - v14 code may not be deployed"
fi
echo ""

# Recent learning insights
echo "9. Recent learning insights (last 3)..."
sqlite3 "$DB_PATH" "SELECT insight_type, substr(description,1,60) || '...', confidence FROM ai_learning_insights ORDER BY created_at DESC LIMIT 3;" 2>/dev/null || echo "No insights found"
echo ""

# Summary
echo "=================================="
echo "Verification Summary"
echo "=================================="
echo "Database: $DB_PATH"
echo "AI Tables: $(echo "$AI_TABLES" | wc -l)"
echo "Learning Insights: $INSIGHTS_COUNT (v14 signals: $SIGNAL_COUNT)"
echo "Forecast Cache: $FORECAST_COUNT entries"
echo "Fiscal Periods: $FISCAL_PERIODS"
echo "Assigned Invoices: $ASSIGNED_INVOICES/$TOTAL_INVOICES"
echo ""

if [ "$SIGNAL_COUNT" -gt 0 ]; then
    echo "✓ v14 appears to be deployed and running"
else
    echo "⚠ v14 may not be fully deployed (no signal insights found)"
fi

echo ""
echo "To test API endpoints, use the curl commands from outside the VM"
