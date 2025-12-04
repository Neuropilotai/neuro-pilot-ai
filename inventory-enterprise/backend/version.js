/**
 * Version - Single Source of Truth
 * NeuroPilot AI Enterprise
 *
 * This module provides the authoritative app version.
 * Used by:
 * - Startup banner (server-v21_1.js)
 * - Asset cache-busting (HTML script tags)
 * - /api/version endpoint
 * - Health check responses
 */

const pkg = require('./package.json');

// Version priority: APP_VERSION env var > package.json version > fallback
const RAW_VERSION = process.env.APP_VERSION || pkg.version || '23.6.0';

// Normalize to "V{major}.{minor}.{patch}" format
const APP_VERSION = RAW_VERSION.startsWith('V')
  ? RAW_VERSION
  : `V${RAW_VERSION}`;

// Short version without "V" prefix (for asset URLs)
const APP_VERSION_SHORT = APP_VERSION.replace(/^V/, '');

module.exports = {
  APP_VERSION,           // e.g. "V23.4.10"
  APP_VERSION_SHORT,     // e.g. "23.4.10"
  RAW_VERSION,           // whatever was provided
};
