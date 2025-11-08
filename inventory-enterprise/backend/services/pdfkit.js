/**
 * PDF Generation Service
 * Generates various PDF reports using jsPDF-like structure
 * Returns PDF buffer for download/streaming
 */

const db = require('../config/database');
const { computeRecipeCost } = require('./costing');

/**
 * Generate Count Sheet PDF
 * @param {number} org_id
 * @param {number} site_id
 * @param {string} date
 * @returns {Promise<{content: string, filename: string}>}
 */
async function generateCountSheet(org_id, site_id, date) {
  // Get all active items for the org
  const itemsQuery = await db.query(`
    SELECT sku, name, category, uom, reorder_min, par_level
    FROM items
    WHERE active = true
    ORDER BY category, name
  `);

  const items = itemsQuery.rows;

  // Simple text-based PDF (in production, use PDFKit or jsPDF on server)
  const lines = [];
  lines.push('═══════════════════════════════════════════════════');
  lines.push(`          INVENTORY COUNT SHEET`);
  lines.push(`          Date: ${date}`);
  lines.push(`          Site: ${site_id || 'All Sites'}`);
  lines.push('═══════════════════════════════════════════════════');
  lines.push('');
  lines.push('SKU          | Name                  | UOM  | Count | Notes');
  lines.push('─────────────────────────────────────────────────────────────');

  for (const item of items) {
    const sku = item.sku.padEnd(12);
    const name = item.name.substring(0, 20).padEnd(20);
    const uom = (item.uom || 'ea').padEnd(4);
    lines.push(`${sku} | ${name} | ${uom} | _____ | _____________`);
  }

  lines.push('');
  lines.push('═══════════════════════════════════════════════════');
  lines.push(`Total Items: ${items.length}`);
  lines.push('');
  lines.push('Counted by: ________________  Date: __________');
  lines.push('Verified by: _______________  Date: __________');

  return {
    content: lines.join('\n'),
    filename: `count_sheet_${date}.txt`
  };
}

/**
 * Generate Menu Pack PDF (week menu with recipes and costs)
 * @param {number} org_id
 * @param {number} week
 * @param {string} atDate
 * @returns {Promise<{content: string, filename: string}>}
 */
async function generateMenuPack(org_id, week, atDate) {
  const lines = [];
  lines.push('═══════════════════════════════════════════════════');
  lines.push(`          MENU PACK - WEEK ${week}`);
  lines.push(`          Costed as of: ${atDate}`);
  lines.push('═══════════════════════════════════════════════════');
  lines.push('');

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const services = ['breakfast', 'lunch', 'dinner'];

  for (let dayIndex = 1; dayIndex <= 7; dayIndex++) {
    lines.push(`\n${days[dayIndex - 1].toUpperCase()}`);
    lines.push('─────────────────────────────────────────────────────');

    for (const service of services) {
      // Get menu for this day/service
      const menuQuery = await db.query(`
        SELECT m.id, m.label
        FROM menus m
        WHERE m.org_id = $1 AND m.cycle_week = $2 AND m.day_of_week = $3 AND m.service = $4
      `, [org_id, week, dayIndex, service]);

      if (menuQuery.rows.length > 0) {
        const menu = menuQuery.rows[0];
        lines.push(`\n  ${service.toUpperCase()}:`);

        // Get recipes for this menu
        const recipesQuery = await db.query(`
          SELECT mr.recipe_code, mr.target_portions, r.name
          FROM menu_recipes mr
          JOIN recipes r ON mr.recipe_code = r.code AND r.org_id = $1
          WHERE mr.menu_id = $2
        `, [org_id, menu.id]);

        for (const recipe of recipesQuery.rows) {
          lines.push(`    • ${recipe.name} (${recipe.target_portions} portions)`);
        }
      }
    }
  }

  lines.push('\n═══════════════════════════════════════════════════');

  return {
    content: lines.join('\n'),
    filename: `menu_week${week}_${atDate}.txt`
  };
}

/**
 * Generate Waste Summary PDF
 * @param {number} org_id
 * @param {string} from
 * @param {string} to
 * @returns {Promise<{content: string, filename: string}>}
 */
