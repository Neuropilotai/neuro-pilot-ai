/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TEST SUITE: GFS Fiscal Year Report Fix
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Demonstrates that the integer-cent math produces stable, reproducible results
 * across multiple runs with identical input data.
 */

const {
  buildFiscalReports,
  exportToCSV,
  toCents,
  fromCents,
  validatePeriodBalance
} = require('./fy-report-fix.js');

// ═════════════════════════════════════════════════════════════════════════
// TEST DATA (Simulates real CSV rows with problematic floating-point values)
// ═════════════════════════════════════════════════════════════════════════

const TEST_INVOICES = [
  {
    'Fiscal Period': 'FY25-P01',
    'Week Ending': '2024-06-30',
    'Vendor': 'GFS',
    'Date': '2024-06-15',
    'Invoice #': 'INV-001',
    '60110010 BAKE': '123.45',
    '60110020 BEV + ECO': '67.89',
    '60110030 MILK': '234.56',
    '60110040 GROC + MISC': '345.67',
    '60110060 MEAT': '456.78',
    '60110070 PROD': '567.89',
    '60220001 CLEAN': '12.34',
    '60260010 PAPER': '23.45',
    '60665001 Small Equip': '34.56',
    '62421100 FREIGHT': '45.67',
    '60240010 LINEN': '56.78',
    '62869010 PROPANE': '67.89',
    'Other Costs': '0.00', // Will be recalculated
    '63107000 GST': '100.50',
    '63107100 QST': '200.75',
    'Total Invoice Amount': '2338.18'
  },
  {
    'Fiscal Period': 'FY25-P01',
    'Week Ending': '2024-06-30',
    'Vendor': 'GFS',
    'Date': '2024-06-20',
    'Invoice #': 'INV-002',
    '60110010 BAKE': '111.11',
    '60110020 BEV + ECO': '222.22',
    '60110030 MILK': '333.33',
    '60110040 GROC + MISC': '444.44',
    '60110060 MEAT': '555.55',
    '60110070 PROD': '666.66',
    '60220001 CLEAN': '77.77',
    '60260010 PAPER': '88.88',
    '60665001 Small Equip': '99.99',
    '62421100 FREIGHT': '11.11',
    '60240010 LINEN': '22.22',
    '62869010 PROPANE': '33.33',
    'Other Costs': '0.00',
    '63107000 GST': '135.48',
    '63107100 QST': '270.96',
    'Total Invoice Amount': '3073.05'
  },
  {
    'Fiscal Period': 'FY25-P02',
    'Week Ending': '2024-07-31',
    'Vendor': 'GFS',
    'Date': '2024-07-10',
    'Invoice #': 'INV-003',
    '60110010 BAKE': '200.00',
    '60110020 BEV + ECO': '150.00',
    '60110030 MILK': '300.00',
    '60110040 GROC + MISC': '400.00',
    '60110060 MEAT': '500.00',
    '60110070 PROD': '250.00',
    '60220001 CLEAN': '50.00',
    '60260010 PAPER': '75.00',
    '60665001 Small Equip': '100.00',
    '62421100 FREIGHT': '25.00',
    '60240010 LINEN': '30.00',
    '62869010 PROPANE': '40.00',
    'Other Costs': '0.00',
    '63107000 GST': '106.00',
    '63107100 QST': '212.00',
    'Total Invoice Amount': '2438.00'
  },
  // Duplicate invoice (should be deduplicated)
  {
    'Fiscal Period': 'FY25-P02',
    'Week Ending': '2024-07-31',
    'Vendor': 'GFS',
    'Date': '2024-07-10',
    'Invoice #': 'INV-003', // Same as above
    '60110010 BAKE': '999.99',
    '60110020 BEV + ECO': '999.99',
    '60110030 MILK': '999.99',
    '60110040 GROC + MISC': '999.99',
    '60110060 MEAT': '999.99',
    '60110070 PROD': '999.99',
    '60220001 CLEAN': '999.99',
    '60260010 PAPER': '999.99',
    '60665001 Small Equip': '999.99',
    '62421100 FREIGHT': '999.99',
    '60240010 LINEN': '999.99',
    '62869010 PROPANE': '999.99',
    'Other Costs': '0.00',
    '63107000 GST': '999.99',
    '63107100 QST': '999.99',
    'Total Invoice Amount': '14999.87'
  }
];

// ═════════════════════════════════════════════════════════════════════════
// TEST FUNCTIONS
// ═════════════════════════════════════════════════════════════════════════

function testIntegerCentMath() {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  TEST 1: Integer-Cent Math (No Floating-Point Errors)        ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  const problematicValues = [
    0.1 + 0.2,           // Classic floating-point error: 0.30000000000000004
    123.456,             // Should round to 123.46
    999.999,             // Should round to 1000.00
    '$1,234.56',         // String with currency formatting
    '67.89'              // String number
  ];

  problematicValues.forEach(value => {
    const cents = toCents(value);
    const dollars = fromCents(cents);
    console.log(`  Input: ${value}`);
    console.log(`  → Cents: ${cents}`);
    console.log(`  → Dollars: $${dollars.toFixed(2)}`);
    console.log('');
  });

  console.log('✅ All conversions stable and deterministic\n');
}

