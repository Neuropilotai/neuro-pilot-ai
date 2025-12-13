/**
 * Balance Reconciliation Job
 * 
 * Scheduled job that reconciles inventory_balances table with inventory_ledger.
 * Runs daily to detect and correct discrepancies.
 * 
 * Usage:
 *   - Schedule with cron: "0 2 * * *" (2 AM daily)
 *   - Or integrate with existing cron scheduler
 */

const { pool } = require('../../db');

/**
 * Reconcile inventory balances with ledger
 * @param {number} autoCorrectThreshold Maximum difference to auto-correct (default: 0.01)
 * @param {number} alertThreshold Minimum difference to alert on (default: 0.1)
 */
async function reconcileBalances(autoCorrectThreshold = 0.01, alertThreshold = 0.1) {
  console.log('Starting balance reconciliation...');
  const startTime = Date.now();

  const result = {
    totalChecked: 0,
    discrepancies: 0,
    autoCorrected: 0,
    requiresManualReview: 0,
    errors: [],
  };

  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Check if inventory_ledger table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'inventory_ledger'
      ) as exists
    `);
    
    if (!tableCheck.rows[0].exists) {
      console.log('⚠️  inventory_ledger table does not exist. Skipping reconciliation.');
      await client.query('COMMIT');
      return result;
    }
    
    // Step 1: Find all discrepancies between ledger and balance table
    const discrepancies = await client.query(`
      SELECT 
        l.org_id,
        l.item_id,
        l.location_id,
        l.lot_id,
        SUM(l.qty_canonical)::decimal(18, 6) as ledger_sum,
        COALESCE(b.qty_canonical, 0)::decimal(18, 6) as balance_qty,
        (SUM(l.qty_canonical) - COALESCE(b.qty_canonical, 0))::decimal(18, 6) as diff,
        MAX(l.id) as last_ledger_id
      FROM inventory_ledger l
      LEFT JOIN inventory_balances b ON (
        b.org_id = l.org_id
        AND b.item_id = l.item_id
        AND b.location_id = l.location_id
        AND (b.lot_id = l.lot_id OR (b.lot_id IS NULL AND l.lot_id IS NULL))
      )
      GROUP BY l.org_id, l.item_id, l.location_id, l.lot_id, b.qty_canonical
      HAVING ABS(SUM(l.qty_canonical) - COALESCE(b.qty_canonical, 0)) > 0.000001
    `);

    result.totalChecked = discrepancies.rows.length;
    result.discrepancies = discrepancies.rows.length;

    console.log(`Found ${discrepancies.rows.length} discrepancies`);

    // Step 2: Process each discrepancy
    for (const disc of discrepancies.rows) {
      const ledgerSum = parseFloat(disc.ledger_sum);
      const balanceQty = parseFloat(disc.balance_qty);
      const diff = Math.abs(parseFloat(disc.diff));

      const error = {
        orgId: disc.org_id,
        itemId: disc.item_id,
        locationId: disc.location_id,
        lotId: disc.lot_id,
        ledgerSum,
        balanceQty,
        diff,
      };

      result.errors.push(error);

      // Auto-correct small discrepancies
      if (diff <= autoCorrectThreshold) {
        await client.query(`
          INSERT INTO inventory_balances (
            org_id, item_id, location_id, lot_id,
            qty_canonical, last_updated, last_ledger_id
          ) VALUES ($1, $2, $3, $4, $5, NOW(), $6)
          ON CONFLICT (org_id, item_id, location_id, lot_id)
          DO UPDATE SET
            qty_canonical = EXCLUDED.qty_canonical,
            last_updated = NOW(),
            last_ledger_id = EXCLUDED.last_ledger_id
        `, [
          disc.org_id,
          disc.item_id,
          disc.location_id,
          disc.lot_id,
          disc.ledger_sum,
          disc.last_ledger_id
        ]);
        
        result.autoCorrected++;
        console.log(`✅ Auto-corrected: org=${disc.org_id}, item=${disc.item_id}, diff=${diff.toFixed(6)}`);
      } else {
        result.requiresManualReview++;
        if (diff >= alertThreshold) {
          console.error(`❌ Large discrepancy: org=${disc.org_id}, item=${disc.item_id}, diff=${diff.toFixed(6)}`);
        } else {
          console.warn(`⚠️  Discrepancy: org=${disc.org_id}, item=${disc.item_id}, diff=${diff.toFixed(6)}`);
        }
      }
    }

    // Step 3: Find orphaned balance records (no ledger entries)
    const orphaned = await client.query(`
      SELECT b.*
      FROM inventory_balances b
      LEFT JOIN inventory_ledger l ON (
        l.org_id = b.org_id
        AND l.item_id = b.item_id
        AND l.location_id = b.location_id
        AND (l.lot_id = b.lot_id OR (l.lot_id IS NULL AND b.lot_id IS NULL))
      )
      WHERE l.id IS NULL
    `);

    if (orphaned.rows.length > 0) {
      console.warn(`⚠️  Found ${orphaned.rows.length} orphaned balance records`);
      // Optionally delete orphaned records or flag for review
    }

    await client.query('COMMIT');

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n✅ Reconciliation complete in ${duration}s`);
    console.log(`   Total checked: ${result.totalChecked}`);
    console.log(`   Discrepancies: ${result.discrepancies}`);
    console.log(`   Auto-corrected: ${result.autoCorrected}`);
    console.log(`   Requires review: ${result.requiresManualReview}`);

    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Reconciliation error:', error);
    
    // Construct proper error object matching result.errors structure
    // This ensures error handling is consistent with the expected error format
    const errorEntry = {
      orgId: null,
      itemId: null,
      locationId: null,
      lotId: null,
      ledgerSum: 0,
      balanceQty: 0,
      diff: 0,
      error: error.message || String(error),
      stack: error.stack,
    };
    
    result.errors.push(errorEntry);
    result.requiresManualReview++;
    
    // Re-throw to allow caller to handle if needed
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { reconcileBalances };

