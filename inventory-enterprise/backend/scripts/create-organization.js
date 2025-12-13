/**
 * Create Organization CLI
 * 
 * Creates a new organization in the database
 * 
 * Usage:
 *   node scripts/create-organization.js <name> [subdomain] [apiKey]
 */

const { pool } = require('../db');
const { v4: uuidv4 } = require('uuid');

async function createOrganization(name, subdomain, apiKey) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const orgId = uuidv4();
    
    // Check if subdomain already exists
    if (subdomain) {
      const existing = await client.query(
        'SELECT id FROM organizations WHERE slug = $1',
        [subdomain]
      );
      if (existing.rows.length > 0) {
        throw new Error(`Subdomain ${subdomain} already exists`);
      }
    }
    
    // Check if API key already exists
    if (apiKey) {
      const existing = await client.query(
        'SELECT id FROM organizations WHERE api_key = $1',
        [apiKey]
      );
      if (existing.rows.length > 0) {
        throw new Error(`API key already exists`);
      }
    }
    
    // Insert organization
    const result = await client.query(
      `INSERT INTO organizations (
        id, name, slug, api_key, billing_plan, billing_status,
        max_users, max_items, max_locations, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      RETURNING id, name, slug, api_key`,
      [
        orgId,
        name,
        subdomain || null,
        apiKey || null,
        'free',
        'active',
        3,    // max_users
        500,  // max_items
        5     // max_locations
      ]
    );
    
    await client.query('COMMIT');
    
    const org = result.rows[0];
    console.log('✅ Organization created:');
    console.log(`   ID: ${org.id}`);
    console.log(`   Name: ${org.name}`);
    if (org.slug) console.log(`   Subdomain: ${org.slug}`);
    if (org.api_key) console.log(`   API Key: ${org.api_key}`);
    
    return org;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error('Usage: node scripts/create-organization.js <name> [subdomain] [apiKey]');
    process.exit(1);
  }
  
  const [name, subdomain, apiKey] = args;
  
  createOrganization(name, subdomain, apiKey)
    .then(() => {
      console.log('✅ Done');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Error:', error.message);
      process.exit(1);
    });
}

module.exports = { createOrganization };

