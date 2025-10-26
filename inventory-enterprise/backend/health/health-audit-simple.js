/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SIMPLIFIED HEALTH AUDIT - v1.0.0 (Schema-Adapted)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Adapted to work with actual database schema:
 * - Uses processed_invoices + invoice_items (not documents + invoice_line_items)
 * - Uses v_current_inventory (no FIFO tracking)
 * - Uses item_master (not item_bank)
 * - Computes metrics that are actually possible with available data
 *
 * HEALTH CHECKS:
 * ✅ Invoice integrity (duplicate detection, balance validation)
 * ✅ Item coverage (orphan SKUs in invoices)
 * ✅ Stock health (items below par level)
 * ✅ Data quality (missing critical fields)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

const sqlite3 = require('sqlite3');
const path = require('path');

// ═════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═════════════════════════════════════════════════════════════════════════

const CONFIG = {
  DATABASE_PATH: process.env.DATABASE_PATH || path.join(__dirname, '../db/inventory_enterprise.db')
};

// ═════════════════════════════════════════════════════════════════════════
// INTEGER-CENT MATH
// ═════════════════════════════════════════════════════════════════════════

function toCents(value) {
  if (value === null || value === undefined || value === '') return 0;
  const numValue = typeof value === 'string'
    ? parseFloat(value.replace(/[$,]/g, ''))
    : parseFloat(value);
  if (isNaN(numValue)) return 0;
  return Math.round(numValue * 100);
}

function fromCents(cents) {
  return (cents / 100).toFixed(2);
}

// ═════════════════════════════════════════════════════════════════════════
// DATABASE UTILITIES
// ═════════════════════════════════════════════════════════════════════════

function getDb() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(CONFIG.DATABASE_PATH, (err) => {
      if (err) reject(err);
      else resolve(db);
    });
  });
}

