/**
 * List Organizations CLI
 * 
 * Lists all organizations in the database
 * 
 * Usage:
 *   node scripts/list-organizations.js
 */

const { pool } = require('../db');

async function listOrganizations() {
  const result = await pool.query(
    `SELECT 
      id, 
      name, 
      slug, 
      billing_plan, 
      billing_status,
      max_users,
      max_items,
      max_locations,
      created_at
    FROM organizations 
    WHERE deleted_at IS NULL
    ORDER BY created_at DESC`
  );
  
  if (result.rows.length === 0) {
    console.log('No organizations found');
    return [];
  }
  
  console.log(`\nFound ${result.rows.length} organization(s):\n`);
  result.rows.forEach((org, index) => {
    console.log(`${index + 1}. ${org.name}`);
    console.log(`   ID: ${org.id}`);
    if (org.slug) console.log(`   Subdomain: ${org.slug}`);
    console.log(`   Plan: ${org.billing_plan} (${org.billing_status})`);
    console.log(`   Limits: ${org.max_users} users, ${org.max_items} items, ${org.max_locations} locations`);
    console.log(`   Created: ${org.created_at}`);
    console.log('');
  });
  
  return result.rows;
}

// CLI
if (require.main === module) {
  listOrganizations()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Error:', error.message);
      process.exit(1);
    });
}

module.exports = { listOrganizations };

