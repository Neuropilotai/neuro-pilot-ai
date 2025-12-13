/**
 * Validate Migration
 * 
 * Validates that the multi-tenant migration was applied correctly
 * 
 * Usage:
 *   node scripts/validate-migration.js
 */

const { pool } = require('../db');

async function validateMigration() {
  const checks = [];
  let allPassed = true;
  
  // Check 1: Organizations table exists
  try {
    const result = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'organizations'
      ) as exists
    `);
    const exists = result.rows[0].exists;
    checks.push({ name: 'Organizations table exists', passed: exists });
    if (!exists) allPassed = false;
  } catch (error) {
    checks.push({ name: 'Organizations table exists', passed: false, error: error.message });
    allPassed = false;
  }
  
  // Check 2: Inventory balances table exists
  try {
    const result = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'inventory_balances'
      ) as exists
    `);
    const exists = result.rows[0].exists;
    checks.push({ name: 'Inventory balances table exists', passed: exists });
    if (!exists) allPassed = false;
  } catch (error) {
    checks.push({ name: 'Inventory balances table exists', passed: false, error: error.message });
    allPassed = false;
  }
  
  // Check 3: Trigger exists
  try {
    const result = await pool.query(`
      SELECT EXISTS (
        SELECT FROM pg_trigger 
        WHERE tgname = 'inventory_ledger_balance_trigger'
      ) as exists
    `);
    const exists = result.rows[0].exists;
    checks.push({ name: 'Balance trigger exists', passed: exists });
    if (!exists) allPassed = false;
  } catch (error) {
    checks.push({ name: 'Balance trigger exists', passed: false, error: error.message });
    allPassed = false;
  }
  
  // Check 4: Indexes exist
  try {
    const indexes = await pool.query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'inventory_balances'
    `);
    const indexNames = indexes.rows.map(r => r.indexname);
    const hasUniqueIndex = indexNames.some(name => name.includes('unique'));
    const hasOrgItemIndex = indexNames.some(name => name.includes('org_item'));
    checks.push({ name: 'Balance table indexes exist', passed: hasUniqueIndex && hasOrgItemIndex });
    if (!hasUniqueIndex || !hasOrgItemIndex) allPassed = false;
  } catch (error) {
    checks.push({ name: 'Balance table indexes exist', passed: false, error: error.message });
    allPassed = false;
  }
  
  // Print results
  console.log('\n📋 Migration Validation Results:\n');
  checks.forEach((check, index) => {
    const icon = check.passed ? '✅' : '❌';
    console.log(`${icon} ${check.name}`);
    if (check.error) {
      console.log(`   Error: ${check.error}`);
    }
  });
  
  console.log(`\n${allPassed ? '✅ All checks passed' : '❌ Some checks failed'}\n`);
  
  return allPassed;
}

// CLI
if (require.main === module) {
  validateMigration()
    .then((passed) => {
      process.exit(passed ? 0 : 1);
    })
    .catch((error) => {
      console.error('❌ Error:', error.message);
      process.exit(1);
    });
}

module.exports = { validateMigration };

