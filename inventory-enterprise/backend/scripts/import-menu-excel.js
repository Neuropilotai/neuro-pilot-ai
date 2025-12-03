#!/usr/bin/env node
/**
 * Menu Excel Importer - v23.0
 * Parses 4-week menu Excel file and populates menu_cycle_days/items tables
 *
 * Usage:
 *   node scripts/import-menu-excel.js <path-to-excel>
 *   node scripts/import-menu-excel.js /path/to/Proposed\ Menu.xlsx
 *
 * Excel Structure Expected:
 * - Sheets: "Week 1", "Week 2", "Week 3", "Week 4"
 * - Row 3: Day headers (Wednesday, Thursday, Friday, Saturday, Sunday, Monday, Tuesday)
 * - Rows 4-11: Western cuisine items
 * - Row 12: "HEALTHY OPTION" header
 * - Row 13: Healthy protein option
 * - Row 14: "South Asian Cuisine" header
 * - Rows 15-18: South Asian items
 */

const XLSX = require('xlsx');
const crypto = require('crypto');
const path = require('path');

// Database connection
let pool;

// Day mapping (Excel columns to day_of_week)
const DAY_MAP = {
  0: { day_of_week: 0, name: 'Wednesday' },
  1: { day_of_week: 1, name: 'Thursday' },
  2: { day_of_week: 2, name: 'Friday' },
  3: { day_of_week: 3, name: 'Saturday' },
  4: { day_of_week: 4, name: 'Sunday' },
  5: { day_of_week: 5, name: 'Monday' },
  6: { day_of_week: 6, name: 'Tuesday' }
};

// Row classification for station assignment
const ROW_STATIONS = {
  4: 'WESTERN_MAIN',
  5: 'WESTERN_MAIN',
  6: 'WESTERN_SIDE',
  7: 'WESTERN_SIDE',
  8: 'WESTERN_SIDE',
  9: 'VEGETABLES',
  10: 'FRIES',
  11: 'SALAD',
  13: 'HEALTHY',
  15: 'SOUTH_ASIAN_MAIN',
  16: 'SOUTH_ASIAN_MAIN',
  17: 'SOUTH_ASIAN_SIDE',
  18: 'RICE'
};

async function initDatabase() {
  // Try to use the existing db module
  try {
    const db = require('../db');
    pool = db.pool;
    console.log('[MenuImport] Using existing database connection');
    return;
  } catch (e) {
    // Fallback to direct connection
    const { Pool } = require('pg');
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      throw new Error('DATABASE_URL not set');
    }
    pool = new Pool({
      connectionString: dbUrl,
      ssl: dbUrl.includes('railway') ? { rejectUnauthorized: false } : false
    });
    console.log('[MenuImport] Created new database connection');
  }
}

async function getStationMap(orgId) {
  const result = await pool.query(
    'SELECT id, code FROM menu_stations WHERE org_id = $1',
    [orgId]
  );
  const map = {};
  result.rows.forEach(row => {
    map[row.code] = row.id;
  });
  return map;
}

async function getOrCreateCycleDay(orgId, cycleWeek, dayOfWeek, dayName, mealPeriod = 'dinner') {
  // Try to find existing
  const existing = await pool.query(
    `SELECT id FROM menu_cycle_days
     WHERE org_id = $1 AND cycle_week = $2 AND day_of_week = $3 AND meal_period = $4`,
    [orgId, cycleWeek, dayOfWeek, mealPeriod]
  );

  if (existing.rows.length > 0) {
    return existing.rows[0].id;
  }

  // Create new
  const insert = await pool.query(
    `INSERT INTO menu_cycle_days (org_id, cycle_week, day_of_week, day_name, meal_period)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [orgId, cycleWeek, dayOfWeek, dayName, mealPeriod]
  );
  return insert.rows[0].id;
}

async function insertMenuItem(orgId, cycleDayId, stationId, itemName, row, col, batchId, displayOrder) {
  if (!itemName || itemName.trim() === '') return null;

  const normalized = itemName.trim().toLowerCase().replace(/\s+/g, ' ');

  const result = await pool.query(
    `INSERT INTO menu_cycle_items
     (org_id, cycle_day_id, station_id, item_name, item_name_normalized, excel_row, excel_col, import_batch_id, display_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [orgId, cycleDayId, stationId, itemName.trim(), normalized, row, col, batchId, displayOrder]
  );
  return result.rows[0].id;
}

async function parseWeekSheet(workbook, sheetName, cycleWeek, orgId, stationMap, batchId) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    console.log(`[MenuImport] Sheet "${sheetName}" not found, skipping`);
    return { imported: 0, skipped: 0 };
  }

  const json = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  console.log(`[MenuImport] Processing ${sheetName} (${json.length} rows)`);

  let imported = 0;
  let skipped = 0;

  // Process each column (day)
  for (let colIdx = 0; colIdx < 7; colIdx++) {
    const dayInfo = DAY_MAP[colIdx];
    const cycleDayId = await getOrCreateCycleDay(orgId, cycleWeek, dayInfo.day_of_week, dayInfo.name, 'dinner');

    let displayOrder = 0;

    // Process each row for this column
    for (const [rowNum, stationCode] of Object.entries(ROW_STATIONS)) {
      const rowIdx = parseInt(rowNum);
      if (rowIdx >= json.length) continue;

      const row = json[rowIdx];
      const cellValue = row[colIdx];

      if (cellValue && typeof cellValue === 'string' && cellValue.trim() !== '') {
        const stationId = stationMap[stationCode];
        if (!stationId) {
          console.log(`[MenuImport] Station ${stationCode} not found in map`);
          skipped++;
          continue;
        }

        const itemId = await insertMenuItem(
          orgId,
          cycleDayId,
          stationId,
          cellValue,
          rowIdx,
          colIdx,
          batchId,
          displayOrder++
        );

        if (itemId) {
          imported++;
        } else {
          skipped++;
        }
      }
    }
  }

  return { imported, skipped };
}

