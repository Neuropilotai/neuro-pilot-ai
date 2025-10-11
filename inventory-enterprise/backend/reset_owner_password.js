#!/usr/bin/env node
/**
 * Quick Password Reset for Owner Account
 * Usage: node reset_owner_password.js <new-password>
 */

const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'db', 'inventory_enterprise.db');
const db = new sqlite3.Database(dbPath);

// Get new password from command line or use default
const newPassword = process.argv[2] || 'owner123';

console.log('🔐 Resetting Owner Account Password...\n');

// Hash the new password
bcrypt.hash(newPassword, 10, (err, hash) => {
  if (err) {
    console.error('❌ Error hashing password:', err);
    process.exit(1);
  }

  // Update the password in database
  db.run(
    `UPDATE users
     SET password_hash = ?,
         updated_at = CURRENT_TIMESTAMP,
         failed_login_attempts = 0,
         locked_until = NULL
     WHERE email = 'neuro.pilot.ai@gmail.com'`,
    [hash],
    function(err) {
      if (err) {
        console.error('❌ Error updating password:', err);
        db.close();
        process.exit(1);
      }

      if (this.changes === 0) {
        console.error('❌ No user found with email: neuro.pilot.ai@gmail.com');
        db.close();
        process.exit(1);
      }

      console.log('✅ Password reset successful!\n');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📧 Email:    neuro.pilot.ai@gmail.com');
      console.log('🔑 Password:', newPassword);
      console.log('🎯 Role:     owner (full access)');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      console.log('🌐 Login at: http://localhost:8083/\n');
      console.log('After login, you will be redirected to Owner Console automatically.');

      db.close();
    }
  );
});
