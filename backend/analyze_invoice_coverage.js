#!/usr/bin/env node

/**
 * Analyze invoice coverage and identify missing weeks
 */

const fs = require('fs');
const path = require('path');

function getWeekNumber(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return weekNo;
}

function getWeekKey(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const week = getWeekNumber(date);
  return `${year}-W${week.toString().padStart(2, '0')}`;
}

function getAllWeeksSince(startDate) {
  const weeks = [];
  const start = new Date(startDate);
  const today = new Date();

  let current = new Date(start);

  while (current <= today) {
    weeks.push(getWeekKey(current));
    current.setDate(current.getDate() + 7);
  }

  return [...new Set(weeks)].sort();
}

async function analyzeInvoiceCoverage() {
  console.log('');
  console.log('📊 INVOICE COVERAGE ANALYSIS');
  console.log('='.repeat(80));
  console.log('');

  const jsonDir = './data/gfs_orders';
  const files = fs.readdirSync(jsonDir).filter(f => f.endsWith('.json'));

  // Parse all invoices
  const invoices = [];
  const extractionIssues = [];

  for (const file of files) {
    const invoice = JSON.parse(fs.readFileSync(path.join(jsonDir, file), 'utf8'));

    // Skip credit memos for coverage analysis
    if (invoice.isCreditMemo) continue;

    const orderDate = invoice.orderDate;

    if (!orderDate) {
      extractionIssues.push({
        invoice: invoice.invoiceNumber,
        issue: 'No order date',
        quality: invoice.extractionQuality
      });
      continue;
    }

    invoices.push({
      number: invoice.invoiceNumber,
      date: orderDate,
      week: getWeekKey(orderDate),
      itemCount: invoice.items?.length || 0,
      total: invoice.financials?.total || 0,
      quality: invoice.extractionQuality,
      hasItems: invoice.items && invoice.items.length > 0
    });
  }

  // Sort by date
  invoices.sort((a, b) => new Date(a.date) - new Date(b.date));

  console.log('📋 Extraction Quality Report');
  console.log('-'.repeat(80));

  const qualityBreakdown = {};
  invoices.forEach(inv => {
    qualityBreakdown[inv.quality] = (qualityBreakdown[inv.quality] || 0) + 1;
  });

  Object.entries(qualityBreakdown).forEach(([quality, count]) => {
    const pct = ((count / invoices.length) * 100).toFixed(1);
    console.log(`  ${quality}: ${count} invoices (${pct}%)`);
  });

  const perfectCount = qualityBreakdown['PERFECT'] || 0;
  const totalCount = invoices.length;
  const readabilityPct = ((perfectCount / totalCount) * 100).toFixed(1);

  console.log('');
  console.log(`Current Readability: ${perfectCount}/${totalCount} = ${readabilityPct}%`);
  console.log(`Target: 100%`);
  console.log('');

  // Find invoices with issues
  const problematicInvoices = invoices.filter(inv =>
    inv.quality !== 'PERFECT' || !inv.hasItems
  );

  if (problematicInvoices.length > 0) {
    console.log('⚠️  Invoices with Extraction Issues:');
    console.log('-'.repeat(80));

    problematicInvoices.forEach(inv => {
      console.log(`  ${inv.number} (${inv.date}) - Quality: ${inv.quality}, Items: ${inv.itemCount}`);
    });
    console.log('');
  }

  // Extraction issues
  if (extractionIssues.length > 0) {
    console.log('❌ Invoices with Critical Issues:');
    console.log('-'.repeat(80));

    extractionIssues.forEach(issue => {
      console.log(`  ${issue.invoice}: ${issue.issue} (Quality: ${issue.quality})`);
    });
    console.log('');
  }

  // Weekly coverage analysis
  console.log('📅 Weekly Coverage Analysis (Since Jan 1, 2025)');
  console.log('-'.repeat(80));

  const allWeeks = getAllWeeksSince('2025-01-01');
  const invoicesByWeek = {};

  invoices.forEach(inv => {
    if (!invoicesByWeek[inv.week]) {
      invoicesByWeek[inv.week] = [];
    }
    invoicesByWeek[inv.week].push(inv);
  });

  const missingWeeks = [];

  console.log('Week       | Date Range           | Invoices | Total Value');
  console.log('-'.repeat(80));

  allWeeks.forEach(week => {
    const weekInvoices = invoicesByWeek[week] || [];
    const totalValue = weekInvoices.reduce((sum, inv) => sum + inv.total, 0);

    // Calculate week start/end dates
    const [year, weekNum] = week.split('-W');
    const weekStart = new Date(year, 0, 1 + (parseInt(weekNum) - 1) * 7);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1); // Monday
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6); // Sunday

    const dateRange = `${weekStart.toISOString().split('T')[0]} to ${weekEnd.toISOString().split('T')[0]}`;
    const invoiceCount = weekInvoices.length.toString().padStart(8);
    const value = `$${totalValue.toLocaleString()}`.padStart(12);

    if (weekInvoices.length === 0) {
      console.log(`${week} | ${dateRange} | ${invoiceCount} | ${value} ⚠️  MISSING`);
      missingWeeks.push({
        week,
        weekStart: weekStart.toISOString().split('T')[0],
        weekEnd: weekEnd.toISOString().split('T')[0]
      });
    } else {
      console.log(`${week} | ${dateRange} | ${invoiceCount} | ${value}`);
    }
  });

  console.log('');

  // Summary
  console.log('');
  console.log('📊 SUMMARY');
  console.log('='.repeat(80));
  console.log('');
  console.log(`Total Weeks: ${allWeeks.length}`);
  console.log(`Weeks with Invoices: ${Object.keys(invoicesByWeek).length}`);
  console.log(`Missing Weeks: ${missingWeeks.length}`);
  console.log('');

  if (missingWeeks.length > 0) {
    console.log('❌ Missing Invoice Weeks:');
    console.log('');
    missingWeeks.forEach(week => {
      console.log(`  ${week.week}: ${week.weekStart} to ${week.weekEnd}`);
    });
    console.log('');
  }

  console.log(`Current PDF Reading Accuracy: ${readabilityPct}%`);
  console.log(`Invoices needing improvement: ${problematicInvoices.length + extractionIssues.length}`);
  console.log('');

  if (readabilityPct < 100) {
    console.log('🔧 NEXT STEPS TO REACH 100% ACCURACY:');
    console.log('');
    console.log('1. Re-process invoices with quality issues');
    console.log('2. Verify PDF files are readable (not corrupted)');
    console.log('3. Check for missing order dates in source PDFs');
    console.log('4. Review credit memos for proper extraction');
    console.log('');
  } else {
    console.log('✅ All invoices are being read at 100% accuracy!');
    console.log('');
  }
}

analyzeInvoiceCoverage().catch(console.error);
