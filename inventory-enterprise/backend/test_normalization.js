#!/usr/bin/env node
/**
 * Test Email Normalization
 */

const validator = require('express-validator');

// Test what normalizeEmail does
const testEmails = [
  'neuro.pilot.ai@gmail.com',
  'Neuro.Pilot.AI@gmail.com',
  'neuropilotai@gmail.com'
];

console.log('Testing express-validator normalizeEmail:\n');

testEmails.forEach(email => {
  // Simulate what normalizeEmail does
  const normalized = email.toLowerCase().replace(/\./g, '').replace(/@gmail\.com$/, '@gmail.com');
  const simpleNormalized = email.toLowerCase();

  console.log(`Input:      ${email}`);
  console.log(`Normalized: ${normalized}`);
  console.log(`Simple:     ${simpleNormalized}`);
  console.log('');
});

// Check what's actually in the users map
const { users } = require('./middleware/auth');

console.log('═══════════════════════════════════════');
console.log('Users in memory:');
for (const [email, user] of users.entries()) {
  console.log(`  ${email} → ${user.firstName} ${user.lastName}`);
}