async function createImportLog(orgId, batchId, fileName) {
  await pool.query(
    `INSERT INTO menu_import_log (org_id, batch_id, file_name, status)
     VALUES ($1, $2, $3, 'processing')`,
    [orgId, batchId, fileName]
  );
}

async function updateImportLog(batchId, imported, skipped, status, errors = []) {
  await pool.query(
    `UPDATE menu_import_log
     SET items_imported = $2, items_skipped = $3, status = $4, errors = $5, completed_at = CURRENT_TIMESTAMP
     WHERE batch_id = $1`,
    [batchId, imported, skipped, status, JSON.stringify(errors)]
  );
}

async function clearPreviousImport(orgId, batchId) {
  // Delete items from this batch (if re-running)
  const result = await pool.query(
    `DELETE FROM menu_cycle_items WHERE org_id = $1 AND import_batch_id = $2`,
    [orgId, batchId]
  );
  return result.rowCount;
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: node import-menu-excel.js <path-to-excel>');
    process.exit(1);
  }

  console.log('[MenuImport] Starting menu import...');
  console.log('[MenuImport] File:', filePath);

  // Initialize database
  await initDatabase();

  // Generate batch ID from file hash
  const fileBuffer = require('fs').readFileSync(filePath);
  const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex').substring(0, 16);
  const batchId = `MENU-${Date.now()}-${fileHash}`;
  const fileName = path.basename(filePath);
  const orgId = 'default-org';

  console.log('[MenuImport] Batch ID:', batchId);

  // Read Excel file
  const workbook = XLSX.readFile(filePath);
  console.log('[MenuImport] Sheets found:', workbook.SheetNames);

  // Get station map
  const stationMap = await getStationMap(orgId);
  console.log('[MenuImport] Station map:', Object.keys(stationMap));

  if (Object.keys(stationMap).length === 0) {
    console.error('[MenuImport] No stations found! Run migration 030 first.');
    process.exit(1);
  }

  // Create import log
  await createImportLog(orgId, batchId, fileName);

  let totalImported = 0;
  let totalSkipped = 0;
  const errors = [];

  // Process each week
  for (let week = 1; week <= 4; week++) {
    const sheetName = `Week ${week}`;
    try {
      const result = await parseWeekSheet(workbook, sheetName, week, orgId, stationMap, batchId);
      totalImported += result.imported;
      totalSkipped += result.skipped;
      console.log(`[MenuImport] ${sheetName}: ${result.imported} items imported, ${result.skipped} skipped`);
    } catch (err) {
      console.error(`[MenuImport] Error processing ${sheetName}:`, err.message);
      errors.push({ week, error: err.message });
    }
  }

  // Update import log
  const status = errors.length > 0 ? 'completed_with_errors' : 'completed';
  await updateImportLog(batchId, totalImported, totalSkipped, status, errors);

  console.log('[MenuImport] =========================================');
  console.log('[MenuImport] Import Complete!');
  console.log('[MenuImport] Total Items Imported:', totalImported);
  console.log('[MenuImport] Total Items Skipped:', totalSkipped);
  console.log('[MenuImport] Errors:', errors.length);
  console.log('[MenuImport] Batch ID:', batchId);
  console.log('[MenuImport] =========================================');

  // Verify by querying the view
  try {
    const verify = await pool.query(
      `SELECT cycle_week, COUNT(*) as item_count
       FROM menu_cycle_view
       WHERE org_id = $1
       GROUP BY cycle_week
       ORDER BY cycle_week`,
      [orgId]
    );
    console.log('[MenuImport] Verification by week:');
    verify.rows.forEach(row => {
      console.log(`  Week ${row.cycle_week}: ${row.item_count} items`);
    });
  } catch (err) {
    console.log('[MenuImport] View query failed (view may not exist yet):', err.message);
  }

  process.exit(0);
}

main().catch(err => {
  console.error('[MenuImport] Fatal error:', err);
  process.exit(1);
});
