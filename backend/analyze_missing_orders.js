const fs = require('fs').promises;
const path = require('path');

async function analyzeMissingWeeklyOrders() {
  console.log('🔍 Analyzing GFS orders to find missing weekly orders from January 2025...\n');

  try {
    const ordersDir = path.join(__dirname, 'data/gfs_orders');
    const files = await fs.readdir(ordersDir);
    const jsonFiles = files.filter(file => file.endsWith('.json') && !file.includes('corrupted'));

    console.log(`📄 Found ${jsonFiles.length} order files to analyze\n`);

    // Load all orders and extract dates
    const ordersWithDates = [];

    for (const file of jsonFiles) {
      try {
        const filePath = path.join(ordersDir, file);
        const content = await fs.readFile(filePath, 'utf8');
        const order = JSON.parse(content);

        // Extract order date from various possible fields
        let orderDate = null;

        if (order.orderDate) {
          orderDate = new Date(order.orderDate);
        } else if (order.processedDate) {
          orderDate = new Date(order.processedDate);
        } else if (order.pdfProcessingDate) {
          orderDate = new Date(order.pdfProcessingDate);
        }

        // Try to extract date from invoice number pattern if available
        if (!orderDate && order.invoiceNumber) {
          // Some invoice numbers might contain date info - analyze pattern
          const invoiceNum = order.invoiceNumber.toString();

          // If invoice starts with 902 (like 9021053494), it might be date-based
          if (invoiceNum.startsWith('902')) {
            // Extract potential date components
            const yearPart = invoiceNum.substring(3, 5); // 10 from 9021053494
            const monthPart = invoiceNum.substring(5, 7); // 53 from 9021053494

            // This is speculative - we'll use processing date as fallback
            if (order.processedDate) {
              orderDate = new Date(order.processedDate);
            }
          }
        }

        if (orderDate && !isNaN(orderDate.getTime())) {
          ordersWithDates.push({
            invoiceNumber: order.invoiceNumber,
            date: orderDate,
            fileName: file,
            type: order.type || 'invoice',
            isCreditMemo: order.isCreditMemo || false,
            businessName: order.businessName,
            totalValue: order.totalValue,
            hasItems: order.items && order.items.length > 0
          });
        }
      } catch (error) {
        console.log(`⚠️  Error processing ${file}: ${error.message}`);
      }
    }

    // Sort orders by date
    ordersWithDates.sort((a, b) => a.date - b.date);

    // Filter for January 2025 and later
    const jan2025Start = new Date('2025-01-01');
    const ordersFrom2025 = ordersWithDates.filter(order => order.date >= jan2025Start);

    console.log(`📅 Orders from January 2025 onwards: ${ordersFrom2025.length}\n`);

    if (ordersFrom2025.length === 0) {
      console.log('❌ No orders found from January 2025 onwards');
      console.log('📊 All available order dates:');
      ordersWithDates.slice(-10).forEach(order => {
        console.log(`   ${order.date.toISOString().split('T')[0]} - Invoice ${order.invoiceNumber} (${order.type})`);
      });
      return;
    }

    // Group orders by week
    const weeklyOrders = new Map();

    ordersFrom2025.forEach(order => {
      // Get the start of the week (Monday)
      const date = new Date(order.date);
      const day = date.getDay();
      const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday
      const weekStart = new Date(date.setDate(diff));
      const weekKey = weekStart.toISOString().split('T')[0];

      if (!weeklyOrders.has(weekKey)) {
        weeklyOrders.set(weekKey, []);
      }
      weeklyOrders.get(weekKey).push(order);
    });

    // Generate expected weeks from January 2025 to current date
    const expectedWeeks = [];
    const startDate = new Date('2025-01-06'); // First Monday of 2025
    const currentDate = new Date();

    let weekStart = new Date(startDate);
    while (weekStart <= currentDate) {
      expectedWeeks.push(weekStart.toISOString().split('T')[0]);
      weekStart = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000); // Add 7 days
    }

    console.log(`📊 Expected weekly orders from Jan 2025: ${expectedWeeks.length} weeks\n`);

    // Find missing weeks
    const missingWeeks = [];
    const presentWeeks = [];

    expectedWeeks.forEach(weekKey => {
      if (weeklyOrders.has(weekKey)) {
        presentWeeks.push({
          week: weekKey,
          orders: weeklyOrders.get(weekKey)
        });
      } else {
        missingWeeks.push(weekKey);
      }
    });

    // Display results
    console.log('✅ WEEKS WITH ORDERS:');
    presentWeeks.forEach(week => {
      const invoiceOrders = week.orders.filter(o => !o.isCreditMemo);
      const creditMemos = week.orders.filter(o => o.isCreditMemo);

      console.log(`   ${week.week}: ${invoiceOrders.length} orders, ${creditMemos.length} credits`);
      week.orders.forEach(order => {
        const type = order.isCreditMemo ? 'CREDIT' : 'ORDER';
        console.log(`     - ${type} ${order.invoiceNumber} (${order.date.toISOString().split('T')[0]})`);
      });
    });

    console.log('\n❌ MISSING WEEKS:');
    if (missingWeeks.length === 0) {
      console.log('   🎉 No missing weeks! All expected weekly orders are present.');
    } else {
      missingWeeks.forEach(week => {
        const weekDate = new Date(week);
        const weekEnd = new Date(weekDate.getTime() + 6 * 24 * 60 * 60 * 1000);
        console.log(`   ${week} to ${weekEnd.toISOString().split('T')[0]} - NO ORDERS FOUND`);
      });

      console.log(`\n📈 SUMMARY:`);
      console.log(`   Total expected weeks: ${expectedWeeks.length}`);
      console.log(`   Weeks with orders: ${presentWeeks.length}`);
      console.log(`   Missing weeks: ${missingWeeks.length}`);
      console.log(`   Coverage: ${((presentWeeks.length / expectedWeeks.length) * 100).toFixed(1)}%`);
    }

    // Show order distribution by month
    console.log('\n📅 ORDER DISTRIBUTION BY MONTH (2025):');
    const monthlyCount = {};
    ordersFrom2025.forEach(order => {
      const monthKey = order.date.toISOString().substring(0, 7); // YYYY-MM
      monthlyCount[monthKey] = (monthlyCount[monthKey] || 0) + 1;
    });

    Object.entries(monthlyCount).sort().forEach(([month, count]) => {
      console.log(`   ${month}: ${count} orders`);
    });

  } catch (error) {
    console.error('❌ Error analyzing orders:', error);
  }
}

// Run the analysis
analyzeMissingWeeklyOrders().catch(console.error);