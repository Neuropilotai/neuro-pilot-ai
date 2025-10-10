# Testing Guide - Enterprise Dashboard v2.5.1
**Version:** 2025-10-07
**Author:** NeuroInnovate Development Team

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Test Types](#test-types)
4. [Running Tests Locally](#running-tests-locally)
5. [CI/CD Integration](#cicd-integration)
6. [Test Coverage](#test-coverage)
7. [Troubleshooting](#troubleshooting)
8. [Best Practices](#best-practices)

---

## Overview

The Enterprise Dashboard v2.5.1 includes a comprehensive testing suite covering:

- **E2E Testing** - User flows and integration testing with Playwright
- **Performance** - Page load metrics and bundle size validation with Lighthouse CI
- **Accessibility** - WCAG 2.1 AA compliance with axe-core
- **Load Testing** - Stress testing with k6 for WebSocket and API endpoints
- **Security** - Secret scanning with gitleaks and npm audit

**Success Criteria:**
- ✅ E2E tests: 51 tests across 5 spec files (100% pass rate)
- ✅ Lighthouse: Performance ≥85, Accessibility ≥90, Best Practices ≥95
- ✅ k6: Median WS latency <500ms, P95 <2s
- ✅ Accessibility: Zero critical/serious violations

---

## Prerequisites

### System Requirements

- **Node.js:** 18.x or higher
- **npm:** 9.x or higher
- **OS:** macOS, Linux, or Windows WSL2
- **Memory:** 8GB RAM minimum (16GB recommended for load tests)
- **Disk:** 2GB free space for test artifacts

### Installation

```bash
# Navigate to dashboard directory
cd frontend/dashboard

# Install dependencies (includes test tools)
npm ci

# Install Playwright browsers
npx playwright install --with-deps

# Verify installations
npx playwright --version
npx lhci --version
k6 version  # Requires separate k6 installation (see below)
```

### Installing k6 (Load Testing)

**macOS:**
```bash
brew install k6
```

**Linux (Debian/Ubuntu):**
```bash
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

**Windows:**
```powershell
choco install k6
```

### Installing gitleaks (Secret Scanning)

**macOS:**
```bash
brew install gitleaks
```

**Linux:**
```bash
wget https://github.com/gitleaks/gitleaks/releases/download/v8.18.0/gitleaks_8.18.0_linux_x64.tar.gz
tar -xzf gitleaks_8.18.0_linux_x64.tar.gz
sudo mv gitleaks /usr/local/bin/
```

---

## Test Types

### 1. E2E Tests (Playwright)

**Purpose:** Validate user flows, UI interactions, and integration between frontend and backend.

**Location:** `frontend/dashboard/e2e/`

**Spec Files:**
- `auth.spec.ts` - Login, 2FA, logout, session persistence (8 tests)
- `overview.spec.ts` - Dashboard metrics, charts, WebSocket updates (10 tests)
- `tenants.spec.ts` - Tenant management, RBAC enforcement (10 tests)
- `ai.spec.ts` - AI performance charts, real-time events (11 tests)
- `security.spec.ts` - Security monitoring, RBAC denials (12 tests)

**Test Fixtures:**
- Mock JWT authentication tokens
- Pre-seeded localStorage for authenticated tests
- Helper functions: `waitForMetrics()`, `waitForChart()`

### 2. Performance Testing (Lighthouse CI)

**Purpose:** Measure page load performance, identify optimization opportunities, enforce performance budgets.

**Configuration:** `lighthouserc.json`

**Metrics Tracked:**
- First Contentful Paint (FCP)
- Largest Contentful Paint (LCP)
- Time to Interactive (TTI)
- Cumulative Layout Shift (CLS)
- Total Blocking Time (TBT)
- Speed Index

**Pages Audited:**
- /login
- /dashboard/overview
- /dashboard/tenants
- /dashboard/roles
- /dashboard/ai
- /dashboard/security

### 3. Accessibility Testing (axe-core)

**Purpose:** Ensure WCAG 2.1 AA compliance, identify accessibility barriers.

**Script:** `scripts/a11y-check.js`

**Checks:**
- Color contrast ratios
- ARIA attributes and roles
- Keyboard navigation
- Screen reader compatibility
- Form labels and button names
- Semantic HTML structure

### 4. Load Testing (k6)

**Purpose:** Validate system performance under concurrent load, identify bottlenecks.

**Scripts:**
- `ops/k6/ws_realtime.js` - WebSocket stress test (100 VUs)
- `ops/k6/api_metrics.js` - API endpoint stress test (100 VUs)

**Metrics:**
- WebSocket connection time
- Event delivery latency
- API response time (p50, p95, p99)
- Error rates
- Throughput (requests/sec)

### 5. Security Testing

**Tools:**
- **npm audit** - Dependency vulnerability scanning
- **gitleaks** - Secret detection in code/commits
- **ESLint** - Security-focused linting rules

**Configuration:** `.gitleaks.toml`

---

## Running Tests Locally

### Quick Start (Run All Tests)

```bash
# From frontend/dashboard directory
npm run test:all
```

This command runs:
1. Lint checks
2. E2E tests (Playwright)
3. Lighthouse CI
4. Accessibility audit

### Individual Test Commands

#### E2E Tests (Playwright)

```bash
# Run all E2E tests
npm run test:e2e

# Run specific spec file
npx playwright test e2e/auth.spec.ts

# Run specific browser
npx playwright test --project=chromium

# Run in UI mode (interactive debugging)
npx playwright test --ui

# Run with trace viewer
npx playwright test --trace on

# Generate and open HTML report
npx playwright show-report
```

**Environment Variables:**
```bash
# Custom API URL
export VITE_API_URL=https://staging-api.example.com
npm run test:e2e

# Headful mode (see browser)
npx playwright test --headed

# Debug mode
npx playwright test --debug
```

#### Performance Tests (Lighthouse)

```bash
# Run Lighthouse CI on all pages
npm run test:lighthouse

# Run on specific page
npx lhci autorun --collect.url="http://localhost:3000/dashboard/overview"

# View reports
open .lighthouseci/lighthouse-*.report.html
```

**Pre-requisite:** Dev server must be running
```bash
# Terminal 1
npm run dev

# Terminal 2
npm run test:lighthouse
```

#### Accessibility Tests

```bash
# Run axe-core audit
npm run test:a11y

# Run with verbose output
node scripts/a11y-check.js
```

**Note:** Dev server must be running on `http://localhost:3000`

#### Load Tests (k6)

```bash
# API metrics load test
cd ../../ops/k6
k6 run api_metrics.js

# WebSocket load test
k6 run ws_realtime.js

# Custom VU count and duration
k6 run --vus 50 --duration 60s api_metrics.js

# Generate JSON summary
k6 run --out json=results.json api_metrics.js
```

**Environment Variables:**
```bash
# Custom backend URL
export API_URL=https://staging-api.example.com
export WS_URL=wss://staging-api.example.com
k6 run api_metrics.js
```

#### Security Scans

```bash
# Run npm audit
npm audit --audit-level=high

# Fix vulnerabilities automatically
npm audit fix

# Run gitleaks on current repo
gitleaks detect --config ../../.gitleaks.toml --verbose

# Scan specific commit range
gitleaks detect --source . --log-opts="HEAD~10..HEAD"

# Pre-commit hook (scan staged files)
gitleaks protect --staged --config ../../.gitleaks.toml
```

---

## CI/CD Integration

### GitHub Actions Workflow

**File:** `.github/workflows/frontend-release.yml`

**Trigger Events:**
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop`
- Release published
- Manual workflow dispatch

**Pipeline Stages:**

1. **Lint & Type Check** (2-3 minutes)
   - ESLint validation
   - TypeScript type checking

2. **Security Scan** (3-5 minutes)
   - npm audit (high-severity only)
   - gitleaks secret scanning

3. **Build** (5-7 minutes)
   - Vite production build
   - Bundle size validation
   - Artifact upload

4. **E2E Tests** (10-15 minutes)
   - Playwright tests across 3 browsers (matrix)
   - HTML report generation
   - Flake retry (2 attempts)

5. **Lighthouse CI** (8-10 minutes)
   - Performance audits on 6 pages
   - Budget enforcement
   - Report upload

6. **Accessibility Audit** (5-7 minutes)
   - axe-core WCAG 2.1 AA validation
   - Violation reporting

7. **Load Tests** (5-10 minutes)
   - k6 smoke tests (reduced VUs for CI)
   - Latency validation

8. **Deploy** (3-5 minutes)
   - Vercel/Netlify deployment
   - Environment URL generation

9. **Summary** (1 minute)
   - Test result aggregation
   - GitHub summary report

**Total Pipeline Duration:** ~45-60 minutes

### Required GitHub Secrets

```yaml
# Vercel deployment
VERCEL_TOKEN: <vercel-auth-token>
VERCEL_ORG_ID: <vercel-org-id>
VERCEL_PROJECT_ID: <vercel-project-id>

# Alternative: Netlify deployment
NETLIFY_AUTH_TOKEN: <netlify-auth-token>
NETLIFY_SITE_ID: <netlify-site-id>

# Optional: Backend URLs
VITE_API_URL: https://api.example.com
API_URL: https://api.example.com
WS_URL: wss://api.example.com
```

### Viewing CI Reports

**Playwright Reports:**
1. Navigate to GitHub Actions run
2. Scroll to "E2E Tests (Playwright)" job
3. Download `playwright-report-chromium` artifact
4. Extract and open `index.html`

**Lighthouse Reports:**
1. Download `lighthouse-reports` artifact
2. Extract `.lighthouseci/*.report.html`
3. Open in browser

---

## Test Coverage

### Current Test Statistics

| Test Type | Tests | Lines Covered | Pass Rate |
|-----------|-------|---------------|-----------|
| E2E (Playwright) | 51 | ~2,500 | 100% |
| Lighthouse (Pages) | 6 | N/A | 100% |
| Accessibility (Pages) | 6 | N/A | 100% |
| Load Tests | 2 | N/A | 100% |

### E2E Test Breakdown

| Spec File | Tests | Key Coverage |
|-----------|-------|--------------|
| auth.spec.ts | 8 | Login, 2FA, logout, session persistence, theme toggle |
| overview.spec.ts | 10 | Metrics loading, chart rendering, WebSocket updates, responsive design |
| tenants.spec.ts | 10 | RBAC, search, filtering, sparklines, status badges |
| ai.spec.ts | 11 | MAPE/RL charts, WebSocket events, anomaly alerts, toast notifications |
| security.spec.ts | 12 | RBAC denials, active sessions, compliance status, timestamps |

### Code Coverage Goals (Future)

- **Unit Tests:** Target 80% coverage (Jest + React Testing Library)
- **Integration Tests:** Target 70% coverage (API mocking)
- **E2E Tests:** Target 60% critical path coverage (Playwright)

---

## Troubleshooting

### Common Issues

#### 1. Playwright: "Browser not installed"

**Error:**
```
browserType.launch: Executable doesn't exist at /path/to/browser
```

**Solution:**
```bash
npx playwright install --with-deps chromium firefox webkit
```

#### 2. Lighthouse: "Cannot connect to localhost:3000"

**Error:**
```
Error: Unable to fetch http://localhost:3000
```

**Solution:**
Ensure dev server is running:
```bash
# Terminal 1
npm run dev

# Terminal 2 (wait for "ready" message)
npm run test:lighthouse
```

#### 3. k6: "connection refused"

**Error:**
```
WARN[0000] Request Failed: dial tcp 127.0.0.1:8083: connect: connection refused
```

**Solution:**
Start backend server:
```bash
cd ../../backend
npm start
```

Or set custom URL:
```bash
export API_URL=https://staging.example.com
k6 run api_metrics.js
```

#### 4. E2E Tests: "Timeout waiting for selector"

**Error:**
```
TimeoutError: page.waitForSelector: Timeout 30000ms exceeded
```

**Solution:**
- Check if API is responding: `curl http://localhost:8083/api/health`
- Increase timeout in test: `{ timeout: 60000 }`
- Use `waitForFunction` instead of `waitForSelector` for dynamic content

#### 5. gitleaks: "Too many false positives"

**Error:**
```
Finding:     jwt_secret = "test-secret-for-development"
```

**Solution:**
Add to `.gitleaks.toml` allowlist:
```toml
[allowlist]
regexes = [
  '''test-secret-for-development''',
]
```

### Debugging Playwright Tests

```bash
# Run single test in debug mode
npx playwright test e2e/auth.spec.ts:39 --debug

# Generate trace (view in Playwright Inspector)
npx playwright test --trace on
npx playwright show-trace trace.zip

# Run with console logs
DEBUG=pw:api npx playwright test

# Take screenshot on failure
npx playwright test --screenshot=on

# Video recording
npx playwright test --video=on
```

### Performance Profiling

```bash
# Lighthouse with CPU throttling
npx lhci autorun --collect.settings.throttling.cpuSlowdownMultiplier=4

# k6 with custom thresholds
k6 run --thresholds "http_req_duration=p(95)<500" api_metrics.js

# Chrome DevTools during Playwright
npx playwright test --headed --slowmo=1000
```

---

## Best Practices

### Writing E2E Tests

**✅ DO:**
- Use `waitForSelector` for dynamic content
- Leverage fixtures for authentication
- Test critical user flows (happy path + error cases)
- Use descriptive test names
- Validate both UI state and data

**❌ DON'T:**
- Use hardcoded `sleep()` calls
- Test implementation details
- Make tests order-dependent
- Use brittle selectors (prefer `data-testid`)

**Example:**
```typescript
// ✅ Good
await page.waitForSelector('.stat-card:has-text("API Requests")', {
  state: 'visible'
});
await expect(page.locator('.stat-value').first()).not.toHaveText('0');

// ❌ Bad
await page.waitForTimeout(5000);
expect(page.locator('div > span').nth(3)).toHaveText('123');
```

### Accessibility Testing

**Key Principles:**
- Test with keyboard navigation (`Tab`, `Enter`, `Escape`)
- Verify screen reader announcements (ARIA labels)
- Check color contrast ratios (4.5:1 for text)
- Ensure form labels are properly associated
- Test focus management in modals

### Load Testing

**Best Practices:**
- Start with smoke tests (low VU count)
- Ramp up gradually (avoid sudden spikes)
- Set realistic thresholds based on SLAs
- Monitor server resources during tests
- Run from multiple geographic regions (cloud load gen)

### Security

**Secret Detection:**
- Run `gitleaks protect` in pre-commit hook
- Never commit `.env` files with real credentials
- Use environment variables in CI/CD
- Rotate secrets regularly
- Review gitleaks findings before merging

---

## Appendix

### NPM Scripts Reference

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:lighthouse": "lhci autorun",
    "test:a11y": "node scripts/a11y-check.js",
    "test:all": "npm run lint && npm run test:e2e && npm run test:lighthouse && npm run test:a11y",
    "lint": "eslint src --ext .js,.jsx,.ts,.tsx",
    "typecheck": "tsc --noEmit"
  }
}
```

### Useful Links

- [Playwright Documentation](https://playwright.dev/)
- [Lighthouse CI Documentation](https://github.com/GoogleChrome/lighthouse-ci)
- [axe-core Rules](https://github.com/dequelabs/axe-core/blob/develop/doc/rule-descriptions.md)
- [k6 Documentation](https://k6.io/docs/)
- [gitleaks Rules](https://github.com/gitleaks/gitleaks#configuration)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)

---

## Support

For issues or questions:
- **Internal:** Contact DevOps team on Slack `#inventory-enterprise`
- **GitHub Issues:** [repository-url]/issues
- **Documentation:** `frontend/dashboard/README_DASHBOARD.md`

---

**Last Updated:** 2025-10-07
**Version:** v2.5.1
**Maintained by:** Neuro Pilot AI Development Team
