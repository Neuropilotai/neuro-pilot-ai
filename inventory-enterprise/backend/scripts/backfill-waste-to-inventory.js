#!/usr/bin/env node
/**
 * Backfill Waste to Inventory
 * NeuroPilot P1 Hardening
 *
 * Purpose: Recompute waste impact on inventory for historical data
 * Usage: node scripts/backfill-waste-to-inventory.js --days=30 --org=<uuid>
 * Features:
 *   - Idempotent: Uses checkpoint table to track progress
 *   - Safe: Reads waste entries, computes net delta, applies to inventory
 *   - Auditable: Logs all adjustments to waste_inventory_adjustments
 */

const { pool } = require('../db');
const dayjs = require('dayjs');

// ============================================
// CONFIGURATION
// ============================================

const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, value] = arg.split('=');
  acc[key.replace('--', '')] = value;
  return acc;
}, {});

const DAYS = parseInt(args.days || '30', 10);
const ORG_FILTER = args.org || null;
const DRY_RUN = args['dry-run'] === 'true';

console.log('═══════════════════════════════════════════════════════════');
console.log('🔄 NeuroPilot Waste-to-Inventory Backfill');
console.log('═══════════════════════════════════════════════════════════');
console.log(`📅 Date Range: Last ${DAYS} days`);
console.log(`🏢 Org Filter: ${ORG_FILTER || 'ALL orgs'}`);
console.log(`🧪 Dry Run: ${DRY_RUN ? 'YES (no changes)' : 'NO (will update inventory)'}`);
console.log('═══════════════════════════════════════════════════════════\n');

// ============================================
// HELPER FUNCTIONS
// ============================================

async function getLastBackfillRun(orgId) {
  const query = `
    SELECT from_date, to_date, completed_at
    FROM waste_backfill_runs
    WHERE status = 'completed'
      AND (org_id = $1 OR $1 IS NULL)
    ORDER BY completed_at DESC
    LIMIT 1
  `;

  const result = await pool.query(query, [orgId]);
  return result.rows[0] || null;
}

async function createBackfillRun(fromDate, toDate, orgId) {
  const query = `
    INSERT INTO waste_backfill_runs (from_date, to_date, org_id, status)
    VALUES ($1, $2, $3, 'running')
    RETURNING id
  `;

  const result = await pool.query(query, [fromDate, toDate, orgId]);
  return result.rows[0].id;
}

async function completeBackfillRun(runId, itemsProcessed, adjustmentsCreated, error = null) {
  const query = `
    UPDATE waste_backfill_runs
    SET
      status = $2,
      items_processed = $3,
      adjustments_created = $4,
      error_message = $5,
      completed_at = now()
    WHERE id = $1
  `;

  await pool.query(query, [
    runId,
    error ? 'failed' : 'completed',
    itemsProcessed,
    adjustmentsCreated,
    error
  ]);
}

async function getWasteAggregates(fromDate, toDate, orgId) {
  const query = `
    SELECT
      w.org_id,
      w.site_id,
      w.item_code,
      SUM(w.quantity) as total_waste_quantity,
      COUNT(*) as waste_entry_count,
      MIN(w.logged_at) as first_waste_date,
      MAX(w.logged_at) as last_waste_date
    FROM waste w
    WHERE
      w.logged_at >= $1
      AND w.logged_at < $2
      AND ($3::VARCHAR IS NULL OR w.org_id = $3)
    GROUP BY w.org_id, w.site_id, w.item_code
    ORDER BY w.org_id, w.site_id, w.item_code
  `;

  const result = await pool.query(query, [fromDate, toDate, orgId]);
  return result.rows;
}

async function getCurrentInventoryQuantity(orgId, siteId, itemCode) {
  const query = `
    SELECT current_quantity
    FROM inventory_items
    WHERE org_id = $1
      AND (site_id IS NOT DISTINCT FROM $2)
      AND item_code = $3
  `;

  const result = await pool.query(query, [orgId, siteId, itemCode]);
  return result.rows[0]?.current_quantity || 0;
}

async function getPreviousAdjustments(orgId, siteId, itemCode, fromDate, toDate) {
  const query = `
    SELECT COALESCE(SUM(delta), 0) as total_delta
    FROM waste_inventory_adjustments
    WHERE org_id = $1
      AND (site_id IS NOT DISTINCT FROM $2)
      AND item_code = $3
      AND occurred_at >= $4
      AND occurred_at < $5
  `;

  const result = await pool.query(query, [orgId, siteId, itemCode, fromDate, toDate]);
  return parseFloat(result.rows[0]?.total_delta || 0);
}

async function applyBackfillAdjustment(orgId, siteId, itemCode, delta, fromDate, toDate) {
  if (DRY_RUN) {
    console.log(`  [DRY-RUN] Would adjust ${itemCode} by ${delta}`);
    return { updated: 0, logged: 0 };
  }

  // Update inventory
  const updateQuery = `
    UPDATE inventory_items
    SET
      current_quantity = COALESCE(current_quantity, 0) + $4,
      updated_at = now()
    WHERE org_id = $1
      AND (site_id IS NOT DISTINCT FROM $2)
      AND item_code = $3
  `;

  const updateResult = await pool.query(updateQuery, [orgId, siteId, itemCode, delta]);

  // Log adjustment
  const logQuery = `
    INSERT INTO waste_inventory_adjustments (
      org_id,
      site_id,
      item_code,
      delta,
      reason,
      waste_id,
      occurred_at
    )
    VALUES ($1, $2, $3, $4, $5, NULL, $6)
  `;

  const reason = `backfill:${fromDate.toISOString().split('T')[0]}_to_${toDate.toISOString().split('T')[0]}`;

  await pool.query(logQuery, [
    orgId,
    siteId,
    itemCode,
    delta,
    reason,
    toDate // Use end date as occurred_at
  ]);

  return { updated: updateResult.rowCount, logged: 1 };
}

