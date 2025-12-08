#!/usr/bin/env node
/**
 * Backfill script: Waste to Inventory Sync
 * NeuroPilot P1 Hardening - 30-day backfill
 * 
 * Usage:
 *   npx ts-node scripts/backfill-waste-to-inventory.ts [--days=30] [--org-id=<uuid>]
 * 
 * This script processes waste entries from the last N days and creates
 * inventory adjustments. It's idempotent and safe to run multiple times.
 */

import { Pool } from 'pg';
import * as process from 'process';

interface WasteEntry {
  id: number;
  org_id: string;
  site_id: string | null;
  item_code: string;
  quantity: number;
  reason: string | null;
  created_at: Date;
}

interface BackfillStats {
  totalWasteEntries: number;
  adjustmentsCreated: number;
  itemsUpdated: number;
  errors: number;
}

// Parse command-line arguments
function parseArgs(): { days: number; orgId?: string } {
  const args = process.argv.slice(2);
  let days = 30;
  let orgId: string | undefined;

  for (const arg of args) {
    if (arg.startsWith('--days=')) {
      days = parseInt(arg.split('=')[1], 10) || 30;
    } else if (arg.startsWith('--org-id=')) {
      orgId = arg.split('=')[1];
    }
  }

  return { days, orgId };
}

async function backfillWasteToInventory() {
  const { days, orgId } = parseArgs();
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  const stats: BackfillStats = {
    totalWasteEntries: 0,
    adjustmentsCreated: 0,
    itemsUpdated: 0,
    errors: 0,
  };

  try {
    console.log(`\n🔧 NeuroPilot P1 Hardening: Waste Inventory Backfill`);
    console.log(`   Days: ${days}`);
    if (orgId) {
      console.log(`   Org ID: ${orgId}`);
    }
    console.log(`   Started: ${new Date().toISOString()}\n`);

    // Calculate date range
    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);

    // Check if waste table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'waste'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      console.error('❌ Error: waste table does not exist');
      console.error('   Please run migration 040_waste_inventory_sync.sql first');
      process.exit(1);
    }

    // Check if inventory_items table has org_id and site_id columns
    const columnsCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'inventory_items'
      AND column_name IN ('org_id', 'site_id', 'item_code', 'current_quantity');
    `);

    const hasColumns = columnsCheck.rows.map((r: any) => r.column_name);
    const requiredColumns = ['org_id', 'site_id', 'item_code', 'current_quantity'];
    const missingColumns = requiredColumns.filter((col) => !hasColumns.includes(col));

    if (missingColumns.length > 0) {
      console.error(`❌ Error: inventory_items table missing columns: ${missingColumns.join(', ')}`);
      console.error('   Please ensure inventory_items has org_id, site_id, item_code, and current_quantity columns');
      process.exit(1);
    }

    // Fetch waste entries from the date range
    let wasteQuery = `
      SELECT id, org_id, site_id, item_code, quantity, reason, created_at
      FROM waste
      WHERE created_at >= $1 AND created_at <= $2
    `;
    const queryParams: any[] = [fromDate, toDate];

    if (orgId) {
      wasteQuery += ` AND org_id = $3`;
      queryParams.push(orgId);
    }

    wasteQuery += ` ORDER BY created_at ASC`;

    const wasteResult = await pool.query(wasteQuery, queryParams);
    const wasteEntries: WasteEntry[] = wasteResult.rows;
    stats.totalWasteEntries = wasteEntries.length;

    console.log(`📊 Found ${wasteEntries.length} waste entries to process\n`);

    if (wasteEntries.length === 0) {
      console.log('✅ No waste entries found in the specified date range');
      await pool.end();
      process.exit(0);
    }

    // Process each waste entry
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const waste of wasteEntries) {
        try {
          // Check if adjustment already exists (idempotency check)
          const existingCheck = await client.query(
            `SELECT id FROM waste_inventory_adjustments WHERE waste_id = $1`,
            [waste.id]
          );

          if (existingCheck.rows.length > 0) {
            console.log(`⏭️  Skipping waste_id=${waste.id} (already processed)`);
            continue;
          }

          // Calculate delta (negative because waste reduces inventory)
          const delta = -Math.abs(Number(waste.quantity) || 0);

          // Update inventory_items
          const updateResult = await client.query(
            `UPDATE inventory_items
             SET current_quantity = COALESCE(current_quantity, 0) + $1,
                 updated_at = now()
             WHERE org_id = $2 
               AND (site_id IS NOT DISTINCT FROM $3) 
               AND item_code = $4
             RETURNING item_code`,
            [delta, waste.org_id, waste.site_id, waste.item_code]
          );

          if (updateResult.rows.length > 0) {
            stats.itemsUpdated++;
          }

          // Insert adjustment record
          await client.query(
            `INSERT INTO waste_inventory_adjustments 
             (org_id, site_id, item_code, delta, reason, waste_id, occurred_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              waste.org_id,
              waste.site_id,
              waste.item_code,
              delta,
              waste.reason,
              waste.id,
              waste.created_at,
            ]
          );

          stats.adjustmentsCreated++;

          if (stats.adjustmentsCreated % 100 === 0) {
            console.log(`   Processed ${stats.adjustmentsCreated}/${wasteEntries.length} entries...`);
          }
        } catch (error: any) {
          stats.errors++;
          console.error(`   ⚠️  Error processing waste_id=${waste.id}: ${error.message}`);
          // Continue processing other entries
        }
      }

      await client.query('COMMIT');
      console.log('\n✅ Backfill completed successfully\n');
    } catch (error: any) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    // Print summary
    console.log('📈 Summary:');
    console.log(`   Total waste entries: ${stats.totalWasteEntries}`);
    console.log(`   Adjustments created: ${stats.adjustmentsCreated}`);
    console.log(`   Inventory items updated: ${stats.itemsUpdated}`);
    console.log(`   Errors: ${stats.errors}`);
    console.log(`\n✅ Backfill complete: ${new Date().toISOString()}\n`);

    if (stats.errors > 0) {
      console.warn(`⚠️  Warning: ${stats.errors} errors occurred during processing`);
      process.exit(1);
    }
  } catch (error: any) {
    console.error('\n❌ Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the backfill when executed directly
const isMainModule = process.argv[1]?.includes('backfill-waste-to-inventory');
if (isMainModule) {
  backfillWasteToInventory().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

export { backfillWasteToInventory };

