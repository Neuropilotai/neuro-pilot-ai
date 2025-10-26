/**
 * ═══════════════════════════════════════════════════════════════════════════
 * HEALTH AUDIT AUTO-FIX ENGINE - v1.0.0
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Safe automatic fixes for health issues with comprehensive audit trails.
 *
 * SAFETY RULES:
 * - Only fix issues with clear, deterministic solutions
 * - Always create audit records (before/after snapshots)
 * - Require OWNER role for mutations (checked at API level)
 * - Support dry-run mode (no mutations, only recommendations)
 * - Cap auto-fix amounts (e.g., max $0.50 adjustment)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { toCents, fromCents } = require('./health-audit');

// ═════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═════════════════════════════════════════════════════════════════════════

const AUTOFIX_CONFIG = {
  MAX_LINE_ADJUSTMENT_CENTS: 50,  // Max $0.50 adjustment per line
  ENABLE_DUPLICATE_QUARANTINE: true,
  ENABLE_IMBALANCE_FIX: true,
  ENABLE_FIFO_COST_FIX: true,
  ENABLE_NEGATIVE_QTY_FIX: false  // Too dangerous, manual review required
};

// ═════════════════════════════════════════════════════════════════════════
// AUTO-FIX STRATEGIES
// ═════════════════════════════════════════════════════════════════════════

/**
 * Fix duplicate invoices by quarantining newer duplicates
 */
async function fixDuplicateInvoices(db, duplicates, dryRun = true) {
  const fixes = [];

  for (const dup of duplicates) {
    const fix = {
      type: 'DUP_INVOICE',
      issue: dup,
      action: 'quarantine_duplicate',
      success: false,
      dryRun,
      before: null,
      after: null
    };

    try {
      if (!dryRun && AUTOFIX_CONFIG.ENABLE_DUPLICATE_QUARANTINE) {
        // Get all duplicates for this key
        const sql = `
          SELECT id, invoice_number, vendor, invoice_date, created_at
          FROM documents
          WHERE vendor = ? AND invoice_number = ? AND invoice_date = ?
            AND deleted_at IS NULL
          ORDER BY created_at ASC
        `;

        const rows = await query(db, sql, [dup.vendor, dup.invoice_no, dup.date]);

        if (rows.length > 1) {
          fix.before = { duplicateCount: rows.length };

          // Keep first, quarantine rest
          const toQuarantine = rows.slice(1);

          for (const row of toQuarantine) {
            await run(db, `
              UPDATE documents
              SET deleted_at = CURRENT_TIMESTAMP,
                  notes = COALESCE(notes, '') || ' [AUTO-QUARANTINED: Duplicate of ' || ? || ']'
              WHERE id = ?
            `, [rows[0].id, row.id]);
          }

          fix.after = { quarantinedCount: toQuarantine.length, keptId: rows[0].id };
          fix.success = true;
        }
      } else {
        // Dry run - just recommend
        fix.recommendation = `Quarantine duplicate invoice: ${dup.invoice_no} (vendor: ${dup.vendor})`;
        fix.success = true;
      }
    } catch (error) {
      fix.error = error.message;
    }

    fixes.push(fix);
  }

  return fixes;
}

/**
 * Fix invoice imbalances by adjusting line items (if safe)
 */
async function fixInvoiceImbalances(db, imbalances, dryRun = true) {
  const fixes = [];

  for (const imbalance of imbalances) {
    const fix = {
      type: 'INVOICE_IMBALANCE',
      issue: imbalance,
      action: 'adjust_line_item',
      success: false,
      dryRun,
      before: null,
      after: null
    };

    try {
      const diffCents = imbalance.cents_off;

      // Safety check: only fix if adjustment is small (≤ $0.50)
      if (Math.abs(diffCents) > AUTOFIX_CONFIG.MAX_LINE_ADJUSTMENT_CENTS) {
        fix.recommendation = `Imbalance too large (${fromCents(Math.abs(diffCents))}¢) - manual review required`;
        fixes.push(fix);
        continue;
      }

      if (!dryRun && AUTOFIX_CONFIG.ENABLE_IMBALANCE_FIX) {
        // Get line items
        const linesSql = `
          SELECT id, line_total, quantity
          FROM invoice_line_items
          WHERE invoice_number = ?
          ORDER BY line_total DESC
        `;

        const lines = await query(db, linesSql, [imbalance.invoice_no]);

        if (lines.length === 0) {
          fix.error = 'No line items found';
          fixes.push(fix);
          continue;
        }

        // Find largest line item to adjust
        const targetLine = lines[0];

        fix.before = {
          line_id: targetLine.id,
          original_total: targetLine.line_total,
          diffCents
        };

        // Adjust line item
        const newTotal = toCents(targetLine.line_total) + diffCents;

        await run(db, `
          UPDATE invoice_line_items
          SET line_total = ?,
              notes = COALESCE(notes, '') || ' [AUTO-ADJUSTED: Balance correction ' || ? || '¢]'
          WHERE id = ?
        `, [fromCents(newTotal), diffCents, targetLine.id]);

        fix.after = {
          line_id: targetLine.id,
          new_total: fromCents(newTotal),
          adjustmentCents: diffCents
        };
        fix.success = true;
      } else {
        // Dry run
        fix.recommendation = `Adjust largest line item by ${diffCents}¢ to balance invoice ${imbalance.invoice_no}`;
        fix.success = true;
      }
    } catch (error) {
      fix.error = error.message;
    }

    fixes.push(fix);
  }

  return fixes;
}

