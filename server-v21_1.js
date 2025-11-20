/**
 * Root loader for Railway
 * This matches Nixpacks' "start: node server-v21_1.js"
 * and forwards to the real backend entrypoint.
 */
require('./inventory-enterprise/backend/server-v21_1.js');
