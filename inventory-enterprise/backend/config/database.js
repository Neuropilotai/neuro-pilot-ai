/**
 * Database Configuration
 * PostgreSQL adapter with SQLite-compatible interface
 *
 * MIGRATED: This file now uses PostgreSQL via ../db.js
 * Legacy SQLite code has been removed.
 *
 * This file provides backwards compatibility for services
 * that expect the old SQLite-style API (get, all, run).
 * New code should use ../db.js directly.
 */

// Import the unified PostgreSQL db layer
const db = require('../db');

// Export the SQLite-compatible adapter
// This provides get(), all(), run(), query() methods
// that work with PostgreSQL but have the same interface as SQLite
module.exports = db.sqliteCompat;