function query(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// ═════════════════════════════════════════════════════════════════════════
// DATA LOADERS
// ═════════════════════════════════════════════════════════════════════════

async function loadInvoices(db) {
  const sql = `
    SELECT
      pi.invoice_id,
      pi.invoice_number,
      pi.supplier as vendor,
      pi.invoice_date as date,
      pi.total_amount,
      pi.subtotal,
      pi.tax_amount,
      pi.gst,
      pi.qst
    FROM processed_invoices pi
    ORDER BY pi.invoice_date DESC
  `;

  const invoices = await query(db, sql);

  // Load line items for each invoice
  for (const inv of invoices) {
    const linesSql = `
      SELECT
        ii.item_code as sku,
        ii.item_name as description,
        ii.quantity as qty,
        ii.unit_price,
        ii.total_price as ext_price
      FROM invoice_items ii
      WHERE ii.invoice_id = ?
    `;

    inv.lines = await query(db, linesSql, [inv.invoice_id]);

    // Normalize to cents
    inv.total_cents = toCents(inv.total_amount);
    inv.subtotal_cents = toCents(inv.subtotal);
    inv.tax_cents = toCents(inv.tax_amount || 0) + toCents(inv.gst || 0) + toCents(inv.qst || 0);

    for (const ln of inv.lines) {
      ln.ext_price_cents = toCents(ln.ext_price);
      ln.unit_price_cents = toCents(ln.unit_price);
    }
  }

  return invoices;
}

async function loadItems(db) {
  const sql = `
    SELECT
      im.item_code as sku,
      im.item_name as name,
      im.unit as uom,
      im.category,
      im.par_level,
      im.reorder_point,
      im.unit_cost
    FROM item_master im
    WHERE im.active = 1
  `;

  return await query(db, sql);
}

async function loadCurrentStock(db) {
  const sql = `
    SELECT
      v.item_code as sku,
      v.item_name as name,
      COALESCE(v.current_stock, 0) as qty,
      COALESCE(v.unit_cost, 0) as unit_cost,
      COALESCE(v.par_level, 0) as par_level,
      COALESCE(v.reorder_point, 0) as reorder_point
    FROM v_current_inventory v
    WHERE v.active = 1
  `;

  return await query(db, sql).catch(() => []);
}

// ═════════════════════════════════════════════════════════════════════════
// HEALTH SCORING
// ═════════════════════════════════════════════════════════════════════════

function scoreHealth(metrics) {
  let score = 100;

  // Deduct points for various issues
  score -= Math.min(30, metrics.dupInvoices * 5);      // Duplicates: critical
  score -= Math.min(30, metrics.imbalances * 3);       // Imbalances: high
  score -= Math.min(20, metrics.orphanSkus * 2);       // Orphan SKUs: medium
  score -= Math.min(15, metrics.lowStockItems * 1);    // Low stock: monitor
  score -= Math.min(10, metrics.missingData * 2);      // Data quality: medium

  const finalScore = Math.max(0, Math.round(score));

  let status;
  if (finalScore >= 90) status = 'Healthy';
  else if (finalScore >= 75) status = 'Monitor';
  else status = 'Needs Attention';

  return { score: finalScore, status };
}

// ═════════════════════════════════════════════════════════════════════════
// MAIN AUDIT FUNCTION
// ═════════════════════════════════════════════════════════════════════════

async function runHealthAudit() {
  const db = await getDb();

  try {
    const [invoices, items, stock] = await Promise.all([
      loadInvoices(db),
      loadItems(db),
      loadCurrentStock(db)
    ]);

    const issues = [];

    // ─────────────────────────────────────────────────────────────────────
    // 1) INVOICE INTEGRITY: Duplicates & Balance Validation
    // ─────────────────────────────────────────────────────────────────────

    const invoiceKey = (inv) => `${inv.vendor}#${inv.invoice_number}#${inv.date}`;
    const seen = new Set();
    const deduped = [];

    for (const inv of invoices) {
      const key = invoiceKey(inv);

      // Check for duplicates
      if (seen.has(key)) {
        issues.push({
          type: 'DUP_INVOICE',
          severity: 'high',
          invoice_no: inv.invoice_number,
          vendor: inv.vendor,
          date: inv.date
        });
        continue;
      }

      seen.add(key);

      // Sum line items
      let lineSum = 0;
      for (const ln of inv.lines || []) {
        lineSum += ln.ext_price_cents;
      }

      // Check balance (subtotal should match line items)
      const diff = inv.subtotal_cents - lineSum;

      if (Math.abs(diff) > 2) {
        issues.push({
          type: 'INVOICE_IMBALANCE',
          severity: 'high',
          invoice_no: inv.invoice_number,
          cents_off: diff,
          reported_subtotal: fromCents(inv.subtotal_cents),
          calculated_subtotal: fromCents(lineSum)
        });
      }

      // Check for missing critical data
      if (!inv.invoice_number || !inv.vendor || !inv.date) {
        issues.push({
          type: 'MISSING_DATA',
          severity: 'medium',
          invoice_id: inv.invoice_id,
          missing_fields: [
            !inv.invoice_number && 'invoice_number',
            !inv.vendor && 'vendor',
            !inv.date && 'date'
          ].filter(Boolean)
        });
      }

      deduped.push(inv);
    }

    // ─────────────────────────────────────────────────────────────────────
    // 2) ORPHAN SKUs: Items in invoices not in item_master
    // ─────────────────────────────────────────────────────────────────────

    const itemSet = new Set(items.map(it => it.sku));

    for (const inv of deduped) {
      for (const ln of inv.lines || []) {
        if (ln.sku && !itemSet.has(ln.sku)) {
          issues.push({
            type: 'ORPHAN_SKU',
            severity: 'medium',
            sku: ln.sku,
            invoice_no: inv.invoice_number,
            description: ln.description
          });
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────────
    // 3) STOCK HEALTH: Items below par level
    // ─────────────────────────────────────────────────────────────────────

    const lowStockItems = [];

    for (const item of stock) {
      if (item.par_level > 0 && item.qty < item.par_level) {
        lowStockItems.push({
          sku: item.sku,
          name: item.name,
          current_stock: item.qty,
          par_level: item.par_level,
          shortage: item.par_level - item.qty
        });

        issues.push({
          type: 'LOW_STOCK',
          severity: 'low',
          sku: item.sku,
          name: item.name,
          current: item.qty,
          par: item.par_level
        });
      }
    }

    // ─────────────────────────────────────────────────────────────────────
    // 4) HEALTH SCORING
    // ─────────────────────────────────────────────────────────────────────

    const health = scoreHealth({
      dupInvoices: issues.filter(i => i.type === 'DUP_INVOICE').length,
      imbalances: issues.filter(i => i.type === 'INVOICE_IMBALANCE').length,
      orphanSkus: issues.filter(i => i.type === 'ORPHAN_SKU').length,
      lowStockItems: issues.filter(i => i.type === 'LOW_STOCK').length,
      missingData: issues.filter(i => i.type === 'MISSING_DATA').length
    });

    return {
      summary: {
        health_score: health.score,
        status: health.status,
        total_invoices: deduped.length,
        total_items: items.length,
        items_in_stock: stock.length,
        low_stock_count: lowStockItems.length,
        total_issues: issues.length,
        audit_date: new Date().toISOString().slice(0, 10)
      },
      issues,
      lowStockItems,
      metrics: {
        invoices: {
          total: invoices.length,
          duplicates: issues.filter(i => i.type === 'DUP_INVOICE').length,
          imbalances: issues.filter(i => i.type === 'INVOICE_IMBALANCE').length
        },
        items: {
          total: items.length,
          in_stock: stock.length,
          below_par: lowStockItems.length
        },
        data_quality: {
          missing_data: issues.filter(i => i.type === 'MISSING_DATA').length,
          orphan_skus: issues.filter(i => i.type === 'ORPHAN_SKU').length
        }
      }
    };

  } finally {
    db.close();
  }
}

// ═════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═════════════════════════════════════════════════════════════════════════

module.exports = {
  runHealthAudit,
  toCents,
  fromCents,
  scoreHealth,
  CONFIG
};
