const fs = require('fs').promises;

async function analyzeMissingFridays() {
  console.log('📅 Analyzing Missing Friday Orders from January 2025...\n');

  try {
    // Load the extraction results
    const data = await fs.readFile('real_order_dates_extraction.json', 'utf8');
    const extractionResults = JSON.parse(data);

    // Filter for successful extractions
    const orders = extractionResults.results.filter(r => r.success);

    console.log(`📊 Total orders with dates: ${orders.length}`);

    // Separate credits from regular orders
    const credits = orders.filter(order => order.invoiceNumber.startsWith('200'));
    const regularOrders = orders.filter(order => !order.invoiceNumber.startsWith('200'));

    console.log(`💳 Credits (200* series): ${credits.length}`);
    console.log(`📦 Regular Orders: ${regularOrders.length}\n`);

    // Focus on regular orders and their Friday pattern
    const orderDates = regularOrders.map(order => ({
      ...order,
      date: new Date(order.orderDate),
      dayOfWeek: new Date(order.orderDate).toLocaleDateString('en-US', { weekday: 'long' })
    })).sort((a, b) => a.date - b.date);

    // Group by actual date (since multiple orders can be on same Friday)
    const fridayGroups = new Map();

    orderDates.forEach(order => {
      const dateKey = order.orderDate;
      if (!fridayGroups.has(dateKey)) {
        fridayGroups.set(dateKey, []);
      }
      fridayGroups.get(dateKey).push(order);
    });

    // Get all unique order dates
    const allOrderDates = Array.from(fridayGroups.keys()).sort();

    console.log('📅 ALL ORDER DATES (with day of week):');
    allOrderDates.forEach(dateStr => {
      const date = new Date(dateStr);
      const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
      const orders = fridayGroups.get(dateStr);
      const isFriday = dayName === 'Friday';
      const symbol = isFriday ? '✅' : '⚠️';

      console.log(`   ${symbol} ${dateStr} (${dayName}): ${orders.length} orders`);
    });

    // Focus specifically on Fridays
    const fridayDates = allOrderDates.filter(dateStr => {
      const date = new Date(dateStr);
      return date.getDay() === 5; // Friday = 5
    });

    console.log(`\n📅 FRIDAY ORDERS (${fridayDates.length} Fridays with orders):`);
    fridayDates.forEach(dateStr => {
      const orders = fridayGroups.get(dateStr);
      console.log(`   ✅ ${dateStr}: ${orders.length} orders`);
    });

    // Generate all expected Fridays from first order date to today
    const firstOrderDate = new Date(allOrderDates[0]);
    const lastOrderDate = new Date(allOrderDates[allOrderDates.length - 1]);
    const today = new Date();

    // Find the first Friday after the first order
    let currentFriday = new Date(firstOrderDate);
    while (currentFriday.getDay() !== 5) {
      currentFriday.setDate(currentFriday.getDate() + 1);
    }

    // Generate all expected Fridays
    const expectedFridays = [];
    while (currentFriday <= today) {
      expectedFridays.push(currentFriday.toISOString().split('T')[0]);
      currentFriday = new Date(currentFriday.getTime() + 7 * 24 * 60 * 60 * 1000); // Add 7 days
    }

    // Find missing Fridays
    const missingFridays = expectedFridays.filter(friday => !fridayDates.includes(friday));

    console.log(`\n❌ MISSING FRIDAY ORDERS:`);
    console.log(`   Expected Fridays (Jan 2025 - Today): ${expectedFridays.length}`);
    console.log(`   Fridays with orders: ${fridayDates.length}`);
    console.log(`   Missing Fridays: ${missingFridays.length}`);

    if (missingFridays.length > 0) {
      console.log(`\n🕳️  SPECIFIC MISSING FRIDAYS:`);
      missingFridays.forEach(friday => {
        const date = new Date(friday);
        const monthName = date.toLocaleDateString('en-US', { month: 'long' });
        console.log(`   ❌ ${friday} (${monthName})`);
      });

      // Group missing Fridays by month
      const missingByMonth = {};
      missingFridays.forEach(friday => {
        const date = new Date(friday);
        const monthKey = date.toISOString().substring(0, 7); // YYYY-MM
        const monthName = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

        if (!missingByMonth[monthKey]) {
          missingByMonth[monthKey] = { name: monthName, dates: [] };
        }
        missingByMonth[monthKey].dates.push(friday);
      });

      console.log(`\n📊 MISSING FRIDAYS BY MONTH:`);
      Object.entries(missingByMonth).sort().forEach(([monthKey, monthData]) => {
        console.log(`   ${monthData.name}: ${monthData.dates.length} missing Fridays`);
        monthData.dates.forEach(date => {
          console.log(`     - ${date}`);
        });
      });

    } else {
      console.log(`   ✅ No missing Fridays! Perfect weekly ordering pattern.`);
    }

    // Show coverage statistics
    const coveragePercent = ((fridayDates.length / expectedFridays.length) * 100).toFixed(1);

    console.log(`\n📈 FRIDAY ORDER COVERAGE:`);
    console.log(`   Coverage: ${coveragePercent}% (${fridayDates.length}/${expectedFridays.length})`);
    console.log(`   First Friday order: ${fridayDates[0]}`);
    console.log(`   Last Friday order: ${fridayDates[fridayDates.length - 1]}`);

    // Show non-Friday orders (exceptions)
    const nonFridayDates = allOrderDates.filter(dateStr => {
      const date = new Date(dateStr);
      return date.getDay() !== 5; // Not Friday
    });

    if (nonFridayDates.length > 0) {
      console.log(`\n⚠️  NON-FRIDAY ORDERS (${nonFridayDates.length} exceptions):`);
      nonFridayDates.forEach(dateStr => {
        const date = new Date(dateStr);
        const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
        const orders = fridayGroups.get(dateStr);
        console.log(`   ⚠️  ${dateStr} (${dayName}): ${orders.length} orders`);

        // Show invoice numbers for non-Friday orders
        orders.forEach(order => {
          const isCredit = order.invoiceNumber.startsWith('200');
          const type = isCredit ? 'CREDIT' : 'ORDER';
          console.log(`       - ${type} ${order.invoiceNumber}`);
        });
      });
    }

    console.log(`\n✅ Analysis complete! ${missingFridays.length} Friday gaps identified from January 2025 onwards.`);

  } catch (error) {
    console.error('❌ Error analyzing Friday orders:', error);
  }
}

// Run the analysis
analyzeMissingFridays().catch(console.error);