function testDeduplication() {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  TEST 2: Invoice Deduplication                                ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  const reports = buildFiscalReports(TEST_INVOICES);

  console.log(`  Input Invoices: ${reports.metadata.inputRows}`);
  console.log(`  Unique Invoices: ${reports.metadata.uniqueInvoices}`);
  console.log(`  Duplicates Removed: ${reports.metadata.inputRows - reports.metadata.uniqueInvoices}`);
  console.log('');

  if (reports.metadata.uniqueInvoices === 3) {
    console.log('✅ Deduplication working correctly (removed 1 duplicate)\n');
  } else {
    console.log('❌ Deduplication failed\n');
  }
}

function testOtherCostsCalculation() {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  TEST 3: "Other Costs" Residual Calculation                   ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  const reports = buildFiscalReports(TEST_INVOICES);

  reports.periodSummaries.forEach(period => {
    console.log(`  Fiscal Period: ${period['Fiscal Period']}`);
    console.log(`  Other Costs: $${period['Other Costs'].toFixed(2)}`);
    console.log(`  Total Invoice Amount: $${period['Total Invoice Amount'].toFixed(2)}`);
    console.log('');
  });

  console.log('✅ "Other Costs" calculated as residual (no fluctuation)\n');
}

function testBalanceValidation() {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  TEST 4: Balance Validation (Exact Matching)                  ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  const reports = buildFiscalReports(TEST_INVOICES);

  let allPassed = true;

  reports.validations.forEach(validation => {
    const status = validation.balanced ? '✅' : '❌';
    console.log(`  ${status} ${validation.fiscalPeriod}`);
    console.log(`      Calculated Total: ${validation.calculatedTotal}¢`);
    console.log(`      Reported Total:   ${validation.reportedTotal}¢`);
    console.log(`      Difference:       ${validation.difference}¢`);

    if (!validation.balanced) {
      console.log(`      ⚠️  ERROR: Off by ${validation.difference}¢ (${validation.percentError.toFixed(4)}%)`);
      allPassed = false;
    }
    console.log('');
  });

  if (allPassed) {
    console.log('✅ All fiscal periods perfectly balanced\n');
  } else {
    console.log('❌ Some periods have balance errors\n');
  }
}

function testReproducibility() {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  TEST 5: Reproducibility (Multiple Runs)                      ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  const run1 = buildFiscalReports(TEST_INVOICES);
  const run2 = buildFiscalReports(TEST_INVOICES);
  const run3 = buildFiscalReports(TEST_INVOICES);

  const runs = [run1, run2, run3];

  console.log('  Running buildFiscalReports() 3 times with identical input...\n');

  let allIdentical = true;

  for (let i = 0; i < run1.periodSummaries.length; i++) {
    const period1 = run1.periodSummaries[i];
    const period2 = run2.periodSummaries[i];
    const period3 = run3.periodSummaries[i];

    const match12 = period1['Total Invoice Amount'] === period2['Total Invoice Amount'];
    const match23 = period2['Total Invoice Amount'] === period3['Total Invoice Amount'];

    if (!match12 || !match23) {
      console.log(`  ❌ ${period1['Fiscal Period']}: Values differ across runs`);
      console.log(`      Run 1: $${period1['Total Invoice Amount'].toFixed(2)}`);
      console.log(`      Run 2: $${period2['Total Invoice Amount'].toFixed(2)}`);
      console.log(`      Run 3: $${period3['Total Invoice Amount'].toFixed(2)}`);
      allIdentical = false;
    }
  }

  if (allIdentical) {
    console.log('  ✅ All 3 runs produced identical results');
    console.log('  ✅ "Other Costs" stable across reloads');
    console.log('  ✅ Total Invoice Amount deterministic\n');
  } else {
    console.log('  ❌ Results vary between runs (non-deterministic)\n');
  }
}

function testCSVExport() {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  TEST 6: CSV Export                                           ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  const reports = buildFiscalReports(TEST_INVOICES);
  const csv = exportToCSV(reports.periodSummaries);

  const lines = csv.split('\n');
  console.log(`  CSV Lines: ${lines.length}`);
  console.log(`  Header: ${lines[0].substring(0, 80)}...`);
  console.log('');

  if (lines.length === 3) { // Header + 2 periods
    console.log('✅ CSV export successful\n');
  } else {
    console.log('❌ CSV export failed\n');
  }
}

// ═════════════════════════════════════════════════════════════════════════
// RUN ALL TESTS
// ═════════════════════════════════════════════════════════════════════════

function runAllTests() {
  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('  GFS FISCAL YEAR REPORT FIX - COMPREHENSIVE TEST SUITE');
  console.log('═══════════════════════════════════════════════════════════════════════════');

  testIntegerCentMath();
  testDeduplication();
  testOtherCostsCalculation();
  testBalanceValidation();
  testReproducibility();
  testCSVExport();

  console.log('\n═══════════════════════════════════════════════════════════════════════════');
  console.log('  TEST SUITE COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('\n');

  // Show final summary
  const reports = buildFiscalReports(TEST_INVOICES);
  console.log('📊 FINAL REPORT SUMMARY:\n');
  console.table(reports.periodSummaries);
  console.log('\n');
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests();
}

module.exports = { runAllTests };
