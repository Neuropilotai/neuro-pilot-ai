/**
 * Balance Reconciliation Job
 * 
 * Scheduled job that reconciles inventory_balances table with inventory_ledger.
 * Runs daily to detect and correct discrepancies.
 * 
 * Usage:
 *   - Schedule with cron: "0 2 * * *" (2 AM daily)
 *   - Or use BullMQ/similar job scheduler
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface ReconciliationResult {
  totalChecked: number;
  discrepancies: number;
  autoCorrected: number;
  requiresManualReview: number;
  errors: Array<{
    orgId: string;
    itemId: string;
    locationId: string;
    lotId: string | null;
    ledgerSum: number;
    balanceQty: number;
    diff: number;
  }>;
}

/**
 * Reconcile inventory balances with ledger
 * @param autoCorrectThreshold Maximum difference to auto-correct (default: 0.01)
 * @param alertThreshold Minimum difference to alert on (default: 0.1)
 */
export async function reconcileBalances(
  autoCorrectThreshold: number = 0.01,
  alertThreshold: number = 0.1
): Promise<ReconciliationResult> {
  console.log('Starting balance reconciliation...');
  const startTime = Date.now();

  const result: ReconciliationResult = {
    totalChecked: 0,
    discrepancies: 0,
    autoCorrected: 0,
    requiresManualReview: 0,
    errors: [],
  };

  try {
    // Step 1: Find all discrepancies between ledger and balance table
    const discrepancies = await prisma.$queryRaw<Array<{
      org_id: string;
      item_id: string;
      location_id: string;
      lot_id: string | null;
      ledger_sum: string; // Decimal as string
      balance_qty: string; // Decimal as string
      diff: string; // Decimal as string
      last_ledger_id: string;
    }>>`
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
    `;

    result.totalChecked = discrepancies.length;
    result.discrepancies = discrepancies.length;

    console.log(`Found ${discrepancies.length} discrepancies`);

    // Step 2: Process each discrepancy
    for (const disc of discrepancies) {
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

      // Step 3: Auto-correct small discrepancies
      if (diff <= autoCorrectThreshold) {
        try {
          await prisma.inventoryBalance.upsert({
            where: {
              orgId_itemId_locationId_lotId: {
                orgId: disc.org_id,
                itemId: disc.item_id,
                locationId: disc.location_id,
                lotId: disc.lot_id || null,
              },
            },
            create: {
              orgId: disc.org_id,
              itemId: disc.item_id,
              locationId: disc.location_id,
              lotId: disc.lot_id || null,
              qtyCanonical: ledgerSum,
              lastLedgerId: disc.last_ledger_id,
            },
            update: {
              qtyCanonical: ledgerSum,
              lastLedgerId: disc.last_ledger_id,
              lastUpdated: new Date(),
            },
          });

          result.autoCorrected++;
          console.log(`Auto-corrected: org=${disc.org_id}, item=${disc.item_id}, diff=${diff.toFixed(6)}`);
        } catch (error: any) {
          console.error(`Failed to auto-correct:`, error.message);
          result.errors.push(error);
        }
      } else {
        // Step 4: Flag for manual review
        result.requiresManualReview++;
        result.errors.push(error);

        if (diff >= alertThreshold) {
          console.warn(
            `⚠️  Large discrepancy detected: org=${disc.org_id}, item=${disc.item_id}, ` +
            `location=${disc.location_id}, diff=${diff.toFixed(6)}`
          );
        }
      }
    }

    // Step 5: Check for balance records with no ledger entries (orphaned)
    const orphaned = await prisma.$queryRaw<Array<{
      org_id: string;
      item_id: string;
      location_id: string;
      lot_id: string | null;
      balance_qty: string;
    }>>`
      SELECT 
        b.org_id,
        b.item_id,
        b.location_id,
        b.lot_id,
        b.qty_canonical::decimal(18, 6) as balance_qty
      FROM inventory_balances b
      LEFT JOIN inventory_ledger l ON (
        l.org_id = b.org_id
        AND l.item_id = b.item_id
        AND l.location_id = b.location_id
        AND (l.lot_id = b.lot_id OR (l.lot_id IS NULL AND b.lot_id IS NULL))
      )
      WHERE l.id IS NULL
      AND b.qty_canonical != 0
    `;

    if (orphaned.length > 0) {
      console.warn(`Found ${orphaned.length} orphaned balance records (no ledger entries)`);
      
      // Delete orphaned zero balances, but keep non-zero for investigation
      for (const orphan of orphaned) {
        const qty = parseFloat(orphan.balance_qty);
        if (Math.abs(qty) < 0.000001) {
          await prisma.inventoryBalance.deleteMany({
            where: {
              orgId: orphan.org_id,
              itemId: orphan.item_id,
              locationId: orphan.location_id,
              lotId: orphan.lot_id || null,
            },
          });
        } else {
          result.errors.push({
            orgId: orphan.org_id,
            itemId: orphan.item_id,
            locationId: orphan.location_id,
            lotId: orphan.lot_id,
            ledgerSum: 0,
            balanceQty: qty,
            diff: qty,
          });
        }
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\nReconciliation complete in ${duration}s:`);
    console.log(`  - Total checked: ${result.totalChecked}`);
    console.log(`  - Discrepancies: ${result.discrepancies}`);
    console.log(`  - Auto-corrected: ${result.autoCorrected}`);
    console.log(`  - Requires review: ${result.requiresManualReview}`);

    // Step 6: Send alerts if needed
    if (result.requiresManualReview > 0) {
      await sendReconciliationAlert(result);
    }

    return result;
  } catch (error: any) {
    console.error('Error during reconciliation:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Send alert for reconciliation issues
 */
async function sendReconciliationAlert(result: ReconciliationResult): Promise<void> {
  // TODO: Integrate with your alerting system (PagerDuty, email, Slack, etc.)
  console.warn('\n🚨 RECONCILIATION ALERT 🚨');
  console.warn(`Found ${result.requiresManualReview} discrepancies requiring manual review`);
  
  // Log top 10 errors
  result.errors.slice(0, 10).forEach((error) => {
    console.warn(
      `  - Org: ${error.orgId}, Item: ${error.itemId}, ` +
      `Diff: ${error.diff.toFixed(6)}`
    );
  });

  // Example: Send to monitoring service
  // await fetch('https://your-monitoring-service.com/alerts', {
  //   method: 'POST',
  //   body: JSON.stringify({
  //     type: 'balance_reconciliation',
  //     severity: result.requiresManualReview > 10 ? 'high' : 'medium',
  //     message: `${result.requiresManualReview} balance discrepancies require review`,
  //     data: result,
  //   }),
  // });
}

/**
 * Run reconciliation if executed directly
 */
if (require.main === module) {
  reconcileBalances()
    .then((result) => {
      console.log('\n✅ Reconciliation completed successfully');
      process.exit(result.requiresManualReview > 0 ? 1 : 0);
    })
    .catch((error) => {
      console.error('\n❌ Reconciliation failed:', error);
      process.exit(1);
    });
}

export { reconcileBalances, ReconciliationResult };

