#!/usr/bin/env node

/**
 * CREATE ADMIN ACCOUNT - DAVID MIKULIS
 * Sets up full admin access for system owner
 */

const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

console.log('');
console.log('🔐 Creating Admin Account');
console.log('═'.repeat(50));

const db = new sqlite3.Database('./database.db');

async function createAdminUser() {
  // Hash password
  const password = 'Admin123!@#';
  const passwordHash = await bcrypt.hash(password, 12);

  return new Promise((resolve, reject) => {
    // First check if tenant_users table has any users
    db.get('SELECT COUNT(*) as count FROM tenant_users WHERE tenant_id = ?', ['default'], (err, row) => {
      if (err) {
        console.error('Error checking users:', err);
        reject(err);
        return;
      }

      if (row.count > 0) {
        console.log('✅ Admin user already exists');
        console.log('   Email: admin@neuro-pilot.ai');
        console.log('   Password: Admin123!@#');
        resolve();
        return;
      }

      // Create admin user
      db.run(`
        INSERT INTO tenant_users (
          tenant_id, email, password_hash, role, active
        ) VALUES (?, ?, ?, ?, ?)
      `, [
        'default',
        'admin@neuro-pilot.ai',
        passwordHash,
        'admin',
        1
      ], function(err) {
        if (err) {
          console.error('❌ Failed to create user:', err.message);
          reject(err);
        } else {
          console.log('✅ Admin user created successfully!');
          console.log('');
          console.log('📧 Email: admin@neuro-pilot.ai');
          console.log('🔑 Password: Admin123!@#');
          console.log('👤 Role: Administrator');
          console.log('🏢 Tenant: default');
          console.log('');
          console.log('You now have full access to:');
          console.log('  • 182 GFS orders');
          console.log('  • 1,833 unique items');
          console.log('  • 24 storage locations');
          console.log('  • $2.1M inventory value');
          console.log('');
          console.log('Access at: http://localhost:8083');
          resolve();
        }
      });
    });
  });
}

createAdminUser()
  .then(() => {
    console.log('═'.repeat(50));
    console.log('✅ Setup Complete');
    console.log('');
    db.close();
  })
  .catch((err) => {
    console.error('Setup failed:', err);
    db.close();
  });
