const fs = require('fs');
const path = require('path');

console.log('📅 FINDING MISSING ORDER WEEKS SINCE JANUARY 2025\n');
console.log('='.repeat(80));

function findMissingOrderWeeks() {
  const gfsOrdersDir = './data/gfs_orders';
  
  // Get all order files
  const files = fs.readdirSync(gfsOrdersDir)
    .filter(file => file.endsWith('.json') && file.includes('gfs_order_'))
    .filter(file => !file.includes('corrupted') && !file.includes('deleted_'));
  
  console.log(`📂 Analyzing ${files.length} order files...\n`);
  
  // Collect all order dates
  const orderDates = new Set();
  const ordersByWeek = new Map();
  const orderDetails = [];
  
  files.forEach(file => {
    try {
      const filePath = path.join(gfsOrdersDir, file);
      const order = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      
      if (order.orderDate) {
        const date = new Date(order.orderDate);
        // Only include orders from 2025
        if (date.getFullYear() === 2025) {
          orderDates.add(order.orderDate);
          
          // Calculate week number
          const weekNum = getWeekNumber(date);
          const weekKey = `${date.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
          
          if (!ordersByWeek.has(weekKey)) {
            ordersByWeek.set(weekKey, []);
          }
          
          ordersByWeek.get(weekKey).push({
            date: order.orderDate,
            invoice: order.invoiceNumber,
            day: date.toLocaleDateString('en-US', { weekday: 'long' })
          });
          
          orderDetails.push({
            date: order.orderDate,
            invoice: order.invoiceNumber,
            dateObj: date
          });
        }
      }
    } catch (error) {
      console.error(`Error reading ${file}: ${error.message}`);
    }
  });
  
  // Sort order details by date
  orderDetails.sort((a, b) => new Date(a.date) - new Date(b.date));
  
  // Get all weeks from January 2025 to current date
  const startDate = new Date('2025-01-01');
  const endDate = new Date();
  const allWeeks = [];
  
  // Generate all weeks
  const currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    const weekNum = getWeekNumber(currentDate);
    const weekKey = `${currentDate.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
    const weekStart = getWeekStart(currentDate);
    const weekEnd = getWeekEnd(currentDate);
    
    if (!allWeeks.find(w => w.key === weekKey)) {
      allWeeks.push({
        key: weekKey,
        weekNum: weekNum,
        year: currentDate.getFullYear(),
        startDate: weekStart,
        endDate: weekEnd
      });
    }
    
    currentDate.setDate(currentDate.getDate() + 7);
  }
  
  // Find missing weeks
  const missingWeeks = [];
  const weeksWithOrders = [];
  
  allWeeks.forEach(week => {
    if (ordersByWeek.has(week.key)) {
      weeksWithOrders.push({
        ...week,
        orders: ordersByWeek.get(week.key)
      });
    } else {
      missingWeeks.push(week);
    }
  });
  
  // Display results
  console.log('📊 ORDER COVERAGE ANALYSIS:');
  console.log('─'.repeat(80));
  console.log(`📅 Period: January 1, 2025 - ${endDate.toLocaleDateString()}`);
  console.log(`📦 Total weeks in period: ${allWeeks.length}`);
  console.log(`✅ Weeks with orders: ${weeksWithOrders.length}`);
  console.log(`❌ Missing weeks: ${missingWeeks.length}`);
  console.log(`📈 Coverage: ${((weeksWithOrders.length / allWeeks.length) * 100).toFixed(1)}%`);
  
  // Show weeks with orders
  console.log('\n✅ WEEKS WITH ORDERS:');
  console.log('─'.repeat(80));
  weeksWithOrders.forEach(week => {
    const dateRange = `${week.startDate.toLocaleDateString()} - ${week.endDate.toLocaleDateString()}`;
    console.log(`Week ${week.weekNum}: ${dateRange}`);
    week.orders.forEach(order => {
      console.log(`  └─ ${order.date} (${order.day}) - Invoice: ${order.invoice}`);
    });
  });
  
  // Show missing weeks
  console.log('\n❌ MISSING ORDER WEEKS:');
  console.log('─'.repeat(80));
  if (missingWeeks.length === 0) {
    console.log('🎉 No missing weeks! All weeks have orders.');
  } else {
    missingWeeks.forEach(week => {
      const dateRange = `${week.startDate.toLocaleDateString()} - ${week.endDate.toLocaleDateString()}`;
      console.log(`Week ${week.weekNum}: ${dateRange}`);
    });
  }
  
  // Show order pattern analysis
  console.log('\n📊 ORDER PATTERN ANALYSIS:');
  console.log('─'.repeat(80));
  
  // Count orders by day of week
  const dayCount = {};
  orderDetails.forEach(order => {
    const day = order.dateObj.toLocaleDateString('en-US', { weekday: 'long' });
    dayCount[day] = (dayCount[day] || 0) + 1;
  });
  
  console.log('Orders by day of week:');
  Object.entries(dayCount)
    .sort((a, b) => b[1] - a[1])
    .forEach(([day, count]) => {
      console.log(`  ${day}: ${count} orders`);
    });
  
  // Calculate average days between orders
  if (orderDetails.length > 1) {
    let totalDays = 0;
    for (let i = 1; i < orderDetails.length; i++) {
      const days = Math.floor((new Date(orderDetails[i].date) - new Date(orderDetails[i-1].date)) / (1000 * 60 * 60 * 24));
      totalDays += days;
    }
    const avgDays = totalDays / (orderDetails.length - 1);
    console.log(`\n📈 Average days between orders: ${avgDays.toFixed(1)} days`);
  }
  
  // Summary recommendations
  console.log('\n' + '='.repeat(80));
  console.log('💡 RECOMMENDATIONS:');
  console.log('='.repeat(80));
  
  if (missingWeeks.length > 0) {
    console.log(`📝 ${missingWeeks.length} weeks are missing orders:`);
    missingWeeks.slice(0, 5).forEach(week => {
      const dateRange = `${week.startDate.toLocaleDateString()} - ${week.endDate.toLocaleDateString()}`;
      console.log(`   - Week ${week.weekNum}: ${dateRange}`);
    });
    if (missingWeeks.length > 5) {
      console.log(`   ... and ${missingWeeks.length - 5} more weeks`);
    }
    console.log('\n📂 Check if PDFs exist for these weeks in OneDrive folder');
  } else {
    console.log('✅ All weeks have orders - excellent coverage!');
  }
  
  return {
    missingWeeks,
    weeksWithOrders,
    totalWeeks: allWeeks.length
  };
}

// Helper function to get ISO week number
function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

// Helper function to get week start date (Monday)
function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

// Helper function to get week end date (Sunday)
function getWeekEnd(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? 0 : 7);
  return new Date(d.setDate(diff));
}

// Run the analysis
findMissingOrderWeeks();