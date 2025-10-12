/**
 * Load Fiscal Calendar Data for FY25 and FY26
 * Based on Sodexo Calendar FY25 Final.docx and Calendar FY26 Final.docx
 *
 * Structure:
 * - FY25: September 2024 - August 2025 (12 calendar months)
 * - FY26: September 2025 - August 2026 (12 calendar months)
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../data/enterprise_inventory.db');
const db = new sqlite3.Database(dbPath);

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

// FY25 Data (Sept 2024 - Aug 2025)
const FY25_PERIODS = [
  { period: 1, name: 'September', month: 9, year: 2024, start: '2024-09-01', end: '2024-09-30', countStart: '2024-09-27', countEnd: '2024-09-30', bd1: '2024-10-01' },
  { period: 2, name: 'October', month: 10, year: 2024, start: '2024-10-01', end: '2024-10-31', countStart: '2024-10-28', countEnd: '2024-10-31', bd1: '2024-11-01' },
  { period: 3, name: 'November', month: 11, year: 2024, start: '2024-11-01', end: '2024-11-30', countStart: '2024-11-27', countEnd: '2024-11-30', bd1: '2024-12-02' },
  { period: 4, name: 'December', month: 12, year: 2024, start: '2024-12-01', end: '2024-12-31', countStart: '2024-12-28', countEnd: '2024-12-31', bd1: '2025-01-02' },
  { period: 5, name: 'January', month: 1, year: 2025, start: '2025-01-01', end: '2025-01-31', countStart: '2025-01-28', countEnd: '2025-01-31', bd1: '2025-02-03' },
  { period: 6, name: 'February', month: 2, year: 2025, start: '2025-02-01', end: '2025-02-28', countStart: '2025-02-28', countEnd: '2025-02-28', bd1: '2025-03-03', countType: 'FULL_PHYSICAL' },
  { period: 7, name: 'March', month: 3, year: 2025, start: '2025-03-01', end: '2025-03-31', countStart: '2025-03-28', countEnd: '2025-03-31', bd1: '2025-04-01' },
  { period: 8, name: 'April', month: 4, year: 2025, start: '2025-04-01', end: '2025-04-30', countStart: '2025-04-27', countEnd: '2025-04-30', bd1: '2025-05-01' },
  { period: 9, name: 'May', month: 5, year: 2025, start: '2025-05-01', end: '2025-05-31', countStart: '2025-05-28', countEnd: '2025-05-31', bd1: '2025-06-02' },
  { period: 10, name: 'June', month: 6, year: 2025, start: '2025-06-01', end: '2025-06-30', countStart: '2025-06-27', countEnd: '2025-06-30', bd1: '2025-07-01' },
  { period: 11, name: 'July', month: 7, year: 2025, start: '2025-07-01', end: '2025-07-31', countStart: '2025-07-28', countEnd: '2025-07-31', bd1: '2025-08-01' },
  { period: 12, name: 'August', month: 8, year: 2025, start: '2025-08-01', end: '2025-08-31', countStart: '2025-08-31', countEnd: '2025-08-31', bd1: '2025-09-01', countType: 'FULL_PHYSICAL' }
];

// FY26 Data (Sept 2025 - Aug 2026)
const FY26_PERIODS = [
  { period: 1, name: 'September', month: 9, year: 2025, start: '2025-09-01', end: '2025-09-30', countStart: '2025-09-27', countEnd: '2025-09-30', bd1: '2025-10-01' },
  { period: 2, name: 'October', month: 10, year: 2025, start: '2025-10-01', end: '2025-10-31', countStart: '2025-10-28', countEnd: '2025-10-31', bd1: '2025-11-03' },
  { period: 3, name: 'November', month: 11, year: 2025, start: '2025-11-01', end: '2025-11-30', countStart: '2025-11-27', countEnd: '2025-11-30', bd1: '2025-12-01' },
  { period: 4, name: 'December', month: 12, year: 2025, start: '2025-12-01', end: '2025-12-31', countStart: '2025-12-28', countEnd: '2025-12-31', bd1: '2026-01-02' },
  { period: 5, name: 'January', month: 1, year: 2026, start: '2026-01-01', end: '2026-01-31', countStart: '2026-01-28', countEnd: '2026-01-31', bd1: '2026-02-02' },
  { period: 6, name: 'February', month: 2, year: 2026, start: '2026-02-01', end: '2026-02-28', countStart: '2026-02-28', countEnd: '2026-02-28', bd1: '2026-03-02', countType: 'FULL_PHYSICAL' },
  { period: 7, name: 'March', month: 3, year: 2026, start: '2026-03-01', end: '2026-03-31', countStart: '2026-03-28', countEnd: '2026-03-31', bd1: '2026-04-01' },
  { period: 8, name: 'April', month: 4, year: 2026, start: '2026-04-01', end: '2026-04-30', countStart: '2026-04-27', countEnd: '2026-04-30', bd1: '2026-05-01' },
  { period: 9, name: 'May', month: 5, year: 2026, start: '2026-05-01', end: '2026-05-31', countStart: '2026-05-28', countEnd: '2026-05-31', bd1: '2026-06-01' },
  { period: 10, name: 'June', month: 6, year: 2026, start: '2026-06-01', end: '2026-06-30', countStart: '2026-06-27', countEnd: '2026-06-30', bd1: '2026-07-01' },
  { period: 11, name: 'July', month: 7, year: 2026, start: '2026-07-01', end: '2026-07-31', countStart: '2026-07-28', countEnd: '2026-07-31', bd1: '2026-08-03' },
  { period: 12, name: 'August', month: 8, year: 2026, start: '2026-08-01', end: '2026-08-31', countStart: '2026-08-31', countEnd: '2026-08-31', bd1: '2026-09-01', countType: 'FULL_PHYSICAL' }
];

function addBusinessDays(dateStr, days) {
  const date = new Date(dateStr + 'T00:00:00');
  let addedDays = 0;

  while (addedDays < days) {
    date.setDate(date.getDate() + 1);
    const dayOfWeek = date.getDay();
    // Skip weekends (0 = Sunday, 6 = Saturday)
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      addedDays++;
    }
  }

  return date.toISOString().split('T')[0];
}

async function main() {
  console.log('🗓️  Loading Fiscal Calendar Data for FY25 and FY26...\n');

  try {
    // Step 1: Clear existing data
    console.log('🧹 Clearing existing fiscal data...');
    await dbRun('DELETE FROM inventory_count_schedule');
    await dbRun('DELETE FROM fiscal_month_close_schedule');
    await dbRun('DELETE FROM fiscal_weeks');
    await dbRun('DELETE FROM fiscal_periods');
    await dbRun('DELETE FROM fiscal_years');
    console.log('✅ Cleared existing data\n');

    // Step 2: Insert Fiscal Years
    console.log('📅 Creating fiscal years...');
    // Check if fiscal_years has fiscal_year_id or just fiscal_year column
    await dbRun(`
      INSERT INTO fiscal_years (fiscal_year_id, fiscal_year_number, start_date, end_date, status)
      VALUES ('FY25', 25, '2024-09-01', '2025-08-31', 'ACTIVE')
    `).catch(async () => {
      // Fallback to old schema
      await dbRun(`
        INSERT INTO fiscal_years (fiscal_year, year_start_date, year_end_date, is_active, notes)
        VALUES (2025, '2024-09-01', '2025-08-31', 1, 'FY25 - Sodexo Fiscal Year')
      `);
    });

    await dbRun(`
      INSERT INTO fiscal_years (fiscal_year_id, fiscal_year_number, start_date, end_date, status)
      VALUES ('FY26', 26, '2025-09-01', '2026-08-31', 'ACTIVE')
    `).catch(async () => {
      // Fallback to old schema
      await dbRun(`
        INSERT INTO fiscal_years (fiscal_year, year_start_date, year_end_date, is_active, notes)
        VALUES (2026, '2025-09-01', '2026-08-31', 1, 'FY26 - Sodexo Fiscal Year')
      `);
    });
    console.log('✅ Created FY25 and FY26\n');

    // Step 3: Insert FY25 Periods
    console.log('📊 Loading FY25 periods (Sept 2024 - Aug 2025)...');
    for (const p of FY25_PERIODS) {
      const periodId = `FY25-P${p.period.toString().padStart(2, '0')}`;
      await dbRun(`
        INSERT INTO fiscal_periods (
          fiscal_year, period, period_start_date, period_end_date,
          business_days, is_closed, notes, fiscal_year_id
        ) VALUES (?, ?, ?, ?, 20, 0, ?, ?)
      `, [2025, p.period, p.start, p.end, `${p.name} ${p.year}`, 'FY25']);
    }
    console.log('✅ Loaded 12 FY25 periods\n');

    // Step 4: Insert FY26 Periods
    console.log('📊 Loading FY26 periods (Sept 2025 - Aug 2026)...');
    for (const p of FY26_PERIODS) {
      const periodId = `FY26-P${p.period.toString().padStart(2, '0')}`;
      await dbRun(`
        INSERT INTO fiscal_periods (
          fiscal_year, period, period_start_date, period_end_date,
          business_days, is_closed, notes, fiscal_year_id
        ) VALUES (?, ?, ?, ?, 20, 0, ?, ?)
      `, [2026, p.period, p.start, p.end, `${p.name} ${p.year}`, 'FY26']);
    }
    console.log('✅ Loaded 12 FY26 periods\n');

    // Step 5: Insert Month-End Close Schedule for FY25
    console.log('📋 Loading FY25 month-end close schedule...');
    for (const p of FY25_PERIODS) {
      const periodId = `FY25-P${p.period.toString().padStart(2, '0')}`;
      const bd1 = p.bd1;
      const bd2 = addBusinessDays(bd1, 1);
      const bd3 = addBusinessDays(bd1, 2);
      const bd4 = addBusinessDays(bd1, 3);
      const bd5 = addBusinessDays(bd1, 4);

      await dbRun(`
        INSERT INTO fiscal_month_close_schedule (
          close_schedule_id, period_id, fiscal_year_id, period_end_date,
          bd1_date, bd1_deadline, bd2_date, bd2_deadline,
          bd3_date, bd3_deadline, bd4_date, bd4_deadline, bd5_date,
          status
        ) VALUES (?, ?, ?, ?, ?, '23:45', ?, '17:00', ?, '20:00', ?, '14:00', ?, 'SCHEDULED')
      `, [
        `${periodId}-CLOSE`,
        periodId, 'FY25', p.end,
        bd1, bd2, bd3, bd4, bd5
      ]);
    }
    console.log('✅ Loaded FY25 close schedule\n');

    // Step 6: Insert Month-End Close Schedule for FY26
    console.log('📋 Loading FY26 month-end close schedule...');
    for (const p of FY26_PERIODS) {
      const periodId = `FY26-P${p.period.toString().padStart(2, '0')}`;
      const bd1 = p.bd1;
      const bd2 = addBusinessDays(bd1, 1);
      const bd3 = addBusinessDays(bd1, 2);
      const bd4 = addBusinessDays(bd1, 3);
      const bd5 = addBusinessDays(bd1, 4);

      await dbRun(`
        INSERT INTO fiscal_month_close_schedule (
          close_schedule_id, period_id, fiscal_year_id, period_end_date,
          bd1_date, bd1_deadline, bd2_date, bd2_deadline,
          bd3_date, bd3_deadline, bd4_date, bd4_deadline, bd5_date,
          status
        ) VALUES (?, ?, ?, ?, ?, '23:45', ?, '17:00', ?, '20:00', ?, '14:00', ?, 'SCHEDULED')
      `, [
        `${periodId}-CLOSE`,
        periodId, 'FY26', p.end,
        bd1, bd2, bd3, bd4, bd5
      ]);
    }
    console.log('✅ Loaded FY26 close schedule\n');

    // Step 7: Insert Inventory Count Schedule for FY25
    console.log('📦 Loading FY25 inventory count schedule...');
    for (const p of FY25_PERIODS) {
      const periodId = `FY25-P${p.period.toString().padStart(2, '0')}`;
      const countType = p.countType || 'MONTHLY_WINDOW';
      const notes = countType === 'FULL_PHYSICAL'
        ? 'Full physical inventory count required'
        : 'Monthly count window';

      await dbRun(`
        INSERT INTO inventory_count_schedule (
          count_schedule_id, period_id, fiscal_year_id, count_type,
          count_window_start, count_window_end,
          transmission_due_date, transmission_deadline,
          is_required, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, '23:45', 1, ?)
      `, [
        `${periodId}-COUNT`,
        periodId, 'FY25', countType,
        p.countStart, p.countEnd, p.bd1, notes
      ]);
    }
    console.log('✅ Loaded FY25 count schedule\n');

    // Step 8: Insert Inventory Count Schedule for FY26
    console.log('📦 Loading FY26 inventory count schedule...');
    for (const p of FY26_PERIODS) {
      const periodId = `FY26-P${p.period.toString().padStart(2, '0')}`;
      const countType = p.countType || 'MONTHLY_WINDOW';
      const notes = countType === 'FULL_PHYSICAL'
        ? 'Full physical inventory count required'
        : 'Monthly count window';

      await dbRun(`
        INSERT INTO inventory_count_schedule (
          count_schedule_id, period_id, fiscal_year_id, count_type,
          count_window_start, count_window_end,
          transmission_due_date, transmission_deadline,
          is_required, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, '23:45', 1, ?)
      `, [
        `${periodId}-COUNT`,
        periodId, 'FY26', countType,
        p.countStart, p.countEnd, p.bd1, notes
      ]);
    }
    console.log('✅ Loaded FY26 count schedule\n');

    // Step 9: Summary
    console.log('═══════════════════════════════════════════════════');
    console.log('📊 FISCAL CALENDAR LOAD COMPLETE');
    console.log('═══════════════════════════════════════════════════');
    console.log('');
    console.log('✅ FY25 (Sept 2024 - Aug 2025):');
    console.log('   • 12 calendar month periods');
    console.log('   • 12 month-end close schedules');
    console.log('   • 12 inventory count windows');
    console.log('   • 2 full physical counts (February & August)');
    console.log('');
    console.log('✅ FY26 (Sept 2025 - Aug 2026):');
    console.log('   • 12 calendar month periods');
    console.log('   • 12 month-end close schedules');
    console.log('   • 12 inventory count windows');
    console.log('   • 2 full physical counts (February & August)');
    console.log('');
    console.log('🎯 Your system is now aligned with Sodexo fiscal calendar!');
    console.log('');

  } catch (error) {
    console.error('❌ Error:', error);
    console.error(error.stack);
  } finally {
    db.close();
  }
}

main();
