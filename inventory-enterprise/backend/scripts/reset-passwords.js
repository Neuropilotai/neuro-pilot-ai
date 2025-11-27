#!/usr/bin/env node
/**
 * Password Reset Script
 *
 * Use this script to reset passwords after a security breach.
 * Run: node scripts/reset-passwords.js
 */

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const readline = require('readline');
const path = require('path');

// Database connection
let db;
try {
  const Database = require('../config/database');
  db = Database.getConnection ? Database.getConnection() : new Database().db;
} catch (err) {
  console.error('Warning: Could not connect to database. Will only update in-memory accounts.');
  db = null;
}

const BCRYPT_ROUNDS = 12;

// Generate a strong random password
function generateStrongPassword(length = 16) {
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  const special = '!@#$%^&*()_+-=[]{}|;:,.<>?';
  const all = lowercase + uppercase + numbers + special;

  // Ensure at least one of each type
  let password = '';
  password += lowercase[crypto.randomInt(lowercase.length)];
  password += uppercase[crypto.randomInt(uppercase.length)];
  password += numbers[crypto.randomInt(numbers.length)];
  password += special[crypto.randomInt(special.length)];

  // Fill the rest randomly
  for (let i = 4; i < length; i++) {
    password += all[crypto.randomInt(all.length)];
  }

  // Shuffle the password
  return password.split('').sort(() => crypto.randomInt(3) - 1).join('');
}

// Generate new JWT secrets
function generateJWTSecret() {
  return crypto.randomBytes(64).toString('hex');
}

async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

async function updateDatabaseUser(email, passwordHash) {
  if (!db) return false;

  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE app_user SET password_hash = ?, password_updated_at = datetime('now') WHERE email = ?`,
      [passwordHash, email],
      function(err) {
        if (err) {
          console.error(`  Error updating ${email}:`, err.message);
          resolve(false);
        } else if (this.changes === 0) {
          console.log(`  User ${email} not found in database`);
          resolve(false);
        } else {
          console.log(`  Updated ${email} in database`);
          resolve(true);
        }
      }
    );
  });
}

async function listDatabaseUsers() {
  if (!db) return [];

  return new Promise((resolve, reject) => {
    db.all(
      `SELECT id, email, role, is_active, last_login FROM app_user ORDER BY role, email`,
      [],
      (err, rows) => {
        if (err) {
          console.error('Error listing users:', err.message);
          resolve([]);
        } else {
          resolve(rows || []);
        }
      }
    );
  });
}

async function revokeAllRefreshTokens() {
  if (!db) return;

  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE refresh_token SET revoked_at = datetime('now') WHERE revoked_at IS NULL`,
      [],
      function(err) {
        if (err) {
          console.error('Error revoking tokens:', err.message);
        } else {
          console.log(`  Revoked ${this.changes} active refresh tokens`);
        }
        resolve();
      }
    );
  });
}

async function main() {
  console.log('\n========================================');
  console.log('  PASSWORD RESET SCRIPT');
  console.log('  Post-Breach Security Recovery');
  console.log('========================================\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

  try {
    // List current users
    console.log('Current database users:');
    const users = await listDatabaseUsers();
    if (users.length === 0) {
      console.log('  No users found in database (or database not connected)\n');
    } else {
      users.forEach(u => {
        console.log(`  - ${u.email} (${u.role}) ${u.is_active ? '' : '[INACTIVE]'}`);
      });
      console.log('');
    }

    // Compromised accounts from breach notification
    const compromisedAccounts = [
      'admin@neuropilot.ai',
      'owner@neuropilot.ai'
    ];

    console.log('Compromised accounts (from breach notification):');
    compromisedAccounts.forEach(email => console.log(`  - ${email}`));
    console.log('');

    const proceed = await question('Generate new passwords for compromised accounts? (y/n): ');

    if (proceed.toLowerCase() !== 'y') {
      console.log('Aborted.');
      rl.close();
      process.exit(0);
    }

    console.log('\n--- Generating new passwords ---\n');

    const newCredentials = [];

    for (const email of compromisedAccounts) {
      const newPassword = generateStrongPassword(20);
      const hash = await hashPassword(newPassword);

      // Update in database
      await updateDatabaseUser(email, hash);

      newCredentials.push({ email, password: newPassword });
    }

    // Also handle any additional users
    const additionalEmails = await question('\nEnter additional emails to reset (comma-separated, or press Enter to skip): ');

    if (additionalEmails.trim()) {
      const emails = additionalEmails.split(',').map(e => e.trim()).filter(e => e);
      for (const email of emails) {
        const newPassword = generateStrongPassword(20);
        const hash = await hashPassword(newPassword);
        await updateDatabaseUser(email, hash);
        newCredentials.push({ email, password: newPassword });
      }
    }

    // Revoke all sessions
    console.log('\n--- Revoking all active sessions ---');
    await revokeAllRefreshTokens();

    // Generate new JWT secrets
    console.log('\n--- New JWT Secrets (update in .env) ---\n');
    const newJwtSecret = generateJWTSecret();
    const newRefreshSecret = generateJWTSecret();

    console.log(`JWT_SECRET=${newJwtSecret}`);
    console.log(`JWT_REFRESH_SECRET=${newRefreshSecret}`);

    // Output new credentials
    console.log('\n========================================');
    console.log('  NEW CREDENTIALS (SAVE SECURELY!)');
    console.log('========================================\n');

    newCredentials.forEach(({ email, password }) => {
      console.log(`Email:    ${email}`);
      console.log(`Password: ${password}`);
      console.log('---');
    });

    console.log('\n IMPORTANT NEXT STEPS:');
    console.log('1. Update .env with the new JWT secrets above');
    console.log('2. Save the new passwords in a secure password manager');
    console.log('3. Restart the server to apply changes');
    console.log('4. Update hardcoded credentials in middleware/auth.js');
    console.log('5. Redeploy to Railway\n');

    rl.close();

    if (db && db.close) {
      db.close();
    }

  } catch (error) {
    console.error('Error:', error);
    rl.close();
    process.exit(1);
  }
}

main();