// ============================================
// MAIN BACKFILL LOGIC
// ============================================

async function runBackfill() {
  const startTime = Date.now();
  let runId = null;

  try {
    // Calculate date range
    const toDate = new Date();
    const fromDate = dayjs().subtract(DAYS, 'day').toDate();

    console.log(`📊 Analyzing waste entries from ${fromDate.toISOString()} to ${toDate.toISOString()}\n`);

    // Check for previous runs
    const lastRun = await getLastBackfillRun(ORG_FILTER);
    if (lastRun) {
      console.log('ℹ️  Previous backfill run found:');
      console.log(`   From: ${lastRun.from_date}`);
      console.log(`   To: ${lastRun.to_date}`);
      console.log(`   Completed: ${lastRun.completed_at}`);
      console.log('   Note: This run will compute net difference since last run\n');
    }

    // Create backfill run record
    runId = await createBackfillRun(fromDate, toDate, ORG_FILTER);
    console.log(`✅ Created backfill run #${runId}\n`);

    // Get waste aggregates for the period
    console.log('🔍 Fetching waste aggregates...');
    const aggregates = await getWasteAggregates(fromDate, toDate, ORG_FILTER);
    console.log(`   Found ${aggregates.length} unique (org, site, item) combinations\n`);

    if (aggregates.length === 0) {
      console.log('ℹ️  No waste entries found in date range. Nothing to backfill.');
      await completeBackfillRun(runId, 0, 0);
      return;
    }

    // Process each aggregate
    let itemsProcessed = 0;
    let adjustmentsCreated = 0;
    let skipped = 0;

    console.log('🔄 Processing waste aggregates...\n');

    for (const agg of aggregates) {
      const { org_id, site_id, item_code, total_waste_quantity, waste_entry_count } = agg;

      // Get previous adjustments for this item in this period
      const previousDelta = await getPreviousAdjustments(org_id, site_id, item_code, fromDate, toDate);

      // Calculate net delta to apply
      // Expected delta: -total_waste_quantity (waste reduces inventory)
      // Already applied: previousDelta
      // Need to apply: expected - already applied
      const expectedDelta = -parseFloat(total_waste_quantity);
      const netDelta = expectedDelta - previousDelta;

      if (Math.abs(netDelta) < 0.0001) {
        // Already synchronized, skip
        skipped++;
        continue;
      }

      const currentQty = await getCurrentInventoryQuantity(org_id, site_id, item_code);

      console.log(`📦 ${item_code} (org: ${org_id}, site: ${site_id || 'none'})`);
      console.log(`   Waste entries: ${waste_entry_count}`);
      console.log(`   Total wasted: ${total_waste_quantity}`);
      console.log(`   Expected delta: ${expectedDelta.toFixed(4)}`);
      console.log(`   Already applied: ${previousDelta.toFixed(4)}`);
      console.log(`   Net adjustment: ${netDelta.toFixed(4)}`);
      console.log(`   Current inventory: ${currentQty}`);
      console.log(`   New inventory: ${(parseFloat(currentQty) + netDelta).toFixed(4)}`);

      // Apply adjustment
      const { updated, logged } = await applyBackfillAdjustment(
        org_id,
        site_id,
        item_code,
        netDelta,
        fromDate,
        toDate
      );

      if (logged) {
        adjustmentsCreated++;
      }

      itemsProcessed++;
      console.log('');
    }

    // Complete the run
    await completeBackfillRun(runId, itemsProcessed, adjustmentsCreated);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ BACKFILL COMPLETE');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`⏱️  Duration: ${duration}s`);
    console.log(`📊 Items Processed: ${itemsProcessed}`);
    console.log(`📝 Adjustments Created: ${adjustmentsCreated}`);
    console.log(`⏭️  Skipped (already synced): ${skipped}`);
    console.log(`🆔 Run ID: ${runId}`);
    console.log('═══════════════════════════════════════════════════════════');

    if (!DRY_RUN) {
      console.log('\n📋 Next Steps:');
      console.log('   1. Verify adjustments:');
      console.log(`      SELECT * FROM waste_inventory_adjustments WHERE reason LIKE 'backfill:%' ORDER BY created_at DESC LIMIT 20;`);
      console.log('   2. Check impact summary:');
      console.log('      SELECT * FROM waste_impact_summary;');
      console.log('   3. Validate inventory quantities against expected values');
    }

  } catch (error) {
    console.error('\n❌ BACKFILL FAILED:', error.message);
    console.error(error.stack);

    if (runId) {
      await completeBackfillRun(runId, 0, 0, error.message);
    }

    process.exit(1);
  } finally {
    await pool.end();
  }
}

// ============================================
// EXECUTE
// ============================================

runBackfill().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
