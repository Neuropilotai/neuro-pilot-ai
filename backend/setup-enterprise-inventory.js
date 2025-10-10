#!/usr/bin/env node

/**
 * ENTERPRISE INVENTORY SETUP & TEST TOOL
 * Initialize and test the enterprise inventory system
 */

const EnterpriseInventoryManager = require('./enterprise_inventory_manager');
const fs = require('fs');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function setupEnterpriseInventory() {
  console.log('');
  console.log('🏢 ENTERPRISE INVENTORY MANAGEMENT SYSTEM');
  console.log('=' .repeat(70));
  console.log('Phase 1: Initial Setup');
  console.log('');

  const manager = new EnterpriseInventoryManager();

  try {
    // Step 1: Initialize database
    console.log('📊 Step 1: Initialize Database');
    console.log('-'.repeat(70));
    await manager.initialize();
    console.log('✅ Database schema created');
    console.log('');

    // Step 2: Import existing invoices
    console.log('📦 Step 2: Import Existing Invoices');
    console.log('-'.repeat(70));
    const importChoice = await question('Import invoices from JSON files? (y/n): ');

    if (importChoice.toLowerCase() === 'y') {
      console.log('Importing invoices...');
      const result = await manager.importInvoicesFromJSON();
      console.log(`✅ Imported ${result.items} items from ${result.files} invoices`);

      // Check pending placements
      const pending = await manager.getPendingPlacements();
      console.log(`📋 ${pending.length} items pending location assignment`);
    }
    console.log('');

    // Step 3: Load existing locations
    console.log('📍 Step 3: Storage Locations');
    console.log('-'.repeat(70));

    const locationsPath = './data/storage_locations.json';
    if (fs.existsSync(locationsPath)) {
      const locations = JSON.parse(fs.readFileSync(locationsPath, 'utf8'));
      console.log(`✅ Found ${locations.length} storage locations:`);
      locations.slice(0, 5).forEach(loc => {
        console.log(`   ${loc.id}. ${loc.name} (${loc.type})`);
      });
      if (locations.length > 5) {
        console.log(`   ... and ${locations.length - 5} more`);
      }
    } else {
      console.log('⚠️  No storage locations file found');
      console.log('   You\'ll need to create storage locations first');
    }
    console.log('');

    // Step 4: Workflow options
    console.log('🎯 Next Steps:');
    console.log('-'.repeat(70));
    console.log('1. Assign locations to pending items');
    console.log('2. Perform first physical count');
    console.log('3. Set up min/max levels');
    console.log('');

    const nextStep = await question('Choose next step (1-3) or press Enter to finish: ');

    if (nextStep === '1') {
      await assignLocationsDemo(manager);
    } else if (nextStep === '2') {
      await physicalCountDemo(manager);
    } else if (nextStep === '3') {
      await minMaxDemo(manager);
    }

    console.log('');
    console.log('✅ Enterprise Inventory System is ready!');
    console.log('');
    console.log('📚 Documentation:');
    console.log('   - ENTERPRISE_INVENTORY_DESIGN.md');
    console.log('   - Database schema: database/enterprise_inventory_schema.sql');
    console.log('');
    console.log('🌐 API Endpoints available at: /api/enterprise-inventory/');
    console.log('');

    manager.close();
    rl.close();

  } catch (error) {
    console.error('❌ Error:', error);
    manager.close();
    rl.close();
    process.exit(1);
  }
}

async function assignLocationsDemo(manager) {
  console.log('');
  console.log('📍 LOCATION ASSIGNMENT DEMO');
  console.log('=' .repeat(70));

  const pending = await manager.getPendingPlacements();

  if (pending.length === 0) {
    console.log('✅ No items pending location assignment');
    return;
  }

  // Group by invoice
  const byInvoice = {};
  pending.forEach(item => {
    if (!byInvoice[item.invoice_number]) {
      byInvoice[item.invoice_number] = [];
    }
    byInvoice[item.invoice_number].push(item);
  });

  console.log(`Found ${Object.keys(byInvoice).length} invoices with pending items`);
  console.log('');

  const invoiceNumber = Object.keys(byInvoice)[0];
  const items = byInvoice[invoiceNumber];

  console.log(`Invoice: ${invoiceNumber}`);
  console.log(`Items: ${items.length}`);
  console.log('');
  console.log('Sample items:');
  items.slice(0, 3).forEach((item, i) => {
    console.log(`${i + 1}. ${item.item_code} - ${item.description} (${item.quantity} ${item.unit})`);
  });
  console.log('');

  const assign = await question('Assign all items from this invoice to location #1? (y/n): ');

  if (assign.toLowerCase() === 'y') {
    const result = await manager.bulkAssignLocation(invoiceNumber, 1, 'SETUP_USER', 'Initial setup');
    console.log(`✅ Assigned ${result.itemsAssigned} items to location #1`);
  }
}

async function physicalCountDemo(manager) {
  console.log('');
  console.log('📊 PHYSICAL COUNT DEMO');
  console.log('=' .repeat(70));

  const current = await manager.getCurrentInventory();

  if (current.length === 0) {
    console.log('⚠️  No items in inventory yet');
    console.log('   Please assign locations to items first');
    return;
  }

  console.log(`Current inventory: ${current.length} items`);
  console.log('');

  const createCount = await question('Create a test physical count? (y/n): ');

  if (createCount.toLowerCase() === 'y') {
    const cutOffDate = new Date().toISOString();
    const count = await manager.createPhysicalCount(cutOffDate, 'SETUP_USER', 'Demo count');

    console.log(`✅ Created count #${count.countId}`);
    console.log(`   Cut-off date: ${cutOffDate}`);
    console.log('');

    const items = await manager.getItemsToCount(cutOffDate);
    console.log(`Items to count: ${items.length}`);
    console.log('');

    // Demo: count first 3 items
    console.log('Demo: Recording counts for first 3 items...');
    for (let i = 0; i < Math.min(3, items.length); i++) {
      const item = items[i];
      // Simulate counting with system quantity (100% accuracy)
      await manager.recordCount(
        count.countId,
        item.item_code,
        item.location_id,
        item.system_quantity,
        'SETUP_USER',
        'Demo count'
      );
      console.log(`   ✓ Counted ${item.description}: ${item.system_quantity} ${item.unit}`);
    }

    console.log('');
    console.log('Note: In production, count all items before completing the count');
  }
}

async function minMaxDemo(manager) {
  console.log('');
  console.log('📈 MIN/MAX LEVELS DEMO');
  console.log('=' .repeat(70));

  const latest = await manager.getLatestCountSummary();

  if (!latest || latest.status !== 'COMPLETED') {
    console.log('⚠️  No completed physical count found');
    console.log('   Complete a physical count first to set min/max levels');
    return;
  }

  console.log(`Last count: ${latest.count_date} (${latest.total_items_counted} items)`);
  console.log('');

  const calculate = await question('Calculate min/max levels for all items? (y/n): ');

  if (calculate.toLowerCase() === 'y') {
    console.log('Calculating min/max levels (this may take a moment)...');
    const results = await manager.calculateAllMinMax(12);
    console.log(`✅ Calculated min/max for ${results.length} items`);

    if (results.length > 0) {
      console.log('');
      console.log('Sample results:');
      results.slice(0, 3).forEach(r => {
        console.log(`   ${r.itemCode}: Min=${r.minQuantity}, Max=${r.maxQuantity}, Reorder=${r.reorderQuantity}`);
      });
    }
  }
}

// Run setup
setupEnterpriseInventory().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
