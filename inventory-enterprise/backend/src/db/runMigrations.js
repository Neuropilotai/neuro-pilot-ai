/**
 * Safe Migration Runner (v15.2.2)
 * Adds columns only if they don't exist to prevent SQLITE_ERROR
 */

const { logger } = require('../../config/logger');

/**
 * Add issue_* columns to inventory_items if missing
 * @param {Database} db - Database instance
 */
async function runIssueUnitMigration(db) {
  try {
    logger.info('🔄 Checking for issue_* columns migration...');

    // Get current table schema
    const tableInfo = await db.all(`PRAGMA table_info('inventory_items')`);
    const existingColumns = new Set(tableInfo.map(col => col.name));

    logger.info(`📋 Found ${existingColumns.size} columns in inventory_items table`);

    // Check which columns need to be added
    const columnsToAdd = [
      { name: 'issue_unit', type: 'TEXT', default: null },
      { name: 'issue_qty', type: 'REAL', default: 1.0 },
      { name: 'issue_to_base_factor', type: 'REAL', default: 1.0 }
    ];

    let addedCount = 0;

    for (const col of columnsToAdd) {
      if (!existingColumns.has(col.name)) {
        logger.info(`➕ Adding column: ${col.name} (${col.type})`);

        const defaultClause = col.default !== null ? `DEFAULT ${col.default}` : '';
        await db.run(`ALTER TABLE inventory_items ADD COLUMN ${col.name} ${col.type} ${defaultClause}`);

        addedCount++;
      } else {
        logger.debug(`✓ Column ${col.name} already exists`);
      }
    }

    if (addedCount > 0) {
      logger.info(`✅ Added ${addedCount} new columns to inventory_items`);

      // Backfill sensible defaults from existing columns
      logger.info('🔄 Backfilling default values...');

      await db.run(`
        UPDATE inventory_items
        SET issue_unit = COALESCE(issue_unit, unit, 'EA'),
            issue_qty = COALESCE(issue_qty, 1.0),
            issue_to_base_factor = COALESCE(issue_to_base_factor, 1.0)
        WHERE issue_unit IS NULL OR issue_qty IS NULL OR issue_to_base_factor IS NULL
      `);

      const result = await db.get(`
        SELECT COUNT(*) as updated_count
        FROM inventory_items
        WHERE issue_unit IS NOT NULL
      `);

      logger.info(`✅ Backfilled ${result.updated_count} items with issue_* defaults`);
    } else {
      logger.info('✓ No migration needed - all columns already exist');
    }

    logger.info('✅ Issue unit migration complete');
    return { success: true, columnsAdded: addedCount };

  } catch (error) {
    logger.error('❌ Issue unit migration failed:', error);
    // Don't throw - allow server to continue if migration fails
    return { success: false, error: error.message };
  }
}

/**
 * Resolve issue UOM with safe fallbacks
 * @param {Object} row - Database row with item data
 * @returns {Object} { issueUnit, issueQty, factor }
 */
function resolveIssueUom(row) {
  const issueUnit = row.issue_unit || row.unit || row.uom || 'EA';
  const issueQty = Number(row.issue_qty) || 1;
  const factor = Number(row.issue_to_base_factor) || 1;

  return {
    issueUnit,
    issueQty: issueQty || 1,
    factor: factor || 1
  };
}

/**
 * Convert quantity to base units
 * @param {number} qty - Quantity in issue units
 * @param {Object} row - Database row with conversion factors
 * @returns {number} Quantity in base units
 */
function toBaseQty(qty, row) {
  const { factor } = resolveIssueUom(row);
  return qty * factor;
}

module.exports = {
  runIssueUnitMigration,
  resolveIssueUom,
  toBaseQty
};
