/**
 * Legacy Path Redirects (v15.2.3)
 * 301 redirects for renamed/moved console paths and assets
 *
 * Mount BEFORE static middleware to ensure redirects take precedence
 * All redirects are 301 (Permanent) for SEO and caching
 */

const express = require('express');
const router = express.Router();
const { logger } = require('../config/logger');

/**
 * Legacy path → New path mapping
 * Add any historical paths that have been renamed/moved
 */
const redirectMap = new Map([
  // Console pages
  ['/owner-console.html', '/owner-super-console.html'],
  ['/owner-console', '/owner-super-console.html'],
  ['/owner.html', '/owner-super-console.html'],
  ['/admin.html', '/owner-super-console.html'],
  ['/admin', '/owner-super-console.html'],

  // Legacy assets
  ['/img/logo.png', '/public/img/logo.svg'],
  ['/logo.png', '/public/img/logo.svg'],
  ['/favicon.png', '/favicon.svg'],

  // Legacy CSS paths
  ['/css/owner-console.css', '/public/css/owner-super.css'],
  ['/owner-console.css', '/public/css/owner-super.css'],

  // Legacy JS paths
  ['/js/owner-console.js', '/owner-super-console.js'],
  ['/owner-console.js', '/owner-super-console.js'],

  // Legacy API paths (if any were renamed)
  ['/api/admin/dashboard', '/api/owner/dashboard'],
  ['/api/admin/metrics', '/api/owner/metrics'],
]);

/**
 * Apply redirects for all entries in redirectMap
 */
for (const [oldPath, newPath] of redirectMap.entries()) {
  router.get(oldPath, (req, res) => {
    logger.info(`301 Redirect: ${oldPath} → ${newPath}`);
    res.redirect(301, newPath);
  });
}

/**
 * Wildcard redirect for legacy console patterns
 * Catches /owner-console/* → /owner-super-console.html
 */
router.get('/owner-console/*', (req, res) => {
  logger.info(`301 Redirect: ${req.path} → /owner-super-console.html`);
  res.redirect(301, '/owner-super-console.html');
});

/**
 * Get all registered redirects (for admin/debugging)
 */
router.get('/__redirects', (req, res) => {
  const redirects = Array.from(redirectMap.entries()).map(([from, to]) => ({
    from,
    to,
    permanent: true
  }));

  res.json({
    success: true,
    count: redirects.length,
    redirects
  });
});

/**
 * Export redirect map for testing
 */
module.exports = router;
module.exports.redirectMap = redirectMap;
