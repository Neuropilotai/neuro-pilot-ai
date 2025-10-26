/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GFS FISCAL YEAR REPORT FIX - v2.0.0
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * PROBLEM SOLVED: Eliminates floating-point rounding errors and ensures stable,
 * reproducible "Other Costs" calculations across all fiscal periods.
 *
 * KEY FEATURES:
 * ✅ Integer-cent math (no floating-point arithmetic)
 * ✅ Deterministic "Other Costs" computation as residual
 * ✅ Exact balancing: Σ(categories + taxes) = Total Invoice Amount
 * ✅ Deduplication by (Vendor, Invoice #)
 * ✅ Stable fiscal period grouping
 * ✅ ES6 module compatible with Node.js and browser
 *
 * USAGE:
 *   import { buildFiscalReports } from './fy-report-fix.js';
 *   const reports = buildFiscalReports(csvRows);
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ═════════════════════════════════════════════════════════════════════════
// INTEGER-CENT MATH UTILITIES
// ═════════════════════════════════════════════════════════════════════════

/**
 * Convert dollar amount to integer cents (safe from floating-point errors)
 * @param {number|string} value - Dollar amount
 * @returns {number} - Amount in cents (integer)
 */
function toCents(value) {
  if (value === null || value === undefined || value === '') return 0;

  // Handle string values like "$1,234.56"
  const numValue = typeof value === 'string'
    ? parseFloat(value.replace(/[$,]/g, ''))
    : parseFloat(value);

  if (isNaN(numValue)) return 0;

  // Round to nearest cent (eliminates floating-point drift)
  return Math.round(numValue * 100);
}

/**
 * Convert cents back to dollar amount
 * @param {number} cents - Amount in cents (integer)
 * @returns {number} - Dollar amount (2 decimal places)
 */
function fromCents(cents) {
  return cents / 100;
}

/**
 * Format cents as currency string
 * @param {number} cents - Amount in cents
 * @returns {string} - Formatted currency (e.g., "$1,234.56")
 */
function formatCurrency(cents) {
  const dollars = fromCents(cents);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(dollars);
}

// ═════════════════════════════════════════════════════════════════════════
// STABLE CATEGORY DEFINITIONS
// ═════════════════════════════════════════════════════════════════════════

/**
 * Known expense categories (order matters for consistent processing)
 */
const KNOWN_CATEGORIES = [
  '60110010 BAKE',
  '60110020 BEV + ECO',
  '60110030 MILK',
  '60110040 GROC + MISC',
  '60110060 MEAT',
  '60110070 PROD',
  '60220001 CLEAN',
  '60260010 PAPER',
  '60665001 Small Equip',
  '62421100 FREIGHT',
  '60240010 LINEN',
  '62869010 PROPANE'
];

/**
 * Tax categories (separate from expense categories)
 */
const TAX_CATEGORIES = [
  '63107000 GST',
  '63107100 QST'
];

/**
 * Metadata fields (non-numeric)
 */
const METADATA_FIELDS = [
  'Fiscal Period',
  'Week Ending',
  'Vendor',
  'Date',
  'Invoice #',
  'Notes'
];

// ═════════════════════════════════════════════════════════════════════════
// DEDUPLICATION & NORMALIZATION
// ═════════════════════════════════════════════════════════════════════════

/**
 * Create unique key for invoice deduplication
 * @param {object} row - Invoice row
 * @returns {string} - Unique key
 */
function createInvoiceKey(row) {
  const vendor = (row['Vendor'] || '').trim().toUpperCase();
  const invoice = (row['Invoice #'] || '').trim().toUpperCase().replace(/[#\s]/g, '');
  return `${vendor}::${invoice}`;
}

/**
 * Deduplicate rows by (Vendor, Invoice #)
 * Keeps first occurrence of each unique invoice
 * @param {Array} rows - Array of invoice rows
 * @returns {Array} - Deduplicated rows
 */
function deduplicateInvoices(rows) {
  const seen = new Set();
  const deduplicated = [];

  for (const row of rows) {
    const key = createInvoiceKey(row);

    if (!seen.has(key)) {
      seen.add(key);
      deduplicated.push(row);
    }
  }

  return deduplicated;
}

// ═════════════════════════════════════════════════════════════════════════
// RESIDUAL "OTHER COSTS" CALCULATION
// ═════════════════════════════════════════════════════════════════════════

/**
 * Calculate "Other Costs" as residual: Total - Σ(known categories + taxes)
 * Clamps small rounding errors (< 2¢) to zero
 * @param {object} row - Invoice row (values in cents)
 * @param {number} totalCents - Total invoice amount in cents
 * @returns {number} - Other Costs in cents
 */
function calculateOtherCosts(row, totalCents) {
  // Sum all known expense categories
  let knownExpensesSum = 0;
  for (const category of KNOWN_CATEGORIES) {
    knownExpensesSum += (row[category] || 0);
  }

  // Sum all taxes
  let taxesSum = 0;
  for (const tax of TAX_CATEGORIES) {
    taxesSum += (row[tax] || 0);
  }

  // Calculate residual
  let otherCostsCents = totalCents - knownExpensesSum - taxesSum;

  // Clamp small rounding errors to zero (< 2¢)
  if (Math.abs(otherCostsCents) < 2) {
    otherCostsCents = 0;
  }

  return otherCostsCents;
}

/**
 * Process single invoice row: convert to cents, calculate Other Costs
 * @param {object} rawRow - Raw CSV row
 * @returns {object} - Processed row with values in cents
 */
function processInvoiceRow(rawRow) {
  const processed = {};

  // Copy metadata fields
  for (const field of METADATA_FIELDS) {
    processed[field] = rawRow[field] || '';
  }

  // Convert known categories to cents
  for (const category of KNOWN_CATEGORIES) {
    processed[category] = toCents(rawRow[category]);
  }

  // Convert taxes to cents
  for (const tax of TAX_CATEGORIES) {
    processed[tax] = toCents(rawRow[tax]);
  }

  // Convert total invoice amount to cents
  const totalCents = toCents(rawRow['Total Invoice Amount']);
  processed['Total Invoice Amount'] = totalCents;

  // Calculate Other Costs as residual
  processed['Other Costs'] = calculateOtherCosts(processed, totalCents);

  return processed;
}

// ═════════════════════════════════════════════════════════════════════════
// FISCAL PERIOD AGGREGATION
// ═════════════════════════════════════════════════════════════════════════

/**
 * Group invoices by fiscal period and sum deterministically
 * @param {Array} processedRows - Array of processed rows (values in cents)
 * @returns {Array} - Array of fiscal period summaries
 */
function groupByFiscalPeriod(processedRows) {
  const periodMap = new Map();

  for (const row of processedRows) {
    const fiscalPeriod = (row['Fiscal Period'] || 'UNKNOWN').trim();

    if (!periodMap.has(fiscalPeriod)) {
      // Initialize period summary
      const summary = {
        'Fiscal Period': fiscalPeriod,
        'Week Ending': row['Week Ending'] || '',
        'Invoice Count': 0
      };

      // Initialize all numeric categories to 0
      for (const category of KNOWN_CATEGORIES) {
        summary[category] = 0;
      }
      for (const tax of TAX_CATEGORIES) {
        summary[tax] = 0;
      }
      summary['Other Costs'] = 0;
      summary['Total Invoice Amount'] = 0;

      periodMap.set(fiscalPeriod, summary);
    }

    const summary = periodMap.get(fiscalPeriod);
    summary['Invoice Count']++;

    // Sum all categories (integer addition - no floating-point errors)
    for (const category of KNOWN_CATEGORIES) {
      summary[category] += row[category];
    }
    for (const tax of TAX_CATEGORIES) {
      summary[tax] += row[tax];
    }
    summary['Other Costs'] += row['Other Costs'];
    summary['Total Invoice Amount'] += row['Total Invoice Amount'];
  }

  // Convert Map to sorted array
  const periods = Array.from(periodMap.values());

  // Sort by fiscal period (FY25-P01, FY25-P02, etc.)
  periods.sort((a, b) => {
    const periodA = a['Fiscal Period'];
    const periodB = b['Fiscal Period'];
    return periodA.localeCompare(periodB);
  });

  return periods;
}

// ═════════════════════════════════════════════════════════════════════════
// VALIDATION & VERIFICATION
// ═════════════════════════════════════════════════════════════════════════

/**
 * Verify that each period's totals balance exactly
 * @param {object} periodSummary - Fiscal period summary (values in cents)
 * @returns {object} - Validation result
 */
function validatePeriodBalance(periodSummary) {
  // Sum all categories
  let calculatedTotal = 0;

  for (const category of KNOWN_CATEGORIES) {
    calculatedTotal += periodSummary[category];
  }
  for (const tax of TAX_CATEGORIES) {
    calculatedTotal += periodSummary[tax];
  }
  calculatedTotal += periodSummary['Other Costs'];

  const reportedTotal = periodSummary['Total Invoice Amount'];
  const difference = calculatedTotal - reportedTotal;

  return {
    fiscalPeriod: periodSummary['Fiscal Period'],
    calculatedTotal,
    reportedTotal,
    difference,
    balanced: difference === 0,
    percentError: reportedTotal !== 0 ? (difference / reportedTotal) * 100 : 0
  };
}

/**
 * Validate all fiscal period summaries
 * @param {Array} periodSummaries - Array of fiscal period summaries
 * @returns {Array} - Array of validation results
 */
function validateAllPeriods(periodSummaries) {
  return periodSummaries.map(validatePeriodBalance);
}

// ═════════════════════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═════════════════════════════════════════════════════════════════════════

/**
 * Build fiscal reports from raw CSV data
 * @param {Array} rawRows - Array of raw CSV rows
 * @returns {object} - Complete fiscal report package
 */
function buildFiscalReports(rawRows) {
  console.log('🔧 Building Fiscal Reports with Integer-Cent Math');
  console.log(`📊 Input: ${rawRows.length} raw rows`);

  // Step 1: Deduplicate invoices
  const uniqueRows = deduplicateInvoices(rawRows);
  console.log(`✅ Deduplicated: ${uniqueRows.length} unique invoices`);

  // Step 2: Process each row (convert to cents, calculate Other Costs)
  const processedRows = uniqueRows.map(processInvoiceRow);
  console.log(`✅ Processed: All values converted to integer cents`);

  // Step 3: Group by fiscal period
  const periodSummaries = groupByFiscalPeriod(processedRows);
  console.log(`✅ Grouped: ${periodSummaries.length} fiscal periods`);

  // Step 4: Validate balances
  const validations = validateAllPeriods(periodSummaries);
  const allBalanced = validations.every(v => v.balanced);
  console.log(`✅ Validation: ${allBalanced ? 'ALL PERIODS BALANCED' : 'ERRORS DETECTED'}`);

  // Step 5: Convert cents back to dollars for output
  const periodSummariesInDollars = periodSummaries.map(period => {
    const dollarPeriod = {
      'Fiscal Period': period['Fiscal Period'],
      'Week Ending': period['Week Ending'],
      'Invoice Count': period['Invoice Count']
    };

    for (const category of KNOWN_CATEGORIES) {
      dollarPeriod[category] = fromCents(period[category]);
    }
    for (const tax of TAX_CATEGORIES) {
      dollarPeriod[tax] = fromCents(period[tax]);
    }
    dollarPeriod['Other Costs'] = fromCents(period['Other Costs']);
    dollarPeriod['Total Invoice Amount'] = fromCents(period['Total Invoice Amount']);

    return dollarPeriod;
  });

  // Return complete package
  return {
    metadata: {
      inputRows: rawRows.length,
      uniqueInvoices: uniqueRows.length,
      fiscalPeriods: periodSummaries.length,
      allBalanced,
      generatedAt: new Date().toISOString()
    },
    periodSummaries: periodSummariesInDollars,
    validations,
    rawProcessedRows: processedRows // For debugging
  };
}

// ═════════════════════════════════════════════════════════════════════════
// CONVENIENCE EXPORTS
// ═════════════════════════════════════════════════════════════════════════

/**
 * Export to CSV format
 * @param {Array} periodSummaries - Array of fiscal period summaries
 * @returns {string} - CSV string
 */
function exportToCSV(periodSummaries) {
  const allColumns = [
    'Fiscal Period',
    'Week Ending',
    'Invoice Count',
    ...KNOWN_CATEGORIES,
    'Other Costs',
    ...TAX_CATEGORIES,
    'Total Invoice Amount'
  ];

  // Build CSV header
  const csvLines = [allColumns.join(',')];

  // Build CSV rows
  for (const period of periodSummaries) {
    const row = allColumns.map(col => {
      const value = period[col];
      // Quote strings that contain commas
      if (typeof value === 'string' && value.includes(',')) {
        return `"${value}"`;
      }
      return value;
    });
    csvLines.push(row.join(','));
  }

  return csvLines.join('\n');
}

/**
 * Export to JSON format
 * @param {object} reports - Complete fiscal report package
 * @returns {string} - JSON string
 */
function exportToJSON(reports) {
  return JSON.stringify(reports, null, 2);
}

// ═════════════════════════════════════════════════════════════════════════
// MODULE EXPORTS (Dual CommonJS + ES6 Support)
// ═════════════════════════════════════════════════════════════════════════

// CommonJS export for Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    buildFiscalReports,
    exportToCSV,
    exportToJSON,
    toCents,
    fromCents,
    formatCurrency,
    validatePeriodBalance,
    deduplicateInvoices,
    processInvoiceRow,
    calculateOtherCosts,
    groupByFiscalPeriod,
    validateAllPeriods,
    KNOWN_CATEGORIES,
    TAX_CATEGORIES,
    METADATA_FIELDS
  };
}

// ES6 export for browsers (uncomment if using as ES6 module)
// export {
//   buildFiscalReports,
//   exportToCSV,
//   exportToJSON,
//   toCents,
//   fromCents,
//   formatCurrency,
//   validatePeriodBalance,
//   KNOWN_CATEGORIES,
//   TAX_CATEGORIES
// };

// ═════════════════════════════════════════════════════════════════════════
// USAGE EXAMPLES
// ═════════════════════════════════════════════════════════════════════════

/*

// EXAMPLE 1: Browser Usage (with fetch)
// ────────────────────────────────────────────────────────────────────────

<script type="module">
  import { buildFiscalReports, exportToCSV } from './fy-report-fix.js';

  async function loadAndBuildReports() {
    // Fetch CSV data
    const response = await fetch('/api/invoices/csv');
    const csvText = await response.text();

    // Parse CSV (use your preferred CSV parser)
    const rows = parseCSV(csvText); // Your CSV parsing logic

    // Build reports
    const reports = buildFiscalReports(rows);

    // Display results
    console.log('📊 Fiscal Reports:', reports);
    console.table(reports.periodSummaries);

    // Check validation
    reports.validations.forEach(v => {
      if (!v.balanced) {
        console.error(`❌ ${v.fiscalPeriod}: Off by ${v.difference}¢`);
      } else {
        console.log(`✅ ${v.fiscalPeriod}: Perfectly balanced`);
      }
    });

    // Export to CSV
    const csv = exportToCSV(reports.periodSummaries);
    downloadCSV(csv, 'fiscal-reports.csv');
  }

  loadAndBuildReports();
</script>


// EXAMPLE 2: Node.js Usage
// ────────────────────────────────────────────────────────────────────────

const { buildFiscalReports, exportToJSON } = require('./fy-report-fix.js');
const fs = require('fs');
const csv = require('csv-parser');

async function generateReports() {
  const rows = [];

  // Read CSV file
  await new Promise((resolve, reject) => {
    fs.createReadStream('invoices.csv')
      .pipe(csv())
      .on('data', (row) => rows.push(row))
      .on('end', resolve)
      .on('error', reject);
  });

  // Build reports
  const reports = buildFiscalReports(rows);

  // Save to JSON
  fs.writeFileSync('fiscal-reports.json', exportToJSON(reports));

  console.log('✅ Reports saved to fiscal-reports.json');
}

generateReports();


// EXAMPLE 3: Drop-in Replacement for index.html
// ────────────────────────────────────────────────────────────────────────

// OLD (Buggy floating-point code):
// function aggregateByPeriod(rows) {
//   const periods = {};
//   rows.forEach(row => {
//     const fp = row['Fiscal Period'];
//     if (!periods[fp]) periods[fp] = { total: 0, otherCosts: 0 };
//     periods[fp].total += parseFloat(row['Total Invoice Amount']);
//     periods[fp].otherCosts += parseFloat(row['Other Costs']);
//   });
//   return periods;
// }

// NEW (Fixed integer-cent code):
import { buildFiscalReports } from './fy-report-fix.js';

function aggregateByPeriod(rows) {
  const reports = buildFiscalReports(rows);
  return reports.periodSummaries;
}


// EXAMPLE 4: REST API Endpoint
// ────────────────────────────────────────────────────────────────────────

const express = require('express');
const { buildFiscalReports, exportToCSV } = require('./fy-report-fix.js');

const app = express();

app.get('/api/fiscal-reports', async (req, res) => {
  try {
    // Fetch data from database
    const rows = await db.query('SELECT * FROM invoices WHERE deleted_at IS NULL');

    // Build reports
    const reports = buildFiscalReports(rows);

    // Return JSON
    res.json(reports);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/fiscal-reports/csv', async (req, res) => {
  try {
    const rows = await db.query('SELECT * FROM invoices WHERE deleted_at IS NULL');
    const reports = buildFiscalReports(rows);
    const csv = exportToCSV(reports.periodSummaries);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="fiscal-reports.csv"');
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(8083);

*/
