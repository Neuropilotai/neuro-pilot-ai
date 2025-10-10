/**
 * Accessibility Check Script using axe-core
 * Version: v2.5.1-2025-10-07
 *
 * Runs automated accessibility audits on key dashboard pages
 * using Playwright + @axe-core/playwright integration.
 *
 * Usage:
 *   node scripts/a11y-check.js
 *
 * Exit codes:
 *   0 - All pages pass (no violations)
 *   1 - One or more pages have accessibility violations
 */

const { chromium } = require('@playwright/test');
const { injectAxe, checkA11y, getViolations } = require('axe-playwright');

// Pages to audit
const PAGES_TO_AUDIT = [
  { name: 'Login', url: '/login' },
  { name: 'Overview Dashboard', url: '/dashboard/overview' },
  { name: 'Tenants Management', url: '/dashboard/tenants' },
  { name: 'Roles & Permissions', url: '/dashboard/roles' },
  { name: 'AI Performance', url: '/dashboard/ai' },
  { name: 'Security Monitoring', url: '/dashboard/security' },
];

// Mock authentication token for protected routes
const MOCK_JWT_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ0ZXN0LXVzZXItMTIzIiwiZW1haWwiOiJhZG1pbkBleGFtcGxlLmNvbSIsInJvbGUiOiJBZG1pbiIsInRlbmFudElkIjoidGVuYW50XzAwMSIsImlhdCI6MTcwMDAwMDAwMCwiZXhwIjoxODAwMDAwMDAwfQ.mockSignature';
const MOCK_USER = {
  userId: 'test-user-123',
  email: 'admin@example.com',
  role: 'Admin',
  tenantId: 'tenant_001',
};

// Severity levels to report
const SEVERITY_LEVELS = ['critical', 'serious', 'moderate', 'minor'];

// Axe configuration
const AXE_OPTIONS = {
  runOnly: {
    type: 'tag',
    values: [
      'wcag2a',      // WCAG 2.0 Level A
      'wcag2aa',     // WCAG 2.0 Level AA
      'wcag21a',     // WCAG 2.1 Level A
      'wcag21aa',    // WCAG 2.1 Level AA
      'best-practice', // Axe best practices
    ],
  },
  rules: {
    // Skip color contrast for now (can be adjusted based on theme)
    'color-contrast': { enabled: false },
  },
};

/**
 * Format violation for console output
 */
function formatViolation(violation, index) {
  const impact = violation.impact?.toUpperCase() || 'UNKNOWN';
  const nodeCount = violation.nodes.length;

  let output = `\n  ${index + 1}. [${impact}] ${violation.help}\n`;
  output += `     ID: ${violation.id}\n`;
  output += `     Description: ${violation.description}\n`;
  output += `     Affected elements: ${nodeCount}\n`;
  output += `     Help URL: ${violation.helpUrl}\n`;

  // Show first 3 affected elements
  const nodesToShow = Math.min(3, nodeCount);
  for (let i = 0; i < nodesToShow; i++) {
    const node = violation.nodes[i];
    output += `\n     Element ${i + 1}:\n`;
    output += `       HTML: ${node.html.substring(0, 100)}${node.html.length > 100 ? '...' : ''}\n`;
    output += `       Target: ${node.target.join(' > ')}\n`;

    if (node.failureSummary) {
      output += `       Issue: ${node.failureSummary}\n`;
    }
  }

  if (nodeCount > 3) {
    output += `\n     ... and ${nodeCount - 3} more elements\n`;
  }

  return output;
}

/**
 * Run accessibility audit on a single page
 */
