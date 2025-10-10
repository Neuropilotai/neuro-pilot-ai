#!/usr/bin/env node

/**
 * Find Abnormally Low Order Weeks
 * Identifies weeks with unusually low order values
 */

const fs = require('fs');
const path = require('path');

console.log('');
console.log('🔍 ABNORMAL WEEK DETECTION');
console.log('='.repeat(80));
console.log('');

// Read all JSON files
const ordersDir = path.join(__dirname, 'data', 'gfs_orders');
const files = fs.readdirSync(ordersDir).filter(f => f.endsWith('.json'));

// Track weekly data
const weeklyData = {};

for (const file of files) {
  const filePath = path.join(ordersDir, file);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  if (!data.orderDate) continue;

  const orderDate = new Date(data.orderDate);
  const weekKey = getWeekKey(orderDate);

  if (!weeklyData[weekKey]) {
    weeklyData[weekKey] = {
      invoices: 0,
      total: 0,
      dateRange: getWeekDateRange(orderDate)
    };
  }

  weeklyData[weekKey].invoices++;
  weeklyData[weekKey].total += (data.financials?.total || 0);
}

function getWeekKey(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const weekNum = getWeekNumber(d);
  return `${year}-W${String(weekNum).padStart(2, '0')}`;
}

function getWeekNumber(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return weekNo;
}

function getWeekDateRange(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const weekStart = new Date(d);
  weekStart.setDate(d.getDate() - 3);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  return `${weekStart.toISOString().split('T')[0]} to ${weekEnd.toISOString().split('T')[0]}`;
}

// Calculate statistics
const weeks = Object.keys(weeklyData)
  .filter(k => k.startsWith('2025'))
  .sort();

if (weeks.length === 0) {
  console.log('⚠️  No weeks with invoices found');
  process.exit(0);
}

const values = weeks.map(w => weeklyData[w].total);
const invoiceCounts = weeks.map(w => weeklyData[w].invoices);

const avgValue = values.reduce((a, b) => a + b, 0) / values.length;
const avgInvoices = invoiceCounts.reduce((a, b) => a + b, 0) / invoiceCounts.length;

const stdDevValue = Math.sqrt(
  values.map(v => Math.pow(v - avgValue, 2)).reduce((a, b) => a + b, 0) / values.length
);

console.log('📊 WEEKLY STATISTICS (2025)');
console.log('-'.repeat(80));
console.log(`Total Weeks: ${weeks.length}`);
console.log(`Average Weekly Value: $${avgValue.toFixed(2)}`);
console.log(`Average Invoices/Week: ${avgInvoices.toFixed(1)}`);
console.log(`Standard Deviation: $${stdDevValue.toFixed(2)}`);
console.log('');

// Find abnormal weeks (below 2 standard deviations)
const threshold = avgValue - (2 * stdDevValue);
const abnormalWeeks = [];

for (const week of weeks) {
  const data = weeklyData[week];
  if (data.total < threshold && data.total > 0) {
    const percentOfAvg = ((data.total / avgValue) * 100).toFixed(1);
    abnormalWeeks.push({
      week,
      ...data,
      percentOfAvg
    });
  }
}

console.log('⚠️  ABNORMALLY LOW WEEKS');
console.log('-'.repeat(80));
console.log(`Threshold: $${threshold.toFixed(2)} (2σ below average)`);
console.log('');

if (abnormalWeeks.length === 0) {
  console.log('✅ No abnormally low weeks detected');
} else {
  console.log(`Found ${abnormalWeeks.length} weeks with unusually low order values:`);
  console.log('');
  console.log('Week       | Date Range           | Invoices | Value      | % of Avg');
  console.log('-'.repeat(80));

  for (const w of abnormalWeeks) {
    console.log(
      `${w.week} | ${w.dateRange} | ${String(w.invoices).padStart(8)} | $${String(w.total.toFixed(2)).padStart(10)} | ${String(w.percentOfAvg).padStart(6)}%`
    );
  }
}

console.log('');

// Show all weeks sorted by value
console.log('📋 ALL WEEKS SORTED BY VALUE (Lowest to Highest)');
console.log('-'.repeat(80));
console.log('');

const sortedWeeks = weeks
  .map(w => ({ week: w, ...weeklyData[w] }))
  .sort((a, b) => a.total - b.total);

console.log('Week       | Date Range           | Invoices | Value');
console.log('-'.repeat(80));

for (const w of sortedWeeks) {
  const flag = w.total < threshold ? ' ⚠️  LOW' : '';
  console.log(
    `${w.week} | ${w.dateRange} | ${String(w.invoices).padStart(8)} | $${String(w.total.toFixed(2)).padStart(10)}${flag}`
  );
}

console.log('');
