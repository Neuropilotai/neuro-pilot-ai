#!/usr/bin/env node

/**
 * TEST ITEM CATEGORIZATION SYSTEM
 *
 * This script:
 * 1. Initializes category tables
 * 2. Auto-categorizes all items
 * 3. Shows category statistics
 * 4. Shows inventory value by category
 */

const EnterpriseInventoryManager = require('./enterprise_inventory_manager');

async function testCategorization() {
  console.log('');
  console.log('🏷️  ITEM CATEGORIZATION SYSTEM TEST');
  console.log('='.repeat(80));
  console.log('');

  const manager = new EnterpriseInventoryManager();

  try {
    await manager.initialize();
    console.log('');

    // Step 1: Initialize categories
    console.log('📋 Step 1: Initialize Category System');
    console.log('-'.repeat(80));
    await manager.initializeCategories();
    console.log('');

    // Step 2: Get categories
    console.log('📋 Step 2: View Categories');
    console.log('-'.repeat(80));
    const categories = await manager.getCategories();
    console.log(`✅ Found ${categories.length} main categories:`);
    categories.forEach(cat => {
      console.log(`   ${cat.category_id}. ${cat.category_name} (${cat.category_code})`);
    });
    console.log('');

    // Step 3: Get subcategories for Produce
    console.log('📋 Step 3: View Subcategories (Produce)');
    console.log('-'.repeat(80));
    const subcategories = await manager.getSubcategories(1);
    console.log(`✅ Found ${subcategories.length} subcategories:`);
    subcategories.forEach(subcat => {
      console.log(`   ${subcat.category_id}. ${subcat.category_name} (${subcat.category_code})`);
    });
    console.log('');

    // Step 4: Auto-categorize all items
    console.log('📋 Step 4: Auto-Categorize All Items');
    console.log('-'.repeat(80));
    console.log('🤖 Running auto-categorization based on item descriptions...');
    const results = await manager.autoCategorizeAllItems();
    console.log(`✅ Categorization complete:`);
    console.log(`   Total items: ${results.total}`);
    console.log(`   Categorized: ${results.categorized}`);
    console.log(`   Failed: ${results.failed}`);
    console.log('');

    // Step 5: Get category inventory statistics
    console.log('📋 Step 5: Category Inventory Statistics');
    console.log('-'.repeat(80));
    const categoryInventory = await manager.getCategoryInventory();
    console.log('Category breakdown:');
    console.log('');

    categoryInventory.forEach(cat => {
      if (cat.unique_items > 0) {
        console.log(`${cat.category_name} (${cat.category_code}):`);
        console.log(`  Unique Items: ${cat.unique_items || 0}`);
        console.log(`  Total Line Items: ${cat.total_line_items || 0}`);
        console.log(`  Total Value: $${(cat.total_value || 0).toLocaleString()}`);
        console.log(`  Status: Pending=${cat.pending_items || 0}, Placed=${cat.placed_items || 0}, Counted=${cat.counted_items || 0}`);
        console.log('');
      }
    });

    // Step 6: Get inventory value by category
    console.log('📋 Step 6: Inventory Value by Category');
    console.log('-'.repeat(80));
    const valueByCategory = await manager.getInventoryValueByCategory();

    let totalValue = 0;
    console.log('Value breakdown (PLACED + COUNTED only):');
    console.log('');

    valueByCategory.forEach(cat => {
      totalValue += cat.total_value;
      const percentage = totalValue > 0 ? ((cat.total_value / totalValue) * 100).toFixed(1) : 0;

      console.log(`${cat.category_name}:`);
      console.log(`  Items: ${cat.unique_items}`);
      console.log(`  Value: $${cat.total_value.toLocaleString()}`);
      console.log('');
    });

    console.log('-'.repeat(80));
    console.log(`TOTAL INVENTORY VALUE: $${totalValue.toLocaleString()}`);
    console.log('');

    // Step 7: Sample categorized items
    console.log('📋 Step 7: Sample Categorized Items');
    console.log('-'.repeat(80));

    const sampleItems = await new Promise((resolve, reject) => {
      manager.db.all(`
        SELECT
          ii.item_code,
          ii.description,
          c.category_name,
          c.category_code,
          sc.category_name as subcategory_name
        FROM invoice_items ii
        LEFT JOIN item_master im ON ii.item_code = im.item_code
        LEFT JOIN item_categories c ON im.category_id = c.category_id
        LEFT JOIN item_categories sc ON im.subcategory_id = sc.category_id
        WHERE im.category_id IS NOT NULL
        LIMIT 20
      `, [], (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      });
    });

    console.log('Sample of categorized items:');
    console.log('');
    sampleItems.forEach((item, i) => {
      const subcatText = item.subcategory_name ? ` → ${item.subcategory_name}` : '';
      console.log(`${i + 1}. ${item.description}`);
      console.log(`   Category: ${item.category_name} (${item.category_code})${subcatText}`);
      console.log('');
    });

    manager.close();

    console.log('');
    console.log('✅ CATEGORIZATION SYSTEM TEST COMPLETE');
    console.log('');
    console.log('📊 Summary:');
    console.log(`   • ${categories.length} main categories`);
    console.log(`   • ${results.categorized} items categorized`);
    console.log(`   • $${totalValue.toLocaleString()} total inventory value`);
    console.log('');
    console.log('🎯 Category system is ready for use!');
    console.log('');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    manager.close();
    process.exit(1);
  }
}

testCategorization();