/**
 * Fix FIFO layers with bad costs
 */
async function fixFifoBadCosts(db, badCosts, lastInvoiceCosts, dryRun = true) {
  const fixes = [];

  for (const badCost of badCosts) {
    const fix = {
      type: 'FIFO_BAD_COST',
      issue: badCost,
      action: 'set_cost_from_invoice',
      success: false,
      dryRun,
      before: null,
      after: null
    };

    try {
      const lastCost = lastInvoiceCosts[badCost.sku];

      if (!lastCost) {
        fix.recommendation = `No recent invoice cost found for SKU ${badCost.sku} - manual review required`;
        fixes.push(fix);
        continue;
      }

      if (!dryRun && AUTOFIX_CONFIG.ENABLE_FIFO_COST_FIX) {
        fix.before = {
          sku: badCost.sku,
          lot: badCost.lot,
          bad_cost: badCost.cost
        };

        // Update FIFO layer cost
        await run(db, `
          UPDATE inventory
          SET unit_cost = ?,
              notes = COALESCE(notes, '') || ' [AUTO-FIXED: Cost set from recent invoice]'
          WHERE item_code = ? AND lot_number = ?
        `, [fromCents(lastCost), badCost.sku, badCost.lot]);

        fix.after = {
          sku: badCost.sku,
          lot: badCost.lot,
          new_cost: fromCents(lastCost)
        };
        fix.success = true;
      } else {
        // Dry run
        fix.recommendation = `Set cost to ${fromCents(lastCost)} from recent invoice for SKU ${badCost.sku}`;
        fix.success = true;
      }
    } catch (error) {
      fix.error = error.message;
    }

    fixes.push(fix);
  }

  return fixes;
}

/**
 * Fix negative FIFO quantities (set to zero and log)
 */
async function fixNegativeFifoQty(db, negativeQties, dryRun = true) {
  const fixes = [];

  for (const neg of negativeQties) {
    const fix = {
      type: 'FIFO_NEG_QTY',
      issue: neg,
      action: 'zero_out_quantity',
      success: false,
      dryRun,
      before: null,
      after: null,
      recommendation: 'Manual review required - negative quantities indicate data corruption'
    };

    // NOTE: Negative quantities are TOO DANGEROUS to auto-fix
    // Always require manual review
    fixes.push(fix);
  }

  return fixes;
}

// ═════════════════════════════════════════════════════════════════════════
// MAIN AUTO-FIX ORCHESTRATOR
// ═════════════════════════════════════════════════════════════════════════

/**
 * Apply auto-fixes for detected issues
 */
async function applyAutoFixes(db, issues, context = {}, dryRun = true) {
  const allFixes = [];

  // Group issues by type
  const duplicates = issues.filter(i => i.type === 'DUP_INVOICE');
  const imbalances = issues.filter(i => i.type === 'INVOICE_IMBALANCE');
  const badCosts = issues.filter(i => i.type === 'FIFO_BAD_COST');
  const negativeQties = issues.filter(i => i.type === 'FIFO_NEG_QTY');

  // Apply fixes by type
  if (duplicates.length > 0) {
    const fixes = await fixDuplicateInvoices(db, duplicates, dryRun);
    allFixes.push(...fixes);
  }

  if (imbalances.length > 0) {
    const fixes = await fixInvoiceImbalances(db, imbalances, dryRun);
    allFixes.push(...fixes);
  }

  if (badCosts.length > 0) {
    const lastInvoiceCosts = context.lastInvoiceCosts || {};
    const fixes = await fixFifoBadCosts(db, badCosts, lastInvoiceCosts, dryRun);
    allFixes.push(...fixes);
  }

  if (negativeQties.length > 0) {
    const fixes = await fixNegativeFifoQty(db, negativeQties, dryRun);
    allFixes.push(...fixes);
  }

  return allFixes;
}

// ═════════════════════════════════════════════════════════════════════════
// HELPERS
// ═════════════════════════════════════════════════════════════════════════

function query(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

// ═════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═════════════════════════════════════════════════════════════════════════

module.exports = {
  applyAutoFixes,
  fixDuplicateInvoices,
  fixInvoiceImbalances,
  fixFifoBadCosts,
  fixNegativeFifoQty,
  AUTOFIX_CONFIG
};