async function generateWasteSummary(org_id, from, to) {
  const lines = [];
  lines.push('═══════════════════════════════════════════════════');
  lines.push(`          WASTE SUMMARY REPORT`);
  lines.push(`          Period: ${from} to ${to}`);
  lines.push('═══════════════════════════════════════════════════');
  lines.push('');

  // Total waste cost
  const totalQuery = await db.query(`
    SELECT
      COUNT(*) as event_count,
      SUM(cost_at_event) as total_cost,
      SUM(qty) as total_qty
    FROM waste_events
    WHERE org_id = $1 AND ts >= $2 AND ts <= $3
  `, [org_id, from, to + ' 23:59:59']);

  const totals = totalQuery.rows[0];
  lines.push(`Total Events: ${totals.event_count}`);
  lines.push(`Total Cost: $${parseFloat(totals.total_cost || 0).toFixed(2)}`);
  lines.push(`Total Qty: ${parseFloat(totals.total_qty || 0).toFixed(2)}`);
  lines.push('');

  // By reason
  lines.push('COST BY REASON:');
  lines.push('─────────────────────────────────────────────────────');
  const reasonQuery = await db.query(`
    SELECT
      reason,
      COUNT(*) as count,
      SUM(cost_at_event) as cost,
      SUM(qty) as qty
    FROM waste_events
    WHERE org_id = $1 AND ts >= $2 AND ts <= $3
    GROUP BY reason
    ORDER BY cost DESC
  `, [org_id, from, to + ' 23:59:59']);

  for (const row of reasonQuery.rows) {
    const cost = parseFloat(row.cost || 0).toFixed(2);
    lines.push(`  ${row.reason.padEnd(20)} | $${cost.padStart(10)} | ${row.count} events`);
  }

  lines.push('');
  lines.push('TOP WASTED ITEMS:');
  lines.push('─────────────────────────────────────────────────────');
  const itemQuery = await db.query(`
    SELECT
      COALESCE(item_sku, recipe_code) as item,
      COUNT(*) as count,
      SUM(cost_at_event) as cost,
      SUM(qty) as qty
    FROM waste_events
    WHERE org_id = $1 AND ts >= $2 AND ts <= $3
    GROUP BY COALESCE(item_sku, recipe_code)
    ORDER BY cost DESC
    LIMIT 10
  `, [org_id, from, to + ' 23:59:59']);

  for (const row of itemQuery.rows) {
    const cost = parseFloat(row.cost || 0).toFixed(2);
    lines.push(`  ${row.item.padEnd(20)} | $${cost.padStart(10)} | ${parseFloat(row.qty).toFixed(2)} units`);
  }

  lines.push('\n═══════════════════════════════════════════════════');

  return {
    content: lines.join('\n'),
    filename: `waste_summary_${from}_${to}.txt`
  };
}

/**
 * Generate Daily Ops Sheet
 * @param {number} org_id
 * @param {string} date
 * @returns {Promise<{content: string, filename: string}>}
 */
async function generateDailyOps(org_id, date) {
  const lines = [];
  lines.push('═══════════════════════════════════════════════════');
  lines.push(`          DAILY OPERATIONS SHEET`);
  lines.push(`          Date: ${date}`);
  lines.push('═══════════════════════════════════════════════════');
  lines.push('');

  // Get population for the day
  const popQuery = await db.query(`
    SELECT breakfast, lunch, dinner FROM population
    WHERE org_id = $1 AND date = $2
  `, [org_id, date]);

  if (popQuery.rows.length > 0) {
    const pop = popQuery.rows[0];
    lines.push('EXPECTED HEADCOUNT:');
    lines.push(`  Breakfast: ${pop.breakfast}`);
    lines.push(`  Lunch: ${pop.lunch}`);
    lines.push(`  Dinner: ${pop.dinner}`);
    lines.push('');
  }

  lines.push('PREP CHECKLIST:');
  lines.push('─────────────────────────────────────────────────────');
  lines.push('☐ Verify inventory counts');
  lines.push('☐ Check receiving log');
  lines.push('☐ Review menu for the day');
  lines.push('☐ Prep ingredients (see recipe cards)');
  lines.push('☐ Check equipment status');
  lines.push('☐ Review temperature logs');
  lines.push('');

  lines.push('NOTES:');
  lines.push('─────────────────────────────────────────────────────');
  lines.push('');
  lines.push('__________________________________________________');
  lines.push('__________________________________________________');
  lines.push('__________________________________________________');

  lines.push('\n═══════════════════════════════════════════════════');

  return {
    content: lines.join('\n'),
    filename: `daily_ops_${date}.txt`
  };
}

/**
 * Main PDF generation dispatcher
 * @param {string} type - PDF type (count|menu|waste|ops|nutrition)
 * @param {object} params - Generation parameters
 * @returns {Promise<{content: string, filename: string}>}
 */
async function generatePDF(type, params) {
  switch (type) {
    case 'count':
      return generateCountSheet(params.org_id, params.site_id, params.date);
    case 'menu':
      return generateMenuPack(params.org_id, params.week, params.at);
    case 'waste':
      return generateWasteSummary(params.org_id, params.from, params.to);
    case 'ops':
      return generateDailyOps(params.org_id, params.date);
    case 'nutrition':
      // Placeholder for future nutrition facts PDF
      return {
        content: 'Nutrition facts PDF - coming soon',
        filename: 'nutrition.txt'
      };
    default:
      throw new Error(`Unknown PDF type: ${type}`);
  }
}

module.exports = {
  generatePDF,
  generateCountSheet,
  generateMenuPack,
  generateWasteSummary,
  generateDailyOps
};
