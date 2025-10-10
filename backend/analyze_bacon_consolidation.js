const fs = require('fs');
const path = require('path');

console.log('🥓 BACON CONSOLIDATION ANALYSIS');
console.log('='.repeat(80));

async function analyzeBaconItems() {
  const ordersDir = './data/gfs_orders';
  const baconItems = new Map(); // itemCode -> item details
  const excludePatterns = [
    'bit', 'bite', 'flavor', 'flavour', 'spice', 'seasoning',
    'extract', 'powder', 'salt', 'crisp', 'topping'
  ];

  console.log('🔍 Searching for bacon-related items...');
  console.log(`❌ Excluding items with: ${excludePatterns.join(', ')}`);

  try {
    const orderFiles = fs.readdirSync(ordersDir).filter(f => f.endsWith('.json'));

    for (const file of orderFiles) {
      try {
        const order = JSON.parse(fs.readFileSync(path.join(ordersDir, file), 'utf8'));

        if (order.items && Array.isArray(order.items)) {
          for (const item of order.items) {
            if (item.itemCode && item.description) {
              const description = item.description.toLowerCase();

              // Check if it contains "bacon"
              if (description.includes('bacon')) {
                // Check if it should be excluded
                const shouldExclude = excludePatterns.some(pattern =>
                  description.includes(pattern)
                );

                if (!shouldExclude) {
                  const existing = baconItems.get(item.itemCode);

                  if (!existing) {
                    baconItems.set(item.itemCode, {
                      itemCode: item.itemCode,
                      description: item.description,
                      orderCount: 1,
                      totalQuantity: Math.abs(item.qtyShipped || 0),
                      totalValue: Math.abs(item.lineTotal || 0),
                      avgPrice: item.unitPrice || 0,
                      orders: [order.invoiceNumber],
                      variations: new Set([item.description])
                    });
                  } else {
                    existing.orderCount++;
                    existing.totalQuantity += Math.abs(item.qtyShipped || 0);
                    existing.totalValue += Math.abs(item.lineTotal || 0);
                    existing.orders.push(order.invoiceNumber);
                    existing.variations.add(item.description);
                  }

                  console.log(`✅ INCLUDED: ${item.itemCode} - ${item.description}`);
                } else {
                  console.log(`❌ EXCLUDED: ${item.itemCode} - ${item.description} (contains: ${excludePatterns.find(p => description.includes(p))})`);
                }
              }
            }
          }
        }
      } catch (error) {
        console.log(`⚠️ Error processing ${file}: ${error.message}`);
      }
    }

    console.log('\n🥓 BACON CONSOLIDATION RESULTS:');
    console.log('='.repeat(60));

    if (baconItems.size === 0) {
      console.log('❌ No valid bacon items found');
      return;
    }

    console.log(`✅ Found ${baconItems.size} unique bacon item codes`);

    let totalQuantity = 0;
    let totalValue = 0;
    let totalOrders = 0;
    const allVariations = new Set();

    console.log('\n📋 BACON ITEM DETAILS:');
    console.log('-'.repeat(100));

    for (const [itemCode, item] of baconItems) {
      totalQuantity += item.totalQuantity;
      totalValue += item.totalValue;
      totalOrders += item.orderCount;
      item.variations.forEach(v => allVariations.add(v));

      console.log(`🥓 ${itemCode}: ${item.description}`);
      console.log(`   Orders: ${item.orderCount} | Qty: ${item.totalQuantity} | Value: $${item.totalValue.toFixed(2)}`);
      console.log(`   Avg Price: $${item.avgPrice.toFixed(2)} | Orders: ${item.orders.slice(0, 3).join(', ')}${item.orders.length > 3 ? '...' : ''}`);

      if (item.variations.size > 1) {
        console.log(`   Variations: ${Array.from(item.variations).join(' | ')}`);
      }
      console.log('');
    }

    console.log('\n📊 CONSOLIDATED BACON SUMMARY:');
    console.log('='.repeat(60));
    console.log(`🏷️ Total Item Codes: ${baconItems.size}`);
    console.log(`📦 Total Quantity Ordered: ${totalQuantity}`);
    console.log(`💰 Total Value: $${totalValue.toFixed(2)}`);
    console.log(`📋 Total Orders: ${totalOrders}`);
    console.log(`🔄 Average Order Size: ${(totalQuantity / Math.max(1, totalOrders)).toFixed(1)} units`);
    console.log(`💵 Average Price: $${(totalValue / Math.max(1, totalQuantity)).toFixed(2)} per unit`);
    console.log(`📝 Unique Descriptions: ${allVariations.size}`);

    // Calculate suggested min/max levels
    const avgOrderSize = totalQuantity / Math.max(1, totalOrders);
    const suggestedMin = Math.ceil(avgOrderSize * 1); // 1x average order
    const suggestedMax = Math.ceil(avgOrderSize * 4); // 4x average order

    console.log('\n📏 SUGGESTED INVENTORY LEVELS:');
    console.log('='.repeat(40));
    console.log(`📉 Suggested MIN: ${suggestedMin} units`);
    console.log(`📈 Suggested MAX: ${suggestedMax} units`);
    console.log(`💡 Reorder Point: ${Math.ceil(suggestedMin * 1.2)} units`);

    console.log('\n🔗 ALL BACON VARIATIONS FOUND:');
    console.log('-'.repeat(60));
    Array.from(allVariations).sort().forEach((variation, i) => {
      console.log(`${i + 1}. ${variation}`);
    });

    // Save consolidated bacon data
    const consolidatedData = {
      timestamp: new Date().toISOString(),
      summary: {
        totalItemCodes: baconItems.size,
        totalQuantity,
        totalValue,
        totalOrders,
        averageOrderSize: avgOrderSize,
        averagePrice: totalValue / Math.max(1, totalQuantity),
        suggestedMin,
        suggestedMax,
        uniqueDescriptions: allVariations.size
      },
      items: Array.from(baconItems.entries()),
      allVariations: Array.from(allVariations)
    };

    fs.writeFileSync('./data/bacon_consolidation.json', JSON.stringify(consolidatedData, null, 2));
    console.log('\n💾 Bacon consolidation data saved to ./data/bacon_consolidation.json');

    return consolidatedData;

  } catch (error) {
    console.log(`❌ Error analyzing bacon items: ${error.message}`);
    return null;
  }
}

// Export for use in other modules
module.exports = { analyzeBaconItems };

// Run if called directly
if (require.main === module) {
  analyzeBaconItems().catch(console.error);
}