#!/usr/bin/env node
/**
 * Generate secure secrets for Railway environment variables
 * Usage: node generate-railway-secrets.js
 */

const crypto = require('crypto');

console.log('\n========================================');
console.log('🔐 Railway Environment Variables');
console.log('========================================\n');

console.log('Copy these to Railway Dashboard → Variables:\n');

console.log('# JWT Secrets (64 bytes each)');
console.log('JWT_SECRET=' + crypto.randomBytes(64).toString('hex'));
console.log('JWT_REFRESH_SECRET=' + crypto.randomBytes(64).toString('hex'));
console.log('');

console.log('# Encryption Keys (32 bytes each)');
console.log('DATA_ENCRYPTION_KEY=' + crypto.randomBytes(32).toString('hex'));
console.log('ENCRYPTION_KEY=' + crypto.randomBytes(32).toString('hex'));
console.log('');

console.log('# Session Secret (32 bytes)');
console.log('SESSION_SECRET=' + crypto.randomBytes(32).toString('hex'));
console.log('');

console.log('========================================');
console.log('✅ Secrets generated successfully!');
console.log('========================================\n');

console.log('Next steps:');
console.log('1. Go to Railway Dashboard → Your Project → Variables');
console.log('2. Paste these secrets as environment variables');
console.log('3. Add DATABASE_URL=${{Postgres.DATABASE_URL}}');
console.log('4. Add ALLOWED_ORIGINS=https://neuropilot-inventory-ngrq6b78x-david-mikulis-projects-73b27c6d.vercel.app');
console.log('5. Deploy your backend\n');

console.log('⚠️  SECURITY WARNING:');
console.log('- Never commit these secrets to Git');
console.log('- Store them only in Railway environment variables');
console.log('- Rotate secrets periodically\n');
