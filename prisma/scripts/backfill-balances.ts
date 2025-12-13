/**
 * Backfill Inventory Balances Script
 * 
 * Calculates current balances from ledger and populates inventory_balances table.
 * Safe to run multiple times (idempotent).
 * 
 * Usage:
 *   tsx prisma/scripts/backfill-balances.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function backfillBalances() {
  console.log('Starting balance backfill...');

  try {
    // Step 1: Calculate balances from ledger grouped by org, item, location, lot
    console.log('Calculating balances from ledger...');
    
    const balances = await prisma.$queryRaw<Array<{
      org_id: string;
      item_id: string;
      location_id: string;
      lot_id: string | null;
      qty_canonical: string; // Decimal as string from SQL
      last_ledger_id: string;
    }>>`
      SELECT 
        org_id,
        item_id,
        location_id,
        lot_id,
        SUM(qty_canonical)::decimal(18, 6) as qty_canonical,
        MAX(id) as last_ledger_id
      FROM inventory_ledger
      GROUP BY org_id, item_id, location_id, lot_id
      HAVING SUM(qty_canonical) != 0
    `;

    console.log(`Found ${balances.length} unique balance records`);

    // Step 2: Insert or update balance records
    let inserted = 0;
    let updated = 0;
    let errors = 0;

    for (const balance of balances) {
      try {
        const qty = parseFloat(balance.qty_canonical);

        // Skip zero balances (they'll be created when needed)
        if (qty === 0) continue;

        await prisma.inventoryBalance.upsert({
          where: {
            orgId_itemId_locationId_lotId: {
              orgId: balance.org_id,
              itemId: balance.item_id,
              locationId: balance.location_id,
              lotId: balance.lot_id || null,
            },
          },
          create: {
            orgId: balance.org_id,
            itemId: balance.item_id,
            locationId: balance.location_id,
            lotId: balance.lot_id || null,
            qtyCanonical: qty,
            lastLedgerId: balance.last_ledger_id,
          },
          update: {
            qtyCanonical: qty,
            lastLedgerId: balance.last_ledger_id,
            lastUpdated: new Date(),
          },
        });

        inserted++;
      } catch (error: any) {
        console.error(`Error processing balance for org=${balance.org_id}, item=${balance.item_id}:`, error.message);
        errors++;
      }
    }

    console.log(`\nBackfill complete:`);
    console.log(`  - Processed: ${balances.length} records`);
    console.log(`  - Upserted: ${inserted} records`);
    console.log(`  - Errors: ${errors}`);

    // Step 3: Verify balances match ledger
    console.log('\nVerifying balances...');
    
    const verification = await prisma.$queryRaw<Array<{
      org_id: string;
      item_id: string;
      location_id: string;
      lot_id: string | null;
      ledger_sum: string;
      balance_qty: string;
      diff: string;
    }>>`
      SELECT 
        l.org_id,
        l.item_id,
        l.location_id,
        l.lot_id,
        SUM(l.qty_canonical)::decimal(18, 6) as ledger_sum,
        COALESCE(b.qty_canonical, 0)::decimal(18, 6) as balance_qty,
        (SUM(l.qty_canonical) - COALESCE(b.qty_canonical, 0))::decimal(18, 6) as diff
      FROM inventory_ledger l
      LEFT JOIN inventory_balances b ON (
        b.org_id = l.org_id
        AND b.item_id = l.item_id
        AND b.location_id = l.location_id
        AND (b.lot_id = l.lot_id OR (b.lot_id IS NULL AND l.lot_id IS NULL))
      )
      GROUP BY l.org_id, l.item_id, l.location_id, l.lot_id, b.qty_canonical
      HAVING ABS(SUM(l.qty_canonical) - COALESCE(b.qty_canonical, 0)) > 0.000001
    `;

    if (verification.length > 0) {
      console.warn(`\n⚠️  Found ${verification.length} discrepancies:`);
      verification.slice(0, 10).forEach((v) => {
        console.warn(`  - Org: ${v.org_id}, Item: ${v.item_id}, Diff: ${v.diff}`);
      });
      if (verification.length > 10) {
        console.warn(`  ... and ${verification.length - 10} more`);
      }
    } else {
      console.log('✅ All balances verified - no discrepancies found');
    }

  } catch (error: any) {
    console.error('Error during backfill:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run if executed directly
if (require.main === module) {
  backfillBalances()
    .then(() => {
      console.log('\n✅ Backfill completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Backfill failed:', error);
      process.exit(1);
    });
}

export { backfillBalances };