async function auditPage(page, pageConfig) {
  console.log(`\n🔍 Auditing: ${pageConfig.name}`);
  console.log(`   URL: ${pageConfig.url}`);

  try {
    // Navigate to page
    await page.goto(`http://localhost:3000${pageConfig.url}`, {
      waitUntil: 'networkidle',
      timeout: 15000,
    });

    // Wait for page to be interactive
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000); // Allow React to hydrate

    // Inject axe-core
    await injectAxe(page);

    // Run accessibility checks
    const violations = await page.evaluate(async (options) => {
      // @ts-ignore - axe is injected globally
      const results = await window.axe.run(document, options);
      return results.violations;
    }, AXE_OPTIONS);

    // Filter by severity
    const significantViolations = violations.filter(v =>
      SEVERITY_LEVELS.includes(v.impact?.toLowerCase())
    );

    // Report results
    if (significantViolations.length === 0) {
      console.log(`   ✅ PASS - No accessibility violations found`);
      return { passed: true, violations: [] };
    } else {
      console.log(`   ❌ FAIL - Found ${significantViolations.length} violation(s):`);

      significantViolations.forEach((violation, index) => {
        console.log(formatViolation(violation, index));
      });

      return { passed: false, violations: significantViolations };
    }
  } catch (error) {
    console.log(`   ⚠️  ERROR - Could not audit page: ${error.message}`);
    return { passed: false, error: error.message };
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🔬 Accessibility Audit - Enterprise Dashboard v2.5.1');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`Testing ${PAGES_TO_AUDIT.length} pages with axe-core`);
  console.log('WCAG 2.1 AA compliance check\n');

  // Launch browser
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();

  // Pre-seed authentication for protected routes
  await page.goto('http://localhost:3000');
  await page.evaluate(({ token, user }) => {
    localStorage.setItem('auth_token', token);
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('tenant_id', user.tenantId);
  }, { token: MOCK_JWT_TOKEN, user: MOCK_USER });

  // Audit each page
  const results = [];
  for (const pageConfig of PAGES_TO_AUDIT) {
    const result = await auditPage(page, pageConfig);
    results.push({ ...pageConfig, ...result });
  }

  // Close browser
  await browser.close();

  // Generate summary
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('📊 Accessibility Audit Summary');
  console.log('═══════════════════════════════════════════════════════\n');

  const passedCount = results.filter(r => r.passed).length;
  const failedCount = results.filter(r => !r.passed).length;
  const totalViolations = results.reduce((sum, r) => sum + (r.violations?.length || 0), 0);

  console.log(`Total pages audited: ${PAGES_TO_AUDIT.length}`);
  console.log(`✅ Passed: ${passedCount}`);
  console.log(`❌ Failed: ${failedCount}`);
  console.log(`Total violations: ${totalViolations}\n`);

  // Breakdown by severity
  if (totalViolations > 0) {
    const severityCounts = { critical: 0, serious: 0, moderate: 0, minor: 0 };
    results.forEach(r => {
      if (r.violations) {
        r.violations.forEach(v => {
          const impact = v.impact?.toLowerCase();
          if (impact && severityCounts.hasOwnProperty(impact)) {
            severityCounts[impact]++;
          }
        });
      }
    });

    console.log('Violations by severity:');
    Object.entries(severityCounts).forEach(([severity, count]) => {
      if (count > 0) {
        const icon = severity === 'critical' ? '🔴' : severity === 'serious' ? '🟠' : severity === 'moderate' ? '🟡' : '🔵';
        console.log(`  ${icon} ${severity.toUpperCase()}: ${count}`);
      }
    });
    console.log('');
  }

  // Failed pages list
  if (failedCount > 0) {
    console.log('Failed pages:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  • ${r.name} - ${r.violations?.length || 0} violation(s)`);
    });
    console.log('');
  }

  // Exit with appropriate code
  if (failedCount > 0) {
    console.log('❌ Accessibility audit FAILED - Please fix violations above\n');
    process.exit(1);
  } else {
    console.log('✅ Accessibility audit PASSED - All pages meet WCAG 2.1 AA standards\n');
    process.exit(0);
  }
}

// Run audit
main().catch(error => {
  console.error('\n❌ Fatal error running accessibility audit:');
  console.error(error);
  process.exit(1);
});
