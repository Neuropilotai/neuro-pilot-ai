#!/usr/bin/env node
/**
 * inject-version.js - Asset Cache Busting
 * NeuroPilot AI Enterprise
 *
 * Replaces __ASSET_VERSION__ placeholder in HTML files with actual version.
 * This ensures browsers always load the correct JS bundle.
 *
 * Usage: node scripts/inject-version.js
 * Called automatically during: npm run build
 */

const fs = require('fs');
const path = require('path');
const { APP_VERSION_SHORT } = require('../version');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// HTML files that need version injection
const HTML_FILES = [
  'owner-super-console.html',
  'owner-super-console-v15.html',
  'owner-super-console-enterprise.html',
  'login.html',
];

console.log(`[inject-version] Starting version injection: ${APP_VERSION_SHORT}`);

let filesUpdated = 0;

for (const file of HTML_FILES) {
  const filePath = path.join(PUBLIC_DIR, file);

  if (!fs.existsSync(filePath)) {
    console.warn(`[inject-version] File not found: ${file}`);
    continue;
  }

  let html = fs.readFileSync(filePath, 'utf8');

  // Replace placeholder with actual version
  const placeholderCount = (html.match(/__ASSET_VERSION__/g) || []).length;

  if (placeholderCount > 0) {
    html = html.replace(/__ASSET_VERSION__/g, APP_VERSION_SHORT);
    fs.writeFileSync(filePath, html, 'utf8');
    console.log(`[inject-version] ✓ ${file}: ${placeholderCount} placeholder(s) replaced`);
    filesUpdated++;
  } else {
    // Also update any hardcoded version numbers in script tags
    // Match patterns like ?v=23.3, ?v=21.0.0, ?v=23.4
    const versionPattern = /(\?v=)[\d.]+/g;
    const matches = html.match(versionPattern);

    if (matches && matches.length > 0) {
      html = html.replace(versionPattern, `$1${APP_VERSION_SHORT}`);
      fs.writeFileSync(filePath, html, 'utf8');
      console.log(`[inject-version] ✓ ${file}: ${matches.length} version string(s) updated to ${APP_VERSION_SHORT}`);
      filesUpdated++;
    } else {
      console.log(`[inject-version] - ${file}: No changes needed`);
    }
  }
}

console.log(`[inject-version] Complete: ${filesUpdated} file(s) updated with version ${APP_VERSION_SHORT}`);
