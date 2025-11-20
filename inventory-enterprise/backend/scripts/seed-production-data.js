#!/usr/bin/env node

/**
 * Production Database Seeding Script for Neuro.Pilot.AI v21.1
 *
 * Seeds essential data:
 * - Owner account
 * - Locations
 * - Basic inventory items
 * - Sample menu
 * - Initial vendors
 *
 * Run: node backend/scripts/seed-production-data.js
 */

const { Pool } = require('pg');
const bcrypt = require('bcrypt');

/**
 * Normalize DATABASE_URL to prevent schemeless URLs from being treated as Unix sockets
 */
function normalizeDatabaseUrl(raw) {
  if (!raw) {
    throw new Error('Missing DATABASE_URL environment variable');
  }
  if (!/^postgres(ql)?:\/\//i.test(raw)) {
    raw = `postgresql://${String(raw).replace(/^\/\//, '')}`;
    console.warn('[SEED] Added missing postgresql:// scheme to DATABASE_URL');
  }
  return raw;
}

const connectionString = normalizeDatabaseUrl(process.env.DATABASE_URL);
const ssl = process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false;

const pool = new Pool({ connectionString, ssl });

console.log('═══════════════════════════════════════════════════════');
console.log('  Neuro.Pilot.AI Production Database Seeding v21.1');
console.log('═══════════════════════════════════════════════════════\n');

