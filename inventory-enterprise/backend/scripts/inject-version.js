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

// Build timestamp for cache-busting
const BUILD_TS = Date.now();

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// Files that need version injection
const HTML_FILES = [
  'owner-super-console.html',
  'owner-super-console-v15.html',
  'owner-super-console-enterprise.html',
  'login.html',
];

// JS files that may contain placeholders (e.g., version check)
const JS_FILES = [
  'js/owner-console-version-check.js',
];

console.log(`[inject-version] Starting version injection: ${APP_VERSION_SHORT} (ts=${BUILD_TS})`);

let filesUpdated = 0;

function replacePlaceholders(filePath, label, isJs = false) {
  let content = fs.readFileSync(filePath, 'utf8');

  const placeholderVersionCount = (content.match(/__ASSET_VERSION__/g) || []).length;
  const placeholderTsCount = (content.match(/__BUILD_TS__/g) || []).length;

  if (placeholderVersionCount > 0 || placeholderTsCount > 0) {
    content = content
      .replace(/__ASSET_VERSION__/g, APP_VERSION_SHORT)
      .replace(/__BUILD_TS__/g, String(BUILD_TS));
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`[inject-version] ✓ ${label}: replaced ${placeholderVersionCount} version placeholder(s) and ${placeholderTsCount} ts placeholder(s)`);
    return true;
  }

  let changed = false;

  if (isJs) {
    // Update EXPECTED_VERSION and TIMESTAMP constants if present
    const versionConstPattern = /(const\s+EXPECTED_VERSION\s*=\s*')[^']+(')/;
    if (versionConstPattern.test(content)) {
      content = content.replace(versionConstPattern, `$1${APP_VERSION_SHORT}$2`);
      changed = true;
      console.log(`[inject-version] ✓ ${label}: EXPECTED_VERSION set to ${APP_VERSION_SHORT}`);
    }

    const tsConstPattern = /(const\s+TIMESTAMP\s*=\s*')[0-9]+(')/;
    if (tsConstPattern.test(content)) {
      content = content.replace(tsConstPattern, `$1${BUILD_TS}$2`);
      changed = true;
      console.log(`[inject-version] ✓ ${label}: TIMESTAMP set to ${BUILD_TS}`);
    }
  }

  // Fallback: update existing ?v= strings
  const versionPattern = /(\?v=)[\d.]+/g;
  const matches = content.match(versionPattern);

  if (matches && matches.length > 0) {
    content = content.replace(versionPattern, `$1${APP_VERSION_SHORT}`);
    changed = true;
    console.log(`[inject-version] ✓ ${label}: ${matches.length} version string(s) updated to ${APP_VERSION_SHORT}`);
  }

  // Also bump cache-busting timestamps if present
  const tsPattern = /(_t=)[0-9]+/g;
  const tsMatches = content.match(tsPattern);
  if (tsMatches && tsMatches.length > 0) {
    content = content.replace(tsPattern, `$1${BUILD_TS}`);
    changed = true;
    console.log(`[inject-version] ✓ ${label}: ${tsMatches.length} timestamp(s) updated to ${BUILD_TS}`);
  }

  if (changed) {
    fs.writeFileSync(filePath, content, 'utf8');
    return true;
  }

  console.log(`[inject-version] - ${label}: No changes needed`);
  return false;
}

for (const file of HTML_FILES) {
  const filePath = path.join(PUBLIC_DIR, file);

  if (!fs.existsSync(filePath)) {
    console.warn(`[inject-version] File not found: ${file}`);
    continue;
  }

  if (replacePlaceholders(filePath, file)) {
    filesUpdated++;
  }
}

for (const file of JS_FILES) {
  const filePath = path.join(PUBLIC_DIR, file);

  if (!fs.existsSync(filePath)) {
    console.warn(`[inject-version] JS file not found: ${file}`);
    continue;
  }

  if (replacePlaceholders(filePath, file, true)) {
    filesUpdated++;
  }
}

console.log(`[inject-version] Complete: ${filesUpdated} file(s) updated with version ${APP_VERSION_SHORT}`);
