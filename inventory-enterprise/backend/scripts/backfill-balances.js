/**
 * Backfill Inventory Balances
 * 
 * Populates the inventory_balances table from existing ledger data
 * 
 * Usage:
 *   node scripts/backfill-balances.js
 */

const { pool } = require('../db');

async function backfillBalances() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('🔄 Starting balance backfill...');
    
    // Check if inventory_ledger table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'inventory_ledger'
      ) as exists
    `);
    
    if (!tableCheck.rows[0].exists) {
      console.log('⚠️  inventory_ledger table does not exist. Skipping backfill.');
      await client.query('COMMIT');
      return { inserted: 0, updated: 0 };
    }
    
    // Calculate balances from ledger
    const balances = await client.query(`
      SELECT 
        org_id,
        item_id,
        location_id,
        lot_id,
        SUM(qty_canonical) as qty_canonical,
        MAX(id) as last_ledger_id
      FROM inventory_ledger
      WHERE org_id IS NOT NULL
      GROUP BY org_id, item_id, location_id, lot_id
    `);
    
    console.log(`📊 Found ${balances.rows.length} balance records to process`);
    
    let inserted = 0;
    let updated = 0;
    
    for (const balance of balances.rows) {
      const result = await client.query(`
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
        balance.org_id,
        balance.item_id,
        balance.location_id,
        balance.lot_id,
        balance.qty_canonical,
        balance.last_ledger_id
      ]);
      
      if (result.rowCount === 1) {
        inserted++;
      } else {
        updated++;
      }
    }
    
    await client.query('COMMIT');
    
    console.log(`✅ Backfill complete:`);
    console.log(`   Inserted: ${inserted}`);
    console.log(`   Updated: ${updated}`);
    
    return { inserted, updated };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// CLI
if (require.main === module) {
  backfillBalances()
    .then(() => {
      console.log('✅ Done');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Error:', error.message);
      process.exit(1);
    });
}

module.exports = { backfillBalances };

