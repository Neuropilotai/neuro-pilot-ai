#!/usr/bin/env node
/**
 * Generate admin-1 JWT token
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
  role: 'owner',
  permissions: [
    'inventory:read', 'inventory:write', 'inventory:delete', 'inventory:count', 'inventory:approve',
    'orders:read', 'orders:write', 'orders:delete',
    'users:read', 'users:write', 'users:delete',
    'reports:read', 'audit:read', 'settings:write',
    'system:admin', 'owner:console'
  ]
};

const token = jwt.sign(payload, secret, {
  expiresIn: '7d',
  algorithm: 'HS256',
  issuer: 'neuro-pilot-inventory',
  audience: 'inventory-users'
});

console.log(token);