async function seedDatabase() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // ============================================================
    // 1. CREATE OWNER ACCOUNT
    // ============================================================
    console.log('[1/6] Creating owner account...');

    // Check if owner exists
    const ownerCheck = await client.query(
      `SELECT user_id FROM users WHERE email = 'owner@neuropilot.ai'`
    );

    let ownerId;
    if (ownerCheck.rows.length === 0) {
      // Create owner account
      const hashedPassword = await bcrypt.hash('NeuroPilot2025!', 10);

      const ownerResult = await client.query(`
        INSERT INTO users (email, password_hash, first_name, last_name, role, org_id, is_active, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        RETURNING user_id
      `, ['owner@neuropilot.ai', hashedPassword, 'David', 'Mikulis', 'owner', 1, true]);

      ownerId = ownerResult.rows[0].user_id;
      console.log(`  ✓ Owner account created (ID: ${ownerId})`);
      console.log(`  📧 Email: owner@neuropilot.ai`);
      console.log(`  🔑 Password: NeuroPilot2025!`);
    } else {
      ownerId = ownerCheck.rows[0].user_id;
      console.log(`  ℹ Owner account already exists (ID: ${ownerId})`);
    }

    // ============================================================
    // 2. CREATE LOCATIONS
    // ============================================================
    console.log('\n[2/6] Creating storage locations...');

    const locations = [
      { name: 'Walk-In Cooler', type: 'refrigerated', temp_min: 35, temp_max: 40, capacity: 500 },
      { name: 'Walk-In Freezer', type: 'frozen', temp_min: -10, temp_max: 0, capacity: 400 },
      { name: 'Dry Storage', type: 'ambient', temp_min: 60, temp_max: 75, capacity: 800 },
      { name: 'Prep Station', type: 'work_area', temp_min: 60, temp_max: 75, capacity: 50 },
      { name: 'Line Station', type: 'work_area', temp_min: 65, temp_max: 75, capacity: 30 },
    ];

    for (const loc of locations) {
      const locCheck = await client.query(
        `SELECT location_id FROM locations WHERE name = $1`,
        [loc.name]
      );

      if (locCheck.rows.length === 0) {
        await client.query(`
          INSERT INTO locations (name, location_type, temp_min, temp_max, capacity_units, org_id, is_active, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        `, [loc.name, loc.type, loc.temp_min, loc.temp_max, loc.capacity, 1, true]);
        console.log(`  ✓ Created location: ${loc.name}`);
      } else {
        console.log(`  ℹ Location exists: ${loc.name}`);
      }
    }

    // ============================================================
    // 3. CREATE VENDORS
    // ============================================================
    console.log('\n[3/6] Creating vendors...');

    const vendors = [
      { name: 'Sysco', code: 'SYSCO', type: 'broadline', contact: 'sales@sysco.com', phone: '800-555-0100' },
      { name: 'US Foods', code: 'USF', type: 'broadline', contact: 'sales@usfoods.com', phone: '800-555-0200' },
      { name: 'GFS (Gordon Food Service)', code: 'GFS', type: 'broadline', contact: 'sales@gfs.com', phone: '800-555-0300' },
      { name: 'Local Produce Co', code: 'LPC', type: 'produce', contact: 'orders@localproduce.com', phone: '555-0400' },
      { name: 'Prime Meats Supply', code: 'PMS', type: 'protein', contact: 'orders@primemeats.com', phone: '555-0500' },
    ];

    for (const vendor of vendors) {
      const vendorCheck = await client.query(
        `SELECT vendor_id FROM vendors WHERE vendor_code = $1`,
        [vendor.code]
      );

      if (vendorCheck.rows.length === 0) {
        await client.query(`
          INSERT INTO vendors (vendor_name, vendor_code, vendor_type, contact_email, contact_phone, is_active, org_id, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        `, [vendor.name, vendor.code, vendor.type, vendor.contact, vendor.phone, true, 1]);
        console.log(`  ✓ Created vendor: ${vendor.name}`);
      } else {
        console.log(`  ℹ Vendor exists: ${vendor.name}`);
      }
    }

    // ============================================================
    // 4. CREATE INVENTORY ITEMS
    // ============================================================
    console.log('\n[4/6] Creating inventory items...');

    const items = [
      // Proteins
      { code: 'BEEF-RIB-10', name: 'Ribeye Steak 10oz', category: 'Protein', unit: 'each', par: 100, vendor: 'PMS', cost: 8.50 },
      { code: 'BEEF-RIB-12', name: 'Ribeye Steak 12oz', category: 'Protein', unit: 'each', par: 80, vendor: 'PMS', cost: 10.20 },
      { code: 'CHKN-BRST-8', name: 'Chicken Breast 8oz', category: 'Protein', unit: 'each', par: 150, vendor: 'PMS', cost: 3.25 },
      { code: 'PORK-CHOP-10', name: 'Pork Chop 10oz', category: 'Protein', unit: 'each', par: 80, vendor: 'PMS', cost: 4.50 },
      { code: 'FISH-SALM-8', name: 'Salmon Fillet 8oz', category: 'Protein', unit: 'each', par: 60, vendor: 'PMS', cost: 7.80 },

      // Produce
      { code: 'VEG-LETT-ROM', name: 'Romaine Lettuce', category: 'Produce', unit: 'head', par: 50, vendor: 'LPC', cost: 1.20 },
      { code: 'VEG-TOM-ROMA', name: 'Roma Tomatoes', category: 'Produce', unit: 'lb', par: 40, vendor: 'LPC', cost: 1.80 },
      { code: 'VEG-POT-RUST', name: 'Russet Potatoes', category: 'Produce', unit: 'lb', par: 200, vendor: 'LPC', cost: 0.60 },
      { code: 'VEG-ONI-YELL', name: 'Yellow Onions', category: 'Produce', unit: 'lb', par: 80, vendor: 'LPC', cost: 0.50 },

      // Dairy
      { code: 'DAIRY-MILK-GAL', name: 'Whole Milk 1 Gallon', category: 'Dairy', unit: 'gallon', par: 20, vendor: 'SYSCO', cost: 4.50 },
      { code: 'DAIRY-BUTT-LB', name: 'Butter (Unsalted)', category: 'Dairy', unit: 'lb', par: 30, vendor: 'SYSCO', cost: 3.80 },
      { code: 'DAIRY-CHED-SHR', name: 'Cheddar Cheese Shredded', category: 'Dairy', unit: 'lb', par: 40, vendor: 'SYSCO', cost: 5.20 },

      // Dry Goods
      { code: 'DRY-RICE-WHT', name: 'White Rice', category: 'Dry Goods', unit: 'lb', par: 100, vendor: 'SYSCO', cost: 0.80 },
      { code: 'DRY-PASTA-PENN', name: 'Penne Pasta', category: 'Dry Goods', unit: 'lb', par: 80, vendor: 'SYSCO', cost: 1.10 },
      { code: 'DRY-FLOUR-AP', name: 'All-Purpose Flour', category: 'Dry Goods', unit: 'lb', par: 120, vendor: 'SYSCO', cost: 0.45 },
    ];

    let itemCount = 0;
    for (const item of items) {
      const itemCheck = await client.query(
        `SELECT item_id FROM inventory_items WHERE item_code = $1`,
        [item.code]
      );

      if (itemCheck.rows.length === 0) {
        await client.query(`
          INSERT INTO inventory_items (
            item_code, item_name, category, unit, par_level,
            vendor, unit_cost, org_id, is_active, created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        `, [item.code, item.name, item.category, item.unit, item.par, item.vendor, item.cost, 1, true]);
        itemCount++;
      }
    }
    console.log(`  ✓ Created ${itemCount} inventory items (${items.length - itemCount} already existed)`);

    // ============================================================
    // 5. CREATE SAMPLE MENU (4-week rotation)
    // ============================================================
    console.log('\n[5/6] Creating sample menu...');

    const menuItems = [
      // Week 1
      { week: 1, day: 'Monday', meal: 'Lunch', item: 'Grilled Chicken Breast', recipe_code: 'LUNCH-CHKN-001' },
      { week: 1, day: 'Monday', meal: 'Dinner', item: 'Ribeye Steak 10oz', recipe_code: 'DINNER-BEEF-001' },
      { week: 1, day: 'Tuesday', meal: 'Lunch', item: 'Baked Salmon', recipe_code: 'LUNCH-FISH-001' },
      { week: 1, day: 'Tuesday', meal: 'Dinner', item: 'Pork Chops', recipe_code: 'DINNER-PORK-001' },
      // Week 2
      { week: 2, day: 'Monday', meal: 'Lunch', item: 'Chicken Caesar Salad', recipe_code: 'LUNCH-CHKN-002' },
      { week: 2, day: 'Monday', meal: 'Dinner', item: 'Ribeye Steak 12oz', recipe_code: 'DINNER-BEEF-002' },
      // Add more as needed...
    ];

    let menuCount = 0;
    for (const menu of menuItems) {
      const menuCheck = await client.query(
        `SELECT menu_id FROM menu WHERE week = $1 AND day_of_week = $2 AND meal_type = $3`,
        [menu.week, menu.day, menu.meal]
      );

      if (menuCheck.rows.length === 0) {
        await client.query(`
          INSERT INTO menu (week, day_of_week, meal_type, item_name, recipe_code, org_id, is_active, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        `, [menu.week, menu.day, menu.meal, menu.item, menu.recipe_code, 1, true]);
        menuCount++;
      }
    }
    console.log(`  ✓ Created ${menuCount} menu items (${menuItems.length - menuCount} already existed)`);

    // ============================================================
    // 6. CREATE INITIAL AI LEARNING INSIGHTS
    // ============================================================
    console.log('\n[6/6] Creating AI learning insights...');

    const insights = [
      {
        type: 'pattern_detection',
        title: 'Saturday Steak 10oz Pattern Detected',
        description: 'Historical data shows increased demand for 10oz ribeye steaks on Saturdays',
        confidence: 0.85,
        source: 'historical_analysis',
        impact: 75,
      },
      {
        type: 'waste_reduction',
        title: 'Lettuce Waste Reduction Opportunity',
        description: 'Par levels for romaine lettuce can be reduced by 15% based on usage patterns',
        confidence: 0.78,
        source: 'waste_analysis',
        impact: 60,
      },
    ];

    let insightCount = 0;
    for (const insight of insights) {
      const insightCheck = await client.query(
        `SELECT insight_id FROM ai_learning_insights WHERE title = $1`,
        [insight.title]
      );

      if (insightCheck.rows.length === 0) {
        await client.query(`
          INSERT INTO ai_learning_insights (
            insight_type, title, description, confidence, source_tag, impact_score,
            detected_at, created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        `, [insight.type, insight.title, insight.description, insight.confidence, insight.source, insight.impact]);
        insightCount++;
      }
    }
    console.log(`  ✓ Created ${insightCount} AI insights (${insights.length - insightCount} already existed)`);

    // ============================================================
    // COMMIT TRANSACTION
    // ============================================================
    await client.query('COMMIT');

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('  ✅ Database seeding complete!');
    console.log('═══════════════════════════════════════════════════════\n');

    console.log('📊 Summary:');
    console.log(`   Owner: owner@neuropilot.ai (Password: NeuroPilot2025!)`);
    console.log(`   Locations: ${locations.length}`);
    console.log(`   Vendors: ${vendors.length}`);
    console.log(`   Inventory Items: ${items.length}`);
    console.log(`   Menu Items: ${menuItems.length}`);
    console.log(`   AI Insights: ${insights.length}`);
    console.log('');
    console.log('🚀 Next Steps:');
    console.log('   1. Login at: https://resourceful-achievement-7-agent-neuropilotai.up.railway.app/login.html');
    console.log('   2. Email: owner@neuropilot.ai');
    console.log('   3. Password: NeuroPilot2025!');
    console.log('   4. Navigate to Owner Console');
    console.log('   5. Verify dashboards show data');
    console.log('');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ Seeding failed:', error);
    console.error('Error details:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('\n❌ Fatal error:', err);
      process.exit(1);
    });
}

module.exports = seedDatabase;
