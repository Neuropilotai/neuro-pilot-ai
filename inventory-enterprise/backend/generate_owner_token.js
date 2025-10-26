#!/usr/bin/env node
/**
 * Generate OWNER JWT token for v15.5.4
 * Simplified version without issuer/audience (which causes verification issues)
 */
require('dotenv').config();
const jwt = require('jsonwebtoken');

const secret = process.env.JWT_SECRET;

if (!secret || secret.length === 0) {
  console.error('ERROR: JWT_SECRET not found or empty in .env');
  process.exit(1);
}

const payload = {
  id: 'admin-1',
  email: 'neuropilotai@gmail.com',
  role: 'owner'
};

const token = jwt.sign(payload, secret, {
  expiresIn: '365d'
});

console.log(token);
